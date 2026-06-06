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

export type SandboxSession = {
  mode: "sandbox";
  isolated: true;
  sandboxRoomId: string;
  agentId: string;
  agentName: string;
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

export async function startSandboxSession(agentId: string): Promise<SandboxSession> {
  const token = await getAccessToken();
  const response = await fetch("/api/agents/sandbox", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agentId }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as { session: SandboxSession };
  return data.session;
}

export type SandboxReply = {
  reply: { text: string };
  agent: { id: string; name: string };
};

export async function sendSandboxMessage(
  sandboxSessionId: string,
  message: string,
): Promise<SandboxReply> {
  const token = await getAccessToken();
  const response = await fetch("/api/agents/sandbox/message", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sandboxSessionId, message }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as SandboxReply;
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
