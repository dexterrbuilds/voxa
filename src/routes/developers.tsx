import { Link as RouterLink } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Terminal, Cable, Webhook, Boxes } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section, SectionHeader, Eyebrow } from "@/components/site/Section";
import { GridBackdrop } from "@/components/site/GridBackdrop";
import { FeatureCard } from "@/components/site/FeatureCard";
import { Button } from "@/components/ui/button";

const sdkSnippet = `import { Relay } from "@Voxa/sdk";

const relay = new Relay({ apiKey: process.env.RELAY_KEY });

const session = await relay.sessions.connect({
  platform: "zoom",
  meetingUrl: "https://zoom.us/j/...",
});

session.on("speech.transcript", async (event) => {
  if (event.text.includes("?")) {
    await session.speak({
      text: await myAgent.respond(event.text),
    });
  }
});`;

const wsSnippet = `// Stream events directly over WebSocket
const ws = new WebSocket("wss://api.Voxa.dev/v1/stream");

ws.onmessage = (msg) => {
  const event = JSON.parse(msg.data);
  // event.type ∈ { speech.transcript, speaker.turn,
  //               agent.tool, audio.chunk, intent.detected }
};

ws.send(JSON.stringify({
  action: "agent.attach",
  agentId: "advisor_v2",
}));`;

const pySnippet = `from Voxa import Relay

relay = Relay(api_key=os.environ["RELAY_KEY"])

async with relay.session(platform="meet", url=url) as s:
    async for event in s.events():
        if event.type == "speech.transcript":
            await s.speak(my_agent.respond(event.text))`;

function Code({ title, code, lang }: { title: string; code: string; lang: string }) {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(\/\/.*?)(\n|$)/g, '<span style="color:oklch(0.55 0.02 260)">$1</span>$2')
    .replace(/(#.*?)(\n|$)/g, '<span style="color:oklch(0.55 0.02 260)">$1</span>$2')
    .replace(/("(?:\\.|[^"\\])*")/g, '<span style="color:oklch(0.85 0.12 145)">$1</span>')
    .replace(
      /\b(import|from|const|let|async|await|new|return|if|as|with|for|in)\b/g,
      '<span style="color:oklch(0.78 0.18 235)">$1</span>',
    );
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{title}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {lang}
        </span>
      </div>
      <pre className="p-5 text-[12.5px] font-mono leading-relaxed overflow-x-auto">
        <code dangerouslySetInnerHTML={{ __html: escaped }} />
      </pre>
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <>
      <Helmet>
        <title>Developers — Voxa</title>
        <meta
          name="description"
          content="SDKs, APIs, WebSocket streams, and integration patterns for building real-time AI agents on Voxa."
        />
        <meta property="og:title" content="Developers — Voxa" />
        <meta
          property="og:description"
          content="Build conversational agents with TypeScript, Python, and streaming APIs."
        />
      </Helmet>
      <SiteLayout>
        <section className="relative overflow-hidden">
          <GridBackdrop />
          <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-16 sm:pt-32 text-center">
            <Eyebrow>Developers</Eyebrow>
            <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight text-gradient leading-[1.05]">
              Built for developers who ship live AI.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Typed SDKs, streaming APIs, and conversation-aware primitives. Get an agent into a
              real meeting in under 20 lines.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button asChild variant="electric" size="lg">
                <RouterLink to="/developers/docs">
                  Read Docs <ArrowRight className="h-4 w-4" />
                </RouterLink>
              </Button>
              <Button variant="glass" size="lg" asChild>
                <RouterLink to="/developers/access">Request SDK Beta</RouterLink>
              </Button>
            </div>
          </div>
        </section>

        <Section id="sdks">
          <SectionHeader
            eyebrow="SDKs"
            title="One conversation. Two languages."
            description="Typed end-to-end. Same model in every runtime."
          />
          <div className="mt-12 grid lg:grid-cols-2 gap-5">
            <Code title="agent.ts" code={sdkSnippet} lang="TypeScript" />
            <Code title="agent.py" code={pySnippet} lang="Python" />
          </div>
        </Section>

        <Section>
          <div className="grid lg:grid-cols-[1.2fr,1fr] gap-12 items-center">
            <Code title="stream.ts" code={wsSnippet} lang="WebSocket" />
            <div>
              <Eyebrow>WebSocket Architecture</Eyebrow>
              <h2 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
                Streaming first. Always.
              </h2>
              <p className="mt-5 text-muted-foreground leading-relaxed">
                Every event in Voxa — transcripts, turns, intents, audio chunks, tool invocations —
                is delivered over a single bidirectional WebSocket with replay and resume.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {[
                  "Sub-400ms p95 transcript latency",
                  "Backpressure-aware audio chunks",
                  "Resume from last event id",
                  "Per-agent stream multiplexing",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-electric" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section>
          <SectionHeader eyebrow="Integration Surface" title="Everything you need to ship." />
          <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <FeatureCard
              icon={<Terminal className="h-5 w-5" />}
              title="REST API"
              description="Manage sessions, agents, and policies via versioned REST endpoints."
            />
            <FeatureCard
              icon={<Cable className="h-5 w-5" />}
              title="WebSocket Streams"
              description="Real-time bidirectional event streams for live participation."
              delay={0.05}
            />
            <FeatureCard
              icon={<Webhook className="h-5 w-5" />}
              title="Webhooks"
              description="Subscribe to lifecycle, transcript, and outcome events."
              delay={0.1}
            />
            <FeatureCard
              icon={<Boxes className="h-5 w-5" />}
              title="Tool Calls"
              description="Native function-calling bridge to your existing agent stack."
              delay={0.15}
            />
          </div>
        </Section>

        <Section>
          <div className="glass rounded-3xl p-10 sm:p-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-electric/10 to-transparent" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
                Start building.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Explore the runtime foundation and join the waitlist for SDK access.
              </p>
              <div className="mt-8">
                <Button asChild variant="electric" size="lg">
                  <RouterLink to="/developers/access">
                    Request SDK Beta <ArrowRight className="h-4 w-4" />
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
