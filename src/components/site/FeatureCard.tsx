import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function FeatureCard({
  icon,
  title,
  description,
  delay = 0,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      className="group relative glass rounded-2xl p-6 hover:border-electric/30 transition-all duration-500 overflow-hidden"
    >
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-electric/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      <div className="relative">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-electric/20 to-electric/5 border border-electric/20 grid place-items-center text-electric mb-5 group-hover:scale-110 transition-transform duration-500">
          {icon}
        </div>
        <h3 className="font-semibold text-base mb-2 tracking-normal">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}
