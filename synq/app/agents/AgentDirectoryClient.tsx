"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, Search, SlidersHorizontal } from "lucide-react";
import type { PublicAgent, PublicDeveloperProfile } from "@/lib/agents/showcase-types";

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
    return "First-party preview";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently updated";
  }

  return `Updated ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="text-xs text-[var(--muted-foreground)]">{children}</span>;
}

function AgentAvatar({ agent }: { agent: PublicAgent }) {
  if (agent.avatarUrl) {
    return (
      <img
        alt=""
        className="h-12 w-12 rounded-xl border border-[var(--glass-border)] object-cover"
        src={agent.avatarUrl}
      />
    );
  }

  return (
    <div className="grid h-12 w-12 place-items-center rounded-xl border border-[oklch(0.72_0.2_245/0.28)] bg-[oklch(0.72_0.2_245/0.12)] text-sm font-semibold text-[var(--electric)]">
      {initialsFor(agent.name)}
    </div>
  );
}

export function AgentCard({ agent, compact = false }: { agent: PublicAgent; compact?: boolean }) {
  const capabilities = agent.capabilities.slice(0, compact ? 3 : 5);
  const tags = agent.tags.slice(0, compact ? 2 : 4);

  return (
    <Link className="synq-agent-card group" href={`/agents/${agent.slug}`}>
      <div className="flex items-start gap-4">
        <AgentAvatar agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-semibold text-[var(--foreground)]">
              {agent.name}
            </h3>
            <span
              className={`inline-flex items-center gap-1 text-xs ${agent.verificationStatus === "verified" ? "text-[var(--success)]" : "text-[var(--muted-foreground)]"}`}
            >
              {agent.verificationStatus === "verified" && <CheckCircle2 className="h-3 w-3" />}
              {agent.verificationStatus === "verified" ? "Verified" : "Coming soon"}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Built by {agent.creatorDisplayName}
          </p>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
        {agent.description}
      </p>

      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1">
        {capabilities.map((capability) => (
          <Badge key={capability}>{capability.replace(/_/g, " ")}</Badge>
        ))}
      </div>

      {tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span className="text-xs text-[var(--electric)]" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
      {agent.importLabel && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">{agent.importLabel}</p>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-[var(--hairline-border)] pt-4 text-xs text-[var(--muted-foreground)]">
        <span>{formatDate(agent.updatedAt)}</span>
        <ArrowUpRight size={16} aria-label="View profile" className="text-[var(--electric)]" />
      </div>
    </Link>
  );
}

export default function AgentDirectoryClient({
  agents,
  featuredAgents,
  featuredDevelopers,
}: {
  agents: PublicAgent[];
  featuredAgents: PublicAgent[];
  featuredDevelopers: PublicDeveloperProfile[];
}) {
  const [query, setQuery] = useState("");
  const [capability, setCapability] = useState("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const capabilities = useMemo(() => {
    const values = new Set<string>();
    for (const agent of agents) {
      for (const item of agent.capabilities) {
        values.add(item);
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [agents]);

  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return agents.filter((agent) => {
      const searchable = [
        agent.name,
        agent.description,
        agent.creatorDisplayName,
        agent.importLabel ?? "",
        ...agent.capabilities,
        ...agent.tags,
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesCapability = capability === "all" || agent.capabilities.includes(capability);
      const matchesVerified = !verifiedOnly || agent.verificationStatus === "verified";
      return matchesQuery && matchesCapability && matchesVerified;
    });
  }, [agents, capability, query, verifiedOnly]);

  return (
    <div className="space-y-12">
      {featuredAgents.length > 0 && (
        <section>
          <div className="mb-5 flex items-center gap-2">
            <h2 className="text-sm font-medium text-[var(--muted-foreground)]">Featured agents</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {featuredAgents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.slug}`}
                className="flex min-w-0 flex-col gap-3 rounded-lg bg-[var(--surface)] p-4 hover:bg-[var(--accent)] sm:flex-row sm:items-center"
              >
                <AgentAvatar agent={agent} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{agent.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {agent.verificationStatus === "verified" ? "Meet the agent" : "Coming soon"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {featuredDevelopers.length > 0 && (
        <section>
          <div className="mb-5 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[var(--electric)]" />
            <h2 className="text-2xl font-semibold tracking-normal text-[var(--foreground)]">
              Featured developers
            </h2>
          </div>
          {featuredDevelopers.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {featuredDevelopers.map((developer) => (
                <Link
                  className="synq-agent-card group"
                  href={`/developers/${developer.username}`}
                  key={developer.username}
                >
                  <div className="flex items-center gap-3">
                    {developer.avatarUrl ? (
                      <img
                        alt=""
                        className="h-12 w-12 rounded-xl border border-[var(--glass-border)] object-cover"
                        src={developer.avatarUrl}
                      />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-xl border border-[oklch(0.72_0.2_245/0.28)] bg-[oklch(0.72_0.2_245/0.12)] text-sm font-semibold text-[var(--electric)]">
                        {initialsFor(developer.displayName)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-[var(--foreground)]">
                        {developer.displayName}
                      </h3>
                      <p className="font-mono text-xs text-[var(--muted-foreground)]">
                        @{developer.username}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {developer.bio || "Building conversational agents on Synq."}
                  </p>
                  <div className="mt-4 text-xs text-[var(--electric)]">
                    {developer.publicAgentCount ?? 0} public{" "}
                    {(developer.publicAgentCount ?? 0) === 1 ? "agent" : "agents"}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-5 text-sm text-[var(--muted-foreground)]">
              Featured developer profiles will appear here as approved agents become public.
            </div>
          )}
        </section>
      )}

      <section>
        <div className="mb-5 flex flex-col gap-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal text-[var(--foreground)]">
              Explore agents
            </h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Meet the agents and the people building them.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                className="h-11 w-full rounded-xl border border-[var(--glass-border)] bg-[var(--subtle-fill)] pl-10 pr-3 text-sm outline-none transition focus:border-[oklch(0.72_0.2_245/0.55)] sm:w-72"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search agents"
                aria-label="Search agents and developers"
                value={query}
              />
            </label>
            <label className="relative block">
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <select
                aria-label="Filter by capability"
                className="h-11 w-full appearance-none rounded-xl border border-[var(--glass-border)] bg-[var(--subtle-fill)] pl-10 pr-8 text-sm outline-none transition focus:border-[oklch(0.72_0.2_245/0.55)] sm:w-60"
                onChange={(event) => setCapability(event.target.value)}
                value={capability}
              >
                <option value="all">All capabilities</option>
                {capabilities.map((item) => (
                  <option key={item} value={item}>
                    {item.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--subtle-fill)] px-3 text-sm text-[var(--muted-foreground)]">
              <input
                checked={verifiedOnly}
                className="accent-[oklch(0.72_0.2_245)]"
                onChange={(event) => setVerifiedOnly(event.target.checked)}
                type="checkbox"
              />
              Verified
            </label>
          </div>
        </div>

        {filteredAgents.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent) => (
              <AgentCard agent={agent} key={agent.id} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            No agents match that search yet.
            <button
              type="button"
              className="mx-auto mt-4 block text-[var(--electric)] underline"
              onClick={() => {
                setQuery("");
                setCapability("all");
                setVerifiedOnly(false);
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
