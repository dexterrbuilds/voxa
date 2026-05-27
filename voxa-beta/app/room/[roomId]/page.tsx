"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Headphones, Link as LinkIcon, LogOut, Shield, Sparkles } from "lucide-react";
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
import RoomVoice from "@/components/RoomVoice";
import { useAuth } from "@/lib/auth";
import { useRoom } from "@/lib/room";
import { novaParticipant } from "@/lib/store";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default function RoomPage({ params }: RoomPageProps) {
  const { roomId } = use(params);
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

  const handleInviteNova = () => {
    if (!room) {
      return;
    }

    if (!sharedRoomEnabled) {
      inviteNova(room.id);
      return;
    }

    void inviteNovaShared(room.id);
  };

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

        <RoomVoice enabled={sharedRoomEnabled && room.status === "active"} roomId={room.id} />

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

              <div className="relative z-10 grid min-h-[38rem] place-items-center px-5 pb-60 pt-20 text-center sm:pb-44">
                <div>
                  <div className="beta-conversation-core mx-auto">
                    <Sparkles className="h-11 w-11 text-[oklch(0.1_0.02_260)]" />
                  </div>
                  <h2 className="mt-8 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    {room.status === "ended" ? "Room ended" : "Waiting for others to join"}
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[oklch(0.65_0.02_260)]">
                    {room.status === "ended"
                      ? "The conversation can reopen when someone returns within the recovery window."
                      : "Share the room link or invite Nova into the conversation."}
                  </p>
                </div>
              </div>

              <div className="absolute bottom-6 left-6 right-6 grid gap-3 sm:grid-cols-3">
                <BetaStat label="Participants" value={String(participants.length)} />
                <BetaStat label="Privacy" value="Invite-only" />
                <BetaStat label="Nova" value={novaInRoom ? "In Room" : "Online"} />
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
                {novaInRoom
                  ? "Nova joined the room."
                  : "Nova is online and ready to join this room."}
              </p>
            </BetaPanel>

            <AIPersonality
              inRoom={novaInRoom}
              name={nova.name}
              onInvite={handleInviteNova}
              status="online"
            />

            <BetaPanel className="p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
                Participants
              </div>
              <div className="mt-4 space-y-3">
                {participants.map((participant) => (
                  <div
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm"
                    key={participant.id}
                  >
                    <span className="truncate text-white">{participant.name}</span>
                    <span className="text-[oklch(0.65_0.02_260)]">
                      {participant.role === "ai" ? "AI" : "In Room"}
                    </span>
                  </div>
                ))}
              </div>
            </BetaPanel>

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
