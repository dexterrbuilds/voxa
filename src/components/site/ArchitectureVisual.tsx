import { motion } from "framer-motion";
import { Mic, Bot, Radio, Waves } from "lucide-react";

const platforms = [
  { name: "Zoom", color: "oklch(0.65 0.18 245)" },
  { name: "Google Meet", color: "oklch(0.70 0.18 145)" },
  { name: "WebRTC", color: "oklch(0.75 0.16 60)" },
];

export function ArchitectureVisual() {
  return (
    <div className="relative w-full max-w-3xl mx-auto aspect-[5/4] sm:aspect-[16/10]">
      {/* SVG connection lines */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 600 400"
        fill="none"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="line" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.20 245)" stopOpacity="0" />
            <stop offset="50%" stopColor="oklch(0.78 0.18 235)" stopOpacity="1" />
            <stop offset="100%" stopColor="oklch(0.72 0.20 245)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[150, 300, 450].map((x, i) => (
          <g key={i}>
            <line x1={x} y1="60" x2="300" y2="200" stroke="oklch(1 0 0 / 0.08)" strokeWidth="1" />
            <line
              x1={x}
              y1="60"
              x2="300"
              y2="200"
              stroke="url(#line)"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              className="animate-flow"
              style={{ animationDelay: `${i * 0.4}s` }}
            />
            <line x1="300" y1="240" x2={x} y2="360" stroke="oklch(1 0 0 / 0.08)" strokeWidth="1" />
            <line
              x1="300"
              y1="240"
              x2={x}
              y2="360"
              stroke="url(#line)"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              className="animate-flow"
              style={{ animationDelay: `${i * 0.4 + 0.6}s` }}
            />
          </g>
        ))}
      </svg>

      {/* Top: Platforms */}
      <div className="absolute top-0 inset-x-0 flex justify-around">
        {platforms.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, y: -10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass rounded-xl px-3 sm:px-4 py-2.5 flex items-center gap-2 min-w-[100px] sm:min-w-[130px]"
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: p.color, boxShadow: `0 0 10px ${p.color}` }}
            />
            <span className="text-xs sm:text-sm font-medium">{p.name}</span>
          </motion.div>
        ))}
      </div>

      {/* Center: Voxa */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <div className="relative glass rounded-2xl px-6 py-4 animate-pulse-glow">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-electric to-electric-glow grid place-items-center">
              <Radio className="h-4 w-4 text-background" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Runtime
              </div>
              <div className="font-semibold text-sm">Voxa</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Bottom: Agents */}
      <div className="absolute bottom-0 inset-x-0 flex justify-around">
        {[
          { Icon: Bot, label: "Sales Agent" },
          { Icon: Mic, label: "Note Taker" },
          { Icon: Waves, label: "Co-Pilot" },
        ].map((a, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 + i * 0.1 }}
            className="glass rounded-xl px-3 sm:px-4 py-2.5 flex items-center gap-2 min-w-[100px] sm:min-w-[130px]"
          >
            <a.Icon className="h-3.5 w-3.5 text-electric" />
            <span className="text-xs sm:text-sm font-medium">{a.label}</span>
          </motion.div>
        ))}
      </div>

      {/* Floating event cards */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.8 }}
        className="hidden lg:block absolute -left-8 top-[35%] glass rounded-lg px-3 py-2 text-[11px] font-mono animate-float"
        style={{ animationDelay: "0.5s" }}
      >
        <div className="text-electric">speech.transcript</div>
        <div className="text-muted-foreground">"Should we proceed?"</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 1 }}
        className="hidden lg:block absolute -right-4 top-[55%] glass rounded-lg px-3 py-2 text-[11px] font-mono animate-float"
        style={{ animationDelay: "1.5s" }}
      >
        <div className="text-electric">agent.response</div>
        <div className="text-muted-foreground">"Proposal looks viable."</div>
      </motion.div>
    </div>
  );
}
