import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Check, Copy, ExternalLink, Search, Sparkles, Terminal } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { GridBackdrop } from "@/components/site/GridBackdrop";
import { Eyebrow } from "@/components/site/Section";
import { Button } from "@/components/ui/button";
import {
  docsNav,
  faqItems,
  getDocsPageId,
  pageMeta,
  platformPillars,
  registrationExample,
  registrationFlow,
  roadmapComing,
  roadmapNow,
  runtimeExample,
  runtimeFlow,
  securityModel,
  sdkExample,
  supportCard,
  typeExample,
  type DocsPageId,
} from "@/lib/developer-docs";
import { BETA_APP_URL } from "@/lib/links";
import { cn } from "@/lib/utils";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copyWithTextarea = () => {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          copyWithTextarea();
        }
      } else {
        copyWithTextarea();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background/70 px-2.5 text-xs text-muted-foreground transition-colors hover:border-electric/40 hover:text-foreground"
      onClick={handleCopy}
      type="button"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-electric" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, language, title }: { code: string; language: string; title: string }) {
  return (
    <div className="glass overflow-hidden rounded-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal className="h-3.5 w-3.5 shrink-0 text-electric" />
          <span className="truncate text-xs text-muted-foreground">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 sm:inline">
            {language}
          </span>
          <CopyButton value={code} />
        </div>
      </div>
      <pre className="overflow-x-auto p-5 text-[12.5px] leading-relaxed">
        <code className="font-mono text-foreground/90">{code}</code>
      </pre>
    </div>
  );
}

