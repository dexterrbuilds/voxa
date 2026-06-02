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
import { Mic, MicOff, Radio, ShieldCheck, Volume2 } from "lucide-react";
import { BetaButton } from "@/components/BetaChrome";
import { getSupabaseClient } from "@/lib/supabase";
import {
  getNovaMaxRecordingMs,
  getNovaSilenceThreshold,
  getNovaSilenceTimeoutMs,
} from "@/lib/voice-activation";
import { useWakeWord } from "@/lib/wake-word/useWakeWord";

export type NovaState = "in_room" | "listening" | "thinking" | "speaking" | "error";

type RoomVoiceProps = {
  roomId: string;
  enabled: boolean;
  novaInRoom: boolean;
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
  novaInRoom,
  onNovaStateChange,
  onVoiceParticipantsChange,
  roomId,
}: {
  novaInRoom: boolean;
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceRafRef = useRef<number | null>(null);
  const maxRecordingTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const captureIdRef = useRef(0);
  const novaStateRef = useRef<NovaState>("in_room");
  const isSendingNovaRef = useRef(false);
  const wakeReadyRef = useRef(false);
  const [isUpdatingRoomMic, setIsUpdatingRoomMic] = useState(false);
  const [isUpdatingNova, setIsUpdatingNova] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [novaState, setNovaState] = useState<NovaState>("in_room");
  const [novaNotice, setNovaNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const connected = connectionState === ConnectionState.Connected;

  useEffect(() => {
    onNovaStateChangeRef.current = onNovaStateChange;
  }, [onNovaStateChange]);

  const transitionNova = useCallback((nextState: NovaState) => {
    novaStateRef.current = nextState;
    setNovaState(nextState);
    onNovaStateChangeRef.current?.(nextState);
  }, []);

  // Idle = "In Room". Nova stays "In Room" while the wake worker is armed locally;
  // she only becomes "Listening" once the wake phrase fires and she is recording.
  const resolveIdleState = useCallback((): NovaState => "in_room", []);

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

  function stopSilenceDetection() {
    if (silenceRafRef.current) {
      window.cancelAnimationFrame(silenceRafRef.current);
      silenceRafRef.current = null;
    }
    if (maxRecordingTimerRef.current) {
      window.clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }

  function cleanupNovaStream() {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }

  function cancelNovaCapture(updateUi = true) {
    stopSilenceDetection();
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
      setIsUpdatingNova(false);
    }
  }

  function stopNovaRecording() {
    stopSilenceDetection();
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

    // One-time default: join muted so nobody broadcasts on entry. After this,
    // the room mic stays in whatever state the user chooses — we never auto-mute
    // it again (e.g. after a Nova turn). Nova capture uses its OWN getUserMedia
    // stream and never touches the LiveKit room mic.
    micInitializedRef.current = true;
    void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);

    return () => {
      // Only release any in-flight Nova capture; do NOT mute the room mic here,
      // otherwise the user's chosen mic state would be overridden on teardown.
      cancelNovaCapture(false);
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
      transitionNova(resolveIdleState());
    }
  }, [participantRows, resolveIdleState, transitionNova]);

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

  // Watch the live mic level and stop the recorder once the speaker has gone
  // quiet for `silenceTimeoutMs`, or once `maxRecordingMs` elapses (hard cap).
  function startSilenceDetection(stream: MediaStream, captureId: number) {
    const silenceTimeoutMs = getNovaSilenceTimeoutMs();
    const maxRecordingMs = getNovaMaxRecordingMs();
    const silenceThreshold = getNovaSilenceThreshold();

    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    // Always enforce the hard ceiling even if Web Audio is unavailable.
    maxRecordingTimerRef.current = window.setTimeout(() => {
      stopNovaRecording();
    }, maxRecordingMs);

    if (!AudioContextCtor) {
      return;
    }

    let audioContext: AudioContext;
    try {
      audioContext = new AudioContextCtor();
    } catch {
      return;
    }
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const samples = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();
    let lastSoundAt = startedAt;
    let hasSpoken = false;

    const tick = () => {
      if (captureIdRef.current !== captureId || !audioContextRef.current) {
        return;
      }

      analyser.getFloatTimeDomainData(samples);
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i += 1) {
        sumSquares += samples[i] * samples[i];
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const now = Date.now();

      if (rms >= silenceThreshold) {
        lastSoundAt = now;
        hasSpoken = true;
      }

      // Only treat sustained quiet as "done" after the user has actually spoken,
      // so a short pause before the prompt does not cut the capture short.
      if (hasSpoken && now - lastSoundAt >= silenceTimeoutMs) {
        stopNovaRecording();
        return;
      }

      silenceRafRef.current = window.requestAnimationFrame(tick);
    };

    silenceRafRef.current = window.requestAnimationFrame(tick);
  }

  async function startNovaRecording() {
    if (novaStateRef.current === "listening" || isSendingNovaRef.current) {
      return;
    }

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

      stopSilenceDetection();
      cleanupNovaStream();
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

      stopSilenceDetection();
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
        transitionNova(resolveIdleState());
        setMicError('Nova did not catch that. Say "Hey Nova" again or tap Talk to Nova.');
        return;
      }

      isSendingNovaRef.current = true;
      setIsUpdatingNova(true);
      transitionNova("thinking");
      void sendNovaAudio(audio)
        .then(() => {
          isSendingNovaRef.current = false;
          setIsUpdatingNova(false);
          transitionNova(resolveIdleState());
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
    setIsUpdatingNova(false);
    setMicError(null);
    transitionNova("listening");
    startSilenceDetection(stream, captureId);
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

  const showNotice = useCallback((message: string) => {
    setNovaNotice(message);
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNovaNotice(null);
    }, 4000);
  }, []);

  async function beginNovaCapture() {
    setMicError(null);
    setNovaNotice(null);

    try {
      setIsUpdatingNova(true);
      await startNovaRecording();
    } catch (error) {
      setIsUpdatingNova(false);
      transitionNova(resolveIdleState());
      const permissionDenied =
        error instanceof Error && /permission|denied|notallowed/i.test(error.message);
      setMicError(
        permissionDenied
          ? "Microphone permission was denied. Allow mic access in your browser and try again."
          : "Unable to start Nova capture. Try again.",
      );
    }
  }

  // Manual fallback. Uses the SAME silence-based capture as the wake word.
  const handleActivateNova = async () => {
    if (!novaInRoom) {
      showNotice("Invite Nova to the room first.");
      return;
    }

    if (novaState === "listening") {
      stopNovaRecording();
      return;
    }

    if (novaState === "in_room" || novaState === "error") {
      await beginNovaCapture();
    }
  };

  // Call-to-wake is the DEFAULT Nova interaction and starts automatically once
  // Nova is in the room. The Porcupine worker (and the mic permission it needs)
  // only start when `connected && novaInRoom`; before that, nothing listens.
  // Detection runs locally in the browser; on a hit we start the SAME
  // silence-based capture flow as the Talk to Nova button.
  const wakeReady = connected && novaInRoom;
  const wake = useWakeWord({
    enabled: wakeReady,
    onWake: () => {
      void beginNovaCapture();
    },
    canTrigger: () =>
      connected &&
      novaInRoom &&
      !isSendingNovaRef.current &&
      (novaStateRef.current === "in_room" || novaStateRef.current === "error"),
  });

  // Track whether wake detection is armed. Nova stays "In Room" while armed; the
  // wake worker keeps running locally and only flips her to "Listening" on a hit.
  useEffect(() => {
    wakeReadyRef.current = wakeReady;
  }, [wakeReady]);

  // Clear any pending notice timer on unmount.
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const wakeListening =
    wakeReady &&
    !wake.error &&
    (wake.status === "listening" ||
      wake.status === "detected" ||
      wake.status === "initializing");

  const novaLabel =
    novaState === "listening"
      ? "Listening"
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
          {wakeListening && (
            <span className="beta-status-pill" title="Wake detection runs on your device">
              <ShieldCheck className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
              On-device
            </span>
          )}
        </div>
        {/* Privacy microcopy: wake listening is local; audio only leaves on activation. */}
        {novaInRoom ? (
          <p className="text-[11px] leading-relaxed text-[oklch(0.6_0.02_260)]">
            Say &ldquo;Hey Nova&rdquo; to activate. Nova listens locally for the wake phrase; audio
            is only sent after activation.
            {wake.usingBuiltInFallback ? " Using a temporary built-in keyword." : ""}
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-[oklch(0.6_0.02_260)]">
            Invite Nova to the room to talk to her. Hands-free &ldquo;Hey Nova&rdquo; wake starts
            automatically once she joins.
          </p>
        )}
        {novaInRoom && wake.error && (
          <p className="mt-2 text-xs leading-relaxed text-[oklch(0.78_0.18_35)]">{wake.error}</p>
        )}
        {novaNotice && (
          <p className="mt-2 rounded-lg border border-[oklch(0.78_0.18_35/0.3)] bg-[oklch(0.78_0.18_35/0.08)] px-3 py-2 text-xs leading-relaxed text-[oklch(0.82_0.14_40)]">
            {novaNotice}
          </p>
        )}

        {/* Controls: Talk to Nova (manual fallback) + room mic */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <BetaButton
            className="min-h-11 px-3 text-sm"
            disabled={novaButtonDisabled}
            onClick={handleActivateNova}
            variant={novaState === "error" ? "electric" : "glass"}
          >
            {novaState === "listening" ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
            {novaButtonLabel}
          </BetaButton>
          <BetaButton
            className="min-h-11 px-3 text-sm"
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
  novaInRoom,
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
        novaInRoom={novaInRoom}
        onNovaStateChange={onNovaStateChange}
        onVoiceParticipantsChange={onVoiceParticipantsChange}
        roomId={roomId}
      />
    </LiveKitRoom>
  );
}
