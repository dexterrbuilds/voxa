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
import {
  getNovaListenWindowMs,
  MicStateController,
  VoiceActivationController,
} from "@/lib/voice-activation";

type RoomVoiceProps = {
  roomId: string;
  enabled: boolean;
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
  onVoiceParticipantsChange,
}: {
  onVoiceParticipantsChange?: (participants: VoiceParticipantState[]) => void;
}) {
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const micPrimedRef = useRef(false);
  const activationControllerRef = useRef<VoiceActivationController | null>(null);
  const [isUpdatingMic, setIsUpdatingMic] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [activationState, setActivationState] = useState<"sleeping" | "listening">("sleeping");
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

        const activation = new VoiceActivationController(
          mic,
          getNovaListenWindowMs(),
          {
            onActivate: () => {
              setActivationState("listening");
            },
            onDeactivate: () => {
              setActivationState("sleeping");
              setRemainingSeconds(0);
            },
          },
        );
        activationControllerRef.current = activation;
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
      activationControllerRef.current?.dispose();
      activationControllerRef.current = null;
      void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    };
  }, [connected, localParticipant]);

  useEffect(() => {
    if (activationState !== "listening") {
      return;
    }

    const updateRemaining = () => {
      setRemainingSeconds(
        Math.ceil((activationControllerRef.current?.getRemainingMs() ?? 0) / 1000),
      );
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activationState]);

  const handleActivateNova = async () => {
    if (!activationControllerRef.current) {
      return;
    }

    setIsUpdatingMic(true);
    setMicError(null);

    try {
      if (isMicrophoneEnabled) {
        await activationControllerRef.current.deactivate();
      } else {
        await activationControllerRef.current.activate();
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
          {isMicrophoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          {isMicrophoneEnabled ? "Stop" : "Talk to Nova"}
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
      <VoiceSession onVoiceParticipantsChange={onVoiceParticipantsChange} />
    </LiveKitRoom>
  );
}
