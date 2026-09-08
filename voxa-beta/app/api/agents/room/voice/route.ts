import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase, jsonError } from "@/lib/server/agents/registration";
import {
  externalAgentVoiceEnabled,
  isExternalAgentInRoom,
  isHumanRoomMember,
  validateRoomTextAgent,
} from "@/lib/server/agents/room-access";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import { voiceAgentRuntime } from "@/lib/server/agents/runtime/VoiceAgentRuntime";
import {
  loadExternalAgentThread,
  recordExternalAgentExchange,
} from "@/lib/server/agents/room-memory";
import { hasPermission, resolveEffectivePermissions } from "@/lib/agents/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { transcribeWithDeepgram } from "@/lib/server/nova/providers/stt/deepgram";
import { synthesizeNovaSpeech } from "@/lib/server/nova/providers/tts";

export const runtime = "nodejs";

// Stricter than text: each turn burns Deepgram STT + endpoint + TTS.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

// POST /api/agents/room/voice  (multipart: audio, roomId, agentId)
//
// PRIVATE push-to-talk voice beta. A user records a clip; Voxa transcribes it
// (Deepgram STT), sends ONLY the transcript text to the agent endpoint via
// VoiceAgentRuntime (type "voxa.voice"), synthesizes the text reply (Nova TTS
// providers), and returns the audio for LOCAL browser playback.
//
// This NEVER touches LiveKit, never streams room audio, never sends a room
// transcript, and never auto-listens. It is strictly user-initiated. Every
// request re-validates flag + ownership + approval + verification + room
// membership + agent-in-room + the admin-only room_voice_beta permission.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!externalAgentVoiceEnabled()) {
    return jsonError("External agent voice beta is not enabled.", 403, "voice_disabled");
  }

  const limit = checkRateLimit(`room-voice:${auth.user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many voice turns. Try again in ${limit.retryAfterSeconds}s.`,
        code: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Expected multipart form data.", 400, "invalid_form");
  }

  const roomId = String(form.get("roomId") ?? "").trim();
  const agentId = String(form.get("agentId") ?? "").trim();
  const audio = form.get("audio");

  if (!roomId) {
    return jsonError("A roomId is required.", 400, "invalid_room_id");
  }
  if (!agentId) {
    return jsonError("An agentId is required.", 400, "invalid_agent_id");
  }
  if (!(audio instanceof Blob) || audio.size === 0) {
    return jsonError("A non-empty audio clip is required.", 400, "invalid_audio");
  }

  // Ownership + approval + verification + endpoint.
  const validation = await validateRoomTextAgent(auth.supabase, auth.user.id, agentId);
  if (!validation.ok) {
    return jsonError(validation.message, validation.status, validation.code);
  }

  // Admin-only voice-beta permission gate.
  const permissions = resolveEffectivePermissions(validation.agent.permissions);
  if (!hasPermission(permissions, "room_voice_beta")) {
    return jsonError(
      "This agent is not enrolled in the private voice beta.",
      403,
      "voice_not_granted",
    );
  }

  const service = getServiceRoleClient();
  if (!service) {
    return jsonError(
      "Voice beta is not configured (missing service role).",
      500,
      "service_not_configured",
    );
  }

  const [isMember, agentPresent] = await Promise.all([
    isHumanRoomMember(service, roomId, auth.user.id),
    isExternalAgentInRoom(service, roomId, validation.agent.id),
  ]);
  if (!isMember) {
    return jsonError("You must be in the room to talk to an agent.", 403, "not_room_member");
  }
  if (!agentPresent) {
    return jsonError("This agent is not in the room.", 409, "agent_not_in_room");
  }

  // STT — transcribe the captured clip. No room audio, only this user's clip.
  let transcript = "";
  try {
    transcript = (await transcribeWithDeepgram(audio)).trim();
  } catch {
    return jsonError("Could not transcribe the audio.", 502, "stt_failed");
  }
  if (!transcript) {
    return jsonError("No speech detected. Try again.", 422, "no_speech");
  }

  // memory_read_thread gates loading prior context (same per-agent thread).
  const history = hasPermission(permissions, "memory_read_thread")
    ? await loadExternalAgentThread(service, roomId, validation.agent.id)
    : [];

  const reply = await voiceAgentRuntime.sendMessageToAgent({
    endpointUrl: validation.agent.endpoint_url!,
    message: transcript,
    context: {
      roomId,
      agentId: validation.agent.id,
      history: history.map((turn) => ({ role: turn.role, text: turn.text })),
    },
  });

  if (!reply.ok) {
    return jsonError(reply.detail, 502, reply.code);
  }

  // memory_write_thread gates persistence (same thread model as text/voice).
  if (hasPermission(permissions, "memory_write_thread")) {
    await recordExternalAgentExchange(service, {
      roomId,
      agentId: validation.agent.id,
      userText: transcript,
      replyText: reply.text,
    });
  }

  // TTS — synthesize the text reply for LOCAL playback. Always uses the configured
  // default Nova TTS voice for now (any agent-supplied voice preference is ignored).
  let audioBase64: string | null = null;
  let audioContentType: string | null = null;
  try {
    const synthesized = await synthesizeNovaSpeech(reply.text);
    if (synthesized) {
      audioBase64 = synthesized.audio.toString("base64");
      audioContentType = synthesized.contentType;
    }
  } catch {
    audioBase64 = null;
  }

  return NextResponse.json({
    transcript,
    reply: { text: reply.text },
    agent: { id: validation.agent.id, name: validation.agent.name },
    audio: audioBase64,
    audioContentType,
    audioUnavailable: audioBase64 === null,
  });
}
