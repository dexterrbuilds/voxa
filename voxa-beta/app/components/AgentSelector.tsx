"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  FlaskConical,
  Loader2,
  MessageSquare,
  RotateCcw,
  SendHorizonal,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { BetaButton, BetaPanel } from "@/components/BetaChrome";
import { getAvailableAgents } from "@/lib/agents";
import {
  AgentRegistryError,
  clearExternalAgentRoomThread,
  externalAgentParticipantId,
  inviteExternalAgentToRoom,
  listRoomEligibleExternalAgents,
  loadExternalAgentRoomThread,
  sendRoomTextMessage,
  type RoomEligibleExternalAgent,
  type SandboxToolInvocation,
} from "@/lib/agents/registry-client";
import {
  roomPermissionBadges,
  type ExternalAgentPermission,
} from "@/lib/agents/permissions";
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type RoomTextTurn = {
  id: string;
  role: "user" | "agent";
  text: string;
  at?: number;
  tools?: SandboxToolInvocation[];
  streaming?: boolean;
};

type RoomTextStatus = "in_room" | "thinking" | "responding" | "error";

const roomStatusMeta: Record<
  RoomTextStatus,
  { label: string; className: string; icon: typeof Circle; spin?: boolean }
> = {
  in_room: {
    label: "In Room",
    className: "border-amber-400/25 bg-amber-400/[0.08] text-amber-300",
    icon: CheckCircle2,
  },
  thinking: {
    label: "Thinking",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    icon: Loader2,
    spin: true,
  },
  responding: {
    label: "Responding",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    icon: Sparkles,
  },
  error: {
    label: "Error",
    className: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    icon: XCircle,
  },
};

const roomToolIcon: Record<SandboxToolInvocation["status"], typeof Check> = {
  pending: Circle,
  running: Loader2,
  completed: Check,
  failed: XCircle,
};

const roomToolClass: Record<SandboxToolInvocation["status"], string> = {
  pending: "text-[oklch(0.55_0.02_260)]",
  running: "text-sky-300",
  completed: "text-emerald-300",
  failed: "text-rose-300",
};

