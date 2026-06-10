import type { SupabaseClient } from "@supabase/supabase-js";
import { externalAgentParticipantId } from "@/lib/server/agents/room-access";

// Room-local, per-agent text thread storage for EXPERIMENTAL text-only external
// agents.
//
// Stored in the existing `room_events` table (no schema change) under dedicated
// types, scoped by `user_id = agent:<agentId>` so each (room, agent) pair has its
// own thread:
//   - external_agent_user  : a human's message to that agent
//   - external_agent_reply : that agent's reply
//
// These rows are written/read/deleted via the SERVICE ROLE (the room/message
// route already uses it), so they do not depend on room_events RLS. They are
// filtered out of the human-facing room event feed (see room-sync.ts), exactly
// like Nova's session memory. This is room-scoped + agent-scoped, text-only, and
// is deleted when the room closes. It is NEVER a room transcript and never mixes
// in Nova memory or other agents' threads.

export const EXTERNAL_AGENT_USER_TYPE = "external_agent_user";
export const EXTERNAL_AGENT_REPLY_TYPE = "external_agent_reply";
export const EXTERNAL_AGENT_MEMORY_TYPES = [
  EXTERNAL_AGENT_USER_TYPE,
  EXTERNAL_AGENT_REPLY_TYPE,
];

// How many recent turns to feed back as context (8–12). Default 10.
export function getRoomTextHistoryTurns(): number {
  const parsed = Number(process.env.EXTERNAL_AGENT_ROOM_MEMORY_TURNS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(20, Math.floor(parsed)) : 10;
}

export type RoomThreadTurn = {
  role: "user" | "agent";
  text: string;
  createdAt: string;
};

type RoomEventMemoryRow = {
  type: string;
  message: string;
  created_at: string;
};

// Load the recent thread for ONE (room, agent), oldest-first. Scoped strictly to
// this agent's rows; never returns other agents' threads, Nova memory, or normal
// room events.
export async function loadExternalAgentThread(
  service: SupabaseClient,
  roomId: string,
  agentId: string,
  limit = getRoomTextHistoryTurns(),
): Promise<RoomThreadTurn[]> {
  const { data, error } = await service
    .from("room_events")
    .select("type, message, created_at")
    .eq("room_id", roomId)
    .eq("user_id", externalAgentParticipantId(agentId))
    .in("type", EXTERNAL_AGENT_MEMORY_TYPES)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<RoomEventMemoryRow[]>();

  if (error || !data) {
    return [];
  }

  return data
    .slice()
    .reverse()
    .map((row) => ({
      role: row.type === EXTERNAL_AGENT_REPLY_TYPE ? ("agent" as const) : ("user" as const),
      text: row.message,
      createdAt: row.created_at,
    }))
    .filter((turn) => turn.text.trim().length > 0);
}

// Persist a successful exchange (user message + agent reply) for one agent thread.
// Both rows are keyed by `agent:<agentId>` so they belong to the same thread.
export async function recordExternalAgentExchange(
  service: SupabaseClient,
  params: { roomId: string; agentId: string; userText: string; replyText: string },
): Promise<void> {
  const participantUserId = externalAgentParticipantId(params.agentId);
  const { error } = await service.from("room_events").insert([
    {
      room_id: params.roomId,
      type: EXTERNAL_AGENT_USER_TYPE,
      message: params.userText,
      user_id: participantUserId,
    },
    {
      room_id: params.roomId,
      type: EXTERNAL_AGENT_REPLY_TYPE,
      message: params.replyText,
      user_id: participantUserId,
    },
  ]);
  if (error) {
    console.warn(`Could not persist external agent thread for room ${params.roomId}:`, error.message);
  }
}

// Clear ONE agent's thread in ONE room. Deletes only this agent's
// external_agent_user/reply rows — never room events, Nova memory, or other
// agents' threads.
export async function clearExternalAgentThread(
  service: SupabaseClient,
  roomId: string,
  agentId: string,
): Promise<number> {
  const { data, error } = await service
    .from("room_events")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", externalAgentParticipantId(agentId))
    .in("type", EXTERNAL_AGENT_MEMORY_TYPES)
    .select("id");
  if (error || !data) {
    return 0;
  }
  return data.length;
}
