"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
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
  AdminApiError,
  listAdminAgents,
  reviewAdminAgent,
  type AdminAgent,
  type ReviewAction,
} from "@/lib/agents/admin-client";
import type { RegisteredAgentStatus } from "@/lib/agents/registry-client";

type StatusFilter = "all" | RegisteredAgentStatus;

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_review", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "disabled", label: "Disabled" },
  { value: "draft", label: "Draft" },
];

const statusLabels: Record<RegisteredAgentStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  disabled: "Disabled",
};

const statusBadgeClasses: Record<RegisteredAgentStatus, string> = {
  draft: "border-[var(--glass-border)] bg-[var(--subtle-fill)] text-[var(--muted-foreground)]",
  pending_review: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  approved: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  rejected: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  disabled: "border-[var(--glass-border)] bg-[var(--subtle-fill)] text-[var(--muted-foreground)]",
};

// Mirror of server-side reviewTransitions for button gating only. The server is
// the source of truth and re-validates every transition.
const availableActions: Record<RegisteredAgentStatus, ReviewAction[]> = {
  draft: [],
  pending_review: ["approve", "reject"],
  approved: ["disable"],
  rejected: ["return_to_review"],
  disabled: ["approve"],
};

const actionMeta: Record<
  ReviewAction,
  { label: string; icon: typeof CheckCircle2; tone: string }
