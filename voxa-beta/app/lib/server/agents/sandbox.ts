import { randomUUID } from "node:crypto";
import type { AgentRegistrationRecord } from "@/lib/server/agents/registration";

// Developer-only sandbox session model.
//
// A sandbox session is an ISOLATED test descriptor for a developer's OWN approved
// + verified agent. It deliberately does NOT create or touch production `rooms` /
// `room_participants`, does not mint a LiveKit token, and does not dispatch the
// agent anywhere. External agents have no live runtime yet, so the session is a
// controlled scaffold: it confirms the agent is eligible to be tested and returns
// a namespaced sandbox room id for the future sandbox runtime to attach to.

export const SANDBOX_TTL_MS = 30 * 60 * 1000;
export const SANDBOX_ROOM_PREFIX = "sandbox";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Sandbox sessions are stateless: the id encodes the agent id, and every message
// re-validates ownership + approval + verification against the DB. This parses
// and structurally validates `sandbox:<agentId>:<sessionUuid>` and returns the
// embedded agent id. Returns null on any malformed id.
export function parseSandboxSessionId(sessionId: string): { agentId: string } | null {
  if (typeof sessionId !== "string") {
    return null;
  }
  const parts = sessionId.split(":");
  if (parts.length !== 3 || parts[0] !== SANDBOX_ROOM_PREFIX) {
    return null;
  }
  const [, agentId, sessionUuid] = parts;
  if (!uuidPattern.test(agentId) || !uuidPattern.test(sessionUuid)) {
    return null;
  }
  return { agentId };
}

export type SandboxEligibility =
  | { ok: true }
  | { ok: false; code: string; status: number; message: string };

export type SandboxSession = {
  mode: "sandbox";
  isolated: true;
  // Namespaced so it can never collide with a production room id.
  sandboxRoomId: string;
  agentId: string;
  agentName: string;
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

export function createSandboxSession(agent: AgentRegistrationRecord): SandboxSession {
  return {
    mode: "sandbox",
    isolated: true,
    sandboxRoomId: `${SANDBOX_ROOM_PREFIX}:${agent.id}:${randomUUID()}`,
    agentId: agent.id,
    agentName: agent.name,
    expiresAt: new Date(Date.now() + SANDBOX_TTL_MS).toISOString(),
    runtimeReady: false,
    note: "Sandbox is isolated from production rooms. The external-agent runtime is not live yet, so this session validates eligibility only.",
  };
}
