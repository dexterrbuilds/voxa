import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRegistrationRecord } from "@/lib/server/agents/registration";
import {
  resolveEffectivePermissions,
  type ExternalAgentPermission,
} from "@/lib/agents/permissions";

// Experimental, feature-flagged room visibility for external agents.
//
// This module ONLY decides whether an approved + verified external agent may be
// SHOWN in the live-room Agent Selector. It does not dispatch agents, call their
// endpoints, mint LiveKit tokens, or give them any room audio/transcript access.
// Surfacing here is display-only (invite disabled) — the sandbox remains the only
// place external agents actually execute.

// Server-only flag. Default false. Never expose as NEXT_PUBLIC.
export function externalAgentsInRoomsEnabled(): boolean {
  return process.env.EXPERIMENTAL_EXTERNAL_AGENTS_IN_ROOMS === "true";
}

// Compatibility participant id for external agents in `room_participants.user_id`.
// First-party Nova still uses "nova"; external agents use `agent:<agentId>` so the
// two are never confused and external agents are easy to detect.
export const EXTERNAL_AGENT_PARTICIPANT_PREFIX = "agent:";

export function externalAgentParticipantId(agentId: string): string {
  return `${EXTERNAL_AGENT_PARTICIPANT_PREFIX}${agentId}`;
}

export function isExternalAgentParticipantId(userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.startsWith(EXTERNAL_AGENT_PARTICIPANT_PREFIX);
}

export type RoomTextAgentValidation =
  | { ok: true; agent: AgentRegistrationRecord }
  | { ok: false; code: string; status: number; message: string };

// Re-validate, for a SINGLE agent, that it belongs to the caller AND is approved
// AND verified AND has an endpoint. Used on every invite and every room-text
// message (defense-in-depth — never trust the client). Uses the caller's own
// anon+bearer client, so RLS already scopes to their agents.
export async function validateRoomTextAgent(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
): Promise<RoomTextAgentValidation> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .eq("creator_user_id", userId)
    .maybeSingle<AgentRegistrationRecord>();

  if (error) {
    return {
      ok: false,
      code: "agent_registry_error",
      status: 500,
      message: "Could not read the agent registry.",
    };
  }
  if (!data) {
    return { ok: false, code: "agent_not_found", status: 404, message: "Agent not found." };
  }
  if (data.status !== "approved") {
    return {
      ok: false,
      code: "agent_not_approved",
      status: 409,
      message: "Only approved agents can be used in a room.",
    };
  }
  if ((data.verification_status ?? "verification_pending") !== "verified") {
    return {
      ok: false,
      code: "agent_not_verified",
      status: 409,
      message: "This agent's endpoint is not verified yet.",
    };
  }
  if (!data.endpoint_url) {
    return {
      ok: false,
      code: "agent_no_endpoint",
      status: 409,
      message: "This agent has no registered endpoint URL.",
    };
  }
  return { ok: true, agent: data };
}

// Verify (with a service-role client, so it spans rows) that `userId` is a human
// participant of `roomId`. Only room members may invite/message external agents.
export async function isHumanRoomMember(
  service: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("participant_type", "human")
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}

// Verify the external agent participant row exists in the room.
export async function isExternalAgentInRoom(
  service: SupabaseClient,
  roomId: string,
  agentId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", externalAgentParticipantId(agentId))
    .eq("participant_type", "agent")
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}

export type RoomEligibleExternalAgent = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  tags: string[];
  // Effective (grantable-only) permissions — future permissions are dropped.
  permissions: ExternalAgentPermission[];
};

function toRoomEligible(record: AgentRegistrationRecord): RoomEligibleExternalAgent {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    capabilities: record.capabilities ?? [],
    tags: record.tags ?? [],
    permissions: resolveEffectivePermissions(record.permissions),
  };
}

// Fetch the caller's OWN room-eligible external agents. Eligibility is strict:
//   - creator_user_id = the caller (RLS already enforces this; explicit too)
//   - status = approved
//   - verification_status = verified
//   - endpoint_url is not null
//   - visibility in (private, unlisted)  — public is intentionally NOT supported
//
// Returns [] on any error (e.g. the agents table / verification columns are not
// present yet) so a room never breaks because of this experimental path.
export async function getOwnRoomEligibleExternalAgents(
  supabase: SupabaseClient,
  userId: string,
): Promise<RoomEligibleExternalAgent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("creator_user_id", userId)
    .eq("status", "approved")
    .eq("verification_status", "verified")
    .not("endpoint_url", "is", null)
    .in("visibility", ["private", "unlisted"])
    .returns<AgentRegistrationRecord[]>();

  if (error || !data) {
    return [];
  }

  // Defense-in-depth: never surface an agent that is missing an endpoint.
  return data.filter((record) => Boolean(record.endpoint_url)).map(toRoomEligible);
}
