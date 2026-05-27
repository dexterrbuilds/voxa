"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { Mic, MicOff, Radio, Volume2 } from "lucide-react";
import { BetaButton, BetaPanel } from "@/components/BetaChrome";
import { getSupabaseClient } from "@/lib/supabase";

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
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  isConnected: boolean;
};

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
  const [micAttempted, setMicAttempted] = useState(false);
  const [isUpdatingMic, setIsUpdatingMic] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const connected = connectionState === ConnectionState.Connected;

  const participantRows = useMemo(
    () =>
      participants.map((participant) => {
        const micPublication = participant.getTrackPublication(Track.Source.Microphone);
        return {
          id: participant.identity,
          name: participant.name || participant.identity,
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
    if (!connected || !localParticipant || micAttempted) {
      return;
    }

    let isActive = true;
    setMicAttempted(true);

    localParticipant.setMicrophoneEnabled(true).catch((error) => {
      if (!isActive) {
        return;
      }

      const permissionDenied =
        error instanceof Error && /permission|denied|notallowed/i.test(error.message);
      setMicError(
        permissionDenied
          ? "Permission denied. You can listen now, and retry mic access if your browser allows it."
          : "Unable to start your microphone. You can still listen.",
      );
    });

    return () => {
      isActive = false;
    };
  }, [connected, localParticipant, micAttempted]);

  const handleToggleMic = async () => {
    if (!localParticipant) {
      return;
    }

    setIsUpdatingMic(true);
    setMicError(null);

    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
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

  return (
    <BetaPanel className="mt-8 p-5">
      <RoomAudioRenderer />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
            <Radio className="h-3.5 w-3.5" />
            Human voice
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-lg font-semibold tracking-tight text-white">
              {formatConnectionState(connectionState)}
            </p>
            <span className="beta-status-pill">
              {isMicrophoneEnabled ? (
                <Mic className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
              )}
              {isMicrophoneEnabled ? "Mic live" : connected ? "Listening only" : "Mic muted"}
            </span>
          </div>
          {micError ? (
            <p className="mt-3 max-w-xl text-sm text-[oklch(0.78_0.18_35)]">{micError}</p>
          ) : (
            <p className="mt-3 max-w-xl text-sm text-[oklch(0.65_0.02_260)]">
              Voice connects automatically. Allow microphone access to speak, or stay muted to
              listen.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <BetaButton
            disabled={!connected || isUpdatingMic}
            onClick={handleToggleMic}
            variant={isMicrophoneEnabled ? "glass" : "quiet"}
          >
            {isMicrophoneEnabled ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
            {isMicrophoneEnabled ? "Mute" : "Unmute"}
          </BetaButton>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {participantRows.map((participant) => (
          <div
            className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm"
            key={participant.id}
          >
            <span className="truncate text-white">
              {participant.name}
              {participant.isLocal ? " (you)" : ""}
            </span>
            <span
              className={
                participant.isSpeaking
                  ? "text-[oklch(0.78_0.18_235)]"
                  : "text-[oklch(0.65_0.02_260)]"
              }
            >
              {participant.isMuted ? "Muted" : participant.isSpeaking ? "Speaking" : "Connected"}
            </span>
          </div>
        ))}
      </div>
    </BetaPanel>
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
    return (
      <BetaPanel className="mt-8 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
              <Radio className="h-3.5 w-3.5" />
              Human voice
            </div>
            <p className="mt-2 text-sm text-[oklch(0.65_0.02_260)]">
              Voice unlocks when the shared room is connected.
            </p>
          </div>
          <BetaButton disabled variant="quiet">
            <MicOff className="h-4 w-4" />
            Voice unavailable
          </BetaButton>
        </div>
      </BetaPanel>
    );
  }

  if (error) {
    return (
      <BetaPanel className="mt-8 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[oklch(0.78_0.18_35)]">{error}</p>
          <BetaButton
            onClick={() => {
              setVoiceToken(null);
              setError(null);
              setRetryCount((count) => count + 1);
            }}
            variant="glass"
          >
            Try again
          </BetaButton>
        </div>
      </BetaPanel>
    );
  }

  if (isLoading || !voiceToken) {
    return (
      <BetaPanel className="mt-8 p-5">
        <div className="beta-status-pill">
          <Radio className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
          Preparing voice
        </div>
      </BetaPanel>
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
