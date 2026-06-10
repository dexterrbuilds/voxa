"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  getAgentById,
  getAgentParticipantUserId,
  NOVA_AGENT_ID,
} from "@/lib/agents";
import { getSupabaseClient } from "@/lib/supabase";
import type { Participant, Room, RoomEvent, User } from "@/lib/store";

type ParticipantType = "human" | "agent";
type RoomStatus = "active" | "ended";

type RoomRow = {
  id: string;
  room_id: string;
  created_by: string;
  created_at: string;
  status: RoomStatus | null;
  ended_at: string | null;
};

type RoomParticipantRow = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  participant_type: ParticipantType | null;
  joined_at: string;
  last_seen_at: string | null;
};

type RoomEventRow = {
  id: string;
  room_id: string;
  type: RoomEvent["type"];
  message: string;
  created_at: string;
  user_id: string | null;
};

type RoomAccess = {
  room: RoomRow;
  reopened: boolean;
};

export type SharedRoomResult = {
  room: Room;
  usedSharedState: boolean;
};

export class RoomExpiredError extends Error {
  constructor(roomId: string) {
    super(`Room ${roomId} has expired.`);
    this.name = "RoomExpiredError";
  }
}

const roomReopenGraceMs = 60 * 60 * 1000;
export const roomPresenceConfig = {
  heartbeatMs: 15_000,
  staleTimeoutMs: 60_000,
};
let staleCleanupUnavailable = false;
let novaMemoryCleanupUnavailable = false;
let externalAgentMemoryCleanupUnavailable = false;

function displayNameForUser(user: User) {
  return user.name || user.email || "Guest";
}

function isAgentParticipant(row: RoomParticipantRow) {
  return row.participant_type === "agent";
}

function isRoomWithinReopenGrace(room: RoomRow) {
  if (room.status !== "ended" || !room.ended_at) {
    return true;
  }

  return Date.now() - new Date(room.ended_at).getTime() <= roomReopenGraceMs;
}

function participantFromRow(row: RoomParticipantRow): Participant {
  const participantType: ParticipantType = isAgentParticipant(row) ? "agent" : "human";
  const manifestAgent = participantType === "agent" ? getAgentById(row.user_id) : null;

  return {
    id: row.user_id,
    name:
      row.display_name ||
      row.email ||
      manifestAgent?.name ||
      (participantType === "agent" ? "Agent" : "Guest"),
    email: row.email ?? undefined,
    participantType,
    role: participantType === "agent" ? "ai" : "human",
    avatar: "",
    status: "in-room",
  };
}

function eventFromRow(row: RoomEventRow): RoomEvent {
  return {
    id: row.id,
    createdAt: row.created_at,
    type: row.type,
    text: row.message,
  };
}

function roomFromRows(
  room: RoomRow,
  participants: RoomParticipantRow[],
  events: RoomEventRow[],
): Room {
  const uniqueParticipants = participants.filter(
    (participant, index, allParticipants) =>
      allParticipants.findIndex(
        (existingParticipant) =>
          existingParticipant.user_id === participant.user_id &&
          existingParticipant.participant_type === participant.participant_type,
      ) === index,
  );
  const mappedParticipants = uniqueParticipants.map(participantFromRow);
  const invitedAgents = Array.from(
    new Set(
      mappedParticipants
        .filter((participant) => participant.participantType === "agent")
        .map((participant) => participant.id),
    ),
  );

  return {
    id: room.room_id,
    roomId: room.room_id,
    name: "Voxa Room",
    createdAt: room.created_at,
    createdBy: room.created_by,
    status: room.status ?? "active",
    endedAt: room.ended_at,
    participants: mappedParticipants,
    invitedAgents,
    events: events.map(eventFromRow),
    mutedParticipantIds: [],
    isPrivate: true,
  };
}

export function isSharedRoomSchemaError(error: unknown) {
  const roomError = error as { code?: string; message?: string } | null;

  return (
    roomError?.code === "42P01" ||
    roomError?.code === "PGRST205" ||
    /does not exist/i.test(roomError?.message ?? "") ||
    /schema cache/i.test(roomError?.message ?? "")
  );
}

