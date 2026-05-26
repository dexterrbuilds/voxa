import { motion } from "framer-motion";

const transcriptCode = `{
  "type": "speech.transcript",
  "speaker": "participant_1",
  "text": "Should we move forward?",
  "timestamp": 1721939281
}`;

const responseCode = `{
  "action": "speak",
  "text": "The proposal appears viable.",
  "agent": "advisor_v2"
}`;

function CodeBlock({ title, code, lang }: { title: string; code: string; lang: string }) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-electric/60" />
          </div>
          <span className="text-xs text-muted-foreground ml-2">{title}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {lang}
        </span>
      </div>
      <pre className="p-5 text-[12.5px] font-mono leading-relaxed overflow-x-auto">
        <code
          className="text-foreground/90"
          dangerouslySetInnerHTML={{ __html: highlight(code) }}
        />
      </pre>
    </div>
  );
}

function highlight(code: string) {
  return code
    .replace(/(&|<|>)/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
    .replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span style="color:oklch(0.78 0.18 235)">$1</span>$2')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span style="color:oklch(0.85 0.12 145)">$1</span>')
    .replace(/:\s*(\d+)/g, ': <span style="color:oklch(0.80 0.18 60)">$1</span>');
}

export function CodeShowcase() {
  return (
    <div className="grid md:grid-cols-2 gap-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <CodeBlock title="event.stream.json" code={transcriptCode} lang="JSON" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <CodeBlock title="agent.response.json" code={responseCode} lang="JSON" />
      </motion.div>
    </div>
  );
}