> = {
  approve: {
    label: "Approve",
    icon: CheckCircle2,
    tone: "border-emerald-400/40 text-emerald-200 hover:bg-emerald-400/10",
  },
  reject: {
    label: "Reject",
    icon: XCircle,
    tone: "border-rose-400/40 text-rose-200 hover:bg-rose-400/10",
  },
  disable: {
    label: "Disable",
    icon: Ban,
    tone: "border-amber-400/40 text-amber-200 hover:bg-amber-400/10",
  },
  return_to_review: {
    label: "Return to review",
    icon: RotateCcw,
    tone: "border-sky-400/40 text-sky-200 hover:bg-sky-400/10",
  },
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: RegisteredAgentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${statusBadgeClasses[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px,1fr] gap-3 text-sm">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
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

function AgentCard({
  agent,
  onReview,
  busy,
}: {
  agent: AdminAgent;
  onReview: (action: ReviewAction, note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const actions = availableActions[agent.status];
  const created = formatDateTime(agent.createdAt);
  const updated = formatDateTime(agent.updatedAt);
  const reviewedAt = formatDateTime(agent.reviewedAt);
  const metadataKeys = Object.keys(agent.metadata ?? {});

  return (
    <BetaPanel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-[var(--foreground)]">
              {agent.name}
            </h3>
            <StatusBadge status={agent.status} />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              {agent.visibility}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-[var(--muted-foreground)]">{agent.slug}</p>
        </div>
      </div>

      {agent.description ? (
        <p className="mt-3 text-sm leading-relaxed text-[oklch(0.72_0.02_260)]">
          {agent.description}
        </p>
      ) : null}

      <div className="mt-4 space-y-2.5">
        <DetailRow label="Creator">
          {agent.creatorEmail ?? <span className="font-mono">{agent.creatorUserId}</span>}
        </DetailRow>
        <DetailRow label="Endpoint">
          {agent.endpointUrl ? (
            <span className="font-mono text-xs">{agent.endpointUrl}</span>
          ) : (
            <span className="text-[var(--muted-foreground)]">—</span>
          )}
        </DetailRow>
        <DetailRow label="Capabilities">
          <Chips values={agent.capabilities} />
        </DetailRow>
        <DetailRow label="Permissions">
          <Chips values={agent.permissions} />
        </DetailRow>
        <DetailRow label="Tags">
          <Chips values={agent.tags} />
        </DetailRow>
        {metadataKeys.length > 0 ? (
          <DetailRow label="Metadata">
            <pre className="overflow-x-auto rounded-md border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-2 font-mono text-[11px] leading-relaxed text-[var(--muted-foreground)]">
              {JSON.stringify(agent.metadata, null, 2)}
            </pre>
          </DetailRow>
        ) : null}
        <DetailRow label="Dates">
          <span className="text-xs text-[var(--muted-foreground)]">
            {created ? `Created ${created}` : null}
            {created && updated ? " · " : null}
            {updated ? `Updated ${updated}` : null}
          </span>
        </DetailRow>
        {agent.reviewedBy || reviewedAt || agent.reviewNote ? (
          <DetailRow label="Last review">
            <span className="text-xs text-[var(--muted-foreground)]">
              {reviewedAt ? reviewedAt : null}
              {agent.reviewNote ? ` — “${agent.reviewNote}”` : null}
            </span>
          </DetailRow>
        ) : null}
      </div>

      {actions.length > 0 ? (
        <div className="mt-5 border-t border-[var(--hairline-border)] pt-4">
          <input
            className="beta-input w-full"
            value={note}
            maxLength={1000}
            placeholder="Optional review note (saved with the decision)"
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => {
              const meta = actionMeta[action];
              const Icon = meta.icon;
              return (
                <button
                  key={action}
                  type="button"
                  disabled={busy}
                  onClick={() => onReview(action, note)}
                  className={`inline-flex items-center gap-1.5 rounded-md border bg-transparent px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${meta.tone}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-4 border-t border-[var(--hairline-border)] pt-3 text-xs text-[var(--muted-foreground)]">
          No review actions available for {statusLabels[agent.status].toLowerCase()} agents.
        </p>
      )}
    </BetaPanel>
  );
}

export default function AdminAgentsPage() {
  const { user, initialized } = useAuth();
  const router = useRouter();

  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("pending_review");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAgents = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminAgents(status === "all" ? undefined : status);
      setAgents(result);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 403) {
        setForbidden(true);
        setAgents([]);
      } else {
        setError(
          caught instanceof AdminApiError ? caught.message : "Could not load agents. Try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized && !user) {
      router.replace("/login?next=/admin/agents");
    }
  }, [initialized, router, user]);

  useEffect(() => {
    if (initialized && user) {
      void loadAgents(filter);
    }
  }, [initialized, user, filter, loadAgents]);

  const handleReview = async (agent: AdminAgent, action: ReviewAction, note: string) => {
    setBusyId(agent.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await reviewAdminAgent(agent.id, action, note.trim() || undefined);
      setNotice(`${updated.name} is now ${statusLabels[updated.status].toLowerCase()}.`);
      // If the row no longer matches the active filter, drop it; otherwise update it.
      setAgents((prev) =>
        prev
          .map((item) => (item.id === updated.id ? updated : item))
          .filter((item) => filter === "all" || item.status === filter),
      );
    } catch (caught) {
      setError(
        caught instanceof AdminApiError ? caught.message : "Could not update the agent. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const heading = useMemo(() => {
    if (filter === "all") {
      return "All submitted agents";
    }
    return `${statusLabels[filter]} agents`;
  }, [filter]);

  if (!initialized) {
    return (
      <BetaShell>
        <div className="grid min-h-screen place-items-center">
          <div className="beta-status-pill">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[oklch(0.72_0.2_245)]" />
            Loading admin console
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
            <BetaEyebrow>Admin Console</BetaEyebrow>
            <h1 className="beta-text-gradient mt-6 text-3xl font-semibold tracking-tight">
              Sign in to continue
            </h1>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-[oklch(0.65_0.02_260)]">
              The agent review console requires an authorized Voxa admin account.
            </p>
            <div className="mt-8 flex justify-center">
              <BetaButton href="/login?next=/admin/agents">
                Sign In
                <ArrowRight className="h-4 w-4" />
              </BetaButton>
            </div>
          </BetaPanel>
        </div>
      </BetaShell>
    );
  }

  if (forbidden) {
    return (
      <BetaShell>
        <BetaHeader />
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-3xl place-items-center px-6 py-16">
          <BetaPanel className="w-full p-8 text-center sm:p-12">
            <ShieldAlert className="mx-auto h-9 w-9 text-amber-300" />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              Admin access required
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
              Your account is not on the admin allowlist. Ask a Voxa admin to add your email to{" "}
              <span className="font-mono">ADMIN_EMAILS</span> if you need review access.
            </p>
            <div className="mt-7 flex justify-center">
              <BetaButton href="/" variant="glass">
                Back to rooms
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
        <BetaButton href="/" variant="quiet">
          Rooms
        </BetaButton>
      </BetaHeader>

      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="flex flex-col gap-3">
          <BetaEyebrow>Admin · Agent Review</BetaEyebrow>
          <h1 className="beta-text-gradient flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            <ShieldCheck className="h-7 w-7 text-[oklch(0.72_0.2_245)]" />
            Agent review console
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-[oklch(0.65_0.02_260)]">
            Review submitted agent metadata and move records through the approval lifecycle.
          </p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <p className="text-sm leading-relaxed text-[oklch(0.82_0.02_260)]">
            Approved agents are reviewed but{" "}
            <span className="font-medium text-amber-200">not yet available in live rooms</span>{" "}
            until the DB-backed registry is intentionally enabled. Approval here does not add an
            agent to the Agent Selector or allow it to join rooms.
          </p>
        </div>

        {/* Filters */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {statusFilters.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === option.value
                    ? "border-[oklch(0.72_0.2_245/0.5)] bg-[oklch(0.72_0.2_245/0.12)] text-[var(--foreground)]"
                    : "border-[var(--glass-border)] bg-[var(--subtle-fill)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void loadAgents(filter)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {notice ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/[0.08] p-3 text-sm text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[0.08] p-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <h2 className="mt-8 text-lg font-semibold tracking-tight text-[var(--foreground)]">
          {heading}
        </h2>

        <div className="mt-4 space-y-3">
          {loading && agents.length === 0 ? (
            <BetaPanel className="p-6">
              <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading agents...
              </div>
            </BetaPanel>
          ) : null}

          {!loading && !error && agents.length === 0 ? (
            <BetaPanel className="p-8 text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">No agents to review.</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Nothing matches the {filter === "all" ? "current" : statusLabels[filter as RegisteredAgentStatus].toLowerCase()} filter.
              </p>
            </BetaPanel>
          ) : null}

          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              busy={busyId === agent.id}
              onReview={(action, note) => void handleReview(agent, action, note)}
            />
          ))}
        </div>
      </div>
    </BetaShell>
  );
}
