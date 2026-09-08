import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Code2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BetaButton, BetaEyebrow, BetaHeader, BetaPanel, BetaShell } from "@/components/BetaChrome";
import { getPublicAgentBySlug } from "@/lib/server/agents/showcase";

type AgentDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function initialsFor(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "A"
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "Recently updated";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently updated";
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
      {children}
    </span>
  );
}

export async function generateMetadata({ params }: AgentDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const agent = await getPublicAgentBySlug(slug);

  if (!agent) {
    return {
      title: "Agent not found | Voxa",
    };
  }

  return {
    title: `${agent.name} | Voxa Agents`,
    description: agent.description,
  };
}

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { slug } = await params;
  const agent = await getPublicAgentBySlug(slug);

  if (!agent) {
    notFound();
  }

  return (
    <BetaShell>
      <BetaHeader>
        <BetaButton href="/agents" variant="quiet">
          Browse agents
        </BetaButton>
      </BetaHeader>

      <div className="mx-auto max-w-6xl px-6 pb-24 pt-10 sm:pt-16">
        <Link
          className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
          href="/agents"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to agents
        </Link>

        <section className="mt-8 grid gap-8 lg:grid-cols-[1fr,22rem]">
          <div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {agent.avatarUrl ? (
                <img
                  alt=""
                  className="h-20 w-20 rounded-2xl border border-[var(--glass-border)] object-cover"
                  src={agent.avatarUrl}
                />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-2xl border border-[oklch(0.72_0.2_245/0.28)] bg-[oklch(0.72_0.2_245/0.12)] text-xl font-semibold text-[oklch(0.72_0.2_245)]">
                  {initialsFor(agent.name)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <BetaEyebrow>Developer Preview</BetaEyebrow>
                <h1 className="beta-text-gradient mt-4 text-5xl font-semibold leading-[1.03] tracking-tight sm:text-6xl">
                  {agent.name}
                </h1>
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                  Built by{" "}
                  {agent.creatorUsername ? (
                    <Link
                      className="font-medium text-[var(--foreground)] transition hover:text-[oklch(0.72_0.2_245)]"
                      href={`/developers/${agent.creatorUsername}`}
                    >
                      {agent.creatorDisplayName}
                    </Link>
                  ) : (
                    <span className="font-medium text-[var(--foreground)]">
                      {agent.creatorDisplayName}
                    </span>
                  )}{" "}
                  · {agent.source === "first_party" ? "First-party agent" : "Developer agent"}
                </p>
              </div>
            </div>

            <p className="mt-8 max-w-3xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              {agent.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-400">
                {agent.verificationStatus === "verified" && (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {agent.verificationStatus === "verified" ? "Verified Agent" : "Coming soon"}
              </span>
              <Pill>{agent.source === "first_party" ? "Built by Voxa" : "External developer"}</Pill>
              {agent.importLabel ? <Pill>{agent.importLabel}</Pill> : null}
              <Pill>{formatDate(agent.updatedAt)}</Pill>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <BetaPanel className="p-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[oklch(0.72_0.2_245)]" />
                  <h2 className="text-xl font-semibold tracking-tight">Capabilities</h2>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {agent.capabilities.map((capability) => (
                    <Pill key={capability}>{capability.replace(/_/g, " ")}</Pill>
                  ))}
                </div>
              </BetaPanel>

              <BetaPanel className="p-6">
                <div className="flex items-center gap-2">
                  <LockKeyhole className="h-5 w-5 text-[oklch(0.72_0.2_245)]" />
                  <h2 className="text-xl font-semibold tracking-tight">Approved permissions</h2>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {agent.permissions.length > 0 ? (
                    agent.permissions.map((permission) => (
                      <Pill key={permission}>{permission.replace(/[:_]/g, " ")}</Pill>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      No public permissions listed.
                    </p>
                  )}
                </div>
              </BetaPanel>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <BetaPanel className="p-6">
                <div className="flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-[oklch(0.72_0.2_245)]" />
                  <h2 className="text-xl font-semibold tracking-tight">Example prompts</h2>
                </div>
                <div className="mt-5 space-y-3">
                  {agent.examplePrompts.length > 0 ? (
                    agent.examplePrompts.map((prompt) => (
                      <div
                        className="rounded-xl border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-3 text-sm text-[var(--muted-foreground)]"
                        key={prompt}
                      >
                        {prompt}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Example prompts are not published for this agent yet.
                    </p>
                  )}
                </div>
              </BetaPanel>

              <BetaPanel className="p-6">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-[oklch(0.72_0.2_245)]" />
                  <h2 className="text-xl font-semibold tracking-tight">Tags</h2>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {agent.tags.length > 0 ? (
                    agent.tags.map((tag) => <Pill key={tag}>#{tag}</Pill>)
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">No tags published yet.</p>
                  )}
                </div>
              </BetaPanel>
            </div>
          </div>

          <aside className="space-y-4">
            <BetaPanel className="p-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                <h2 className="font-semibold tracking-tight">Verification</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
                {agent.verificationStatus === "coming_soon"
                  ? "This first-party agent is planned and is not yet available."
                  : agent.source === "first_party"
                    ? "Built and maintained by Voxa. Public profiles do not grant room access."
                    : "This agent is approved, verified, and public. Endpoint details and internal review data stay private."}
              </p>
            </BetaPanel>

            <BetaPanel className="p-6">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-[oklch(0.72_0.2_245)]" />
                <h2 className="font-semibold tracking-tight">Developer Preview</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
                Public profiles are for discovery. Installs, public room invites, payments,
                rankings, and monetization are not live yet.
              </p>
              <div className="mt-5">
                <BetaButton className="w-full" href="/developers/agents" variant="glass">
                  Register your agent
                </BetaButton>
              </div>
            </BetaPanel>
          </aside>
        </section>
      </div>
    </BetaShell>
  );
}
