import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonError,
  registryStorageError,
  type AgentRegistrationRecord,
} from "@/lib/server/agents/registration";
import {
  checkSandboxEligibility,
  createSandboxSession,
  SANDBOX_MAX_AGENTS,
} from "@/lib/server/agents/sandbox";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// POST /api/agents/sandbox  { agentIds: string[] }  (or legacy { agentId })
//
// Developer-only. Starts an ISOLATED sandbox session for ONE OR MORE of the
// caller's OWN, approved, verified agents. Uses the developer's anon client +
// bearer token, so RLS already restricts reads to their own agents; the explicit
// creator filter is defense-in-depth. Does NOT create a production room or
// dispatch the agents.
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

  const raw = body as { agentIds?: unknown; agentId?: unknown };
  const requested = Array.isArray(raw.agentIds)
    ? raw.agentIds
    : typeof raw.agentId === "string"
      ? [raw.agentId]
      : [];

  const agentIds = [
    ...new Set(
      requested
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];

  if (agentIds.length === 0) {
    return jsonError("Select at least one agent to start a sandbox.", 400, "no_agents_selected");
  }
  if (agentIds.length > SANDBOX_MAX_AGENTS) {
    return jsonError(
      `A sandbox session supports at most ${SANDBOX_MAX_AGENTS} agents.`,
      400,
      "too_many_agents",
    );
  }
  if (!agentIds.every((id) => uuidPattern.test(id))) {
    return jsonError("One or more agent ids are invalid.", 400, "invalid_agent_id");
  }

  const { data, error } = await auth.supabase
    .from("agents")
    .select("*")
    .in("id", agentIds)
    .eq("creator_user_id", auth.user.id)
    .returns<AgentRegistrationRecord[]>();

  if (error) {
    return registryStorageError(error);
  }

  // Every requested agent must exist and belong to the caller.
  if (!data || data.length !== agentIds.length) {
    return jsonError(
      "One or more selected agents were not found in your account.",
      404,
      "agent_not_found",
    );
  }

  // Every selected agent must be approved + verified.
  for (const agent of data) {
    const eligibility = checkSandboxEligibility(agent);
    if (!eligibility.ok) {
      return jsonError(
        `${agent.name}: ${eligibility.message}`,
        eligibility.status,
        eligibility.code,
      );
    }
    if (!agent.endpoint_url) {
      return jsonError(`${agent.name} has no registered endpoint URL.`, 409, "agent_no_endpoint");
    }
  }

  // Preserve the requested order in the session descriptor.
  const ordered = agentIds.map((id) => data.find((agent) => agent.id === id)!);

  return NextResponse.json({ session: createSandboxSession(ordered) }, { status: 201 });
}
