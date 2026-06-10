import { NextRequest, NextResponse } from "next/server";
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
      return jsonError("Target agent is not part of this sandbox session.", 400, "target_not_in_session");
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

  const broadcastResults =
    runnable.length > 0
      ? await sandboxRuntime.broadcastMessage({
          targets: runnable,
          message: text,
          context: { sandbox: true },
        })
      : [];

  const successById = new Map(broadcastResults.map((result) => [result.agentId, result]));

  // Build replies preserving the requested order.
  const replies: ReplyEntry[] = targetIds.map((id) => {
    const validationError = validationErrors.find((entry) => entry.agentId === id);
    if (validationError) {
      return validationError;
    }
    const result = successById.get(id)!;
    if (result.reply.ok) {
      return {
        agentId: id,
        agentName: result.agentName,
        ok: true,
        reply: {
          text: result.reply.text,
          streaming: result.reply.streaming ?? false,
          tools: result.reply.tools ?? [],
        },
      };
    }
    return {
      agentId: id,
      agentName: result.agentName,
      ok: false,
      error: { code: result.reply.code, detail: result.reply.detail },
    };
  });

  return NextResponse.json({ replies });
}
