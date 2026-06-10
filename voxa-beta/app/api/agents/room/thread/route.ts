import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase, jsonError } from "@/lib/server/agents/registration";
import {
  externalAgentsInRoomsEnabled,
  isExternalAgentInRoom,
  isHumanRoomMember,
  validateRoomTextAgent,
} from "@/lib/server/agents/room-access";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import {
  clearExternalAgentThread,
  loadExternalAgentThread,
} from "@/lib/server/agents/room-memory";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Shared validation for both GET (read thread) and DELETE (clear thread). Applies
// the full security posture: flag + auth + ownership + approval + verification +
// human room membership + agent-in-room.
async function resolveThreadRequest(request: NextRequest): Promise<
  | { response: NextResponse }
  | { ok: true; service: SupabaseClient; roomId: string; agentId: string }
> {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return { response: auth };
  }

  if (!externalAgentsInRoomsEnabled()) {
    return { response: jsonError("External agents in rooms are not enabled.", 403, "feature_disabled") };
  }

  const roomId = (request.nextUrl.searchParams.get("roomId") ?? "").trim();
  const agentId = (request.nextUrl.searchParams.get("agentId") ?? "").trim();
  if (!roomId) {
    return { response: jsonError("A roomId is required.", 400, "invalid_room_id") };
  }
  if (!agentId) {
    return { response: jsonError("An agentId is required.", 400, "invalid_agent_id") };
  }

  const validation = await validateRoomTextAgent(auth.supabase, auth.user.id, agentId);
  if (!validation.ok) {
    return { response: jsonError(validation.message, validation.status, validation.code) };
  }

  const service = getServiceRoleClient();
  if (!service) {
    return { response: jsonError("Room agent threads are not configured.", 500, "service_not_configured") };
  }

  const [isMember, agentPresent] = await Promise.all([
    isHumanRoomMember(service, roomId, auth.user.id),
    isExternalAgentInRoom(service, roomId, validation.agent.id),
  ]);
  if (!isMember) {
    return { response: jsonError("You must be in the room to view this thread.", 403, "not_room_member") };
  }
  if (!agentPresent) {
    return { response: jsonError("This agent is not in the room.", 409, "agent_not_in_room") };
  }

  return { ok: true, service, roomId, agentId: validation.agent.id };
}

// GET /api/agents/room/thread?roomId=&agentId=  -> recent per-agent thread turns.
export async function GET(request: NextRequest) {
  const resolved = await resolveThreadRequest(request);
  if ("response" in resolved) {
    return resolved.response;
  }
  const turns = await loadExternalAgentThread(resolved.service, resolved.roomId, resolved.agentId);
  return NextResponse.json({ turns });
}

// DELETE /api/agents/room/thread?roomId=&agentId=  -> clear ONLY this agent's
// thread for this room (no room events, no Nova memory, no other agents).
export async function DELETE(request: NextRequest) {
  const resolved = await resolveThreadRequest(request);
  if ("response" in resolved) {
    return resolved.response;
  }
  const deleted = await clearExternalAgentThread(resolved.service, resolved.roomId, resolved.agentId);
  return NextResponse.json({ ok: true, deleted });
}