function DocsSidebar({ activePage }: { activePage: DocsPageId }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 space-y-5">
        <div className="glass rounded-xl p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            Search docs
            <span className="ml-auto rounded border border-border/70 px-1.5 py-0.5 font-mono text-[10px]">
              soon
            </span>
          </div>
        </div>

        <nav className="glass rounded-xl p-2">
          {docsNav.map((item) => {
            const Icon = item.icon;
            const active = item.id === activePage;
            return (
              <Link
                className={cn(
                  "group flex gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                  active
                    ? "bg-electric/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
                key={item.id}
                to={item.path}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-electric" : "")} />
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function MobileDocsNav({ activePage }: { activePage: DocsPageId }) {
  return (
    <div className="lg:hidden">
      <div className="glass flex snap-x gap-2 overflow-x-auto rounded-xl p-2">
        {docsNav.map((item) => {
          const Icon = item.icon;
          const active = item.id === activePage;
          return (
            <Link
              className={cn(
                "flex shrink-0 snap-start items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-electric/10 text-foreground" : "text-muted-foreground",
              )}
              key={item.id}
              to={item.path}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DocsHero({ pageId }: { pageId: DocsPageId }) {
  const meta = pageMeta[pageId];

  return (
    <section className="relative overflow-hidden">
      <GridBackdrop />
      <div className="relative mx-auto max-w-7xl px-6 pb-12 pt-24 sm:pt-32">
        <div className="grid gap-8 lg:grid-cols-[1fr,24rem] lg:items-end">
          <div>
            <Eyebrow>{meta.eyebrow}</Eyebrow>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-gradient sm:text-6xl">
              {meta.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {meta.description}
            </p>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-electric" />
              Current status
            </div>
            <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span>Runtime</span>
                <span className="text-foreground">Foundation</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span>SDK</span>
                <span className="text-foreground">v0.1 preview</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span>External agents</span>
                <span className="text-foreground">Not live yet</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Callout() {
  const Icon = supportCard.icon;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-electric/10 text-electric">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-semibold tracking-tight">{supportCard.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {supportCard.description}
          </p>
          <Button asChild className="mt-4" size="sm" variant="glass">
            <Link to="/developers/access">
              Request SDK beta <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function OverviewPage() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">What is Voxa?</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Voxa is the runtime layer for conversational AI. It gives humans and AI agents a shared
          real-time room where agents can eventually join, understand, and participate in live
          conversation across the internet.
        </p>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Nova is the first demonstration agent running on Voxa. Nova proves the room, voice,
          memory, and runtime direction, but Nova is not the product. The product is the agent
          infrastructure underneath her.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Platform direction</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {platformPillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div className="glass rounded-xl p-5" key={pillar.title}>
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-electric/10 text-electric">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold tracking-tight">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Current foundation</h2>
        <div className="mt-5 grid gap-3">
          {[
            "Agent Runtime foundation",
            "SDK v0.1 typed API",
            "Agent Manifest and Agent Selector",
            "NovaAgent as the first first-party agent",
            "inviteAgent(agentId) for first-party agent invites",
          ].map((item) => (
            <div
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-3"
              key={item}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-electric" />
              <span className="text-sm">{item}</span>
            </div>
          ))}
        </div>
      </section>

      <Callout />
    </div>
  );
}

function RuntimePage() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Runtime flow</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {runtimeFlow.map((step, index) => {
            const Icon = step.icon;
            return (
              <div className="relative glass rounded-xl p-5" key={step.label}>
                {index < runtimeFlow.length - 1 && (
                  <div className="pointer-events-none absolute left-[calc(100%-0.5rem)] top-1/2 hidden h-px w-5 bg-electric/40 md:block" />
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-electric/10 text-electric">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold tracking-tight">{step.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Core concepts</h2>
        <div className="mt-5 space-y-4">
          {[
            {
              title: "Agent Runtime",
              body: "The orchestration layer that will manage room context, lifecycle state, messages, and eventually dispatch across platforms.",
            },
            {
              title: "Agent Registry",
              body: "A lookup layer for registered agents. Today this is a TypeScript foundation; future versions should become a database-backed registry.",
            },
            {
              title: "Agent Manifest",
              body: "A first-party source of available agent metadata. Today Nova is available and future agents render as coming soon.",
            },
            {
              title: "Agent Lifecycle",
              body: "Agents move through states such as idle, in_room, listening, thinking, speaking, and error.",
            },
          ].map((concept) => (
            <div className="rounded-xl border border-border/70 bg-card/70 p-5" key={concept.title}>
              <h3 className="font-semibold tracking-tight">{concept.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{concept.body}</p>
            </div>
          ))}
        </div>
      </section>

      <CodeBlock code={runtimeExample} language="text" title="runtime-map.txt" />
    </div>
  );
}

function SdkPage() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">SDK preview</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          The local SDK package defines the shape of a Voxa agent. It is intentionally small: no API
          keys, no external networking, no marketplace, and no production publishing workflow yet.
        </p>
      </section>

      <CodeBlock code={sdkExample} language="TypeScript" title="research-agent.ts" />

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Types developers will use</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {[
            "AgentIdentity",
            "AgentStatus",
            "AgentMessage",
            "AgentResponse",
            "AgentContext",
            "AgentCapability",
          ].map((typeName) => (
            <div className="rounded-xl border border-border/70 bg-card/70 px-4 py-3" key={typeName}>
              <span className="font-mono text-sm text-electric">{typeName}</span>
            </div>
          ))}
        </div>
      </section>

      <CodeBlock code={typeExample} language="TypeScript" title="types.ts" />

      <div className="rounded-xl border border-electric/20 bg-electric/10 p-5">
        <h3 className="font-semibold tracking-tight">Developer preview scope</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          External agents are not supported yet. The SDK exists to make the contract explicit before
          Voxa adds agent publishing, authentication, billing, permissions, and runtime dispatch.
        </p>
      </div>
    </div>
  );
}

function RegistrationPage() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Registration is scaffolded</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Voxa now has an authenticated registration API design for developer-owned agent metadata,
          but external agents are not enabled in production. Submitted records are a future review
          queue only; they do not appear in rooms, the Agent Selector, or the marketplace.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Future flow</h2>
        <div className="mt-5 grid gap-3">
          {registrationFlow.map((item, index) => (
            <div
              className="flex gap-3 rounded-xl border border-border/70 bg-card/70 p-4"
              key={item}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-electric/10 font-mono text-xs text-electric">
                {index + 1}
              </span>
              <span className="text-sm leading-relaxed">{item}</span>
            </div>
          ))}
        </div>
      </section>

      <CodeBlock code={registrationExample} language="TypeScript" title="registration.ts" />

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Security model</h2>
        <div className="mt-5 grid gap-3">
          {securityModel.map((item) => (
            <div
              className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/70 p-4"
              key={item}
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
              <span className="text-sm leading-relaxed text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-electric/20 bg-electric/10 p-5">
        <h3 className="font-semibold tracking-tight">Current API posture</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The scaffolded routes are authenticated and owner-scoped. Developers can submit draft or
          pending-review metadata, but cannot self-approve agents, publish public listings, or load
          external agents into rooms yet.
        </p>
        <a
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-electric px-3.5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          href={`${BETA_APP_URL}/developers/agents`}
          rel="noreferrer"
          target="_blank"
        >
          Open the agent dashboard
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <p className="mt-2 text-xs text-muted-foreground">
          Sign in to submit and manage agent metadata. Registered agents stay out of rooms until
          reviewed and approved.
        </p>
      </div>
    </div>
  );
}

function RoadmapPage() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Current</h2>
        <div className="mt-5 grid gap-3">
          {roadmapNow.map((item) => (
            <div
              className="flex gap-3 rounded-xl border border-border/70 bg-card/70 p-4"
              key={item}
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
              <span className="text-sm leading-relaxed">{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Coming next</h2>
        <div className="mt-5 grid gap-3">
          {roadmapComing.map((item) => (
            <div
              className="flex gap-3 rounded-xl border border-border/70 bg-card/70 p-4"
              key={item}
            >
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
              <span className="text-sm leading-relaxed">{item}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="glass rounded-2xl p-6">
        <h2 className="text-2xl font-semibold tracking-tight">Final vision</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Voxa becomes the runtime for conversational AI: a platform where AI agents can join,
          understand, and participate in live human conversations across meetings, communities,
          calls, and the internet itself.
        </p>
      </div>
    </div>
  );
}

function FaqPage() {
  return (
    <div className="space-y-4">
      {faqItems.map((item) => (
        <div className="rounded-xl border border-border/70 bg-card/70 p-5" key={item.question}>
          <h2 className="font-semibold tracking-tight">{item.question}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
        </div>
      ))}
    </div>
  );
}

function DocsContent({ pageId }: { pageId: DocsPageId }) {
  if (pageId === "runtime") {
    return <RuntimePage />;
  }

  if (pageId === "sdk") {
    return <SdkPage />;
  }

  if (pageId === "registration") {
    return <RegistrationPage />;
  }

  if (pageId === "roadmap") {
    return <RoadmapPage />;
  }

  if (pageId === "faq") {
    return <FaqPage />;
  }

  return <OverviewPage />;
}

export default function DeveloperDocsPage() {
  const location = useLocation();
  const pageId = useMemo(() => getDocsPageId(location.pathname), [location.pathname]);
  const meta = pageMeta[pageId];

  return (
    <>
      <Helmet>
        <title>{`${meta.eyebrow} — Voxa Developer Docs`}</title>
        <meta name="description" content={meta.description} />
        <meta property="og:title" content={`${meta.eyebrow} — Voxa Developer Docs`} />
        <meta property="og:description" content={meta.description} />
      </Helmet>
      <SiteLayout>
        <DocsHero pageId={pageId} />
        <div className="mx-auto grid max-w-7xl gap-8 px-6 pb-24 lg:grid-cols-[18rem,1fr]">
          <DocsSidebar activePage={pageId} />
          <main className="min-w-0">
            <MobileDocsNav activePage={pageId} />
            <div className="mt-6 lg:mt-0">
              <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">Docs are in preview</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    External agent loading, API keys, and publishing are intentionally not live yet.
                  </p>
                </div>
                <Button asChild size="sm" variant="glass">
                  <a href={BETA_APP_URL} rel="noreferrer" target="_blank">
                    Open beta <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
              <DocsContent pageId={pageId} />
            </div>
          </main>
        </div>
      </SiteLayout>
    </>
  );
}
