"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  FlaskConical,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  SendHorizonal,
  ShieldCheck,
  Sparkles,
  TimerOff,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  BetaButton,
  BetaEyebrow,
  BetaHeader,
  BetaPanel,
  BetaShell,
} from "@/components/BetaChrome";
import { useAuth } from "@/lib/auth";
import {
  AgentRegistryError,
  listRegisteredAgents,
  sendSandboxMessage,
  startSandboxSession,
  type RegisteredAgent,
  type SandboxSession,
  type SandboxToolInvocation,
} from "@/lib/agents/registry-client";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---- Runtime status model (mirrors AgentRuntimeEvent lifecycle) -------------

type RuntimeStatus =
  | "not_started"
  | "ready"
  | "thinking"
  | "streaming"
  | "replied"
  | "error"
  | "expired";

const runtimeStatusMeta: Record<
  RuntimeStatus,
  { label: string; className: string; icon: typeof Circle }
> = {
  not_started: {
    label: "Not started",
    className: "border-[var(--glass-border)] bg-[var(--subtle-fill)] text-[var(--muted-foreground)]",
    icon: Circle,
  },
  ready: {
    label: "Ready",
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    icon: CheckCircle2,
  },
  thinking: {
    label: "Thinking",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    icon: Loader2,
  },
  streaming: {
    label: "Streaming",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    icon: Sparkles,
  },
  replied: {
    label: "Replied",
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    icon: CheckCircle2,
  },
  error: {
    label: "Error",
    className: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    icon: AlertTriangle,
  },
  expired: {
    label: "Expired",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    icon: TimerOff,
  },
};

