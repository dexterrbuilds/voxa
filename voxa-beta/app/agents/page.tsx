import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Boxes, ShieldCheck } from "lucide-react";
import { BetaButton, BetaEyebrow, BetaHeader, BetaPanel, BetaShell } from "@/components/BetaChrome";
import { getPublicAgentDirectory } from "@/lib/server/agents/showcase";
import AgentDirectoryClient from "./AgentDirectoryClient";

export const metadata: Metadata = {
  title: "Agents | Voxa",
  description: "Discover verified developer and first-party agents on Voxa.",
};

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const directory = await getPublicAgentDirectory();

  return (
    <BetaShell>
      <BetaHeader>
        <BetaButton href="/developers/agents" variant="quiet">
          Developer console
        </BetaButton>
      </BetaHeader>

      <div className="mx-auto max-w-7xl px-6 pb-24 pt-16 sm:pt-24">
        <section className="grid gap-8 lg:grid-cols-[1fr,24rem] lg:items-end">
          <div>
            <BetaEyebrow>Agent Showcase</BetaEyebrow>
            <h1 className="beta-text-gradient mt-6 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
              Developers build agents for Voxa.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              Browse verified agent profiles from Voxa and early developers. This is a public
              developer preview, not an install marketplace or public room access surface.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <BetaButton href="/developers/agents">
                Register an agent
                <ArrowRight className="h-4 w-4" />
              </BetaButton>
              <BetaButton href="/developers/sandbox" variant="glass">
                Open sandbox
              </BetaButton>
            </div>
          </div>

          <BetaPanel className="p-5">
            <div className="space-y-3">
              {[
                {
                  icon: ShieldCheck,
                  label: "Approved + verified",
                  value: "Public profiles only",
                },
                {
                  icon: BadgeCheck,
                  label: "Developer preview",
                  value: "No installs or payments",
                },
                {
                  icon: Boxes,
                  label: "Platform direction",
                  value: "Agents for live conversation",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    className="flex items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-3"
                    key={item.label}
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-[oklch(0.72_0.2_245/0.12)] text-[oklch(0.72_0.2_245)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[var(--foreground)]">
                        {item.label}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">{item.value}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </BetaPanel>
        </section>

        {!directory.publicExternalAgentsAvailable ? (
          <div className="mt-10 rounded-2xl border border-[var(--glass-border)] bg-[var(--subtle-fill)] p-4 text-sm text-[var(--muted-foreground)]">
            No public external agents are live yet. Featured first-party profiles show the platform
            direction while developer agents move through review and verification.
          </div>
        ) : null}

        <div className="mt-14">
          <AgentDirectoryClient
            agents={directory.agents}
            featuredAgents={directory.featuredAgents}
            featuredDevelopers={directory.featuredDevelopers}
          />
        </div>
      </div>
    </BetaShell>
  );
}
