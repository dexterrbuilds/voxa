import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { PublicAgent, PublicDeveloperProfile } from "@/lib/agents/showcase-types";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import type { AgentRegistrationRecord } from "@/lib/server/agents/registration";

export type DeveloperProfileRecord = {
  avatar_url: string | null;
  bio: string | null;
  display_name: string | null;
  joined_at: string | null;
  updated_at: string | null;
  user_id: string;
  username: string | null;
  website: string | null;
  x_handle: string | null;
};

type PublicAgentRecord = Pick<
  AgentRegistrationRecord,
  | "avatar_url"
  | "capabilities"
  | "created_at"
  | "creator_user_id"
  | "description"
  | "id"
  | "name"
  | "permissions"
  | "slug"
  | "tags"
  | "updated_at"
  | "verification_status"
>;

const usernamePattern = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function validateUsername(value: string) {
  const username = normalizeUsername(value);
  if (!username || !usernamePattern.test(username)) {
    throw new Error(
      "Username must use lowercase letters, numbers, and hyphens, and be 2-40 characters.",
    );
  }
  return username;
}

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function cleanOptionalUrl(value: unknown) {
  const cleaned = cleanString(value, 300);
  if (!cleaned) {
    return null;
  }

  try {
    const url = new URL(cleaned);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported URL protocol.");
    }
    return url.toString();
  } catch {
    throw new Error("Website and avatar must be valid http or https URLs.");
  }
}

function cleanXHandle(value: unknown) {
  const cleaned = cleanString(value, 40).replace(/^@+/, "");
  return cleaned || null;
}

export function suggestedUsernameForUser(user: User) {
  const metadata = user.user_metadata ?? {};
  const source =
    (typeof metadata.user_name === "string" && metadata.user_name) ||
    (typeof metadata.preferred_username === "string" && metadata.preferred_username) ||
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    user.email?.split("@")[0] ||
    "developer";

  const username = normalizeUsername(source);
  return username || `developer-${user.id.slice(0, 6)}`;
}

export function defaultDisplayNameForUser(user: User) {
  const metadata = user.user_metadata ?? {};
  const displayName =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    user.email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
    "Voxa Developer";

  return displayName.slice(0, 80);
}

export function parseDeveloperProfileBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid profile request.");
  }

  const input = body as Record<string, unknown>;
  const displayName = cleanString(input.displayName, 80);
  const username = validateUsername(cleanString(input.username, 40));

  if (!displayName) {
    throw new Error("Display name is required.");
  }

  return {
    avatar_url: cleanOptionalUrl(input.avatarUrl),
    bio: cleanString(input.bio, 500),
    display_name: displayName,
    updated_at: new Date().toISOString(),
    username,
    website: cleanOptionalUrl(input.website),
    x_handle: cleanXHandle(input.xHandle),
  };
}

export function mapPublicDeveloperProfile(
  record: DeveloperProfileRecord,
  publicAgentCount?: number,
): PublicDeveloperProfile {
  return {
    avatarUrl: record.avatar_url ?? null,
    bio: record.bio ?? "",
    displayName: record.display_name || record.username || "Voxa developer",
    joinedAt: record.joined_at ?? null,
    publicAgentCount,
    username: record.username ?? "",
    website: record.website ?? null,
    xHandle: record.x_handle ?? null,
  };
}

export function mapEditableDeveloperProfile(record: DeveloperProfileRecord) {
  return {
    avatarUrl: record.avatar_url ?? "",
    bio: record.bio ?? "",
    displayName: record.display_name ?? "",
    joinedAt: record.joined_at,
    username: record.username ?? "",
    website: record.website ?? "",
    xHandle: record.x_handle ?? "",
  };
}

export function publicPermissions(permissions: string[]) {
  return permissions
    .filter((permission) => !permission.includes("admin") && !permission.includes("secret"))
    .slice(0, 8);
}

