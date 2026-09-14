import { motion, type Variants } from "framer-motion";
import { Participant } from "@/lib/rooms";
import ParticipantAvatar from "./ParticipantAvatar";

interface ParticipantGridProps {
  participants: Participant[];
  speakingParticipant: string | null;
}

export default function ParticipantGrid({
  participants,
  speakingParticipant,
}: ParticipantGridProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { type: "spring", damping: 15, stiffness: 100 },
    },
  } satisfies Variants;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex-1 flex flex-col gap-6"
    >
      {/* Title */}
      <motion.h2 variants={itemVariants} className="text-xl font-semibold text-foreground">
        Participants ({participants.length})
      </motion.h2>

      {/* Grid */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 flex-1 auto-rows-max"
      >
        {participants.map((participant) => (
          <motion.div key={participant.id} variants={itemVariants} className="h-40">
            <ParticipantAvatar
              participant={participant}
              isSpeaking={speakingParticipant === participant.id}
            />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
