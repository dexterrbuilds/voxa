"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
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
  TimerOff,
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
} from "@/lib/agents/registry-client";

// ---- Sandbox runtime state model -------------------------------------------

type RuntimeStatus = "not_started" | "ready" | "sending" | "replied" | "error" | "expired";

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
  sending: {
    label: "Sending",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    icon: Loader2,
  },
  replied: {
    label: "Agent replied",
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
      <Icon className={`h-3 w-3 ${status === "sending" ? "animate-spin" : ""}`} />
      {meta.label}
    </span>
  );
}

type ChatTurn = { role: "developer" | "agent"; text: string; at: number };

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ---- Agent metadata panel ---------------------------------------------------

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
        Agent
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

// ---- Sandbox runtime panel (metadata + status + chat) ----------------------

function SandboxRuntimePanel({
  agent,
  session,
  onRestart,
  restarting,
}: {
  agent: RegisteredAgent;
  session: SandboxSession;
  onRestart: () => void;
  restarting: boolean;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<RuntimeStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(() => Date.now() >= new Date(session.expiresAt).getTime());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Tick to detect session expiry.
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

  // Auto-scroll the conversation to the newest turn.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, status]);

  const sending = status === "sending";
  const effectiveStatus: RuntimeStatus = expired ? "expired" : status;

  const send = async () => {
    const text = input.trim();
    if (!text || sending || expired) {
      return;
    }
    setError(null);
    setInput("");
    setTurns((prev) => [...prev, { role: "developer", text, at: Date.now() }]);
    setStatus("sending");
    try {
      const result = await sendSandboxMessage(session.sandboxRoomId, text);
      setTurns((prev) => [...prev, { role: "agent", text: result.reply.text, at: Date.now() }]);
      setStatus("replied");
    } catch (caught) {
      setError(
        caught instanceof AgentRegistryError ? caught.message : "Could not reach the agent.",
      );
      setStatus("error");
      // A 400 "invalid or expired sandbox session" means the session is no longer usable.
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
    <div className="mt-4 space-y-4">
      {/* Runtime status + session facts */}
      <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <ShieldCheck className="h-4 w-4 text-sky-300" />
            Sandbox runtime
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
      </div>

      <AgentMetadataPanel agent={agent} />

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

        <div ref={scrollRef} className="mt-3 max-h-80 space-y-2.5 overflow-y-auto">
          {turns.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Send a message to your agent endpoint. Replies are returned here — no production room
              is involved.
            </p>
          ) : null}
          {turns.map((turn, index) => (
            <div
              key={index}
              className={`flex flex-col ${turn.role === "developer" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  turn.role === "developer"
                    ? "bg-[oklch(0.72_0.2_245/0.16)] text-[var(--foreground)]"
                    : "border border-[var(--glass-border)] bg-[var(--background)] text-[oklch(0.78_0.02_260)]"
                }`}
              >
                {turn.text}
              </div>
              <span className="mt-1 px-1 font-mono text-[10px] text-[var(--muted-foreground)]">
                {turn.role === "developer" ? "You" : agent.name} · {formatTime(turn.at)}
              </span>
            </div>
          ))}
          {sending ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {agent.name} is responding...
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
          <div className="mt-3 flex gap-2">
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
                  void send();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 self-stretch rounded-md bg-[oklch(0.72_0.2_245)] px-3.5 text-sm font-medium text-[oklch(0.13_0.015_260)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <SendHorizonal className="h-4 w-4" />
              Send
            </button>
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
  return { ok: true, reason: "Ready to sandbox" };
}

export default function DeveloperSandboxPage() {
  const { user, initialized } = useAuth();
  const router = useRouter();

  const [agents, setAgents] = useState<RegisteredAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, SandboxSession>>({});
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

  const handleStart = async (agent: RegisteredAgent) => {
    setBusyId(agent.id);
    setActionError(null);
    try {
      const session = await startSandboxSession(agent.id);
      setSessions((prev) => ({ ...prev, [agent.id]: session }));
    } catch (caught) {
      setActionError(
        caught instanceof AgentRegistryError ? caught.message : "Could not start the sandbox.",
      );
    } finally {
      setBusyId(null);
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
            Agent sandbox
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-[oklch(0.65_0.02_260)]">
            A mini runtime for testing your own approved and verified agents — send messages,
            inspect replies, and watch runtime status. Sandbox sessions never touch production
            rooms.
          </p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <p className="text-sm leading-relaxed text-[oklch(0.82_0.02_260)]">
            The sandbox is isolated from live rooms and only opens for your own agents that are
            both <span className="font-medium">approved</span> and{" "}
            <span className="font-medium">endpoint-verified</span>. Messaging is live and goes
            straight to your endpoint, but the room runtime stays off — the sandbox never connects
            your agent into a production room.
          </p>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            How sandbox testing works
          </h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              "Run the sample agent locally (examples/agents/research-agent).",
              "Expose your local endpoint with a tunnel (ngrok / cloudflared).",
              "Register the endpoint URL at /developers/agents and submit for review.",
              "An admin approves your agent.",
              "An admin verifies the endpoint (handshake health check).",
              "Once approved + verified, start a session below and chat with your agent.",
            ].map((step, index) => (
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
        </div>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
            Your agents
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

        <div className="mt-4 space-y-3">
          {loading && agents.length === 0 ? (
            <BetaPanel className="p-6">
              <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your agents...
              </div>
            </BetaPanel>
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

          {agents.map((agent) => {
            const status = eligibility(agent);
            const session = sessions[agent.id];
            return (
              <BetaPanel key={agent.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-[var(--foreground)]">
                      {agent.name}
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-[var(--muted-foreground)]">
                      {agent.slug} · {agent.status} · {agent.verificationStatus}
                    </p>
                  </div>
                  {status.ok ? (
                    <BetaButton
                      onClick={() => void handleStart(agent)}
                      disabled={busyId === agent.id}
                    >
                      {busyId === agent.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Starting
                        </>
                      ) : session ? (
                        <>
                          <RotateCcw className="h-4 w-4" />
                          Restart session
                        </>
                      ) : (
                        <>
                          <FlaskConical className="h-4 w-4" />
                          Start sandbox
                        </>
                      )}
                    </BetaButton>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)]">
                      <Lock className="h-3.5 w-3.5" />
                      {status.reason}
                    </span>
                  )}
                </div>

                {session ? (
                  <SandboxRuntimePanel
                    key={session.sandboxRoomId}
                    agent={agent}
                    session={session}
                    onRestart={() => void handleStart(agent)}
                    restarting={busyId === agent.id}
                  />
                ) : (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                    <RuntimeStatusBadge status="not_started" />
                  </div>
                )}
              </BetaPanel>
            );
          })}
        </div>
      </div>
    </BetaShell>
  );
}
