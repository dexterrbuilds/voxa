"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
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
  createRegisteredAgent,
  listRegisteredAgents,
  updateRegisteredAgent,
  type AgentRegistrationPayload,
  type CreatableAgentStatus,
  type EditableAgentVisibility,
  type RegisteredAgent,
  type RegisteredAgentStatus,
} from "@/lib/agents/registry-client";

const DOCS_URL = "https://usevoxa.tech/developers/docs";
const SDK_DOCS_URL = "https://usevoxa.tech/developers/docs/sdk";

type FormState = {
  name: string;
  slug: string;
  description: string;
  avatarUrl: string;
  endpointUrl: string;
  capabilities: string;
  permissions: string;
  tags: string;
  status: CreatableAgentStatus;
  visibility: EditableAgentVisibility;
  metadata: string;
};

const emptyForm: FormState = {
  name: "",
  slug: "",
  description: "",
  avatarUrl: "",
  endpointUrl: "",
  capabilities: "",
  permissions: "",
  tags: "",
  status: "pending_review",
  visibility: "private",
  metadata: "",
};

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function splitList(value: string) {
  const seen = new Set<string>();
  for (const item of value.split(",")) {
    const trimmed = item.trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

function joinList(values: string[]) {
  return values.join(", ");
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isEditableAgent(agent: RegisteredAgent) {
  return agent.status === "draft" || agent.status === "pending_review";
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[oklch(0.82_0.02_260)]">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs leading-relaxed text-[var(--muted-foreground)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export default function DeveloperAgentsPage() {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const formRef = useRef<HTMLDivElement | null>(null);

  const [agents, setAgents] = useState<RegisteredAgent[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const editingAgent = useMemo(
    () => agents.find((agent) => agent.id === editingId) ?? null,
    [agents, editingId],
  );

  const loadAgents = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const result = await listRegisteredAgents();
      setAgents(result);
    } catch (error) {
      const message =
        error instanceof AgentRegistryError
          ? error.message
          : "Could not load your agents. Try again.";
      setListError(message);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized && !user) {
      router.replace("/login?next=/developers/agents");
    }
  }, [initialized, router, user]);

  useEffect(() => {
    if (initialized && user) {
      void loadAgents();
    }
  }, [initialized, user, loadAgents]);

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
  };

  const startEdit = (agent: RegisteredAgent) => {
    setEditingId(agent.id);
    setFormError(null);
    setSuccessMessage(null);
    setForm({
      name: agent.name,
      slug: agent.slug,
      description: agent.description,
      avatarUrl: agent.avatarUrl ?? "",
      endpointUrl: agent.endpointUrl ?? "",
      capabilities: joinList(agent.capabilities),
      permissions: joinList(agent.permissions),
      tags: joinList(agent.tags),
      status: agent.status === "draft" ? "draft" : "pending_review",
      visibility: agent.visibility === "unlisted" ? "unlisted" : "private",
      metadata:
        agent.metadata && Object.keys(agent.metadata).length > 0
          ? JSON.stringify(agent.metadata, null, 2)
          : "",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const buildPayload = (): AgentRegistrationPayload | null => {
    let metadata: Record<string, unknown> = {};
    const metadataText = form.metadata.trim();
    if (metadataText) {
      try {
        const parsed = JSON.parse(metadataText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setFormError("Metadata must be a JSON object, for example {\"team\":\"voxa\"}.");
          return null;
        }
        metadata = parsed as Record<string, unknown>;
      } catch {
        setFormError("Metadata must be valid JSON.");
        return null;
      }
    }

    const name = form.name.trim();
    const slug = form.slug.trim() || slugify(name);

    return {
      name,
      slug,
      description: form.description.trim(),
      avatarUrl: form.avatarUrl.trim() || null,
      endpointUrl: form.endpointUrl.trim() || null,
      capabilities: splitList(form.capabilities),
      permissions: splitList(form.permissions),
      tags: splitList(form.tags),
      status: form.status,
      visibility: form.visibility,
      metadata,
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!form.name.trim()) {
      setFormError("Agent name is required.");
      return;
    }

    const payload = buildPayload();
    if (!payload) {
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        const updated = await updateRegisteredAgent(editingId, payload);
        setAgents((prev) => prev.map((agent) => (agent.id === updated.id ? updated : agent)));
        setSuccessMessage(`Saved changes to ${updated.name}.`);
      } else {
        const created = await createRegisteredAgent(payload);
        setAgents((prev) => [created, ...prev]);
        setSuccessMessage(
          `Registered ${created.name}. It enters the review queue and is not available in rooms yet.`,
        );
      }
      resetForm();
    } catch (error) {
      const message =
        error instanceof AgentRegistryError
          ? error.message
          : "Could not save the agent. Try again.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!initialized) {
    return (
      <BetaShell>
        <div className="grid min-h-screen place-items-center">
          <div className="beta-status-pill">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[oklch(0.72_0.2_245)]" />
            Loading developer dashboard
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
            <BetaEyebrow>Developer Access</BetaEyebrow>
            <h1 className="beta-text-gradient mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
              Sign in to manage your agents
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[oklch(0.65_0.02_260)]">
              The agent registration dashboard requires a Voxa account. Sign in to submit and
              manage your agent metadata.
            </p>
            <div className="mt-8 flex justify-center">
              <BetaButton href="/login?next=/developers/agents">
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
        <BetaButton href="/" variant="quiet">
          Rooms
        </BetaButton>
      </BetaHeader>

      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-3">
          <BetaEyebrow>Agent Registration</BetaEyebrow>
          <h1 className="beta-text-gradient max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Developer agent dashboard
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-[oklch(0.65_0.02_260)]">
            Submit and manage your agent registration metadata. Registrations are reviewed before
            any agent can appear in a Voxa room.
          </p>
        </div>

        {/* Review-required warning */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="text-sm leading-relaxed text-[oklch(0.82_0.02_260)]">
            <p className="font-medium text-amber-200">
              Registered agents are not available in live rooms until reviewed and approved.
            </p>
            <p className="mt-1 text-[var(--muted-foreground)]">
              External agents are registration-only today. They do not appear in the Agent Selector
              and cannot be invited into rooms yet. Public visibility and self-approval are
              disabled.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={DOCS_URL}
            rel="noreferrer"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Developer docs
          </a>
          <a
            href={SDK_DOCS_URL}
            rel="noreferrer"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <Boxes className="h-3.5 w-3.5" />
            SDK docs
          </a>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          {/* Registration / edit form */}
          <div ref={formRef}>
            <BetaPanel className="p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">
                  {editingId ? (
                    <>
                      <Pencil className="h-4 w-4 text-[oklch(0.72_0.2_245)]" />
                      Edit agent
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 text-[oklch(0.72_0.2_245)]" />
                      Register an agent
                    </>
                  )}
                </h2>
                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                ) : null}
              </div>

              {editingAgent ? (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  Editing <span className="font-mono">{editingAgent.slug}</span>. Only draft and
                  pending-review agents can be edited.
                </p>
              ) : null}

              <form className="mt-5 space-y-4" noValidate onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name">
                    <input
                      className="beta-input w-full"
                      value={form.name}
                      maxLength={120}
                      placeholder="Research Agent"
                      onChange={(event) => updateField("name", event.target.value)}
                      onBlur={() => {
                        if (!form.slug.trim() && form.name.trim()) {
                          updateField("slug", slugify(form.name));
                        }
                      }}
                    />
                  </Field>
                  <Field label="Slug" hint="Lowercase letters, numbers, hyphens.">
                    <input
                      className="beta-input w-full font-mono"
                      value={form.slug}
                      maxLength={80}
                      placeholder="research-agent"
                      onChange={(event) => updateField("slug", event.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Description">
                  <textarea
                    className="beta-input min-h-[84px] w-full resize-y"
                    value={form.description}
                    maxLength={1000}
                    placeholder="What your agent does inside a Voxa room."
                    onChange={(event) => updateField("description", event.target.value)}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Endpoint URL" hint="https endpoint the runtime will call later.">
                    <input
                      className="beta-input w-full"
                      value={form.endpointUrl}
                      maxLength={600}
                      placeholder="https://agent.example.com/voxa"
                      onChange={(event) => updateField("endpointUrl", event.target.value)}
                    />
                  </Field>
                  <Field label="Avatar URL">
                    <input
                      className="beta-input w-full"
                      value={form.avatarUrl}
                      maxLength={600}
                      placeholder="https://.../avatar.png"
                      onChange={(event) => updateField("avatarUrl", event.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Capabilities" hint="Comma-separated, e.g. web_search, memory.">
                  <input
                    className="beta-input w-full"
                    value={form.capabilities}
                    placeholder="web_search, memory, multilingual"
                    onChange={(event) => updateField("capabilities", event.target.value)}
                  />
                </Field>

                <Field
                  label="Permissions"
                  hint="Comma-separated, e.g. room:join, message:read, voice:speak."
                >
                  <input
                    className="beta-input w-full"
                    value={form.permissions}
                    placeholder="room:join, message:read, voice:speak"
                    onChange={(event) => updateField("permissions", event.target.value)}
                  />
                </Field>

                <Field label="Tags" hint="Comma-separated keywords for discovery.">
                  <input
                    className="beta-input w-full"
                    value={form.tags}
                    placeholder="research, summaries"
                    onChange={(event) => updateField("tags", event.target.value)}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Submission status">
                    <select
                      className="beta-input w-full"
                      value={form.status}
                      onChange={(event) =>
                        updateField("status", event.target.value as CreatableAgentStatus)
                      }
                    >
                      <option value="draft">Draft (save privately)</option>
                      <option value="pending_review">Pending review (submit)</option>
                    </select>
                  </Field>
                  <Field label="Visibility" hint="Public publishing is not available yet.">
                    <select
                      className="beta-input w-full"
                      value={form.visibility}
                      onChange={(event) =>
                        updateField("visibility", event.target.value as EditableAgentVisibility)
                      }
                    >
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                    </select>
                  </Field>
                </div>

                <Field label="Metadata (optional)" hint="JSON object. Leave empty if unused.">
                  <textarea
                    className="beta-input min-h-[72px] w-full resize-y font-mono text-xs"
                    value={form.metadata}
                    placeholder='{"team":"voxa"}'
                    onChange={(event) => updateField("metadata", event.target.value)}
                  />
                </Field>

                {formError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[0.08] p-3 text-sm text-rose-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <BetaButton type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving
                      </>
                    ) : editingId ? (
                      <>
                        Save changes
                        <ArrowRight className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Register agent
                        <Sparkles className="h-4 w-4" />
                      </>
                    )}
                  </BetaButton>
                  {editingId ? (
                    <BetaButton type="button" variant="glass" onClick={resetForm}>
                      Cancel
                    </BetaButton>
                  ) : null}
                </div>
              </form>
            </BetaPanel>
          </div>

          {/* Agent list */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                Your agents
              </h2>
              <button
                type="button"
                onClick={() => void loadAgents()}
                disabled={listLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            {successMessage ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/[0.08] p-3 text-sm text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            ) : null}

            {listError ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[0.08] p-3 text-sm text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{listError}</span>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {listLoading && agents.length === 0 ? (
                <BetaPanel className="p-6">
                  <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading your agents...
                  </div>
                </BetaPanel>
              ) : null}

              {!listLoading && !listError && agents.length === 0 ? (
                <BetaPanel className="p-8 text-center">
                  <Boxes className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
                  <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
                    No agents registered yet.
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Register your first agent using the form to start the review process.
                  </p>
                </BetaPanel>
              ) : null}

              {agents.map((agent) => {
                const created = formatDate(agent.createdAt);
                const updated = formatDate(agent.updatedAt);
                const editable = isEditableAgent(agent);
                return (
                  <BetaPanel key={agent.id} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-[var(--foreground)]">
                            {agent.name}
                          </h3>
                          <StatusBadge status={agent.status} />
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-[var(--muted-foreground)]">
                          {agent.slug} · {agent.visibility}
                        </p>
                      </div>
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => startEdit(agent)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[oklch(0.72_0.2_245/0.4)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      ) : (
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                          Locked
                        </span>
                      )}
                    </div>

                    {agent.description ? (
                      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[oklch(0.7_0.02_260)]">
                        {agent.description}
                      </p>
                    ) : null}

                    {agent.capabilities.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {agent.capabilities.map((capability) => (
                          <span
                            key={capability}
                            className="rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]"
                          >
                            {capability}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {created || updated ? (
                      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                        {created ? `Created ${created}` : null}
                        {created && updated ? " · " : null}
                        {updated ? `Updated ${updated}` : null}
                      </p>
                    ) : null}
                  </BetaPanel>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </BetaShell>
  );
}
