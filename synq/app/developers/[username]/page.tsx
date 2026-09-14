import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Globe, X } from "lucide-react";
import { BetaEyebrow, BetaHeader, BetaShell } from "@/components/BetaChrome";
import { getPublicDeveloperByUsername } from "@/lib/server/developers/profile";
import { AgentCard } from "../../agents/AgentDirectoryClient";

type DeveloperPageProps = {
  params: Promise<{
    username: string;
  }>;
};

function initialsFor(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "D"
  );
}

function formatJoinedAt(value: string | null) {
  if (!value) {
    return "Recently joined";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently joined";
  }

  return `Joined ${date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

export async function generateMetadata({ params }: DeveloperPageProps): Promise<Metadata> {
  const { username } = await params;
  const developer = await getPublicDeveloperByUsername(username);

  if (!developer) {
    return {
      title: "Developer not found | Synq",
    };
  }

  return {
    title: `${developer.profile.displayName} | Synq Developer`,
    description:
      developer.profile.bio ||
      `${developer.profile.displayName} builds conversational AI agents on Synq.`,
  };
}

export const dynamic = "force-dynamic";

export default async function DeveloperProfilePage({ params }: DeveloperPageProps) {
  const { username } = await params;
  const developer = await getPublicDeveloperByUsername(username);

  if (!developer) {
    notFound();
  }

  const { agents, profile } = developer;

  return (
    <BetaShell>
      <BetaHeader />

      <div className="mx-auto max-w-6xl px-6 pb-24 pt-10 sm:pt-16">
        <Link
          className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
          href="/agents"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to agents
        </Link>

        <section className="mt-8">
          <div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {profile.avatarUrl ? (
                <img
                  alt=""
                  className="h-24 w-24 rounded-3xl border border-[var(--glass-border)] object-cover"
                  src={profile.avatarUrl}
                />
              ) : (
                <div className="grid h-24 w-24 place-items-center rounded-3xl border border-[oklch(0.72_0.2_245/0.28)] bg-[oklch(0.72_0.2_245/0.12)] text-2xl font-semibold text-[var(--electric)]">
                  {initialsFor(profile.displayName)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <BetaEyebrow>Developer Profile</BetaEyebrow>
                <h1 className="beta-text-gradient mt-3 text-3xl font-semibold leading-tight sm:text-5xl">
                  {profile.displayName}
                </h1>
                <p className="mt-3 font-mono text-sm text-[var(--muted-foreground)]">
                  @{profile.username}
                </p>
              </div>
            </div>

            <p className="mt-8 max-w-3xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              {profile.bio || "Building conversational AI agents on Synq."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              {profile.website ? (
                <a
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 py-1.5 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                  href={profile.website}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Globe className="h-4 w-4" />
                  Website
                </a>
              ) : null}
              {profile.xHandle ? (
                <a
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 py-1.5 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                  href={`https://x.com/${profile.xHandle}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <X className="h-4 w-4" />@{profile.xHandle}
                </a>
              ) : null}
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 py-1.5 text-[var(--muted-foreground)]">
                <CalendarDays className="h-4 w-4" />
                {formatJoinedAt(profile.joinedAt)}
              </span>
            </div>

            <section className="mt-12">
              <div className="mb-5">
                <h2 className="text-2xl font-semibold tracking-normal text-[var(--foreground)]">
                  Agent portfolio
                </h2>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  {agents.length} public {agents.length === 1 ? "agent" : "agents"} built by{" "}
                  {profile.displayName}.
                </p>
              </div>

              {agents.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {agents.map((agent) => (
                    <AgentCard agent={agent} key={agent.id} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-8 text-sm text-[var(--muted-foreground)]">
                  This developer does not have public agents yet.
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </BetaShell>
  );
}
