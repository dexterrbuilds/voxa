"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, AudioLines, LockKeyhole, Sparkles } from "lucide-react";
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

export default function Home() {
  const { user, initialized: authInitialized } = useAuth();
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
            <Sparkles className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
            Opening Voxa
          </div>
        </div>
      </BetaShell>
    );
  }

  if (user) {
    return (
      <BetaShell>
        <BetaHeader />
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-[0.9fr,1.1fr]">
          <div>
            <BetaEyebrow>AI Rooms</BetaEyebrow>
            <h1 className="beta-text-gradient mt-6 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              Begin inside an AI conversation room.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[oklch(0.65_0.02_260)]">
              Start an invite-only room with Nova online and ready to join the conversation.
            </p>
            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
              <BetaStat label="Access" value="Invite-only" />
              <BetaStat label="Rooms" value="Live" />
              <BetaStat label="Agent" value="Nova" />
            </div>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <BetaButton disabled={isCreatingRoom} onClick={handleCreateRoom}>
                {isCreatingRoom ? "Creating Room..." : "Start Room"}
                <Sparkles className="h-4 w-4" />
              </BetaButton>
              <BetaButton href="/room" variant="glass">
                Join Room
                <ArrowRight className="h-4 w-4" />
              </BetaButton>
            </div>
          </div>

          <BetaPanel className="p-5 sm:p-7">
            <div className="beta-orbital-stage grid place-items-center">
              <div className="beta-conversation-core">
                <AudioLines className="h-11 w-11 text-[oklch(0.1_0.02_260)]" />
              </div>
              <div className="absolute left-6 top-6 beta-status-pill">
                <LockKeyhole className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
                Invite-only room
              </div>
              <div className="absolute bottom-6 right-6 beta-status-pill">
                <Sparkles className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
                Nova online
              </div>
            </div>
          </BetaPanel>
        </div>
      </BetaShell>
    );
  }

  return (
    <BetaShell>
      <BetaHeader />
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl place-items-center px-6 py-16">
        <BetaPanel className="w-full p-8 text-center sm:p-12">
          <BetaEyebrow>Voxa Rooms</BetaEyebrow>
          <h1 className="beta-text-gradient mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
            Voxa
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[oklch(0.65_0.02_260)] sm:text-lg">
            A private cinematic voice platform where humans and AI personalities exist together
            inside immersive real-time conversational spaces.
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
