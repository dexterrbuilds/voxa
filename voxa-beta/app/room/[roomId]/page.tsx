"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Headphones,
  Link as LinkIcon,
  LogOut,
  Mic,
  MicOff,
  Shield,
  Sparkles,
} from "lucide-react";
import AIPersonality from "@/components/AIPersonality";
import {
  BetaButton,
  BetaEyebrow,
  BetaHeader,
  BetaPanel,
  BetaShell,
  BetaStat,
} from "@/components/BetaChrome";
import InviteLink from "@/components/InviteLink";
import RoomVoice, { type VoiceParticipantState } from "@/components/RoomVoice";
import { useAuth } from "@/lib/auth";
import { type NovaRoomMode, useRoom } from "@/lib/room";
import { novaParticipant, type Participant } from "@/lib/store";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
  searchParams: Promise<{
    invite?: string | string[];
  }>;
};

type AgentVisualState = "online" | "joining" | "in-room" | "listening" | "thinking" | "speaking";
type NovaControlMode = NovaRoomMode | "co-host";

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
  const [novaMode, setNovaMode] = useState<NovaControlMode>("manual");
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

    const intervalId = window.setInterval(() => {
      setNovaVisualState((currentState) => {
        if (currentState === "speaking") {
          return "listening";
        }

        if (currentState === "listening") {
          return "thinking";
        }

        if (currentState === "thinking") {
          return "in-room";
        }

        return "listening";
      });
    }, 6500);

    return () => {
      window.clearInterval(intervalId);
    };
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

    const dispatchMode: NovaRoomMode = novaMode === "silent" ? "silent" : "manual";
    const nextRoom = await inviteNovaShared(room.id, dispatchMode);

    if (!nextRoom) {
      setIsInvitingNova(false);
      setNovaVisualState("online");
    }
  }, [inviteNova, inviteNovaShared, isInvitingNova, novaInRoom, novaMode, room, sharedRoomEnabled]);

  const novaVoice = voiceByParticipantId.get("nova");
  const liveNovaState = novaInRoom ? agentStateFromVoice(novaVoice) : null;
  const effectiveNovaState: AgentVisualState =
    manualNovaState ??
    liveNovaState ??
    (novaVoice?.isSpeaking && novaInRoom ? "speaking" : novaVisualState);

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
      </BetaHeader>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <BetaEyebrow>Voxa Room</BetaEyebrow>
            <h1 className="beta-text-gradient mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              {room.name}
            </h1>
            <p className="mt-3 text-[oklch(0.65_0.02_260)]">
              Nova is online. Invite people into this room and start the conversation.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <div className="beta-status-pill">
              <Shield className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
              Invite-only room
            </div>
            <div className="beta-status-pill">
              <Headphones className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
              Nova online
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,22rem]">
          <BetaPanel className="p-4 sm:p-6">
            <div className="beta-orbital-stage beta-room-stage">
              <div className="absolute inset-0 beta-room-grid opacity-90" />
              <div className="absolute left-6 top-6 beta-status-pill">
                <AudioLines className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
                {room.status === "ended" ? "Room ended" : "Conversation core"}
              </div>
              <div className="absolute right-6 top-6 beta-status-pill">
                <LinkIcon className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
                {room.roomId}
              </div>
              <div className="absolute left-6 right-6 top-16 z-20 flex justify-start">
                <RoomVoice
                  enabled={sharedRoomEnabled && room.status === "active"}
                  onNovaStateChange={(state) => {
                    if (!state || state === "idle") {
                      setManualNovaState(null);
                      return;
                    }

                    setManualNovaState(
                      state === "initializing" ? "joining" : state,
                    );
                  }}
                  onVoiceParticipantsChange={handleVoiceParticipantsChange}
                  roomId={room.id}
                />
              </div>

              <div className="relative z-10 min-h-[38rem] px-5 pb-44 pt-32">
                <div className="mx-auto max-w-4xl">
                  <div className="mb-6 text-center">
                    <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                      {room.status === "ended" ? "Room ended" : "In the room"}
                    </h2>
                    <p className="mx-auto mt-3 max-w-xl leading-relaxed text-[oklch(0.65_0.02_260)]">
                      {participants.length > 1
                        ? "People in this Voxa Room appear here as they join."
                        : "Invite someone to join the conversation."}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                </div>
              </div>

              <div className="absolute bottom-6 left-6 right-6 grid gap-3 sm:grid-cols-3">
                <BetaStat label="Participants" value={String(participants.length)} />
                <BetaStat label="Privacy" value="Invite-only" />
                <BetaStat
                  label="Nova"
                  value={
                    isInvitingNova
                      ? "Joining"
                      : novaInRoom
                        ? formatAgentState(effectiveNovaState)
                        : "Online"
                  }
                />
              </div>
            </div>
          </BetaPanel>

          <aside className="space-y-4">
            <BetaPanel className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
                    AI agent
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Nova</h2>
                </div>
                <div className="h-2.5 w-2.5 rounded-full bg-[oklch(0.72_0.2_245)] shadow-[0_0_18px_2px_oklch(0.72_0.2_245/0.65)]" />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[oklch(0.65_0.02_260)]">
                {isInvitingNova
                  ? "Nova is joining this room."
                  : novaInRoom
                  ? "Nova joined the room."
                  : "Nova is online and ready to join this room."}
              </p>
            </BetaPanel>

            <BetaPanel className="p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
                Nova mode
              </div>
              <div className="mt-4 grid gap-2">
                {[
                  { label: "Manual", mode: "manual", note: "Responds only when addressed by name." },
                  { label: "Silent", mode: "silent", note: "Joins and listens without responding." },
                  { label: "Co-host", mode: "co-host", note: "Later" },
                ].map((option) => {
                  const disabled = option.mode === "co-host" || novaInRoom || isInvitingNova;
                  const active = novaMode === option.mode;

                  return (
                    <button
                      className={[
                        "rounded-xl border px-4 py-3 text-left transition",
                        active
                          ? "border-[oklch(0.72_0.2_245/0.5)] bg-[oklch(0.72_0.2_245/0.12)]"
                          : "border-white/[0.07] bg-white/[0.035] hover:border-white/[0.14]",
                        disabled ? "cursor-not-allowed opacity-55" : "",
                      ].join(" ")}
                      disabled={disabled}
                      key={option.mode}
                      onClick={() => setNovaMode(option.mode as NovaControlMode)}
                      type="button"
                    >
                      <span className="block text-sm font-semibold text-white">{option.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-[oklch(0.65_0.02_260)]">
                        {option.note}
                      </span>
                    </button>
                  );
                })}
              </div>
            </BetaPanel>

            <AIPersonality
              inRoom={novaInRoom}
              name={nova.name}
              onInvite={handleInviteNova}
              status={isInvitingNova ? "joining" : novaInRoom ? effectiveNovaState : "online"}
            />

            <BetaPanel className="p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
                Room events
              </div>
              <div className="mt-4 space-y-3">
                {room.events.slice(-5).map((event) => (
                  <div className="text-sm text-[oklch(0.65_0.02_260)]" key={event.id}>
                    {event.text}
                  </div>
                ))}
              </div>
            </BetaPanel>
          </aside>
        </div>

        <InviteLink roomId={room.id} />
      </div>
    </BetaShell>
  );
}
