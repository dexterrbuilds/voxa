"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Link as LinkIcon, LogOut, Mic, MicOff, Sparkles } from "lucide-react";
import AgentSelector from "@/components/AgentSelector";
import { BetaButton, BetaEyebrow, BetaHeader, BetaPanel, BetaShell } from "@/components/BetaChrome";
import InviteLink from "@/components/InviteLink";
import RoomVoice, { type NovaState, type VoiceParticipantState } from "@/components/RoomVoice";
import { getDefaultAgent } from "@/lib/agents";
import { useAuth } from "@/lib/auth";
import { useRoom } from "@/lib/room";
import { isAgentInRoom, type Participant } from "@/lib/store";

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

const defaultAgent = getDefaultAgent();
const defaultAgentId = defaultAgent?.id ?? "nova";

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
      : "Voice not connected";

  return (
    <div className="synq-participant relative text-left" data-speaking={cardIsActive}>
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
            <div className="flex items-center gap-2">
              <span className="break-words text-base font-semibold text-[var(--foreground)]">
                {participant.name}
              </span>
              {participant.id.startsWith("agent:") && (
                <span className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--warning)]">
                  Text-only
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              {isAgent ? (
                <Sparkles className="h-3.5 w-3.5 text-[var(--electric)]" />
              ) : isMuted ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5 text-[var(--electric)]" />
              )}
              {status}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <span className="text-xs text-[var(--muted-foreground)]">
            {isAgent ? "Agent" : "Human"}
          </span>
          <div className="flex h-8 items-end gap-1">
            {[0, 1, 2].map((bar) => (
              <span
                className={[
                  "block w-1 rounded-full bg-[var(--electric)] transition-all",
                  cardIsActive ? "animate-[beta-breathe_0.7s_ease-in-out_infinite]" : "opacity-30",
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
    inviteAgentShared,
    leaveSharedRoom,
    heartbeatSharedRoom,
    presenceConfig,
    subscribeToRoom,
    unsubscribeFromSharedRoom,
    setCurrentRoom,
    inviteAgent,
    leaveRoom,
  } = useRoom();
  const [isLoading, setIsLoading] = useState(true);
  const [sharedRoomEnabled, setSharedRoomEnabled] = useState(false);
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipantState[]>([]);
  const [novaVisualState, setNovaVisualState] = useState<AgentVisualState>("online");
  const [manualNovaState, setManualNovaState] = useState<AgentVisualState | null>(null);
  const [invitingAgentId, setInvitingAgentId] = useState<string | null>(null);
  const [externalStates, setExternalStates] = useState<Record<string, AgentVisualState>>({});
  const onAgentState = useCallback((agentId: string, state: "in-room" | "thinking" | "error") => {
    setExternalStates((previous) =>
      previous[agentId] === state ? previous : { ...previous, [agentId]: state },
    );
  }, []);
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

    let refreshing = false;
    const refresh = async () => {
      if (refreshing || !navigator.onLine) return;
      refreshing = true;
      try {
        await refreshSharedRoom(room.id);
      } finally {
        refreshing = false;
      }
    };

    const channel = subscribeToRoom(room.id, refresh);
    const intervalId = window.setInterval(refresh, 3000);
    window.addEventListener("online", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", refresh);
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

  const novaInRoom = room
    ? isAgentInRoom(defaultAgentId, room.participants) ||
      room.invitedAgents.includes(defaultAgentId)
    : false;
  const participants = room?.participants ?? [];
  const agentStates = useMemo(() => {
    const nextStates = new Map<string, AgentVisualState>();
    for (const [id, state] of Object.entries(externalStates)) nextStates.set(`agent:${id}`, state);

    if (novaInRoom) {
      nextStates.set(defaultAgentId, novaVisualState);
    }

    return nextStates;
  }, [novaInRoom, novaVisualState, externalStates]);
  const voiceByParticipantId = useMemo(
    () => new Map(voiceParticipants.map((participant) => [participant.id, participant])),
    [voiceParticipants],
  );
  const handleVoiceParticipantsChange = useCallback((nextParticipants: VoiceParticipantState[]) => {
    setVoiceParticipants(nextParticipants);
  }, []);

  useEffect(() => {
    if (!novaInRoom) {
      if (invitingAgentId !== defaultAgentId) {
        setNovaVisualState("online");
      }

      return;
    }

    setInvitingAgentId(null);
    setNovaVisualState("in-room");
  }, [invitingAgentId, novaInRoom]);

  const handleInviteAgent = useCallback(
    async (agentId: string) => {
      if (!room) {
        return;
      }

      const alreadyInRoom =
        isAgentInRoom(agentId, room.participants) || room.invitedAgents.includes(agentId);

      if (alreadyInRoom || invitingAgentId) {
        return;
      }

      setInvitingAgentId(agentId);
      if (agentId === defaultAgentId) {
        setNovaVisualState("joining");
      }

      if (!sharedRoomEnabled) {
        inviteAgent(room.id, agentId);
        setInvitingAgentId(null);
        if (agentId === defaultAgentId) {
          setNovaVisualState("in-room");
        }
        return;
      }

      const nextRoom = await inviteAgentShared(room.id, agentId, "manual");

      if (!nextRoom) {
        setInvitingAgentId(null);
        if (agentId === defaultAgentId) {
          setNovaVisualState("online");
        }
      }
    },
    [inviteAgent, inviteAgentShared, invitingAgentId, room, sharedRoomEnabled],
  );

  const novaVoice = voiceByParticipantId.get(defaultAgentId);
  const liveNovaState = novaInRoom ? agentStateFromVoice(novaVoice) : null;
  const effectiveNovaState: AgentVisualState =
    (novaVoice?.isSpeaking && novaInRoom ? "speaking" : null) ??
    manualNovaState ??
    liveNovaState ??
    novaVisualState;
  const statusLabelForAgent = useCallback(
    (agentId: string) => {
      if (agentId !== defaultAgentId) {
        return null;
      }

      return formatAgentState(effectiveNovaState);
    },
    [effectiveNovaState],
  );

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
      inviteRequest !== defaultAgentId ||
      !room ||
      !sharedRoomEnabled ||
      novaInRoom
    ) {
      return;
    }

    consumedInviteRequest.current = true;
    void handleInviteAgent(defaultAgentId);
  }, [handleInviteAgent, inviteRequest, novaInRoom, room, sharedRoomEnabled]);

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
            <Sparkles className="h-3.5 w-3.5 text-[var(--electric)]" />
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
            <h1 className="beta-text-gradient mt-6 text-3xl font-semibold tracking-normal">
              {roomUnavailable ? "Room is no longer available" : "Room link is invalid"}
            </h1>
            <p className="mt-4 text-[var(--muted-foreground)]">
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

      <div className="mx-auto max-w-7xl px-4 pb-[calc(13rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-[calc(12rem+env(safe-area-inset-bottom))] sm:pt-10">
        <div className="mb-5 flex flex-col gap-3 sm:mb-8">
          <div>
            <h1 className="beta-text-gradient max-w-3xl text-2xl font-semibold leading-tight sm:text-3xl">
              {room.name}
            </h1>
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.035] px-3 py-1.5 font-mono text-xs text-[var(--muted-foreground)]">
              <LinkIcon className="h-3.5 w-3.5 shrink-0 text-[var(--electric)]" />
              <span className="truncate">{room.roomId}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr),18rem]">
          <section className="min-w-0" aria-label="Room conversation">
            <div>
              <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                <AudioLines className="h-3.5 w-3.5 text-[var(--electric)]" />
                {room.status === "ended" ? "Room ended" : "Conversation"}
              </div>

              <div className="pb-6">
                <div className="mx-auto max-w-4xl">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {participants.map((participant) => (
                      <ParticipantCard
                        agentState={
                          participant.id === defaultAgentId
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
                    <p className="mx-auto mt-5 max-w-sm text-center text-sm leading-relaxed text-[var(--muted-foreground)]">
                      Invite someone to join the conversation.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <AgentSelector
              onAgentState={onAgentState}
              invitedAgentIds={room.invitedAgents}
              invitingAgentId={invitingAgentId}
              onInvite={handleInviteAgent}
              participants={participants}
              roomId={room.id}
              statusLabelForAgent={statusLabelForAgent}
            />
          </section>

          <aside className="space-y-4">
            <div className="border-t border-[var(--border)] py-4">
              <InviteLink roomId={room.id} inline />
            </div>

            <div className="border-t border-[var(--border)] py-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--electric)]">
                Recent
              </div>
              <div className="mt-3 space-y-2">
                {room.events.slice(-3).map((event) => (
                  <div className="text-sm text-[var(--muted-foreground)]" key={event.id}>
                    {event.text}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div className="synq-voice-dock fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 mx-auto max-w-2xl sm:inset-x-6">
          <RoomVoice
            enabled={sharedRoomEnabled && room.status === "active"}
            novaInRoom={novaInRoom}
            onNovaStateChange={handleNovaStateChange}
            onVoiceParticipantsChange={handleVoiceParticipantsChange}
            roomId={room.id}
          />
        </div>
      </div>
    </BetaShell>
  );
}
