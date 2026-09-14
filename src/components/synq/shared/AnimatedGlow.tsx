import { motion } from "framer-motion";

interface AnimatedGlowProps {
  color: string;
  size?: "sm" | "md" | "lg";
  intensity?: "low" | "medium" | "high";
  children?: React.ReactNode;
}

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-16 h-16",
  lg: "w-24 h-24",
};

const intensityMap = {
  low: { scale: [1, 1.3], opacity: [0.3, 0.1] },
  medium: { scale: [1, 1.6], opacity: [0.5, 0.2] },
  high: { scale: [1, 2], opacity: [0.7, 0.3] },
};

export default function AnimatedGlow({
  color,
  size = "md",
  intensity = "medium",
  children,
}: AnimatedGlowProps) {
  const animation = intensityMap[intensity];

  return (
    <div className="relative flex items-center justify-center">
      {/* Animated glow rings */}
      <motion.div
        animate={animation}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className={`absolute ${sizeMap[size]} rounded-full`}
        style={{
          background: `radial-gradient(circle, ${color}, transparent)`,
        }}
      />
      <motion.div
        animate={{
          scale: [1, intensity === "high" ? 2.5 : 1.8, 1],
          opacity: intensity === "high" ? [0.4, 0.1, 0.4] : [0.3, 0.05, 0.3],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className={`absolute ${sizeMap[size]} rounded-full`}
        style={{
          background: `radial-gradient(circle, ${color}, transparent)`,
        }}
      />

      {/* Content */}
      {children && <div className="relative z-10">{children}</div>}
    </div>
  );
}