function isOptionalStaleCleanupError(error: unknown) {
  const roomError = error as { code?: string; message?: string } | null;
  const message = roomError?.message ?? "";

  return (
    roomError?.code === "PGRST202" ||
    /cleanup_stale_room_participants/i.test(message) ||
    /function.*schema cache/i.test(message)
  );
}

async function getOrCreateRoom(roomId: string, user: User): Promise<RoomAccess> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const existing = await supabase.from("rooms").select("*").eq("room_id", roomId).maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    const room = existing.data as RoomRow;

    if (room.status === "ended") {
      if (!isRoomWithinReopenGrace(room)) {
        throw new RoomExpiredError(roomId);
      }

      const reopened = await supabase
        .from("rooms")
        .update({ status: "active", ended_at: null })
        .eq("room_id", roomId)
        .select("*")
        .single();

      if (reopened.error) {
        throw reopened.error;
      }

      return { room: reopened.data as RoomRow, reopened: true };
    }

    return { room, reopened: false };
  }

  const inserted = await supabase
    .from("rooms")
    .insert({
      room_id: roomId,
      created_by: user.id,
      status: "active",
      ended_at: null,
    })
    .select("*")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return getOrCreateRoom(roomId, user);
    }

    throw inserted.error;
  }

  return { room: inserted.data as RoomRow, reopened: false };
}

async function loadRoomRows(roomId: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const roomResult = await supabase.from("rooms").select("*").eq("room_id", roomId).single();

  if (roomResult.error) {
    throw roomResult.error;
  }

  const [participantsResult, eventsResult] = await Promise.all([
    supabase
      .from("room_participants")
      .select("*")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("room_events")
      .select("*")
      .eq("room_id", roomId)
      // Exclude per-agent memory rows (Nova session memory + external-agent text
      // threads) from the human-facing event feed; they exist only as scoped,
      // server-side memory and are read through their own paths.
      .not("type", "in", "(nova_user,nova_reply,external_agent_user,external_agent_reply)")
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  if (participantsResult.error) {
    throw participantsResult.error;
  }

  if (eventsResult.error) {
    throw eventsResult.error;
  }

  return roomFromRows(
    roomResult.data as RoomRow,
    (participantsResult.data ?? []) as RoomParticipantRow[],
    (eventsResult.data ?? []) as RoomEventRow[],
  );
}

async function addRoomEvent(
  roomId: string,
  message: string,
  type: RoomEvent["type"],
  userId: string | null,
) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return;
  }

  await supabase.from("room_events").insert({
    room_id: roomId,
    type,
    message,
    user_id: userId,
  });
}

async function humanCount(roomId: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return 0;
  }

  const result = await supabase
    .from("room_participants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("participant_type", "human");

  if (result.error) {
    throw result.error;
  }

  return result.count ?? 0;
}

export async function updateSharedRoomHeartbeat(roomId: string, user: User) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const updated = await supabase
    .from("room_participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .eq("participant_type", "human");

  if (updated.error) {
    throw updated.error;
  }
}

export async function cleanupStaleParticipants(roomId: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  if (staleCleanupUnavailable) {
    return null;
  }

  const staleBefore = new Date(Date.now() - roomPresenceConfig.staleTimeoutMs).toISOString();
  const result = await supabase.rpc("cleanup_stale_room_participants", {
    target_room_id: roomId,
    stale_before: staleBefore,
  });

  if (result.error) {
    if (isOptionalStaleCleanupError(result.error)) {
      staleCleanupUnavailable = true;
      console.warn(
        "Stale participant cleanup is not installed in Supabase yet. Shared room sync will continue without stale cleanup.",
      );
      return null;
    }

    throw result.error;
  }

  return result.data as number | null;
}

function isOptionalNovaMemoryCleanupError(error: unknown) {
  const roomError = error as { code?: string; message?: string } | null;
  const message = roomError?.message ?? "";

  return (
    roomError?.code === "PGRST202" ||
    /cleanup_nova_room_memory/i.test(message) ||
    /function.*schema cache/i.test(message)
  );
}

