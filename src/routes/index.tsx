import { Link as RouterLink } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  Mic,
  Workflow,
  Plug,
  Volume2,
  Code2,
  Network,
  Briefcase,
  UserSearch,
  Headphones,
  Brain,
  Boxes,
  Zap,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section, SectionHeader, Eyebrow } from "@/components/site/Section";
import { GridBackdrop } from "@/components/site/GridBackdrop";
import { ArchitectureVisual } from "@/components/site/ArchitectureVisual";
import { FeatureCard } from "@/components/site/FeatureCard";
import { CodeShowcase } from "@/components/site/CodeShowcase";
import { Button } from "@/components/ui/button";
import { BETA_APP_URL } from "@/lib/links";

const solutions = [
  {
    icon: <Mic className="h-5 w-5" />,
    title: "Real-time speech events",
    desc: "Normalized transcript, turn, and intent events streamed with sub-second latency.",
  },
  {
    icon: <Workflow className="h-5 w-5" />,
    title: "Agent orchestration",
    desc: "Coordinate multiple agents within the same conversation with deterministic routing.",
  },
  {
    icon: <Plug className="h-5 w-5" />,
    title: "Multi-platform connectors",
    desc: "Zoom, Google Meet, WebRTC, SIP, and emerging voice surfaces — one API.",
  },
  {
    icon: <Volume2 className="h-5 w-5" />,
    title: "Voice routing",
    desc: "Stream audio in and out with low-latency TTS/STT pipelines and barge-in support.",
  },
  {
    icon: <Code2 className="h-5 w-5" />,
    title: "Conversational APIs",
    desc: "WebSocket and REST primitives modeled around live conversation, not transcripts.",
  },
  {
    icon: <Network className="h-5 w-5" />,
    title: "Real-time participation",
    desc: "Agents can listen, speak, react, and act — not just observe after the fact.",
  },
];

const steps = [
  {
    n: "01",
    title: "Connect a meeting environment",
    desc: "Drop the Voxa bot into Zoom, Google Meet, or any WebRTC room with a single call.",
  },
  {
    n: "02",
    title: "Receive a normalized event stream",
    desc: "Audio, transcripts, speaker turns and intents are unified across every platform.",
  },
  {
    n: "03",
    title: "Plug in your agents via SDK or API",
    desc: "Use the TypeScript or Python SDK, or stream events over WebSocket.",
  },
  {
    n: "04",
    title: "Agents listen, respond, and act live",
    desc: "Inject voice, trigger tools, and orchestrate workflows mid-conversation.",
  },
];

const useCases = [
  {
    Icon: Briefcase,
    title: "AI Sales Agents",
    desc: "Coach reps live, surface objections, and close handoffs inside the call.",
  },
  {
    Icon: UserSearch,
    title: "Recruiting Assistants",
    desc: "Score candidates, suggest probes, and produce structured loops in real time.",
  },
  {
    Icon: Headphones,
    title: "Support Agents",
    desc: "Auto-resolve, escalate, and document tickets while the customer is still on the line.",
  },
  {
    Icon: Brain,
    title: "Meeting Analysts",
    desc: "Track decisions, action items, and risks as they emerge — not after the fact.",
  },
  {
    Icon: Boxes,
    title: "Multi-Agent Collaboration",
    desc: "Specialist agents share state and turn-taking inside the same conversation.",
  },
];

