"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { Mic, MicOff, Radio, Volume2 } from "lucide-react";
import { BetaButton } from "@/components/BetaChrome";
import { getSupabaseClient } from "@/lib/supabase";
import { getNovaListenWindowMs, MicStateController } from "@/lib/voice-activation";

type RoomVoiceProps = {
  roomId: string;
  enabled: boolean;
  onNovaStateChange?: (state: VoiceParticipantState["agentState"]) => void;
  onVoiceParticipantsChange?: (participants: VoiceParticipantState[]) => void;
};

type VoiceToken = {
  token: string;
  url: string;
};

export type VoiceParticipantState = {
  id: string;
  name: string;
  agentState?: "idle" | "initializing" | "listening" | "thinking" | "speaking";
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  isConnected: boolean;
};

function normalizeLiveKitIdentity(identity: string) {
  return identity.startsWith("agent:") ? identity.slice("agent:".length) : identity;
}

function formatConnectionState(state: ConnectionState) {
  if (state === ConnectionState.Connected) {
    return "Voice connected";
  }

  if (state === ConnectionState.Connecting || state === ConnectionState.Reconnecting) {
    return "Connecting voice";
  }

  return "Voice idle";
}

function VoiceSession({
  onNovaStateChange,
  onVoiceParticipantsChange,
  roomId,
}: {
  onNovaStateChange?: (state: VoiceParticipantState["agentState"]) => void;
  onVoiceParticipantsChange?: (participants: VoiceParticipantState[]) => void;
  roomId: string;
}) {
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const micPrimedRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const [isUpdatingMic, setIsUpdatingMic] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [activationState, setActivationState] = useState<
    "sleeping" | "listening" | "thinking" | "speaking"
  >("sleeping");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const connected = connectionState === ConnectionState.Connected;

  const participantRows = useMemo(
    () =>
      participants.map((participant) => {
        const micPublication = participant.getTrackPublication(Track.Source.Microphone);
        return {
          id: normalizeLiveKitIdentity(participant.identity),
          name: participant.name || participant.identity,
          agentState: participant.attributes["lk.agent.state"] as
            | VoiceParticipantState["agentState"]
            | undefined,
          isLocal: participant.isLocal,
          isMuted: participant.isLocal ? !isMicrophoneEnabled : (micPublication?.isMuted ?? true),
          isSpeaking: participant.isSpeaking,
          isConnected: true,
        };
      }),
    [isMicrophoneEnabled, participants],
  );

  useEffect(() => {
    onVoiceParticipantsChange?.(participantRows);
  }, [onVoiceParticipantsChange, participantRows]);

  useEffect(() => {
    if (!connected || !localParticipant || micPrimedRef.current) {
      return;
    }

    let isActive = true;
    micPrimedRef.current = true;

    async function setupActivation() {
      setMicError(null);

      try {
        const mic = new MicStateController(localParticipant);
        await mic.primeMutedTrack();

        if (!isActive) {
          await mic.mute().catch(() => undefined);
          return;
        }

        await mic.mute();
        setActivationState("sleeping");
      } catch (error) {
        if (!isActive) {
          return;
        }

        const permissionDenied =
          error instanceof Error && /permission|denied|notallowed/i.test(error.message);
        setMicError(
          permissionDenied
            ? "Permission denied. Allow microphone access to use Nova wake activation."
            : error instanceof Error
              ? error.message
              : "Unable to prepare Nova wake activation.",
        );
      }
    }

    void setupActivation();

    return () => {
      isActive = false;
      stopRecorder();
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
      void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    };
  }, [connected, localParticipant]);

  useEffect(() => {
    if (activationState !== "listening") {
      return;
    }

    const updateRemaining = () => {
      const remainingMs = Math.max(0, (recordingEndsAtRef.current ?? 0) - Date.now());
      setRemainingSeconds(Math.ceil(remainingMs / 1000));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activationState]);

  const recordingEndsAtRef = useRef<number | null>(null);

  function clearStopTimer() {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }

  function stopRecorder() {
    clearStopTimer();
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function sendNovaAudio(audio: Blob) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      throw new Error("Nova needs Supabase auth to be configured.");
    }

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("Sign in again to talk to Nova.");
    }

    const formData = new FormData();
    formData.set("roomId", roomId);
    formData.set("audio", audio, `nova-${Date.now()}.webm`);

    const response = await fetch("/api/agents/nova/respond", {
      body: formData,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      method: "POST",
    });
    const payload = (await response.json()) as {
      audioContentType?: string;
      error?: string;
      playback?: "livekit";
      playbackDurationMs?: number;
      responseText?: string;
      transcript?: string;
    };

    if (!response.ok || payload.playback !== "livekit") {
      throw new Error(payload.error || "Nova could not respond.");
    }

    return payload;
  }

  async function startNovaRecording() {
    const listenWindowMs = getNovaListenWindowMs();
    const stream =
      audioStreamRef.current ??
      (await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      }));
    audioStreamRef.current = stream;

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });
    const chunks: Blob[] = [];
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      clearStopTimer();
      setRemainingSeconds(0);
      mediaRecorderRef.current = null;

      const audio = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });

      if (audio.size === 0) {
        setActivationState("sleeping");
        onNovaStateChange?.("idle");
        setMicError("Nova did not capture any audio.");
        return;
      }

      setActivationState("thinking");
      onNovaStateChange?.("thinking");
      void sendNovaAudio(audio)
        .then(() => {
          setActivationState("sleeping");
          onNovaStateChange?.("idle");
        })
        .catch((error) => {
          setActivationState("sleeping");
          onNovaStateChange?.("idle");
          setMicError(error instanceof Error ? error.message : "Nova could not respond.");
        });
    };

    recorder.start();
    recordingEndsAtRef.current = Date.now() + listenWindowMs;
    setActivationState("listening");
    onNovaStateChange?.("listening");
    stopTimerRef.current = window.setTimeout(() => {
      stopRecorder();
    }, listenWindowMs);
  }

  const handleActivateNova = async () => {
    setIsUpdatingMic(true);
    setMicError(null);

    try {
      if (activationState === "listening") {
        stopRecorder();
      } else {
        await startNovaRecording();
      }
    } catch (error) {
      const permissionDenied =
        error instanceof Error && /permission|denied|notallowed/i.test(error.message);
      setMicError(
        permissionDenied
          ? "Microphone permission was denied. Allow mic access in your browser and try again."
          : "Unable to update your microphone. Try again.",
      );
    } finally {
      setIsUpdatingMic(false);
    }
  };

  const activationLabel =
    activationState === "listening"
      ? `Listening for ${remainingSeconds || Math.ceil(getNovaListenWindowMs() / 1000)}s`
      : activationState === "thinking"
        ? "Thinking"
        : activationState === "speaking"
          ? "Speaking"
          : "Sleeping";

  return (
    <>
      <RoomAudioRenderer />
      <div className="flex flex-wrap items-center gap-2">
        <span className="beta-status-pill">
          <Radio className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
          {formatConnectionState(connectionState)}
        </span>
        <span className="beta-status-pill">
          {isMicrophoneEnabled ? (
            <Mic className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
          )}
          {activationLabel}
        </span>
        <BetaButton
          className="min-h-9 px-3 text-xs"
          disabled={!connected || isUpdatingMic}
          onClick={handleActivateNova}
          variant={isMicrophoneEnabled ? "glass" : "quiet"}
        >
          {activationState === "listening" || activationState === "speaking" ? (
            <Mic className="h-4 w-4" />
          ) : (
            <MicOff className="h-4 w-4" />
          )}
          {activationState === "listening" || activationState === "speaking"
            ? "Stop"
            : "Talk to Nova"}
        </BetaButton>
        {micError && (
          <span className="text-xs text-[oklch(0.78_0.18_35)]">
            {micError}
          </span>
        )}
      </div>
    </>
  );
}