// Best-effort: drop Nova's short-term per-room session memory rows
// (`nova_user` / `nova_reply` in `room_events`) once a room has closed. These
// rows have no client DELETE policy under RLS, so deletion runs through a
// SECURITY DEFINER Postgres function. This never throws — a room leave must not
// fail because memory cleanup did. If the function is not installed yet, the
// hourly `cleanup_expired_voxa_rooms` sweep still removes the rows as a backstop.
async function cleanupNovaRoomMemory(roomId: string) {
  const supabase = getSupabaseClient();

  if (!supabase || novaMemoryCleanupUnavailable) {
    return null;
  }

  try {
    const result = await supabase.rpc("cleanup_nova_room_memory", {
      target_room_id: roomId,
    });

    if (result.error) {
      if (isOptionalNovaMemoryCleanupError(result.error)) {
        novaMemoryCleanupUnavailable = true;
        console.warn(
          "Nova memory cleanup is not installed in Supabase yet. Closed rooms will rely on the hourly expiry sweep to drop session memory.",
        );
        return null;
      }

      console.warn(`Nova memory cleanup failed for room ${roomId}:`, result.error.message);
      return null;
    }

    const deletedRows = typeof result.data === "number" ? result.data : null;
    console.info(
      `Nova memory cleanup for room ${roomId}: deleted ${deletedRows ?? "unknown"} session memory row(s).`,
    );
    return deletedRows;
  } catch (error) {
    console.warn(`Nova memory cleanup threw for room ${roomId}:`, error);
    return null;
  }
}

function isOptionalExternalAgentMemoryCleanupError(error: unknown) {
  const roomError = error as { code?: string; message?: string } | null;
  const message = roomError?.message ?? "";
  return (
    roomError?.code === "PGRST202" ||
    /cleanup_external_agent_room_memory/i.test(message) ||
    /function.*schema cache/i.test(message)
  );
}

// Best-effort: drop external agents' per-room text threads
// (`external_agent_user` / `external_agent_reply`) once a room has closed. Like
// Nova memory, these rows have no client DELETE policy under RLS, so deletion
// runs through a SECURITY DEFINER function. Never throws. The hourly
// `cleanup_expired_voxa_rooms` sweep is the backstop.
async function cleanupExternalAgentRoomMemory(roomId: string) {
  const supabase = getSupabaseClient();

  if (!supabase || externalAgentMemoryCleanupUnavailable) {
    return null;
  }

  try {
    const result = await supabase.rpc("cleanup_external_agent_room_memory", {
      target_room_id: roomId,
    });

    if (result.error) {
      if (isOptionalExternalAgentMemoryCleanupError(result.error)) {
        externalAgentMemoryCleanupUnavailable = true;
        console.warn(
          "External agent memory cleanup is not installed in Supabase yet. Closed rooms will rely on the hourly expiry sweep.",
        );
        return null;
      }
      console.warn(`External agent memory cleanup failed for room ${roomId}:`, result.error.message);
      return null;
    }

    const deletedRows = typeof result.data === "number" ? result.data : null;
    console.info(
      `External agent memory cleanup for room ${roomId}: deleted ${deletedRows ?? "unknown"} thread row(s).`,
    );
    return deletedRows;
  } catch (error) {
    console.warn(`External agent memory cleanup threw for room ${roomId}:`, error);
    return null;
  }
}

