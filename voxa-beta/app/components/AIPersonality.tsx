"use client";

import { useEffect, useState } from "react";

interface AIPersonalityProps {
  inRoom?: boolean;
  name: string;
  status:
    | "online"
    | "joining"
    | "in-room"
    | "thinking"
    | "listening"
    | "speaking"
    | "away"
    | "offline";
  onInvite?: () => void;
}

export default function AIPersonality({
  inRoom = false,
  name,
  status,
  onInvite,
}: AIPersonalityProps) {
  const [isBreathing, setIsBreathing] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsBreathing(false);
      setTimeout(() => setIsBreathing(true), 1000);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case "online":
        return "oklch(0.72 0.2 245)";
      case "joining":
        return "oklch(0.78 0.18 235)";
      case "in-room":
        return "oklch(0.72 0.2 245)";
      case "thinking":
        return "oklch(0.78 0.18 235)";
      case "listening":
        return "oklch(0.76 0.18 180)";
      case "speaking":
        return "oklch(0.82 0.19 145)";
      case "away":
        return "oklch(0.78 0.14 80)";
      case "offline":
        return "oklch(0.5 0.02 260)";
      default:
        return "oklch(0.72 0.2 245)";
    }
  };

  const statusColor = getStatusColor();
  const initials = name === "Nova" ? "NV" : name.slice(0, 2).toUpperCase();
  const statusLabel =
    status === "in-room"
      ? "In Room"
      : status
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
  const inviteDisabled = inRoom || status === "joining";

  return (
    <div className="beta-premium-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/10">
      <div className="relative z-10 flex items-center gap-4">
        <div
          className={`relative grid h-20 w-20 shrink-0 place-items-center rounded-full transition-transform duration-1000 ${isBreathing ? "scale-100" : "scale-95"}`}
          style={{
            background: `radial-gradient(circle at 35% 25%, oklch(0.97 0.005 260 / 0.22), transparent 36%), linear-gradient(135deg, ${statusColor}, oklch(0.65 0.22 250))`,
            boxShadow: `0 0 44px -12px ${statusColor}`,
          }}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/10 font-mono text-base font-medium tracking-wider text-white">
            {initials}
          </div>
          <div
            className="absolute inset-0 -z-10 rounded-full opacity-40 blur-xl"
            style={{ backgroundColor: statusColor }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold tracking-tight text-white">{name}</h3>
            <span className="rounded-full border border-[oklch(0.72_0.2_245/0.24)] bg-[oklch(0.72_0.2_245/0.1)] px-2.5 py-1 text-xs font-medium text-[oklch(0.78_0.18_235)]">
              {inRoom ? statusLabel : status === "joining" ? "Joining" : "Online"}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full w-2/3 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${statusColor}, oklch(0.78 0.18 235))`,
                boxShadow: `0 0 18px 2px ${statusColor}`,
              }}
            />
          </div>
          <button
            className={`beta-button-electric mt-4 min-h-10 w-full px-4 text-sm ${
              inviteDisabled ? "pointer-events-none opacity-60" : ""
            }`}
            disabled={inviteDisabled}
            onClick={onInvite}
            type="button"
          >
            {inRoom ? "In Room" : status === "joining" ? "Joining..." : "Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
