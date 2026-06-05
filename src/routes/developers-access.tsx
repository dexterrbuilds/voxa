import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  Copy,
  Database,
  Fingerprint,
  GitBranch,
  Globe2,
  KeyRound,
  Layers3,
  Network,
  PackageOpen,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { GridBackdrop } from "@/components/site/GridBackdrop";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Eyebrow } from "@/components/site/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AccessForm = {
  name: string;
  email: string;
  xHandle: string;
  agentIdea: string;
  company: string;
};

type SubmissionResult = "remote" | "local" | "failed";

const STORAGE_KEY = "voxa-sdk-beta-requests";

const developerGets = [
  {
    title: "Agent Runtime",
    description: "Lifecycle, status, room context, and future message dispatch primitives.",
    icon: Layers3,
  },
  {
    title: "Agent SDK",
    description: "Typed hooks for agent identity, capabilities, messages, and responses.",
    icon: PackageOpen,
  },
  {
    title: "Agent Registry",
    description: "A future place for discoverable, versioned, developer-owned agents.",
    icon: Database,
  },
  {
    title: "Cross-platform deployment",
    description: "A path for agents to join meetings, calls, communities, and voice surfaces.",
    icon: Globe2,
  },
  {
    title: "Agent Identity",
    description: "Stable agent profiles with creator, version, metadata, and ownership.",
    icon: Fingerprint,
  },
  {
    title: "Agent Permissions",
    description: "Controls for what agents can hear, say, access, remember, and do.",
    icon: ShieldCheck,
  },
] as const;

const comingSoon = [
  "External agent registration",
  "Agent Marketplace",
  "OpenClaw support",
  "Meet / Zoom integration",
  "Onchain identity",
] as const;

const exampleCode = `import { VoxaAgent } from "@voxa/sdk";

class MyAgent extends VoxaAgent {
  constructor() {
    super({
      id: "my-agent",
      name: "My Agent",
      capabilities: ["voice", "memory"],
    });
  }
}`;

function readStoredRequests(): unknown[] {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown[];
  } catch {
    return [];
  }
}

function storeAccessRequestLocally(form: AccessForm) {
  const nextRequest = {
    ...form,
    createdAt: new Date().toISOString(),
    source: "developers/access",
  };

  try {
    const requests = readStoredRequests();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...requests, nextRequest]));
    return true;
  } catch {
    return false;
  }
}

async function submitAccessRequest(form: AccessForm) {
  const response = await fetch("/api/developer-access", {
    body: JSON.stringify({
      ...form,
      source: "developers/access",
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "submission_failed");
  }
}

function CopyCodeButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exampleCode);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = exampleCode;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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

function ExampleBlock() {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <KeyRound className="h-4 w-4 text-electric" />
          future-agent.ts
        </div>
        <CopyCodeButton />
      </div>
      <pre className="overflow-x-auto p-5 text-[12.5px] leading-relaxed">
        <code className="font-mono text-foreground/90">{exampleCode}</code>
      </pre>
    </div>
  );
}

