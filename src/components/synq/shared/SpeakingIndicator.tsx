import { motion } from "framer-motion";

interface SpeakingIndicatorProps {
  isSpeaking: boolean;
  name: string;
  color?: string;
}

export default function SpeakingIndicator({
  isSpeaking,
  name,
  color = "oklch(0.72 0.20 245)",
}: SpeakingIndicatorProps) {
  if (!isSpeaking) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border"
      style={{
        borderColor: color,
        backgroundColor: `${color}15`,
      }}
    >
      <div className="flex gap-1">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ scale: [0.6, 1, 0.6] }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.15,
            }}
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <span className="text-xs font-medium" style={{ color }}>
        {name} speaking
      </span>
    </motion.div>
  );
}