export default function RoomVoice({
  roomId,
  enabled,
  onNovaStateChange,
  onVoiceParticipantsChange,
}: RoomVoiceProps) {
  const [voiceToken, setVoiceToken] = useState<VoiceToken | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setVoiceToken(null);
      onVoiceParticipantsChange?.([]);
      return;
    }

    let isActive = true;

    async function loadVoiceToken() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setError("Voice needs Supabase auth to be configured.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
          throw new Error("Sign in again to join voice.");
        }

        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId }),
        });

        const payload = (await response.json()) as Partial<VoiceToken> & { error?: string };

        if (!response.ok || !payload.token || !payload.url) {
          throw new Error(payload.error || "Unable to start voice.");
        }

        if (isActive) {
          setVoiceToken({ token: payload.token, url: payload.url });
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Unable to start voice.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadVoiceToken();

    return () => {
      isActive = false;
    };
  }, [enabled, onVoiceParticipantsChange, retryCount, roomId]);

  if (!enabled) {
    return null;
  }

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[oklch(0.78_0.18_35)]">{error}</span>
        <BetaButton
          className="min-h-9 px-3 text-xs"
          onClick={() => {
            setVoiceToken(null);
            setError(null);
            setRetryCount((count) => count + 1);
          }}
          variant="glass"
        >
          Try voice again
        </BetaButton>
      </div>
    );
  }

  if (isLoading || !voiceToken) {
    return (
      <div className="beta-status-pill">
        <Radio className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
        Preparing voice
      </div>
    );
  }

  return (
    <LiveKitRoom
      audio={false}
      connect
      onError={(livekitError) => {
        setError(livekitError.message || "Voice connection failed.");
      }}
      onMediaDeviceFailure={() => {
        setError("Microphone permission was denied. Allow mic access in your browser and try again.");
      }}
      serverUrl={voiceToken.url}
      token={voiceToken.token}
      video={false}
    >
      <VoiceSession
        onNovaStateChange={onNovaStateChange}
        onVoiceParticipantsChange={onVoiceParticipantsChange}
        roomId={roomId}
      />
    </LiveKitRoom>
  );
}
