import { motion } from "framer-motion";

interface WaveformProps {
  isActive?: boolean;
  color?: string;
  barCount?: number;
}

export default function Waveform({
  isActive = true,
  color = "oklch(0.72 0.20 245)",
  barCount = 5,
}: WaveformProps) {
  const bars = Array.from({ length: barCount }, (_, i) => i);

  return (
    <div className="flex items-center justify-center gap-1">
      {bars.map((i) => (
        <motion.div
          key={i}
          animate={
            isActive
              ? {
                  scaleY: [0.4, 1, 0.4],
                  opacity: [0.6, 1, 0.6],
                }
              : { scaleY: 0.4, opacity: 0.4 }
          }
          transition={
            isActive
              ? {
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.1,
                  ease: "easeInOut",
                }
              : {}
          }
          className="w-1 rounded-full"
          style={{
            height: "16px",
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
}
