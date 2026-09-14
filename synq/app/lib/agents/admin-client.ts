"use client";

import { getSupabaseClient } from "@/lib/supabase";
import type {
  AgentVerificationStatus,
  RegisteredAgentStatus,
  RegisteredAgentVisibility,
} from "@/lib/agents/registry-client";

// Browser-side client for the admin review API (`/api/admin/agents*`). The routes
// authorize the caller against ADMIN_EMAILS (server-only) and use a service-role
// client server-side; this client only forwards the user's bearer token. A 403
// here means "signed in but not an admin".

export type ReviewAction = "approve" | "reject" | "disable" | "return_to_review";

export type AdminAgent = {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  creatorUserId: string;
  creatorEmail: string | null;
  creatorWalletAddress: string | null;
  endpointUrl: string | null;
  status: RegisteredAgentStatus;
  visibility: RegisteredAgentVisibility;
  capabilities: string[];
  permissions: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  verificationStatus: AgentVerificationStatus;
  verifiedAt: string | null;
  verificationNote: string | null;
  verificationReport: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type VerificationCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type VerificationReport = {
  ok: boolean;
  status: "verified" | "verification_failed";
  checks: VerificationCheck[];
  endpointUrl: string | null;
  checkedAt: string;
};

export class AdminApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

async function getAccessToken() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new AdminApiError(
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
    throw new AdminApiError("Sign in to access the admin console.", 401, "missing_session");
  }

  return session.access_token;
}

async function parseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
  } | null;

  return new AdminApiError(
    payload?.error ?? "Something went wrong. Try again.",
    response.status,
    payload?.code,
  );
}

export async function listAdminAgents(status?: string): Promise<AdminAgent[]> {
  const token = await getAccessToken();
  const url = status
    ? `/api/admin/agents?status=${encodeURIComponent(status)}`
    : "/api/admin/agents";
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as { agents: AdminAgent[] };
  return data.agents ?? [];
}

export async function reviewAdminAgent(
  agentId: string,
  action: ReviewAction,
  note?: string,
): Promise<AdminAgent> {
  const token = await getAccessToken();
  const response = await fetch(`/api/admin/agents/${encodeURIComponent(agentId)}/review`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, note }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as { agent: AdminAgent };
  return data.agent;
}

// Admin-only grant/revoke of the special room_voice_beta permission.
export async function setAgentVoiceBeta(agentId: string, grant: boolean): Promise<AdminAgent> {
  const token = await getAccessToken();
  const response = await fetch(`/api/admin/agents/${encodeURIComponent(agentId)}/permissions`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: grant ? "grant_voice_beta" : "revoke_voice_beta" }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as { agent: AdminAgent };
  return data.agent;
}

export async function verifyAdminAgent(
  agentId: string,
): Promise<{ agent: AdminAgent; report: VerificationReport }> {
  const token = await getAccessToken();
  const response = await fetch(`/api/admin/agents/${encodeURIComponent(agentId)}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as { agent: AdminAgent; report: VerificationReport };
}
