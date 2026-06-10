import type { SupabaseClient } from "@supabase/supabase-js";
import { getAvailableAgents } from "@/lib/agents/manifest";
import type { PublicAgent, PublicAgentDirectoryData } from "@/lib/agents/showcase-types";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import type { AgentRegistrationRecord } from "@/lib/server/agents/registration";
import {
  externalAgentToPublicAgent,
  getFeaturedDevelopersFromAgents,
  loadDeveloperProfileMap,
  publicPermissions,
} from "@/lib/server/developers/profile";

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

const featuredAgentIds = ["nova", "research-agent", "code-assistant", "meeting-summarizer"];

const firstPartyPromptExamples: Record<string, string[]> = {
  "code-assistant": [
    "Review this function and explain the tradeoffs.",
    "Help me debug this architecture decision.",
  ],
  "meeting-summarizer": [
    "Summarize the decisions from this conversation.",
    "Turn this room into action items.",
  ],
  nova: ["Nova, help us think through this idea.", "Nova, summarize what we just discussed."],
  "research-agent": [
    "Find current context about this market.",
    "Summarize the sources that matter for this topic.",
  ],
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function safeDisplayNameFromEmail(email: string | null | undefined) {
  if (!email) {
    return "Voxa developer";
  }

  const localPart = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return localPart
    ? localPart.replace(/\b\w/g, (character) => character.toUpperCase())
    : "Voxa developer";
}

async function resolveCreatorDisplayNames(
  service: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        const { data, error } = await service.auth.admin.getUserById(userId);
        const metadata = data.user?.user_metadata ?? {};
        const displayName =
          typeof metadata.full_name === "string"
            ? metadata.full_name
            : typeof metadata.name === "string"
              ? metadata.name
              : safeDisplayNameFromEmail(data.user?.email);

        names.set(userId, error ? "Voxa developer" : displayName);
      } catch {
        names.set(userId, "Voxa developer");
      }
    }),
  );

  return names;
}

function firstPartyAgents(): PublicAgent[] {
  return getAvailableAgents().map((agent) => ({
    avatarUrl: agent.avatar ?? null,
    capabilities: agent.capabilities.slice(0, 8),
    creatorDisplayName: "Voxa",
    creatorProfile: null,
    creatorUsername: null,
    description: agent.description,
    examplePrompts: firstPartyPromptExamples[agent.id] ?? [],
    featured: featuredAgentIds.includes(agent.id),
    id: agent.id,
    name: agent.name,
    permissions: publicPermissions(agent.permissions ?? []),
    slug: agent.id,
    source: "first_party",
    tags: agent.tags ?? [],
    updatedAt: null,
    verificationStatus: "verified",
  }));
}

async function loadPublicExternalAgents(): Promise<PublicAgent[]> {
  const service = getServiceRoleClient();
  if (!service) {
    return [];
  }

  const { data, error } = await service
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
    .eq("status", "approved")
    .eq("verification_status", "verified")
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .returns<PublicAgentRecord[]>();

  if (error || !data) {
    console.warn("Public agent showcase query failed.", error?.message ?? "Unknown error");
    return [];
  }

  const creatorNames = await resolveCreatorDisplayNames(
    service,
    data.map((agent) => agent.creator_user_id),
  );
  const creatorProfiles = await loadDeveloperProfileMap(
    service,
    data.map((agent) => agent.creator_user_id),
  );

  return data.map((record) => {
    const agent = externalAgentToPublicAgent(
      record,
      creatorProfiles.get(record.creator_user_id) ?? null,
      creatorNames.get(record.creator_user_id) ?? "Voxa developer",
    );

    return {
      ...agent,
      featured: featuredAgentIds.includes(record.slug) || featuredAgentIds.includes(record.id),
      updatedAt: formatDate(record.updated_at ?? record.created_at),
    };
  });
}

function uniqueAgents(agents: PublicAgent[]) {
  const bySlug = new Map<string, PublicAgent>();
  for (const agent of agents) {
    if (!bySlug.has(agent.slug)) {
      bySlug.set(agent.slug, agent);
    }
  }
  return [...bySlug.values()];
}

export async function getPublicAgentDirectory(): Promise<PublicAgentDirectoryData> {
  const externalAgents = await loadPublicExternalAgents();
  const fallbackAgents = firstPartyAgents();
  const agents = uniqueAgents([...fallbackAgents, ...externalAgents]).sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === "external" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const featuredFromConfig = featuredAgentIds
    .map((agentId) => agents.find((agent) => agent.id === agentId || agent.slug === agentId))
    .filter((agent): agent is PublicAgent => Boolean(agent));
  const featuredExternal = externalAgents.filter((agent) => agent.featured);
  const fallbackFeatured = fallbackAgents.filter((agent) => featuredAgentIds.includes(agent.id));
  const featuredAgents = uniqueAgents([
    ...featuredFromConfig,
    ...featuredExternal,
    ...fallbackFeatured,
  ]).slice(0, 4);

  return {
    agents,
    featuredAgents,
    featuredDevelopers: await getFeaturedDevelopersFromAgents(externalAgents),
    publicExternalAgentsAvailable: externalAgents.length > 0,
  };
}

export async function getPublicAgentBySlug(slug: string): Promise<PublicAgent | null> {
  const directory = await getPublicAgentDirectory();
  return directory.agents.find((agent) => agent.slug === slug) ?? null;
}