export function externalAgentToPublicAgent(
  record: PublicAgentRecord,
  creatorProfile: PublicDeveloperProfile | null,
  fallbackCreatorDisplayName: string,
): PublicAgent {
  return {
    avatarUrl: record.avatar_url,
    capabilities: (record.capabilities ?? []).slice(0, 10),
    creatorDisplayName: creatorProfile?.displayName ?? fallbackCreatorDisplayName,
    creatorProfile,
    creatorUsername: creatorProfile?.username ?? null,
    description: record.description,
    examplePrompts: [],
    featured: false,
    id: record.id,
    name: record.name,
    permissions: publicPermissions(record.permissions ?? []),
    slug: record.slug,
    source: "external",
    tags: (record.tags ?? []).slice(0, 10),
    updatedAt: record.updated_at ?? record.created_at ?? null,
    verificationStatus: "verified",
  };
}

export async function loadDeveloperProfileMap(
  service: SupabaseClient,
  userIds: string[],
): Promise<Map<string, PublicDeveloperProfile>> {
  const profiles = new Map<string, PublicDeveloperProfile>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return profiles;
  }

  const { data, error } = await service
    .from("developer_profiles")
    .select("user_id, username, display_name, bio, avatar_url, website, x_handle, joined_at, updated_at")
    .in("user_id", uniqueIds)
    .returns<DeveloperProfileRecord[]>();

  if (error || !data) {
    if (error && !/developer_profiles/i.test(error.message)) {
      console.warn("Developer profile query failed.", error.message);
    }
    return profiles;
  }

  for (const record of data) {
    if (record.user_id && record.username) {
      profiles.set(record.user_id, mapPublicDeveloperProfile(record));
    }
  }

  return profiles;
}

export async function getPublicDeveloperByUsername(username: string): Promise<{
  agents: PublicAgent[];
  profile: PublicDeveloperProfile;
} | null> {
  const service = getServiceRoleClient();
  if (!service) {
    return null;
  }

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return null;
  }

  const { data: profileRecord, error: profileError } = await service
    .from("developer_profiles")
    .select("user_id, username, display_name, bio, avatar_url, website, x_handle, joined_at, updated_at")
    .eq("username", normalizedUsername)
    .maybeSingle<DeveloperProfileRecord>();

  if (profileError || !profileRecord?.username) {
    return null;
  }

  const { data: agentRecords, error: agentError } = await service
    .from("agents")
    .select(
      [
        "avatar_url",
        "capabilities",
        "created_at",
        "creator_user_id",
        "description",
        "id",
        "name",
        "permissions",
        "slug",
        "tags",
        "updated_at",
        "verification_status",
      ].join(","),
    )
    .eq("creator_user_id", profileRecord.user_id)
    .eq("status", "approved")
    .eq("verification_status", "verified")
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .returns<PublicAgentRecord[]>();

  if (agentError) {
    console.warn("Public developer agent query failed.", agentError.message);
  }

  const profile = mapPublicDeveloperProfile(profileRecord, agentRecords?.length ?? 0);
  const agents = (agentRecords ?? []).map((record) =>
    externalAgentToPublicAgent(record, profile, profile.displayName),
  );

  return { agents, profile };
}

export async function getFeaturedDevelopersFromAgents(
  agents: PublicAgent[],
): Promise<PublicDeveloperProfile[]> {
  const byUsername = new Map<string, PublicDeveloperProfile>();
  for (const agent of agents) {
    const profile = agent.creatorProfile;
    if (profile?.username && !byUsername.has(profile.username)) {
      byUsername.set(profile.username, { ...profile, publicAgentCount: 0 });
    }
    if (profile?.username) {
      const current = byUsername.get(profile.username);
      if (current) {
        current.publicAgentCount = (current.publicAgentCount ?? 0) + 1;
      }
    }
  }

  return [...byUsername.values()]
    .sort((a, b) => {
      const agentDiff = (b.publicAgentCount ?? 0) - (a.publicAgentCount ?? 0);
      if (agentDiff !== 0) {
        return agentDiff;
      }
      return a.displayName.localeCompare(b.displayName);
    })
    .slice(0, 4);
}