function RuntimeStatusBadge({ status }: { status: RuntimeStatus }) {
  const meta = runtimeStatusMeta[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${meta.className}`}
    >
      <Icon className={`h-3 w-3 ${status === "thinking" ? "animate-spin" : ""}`} />
      {meta.label}
    </span>
  );
}

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ---- Tools Used panel -------------------------------------------------------

const toolStatusIcon: Record<SandboxToolInvocation["status"], typeof Check> = {
  pending: Circle,
  running: Loader2,
  completed: Check,
  failed: XCircle,
};

const toolStatusClass: Record<SandboxToolInvocation["status"], string> = {
  pending: "text-[var(--muted-foreground)]",
  running: "text-sky-300",
  completed: "text-emerald-300",
  failed: "text-rose-300",
};

function ToolsUsedPanel({ tools }: { tools: SandboxToolInvocation[] }) {
  return (
    <div className="mt-2 rounded-md border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        <Wrench className="h-3 w-3" />
        Tools used
      </p>
      <ul className="mt-1.5 space-y-1">
        {tools.map((tool, index) => {
          const Icon = toolStatusIcon[tool.status];
          return (
            <li key={`${tool.name}-${index}`} className="flex items-center gap-1.5 text-xs">
              <Icon
                className={`h-3.5 w-3.5 ${tool.status === "running" ? "animate-spin" : ""} ${toolStatusClass[tool.status]}`}
              />
              <span className="font-mono text-[oklch(0.78_0.02_260)]">{tool.name}</span>
              <span className="text-[10px] text-[var(--muted-foreground)]">{tool.status}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[10px] text-[var(--muted-foreground)]">Visual simulation only.</p>
    </div>
  );
}

// ---- Agent metadata panel (active agent) ------------------------------------

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px,1fr] gap-3 text-xs">
      <span className="font-mono uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="min-w-0 break-words text-[oklch(0.78_0.02_260)]">{children}</span>
    </div>
  );
}

function Chips({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <span className="text-[var(--muted-foreground)]">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className="rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]"
        >
          {value}
        </span>
      ))}
    </span>
  );
}

function AgentMetadataPanel({ agent }: { agent: RegisteredAgent }) {
  return (
    <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Active agent
      </p>
      <div className="mt-3 space-y-2">
        <MetaRow label="Name">{agent.name}</MetaRow>
        <MetaRow label="Slug">
          <span className="font-mono">{agent.slug}</span>
        </MetaRow>
        <MetaRow label="Status">{agent.status}</MetaRow>
        <MetaRow label="Verified">{agent.verificationStatus}</MetaRow>
        <MetaRow label="Endpoint">
          {agent.endpointUrl ? (
            <span className="font-mono">{agent.endpointUrl}</span>
          ) : (
            <span className="text-[var(--muted-foreground)]">—</span>
          )}
        </MetaRow>
        <MetaRow label="Capabilities">
          <Chips values={agent.capabilities} />
        </MetaRow>
        <MetaRow label="Permissions">
          <Chips values={agent.permissions} />
        </MetaRow>
        <MetaRow label="Tags">
          <Chips values={agent.tags} />
        </MetaRow>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1 text-[11px] font-medium text-amber-200">
        <Lock className="h-3 w-3" />
        Sandbox only — not available in live rooms yet.
      </p>
    </div>
  );
}

// ---- Multi-agent runtime panel ----------------------------------------------

type ChatTurn =
  | { kind: "developer"; id: string; text: string; at: number }
  | {
      kind: "agent";
      id: string;
      agentId: string;
      agentName: string;
      text: string;
      at: number;
      tools?: SandboxToolInvocation[];
      streaming?: boolean;
      error?: string;
    };

function MultiAgentSandboxPanel({
  session,
  sessionAgents,
  onRestart,
  onNewSelection,
  restarting,
}: {
  session: SandboxSession;
  sessionAgents: RegisteredAgent[];
  onRestart: () => void;
  onNewSelection: () => void;
  restarting: boolean;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<RuntimeStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const [activeAgentId, setActiveAgentId] = useState(session.agents[0]?.id ?? "");
  const [expired, setExpired] = useState(() => Date.now() >= new Date(session.expiresAt).getTime());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const idRef = useRef(0);
  const newId = () => String((idRef.current += 1));
  const multiAgent = session.agents.length > 1;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const check = () => {
      if (Date.now() >= new Date(session.expiresAt).getTime()) {
        setExpired(true);
      }
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [session.expiresAt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, status]);

  const busy = status === "thinking" || status === "streaming";
  const effectiveStatus: RuntimeStatus = expired ? "expired" : status;
  const activeAgent = sessionAgents.find((agent) => agent.id === activeAgentId) ?? sessionAgents[0];

  const patchTurnById = (id: string, patch: Partial<Extract<ChatTurn, { kind: "agent" }>>) => {
    setTurns((prev) =>
      prev.map((turn) => (turn.kind === "agent" && turn.id === id ? { ...turn, ...patch } : turn)),
    );
  };

  // Simulated per-response token streaming (client-side only; no SSE/websocket).
  const streamInto = async (id: string, fullText: string) => {
    const tokens = fullText.match(/\S+\s*/g) ?? [fullText];
    let acc = "";
    for (const token of tokens) {
      if (!mountedRef.current) return;
      acc += token;
      patchTurnById(id, { text: acc });
      await sleep(40);
    }
    if (!mountedRef.current) return;
    patchTurnById(id, { text: fullText, streaming: false });
  };

  const send = async (broadcast: boolean) => {
    const text = input.trim();
    if (!text || busy || expired) {
      return;
    }
    setError(null);
    setInput("");
    setTurns((prev) => [...prev, { kind: "developer", id: newId(), text, at: Date.now() }]);
    setStatus("thinking");
    try {
      const result = await sendSandboxMessage(
        session.sandboxRoomId,
        text,
        broadcast ? { broadcast: true } : { targetAgentId: activeAgentId },
      );
      if (!mountedRef.current) return;

      const streamJobs: Promise<void>[] = [];
      for (const entry of result.replies) {
        const id = newId();
        if (entry.ok) {
          const streaming = entry.reply.streaming === true;
          setTurns((prev) => [
            ...prev,
            {
              kind: "agent",
              id,
              agentId: entry.agentId,
              agentName: entry.agentName,
              text: streaming ? "" : entry.reply.text,
              at: Date.now(),
              tools: entry.reply.tools,
              streaming,
            },
          ]);
          if (streaming) {
            streamJobs.push(streamInto(id, entry.reply.text));
          }
        } else {
          setTurns((prev) => [
            ...prev,
            {
              kind: "agent",
              id,
              agentId: entry.agentId,
              agentName: entry.agentName,
              text: "",
              at: Date.now(),
              error: entry.error.detail,
            },
          ]);
        }
      }

      if (streamJobs.length > 0) {
        setStatus("streaming");
        await Promise.all(streamJobs);
      }
      if (!mountedRef.current) return;
      setStatus("replied");
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(
        caught instanceof AgentRegistryError ? caught.message : "Could not reach the sandbox.",
      );
      setStatus("error");
      if (caught instanceof AgentRegistryError && caught.code === "invalid_sandbox_session") {
        setExpired(true);
      }
    }
  };

  const resetConversation = () => {
    setTurns([]);
    setError(null);
    setStatus(expired ? "expired" : "ready");
  };

  return (
    <div className="space-y-4">
      {/* Runtime status + session facts */}
      <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <ShieldCheck className="h-4 w-4 text-sky-300" />
            Sandbox runtime
            <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <Users className="h-3.5 w-3.5" />
              {session.agents.length} agent{session.agents.length === 1 ? "" : "s"}
            </span>
          </div>
          <RuntimeStatusBadge status={effectiveStatus} />
        </div>
        <dl className="mt-3 grid gap-1.5 text-xs text-[var(--muted-foreground)]">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-mono uppercase tracking-[0.12em]">Session id</dt>
            <dd className="break-all font-mono text-[oklch(0.78_0.02_260)]">
              {session.sandboxRoomId}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-mono uppercase tracking-[0.12em]">Expires at</dt>
            <dd>{new Date(session.expiresAt).toLocaleString()}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-mono uppercase tracking-[0.12em]">Runtime</dt>
            <dd className="font-mono text-amber-300">runtimeReady: {String(session.runtimeReady)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onNewSelection}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          <RotateCcw className="h-3 w-3" />
          Start a different session
        </button>
      </div>

      {/* Agent target pills */}
      <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          {multiAgent ? "Target agent" : "Agent"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {session.agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => setActiveAgentId(agent.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                activeAgentId === agent.id
                  ? "border-[oklch(0.72_0.2_245/0.5)] bg-[oklch(0.72_0.2_245/0.12)] text-[var(--foreground)]"
                  : "border-[var(--glass-border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {agent.name}
            </button>
          ))}
        </div>
      </div>

      {activeAgent ? <AgentMetadataPanel agent={activeAgent} /> : null}

      {/* Conversation */}
      <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Conversation
          </p>
          <button
            type="button"
            onClick={resetConversation}
            disabled={turns.length === 0 && !error}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>

        <div ref={scrollRef} className="mt-3 max-h-96 space-y-2.5 overflow-y-auto">
          {turns.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Send a message to {multiAgent ? "your selected agent or all agents" : "your agent"}.
              Replies are returned here — no production room is involved.
            </p>
          ) : null}
          {turns.map((turn) =>
            turn.kind === "developer" ? (
              <div key={turn.id} className="flex flex-col items-end">
                <div className="max-w-[85%] rounded-lg bg-[oklch(0.72_0.2_245/0.16)] px-3 py-2 text-sm leading-relaxed text-[var(--foreground)]">
                  {turn.text}
                </div>
                <span className="mt-1 px-1 font-mono text-[10px] text-[var(--muted-foreground)]">
                  You · {formatTime(turn.at)}
                </span>
              </div>
            ) : (
              <div key={turn.id} className="flex flex-col items-start">
                {multiAgent ? (
                  <span className="mb-0.5 px-1 font-mono text-[10px] font-medium text-[oklch(0.72_0.2_245)]">
                    {turn.agentName}
                  </span>
                ) : null}
                <div
                  className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm leading-relaxed ${
                    turn.error
                      ? "border-rose-400/30 bg-rose-400/[0.08] text-rose-200"
                      : "border-[var(--glass-border)] bg-[var(--background)] text-[oklch(0.78_0.02_260)]"
                  }`}
                >
                  {turn.error ? (
                    <span className="inline-flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {turn.error}
                    </span>
                  ) : (
                    <>
                      {turn.text}
                      {turn.streaming ? (
                        <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[oklch(0.72_0.2_245)] align-middle" />
                      ) : null}
                    </>
                  )}
                </div>
                {!turn.error && turn.tools && turn.tools.length > 0 ? (
                  <div className="w-[85%] max-w-[85%]">
                    <ToolsUsedPanel tools={turn.tools} />
                  </div>
                ) : null}
                <span className="mt-1 px-1 font-mono text-[10px] text-[var(--muted-foreground)]">
                  {turn.agentName} · {formatTime(turn.at)}
                </span>
              </div>
            ),
          )}
          {status === "thinking" ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Waiting for {multiAgent ? "agents" : activeAgent?.name ?? "the agent"}...
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[0.08] p-2.5 text-xs text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {expired ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-200">
              <Clock className="h-3.5 w-3.5" />
              This sandbox session has expired.
            </span>
            <BetaButton onClick={onRestart} disabled={restarting}>
              {restarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4" />
                  Start new session
                </>
              )}
            </BetaButton>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <textarea
              className="beta-input min-h-[44px] w-full resize-none"
              rows={1}
              value={input}
              maxLength={4000}
              placeholder="Message your agent...  (Enter to send, Shift+Enter for newline)"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(false);
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void send(false)}
                disabled={busy || !input.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-[oklch(0.72_0.2_245)] px-3.5 py-2 text-sm font-medium text-[oklch(0.13_0.015_260)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <SendHorizonal className="h-4 w-4" />
                Send to {activeAgent?.name ?? "agent"}
              </button>
              {multiAgent ? (
                <button
                  type="button"
                  onClick={() => void send(true)}
                  disabled={busy || !input.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[oklch(0.72_0.2_245/0.5)] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[oklch(0.72_0.2_245/0.1)] disabled:opacity-50"
                >
                  <Users className="h-4 w-4" />
                  Send to all
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

function eligibility(agent: RegisteredAgent) {
  if (agent.status !== "approved") {
    return { ok: false, reason: "Awaiting approval" };
  }
  if (agent.verificationStatus !== "verified") {
    return { ok: false, reason: "Endpoint not verified" };
  }
  if (!agent.endpointUrl) {
    return { ok: false, reason: "No endpoint URL" };
  }
  return { ok: true, reason: "Ready to sandbox" };
}

const SETUP_STEPS = [
  "Run a sample agent locally (examples/agents/research-agent or code-assistant).",
  "Expose your local endpoint with a tunnel (ngrok / cloudflared).",
  "Register the endpoint URL at /developers/agents and submit for review.",
  "An admin approves your agent.",
  "An admin verifies the endpoint (handshake health check).",
  "Once approved + verified, select agents below and start a session.",
];

export default function DeveloperSandboxPage() {
  const { user, initialized } = useAuth();
  const router = useRouter();

  const [agents, setAgents] = useState<RegisteredAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<SandboxSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listRegisteredAgents();
      setAgents(result);
    } catch (caught) {
      setError(
        caught instanceof AgentRegistryError ? caught.message : "Could not load your agents.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized && !user) {
      router.replace("/login?next=/developers/sandbox");
    }
  }, [initialized, router, user]);

  useEffect(() => {
    if (initialized && user) {
      void loadAgents();
    }
  }, [initialized, user, loadAgents]);

  const eligibleAgents = useMemo(
    () => agents.filter((agent) => eligibility(agent).ok),
    [agents],
  );

  // Full records for the agents in the active session (for metadata panels).
  const sessionAgents = useMemo(() => {
    if (!session) {
      return [];
    }
    return session.agents
      .map((summary) => agents.find((agent) => agent.id === summary.id))
      .filter((agent): agent is RegisteredAgent => Boolean(agent));
  }, [session, agents]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startSession = async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    setStarting(true);
    setActionError(null);
    try {
      const created = await startSandboxSession(ids);
      setSession(created);
    } catch (caught) {
      setActionError(
        caught instanceof AgentRegistryError ? caught.message : "Could not start the sandbox.",
      );
    } finally {
      setStarting(false);
    }
  };

  if (!initialized) {
    return (
      <BetaShell>
        <div className="grid min-h-screen place-items-center">
          <div className="beta-status-pill">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[oklch(0.72_0.2_245)]" />
            Loading sandbox
          </div>
        </div>
      </BetaShell>
    );
  }

  if (!user) {
    return (
      <BetaShell>
        <BetaHeader />
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-3xl place-items-center px-6 py-16">
          <BetaPanel className="w-full p-8 text-center sm:p-12">
            <BetaEyebrow>Developer Sandbox</BetaEyebrow>
            <h1 className="beta-text-gradient mt-6 text-3xl font-semibold tracking-tight">
              Sign in to test your agents
            </h1>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-[oklch(0.65_0.02_260)]">
              The sandbox lets you test your own approved, verified agents in isolation.
            </p>
            <div className="mt-8 flex justify-center">
              <BetaButton href="/login?next=/developers/sandbox">
                Sign In
                <ArrowRight className="h-4 w-4" />
              </BetaButton>
            </div>
          </BetaPanel>
        </div>
      </BetaShell>
    );
  }

  return (
    <BetaShell>
      <BetaHeader>
        <BetaButton href="/developers/agents" variant="quiet">
          Dashboard
        </BetaButton>
      </BetaHeader>

      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex flex-col gap-3">
          <BetaEyebrow>Developer Sandbox</BetaEyebrow>
          <h1 className="beta-text-gradient flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            <FlaskConical className="h-7 w-7 text-[oklch(0.72_0.2_245)]" />
            Multi-agent sandbox
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-[oklch(0.65_0.02_260)]">
            Select one or more of your approved, verified agents and test them together — send a
            message to one agent or broadcast to all. Sandbox sessions never touch production rooms.
          </p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <p className="text-sm leading-relaxed text-[oklch(0.82_0.02_260)]">
            The sandbox is isolated from live rooms and only opens for your own agents that are
            both <span className="font-medium">approved</span> and{" "}
            <span className="font-medium">endpoint-verified</span>. Messaging is live and goes
            straight to your endpoints, but the room runtime stays off — the sandbox never connects
            your agents into a production room, and this is not a public multi-agent room.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
            {session ? "Active session" : "Select agents"}
          </h2>
          <button
            type="button"
            onClick={() => void loadAgents()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {actionError ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[0.08] p-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[0.08] p-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-4">
          {/* Active multi-agent session */}
          {session ? (
            <MultiAgentSandboxPanel
              key={session.sandboxRoomId}
              session={session}
              sessionAgents={sessionAgents}
              restarting={starting}
              onRestart={() => void startSession(session.agents.map((agent) => agent.id))}
              onNewSelection={() => setSession(null)}
            />
          ) : (
            <>
              {loading && agents.length === 0 ? (
                <BetaPanel className="p-6">
                  <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading your agents...
                  </div>
                </BetaPanel>
              ) : null}

              {/* No eligible agents → setup steps */}
              {!loading && !error && eligibleAgents.length === 0 ? (
                <BetaPanel className="p-6">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    No approved + verified agents yet.
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Get an agent approved and endpoint-verified to test it here.
                  </p>
                  <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                    {SETUP_STEPS.map((step, index) => (
                      <li
                        key={step}
                        className="flex gap-2.5 rounded-lg border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-3 text-sm text-[oklch(0.74_0.02_260)]"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[oklch(0.72_0.2_245/0.14)] font-mono text-[11px] text-[oklch(0.72_0.2_245)]">
                          {index + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-5">
                    <BetaButton href="/developers/agents" variant="glass">
                      Go to dashboard
                    </BetaButton>
                  </div>
                </BetaPanel>
              ) : null}

              {/* Selection list */}
              {agents.length > 0 ? (
                <div className="space-y-3">
                  {agents.map((agent) => {
                    const status = eligibility(agent);
                    const selected = selectedIds.has(agent.id);
                    return (
                      <BetaPanel key={agent.id} className="p-4">
                        <label
                          className={`flex items-start gap-3 ${
                            status.ok ? "cursor-pointer" : "cursor-not-allowed opacity-70"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-[oklch(0.72_0.2_245)]"
                            checked={selected}
                            disabled={!status.ok}
                            onChange={() => toggleSelected(agent.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base font-semibold text-[var(--foreground)]">
                                {agent.name}
                              </h3>
                              {status.ok ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                                  <Check className="h-3 w-3" />
                                  Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                                  <Lock className="h-3 w-3" />
                                  {status.reason}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 font-mono text-xs text-[var(--muted-foreground)]">
                              {agent.slug} · {agent.status} · {agent.verificationStatus}
                            </p>
                            {agent.capabilities.length > 0 ? (
                              <div className="mt-2">
                                <Chips values={agent.capabilities} />
                              </div>
                            ) : null}
                          </div>
                        </label>
                      </BetaPanel>
                    );
                  })}

                  {eligibleAgents.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-4">
                      <span className="text-sm text-[var(--muted-foreground)]">
                        {selectedIds.size} selected
                      </span>
                      <BetaButton
                        onClick={() => void startSession([...selectedIds])}
                        disabled={selectedIds.size === 0 || starting}
                      >
                        {starting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Starting
                          </>
                        ) : (
                          <>
                            <FlaskConical className="h-4 w-4" />
                            Start sandbox session
                          </>
                        )}
                      </BetaButton>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!loading && !error && agents.length === 0 ? (
                <BetaPanel className="p-8 text-center">
                  <p className="text-sm font-medium text-[var(--foreground)]">No agents yet.</p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Register an agent and get it approved and verified to test it here.
                  </p>
                  <div className="mt-5 flex justify-center">
                    <BetaButton href="/developers/agents" variant="glass">
                      Go to dashboard
                    </BetaButton>
                  </div>
                </BetaPanel>
              ) : null}
            </>
          )}
        </div>
      </div>
    </BetaShell>
  );
}
