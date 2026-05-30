import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  NovaProviderError,
  sanitizeErrorMessage,
  toNovaProviderError,
} from "@/lib/server/nova/errors";
import { publishNovaAudioToLiveKitRoom } from "@/lib/server/nova/livekit-publisher";
import { generateNovaResponse } from "@/lib/server/nova/providers/llm/gemini";
import { transcribeWithDeepgram } from "@/lib/server/nova/providers/stt/deepgram";
import { synthesizeNovaSpeech } from "@/lib/server/nova/providers/tts";

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

function logNovaStep(
  step: string,
  status: "success" | "failure",
  details?: {
    error?: unknown;
    provider?: string;
    httpStatus?: number;
    meta?: Record<string, unknown>;
  },
) {
  const provider = details?.provider ?? "voxa";
  const payload = {
    httpStatus: details?.httpStatus,
    meta: details?.meta,
    provider,
    status,
    step,
    ...(details?.error ? { error: sanitizeErrorMessage(details.error) } : {}),
  };

  if (status === "failure") {
    console.error("nova.respond.step", payload);
    return;
  }

  console.info("nova.respond.step", payload);
}

function providerJsonError(error: NovaProviderError, status = 502) {
  return NextResponse.json(
    {
      details: error.details,
      error: error.code,
      provider: error.provider,
      status: error.status,
    },
    { status },
  );
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
    logNovaStep("auth_verification", "failure", {
      error: "Missing Supabase bearer token.",
      provider: "supabase",
      httpStatus: 401,
    });
    return jsonError("Sign in before talking to Nova.", 401);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
    logNovaStep("audio_blob_parsing", "success", { provider: "browser" });
  } catch (error) {
    logNovaStep("audio_blob_parsing", "failure", {
      error,
      provider: "browser",
      httpStatus: 400,
    });
    return jsonError("Invalid Nova request.", 400);
  }

  const roomIdValue = formData.get("roomId");
  const audioValue = formData.get("audio");
  const roomId = typeof roomIdValue === "string" ? roomIdValue.trim() : "";

  if (!roomIdPattern.test(roomId)) {
    logNovaStep("room_validation", "failure", {
      error: "Invalid room id format.",
      httpStatus: 400,
    });
    return jsonError("Invalid room id.", 400);
  }

  if (!(audioValue instanceof Blob) || audioValue.size === 0) {
    logNovaStep("audio_blob_parsing", "failure", {
      error: "Missing or empty audio blob.",
      provider: "browser",
      httpStatus: 400,
    });
    return jsonError("Nova needs recorded audio.", 400);
  }

  logNovaStep("audio_blob_parsing", "success", {
    provider: "browser",
    meta: { audioSize: audioValue.size, audioType: audioValue.type || "unknown", roomId },
  });

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
    logNovaStep("auth_verification", "failure", {
      error: userError ?? "No Supabase user returned.",
      provider: "supabase",
      httpStatus: 401,
    });
    return jsonError("Your session expired. Sign in again.", 401);
  }

  logNovaStep("auth_verification", "success", {
    provider: "supabase",
    meta: { userId: user.id },
  });

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
    logNovaStep("room_validation", "failure", {
      error: roomResult.error ?? humanParticipantResult.error ?? novaParticipantResult.error,
      provider: "supabase",
      httpStatus: 500,
    });
    return jsonError("Nova could not verify room access.", 500);
  }

  if (!roomResult.data) {
    logNovaStep("room_validation", "failure", {
      error: "Room not found.",
      provider: "supabase",
      httpStatus: 404,
    });
    return jsonError("Room not found.", 404);
  }

  if (roomResult.data.status === "ended") {
    logNovaStep("room_validation", "failure", {
      error: "Room ended.",
      provider: "supabase",
      httpStatus: 409,
    });
    return jsonError("This room has ended.", 409);
  }

  if ((humanParticipantResult.data?.length ?? 0) === 0) {
    logNovaStep("room_validation", "failure", {
      error: "Current user is not a human participant in this room.",
      provider: "supabase",
      httpStatus: 403,
    });
    return jsonError("Join this room before talking to Nova.", 403);
  }

  if ((novaParticipantResult.data?.length ?? 0) === 0) {
    logNovaStep("room_validation", "failure", {
      error: "Nova is not in this room.",
      provider: "supabase",
      httpStatus: 409,
    });
    return jsonError("Invite Nova before talking to her.", 409);
  }

  logNovaStep("room_validation", "success", {
    provider: "supabase",
    meta: { roomId },
  });

  try {
    let transcript = "";
    let responseText = "";

    logNovaStep("deepgram_stt", "success", {
      provider: "deepgram",
      meta: { phase: "start" },
    });
    try {
      transcript = await transcribeWithDeepgram(audioValue);
    } catch (error) {
      const sttError = toNovaProviderError(error, {
        code: "transcription_failed",
        provider: "deepgram",
      });
      logNovaStep("deepgram_stt", "failure", {
        error: sttError.details,
        provider: sttError.provider,
        httpStatus: sttError.status,
      });
      return providerJsonError(sttError);
    }
    logNovaStep("deepgram_stt", "success", {
      provider: "deepgram",
      meta: { transcriptLength: transcript.length },
    });

    logNovaStep("gemini_request", "success", {
      provider: "gemini",
      meta: { phase: "start" },
    });
    try {
      responseText = await generateNovaResponse(transcript);
    } catch (error) {
      const reasoningError = toNovaProviderError(error, {
        code: "reasoning_failed",
        provider: "gemini",
      });
      logNovaStep("gemini_request", "failure", {
        error: reasoningError.details,
        provider: reasoningError.provider,
        httpStatus: reasoningError.status,
      });
      return providerJsonError(reasoningError);
    }
    logNovaStep("gemini_request", "success", {
      provider: "gemini",
      meta: { responseLength: responseText.length },
    });

    let synthesized: {
      audio: Buffer;
      contentType: string;
      provider: string;
      voice: string;
    } | null = null;

    try {
      logNovaStep("tts_request", "success", {
        provider: process.env.NOVA_TTS_PROVIDER || "edge",
        meta: { phase: "start" },
      });
      synthesized = await synthesizeNovaSpeech(responseText);
      logNovaStep("tts_request", "success", {
        provider: synthesized?.provider ?? "none",
        meta: synthesized
          ? { audioBytes: synthesized.audio.length, voice: synthesized.voice }
          : { audioUnavailable: true },
      });
    } catch (error) {
      const ttsError = toNovaProviderError(error, {
        code: "tts_failed",
        provider: process.env.NOVA_TTS_PROVIDER || "edge",
      });
      logNovaStep("tts_request", "failure", {
        error: ttsError.details,
        provider: ttsError.provider,
        httpStatus: ttsError.status,
      });

      return NextResponse.json({
        audioUnavailable: true,
        details: ttsError.details,
        error: "tts_failed",
        provider: ttsError.provider,
        responseText,
        text: responseText,
        transcript,
      });
    }

    if (!synthesized) {
      logNovaStep("final_response_return", "success", {
        provider: "none",
        meta: { audioUnavailable: true },
      });
      return NextResponse.json({
        audioUnavailable: true,
        playback: "none",
        responseText,
        text: responseText,
        transcript,
      });
    }

    let playback: { durationMs: number; sampleRate: number };

    try {
      logNovaStep("livekit_playback", "success", {
        provider: "livekit",
        meta: { phase: "start" },
      });
      playback = await publishNovaAudioToLiveKitRoom({
        audio: synthesized.audio,
        roomId,
      });
      logNovaStep("livekit_playback", "success", {
        provider: "livekit",
        meta: playback,
      });
    } catch (error) {
      const playbackError = toNovaProviderError(error, {
        code: "playback_failed",
        provider: "livekit",
      });
      logNovaStep("livekit_playback", "failure", {
        error: playbackError.details,
        provider: playbackError.provider,
        httpStatus: playbackError.status,
      });

      return providerJsonError(playbackError);
    }

    await supabase.from("room_events").insert({
      message: "Nova responded.",
      room_id: roomId,
      type: "agent",
      user_id: "nova",
    });

    return NextResponse.json({
      audioContentType: synthesized.contentType,
      playback: "livekit",
      playbackDurationMs: playback.durationMs,
      responseText,
      transcript,
      ttsProvider: synthesized.provider,
      ttsVoice: synthesized.voice,
    });
  } catch (error) {
    const providerError = toNovaProviderError(error, {
      code: "transcription_failed",
      provider: "nova",
    });
    logNovaStep(providerError.code, "failure", {
      error: providerError.details,
      provider: providerError.provider,
      httpStatus: providerError.status,
    });
    return providerJsonError(providerError);
  }
}
