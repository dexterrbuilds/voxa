"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, MessageCircle, Sparkles } from "lucide-react";
import { BetaButton, BetaEyebrow, BetaHeader, BetaPanel, BetaShell } from "@/components/BetaChrome";
import { useAuth } from "@/lib/auth";
import { useRoom } from "@/lib/room";

export default function Home() {
  const { user, logout, initialized: authInitialized } = useAuth();
  const { createRoom } = useRoom();
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (authInitialized && !user) {
      router.replace("/login?next=/");
    }
  }, [authInitialized, router, user]);

  const handleCreateRoom = () => {
    if (!user) {
      return;
    }

    setIsCreatingRoom(true);
    const room = createRoom(user);
    if (room) {
      router.push(`/room/${room.id}`);
    } else {
      setIsCreatingRoom(false);
    }
  };

  if (!authInitialized) {
    return (
      <BetaShell>
        <div className="grid min-h-screen place-items-center">
          <div className="beta-status-pill">
            <Sparkles className="h-3.5 w-3.5 text-[var(--electric)]" />
            Opening Synq
          </div>
        </div>
      </BetaShell>
    );
  }

  if (user) {
    return (
      <BetaShell>
        <BetaHeader>
          <BetaButton
            variant="quiet"
            onClick={() => {
              void logout().then(() => router.replace("/login"));
            }}
          >
            <LogOut size={16} />
            Sign out
          </BetaButton>
        </BetaHeader>
        <div className="mx-auto max-w-3xl px-5 py-12 sm:py-20">
          <div>
            <BetaEyebrow>Your space to connect</BetaEyebrow>
            <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Start a conversation.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              Bring your people. Invite an agent. Make room for a different perspective.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <BetaButton disabled={isCreatingRoom} onClick={handleCreateRoom}>
                {isCreatingRoom ? "Creating Room..." : "Start Room"}
                <MessageCircle className="h-4 w-4" />
              </BetaButton>
              <BetaButton href="/room" variant="glass">
                Join Room
                <ArrowRight className="h-4 w-4" />
              </BetaButton>
            </div>
          </div>

          <div className="mt-12 grid gap-5 border-t border-[var(--border)] pt-6 sm:grid-cols-2">
            <a href="/agents" className="group py-3">
              <h2 className="flex items-center gap-2 font-semibold">
                Meet the agents <ArrowRight size={16} />
              </h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Explore the builders and skills in the Synq network.
              </p>
            </a>
            <a href="/developers/agents" className="group py-3">
              <h2 className="flex items-center gap-2 font-semibold">
                Bring your own agent <ArrowRight size={16} />
              </h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Connect your existing stack and test it safely.
              </p>
            </a>
          </div>
        </div>
      </BetaShell>
    );
  }

  return (
    <BetaShell>
      <BetaHeader />
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl place-items-center px-6 py-16">
        <BetaPanel className="w-full p-8 text-center sm:p-12">
          <BetaEyebrow>Synq Rooms</BetaEyebrow>
          <h1 className="beta-text-gradient mt-6 text-4xl font-semibold tracking-normal sm:text-6xl">
            Synq
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[var(--muted-foreground)] sm:text-lg">
            A social communication layer for humans and AI agents.
          </p>
          <div className="mt-9">
            <BetaButton
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/login";
                }
              }}
            >
              Sign In to Enter Room
              <ArrowRight className="h-4 w-4" />
            </BetaButton>
          </div>
        </BetaPanel>
      </div>
    </BetaShell>
  );
}
