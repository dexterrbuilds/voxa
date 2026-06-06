import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonError,
  registryStorageError,
  type AgentRegistrationRecord,
} from "@/lib/server/agents/registration";
import { checkSandboxEligibility, createSandboxSession } from "@/lib/server/agents/sandbox";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// POST /api/agents/sandbox  { agentId }
//
// Developer-only. Starts an ISOLATED sandbox session for the caller's OWN,
// approved, verified agent. Uses the developer's anon client + bearer token, so
// RLS already restricts reads to their own agents; the explicit creator filter is
// defense-in-depth. Does NOT create a production room or dispatch the agent.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "invalid_json");
  }

  const agentId = typeof (body as { agentId?: unknown })?.agentId === "string"
    ? (body as { agentId: string }).agentId.trim()
    : "";

  if (!agentId || !uuidPattern.test(agentId)) {
    return jsonError("A valid agentId is required.", 400, "invalid_agent_id");
  }

  const { data, error } = await auth.supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
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

  return NextResponse.json({ session: createSandboxSession(data) }, { status: 201 });
}