function AccessFormCard() {
  const [form, setForm] = useState<AccessForm>({
    name: "",
    email: "",
    xHandle: "",
    agentIdea: "",
    company: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult>("remote");

  const isValid = useMemo(
    () => Boolean(form.name.trim() && form.email.trim() && form.xHandle.trim() && form.agentIdea.trim()),
    [form],
  );

  const updateForm = (field: keyof AccessForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await submitAccessRequest(form);
      setSubmissionResult("remote");
    } catch {
      setSubmissionResult(storeAccessRequestLocally(form) ? "local" : "failed");
    } finally {
      setIsSubmitting(false);
    }

    setSubmitted(true);
  };

  return (
    <div className="relative glass overflow-hidden rounded-2xl p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-electric/10 blur-3xl" />
      <div className="relative">
        <AnimatePresence mode="wait">
          {!submitted ? (
            <motion.form
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: 8 }}
              key="form"
              onSubmit={handleSubmit}
            >
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Request SDK beta access</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Share what you want to build. Production submissions are saved to Supabase; local
                  previews fall back to browser storage.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Name
                  </span>
                  <Input
                    autoComplete="name"
                    className="h-11 bg-input/40"
                    onChange={(event) => updateForm("name", event.target.value)}
                    placeholder="Ada Lovelace"
                    required
                    value={form.name}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Email
                  </span>
                  <Input
                    autoComplete="email"
                    className="h-11 bg-input/40"
                    onChange={(event) => updateForm("email", event.target.value)}
                    placeholder="you@company.com"
                    required
                    type="email"
                    value={form.email}
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    X handle
                  </span>
                  <Input
                    className="h-11 bg-input/40"
                    onChange={(event) => updateForm("xHandle", event.target.value)}
                    placeholder="@builder"
                    required
                    value={form.xHandle}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Company
                  </span>
                  <Input
                    autoComplete="organization"
                    className="h-11 bg-input/40"
                    onChange={(event) => updateForm("company", event.target.value)}
                    placeholder="Optional"
                    value={form.company}
                  />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Agent idea
                </span>
                <Textarea
                  className="min-h-32 resize-none bg-input/40"
                  onChange={(event) => updateForm("agentIdea", event.target.value)}
                  placeholder="Describe the agent you want to bring into live conversations..."
                  required
                  value={form.agentIdea}
                />
              </label>

              <Button className="w-full" disabled={!isValid || isSubmitting} size="lg" type="submit" variant="electric">
                {isSubmitting ? "Sending..." : "Request Early Access"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground/75">
                No external SDK accounts are created yet. This form only collects beta interest.
              </p>
            </motion.form>
          ) : (
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="py-12 text-center"
              initial={{ opacity: 0, scale: 0.96 }}
              key="success"
            >
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-electric/30 bg-electric/15 text-electric">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight text-gradient">
                SDK interest saved.
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {submissionResult === "remote"
                  ? "Your request was saved to the Voxa SDK beta access list."
                  : submissionResult === "local"
                    ? "The production endpoint was unavailable, so this request was saved in this browser as a local fallback."
                    : "The production endpoint and browser storage were unavailable, so this preview could not save the request."}
              </p>
              <Button
                className="mt-6"
                onClick={() => {
                  setSubmitted(false);
                  setForm({ name: "", email: "", xHandle: "", agentIdea: "", company: "" });
                }}
                variant="glass"
              >
                Submit another idea
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function DeveloperAccessPage() {
  return (
    <>
      <Helmet>
        <title>SDK Beta Access — Voxa</title>
        <meta
          name="description"
          content="Request developer access to the upcoming Voxa SDK and agent runtime beta."
        />
        <meta property="og:title" content="SDK Beta Access — Voxa" />
        <meta
          property="og:description"
          content="Build agents that participate in conversations with Voxa."
        />
      </Helmet>
      <SiteLayout>
        <section className="relative overflow-hidden">
          <GridBackdrop />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-24 sm:pt-32 lg:grid-cols-[1.02fr,0.98fr] lg:items-center">
            <div>
              <Eyebrow>SDK Beta</Eyebrow>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-gradient sm:text-6xl">
                Build agents that participate in conversations.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Voxa is building the runtime layer for conversational AI. Nova is only the beginning.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" variant="electric">
                  <a href="#beta-access">
                    Request Early Access <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="glass">
                  <Link to="/developers/docs">Read Developer Docs</Link>
                </Button>
              </div>
            </div>

            <ExampleBlock />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-8">
            <Eyebrow>What developers will get</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-gradient sm:text-4xl">
              The building blocks for conversational agents.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {developerGets.map((item) => {
              const Icon = item.icon;
              return (
                <div className="glass rounded-xl p-5" key={item.title}>
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-electric/10 text-electric">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 lg:grid-cols-[0.9fr,1.1fr]">
          <div>
            <Eyebrow>Coming soon</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-gradient sm:text-4xl">
              From first-party demos to a developer agent ecosystem.
            </h2>
            <p className="mt-5 leading-relaxed text-muted-foreground">
              The internal SDK and runtime are the foundation. The beta will open the pieces needed
              to register, deploy, identify, and govern agents safely.
            </p>
          </div>
          <div className="grid gap-3">
            {comingSoon.map((item, index) => (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-3",
                  index === 0 && "border-electric/30 bg-electric/10",
                )}
                key={item}
              >
                {index === 0 ? (
                  <Network className="h-4 w-4 text-electric" />
                ) : index === 4 ? (
                  <Fingerprint className="h-4 w-4 text-electric" />
                ) : (
                  <GitBranch className="h-4 w-4 text-electric" />
                )}
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[0.85fr,1.15fr]">
          <div>
            <Eyebrow>Example</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-gradient sm:text-4xl">
              A future SDK surface for agent builders.
            </h2>
            <p className="mt-5 leading-relaxed text-muted-foreground">
              The SDK beta will expose a typed contract for identity, lifecycle hooks,
              capabilities, messages, and responses. External registration is not live yet.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="glass">
                <Link to="/developers/docs/sdk">SDK docs</Link>
              </Button>
              <Button asChild variant="glass">
                <Link to="/developers/docs/runtime">Runtime docs</Link>
              </Button>
            </div>
          </div>
          <ExampleBlock />
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[0.8fr,1.2fr]" id="beta-access">
          <div>
            <Eyebrow>Beta Access</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-gradient sm:text-4xl">
              Tell us what you want to build.
            </h2>
            <p className="mt-5 leading-relaxed text-muted-foreground">
              We are collecting signal from developers before opening external agent registration.
              This page is ready for Supabase persistence when the beta access table is added.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="glass">
                <Link to="/developers/docs">Docs</Link>
              </Button>
              <Button asChild variant="glass">
                <Link to="/product">Product</Link>
              </Button>
              <Button asChild variant="glass">
                <Link to="/developers/docs/roadmap">Roadmap</Link>
              </Button>
            </div>
          </div>
          <AccessFormCard />
        </section>
      </SiteLayout>
    </>
  );
}
