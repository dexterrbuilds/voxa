"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getNovaListenWindowMs } from "@/lib/voice-activation";

export type NovaState = "in_room" | "listening" | "thinking" | "speaking" | "error";

type RoomVoiceProps = {
  roomId: string;
  enabled: boolean;
  onNovaStateChange?: (state: NovaState) => void;
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
  if (identity === "agent:nova" || identity.startsWith("agent:nova:")) {
    return "nova";
  }

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

function getSupportedRecordingMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function VoiceSession({
  onNovaStateChange,
  onVoiceParticipantsChange,
  roomId,
}: {
  onNovaStateChange?: (state: NovaState) => void;
  onVoiceParticipantsChange?: (participants: VoiceParticipantState[]) => void;
  roomId: string;
}) {
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const onNovaStateChangeRef = useRef(onNovaStateChange);
  const micInitializedRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const recordingEndsAtRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const captureIdRef = useRef(0);
  const novaStateRef = useRef<NovaState>("in_room");
  const isSendingNovaRef = useRef(false);
  const [isUpdatingRoomMic, setIsUpdatingRoomMic] = useState(false);
  const [isUpdatingNova, setIsUpdatingNova] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [novaState, setNovaState] = useState<NovaState>("in_room");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const connected = connectionState === ConnectionState.Connected;

  useEffect(() => {
    onNovaStateChangeRef.current = onNovaStateChange;
  }, [onNovaStateChange]);

  const transitionNova = useCallback((nextState: NovaState) => {
    novaStateRef.current = nextState;
    setNovaState(nextState);
    onNovaStateChangeRef.current?.(nextState);
  }, []);

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

  function clearStopTimer() {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }

  function cleanupNovaStream() {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }

  function cancelNovaCapture(updateUi = true) {
    clearStopTimer();
    captureIdRef.current += 1;

    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    recorder?.stream.getTracks().forEach((track) => track.stop());

    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.stop();
    }

    cleanupNovaStream();
    isSendingNovaRef.current = false;

    if (updateUi) {
      setRemainingSeconds(0);
      setIsUpdatingNova(false);
    }
  }

  function stopNovaRecording() {
    clearStopTimer();
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.requestData();
      } catch {
        // Some browsers throw if a chunk is already being flushed.
      }

      window.setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, 120);
    }
  }

  useEffect(() => {
    if (!connected || !localParticipant || micInitializedRef.current) {
      return;
    }

    micInitializedRef.current = true;
    void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);

    return () => {
      cancelNovaCapture(false);
      void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, localParticipant]);

  useEffect(() => {
    const novaVoice = participantRows.find((participant) => participant.id === "nova");

    if (novaVoice?.isSpeaking) {
      transitionNova("speaking");
      return;
    }

    if (novaStateRef.current === "speaking" && !isSendingNovaRef.current) {
      transitionNova("in_room");
    }
  }, [participantRows, transitionNova]);

  useEffect(() => {
    if (novaState !== "listening") {
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
  }, [novaState]);

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
      audioUnavailable?: boolean;
      details?: string;
      audioContentType?: string;
      error?: string;
      playback?: "livekit";
      playbackDurationMs?: number;
      responseText?: string;
      transcript?: string;
    };

    if (payload.audioUnavailable && payload.responseText) {
      throw new Error(
        `Nova replied, but voice playback is unavailable: "${payload.responseText}"${
          payload.details ? ` (${payload.details})` : ""
        }`,
      );
    }

    if (!response.ok || payload.playback !== "livekit") {
      throw new Error(payload.details || payload.error || "Nova could not respond.");
    }

    return payload;
  }

  async function startNovaRecording() {
    if (novaStateRef.current === "listening" || isSendingNovaRef.current) {
      return;
    }

    const listenWindowMs = getNovaListenWindowMs();
    const captureId = captureIdRef.current + 1;
    captureIdRef.current = captureId;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    audioStreamRef.current = stream;

    const mimeType = getSupportedRecordingMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => {
      if (captureIdRef.current !== captureId) {
        return;
      }

      clearStopTimer();
      cleanupNovaStream();
      setRemainingSeconds(0);
      mediaRecorderRef.current = null;
      isSendingNovaRef.current = false;
      setIsUpdatingNova(false);
      transitionNova("error");
      setMicError("Nova recording failed. Try again.");
    };

    recorder.onstop = () => {
      if (captureIdRef.current !== captureId) {
        return;
      }

      clearStopTimer();
      setRemainingSeconds(0);
      mediaRecorderRef.current = null;
      cleanupNovaStream();

      const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });

      if (audio.size === 0) {
        console.warn("Nova recorder produced an empty audio blob.", {
          chunkCount: chunks.length,
          mimeType: recorder.mimeType || mimeType || "browser-default",
          recordedMs: recordingStartedAtRef.current
            ? Date.now() - recordingStartedAtRef.current
            : 0,
        });
        isSendingNovaRef.current = false;
        setIsUpdatingNova(false);
        transitionNova("error");
        setMicError(
          "Nova did not capture audio. Try again and speak after the Listening state appears.",
        );
        return;
      }

      isSendingNovaRef.current = true;
      setIsUpdatingNova(true);
      transitionNova("thinking");
      void sendNovaAudio(audio)
        .then(() => {
          isSendingNovaRef.current = false;
          setIsUpdatingNova(false);
          transitionNova("in_room");
        })
        .catch((error) => {
          isSendingNovaRef.current = false;
          setIsUpdatingNova(false);
          transitionNova("error");
          setMicError(error instanceof Error ? error.message : "Nova could not respond.");
        });
    };

    recorder.start(250);
    recordingStartedAtRef.current = Date.now();
    recordingEndsAtRef.current = Date.now() + listenWindowMs;
    setIsUpdatingNova(false);
    setMicError(null);
    transitionNova("listening");
    stopTimerRef.current = window.setTimeout(() => {
      stopNovaRecording();
    }, listenWindowMs);
  }

  const handleToggleRoomMic = async () => {
    if (!localParticipant) {
      return;
    }

    setIsUpdatingRoomMic(true);
    setMicError(null);

    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (error) {
      const permissionDenied =
        error instanceof Error && /permission|denied|notallowed/i.test(error.message);
      setMicError(
        permissionDenied
          ? "Microphone permission was denied. Allow mic access in your browser and try again."
          : "Unable to update your room microphone. Try again.",
      );
    } finally {
      setIsUpdatingRoomMic(false);
    }
  };

  const handleActivateNova = async () => {
    setMicError(null);

    try {
      if (novaState === "listening") {
        stopNovaRecording();
      } else if (novaState === "in_room" || novaState === "error") {
        setIsUpdatingNova(true);
        await startNovaRecording();
      }
    } catch (error) {
      setIsUpdatingNova(false);
      transitionNova("error");
      const permissionDenied =
        error instanceof Error && /permission|denied|notallowed/i.test(error.message);
      setMicError(
        permissionDenied
          ? "Microphone permission was denied. Allow mic access in your browser and try again."
          : "Unable to start Nova capture. Try again.",
      );
    }
  };

  const novaLabel =
    novaState === "listening"
      ? `Listening for ${remainingSeconds || Math.ceil(getNovaListenWindowMs() / 1000)}s`
      : novaState === "thinking"
        ? "Thinking"
        : novaState === "speaking"
          ? "Speaking"
          : novaState === "error"
            ? "Error"
            : "In Room";
  const novaButtonLabel =
    novaState === "listening" ? "Stop" : novaState === "error" ? "Retry" : "Talk to Nova";
  const novaButtonDisabled =
    !connected || isUpdatingNova || novaState === "thinking" || novaState === "speaking";

  return (
    <>
      <RoomAudioRenderer />
      <div className="w-full rounded-2xl border border-white/[0.075] bg-[oklch(0.1_0.014_260/0.82)] p-3 shadow-[0_24px_80px_-52px_oklch(0.72_0.2_245/0.75)] backdrop-blur-2xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="beta-status-pill">
            <Radio className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
            {formatConnectionState(connectionState)}
          </span>
          <span className="beta-status-pill">
            {isMicrophoneEnabled ? (
              <Mic className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
            ) : (
              <MicOff className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
            )}
            {isMicrophoneEnabled ? "Mic live" : "Mic muted"}
          </span>
          <span className="beta-status-pill">
            <Volume2 className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
            Nova {novaLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <BetaButton
            className="min-h-12 px-3 text-sm"
            disabled={novaButtonDisabled}
            onClick={handleActivateNova}
            variant={novaState === "listening" ? "glass" : "electric"}
          >
            {novaState === "listening" ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
            {novaButtonLabel}
          </BetaButton>
          <BetaButton
            className="min-h-12 px-3 text-sm"
            disabled={!connected || isUpdatingRoomMic}
            onClick={handleToggleRoomMic}
            variant={isMicrophoneEnabled ? "glass" : "quiet"}
          >
            {isMicrophoneEnabled ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {isMicrophoneEnabled ? "Mute" : "Unmute"}
          </BetaButton>
        </div>
        {micError && (
          <p className="mt-3 text-xs leading-relaxed text-[oklch(0.78_0.18_35)]">{micError}</p>
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
        setError(
          "Microphone permission was denied. Allow mic access in your browser and try again.",
        );
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
