import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase, jsonError } from "@/lib/server/agents/registration";
import {
  externalAgentParticipantId,
  externalAgentsInRoomsEnabled,
  isHumanRoomMember,
  validateRoomTextAgent,
} from "@/lib/server/agents/room-access";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import { recordAgentAnalytics } from "@/lib/server/agents/analytics";

export const runtime = "nodejs";

// POST /api/agents/room/invite  { roomId, agentId }
//
// EXPERIMENTAL, text-only. Invites the caller's OWN approved + verified external
// agent into a live room as an `agent` participant (`user_id = agent:<agentId>`).
// This creates a participant row + a join event ONLY. It does NOT dispatch the
// agent, call its endpoint, mint a LiveKit token, or grant any audio/transcript
// access. Gated behind EXPERIMENTAL_EXTERNAL_AGENTS_IN_ROOMS.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!externalAgentsInRoomsEnabled()) {
    return jsonError("External agents in rooms are not enabled.", 403, "feature_disabled");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "invalid_json");
  }

  const { roomId, agentId } = (body ?? {}) as { roomId?: unknown; agentId?: unknown };
  if (typeof roomId !== "string" || !roomId.trim()) {
    return jsonError("A roomId is required.", 400, "invalid_room_id");
  }
  if (typeof agentId !== "string" || !agentId.trim()) {
    return jsonError("An agentId is required.", 400, "invalid_agent_id");
  }

  // Ownership + approval + verification + endpoint (caller's own RLS-scoped client).
  const validation = await validateRoomTextAgent(auth.supabase, auth.user.id, agentId.trim());
  if (!validation.ok) {
    return jsonError(validation.message, validation.status, validation.code);
  }

  const service = getServiceRoleClient();
  if (!service) {
    return jsonError(
      "Room agent invites are not configured (missing service role).",
      500,
      "service_not_configured",
    );
  }

  // Only a current human member of the room may invite.
  const isMember = await isHumanRoomMember(service, roomId.trim(), auth.user.id);
  if (!isMember) {
    return jsonError("You must be in the room to invite an agent.", 403, "not_room_member");
  }

  const participantUserId = externalAgentParticipantId(validation.agent.id);
  const now = new Date().toISOString();

  const existing = await service
    .from("room_participants")
    .select("id")
    .eq("room_id", roomId.trim())
    .eq("user_id", participantUserId)
    .limit(1);

  if (existing.error)
    return jsonError("Could not check room membership. Try again.", 503, "invite_failed");

  if (!existing.error && (existing.data?.length ?? 0) === 0) {
    const inserted = await service.from("room_participants").insert({
      room_id: roomId.trim(),
      user_id: participantUserId,
      display_name: validation.agent.name,
      email: null,
      participant_type: "agent",
      joined_at: now,
      last_seen_at: now,
    });
    if (inserted.error && inserted.error.code !== "23505") {
      return jsonError("Could not add the agent to the room.", 500, "invite_failed");
    }
    if (inserted.error?.code === "23505")
      return NextResponse.json({
        ok: true,
        participantUserId,
        agent: { id: validation.agent.id, name: validation.agent.name },
      });
    await service.from("room_events").insert({
      room_id: roomId.trim(),
      type: "agent",
      message: `${validation.agent.name} joined the room (experimental text-only)`,
      user_id: participantUserId,
    });
    await recordAgentAnalytics(auth.supabase, {
      agentId: validation.agent.id,
      metric: "room_invites",
      ownerUserId: auth.user.id,
    });
  }

  return NextResponse.json({
    ok: true,
    participantUserId,
    agent: { id: validation.agent.id, name: validation.agent.name },
  });
}
