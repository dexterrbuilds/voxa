import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { publishNovaAudioToLiveKitRoom } from "@/lib/server/nova/livekit-publisher";
import { runNovaPipeline } from "@/lib/server/nova/pipeline";

export const runtime = "nodejs";

const roomIdPattern = /^[a-zA-Z0-9_-]{6,80}$/;

function normalizeSupabaseUrl(url: string) {
  return url
    .trim()
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Authentication is not configured yet.", 500);
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!accessToken) {
    return jsonError("Sign in before talking to Nova.", 401);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Invalid Nova request.", 400);
  }

  const roomIdValue = formData.get("roomId");
  const audioValue = formData.get("audio");
  const roomId = typeof roomIdValue === "string" ? roomIdValue.trim() : "";

  if (!roomIdPattern.test(roomId)) {
    return jsonError("Invalid room id.", 400);
  }

  if (!(audioValue instanceof Blob) || audioValue.size === 0) {
    return jsonError("Nova needs recorded audio.", 400);
  }

  const supabase = createClient(normalizeSupabaseUrl(supabaseUrl), supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return jsonError("Your session expired. Sign in again.", 401);
  }

  const [roomResult, humanParticipantResult, novaParticipantResult] = await Promise.all([
    supabase.from("rooms").select("room_id, status").eq("room_id", roomId).maybeSingle(),
    supabase
      .from("room_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .eq("participant_type", "human")
      .limit(1),
    supabase
      .from("room_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", "nova")
      .eq("participant_type", "agent")
      .limit(1),
  ]);

  if (roomResult.error || humanParticipantResult.error || novaParticipantResult.error) {
    return jsonError("Nova could not verify room access.", 500);
  }

  if (!roomResult.data) {
    return jsonError("Room not found.", 404);
  }

  if (roomResult.data.status === "ended") {
    return jsonError("This room has ended.", 409);
  }

  if ((humanParticipantResult.data?.length ?? 0) === 0) {
    return jsonError("Join this room before talking to Nova.", 403);
  }

  if ((novaParticipantResult.data?.length ?? 0) === 0) {
    return jsonError("Invite Nova before talking to her.", 409);
  }

  try {
    const result = await runNovaPipeline(audioValue);
    const playback = await publishNovaAudioToLiveKitRoom({
      audio: result.audio,
      roomId,
    });

    await supabase.from("room_events").insert({
      message: "Nova responded.",
      room_id: roomId,
      type: "agent",
      user_id: "nova",
    });

    return NextResponse.json({
      audioContentType: result.audioContentType,
      playback: "livekit",
      playbackDurationMs: playback.durationMs,
      responseText: result.responseText,
      transcript: result.transcript,
      ttsProvider: result.ttsProvider,
      ttsVoice: result.ttsVoice,
    });
  } catch (error) {
    console.error("Nova response pipeline failed.", error);
    return jsonError(error instanceof Error ? error.message : "Nova could not respond.", 502);
  }
}
