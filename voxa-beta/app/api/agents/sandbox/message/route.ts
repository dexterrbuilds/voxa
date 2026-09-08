import { after, NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonError,
  registryStorageError,
  type AgentRegistrationRecord,
} from "@/lib/server/agents/registration";
import { checkSandboxEligibility, parseSandboxSessionId } from "@/lib/server/agents/sandbox";
import { sandboxRuntime } from "@/lib/server/agents/runtime/SandboxRuntime";
import type { AgentRuntimeTool } from "@/lib/server/agents/runtime/types";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { recordAgentAnalyticsBatch } from "@/lib/server/agents/analytics";
import { agentRequestId, runAgentRequest } from "@/lib/server/agents/runtime/requests";
import { buildAgentContext } from "@/lib/server/agents/runtime/context";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 4000;
// Per-user sandbox message budget (one HTTP request = one increment, even for a
// broadcast that fans out to several agents).
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

type ReplyEntry =
  | {
      agentId: string;
      agentName: string;
      ok: true;
      reply: { text: string; streaming: boolean; tools: AgentRuntimeTool[] };
    }
  | { agentId: string; agentName: string; ok: false; error: { code: string; detail: string } };

// POST /api/agents/sandbox/message
//   { sandboxSessionId, message, targetAgentId?, broadcast? }
//
// Routes a developer's sandbox message to THEIR OWN approved + verified agents in
// the session. Stateless: the session id encodes the agent ids, and ownership /
// approval / verification are re-checked against the DB on every call. No
// production room, LiveKit, or Supabase room state is touched.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const limit = checkRateLimit(`sandbox-msg:${auth.user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many sandbox messages. Try again in ${limit.retryAfterSeconds}s.`,
        code: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "invalid_json");
  }

  const { sandboxSessionId, message, targetAgentId, broadcast } = (body ?? {}) as {
    sandboxSessionId?: unknown;
    message?: unknown;
    targetAgentId?: unknown;
    broadcast?: unknown;
  };

  if (typeof message !== "string" || !message.trim()) {
    return jsonError("A non-empty message is required.", 400, "invalid_message");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonError("Message is too long.", 400, "message_too_long");
  }

  const parsed =
    typeof sandboxSessionId === "string" ? parseSandboxSessionId(sandboxSessionId) : null;
  if (!parsed) {
    return jsonError("Invalid or expired sandbox session.", 400, "invalid_sandbox_session");
  }

  // Resolve which agents to message.
  let targetIds: string[];
  if (broadcast === true) {
    targetIds = parsed.agentIds;
  } else if (typeof targetAgentId === "string" && targetAgentId.trim()) {
    const wanted = targetAgentId.trim();
    if (!parsed.agentIds.includes(wanted)) {
      return jsonError(
        "Target agent is not part of this sandbox session.",
        400,
        "target_not_in_session",
      );
    }
    targetIds = [wanted];
  } else {
    // Default to the first (active) agent in the session.
    targetIds = [parsed.agentIds[0]];
  }

  // Load the targeted agents (RLS + explicit creator filter = ownership check).
  const { data, error } = await auth.supabase
    .from("agents")
    .select("*")
    .in("id", targetIds)
    .eq("creator_user_id", auth.user.id)
    .returns<AgentRegistrationRecord[]>();

  if (error) {
    return registryStorageError(error);
  }

  const recordsById = new Map((data ?? []).map((agent) => [agent.id, agent]));
  const text = message.trim();

  // Validate each target; collect runnable ones and per-agent validation errors.
  const validationErrors: ReplyEntry[] = [];
  const runnable: { agentId: string; agentName: string; endpointUrl: string }[] = [];

  for (const id of targetIds) {
    const record = recordsById.get(id);
    if (!record) {
      validationErrors.push({
        agentId: id,
        agentName: id,
        ok: false,
        error: { code: "agent_not_found", detail: "Agent not found in your account." },
      });
      continue;
    }
    const eligibility = checkSandboxEligibility(record);
    if (!eligibility.ok) {
      validationErrors.push({
        agentId: id,
        agentName: record.name,
        ok: false,
        error: { code: eligibility.code, detail: eligibility.message },
      });
      continue;
    }
    if (!record.endpoint_url) {
      validationErrors.push({
        agentId: id,
        agentName: record.name,
        ok: false,
        error: { code: "agent_no_endpoint", detail: "Agent has no registered endpoint URL." },
      });
      continue;
    }
    runnable.push({ agentId: id, agentName: record.name, endpointUrl: record.endpoint_url });
  }

  // For an explicit single-target request, surface validation failure as a 4xx.
  if (!broadcast && targetIds.length === 1 && validationErrors.length === 1) {
    const failure = validationErrors[0];
    if (!failure.ok) {
      const status = failure.error.code === "agent_not_found" ? 404 : 409;
      return jsonError(failure.error.detail, status, failure.error.code);
    }
  }

  const requestId = agentRequestId(request.headers.get("X-Voxa-Request-Id"));
  const executeTarget = async (
    target: (typeof runnable)[number],
    signal: AbortSignal,
  ): Promise<ReplyEntry & { durationMs?: number }> => {
    const started = performance.now();
    try {
      const result = await runAgentRequest(
        `sandbox:${auth.user.id}:${sandboxSessionId}:${target.agentId}`,
        requestId,
        async () => {
          const reply = await sandboxRuntime.sendMessageToAgent({
            endpointUrl: target.endpointUrl,
            message: text,
            signal,
            requestId,
            context: buildAgentContext({ agentId: target.agentId, allowMemory: false }),
          });
          if (reply.ok)
            after(() =>
              recordAgentAnalyticsBatch(auth.supabase, {
                agentIds: [target.agentId],
                metric: "sandbox_messages_sent",
                ownerUserId: auth.user.id,
              }),
            );
          return reply;
        },
      );
      const reply = result.ok
        ? result.value
        : {
            ok: false as const,
            code: "agent_busy",
            detail: "This agent is already responding. Try again shortly.",
          };
      return reply.ok
        ? {
            agentId: target.agentId,
            agentName: target.agentName,
            ok: true,
            durationMs: Math.round(performance.now() - started),
            reply: { text: reply.text, tools: reply.tools ?? [], streaming: false },
          }
        : {
            agentId: target.agentId,
            agentName: target.agentName,
            ok: false,
            error: { code: reply.code, detail: reply.detail },
          };
    } catch {
      return {
        agentId: target.agentId,
        agentName: target.agentName,
        ok: false,
        error: { code: "agent_request_failed", detail: "This agent could not finish. Try again." },
      };
    }
  };
  // Stream completed agent replies independently. JSON remains available for older clients.
  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) cancel();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(output) {
        const emit = (value: unknown) => {
          if (!controller.signal.aborted)
            output.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        };
        void (async () => {
          try {
            for (const entry of validationErrors) emit(entry);
            await Promise.all(
              runnable.map(async (target) => {
                emit(await executeTarget(target, controller.signal));
              }),
            );
            if (!controller.signal.aborted) output.close();
          } catch {
            if (!controller.signal.aborted)
              output.error(new Error("Agent connection interrupted."));
          } finally {
            request.signal.removeEventListener("abort", cancel);
          }
        })();
      },
      cancel,
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const results = await Promise.all(
    runnable.map((target) => executeTarget(target, request.signal)),
  );
  const byId = new Map([...validationErrors, ...results].map((entry) => [entry.agentId, entry]));
  const replies = targetIds.map((id) => byId.get(id)!);

  return NextResponse.json({ replies });
}
