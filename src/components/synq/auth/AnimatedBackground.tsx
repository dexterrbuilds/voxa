import { motion } from "framer-motion";

export default function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Animated gradient mesh */}
      <motion.div
        animate={{
          background: [
            "radial-gradient(circle at 20% 50%, oklch(0.45 0.15 245 / 0.3) 0%, transparent 50%)",
            "radial-gradient(circle at 80% 50%, oklch(0.45 0.15 260 / 0.3) 0%, transparent 50%)",
            "radial-gradient(circle at 20% 50%, oklch(0.45 0.15 245 / 0.3) 0%, transparent 50%)",
          ],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute inset-0"
      />

      {/* Static gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, oklch(0.45 0.18 235 / 0.15) 0%, transparent 50%)",
        }}
      />

      {/* Grid background */}
      <div className="absolute inset-0 grid-bg opacity-50" />

      {/* Floating orbs */}
      <motion.div
        animate={{
          y: [0, -30, 0],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-20 right-10 w-64 h-64 rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.72 0.20 245 / 0.15) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <motion.div
        animate={{
          y: [0, 30, 0],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute bottom-20 left-10 w-96 h-96 rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.65 0.22 250 / 0.15) 0%, transparent 70%)",
          filter: "blur(50px)",
        }}
      />

      {/* Floating particles */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            y: [0, Math.random() * 300 - 150, 0],
            x: [0, Math.random() * 200 - 100, 0],
            opacity: [0, 0.5, 0],
          }}
          transition={{
            duration: 12 + Math.random() * 8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: Math.random() * 3,
          }}
          className="absolute w-1 h-1 rounded-full bg-primary/40"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
        />
      ))}

      {/* Dark overlay to darken the background */}
      <div className="absolute inset-0 bg-background/40" />
    </div>
  );
}
