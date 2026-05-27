"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Link as LinkIcon,
  LogOut,
  Mic,
  MicOff,
  Sparkles,
} from "lucide-react";
import AIPersonality from "@/components/AIPersonality";
import {
  BetaButton,
  BetaEyebrow,
  BetaHeader,
  BetaPanel,
  BetaShell,
} from "@/components/BetaChrome";
import InviteLink from "@/components/InviteLink";
import RoomVoice, { type NovaState, type VoiceParticipantState } from "@/components/RoomVoice";
import { useAuth } from "@/lib/auth";
import { useRoom } from "@/lib/room";
import { novaParticipant, type Participant } from "@/lib/store";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
  searchParams: Promise<{
    invite?: string | string[];
  }>;
};

type AgentVisualState =
  | "online"
  | "joining"
  | "in-room"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

function agentStateFromVoice(voice?: VoiceParticipantState): AgentVisualState | null {
  if (!voice?.agentState) {
    return null;
  }

  if (voice.agentState === "initializing") {
    return "joining";
  }

  if (voice.agentState === "idle") {
    return "in-room";
  }

  return voice.agentState;
}

function formatAgentState(state: AgentVisualState) {
  if (state === "error") {
    return "Error";
  }

  return state
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function initialsFor(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "V";
}

function ParticipantCard({
  agentState,
  participant,
  voice,
}: {
  agentState?: AgentVisualState;
  participant: Participant;
  voice?: VoiceParticipantState;
}) {
  const isAgent = participant.participantType === "agent";
  const isSpeaking = !!voice?.isSpeaking;
  const agentIsAnimating =
    isAgent &&
    (agentState === "listening" || agentState === "thinking" || agentState === "speaking");
  const cardIsActive = isSpeaking || agentIsAnimating;
  const isVoiceConnected = !!voice?.isConnected;
  const isMuted = voice?.isMuted ?? true;
  const status = isAgent
    ? isSpeaking
      ? "Speaking"
      : formatAgentState(agentState ?? "in-room")
    : isVoiceConnected
      ? isMuted
        ? "Mic muted"
        : isSpeaking
          ? "Speaking"
          : "Mic live"
      : "In room";

  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border p-5 text-left transition-all duration-300",
        "bg-[oklch(0.12_0.018_260/0.72)] shadow-[0_24px_70px_-52px_oklch(0.72_0.2_245/0.75)] backdrop-blur-xl",
        cardIsActive
          ? "animate-[beta-pulse-glow_1.6s_ease-in-out_infinite] border-[oklch(0.72_0.2_245/0.62)]"
          : "border-white/[0.075]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,oklch(0.72_0.2_245/0.18),transparent_12rem)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={[
              "grid h-12 w-12 shrink-0 place-items-center rounded-xl border text-sm font-semibold text-white",
              cardIsActive
                ? "border-[oklch(0.72_0.2_245/0.7)] bg-[oklch(0.72_0.2_245/0.22)]"
                : "border-white/[0.08] bg-white/[0.045]",
            ].join(" ")}
          >
            {initialsFor(participant.name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold tracking-tight text-white">
              {participant.name}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-[oklch(0.65_0.02_260)]">
              {isAgent ? (
                <Sparkles className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
              ) : isMuted ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
              )}
              {status}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[oklch(0.72_0.2_245)]">
            {isAgent ? "Agent" : "Human"}
          </span>
          <div className="flex h-8 items-end gap-1">
            {[0, 1, 2].map((bar) => (
              <span
                className={[
                  "block w-1 rounded-full bg-[oklch(0.72_0.2_245)] transition-all",
                  cardIsActive
                    ? "animate-[beta-breathe_0.7s_ease-in-out_infinite]"
                    : "opacity-30",
                ].join(" ")}
                key={bar}
                style={{
                  height: cardIsActive ? `${12 + bar * 7}px` : "8px",
                  animationDelay: `${bar * 120}ms`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoomPage({ params, searchParams }: RoomPageProps) {
  const { roomId } = use(params);
  const resolvedSearchParams = use(searchParams);
  const inviteRequest = Array.isArray(resolvedSearchParams.invite)
    ? resolvedSearchParams.invite[0]
    : resolvedSearchParams.invite;
  const { user, loading: authLoading } = useAuth();
  const {
    room,
    joinSharedRoom,
    refreshSharedRoom,
    inviteNovaShared,
    leaveSharedRoom,
    heartbeatSharedRoom,
    presenceConfig,
    subscribeToRoom,
    unsubscribeFromSharedRoom,
    setCurrentRoom,
    inviteNova,
    leaveRoom,
  } = useRoom();
  const [isLoading, setIsLoading] = useState(true);
  const [sharedRoomEnabled, setSharedRoomEnabled] = useState(false);
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipantState[]>([]);
  const [novaVisualState, setNovaVisualState] = useState<AgentVisualState>("online");
  const [manualNovaState, setManualNovaState] = useState<AgentVisualState | null>(null);
  const [isInvitingNova, setIsInvitingNova] = useState(false);
  const consumedInviteRequest = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setIsLoading(false);
      return;
    }

    let isActive = true;

    setSharedRoomEnabled(false);
    setRoomUnavailable(false);

    joinSharedRoom(roomId, user)
      .then((result) => {
        if (!isActive) {
          return;
        }

        if (!result) {
          setCurrentRoom(null);
          setRoomUnavailable(true);
          return;
        }

        setSharedRoomEnabled(result.usedSharedState);
      })
      .catch(() => {
        if (isActive) {
          setCurrentRoom(null);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [authLoading, joinSharedRoom, roomId, setCurrentRoom, user]);

  useEffect(() => {
    if (!sharedRoomEnabled || !room?.id) {
      return;
    }

    const refresh = () => {
      void refreshSharedRoom(room.id);
    };

    const channel = subscribeToRoom(room.id, refresh);
    const intervalId = window.setInterval(refresh, 3000);

    return () => {
      window.clearInterval(intervalId);
      unsubscribeFromSharedRoom(channel);
    };
  }, [refreshSharedRoom, room?.id, sharedRoomEnabled, subscribeToRoom, unsubscribeFromSharedRoom]);

  useEffect(() => {
    if (!sharedRoomEnabled || !room?.id || !user || room.status === "ended") {
      return;
    }

    const sendHeartbeat = () => {
      void heartbeatSharedRoom(room.id, user);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendHeartbeat();
        void refreshSharedRoom(room.id);
      }
    };

    sendHeartbeat();
    const heartbeatId = window.setInterval(sendHeartbeat, presenceConfig.heartbeatMs);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    heartbeatSharedRoom,
    presenceConfig.heartbeatMs,
    refreshSharedRoom,
    room?.id,
    room?.status,
    sharedRoomEnabled,
    user,
  ]);

  const nova = useMemo(
    () => room?.participants.find((participant) => participant.id === "nova") ?? novaParticipant,
    [room],
  );
  const novaInRoom = room?.invitedAgents.includes("nova") ?? false;
  const participants = room?.participants ?? [];
  const agentStates = useMemo(() => {
    const nextStates = new Map<string, AgentVisualState>();

    if (novaInRoom) {
      nextStates.set("nova", novaVisualState);
    }

    return nextStates;
  }, [novaInRoom, novaVisualState]);
  const voiceByParticipantId = useMemo(
    () => new Map(voiceParticipants.map((participant) => [participant.id, participant])),
    [voiceParticipants],
  );
  const handleVoiceParticipantsChange = useCallback((nextParticipants: VoiceParticipantState[]) => {
    setVoiceParticipants(nextParticipants);
  }, []);

  useEffect(() => {
    if (!novaInRoom) {
      if (!isInvitingNova) {
        setNovaVisualState("online");
      }

      return;
    }

    setIsInvitingNova(false);
    setNovaVisualState("in-room");
  }, [isInvitingNova, novaInRoom]);

  const handleInviteNova = useCallback(async () => {
    if (!room) {
      return;
    }

    if (novaInRoom || isInvitingNova) {
      return;
    }

    setIsInvitingNova(true);
    setNovaVisualState("joining");

    if (!sharedRoomEnabled) {
      inviteNova(room.id);
      setIsInvitingNova(false);
      setNovaVisualState("in-room");
      return;
    }

    const nextRoom = await inviteNovaShared(room.id, "manual");

    if (!nextRoom) {
      setIsInvitingNova(false);
      setNovaVisualState("online");
    }
  }, [inviteNova, inviteNovaShared, isInvitingNova, novaInRoom, room, sharedRoomEnabled]);

  const novaVoice = voiceByParticipantId.get("nova");
  const liveNovaState = novaInRoom ? agentStateFromVoice(novaVoice) : null;
  const effectiveNovaState: AgentVisualState =
    (novaVoice?.isSpeaking && novaInRoom ? "speaking" : null) ??
    manualNovaState ??
    liveNovaState ??
    novaVisualState;

  const handleNovaStateChange = useCallback((state: NovaState) => {
    if (state === "in_room") {
      setManualNovaState(null);
      setNovaVisualState("in-room");
      return;
    }

    setManualNovaState(state === "error" ? "error" : state);
  }, []);

  useEffect(() => {
    if (
      consumedInviteRequest.current ||
      inviteRequest !== "nova" ||
      !room ||
      !sharedRoomEnabled ||
      novaInRoom
    ) {
      return;
    }

    consumedInviteRequest.current = true;
    void handleInviteNova();
  }, [handleInviteNova, inviteRequest, novaInRoom, room, sharedRoomEnabled]);

  const handleLeaveRoom = () => {
    if (room && user) {
      if (sharedRoomEnabled) {
        void leaveSharedRoom(room.id, user).finally(() => {
          router.replace("/");
        });
        return;
      }

      leaveRoom(room.id, user.id);
    }

    router.replace("/");
  };

  if (authLoading || isLoading) {
    return (
      <BetaShell>
        <div className="grid min-h-screen place-items-center">
          <div className="beta-status-pill">
            <Sparkles className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
            Entering the room
          </div>
        </div>
      </BetaShell>
    );
  }

  if (!room) {
    return (
      <BetaShell>
        <div className="grid min-h-screen place-items-center px-6">
          <BetaPanel className="max-w-md p-8 text-center">
            <BetaEyebrow>{roomUnavailable ? "Room ended" : "Room Link"}</BetaEyebrow>
            <h1 className="beta-text-gradient mt-6 text-3xl font-semibold tracking-tight">
              {roomUnavailable ? "Room is no longer available" : "Room link is invalid"}
            </h1>
            <p className="mt-4 text-[oklch(0.65_0.02_260)]">
              {roomUnavailable
                ? "Start a new room to continue the conversation."
                : "Create a room or use a shared invite link to continue."}
            </p>
            <div className="mt-7">
              <BetaButton href="/room">Back to rooms</BetaButton>
            </div>
          </BetaPanel>
        </div>
      </BetaShell>
    );
  }

  return (
    <BetaShell>
      <BetaHeader>
        <div className="flex items-center gap-2">
          <InviteLink roomId={room.id} compact />
          <BetaButton
            className="min-h-9 px-3 text-xs"
            onClick={() => {
              handleLeaveRoom();
            }}
            variant="quiet"
          >
            <LogOut className="h-3.5 w-3.5" />
            Leave
          </BetaButton>
        </div>
      </BetaHeader>

      <div className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10 sm:pt-10">
        <div className="mb-5 flex flex-col gap-3 sm:mb-8">
          <div>
            <BetaEyebrow>Voxa Room</BetaEyebrow>
            <h1 className="beta-text-gradient mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {room.name}
            </h1>
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.035] px-3 py-1.5 font-mono text-xs text-[oklch(0.65_0.02_260)]">
              <LinkIcon className="h-3.5 w-3.5 shrink-0 text-[oklch(0.78_0.18_235)]" />
              <span className="truncate">{room.roomId}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,22rem]">
          <BetaPanel className="p-4 sm:p-6">
            <div className="beta-orbital-stage beta-room-stage min-h-[34rem] overflow-hidden">
              <div className="absolute inset-0 beta-room-grid opacity-90" />
              <div className="absolute left-4 top-4 beta-status-pill sm:left-6 sm:top-6">
                <AudioLines className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
                {room.status === "ended" ? "Room ended" : "Conversation"}
              </div>

              <div className="relative z-10 min-h-[34rem] px-3 pb-8 pt-20 sm:px-5">
                <div className="mx-auto max-w-4xl">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {participants.map((participant) => (
                      <ParticipantCard
                        agentState={
                          participant.id === "nova"
                            ? effectiveNovaState
                            : agentStates.get(participant.id)
                        }
                        key={participant.id}
                        participant={participant}
                        voice={voiceByParticipantId.get(participant.id)}
                      />
                    ))}
                  </div>
                  {participants.length <= 1 && (
                    <p className="mx-auto mt-5 max-w-sm text-center text-sm leading-relaxed text-[oklch(0.65_0.02_260)]">
                      Invite someone to join the conversation.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </BetaPanel>

          <aside className="space-y-4">
            {!novaInRoom && (
              <BetaPanel className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
                      Nova
                    </div>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Online</h2>
                  </div>
                  <div className="h-2.5 w-2.5 rounded-full bg-[oklch(0.72_0.2_245)] shadow-[0_0_18px_2px_oklch(0.72_0.2_245/0.65)]" />
                </div>
                <BetaButton
                  className="mt-5 min-h-11 w-full"
                  disabled={isInvitingNova}
                  onClick={handleInviteNova}
                >
                  {isInvitingNova ? "Inviting Nova..." : "Invite Nova"}
                  <Sparkles className="h-4 w-4" />
                </BetaButton>
              </BetaPanel>
            )}

            <BetaPanel className="p-4">
              <InviteLink roomId={room.id} inline />
            </BetaPanel>

            <BetaPanel className="p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
                Recent
              </div>
              <div className="mt-3 space-y-2">
                {room.events.slice(-3).map((event) => (
                  <div className="text-sm text-[oklch(0.65_0.02_260)]" key={event.id}>
                    {event.text}
                  </div>
                ))}
              </div>
            </BetaPanel>

            {novaInRoom && (
              <AIPersonality
                inRoom
                name={nova.name}
                onInvite={handleInviteNova}
                status={effectiveNovaState}
              />
            )}
          </aside>
        </div>

        <div className="fixed bottom-3 left-3 right-3 z-40 mx-auto max-w-xl sm:sticky sm:bottom-4 sm:left-auto sm:right-auto sm:mt-6">
          <RoomVoice
            enabled={sharedRoomEnabled && room.status === "active"}
            onNovaStateChange={handleNovaStateChange}
            onVoiceParticipantsChange={handleVoiceParticipantsChange}
            roomId={room.id}
          />
        </div>
      </div>
    </BetaShell>
  );
}
