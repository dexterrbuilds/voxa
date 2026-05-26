import { Link as RouterLink } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Layers, Radio, Workflow, Volume2, Plug, Network } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section, SectionHeader, Eyebrow } from "@/components/site/Section";
import { GridBackdrop } from "@/components/site/GridBackdrop";
import { FeatureCard } from "@/components/site/FeatureCard";
import { ArchitectureVisual } from "@/components/site/ArchitectureVisual";
import { Button } from "@/components/ui/button";

const layers = [
  {
    Icon: Plug,
    title: "Connector System",
    desc: "Drop-in integrations for Zoom, Google Meet, WebRTC, SIP, and Microsoft Teams. Add new surfaces without touching your agent code.",
  },
  {
    Icon: Radio,
    title: "Real-Time Event Runtime",
    desc: "A normalized event bus delivering audio, transcripts, turns, intents, and tool invocations under 400ms p95.",
  },
  {
    Icon: Workflow,
    title: "Agent Orchestration",
    desc: "Deterministic routing between multiple agents — turn-taking, hand-offs, and shared state are first-class primitives.",
  },
  {
    Icon: Volume2,
    title: "Voice Routing",
    desc: "Bidirectional audio streams, hot-swappable TTS/STT, barge-in handling, and per-speaker mixing.",
  },
  {
    Icon: Network,
    title: "Multi-Platform Architecture",
    desc: "Run a single agent across every meeting platform your customers use. Identity, billing, and observability unified.",
  },
  {
    Icon: Layers,
    title: "Composable Primitives",
    desc: "Sessions, channels, agents, tools and policies — small, well-typed objects that compose into real workflows.",
  },
];

export default function ProductPage() {
  return (
    <>
      <Helmet>
        <title>Product — Voxa</title>
        <meta
          name="description"
          content="Voxa abstracts conversational infrastructure: connectors, real-time event runtime, agent orchestration, and voice routing."
        />
        <meta property="og:title" content="Product — Voxa" />
        <meta
          property="og:description"
          content="Conversational infrastructure for autonomous agents."
        />
      </Helmet>
      <SiteLayout>
        <section className="relative overflow-hidden">
          <GridBackdrop />
          <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-16 sm:pt-32 text-center">
            <Eyebrow>Product</Eyebrow>
            <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight text-gradient leading-[1.05]">
              The runtime for live conversational AI.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Voxa abstracts the messy parts of real-time communication so your agents can focus on
              listening, deciding, and acting.
            </p>
          </div>
        </section>

        <Section>
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Eyebrow>Why this matters</Eyebrow>
              <h2 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
                Conversational infrastructure is the missing layer.
              </h2>
              <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Modern AI is great at understanding language but terrible at participating in real
                  conversations. The gap isn't models — it's runtime.
                </p>
                <p>
                  Today every team rebuilds the same plumbing: bot accounts per platform, custom
                  audio pipelines, ad-hoc transcript handling, brittle turn detection, and one-off
                  orchestration logic.
                </p>
                <p>
                  Voxa replaces all of it with a single, opinionated runtime designed around live
                  participation.
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              {[
                {
                  t: "Fragmented meeting systems",
                  d: "Every platform speaks a different protocol. Bots, SDKs, audio formats, transcript APIs — none of them align.",
                },
                {
                  t: "Latency-sensitive everything",
                  d: "Sub-second round trips are non-negotiable. Generic message queues can't carry conversation.",
                },
                {
                  t: "Orchestration is a state machine",
                  d: "Multi-agent turn-taking, hand-offs, and tool dispatch require primitives, not glue.",
                },
              ].map((c) => (
                <div key={c.t} className="glass rounded-xl p-5">
                  <div className="font-medium">{c.t}</div>
                  <div className="text-sm text-muted-foreground mt-1">{c.d}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section>
          <SectionHeader eyebrow="Architecture" title="One runtime. Every conversation." />
          <div className="mt-16">
            <ArchitectureVisual />
          </div>
        </Section>

        <Section>
          <SectionHeader eyebrow="The Stack" title="Six layers of conversational infrastructure." />
          <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {layers.map((l, i) => (
              <FeatureCard
                key={l.title}
                icon={<l.Icon className="h-5 w-5" />}
                title={l.title}
                description={l.desc}
                delay={i * 0.05}
              />
            ))}
          </div>
        </Section>

        <Section>
          <div className="glass rounded-3xl p-10 sm:p-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-electric/10 to-transparent" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
                Ready to build live agents?
              </h2>
              <p className="mt-4 text-muted-foreground">
                Get early access to the Voxa runtime and SDKs.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild variant="electric" size="lg">
                  <RouterLink to="/waitlist">
                    Join Waitlist <ArrowRight className="h-4 w-4" />
                  </RouterLink>
                </Button>
                <Button asChild variant="glass" size="lg">
                  <RouterLink to="/developers">View Docs</RouterLink>
                </Button>
              </div>
            </div>
          </div>
        </Section>
      </SiteLayout>
    </>
  );
}
