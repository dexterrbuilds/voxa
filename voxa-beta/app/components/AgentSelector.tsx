"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, MessageSquare, SendHorizonal, Sparkles } from "lucide-react";
import { BetaButton, BetaPanel } from "@/components/BetaChrome";
import { getAvailableAgents } from "@/lib/agents";
import {
  AgentRegistryError,
  externalAgentParticipantId,
  inviteExternalAgentToRoom,
  listRoomEligibleExternalAgents,
  sendRoomTextMessage,
  type RoomEligibleExternalAgent,
} from "@/lib/agents/registry-client";
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
  roomId?: string;
  statusLabelForAgent?: (agentId: string) => string | null;
};

type RoomTextTurn = { role: "user" | "agent"; text: string };

// One experimental external agent: invite (text-only) + a compact message panel.
function ExternalAgentRoomCard({
  agent,
  roomId,
  inRoom,
  formatCapability,
}: {
  agent: RoomEligibleExternalAgent;
  roomId?: string;
  inRoom: boolean;
  formatCapability: (capability: string) => string;
}) {
  const [invited, setInvited] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<RoomTextTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const isInRoom = inRoom || invited;

  const invite = async () => {
    if (!roomId) {
      return;
    }
    setInviting(true);
    setError(null);
    try {
      await inviteExternalAgentToRoom(roomId, agent.id);
      setInvited(true);
    } catch (caught) {
      setError(caught instanceof AgentRegistryError ? caught.message : "Could not invite the agent.");
    } finally {
      setInviting(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !roomId) {
      return;
    }
    setError(null);
    setInput("");
    setTurns((prev) => [...prev, { role: "user", text }]);
    setSending(true);
    try {
      const result = await sendRoomTextMessage(roomId, agent.id, text);
      setTurns((prev) => [...prev, { role: "agent", text: result.reply.text }]);
    } catch (caught) {
      setError(caught instanceof AgentRegistryError ? caught.message : "Could not reach the agent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-400/25 bg-amber-400/[0.08] text-sm font-semibold text-white">
          {agent.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("") || "AI"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-base font-semibold tracking-tight text-white">
              {agent.name}
            </h3>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300">
              {isInRoom ? "In room" : "Experimental"}
            </span>
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-300/80">
            Experimental text-only · Developer agent
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[oklch(0.65_0.02_260)]">
            {agent.description}
          </p>
          {agent.capabilities.length > 0 && (
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
          )}
        </div>
      </div>

      {!isInRoom ? (
        <BetaButton
          className="mt-4 min-h-11 w-full"
          disabled={inviting || !roomId}
          onClick={() => void invite()}
        >
          {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
          {inviting ? "Inviting..." : "Invite (text-only)"}
        </BetaButton>
      ) : (
        <div className="mt-4 rounded-lg border border-white/[0.06] bg-[oklch(0.12_0.016_260/0.42)] p-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[oklch(0.6_0.02_260)]">
            Text-only chat · no audio
          </p>
          {turns.length > 0 && (
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
              {turns.map((turn, index) => (
                <div
                  key={index}
                  className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                      turn.role === "user"
                        ? "bg-[oklch(0.72_0.2_245/0.16)] text-white"
                        : "border border-white/[0.06] bg-[oklch(0.1_0.016_260)] text-[oklch(0.78_0.02_260)]"
                    }`}
                  >
                    {turn.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-xs text-[oklch(0.6_0.02_260)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {agent.name} is responding...
                </div>
              )}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <input
              className="beta-input w-full text-sm"
              value={input}
              maxLength={4000}
              placeholder={`Message ${agent.name}...`}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-[oklch(0.72_0.2_245)] px-3 text-[oklch(0.13_0.015_260)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-rose-300">{error}</p>
      )}
    </div>
  );
}

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
  roomId,
  statusLabelForAgent,
}: AgentSelectorProps) {
  const agents = getAvailableAgents();

  // Experimental external agents (Phase 3.10). Default (flag off) => empty, so the
  // selector behaves exactly as before. When the flag is on, these are the caller's
  // own approved + verified agents and can be invited in TEXT-ONLY mode.
  const [externalAgents, setExternalAgents] = useState<RoomEligibleExternalAgent[]>([]);

  useEffect(() => {
    let active = true;
    void listRoomEligibleExternalAgents().then((result) => {
      if (active && result.enabled) {
        setExternalAgents(result.agents);
      }
    });
    return () => {
      active = false;
    };
  }, []);

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

      {externalAgents.length > 0 && (
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5 text-amber-300" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300">
              Experimental · Text-only developer agents
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[oklch(0.6_0.02_260)]">
            Your approved + verified agents. They can be invited into this room in{" "}
            <span className="text-amber-300">experimental text-only</span> mode — no audio, no
            room transcript. Only you (the owner) can message them.
          </p>

          <div className="mt-4 space-y-3">
            {externalAgents.map((agent) => (
              <ExternalAgentRoomCard
                key={agent.id}
                agent={agent}
                roomId={roomId}
                inRoom={participants.some(
                  (participant) => participant.id === externalAgentParticipantId(agent.id),
                )}
                formatCapability={formatCapability}
              />
            ))}
          </div>
        </div>
      )}
    </BetaPanel>
  );
}
