import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgentParticipantUserId, NOVA_AGENT_ID } from "@/lib/agents";
import type { NovaTurn } from "@/lib/server/nova/providers/llm/gemini";

const novaParticipantUserId = getAgentParticipantUserId(NOVA_AGENT_ID);

// Short-term, per-room session memory for Nova.
//
// We persist each user prompt and each Nova reply as rows in the existing
// `room_events` table using dedicated `type` values so they can be read back as
// conversation history on the next turn, and filtered out of the human-facing
// room event feed. This is SESSION memory only — it lives for the life of the
// room and there is no cross-room / long-term memory yet.
export const NOVA_MEMORY_USER_TYPE = "nova_user";
export const NOVA_MEMORY_REPLY_TYPE = "nova_reply";
export const NOVA_MEMORY_TYPES = [NOVA_MEMORY_USER_TYPE, NOVA_MEMORY_REPLY_TYPE];

// Number of individual messages (user or Nova) to feed back as context.
// Default 12 messages ≈ the last 6 back-and-forth exchanges. Kept small to keep
// token usage low. Override with NOVA_MEMORY_TURNS.
function getNovaMemoryTurns() {
  const parsed = Number(process.env.NOVA_MEMORY_TURNS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 12;
}

type RoomEventMemoryRow = {
  type: string;
  message: string | null;
};

// Load the most recent conversation turns for a room, oldest-first, ready to
// pass to the LLM as history. Best-effort: on any failure we return [] so the
// current turn still works (memory is additive, never blocking).
export async function loadRecentNovaTurns(
  supabase: SupabaseClient,
  roomId: string,
): Promise<NovaTurn[]> {
  const limit = getNovaMemoryTurns();

  const result = await supabase
    .from("room_events")
    .select("type, message")
    .eq("room_id", roomId)
    .in("type", NOVA_MEMORY_TYPES)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (result.error || !result.data) {
    return [];
  }

  const rows = result.data as RoomEventMemoryRow[];

  return rows
    .slice()
    .reverse()
    .map((row) => ({
      role: row.type === NOVA_MEMORY_REPLY_TYPE ? ("nova" as const) : ("user" as const),
      text: (row.message ?? "").trim(),
    }))
    .filter((turn) => turn.text.length > 0);
}

// Persist one user prompt + Nova reply pair. Best-effort and non-fatal.
export async function recordNovaExchange(
  supabase: SupabaseClient,
  params: { roomId: string; userId: string; transcript: string; responseText: string },
): Promise<void> {
  const { roomId, userId, transcript, responseText } = params;
  const rows: Array<{ room_id: string; type: string; message: string; user_id: string }> = [];

  if (transcript.trim().length > 0) {
    rows.push({
      room_id: roomId,
      type: NOVA_MEMORY_USER_TYPE,
      message: transcript.trim(),
      user_id: userId,
    });
  }

  if (responseText.trim().length > 0) {
    rows.push({
      room_id: roomId,
      type: NOVA_MEMORY_REPLY_TYPE,
      message: responseText.trim(),
      // Legacy compatibility: room_events.user_id stores the agent participant id
      // until Voxa adds a dedicated agent identity column.
      user_id: novaParticipantUserId,
    });
  }

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from("room_events").insert(rows);

  if (error) {
    console.warn("nova.memory.persist_failed", { detail: error.message });
  }
}
