import type { SupabaseClient } from "@supabase/supabase-js";
import { getAvailableAgents, type AgentManifestEntry } from "@/lib/agents/manifest";
import type {
  AgentRegistrationRecord,
  AgentVerificationStatus,
} from "@/lib/server/agents/registration";

// Runtime registry preparation.
//
// This is the architectural seam where two agent sources will eventually merge:
//
//   1. First-party manifest agents (static, in `manifest.ts`) — today the only
//      agents that may appear in rooms (and only the `available` ones).
//   2. Approved + verified DB agents (developer-owned, in `public.agents`) — NOT
//      yet allowed in rooms.
//
// The merge intentionally tags every descriptor with `source` and an explicit
// `availableInRooms` gate. Registered (DB) agents are ALWAYS `availableInRooms:
// false` here, so wiring this into room code cannot accidentally leak an external
// agent into production. Nothing calls `mergeRuntimeAgents` from room/selector
// code yet; this module exists so that wiring is a single, deliberate change
// later (flip the gate + add dispatch) rather than a rewrite.

export type RuntimeAgentSource = "first_party" | "registered";

export type RuntimeAgentDescriptor = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  permissions: string[];
  source: RuntimeAgentSource;
  // Hard gate. Only first-party `available` agents are true today. Registered
  // agents are always false until a DB-backed runtime registry is enabled.
  availableInRooms: boolean;
  // For registered agents only: the review + verification posture.
  reviewStatus?: string;
  verificationStatus?: AgentVerificationStatus;
  participantUserId: string;
};

function firstPartyToDescriptor(entry: AgentManifestEntry): RuntimeAgentDescriptor {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    capabilities: [...entry.capabilities],
    permissions: entry.permissions ? [...entry.permissions] : [],
    source: "first_party",
    availableInRooms: entry.availability === "available",
    participantUserId: entry.participantUserId,
  };
}

export function getFirstPartyRuntimeAgents(): RuntimeAgentDescriptor[] {
  return getAvailableAgents().map(firstPartyToDescriptor);
}

// Map a DB agent record into a runtime descriptor. Registered agents are gated
// OFF for rooms unconditionally — approval + verification only make them
// sandbox-eligible, never room-eligible, at this phase.
export function toRegisteredRuntimeDescriptor(
  record: AgentRegistrationRecord,
): RuntimeAgentDescriptor {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    capabilities: record.capabilities ?? [],
    permissions: record.permissions ?? [],
    source: "registered",
    availableInRooms: false,
    reviewStatus: record.status,
    verificationStatus: record.verification_status ?? "verification_pending",
    participantUserId: record.id,
  };
}

// Server-side: load approved + verified DB agents as runtime descriptors. Requires
// a privileged (service-role) client because it spans creators. Returns [] if the
// table/columns are not present yet. This is NOT called by room or selector code.
export async function getRegisteredRuntimeAgents(
  service: SupabaseClient,
): Promise<RuntimeAgentDescriptor[]> {
  const { data, error } = await service
    .from("agents")
    .select("*")
    .eq("status", "approved")
    .eq("verification_status", "verified")
    .returns<AgentRegistrationRecord[]>();

  if (error || !data) {
    return [];
  }

  return data.map(toRegisteredRuntimeDescriptor);
}

// The merge seam. Order: first-party first, then registered. Callers that
// eventually surface agents into rooms MUST filter on `availableInRooms`.
export function mergeRuntimeAgents(
  firstParty: RuntimeAgentDescriptor[],
  registered: RuntimeAgentDescriptor[],
): RuntimeAgentDescriptor[] {
  const byId = new Map<string, RuntimeAgentDescriptor>();
  for (const descriptor of [...firstParty, ...registered]) {
    if (!byId.has(descriptor.id)) {
      byId.set(descriptor.id, descriptor);
    }
  }
  return Array.from(byId.values());
}

// Convenience: the only agents that may currently enter rooms. Equivalent to the
// first-party `available` set — registered agents are never included.
export function getRoomEligibleAgents(
  agents: RuntimeAgentDescriptor[],
): RuntimeAgentDescriptor[] {
  return agents.filter((agent) => agent.availableInRooms);
}
