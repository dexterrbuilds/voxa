import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase, jsonError } from "@/lib/server/agents/registration";
import {
  externalAgentsInRoomsEnabled,
  isExternalAgentInRoom,
  isHumanRoomMember,
  validateRoomTextAgent,
} from "@/lib/server/agents/room-access";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import { roomTextRuntime } from "@/lib/server/agents/runtime/RoomTextRuntime";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 4000;
// Per-user room-text budget (separate bucket from the sandbox limiter).
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

// POST /api/agents/room/message  { roomId, agentId, message }
//
// EXPERIMENTAL, text-only. Sends ONE user message to the caller's OWN approved +
// verified external agent that is present in the room, and returns the text reply.
// Re-validates flag + ownership + approval + verification + endpoint + room
// membership on EVERY call. Sends NO room audio and NO transcript — only the one
// message string. Never dispatches to LiveKit.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!externalAgentsInRoomsEnabled()) {
    return jsonError("External agents in rooms are not enabled.", 403, "feature_disabled");
  }

  const limit = checkRateLimit(`room-text:${auth.user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many messages. Try again in ${limit.retryAfterSeconds}s.`,
        code: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "invalid_json");
  }

  const { roomId, agentId, message } = (body ?? {}) as {
    roomId?: unknown;
    agentId?: unknown;
    message?: unknown;
  };
  if (typeof roomId !== "string" || !roomId.trim()) {
    return jsonError("A roomId is required.", 400, "invalid_room_id");
  }
  if (typeof agentId !== "string" || !agentId.trim()) {
    return jsonError("An agentId is required.", 400, "invalid_agent_id");
  }
  if (typeof message !== "string" || !message.trim()) {
    return jsonError("A non-empty message is required.", 400, "invalid_message");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonError("Message is too long.", 400, "message_too_long");
  }

  // Ownership + approval + verification + endpoint.
  const validation = await validateRoomTextAgent(auth.supabase, auth.user.id, agentId.trim());
  if (!validation.ok) {
    return jsonError(validation.message, validation.status, validation.code);
  }

  const service = getServiceRoleClient();
  if (!service) {
    return jsonError(
      "Room agent messaging is not configured (missing service role).",
      500,
      "service_not_configured",
    );
  }

  // Caller must be in the room, and the agent must actually be in the room.
  const [isMember, agentPresent] = await Promise.all([
    isHumanRoomMember(service, roomId.trim(), auth.user.id),
    isExternalAgentInRoom(service, roomId.trim(), validation.agent.id),
  ]);
  if (!isMember) {
    return jsonError("You must be in the room to message an agent.", 403, "not_room_member");
  }
  if (!agentPresent) {
    return jsonError("This agent is not in the room.", 409, "agent_not_in_room");
  }

  // Text-only: send ONLY the message string + room/agent ids. No transcript.
  const reply = await roomTextRuntime.sendMessageToAgent({
    endpointUrl: validation.agent.endpoint_url!,
    message: message.trim(),
    context: { roomId: roomId.trim(), agentId: validation.agent.id },
  });

  if (!reply.ok) {
    return jsonError(reply.detail, 502, reply.code);
  }

  return NextResponse.json({
    reply: { text: reply.text, streaming: reply.streaming ?? false, tools: reply.tools ?? [] },
    agent: { id: validation.agent.id, name: validation.agent.name },
  });
}
