"use client";

import { CheckCircle2, Sparkles } from "lucide-react";
import { BetaButton, BetaPanel } from "@/components/BetaChrome";
import { getAvailableAgents } from "@/lib/agents";
import {
  getRoomAgentById,
  isAgentInRoom,
  type Participant,
} from "@/lib/store";

type AgentSelectorProps = {
  invitedAgentIds?: string[];
  invitingAgentId?: string | null;
  onInvite: (agentId: string) => void;
  participants: Participant[];
  statusLabelForAgent?: (agentId: string) => string | null;
};

const capabilityLabels: Record<string, string> = {
  action_items: "Actions",
  architecture: "Architecture",
  citations: "Citations",
  code_review: "Review",
  debugging: "Debug",
  memory: "Memory",
  multilingual: "Multilingual",
  realtime_room_participation: "Realtime",
  summaries: "Summaries",
  transcript_summary: "Summary",
  voice: "Voice",
  web_search: "Search",
};

function initialsFor(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "AI";
}

function formatCapability(capability: string) {
  return capabilityLabels[capability] ?? capability.replace(/_/g, " ");
}

export default function AgentSelector({
  invitedAgentIds = [],
  invitingAgentId,
  onInvite,
  participants,
  statusLabelForAgent,
}: AgentSelectorProps) {
  const agents = getAvailableAgents();

  return (
    <BetaPanel className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.72_0.2_245)]">
            Invite Agent
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
            Available agents
          </h2>
        </div>
        <Sparkles className="h-4 w-4 text-[oklch(0.72_0.2_245)]" />
      </div>

      {agents.length === 0 ? (
        <p className="mt-4 text-sm text-[oklch(0.65_0.02_260)]">No agents available yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {agents.map((agent) => {
            const isAvailable = agent.availability === "available";
            const roomAgent = getRoomAgentById(agent.id, participants);
            const inRoom =
              !!roomAgent || isAgentInRoom(agent.id, participants) || invitedAgentIds.includes(agent.id);
            const isInviting = invitingAgentId === agent.id;
            const statusLabel =
              !isAvailable
                ? "Coming soon"
                : (inRoom ? statusLabelForAgent?.(agent.id) : null) ??
                  (inRoom ? "In Room" : "Online");

            return (
              <div
                className={[
                  "rounded-xl border p-4 transition-opacity",
                  isAvailable
                    ? "border-white/[0.07] bg-[oklch(0.12_0.016_260/0.42)]"
                    : "border-white/[0.045] bg-white/[0.025] opacity-70",
                ].join(" ")}
                key={agent.id}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={[
                      "grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-sm font-semibold text-white",
                      isAvailable
                        ? "border-[oklch(0.72_0.2_245/0.34)] bg-[oklch(0.72_0.2_245/0.13)]"
                        : "border-white/[0.08] bg-white/[0.04]",
                    ].join(" ")}
                  >
                    {initialsFor(agent.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="truncate text-base font-semibold tracking-tight text-white">
                        {agent.name}
                      </h3>
                      <span
                        className={[
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em]",
                          isAvailable
                            ? "border-white/[0.07] bg-white/[0.04] text-[oklch(0.72_0.2_245)]"
                            : "border-white/[0.045] bg-white/[0.025] text-[oklch(0.58_0.025_260)]",
                        ].join(" ")}
                      >
                        {inRoom && <CheckCircle2 className="h-3 w-3" />}
                        {statusLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[oklch(0.72_0.2_245)]">
                      {agent.shortLabel ?? agent.category}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[oklch(0.65_0.02_260)]">
                      {agent.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {agent.capabilities.slice(0, 4).map((capability) => (
                        <span
                          className="rounded-full border border-white/[0.06] bg-white/[0.035] px-2 py-1 text-[10px] text-[oklch(0.7_0.025_260)]"
                          key={capability}
                        >
                          {formatCapability(capability)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <BetaButton
                  className="mt-4 min-h-11 w-full"
                  disabled={!isAvailable || inRoom || isInviting}
                  onClick={() => {
                    if (isAvailable) {
                      onInvite(agent.id);
                    }
                  }}
                  variant={!isAvailable || inRoom ? "quiet" : "electric"}
                >
                  {!isAvailable
                    ? "Coming soon"
                    : isInviting
                      ? `Inviting ${agent.name}...`
                      : inRoom
                        ? statusLabel
                        : `Invite ${agent.name}`}
                  <Sparkles className="h-4 w-4" />
                </BetaButton>
              </div>
            );
          })}
        </div>
      )}
    </BetaPanel>
  );
}
