import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import { Participant } from "@/lib/rooms";
import { getPersonalityById } from "@/lib/personalities";

interface ParticipantAvatarProps {
  participant: Participant;
  isSpeaking: boolean;
}

export default function ParticipantAvatar({ participant, isSpeaking }: ParticipantAvatarProps) {
  const personality = participant.personalityId
    ? getPersonalityById(participant.personalityId)
    : null;

  const accentColor = personality?.accentColor || "oklch(0.72 0.20 245)";

  return (
    <motion.div
      className="relative h-full flex flex-col items-center justify-center"
      whileHover={{ scale: 1.02 }}
    >
      {/* Speaking ring animation */}
      {isSpeaking && !participant.isMuted && (
        <>
          <motion.div
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.6, 0.2, 0.6],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: accentColor }}
          />
          <motion.div
            animate={{
              scale: [1, 1.8, 1],
              opacity: [0.3, 0.1, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: accentColor }}
          />
        </>
      )}

      {/* Avatar card */}
      <motion.div
        animate={
          isSpeaking && !participant.isMuted
            ? {
                scale: [1, 1.05, 1],
              }
            : {}
        }
        transition={
          isSpeaking && !participant.isMuted
            ? {
                duration: 0.6,
                repeat: Infinity,
                ease: "easeInOut",
              }
            : {}
        }
        className="relative w-32 h-32 rounded-2xl border-2 border-border bg-surface flex flex-col items-center justify-center overflow-hidden"
        style={
          isSpeaking && !participant.isMuted
            ? {
                borderColor: accentColor,
                boxShadow: `0 0 20px ${accentColor}`,
              }
            : {}
        }
      >
        {/* Avatar background glow */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${accentColor}, transparent)`,
          }}
        />

        {/* Waveform visualization */}
        {isSpeaking && !participant.isMuted && (
          <motion.div className="absolute inset-0 flex items-center justify-center gap-1">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  scaleY: [0.4, 1, 0.4],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.1,
                  ease: "easeInOut",
                }}
                className="w-1 rounded-full"
                style={{
                  height: "16px",
                  backgroundColor: accentColor,
                  opacity: 0.6,
                }}
              />
            ))}
          </motion.div>
        )}

        {/* Avatar content */}
        <div className="relative z-10 text-center">
          <div className="text-4xl mb-2">{participant.avatar}</div>
          <p className="text-xs font-semibold text-foreground">{participant.name}</p>
        </div>
      </motion.div>

      {/* Mute indicator */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="mt-3"
      >
        {participant.isMuted ? (
          <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/30">
            <MicOff size={16} className="text-red-400" />
          </div>
        ) : (
          <div
            className="p-2 rounded-lg"
            style={{
              backgroundColor: `${accentColor}20`,
              borderColor: `${accentColor}50`,
              borderWidth: "1px",
            }}
          >
            <Mic size={16} style={{ color: accentColor }} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
