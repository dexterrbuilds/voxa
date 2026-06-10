"use client";

import { getSupabaseClient } from "@/lib/supabase";

// Browser-side client for the authenticated agent registration API
// (`/api/agents/*`). This talks to the same Supabase-backed review queue the
// server routes own; it does NOT make registered agents available in rooms or
// the Agent Selector. Submitted agents stay registration-only until approval
// tooling and a DB-backed runtime registry exist.

export type RegisteredAgentStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "disabled";

export type RegisteredAgentVisibility = "private" | "unlisted" | "public";

export type AgentVerificationStatus =
  | "verification_pending"
  | "verified"
  | "verification_failed";

// Developers may only create/edit at these statuses and visibilities. The
// backend enforces the same limits via validation + RLS; mirroring them here is
// purely for a friendlier UI (no self-approval, no public publishing).
export type CreatableAgentStatus = Extract<RegisteredAgentStatus, "draft" | "pending_review">;
export type EditableAgentVisibility = Extract<
  RegisteredAgentVisibility,
  "private" | "unlisted"
>;

export type RegisteredAgent = {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  creatorUserId: string;
  creatorWalletAddress: string | null;
  endpointUrl: string | null;
  status: RegisteredAgentStatus;
  visibility: RegisteredAgentVisibility;
  capabilities: string[];
  permissions: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  verificationStatus: AgentVerificationStatus;
  verifiedAt: string | null;
  verificationNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SandboxAgentSummary = {
  id: string;
  name: string;
  slug: string;
  capabilities: string[];
};

export type SandboxSession = {
  mode: "sandbox";
  isolated: true;
  sandboxRoomId: string;
  agents: SandboxAgentSummary[];
  expiresAt: string;
  runtimeReady: false;
  note: string;
};

export type AgentRegistrationPayload = {
  name: string;
  slug: string;
  description: string;
  avatarUrl: string | null;
  endpointUrl: string | null;
  capabilities: string[];
  permissions: string[];
  tags: string[];
  status: CreatableAgentStatus;
  visibility: EditableAgentVisibility;
  metadata: Record<string, unknown>;
};

export class AgentRegistryError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AgentRegistryError";
    this.status = status;
    this.code = code;
  }
}

async function getAccessToken() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new AgentRegistryError(
      "Sign-in is not configured. Add your Supabase keys and reload.",
      500,
      "auth_not_configured",
    );
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new AgentRegistryError("Sign in to manage your agents.", 401, "missing_session");
  }

  return session.access_token;
}

async function parseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; code?: string }
    | null;

  return new AgentRegistryError(
    payload?.error ?? "Something went wrong. Try again.",
    response.status,
    payload?.code,
  );
}

export async function listRegisteredAgents(): Promise<RegisteredAgent[]> {
  const token = await getAccessToken();
  const response = await fetch("/api/agents", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as { agents: RegisteredAgent[] };
  return data.agents ?? [];
}

export async function createRegisteredAgent(
  payload: AgentRegistrationPayload,
): Promise<RegisteredAgent> {
  const token = await getAccessToken();
  const response = await fetch("/api/agents/register", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as { agent: RegisteredAgent };
  return data.agent;
}

export async function startSandboxSession(agentIds: string[]): Promise<SandboxSession> {
  const token = await getAccessToken();
  const response = await fetch("/api/agents/sandbox", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agentIds }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as { session: SandboxSession };
  return data.session;
}

export type SandboxToolStatus = "pending" | "running" | "completed" | "failed";

export type SandboxToolInvocation = {
  name: string;
  status: SandboxToolStatus;
  detail?: string;
};

export type SandboxAgentReply =
  | {
      agentId: string;
      agentName: string;
      ok: true;
      reply: { text: string; streaming?: boolean; tools?: SandboxToolInvocation[] };
    }
  | {
      agentId: string;
      agentName: string;
      ok: false;
      error: { code: string; detail: string };
    };

export type SandboxMessageResult = { replies: SandboxAgentReply[] };

export type SandboxMessageOptions = {
  // Send to one specific agent in the session.
  targetAgentId?: string;
  // Send to every agent in the session.
  broadcast?: boolean;
};

export async function sendSandboxMessage(
  sandboxSessionId: string,
  message: string,
  options: SandboxMessageOptions = {},
): Promise<SandboxMessageResult> {
  const token = await getAccessToken();
  const response = await fetch("/api/agents/sandbox/message", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sandboxSessionId,
      message,
      targetAgentId: options.targetAgentId,
      broadcast: options.broadcast,
    }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as SandboxMessageResult;
}

// Experimental, display-only external agents for the live-room Agent Selector.
export type RoomEligibleExternalAgent = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  tags: string[];
};

export type RoomEligibleExternalAgentsResult = {
  enabled: boolean;
  agents: RoomEligibleExternalAgent[];
};

// Best-effort: fetch the caller's own approved + verified external agents that may
// be SHOWN (display-only) in a room when the server feature flag is on. NEVER
// throws — any failure (signed out, flag off, route/table missing) resolves to
// `{ enabled: false, agents: [] }` so the room is never affected.
export async function listRoomEligibleExternalAgents(): Promise<RoomEligibleExternalAgentsResult> {
  try {
    const token = await getAccessToken();
    const response = await fetch("/api/agents/room-eligible", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return { enabled: false, agents: [] };
    }
    const data = (await response.json()) as RoomEligibleExternalAgentsResult;
    return { enabled: Boolean(data.enabled), agents: data.agents ?? [] };
  } catch {
    return { enabled: false, agents: [] };
  }
}

// Compatibility participant id for external agents in a room (mirrors the server
// `externalAgentParticipantId`). Used to detect whether an external agent is
// already a participant.
export function externalAgentParticipantId(agentId: string): string {
  return `agent:${agentId}`;
}

// Invite the caller's own approved + verified external agent into a room as an
// EXPERIMENTAL text-only participant. Throws AgentRegistryError on failure.
export async function inviteExternalAgentToRoom(
  roomId: string,
  agentId: string,
): Promise<{ participantUserId: string; agent: { id: string; name: string } }> {
  const token = await getAccessToken();
  const response = await fetch("/api/agents/room/invite", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId, agentId }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as {
    participantUserId: string;
    agent: { id: string; name: string };
  };
}

export type RoomTextReply = {
  reply: { text: string; streaming?: boolean; tools?: SandboxToolInvocation[] };
  agent: { id: string; name: string };
};

// Send one experimental, text-only message to an external agent in a room.
export async function sendRoomTextMessage(
  roomId: string,
  agentId: string,
  message: string,
): Promise<RoomTextReply> {
  const token = await getAccessToken();
  const response = await fetch("/api/agents/room/message", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId, agentId, message }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as RoomTextReply;
}

export async function updateRegisteredAgent(
  agentId: string,
  payload: Partial<AgentRegistrationPayload>,
): Promise<RegisteredAgent> {
  const token = await getAccessToken();
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as { agent: RegisteredAgent };
  return data.agent;
}
