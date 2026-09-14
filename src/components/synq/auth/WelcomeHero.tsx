import { motion } from "framer-motion";

export default function WelcomeHero() {
  return (
    <div className="text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-6"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20">
          <span className="text-3xl font-bold text-primary">◆</span>
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6 }}
        className="text-4xl font-bold text-foreground mb-3"
      >
        Synq
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="text-lg text-muted-foreground max-w-sm mx-auto"
      >
        Have natural conversations with AI personalities in real-time voice rooms
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="mt-6 flex items-center justify-center gap-2 text-sm text-primary/70"
      >
        <div className="w-2 h-2 rounded-full bg-primary/50 animate-pulse"></div>
        <span>Beta Access</span>
      </motion.div>
    </div>
  );
}
