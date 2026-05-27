"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut } from "lucide-react";
import {
  BetaButton,
  BetaEyebrow,
  BetaHeader,
  BetaPanel,
  BetaShell,
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
    router.push(inviteNova ? `/room/${newRoom.id}?invite=nova` : `/room/${newRoom.id}`);
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
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6">
          <div>
            <BetaEyebrow>Room Portal</BetaEyebrow>
            <h1 className="beta-text-gradient mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Start Room
            </h1>
            <p className="mt-3 text-sm text-[oklch(0.65_0.02_260)]">
              Signed in as {user?.email ?? "you@usevoxa.com"}
            </p>
          </div>
        </div>

        <BetaPanel className="p-4 sm:p-6">
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.07] bg-[oklch(0.12_0.016_260/0.42)] p-4 sm:p-5">
              <p className="text-sm leading-relaxed text-[oklch(0.65_0.02_260)]">
                Open an invite-only Voxa Room, then share the link with the people you want inside.
              </p>
              <div className="mt-5 flex flex-col gap-3">
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

            <AIPersonality
              inRoom={false}
              name="Nova"
              onInvite={() => handleCreateRoom(true)}
              status="online"
            />

            <div className="rounded-xl border border-white/[0.07] bg-[oklch(0.12_0.016_260/0.42)] p-4 sm:p-5">
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