function RoomToolsUsed({ tools }: { tools: SandboxToolInvocation[] }) {
  return (
    <div className="mt-1 rounded-md border border-white/[0.06] bg-[oklch(0.1_0.016_260)] px-2 py-1.5">
      <p className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.14em] text-[oklch(0.55_0.02_260)]">
        <Wrench className="h-2.5 w-2.5" />
        Tools used
      </p>
      <ul className="mt-1 space-y-0.5">
        {tools.map((tool, index) => {
          const Icon = roomToolIcon[tool.status];
          return (
            <li className="flex items-center gap-1 text-[10px]" key={`${tool.name}-${index}`}>
              <Icon
                className={`h-2.5 w-2.5 ${tool.status === "running" ? "animate-spin" : ""} ${roomToolClass[tool.status]}`}
              />
              <span className="font-mono text-[oklch(0.72_0.02_260)]">{tool.name}</span>
              {tool.untrusted ? (
                <span className="rounded-full border border-amber-400/25 px-1 text-[8px] uppercase tracking-[0.1em] text-amber-300/80">
                  untrusted
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatTurnTime(at?: number) {
  if (!at) {
    return "";
  }
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// One experimental external agent: invite (text-only) + a polished per-agent
// thread (room-local memory) with streaming, tools, retry, copy, and a Clear
// button. Text-only — no audio, no transcript, no LiveKit.
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
  const [status, setStatus] = useState<RoomTextStatus>("in_room");
  const [clearing, setClearing] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const idRef = useRef(0);
  const newId = () => String((idRef.current += 1));
  const isInRoom = inRoom || invited;
  const busy = status === "thinking" || status === "responding";
  const permissionBadges = roomPermissionBadges(agent.permissions as ExternalAgentPermission[]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load this agent's existing room thread once it is in the room.
  useEffect(() => {
    if (!isInRoom || !roomId) {
      return;
    }
    let active = true;
    void loadExternalAgentRoomThread(roomId, agent.id).then((thread) => {
      if (active && thread.length > 0) {
        setTurns(
          thread.map((turn) => ({
            id: newId(),
            role: turn.role,
            text: turn.text,
            at: new Date(turn.createdAt).getTime(),
          })),
        );
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInRoom, roomId, agent.id]);

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

  const patchTurn = (id: string, patch: Partial<RoomTextTurn>) => {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  };

  // Simulated streaming reveal (UI-only; no SSE/websocket).
  const revealReply = async (id: string, fullText: string) => {
    setStatus("responding");
    const tokens = fullText.match(/\S+\s*/g) ?? [fullText];
    let acc = "";
    for (const token of tokens) {
      if (!mountedRef.current) return;
      acc += token;
      patchTurn(id, { text: acc });
      await sleep(35);
    }
    if (!mountedRef.current) return;
    patchTurn(id, { text: fullText, streaming: false });
  };

  // Core send. On retry the user turn already exists, so it is not re-appended —
  // this avoids duplicate memory rows (the server persists only on success).
  const runMessage = async (text: string, isRetry: boolean) => {
    if (!roomId) {
      return;
    }
    setError(null);
    setRetryText(null);
    if (!isRetry) {
      setTurns((prev) => [...prev, { id: newId(), role: "user", text, at: Date.now() }]);
    }
    setStatus("thinking");
    try {
      const result = await sendRoomTextMessage(roomId, agent.id, text);
      if (!mountedRef.current) return;
      const { text: replyText, streaming, tools } = result.reply;
      const id = newId();
      setTurns((prev) => [
        ...prev,
        {
          id,
          role: "agent",
          text: streaming ? "" : replyText,
          at: Date.now(),
          tools,
          streaming: streaming === true,
        },
      ]);
      if (streaming) {
        await revealReply(id, replyText);
      }
      if (!mountedRef.current) return;
      setStatus("in_room");
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(caught instanceof AgentRegistryError ? caught.message : "Could not reach the agent.");
      setRetryText(text);
      setStatus("error");
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) {
      return;
    }
    setInput("");
    void runMessage(text, false);
  };

  const clearThread = async () => {
    if (!roomId || clearing) {
      return;
    }
    setClearing(true);
    setError(null);
    try {
      await clearExternalAgentRoomThread(roomId, agent.id);
      setTurns([]);
      setRetryText(null);
      setStatus("in_room");
    } catch (caught) {
      setError(caught instanceof AgentRegistryError ? caught.message : "Could not clear the thread.");
    } finally {
      setClearing(false);
    }
  };

  const copyReply = async (turn: RoomTextTurn) => {
    try {
      await navigator.clipboard.writeText(turn.text);
      setCopiedId(turn.id);
      setTimeout(() => {
        if (mountedRef.current) {
          setCopiedId((current) => (current === turn.id ? null : current));
        }
      }, 1500);
    } catch {
      // Clipboard may be unavailable; silently ignore.
    }
  };

  const statusMeta = roomStatusMeta[status];
  const StatusIcon = statusMeta.icon;

  return (
    <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-400/25 bg-amber-400/[0.08] text-sm font-semibold text-white">
          {initialsFor(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-base font-semibold tracking-tight text-white">
              {agent.name}
            </h3>
            {isInRoom ? (
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${statusMeta.className}`}
              >
                <StatusIcon className={`h-3 w-3 ${statusMeta.spin ? "animate-spin" : ""}`} />
                {statusMeta.label}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300">
                Experimental
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-300/80">
            Text-only · Developer agent
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
          {permissionBadges.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-[oklch(0.5_0.02_260)]">
                Allowed
              </span>
              {permissionBadges.map((badge) => (
                <span
                  className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-0.5 text-[10px] text-emerald-300/90"
                  key={badge}
                >
                  {badge}
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[oklch(0.6_0.02_260)]">
              Text-only thread · no audio
            </p>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => void clearThread()}
                disabled={clearing}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-[oklch(0.6_0.02_260)] transition-colors hover:text-rose-300 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Clear thread
              </button>
            )}
          </div>

          <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
            {turns.length === 0 && status !== "thinking" ? (
              <p className="py-2 text-center text-[11px] text-[oklch(0.55_0.02_260)]">
                No messages yet. Say hi to {agent.name} — replies are text-only.
              </p>
            ) : null}

            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`group flex flex-col ${turn.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                    turn.role === "user"
                      ? "bg-[oklch(0.72_0.2_245/0.16)] text-white"
                      : "border border-white/[0.06] bg-[oklch(0.1_0.016_260)] text-[oklch(0.78_0.02_260)]"
                  }`}
                >
                  {turn.text}
                  {turn.streaming ? (
                    <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[oklch(0.72_0.2_245)] align-middle" />
                  ) : null}
                </div>
                {turn.role === "agent" && turn.tools && turn.tools.length > 0 ? (
                  <div className="w-[88%] max-w-[88%]">
                    <RoomToolsUsed tools={turn.tools} />
                  </div>
                ) : null}
                <div className="mt-0.5 flex items-center gap-2 px-1">
                  <span className="font-mono text-[9px] text-[oklch(0.5_0.02_260)]">
                    {turn.role === "user" ? "You" : agent.name}
                    {turn.at ? ` · ${formatTurnTime(turn.at)}` : ""}
                  </span>
                  {turn.role === "agent" && !turn.streaming && turn.text ? (
                    <button
                      type="button"
                      onClick={() => void copyReply(turn)}
                      className="inline-flex items-center gap-0.5 text-[9px] font-medium text-[oklch(0.5_0.02_260)] opacity-0 transition-opacity hover:text-[oklch(0.72_0.2_245)] group-hover:opacity-100"
                    >
                      {copiedId === turn.id ? (
                        <>
                          <Check className="h-2.5 w-2.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-2.5 w-2.5" />
                          Copy
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {status === "thinking" ? (
              <div className="flex items-center gap-2 text-xs text-[oklch(0.6_0.02_260)]">
                <Loader2 className="h-3 w-3 animate-spin" />
                {agent.name} is thinking...
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-400/25 bg-rose-400/[0.08] px-2.5 py-1.5">
              <span className="text-[11px] text-rose-200">{error}</span>
              {retryText ? (
                <button
                  type="button"
                  onClick={() => void runMessage(retryText, true)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-200 transition-colors hover:text-white disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

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
                  send();
                }
              }}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={busy || !input.trim()}
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-[oklch(0.72_0.2_245)] px-3 text-[oklch(0.13_0.015_260)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {!isInRoom && error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
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
