import { motion } from "framer-motion";
import { Mic, MicOff, MessageSquare, LogOut, Users, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ControlsPanelProps {
  isMuted: boolean;
  onMuteToggle: () => void;
  onTranscriptToggle: () => void;
  showTranscript: boolean;
}

export default function ControlsPanel({
  isMuted,
  onMuteToggle,
  onTranscriptToggle,
  showTranscript,
}: ControlsPanelProps) {
  const controls = [
    {
      icon: isMuted ? MicOff : Mic,
      label: isMuted ? "Unmute" : "Mute",
      onClick: onMuteToggle,
      variant: isMuted ? "destructive" : "default",
      highlight: true,
    },
    {
      icon: MessageSquare,
      label: showTranscript ? "Hide" : "Show",
      onClick: onTranscriptToggle,
      variant: "default",
      highlight: false,
    },
    {
      icon: Users,
      label: "Invite",
      onClick: () => {},
      variant: "default",
      highlight: false,
    },
    {
      icon: Settings,
      label: "Settings",
      onClick: () => {},
      variant: "default",
      highlight: false,
    },
  ];

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="mt-8 flex items-center justify-center gap-4 flex-wrap"
    >
      {controls.slice(0, 2).map((control, index) => {
        const Icon = control.icon;
        return (
          <motion.div key={index} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <button
              onClick={control.onClick}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all border ${
                control.highlight
                  ? isMuted
                    ? "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30"
                    : "bg-primary hover:bg-primary/90 border-primary text-primary-foreground"
                  : "bg-surface border-border text-foreground hover:bg-border"
              }`}
            >
              <Icon size={18} />
              <span>{control.label}</span>
            </button>
          </motion.div>
        );
      })}

      {/* Secondary controls */}
      <div className="flex items-center gap-3 ml-4 pl-4 border-l border-border">
        {controls.slice(2).map((control, index) => {
          const Icon = control.icon;
          return (
            <motion.button
              key={index}
              onClick={control.onClick}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="p-3 rounded-lg bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-border transition-colors"
              title={control.label}
            >
              <Icon size={18} />
            </motion.button>
          );
        })}

        {/* Leave button */}
        <motion.button
          onClick={() => window.history.back()}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors ml-2"
          title="Leave Room"
        >
          <LogOut size={18} />
        </motion.button>
      </div>
    </motion.div>
  );
}