export default function HomePage() {
  return (
    <>
      <Helmet>
        <title>Voxa — Runtime for Real-Time AI Participation</title>
        <meta
          name="description"
          content="Bring AI agents into real-time conversations across Zoom, Google Meet, and WebRTC. Voxa is the runtime for conversational AI."
        />
      </Helmet>
      <SiteLayout>
        {/* HERO */}
        <section className="relative overflow-hidden">
          <GridBackdrop />
          <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-20 sm:pt-32 sm:pb-28">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center text-center gap-6 max-w-4xl mx-auto"
            >
              <Eyebrow>Conversational Infrastructure</Eyebrow>
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-semibold tracking-tight text-gradient leading-[1.02]">
                Bring AI Agents Into
                <br />
                <span className="text-electric-gradient">Real-Time Conversations</span>
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
                Voxa is the runtime layer that allows external AI agents to participate across
                meetings, calls, and voice environments.
                CA: EEnjis1thqMgorpSA9q24R2QgYvCxMG2whRJzJzHpump
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
                <Button asChild variant="electric" size="lg">
                  <a href={BETA_APP_URL}>
                    Use Voxa <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="glass" size="lg">
                  <RouterLink to="/product">Explore Product</RouterLink>
                </Button>
                <Button asChild variant="glass" size="lg" className="flex items-center gap-2">
                  <a href={BETA_APP_URL}>
                    <Zap className="h-4 w-4" />
                    Open Voxa
                  </a>
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mt-20 sm:mt-24"
            >
              <ArchitectureVisual />
            </motion.div>
          </div>
        </section>

        {/* PROBLEM */}
        <Section>
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <Eyebrow>The Problem</Eyebrow>
              <h2 className="mt-5 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-gradient leading-[1.05]">
                Meetings were built for humans.
              </h2>
              <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed">
                AI systems can analyze conversations after they happen, but there is still no
                universal runtime that allows autonomous agents to participate in conversations{" "}
                <em className="not-italic text-foreground">while they are happening</em>.
              </p>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                Developers lack a universal communication layer for conversational agents.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                {
                  t: "Isolated assistants",
                  d: "Each platform ships its own copilot, none of them talk to each other.",
                },
                {
                  t: "Note-taking bots",
                  d: "Transcripts are produced after the fact — agents can't act in the moment.",
                },
                {
                  t: "Platform-locked AI features",
                  d: "Vendor copilots can't be extended, composed, or redirected by you.",
                },
                {
                  t: "Disconnected workflows",
                  d: "Voice, transcript, and action layers live in different systems.",
                },
              ].map((c, i) => (
                <motion.div
                  key={c.t}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="glass rounded-xl p-5 flex items-start gap-4 hover:border-white/10 transition-colors"
                >
                  <div className="h-8 w-8 rounded-md bg-electric/10 border border-electric/20 grid place-items-center text-electric shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">{c.t}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{c.d}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </Section>

        {/* SOLUTION */}
        <Section>
          <SectionHeader
            eyebrow="The Solution"
            title={
              <>
                Voxa creates a runtime
                <br />
                for conversational AI.
              </>
            }
            description="One protocol, one event stream, one orchestration layer — across every meeting and voice surface your users live in."
          />
          <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {solutions.map((s, i) => (
              <FeatureCard
                key={s.title}
                icon={s.icon}
                title={s.title}
                description={s.desc}
                delay={i * 0.05}
              />
            ))}
          </div>
        </Section>

        {/* HOW IT WORKS */}
        <Section>
          <SectionHeader
            eyebrow="How it works"
            title="Four steps from conversation to autonomous action."
          />
          <div className="mt-16 relative">
            <div className="absolute left-4 sm:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-electric/40 to-transparent" />
            <div className="space-y-12">
              {steps.map((s, i) => (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5 }}
                  className={`relative grid sm:grid-cols-2 gap-6 sm:gap-12 items-center ${i % 2 === 1 ? "sm:[direction:rtl]" : ""}`}
                >
                  <div className="absolute left-4 sm:left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-electric shadow-[0_0_20px_4px_oklch(0.72_0.20_245/0.5)]" />
                  <div
                    className={`pl-12 sm:pl-0 ${i % 2 === 1 ? "sm:pr-12 sm:text-right [direction:ltr]" : "sm:pl-12"}`}
                  >
                    <div className="text-xs font-mono text-electric mb-2">{s.n}</div>
                    <h3 className="text-xl sm:text-2xl font-semibold tracking-tight">{s.title}</h3>
                    <p className="mt-2 text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                  <div className={`hidden sm:block ${i % 2 === 1 ? "[direction:ltr]" : ""}`}>
                    <div className="glass rounded-xl p-6 font-mono text-xs text-muted-foreground">
                      <div className="text-electric">
                        → relay.{["connect", "stream", "agent.attach", "agent.act"][i]}()
                      </div>
                      <div className="mt-2 opacity-70">
                        {
                          [
                            "// channel established",
                            "// 142 events/sec",
                            "// 3 agents online",
                            "// action dispatched",
                          ][i]
                        }
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </Section>

        {/* ARCHITECTURE */}
        <Section>
          <SectionHeader
            eyebrow="Architecture"
            title="Built as infrastructure."
            description="Voxa sits between communication platforms and the agents that act on them — handling transport, normalization, and orchestration."
          />
          <div className="mt-16">
            <ArchitectureVisual />
          </div>
        </Section>

        {/* DEVELOPER */}
        <Section>
          <div className="grid lg:grid-cols-[1fr,1.2fr] gap-12 items-center">
            <div>
              <Eyebrow>Developer Experience</Eyebrow>
              <h2 className="mt-5 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-gradient leading-[1.05]">
                Build agents once.
                <br />
                Deploy everywhere.
              </h2>
              <p className="mt-6 text-muted-foreground leading-relaxed">
                A single SDK speaks to every meeting platform, every voice surface, every transport.
                Write once, and your agent works in any conversation your users start.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {[
                  "TypeScript SDK",
                  "Python SDK",
                  "WebSocket APIs",
                  "Streaming APIs",
                  "Real-time event routing",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-electric" />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="glass" size="default" className="mt-8">
                <RouterLink to="/developers">
                  Read the docs <ArrowRight className="h-4 w-4" />
                </RouterLink>
              </Button>
            </div>
            <CodeShowcase />
          </div>
        </Section>

        {/* USE CASES */}
        <Section>
          <SectionHeader eyebrow="Use Cases" title="What teams build on Voxa." />
          <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {useCases.map((u, i) => (
              <FeatureCard
                key={u.title}
                icon={<u.Icon className="h-5 w-5" />}
                title={u.title}
                description={u.desc}
                delay={i * 0.05}
              />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild variant="glass">
              <RouterLink to="/use-cases">
                Explore all use cases <ArrowRight className="h-4 w-4" />
              </RouterLink>
            </Button>
          </div>
        </Section>

        {/* FUTURE */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute inset-0 grid-bg radial-fade opacity-60" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-electric/15 blur-[160px] rounded-full" />
          </div>
          <div className="relative mx-auto max-w-5xl px-6 py-32 sm:py-40 text-center">
            <Eyebrow>The Future</Eyebrow>
            <h2 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-gradient leading-[1.05]">
              Meetings are becoming
              <br />
              runtime environments for AI.
            </h2>
            <p className="mt-8 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              The future of AI is not isolated chat interfaces. It's autonomous agents collaborating
              inside human communication — orchestrated, real-time, and interoperable.
            </p>
            <p className="mt-4 text-base text-foreground/80">
              Voxa provides the infrastructure layer for this future.
            </p>
          </div>
        </section>

        {/* CTA */}
        <Section>
          <div className="relative glass rounded-3xl p-10 sm:p-16 text-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-electric/10 via-transparent to-electric-glow/10" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-gradient">
                Start a Voxa room.
              </h2>
              <p className="mt-5 text-muted-foreground max-w-xl mx-auto">
                Create an invite-only AI room and bring Nova into the conversation.
              </p>
              <div className="mt-8">
                <Button asChild variant="electric" size="lg">
                  <a href={BETA_APP_URL}>
                    Use Voxa <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </Section>
      </SiteLayout>
    </>
  );
}
