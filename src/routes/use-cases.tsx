import { Link as RouterLink } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { ArrowRight, Briefcase, UserSearch, Headphones, Users, Bot, Boxes } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section, SectionHeader, Eyebrow } from "@/components/site/Section";
import { GridBackdrop } from "@/components/site/GridBackdrop";
import { Button } from "@/components/ui/button";

const cases = [
  {
    Icon: Briefcase,
    title: "Sales",
    problem: "Reps lose deals to missed objections, weak discovery, and inconsistent follow-up.",
    workflow:
      "Voxa streams the live call into your agent stack. The agent listens for buying signals, surfaces battlecards in real time, and drafts CRM updates the moment the call ends.",
    solution:
      "Live coaching, automated follow-ups, and structured outcomes — without an extra tab to manage.",
    outcome: "Higher win rates, shorter ramp time, and CRM data that's actually accurate.",
  },
  {
    Icon: UserSearch,
    title: "Recruiting",
    problem: "Interview loops are inconsistent, scoring is subjective, and great signal gets lost.",
    workflow:
      "Your agent joins each interview, listens for competency signals, suggests follow-up probes, and produces a normalized scorecard for every candidate.",
    solution: "Structured interviews, consistent rubrics, and automatic ATS sync.",
    outcome: "Faster loops, fairer evaluations, and dramatically better candidate experience.",
  },
  {
    Icon: Headphones,
    title: "Customer Support",
    problem: "Tier-1 agents drown in repetitive issues; great customers wait too long.",
    workflow:
      "An AI agent attends every call, resolves common issues mid-conversation, and routes complex ones to humans with a full context handoff.",
    solution: "Auto-resolution for common issues, real-time human assist, and structured tickets.",
    outcome: "Lower handle time, higher CSAT, and fewer tier-2 escalations.",
  },
  {
    Icon: Users,
    title: "Internal Meetings",
    problem: "Decisions, action items, and risks evaporate the moment the call ends.",
    workflow:
      "Voxa captures decisions and ownership in real time, distributes follow-ups, and feeds your knowledge base.",
    solution: "Continuous memory across meetings — searchable, attributable, and acted on.",
    outcome: "Less status work, fewer dropped balls, faster organizations.",
  },
  {
    Icon: Bot,
    title: "AI Co-Pilots",
    problem: "Per-platform copilots can't be customized, composed, or deployed across surfaces.",
    workflow:
      "Build your own copilot with your own model, tools, and policies — and deploy it into any meeting platform via a single connector.",
    solution: "A universal copilot runtime owned by you.",
    outcome: "Brand, control, and IP all stay with you instead of the meeting vendor.",
  },
  {
    Icon: Boxes,
    title: "Multi-Agent Systems",
    problem:
      "Specialist agents can't coordinate inside a live conversation — turn-taking and shared state break down.",
    workflow:
      "Voxa brokers turn order, shared context, and tool dispatch between multiple agents in the same session.",
    solution: "Deterministic orchestration primitives for live multi-agent collaboration.",
    outcome: "Workflows that previously required a human moderator now run autonomously.",
  },
];

export default function UseCasesPage() {
  return (
    <>
      <Helmet>
        <title>Use Cases — Voxa</title>
        <meta
          name="description"
          content="Sales, recruiting, customer support, internal meetings, AI co-pilots, and multi-agent systems — all running on Voxa."
        />
        <meta property="og:title" content="Use Cases — Voxa" />
        <meta
          property="og:description"
          content="Where conversational AI infrastructure goes to work."
        />
      </Helmet>
      <SiteLayout>
        <section className="relative overflow-hidden">
          <GridBackdrop />
          <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-16 sm:pt-32 text-center">
            <Eyebrow>Use Cases</Eyebrow>
            <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight text-gradient leading-[1.05]">
              Where live AI agents go to work.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              From revenue teams to multi-agent systems — Voxa is the infrastructure underneath them
              all.
            </p>
          </div>
        </section>

        <Section>
          <div className="space-y-6">
            {cases.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5 }}
                className="glass rounded-2xl p-8 sm:p-10 grid lg:grid-cols-[260px,1fr] gap-8"
              >
                <div>
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-electric/20 to-electric/5 border border-electric/20 grid place-items-center text-electric">
                    <c.Icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-xs font-mono text-muted-foreground">0{i + 1}</div>
                  <h3 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">
                    {c.title}
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
                  {[
                    { label: "Problem", body: c.problem },
                    { label: "Workflow", body: c.workflow },
                    { label: "Voxa solution", body: c.solution },
                    { label: "Outcome", body: c.outcome },
                  ].map((b) => (
                    <div key={b.label}>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-electric/80 font-medium">
                        {b.label}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{b.body}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section>
          <div className="glass rounded-3xl p-10 sm:p-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-electric/10 to-transparent" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
                Have a use case in mind?
              </h2>
              <p className="mt-4 text-muted-foreground">
                Tell us what you're building. We'll get you set up.
              </p>
              <div className="mt-8">
                <Button asChild variant="electric" size="lg">
                  <RouterLink to="/waitlist">
                    Request Early Access <ArrowRight className="h-4 w-4" />
                  </RouterLink>
                </Button>
              </div>
            </div>
          </div>
        </Section>
      </SiteLayout>
    </>
  );
}
