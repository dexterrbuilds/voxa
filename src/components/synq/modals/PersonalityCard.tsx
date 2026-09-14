import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Personality } from "@/lib/personalities";

interface PersonalityCardProps {
  personality: Personality;
  isSelected: boolean;
  onToggle: () => void;
}

export default function PersonalityCard({
  personality,
  isSelected,
  onToggle,
}: PersonalityCardProps) {
  return (
    <motion.button
      onClick={onToggle}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`relative w-full p-4 rounded-xl border-2 transition-all group ${
        isSelected
          ? "bg-primary/20 border-primary"
          : "bg-surface border-border hover:border-primary/50"
      }`}
    >
      {/* Selection indicator */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center"
        >
          <Check size={16} className="text-primary-foreground" />
        </motion.div>
      )}

      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl mb-3 border border-primary/20"
        style={{
          background: `linear-gradient(135deg, ${personality.accentColor}, transparent)`,
        }}
      >
        {personality.avatar}
      </div>

      {/* Content */}
      <h3 className="font-bold text-foreground text-left">{personality.name}</h3>
      <p className="text-xs text-muted-foreground text-left">{personality.title}</p>
      <p className="text-xs text-muted-foreground text-left mt-2 line-clamp-2">
        {personality.description}
      </p>
    </motion.button>
  );
}