export async function joinSharedRoom(roomId: string, user: User): Promise<SharedRoomResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  await getOrCreateRoom(roomId, user);
  await cleanupStaleParticipants(roomId);
  const roomAccess = await getOrCreateRoom(roomId, user);

  const existingParticipant = await supabase
    .from("room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingParticipant.error) {
    throw existingParticipant.error;
  }

  const now = new Date().toISOString();

  if (existingParticipant.data) {
    const updated = await supabase
      .from("room_participants")
      .update({ last_seen_at: now, participant_type: "human" })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    if (updated.error) {
      throw updated.error;
    }
  } else {
    const inserted = await supabase.from("room_participants").insert({
      room_id: roomId,
      user_id: user.id,
      display_name: displayNameForUser(user),
      email: user.email,
      participant_type: "human",
      joined_at: now,
      last_seen_at: now,
    });

    if (inserted.error && inserted.error.code !== "23505") {
      throw inserted.error;
    }

    if (!inserted.error) {
      const action = roomAccess.reopened ? "rejoined" : "joined";
      await addRoomEvent(
        roomId,
        `${displayNameForUser(user)} ${action} the room`,
        "participant",
        user.id,
      );
    }
  }

  return {
    room: await loadRoomRows(roomId),
    usedSharedState: true,
  };
}

export async function leaveSharedRoom(roomId: string, user: User) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const existingParticipant = await supabase
    .from("room_participants")
    .select("id, display_name, email, participant_type")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingParticipant.error) {
    throw existingParticipant.error;
  }

  if (!existingParticipant.data) {
    return loadRoomRows(roomId);
  }

  const removed = await supabase
    .from("room_participants")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  if (removed.error) {
    throw removed.error;
  }

  const name =
    existingParticipant.data.display_name ||
    existingParticipant.data.email ||
    displayNameForUser(user);
  await addRoomEvent(roomId, `${name} left the room`, "participant", user.id);

  const remainingHumans = await humanCount(roomId);
  if (remainingHumans === 0) {
    const ended = await supabase
      .from("rooms")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("room_id", roomId);

    if (ended.error) {
      throw ended.error;
    }

    // The room is now closed (last human left): drop per-room agent memory so it
    // does not linger. Best-effort — never blocks leaving. Normal room events are
    // preserved; the hourly expiry sweep is the backstop.
    await cleanupNovaRoomMemory(roomId);
    await cleanupExternalAgentRoomMemory(roomId);
  }

  return loadRoomRows(roomId);
}

export async function loadSharedRoom(roomId: string) {
  await cleanupStaleParticipants(roomId);
  return loadRoomRows(roomId);
}

export async function inviteAgentToSharedRoom(roomId: string, agentId: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const agent = getAgentById(agentId);

  if (!agent) {
    throw new Error(`Agent "${agentId}" is not registered.`);
  }

  // Legacy compatibility: room_participants.user_id currently stores the agent
  // participant id. For Nova this remains "nova" until the DB gets agent_id.
  const participantUserId = getAgentParticipantUserId(agent.id);
  const existing = await supabase
    .from("room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", participantUserId)
    .eq("participant_type", "agent")
    .limit(1);

  if (existing.error) {
    throw existing.error;
  }

  if ((existing.data?.length ?? 0) > 0) {
    return loadRoomRows(roomId);
  }

  const now = new Date().toISOString();
  const inserted = await supabase.from("room_participants").insert({
    room_id: roomId,
    user_id: participantUserId,
    display_name: agent.name,
    email: null,
    participant_type: "agent",
    joined_at: now,
    last_seen_at: now,
  });

  if (inserted.error && inserted.error.code !== "23505") {
    throw inserted.error;
  }

  if (!inserted.error) {
    await addRoomEvent(roomId, `${agent.name} joined the room`, "agent", participantUserId);
  }

  return loadRoomRows(roomId);
}

export async function inviteNovaToSharedRoom(roomId: string) {
  return inviteAgentToSharedRoom(roomId, NOVA_AGENT_ID);
}

export function subscribeToSharedRoom(
  roomId: string,
  onChange: () => void,
): RealtimeChannel | null {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  return supabase
    .channel(`voxa-room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `room_id=eq.${roomId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_participants",
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_events", filter: `room_id=eq.${roomId}` },
      onChange,
    )
    .subscribe();
}

export function unsubscribeFromSharedRoom(channel: RealtimeChannel | null) {
  const supabase = getSupabaseClient();

  if (supabase && channel) {
    void supabase.removeChannel(channel);
  }
}
