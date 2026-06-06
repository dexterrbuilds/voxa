import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonError,
  registryStorageError,
  type AgentRegistrationRecord,
} from "@/lib/server/agents/registration";
import { checkSandboxEligibility, parseSandboxSessionId } from "@/lib/server/agents/sandbox";
import { sandboxRuntime } from "@/lib/server/agents/runtime/SandboxRuntime";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 4000;
// Per-user sandbox message budget.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

// POST /api/agents/sandbox/message  { sandboxSessionId, message }
//
// Sends a developer's sandbox message to THEIR OWN approved + verified agent's
// endpoint and returns the reply. Stateless session: the session id encodes the
// agent id, and ownership/approval/verification are re-checked against the DB on
// every call. No production room, LiveKit, or Supabase room state is touched.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  // Rate limit per authenticated user.
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

  const { sandboxSessionId, message } = (body ?? {}) as {
    sandboxSessionId?: unknown;
    message?: unknown;
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

  // Ownership: RLS already scopes to the caller's agents; the explicit creator
  // filter is defense-in-depth. A non-owner simply gets "not found".
  const { data, error } = await auth.supabase
    .from("agents")
    .select("*")
    .eq("id", parsed.agentId)
    .eq("creator_user_id", auth.user.id)
    .maybeSingle<AgentRegistrationRecord>();

  if (error) {
    return registryStorageError(error);
  }

  if (!data) {
    return jsonError("Agent not found.", 404, "agent_not_found");
  }

  const eligibility = checkSandboxEligibility(data);
  if (!eligibility.ok) {
    return jsonError(eligibility.message, eligibility.status, eligibility.code);
  }

  if (!data.endpoint_url) {
    return jsonError("This agent has no registered endpoint URL.", 409, "agent_no_endpoint");
  }

  const reply = await sandboxRuntime.sendMessage({
    endpointUrl: data.endpoint_url,
    message: message.trim(),
    context: { sandbox: true },
  });

  if (!reply.ok) {
    return jsonError(reply.detail, 502, reply.code);
  }

  return NextResponse.json({
    reply: { text: reply.text },
    agent: { id: data.id, name: data.name },
  });
}
