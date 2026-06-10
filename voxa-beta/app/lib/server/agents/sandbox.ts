import { randomUUID } from "node:crypto";
import type { AgentRegistrationRecord } from "@/lib/server/agents/registration";

// Developer-only sandbox session model (multi-agent).
//
// A sandbox session is an ISOLATED test descriptor for a developer's OWN approved
// + verified agents. It deliberately does NOT create or touch production `rooms` /
// `room_participants`, does not mint a LiveKit token, and does not dispatch the
// agents anywhere. External agents have no live runtime yet, so the session is a
// controlled scaffold: it confirms the agents are eligible to be tested and
// returns a namespaced sandbox room id for the future sandbox runtime to attach
// to. A session can now reference one OR MORE agents (still sandbox-only — never a
// production multi-agent room).

export const SANDBOX_TTL_MS = 30 * 60 * 1000;
export const SANDBOX_ROOM_PREFIX = "sandbox";
export const SANDBOX_MAX_AGENTS = 5;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Sandbox sessions are stateless: the id encodes the agent ids, and every message
// re-validates ownership + approval + verification against the DB. This parses and
// structurally validates `sandbox:<id1>,<id2>,...:<sessionUuid>` and returns the
// embedded agent ids. Returns null on any malformed id.
export function parseSandboxSessionId(sessionId: string): { agentIds: string[] } | null {
  if (typeof sessionId !== "string") {
    return null;
  }
  const parts = sessionId.split(":");
  if (parts.length !== 3 || parts[0] !== SANDBOX_ROOM_PREFIX) {
    return null;
  }
  const [, idsSegment, sessionUuid] = parts;
  if (!uuidPattern.test(sessionUuid)) {
    return null;
  }
  const agentIds = idsSegment.split(",");
  if (agentIds.length === 0 || agentIds.length > SANDBOX_MAX_AGENTS) {
    return null;
  }
  if (!agentIds.every((id) => uuidPattern.test(id))) {
    return null;
  }
  return { agentIds: [...new Set(agentIds)] };
}

export type SandboxEligibility =
  | { ok: true }
  | { ok: false; code: string; status: number; message: string };

export type SandboxAgentSummary = {
  id: string;
  name: string;
  slug: string;
  capabilities: string[];
};

export type SandboxSession = {
  mode: "sandbox";
  isolated: true;
  // Namespaced so it can never collide with a production room id.
  sandboxRoomId: string;
  agents: SandboxAgentSummary[];
  expiresAt: string;
  // Honest scaffold flag: the external-agent runtime is not live yet.
  runtimeReady: false;
  note: string;
};

// A sandbox is only allowed for the caller's own, approved, verified agent.
export function checkSandboxEligibility(
  agent: Pick<AgentRegistrationRecord, "status" | "verification_status">,
): SandboxEligibility {
  if (agent.status !== "approved") {
    return {
      ok: false,
      code: "agent_not_approved",
      status: 409,
      message: "Only approved agents can be sandbox-tested. This agent is not approved yet.",
    };
  }

  if ((agent.verification_status ?? "verification_pending") !== "verified") {
    return {
      ok: false,
      code: "agent_not_verified",
      status: 409,
      message:
        "This agent's endpoint is not verified yet. Endpoint verification must pass before sandbox testing.",
    };
  }

  return { ok: true };
}

function toSummary(agent: AgentRegistrationRecord): SandboxAgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    slug: agent.slug,
    capabilities: agent.capabilities ?? [],
  };
}

export function createSandboxSession(agents: AgentRegistrationRecord[]): SandboxSession {
  const ids = agents.map((agent) => agent.id).join(",");
  return {
    mode: "sandbox",
    isolated: true,
    sandboxRoomId: `${SANDBOX_ROOM_PREFIX}:${ids}:${randomUUID()}`,
    agents: agents.map(toSummary),
    expiresAt: new Date(Date.now() + SANDBOX_TTL_MS).toISOString(),
    runtimeReady: false,
    note: "Sandbox is isolated from production rooms. The external-agent runtime is not live yet, so this session validates eligibility only.",
  };
}
