"use client";

import { getSupabaseClient } from "@/lib/supabase";
import { AgentRegistryError } from "@/lib/agents/registry-client";

export type EditableDeveloperProfile = {
  avatarUrl: string;
  bio: string;
  displayName: string;
  joinedAt?: string | null;
  username: string;
  website: string;
  xHandle: string;
};

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
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new AgentRegistryError("Sign in before editing your profile.", 401, "missing_session");
  }

  return session.access_token;
}

async function parseProfileError(response: Response) {
  let payload: { code?: string; error?: string } = {};
  try {
    payload = (await response.json()) as { code?: string; error?: string };
  } catch {
    // Ignore malformed errors and show the generic message below.
  }

  return new AgentRegistryError(
    payload.error ?? "Developer profile request failed.",
    response.status,
    payload.code,
  );
}

export async function getDeveloperProfile() {
  const token = await getAccessToken();
  const response = await fetch("/api/developers/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw await parseProfileError(response);
  }

  return (await response.json()) as {
    profile: EditableDeveloperProfile | null;
    suggestedProfile: EditableDeveloperProfile;
  };
}

export async function updateDeveloperProfile(profile: EditableDeveloperProfile) {
  const token = await getAccessToken();
  const response = await fetch("/api/developers/profile", {
    body: JSON.stringify(profile),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    throw await parseProfileError(response);
  }

  const data = (await response.json()) as { profile: EditableDeveloperProfile };
  return data.profile;
}
