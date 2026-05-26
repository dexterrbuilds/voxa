"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link as LinkIcon, LogOut, Shield, Sparkles } from "lucide-react";
import {
  BetaButton,
  BetaEyebrow,
  BetaHeader,
  BetaPanel,
  BetaShell,
  BetaStat,
} from "@/components/BetaChrome";
import { useAuth } from "@/lib/auth";
import { useRoom } from "@/lib/room";
import AIPersonality from "@/components/AIPersonality";

export default function RoomLobby() {
  const { user, logout } = useAuth();
  const { room, createRoom, joinRoom } = useRoom();
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [joinValue, setJoinValue] = useState("");
  const [joinError, setJoinError] = useState("");
  const router = useRouter();

  const handleCreateRoom = (inviteNova = false) => {
    if (!user) {
      return;
    }

    setIsCreatingRoom(true);
    const newRoom = createRoom(user, { inviteNova });
    router.push(`/room/${newRoom.id}`);
  };

  const parseRoomId = (value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return "";
    }

    try {
      const parsedUrl = new URL(trimmedValue);
      const roomSegment = parsedUrl.pathname.split("/").filter(Boolean).pop();
      return roomSegment ?? "";
    } catch {
      return trimmedValue.split("/").filter(Boolean).pop() ?? "";
    }
  };

  const handleJoinRoom = () => {
    if (!user) {
      return;
    }

    const roomId = parseRoomId(joinValue);
    if (!/^[a-zA-Z0-9_-]{6,80}$/.test(roomId)) {
      setJoinError("Paste a valid Voxa room link or room ID.");
      return;
    }

    joinRoom(roomId, user);
    router.push(`/room/${roomId}`);
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <BetaShell>
      <BetaHeader>
        <BetaButton
          className="min-h-9 px-3 text-xs"
          onClick={() => {
            void handleLogout();
          }}
          variant="quiet"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </BetaButton>
      </BetaHeader>
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <BetaEyebrow>Room Portal</BetaEyebrow>
            <h1 className="beta-text-gradient mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Start a room or join an existing conversation.
            </h1>
            <p className="mt-4 max-w-2xl text-[oklch(0.65_0.02_260)]">
              Signed in as {user?.email ?? "you@usevoxa.com"}
            </p>
          </div>
        </div>

        <BetaPanel className="grid gap-8 p-6 lg:grid-cols-[1.08fr,0.92fr] lg:p-8">
          <div>
            <div className="beta-orbital-stage beta-lobby-stage grid place-items-center">
              <div className="beta-conversation-core">
                <Shield className="h-11 w-11 text-[oklch(0.1_0.02_260)]" />
              </div>
              <div className="absolute left-6 top-6 beta-status-pill">
                <Sparkles className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
                Voxa room
              </div>
              <div className="absolute bottom-6 right-6 beta-status-pill">
                <LinkIcon className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
                Share room link
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <BetaStat label="Access" value="Invite-only" />
              <BetaStat label="Agent" value="Nova online" />
              <BetaStat label="Invite links" value="Ready" />
            </div>

            <div className="mt-7 rounded-xl border border-white/[0.07] bg-[oklch(0.12_0.016_260/0.42)] p-5">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Start a room</h2>
              <p className="mt-3 leading-relaxed text-[oklch(0.65_0.02_260)]">
                Open a Voxa room and invite Nova into the conversation.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <BetaButton disabled={isCreatingRoom} onClick={() => handleCreateRoom(false)}>
                  {isCreatingRoom ? "Creating Room..." : "Start Room"}
                  <ArrowRight className="h-4 w-4" />
                </BetaButton>
                {room && (
                  <BetaButton href={`/room/${room.id}`} variant="glass">
                    Re-enter Room
                  </BetaButton>
                )}
              </div>
            </div>

            <div className="mt-4">
              <AIPersonality
                inRoom={false}
                name="Nova"
                onInvite={() => handleCreateRoom(true)}
                status="online"
              />
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.07] bg-[oklch(0.12_0.016_260/0.42)] p-5">
              <h2 className="text-xl font-semibold tracking-tight text-white">Join Room</h2>
              <div className="mt-4 flex flex-col gap-3">
                <input
                  className="beta-input"
                  onChange={(event) => {
                    setJoinValue(event.target.value);
                    setJoinError("");
                  }}
                  placeholder="Paste a Voxa room link or room ID"
                  value={joinValue}
                />
                {joinError && <p className="text-sm text-[oklch(0.78_0.14_40)]">{joinError}</p>}
                <BetaButton onClick={handleJoinRoom} variant="glass">
                  Join Room
                  <ArrowRight className="h-4 w-4" />
                </BetaButton>
              </div>
            </div>
          </div>
        </BetaPanel>
      </div>
    </BetaShell>
  );
}
