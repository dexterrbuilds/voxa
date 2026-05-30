import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Room } from "@/lib/rooms";

interface Message {
  id: string;
  participantId: string;
  participantName: string;
  text: string;
  timestamp: Date;
  isTyping?: boolean;
}

interface TranscriptPanelProps {
  room: Room;
}

const mockMessages: Message[] = [
  {
    id: "1",
    participantId: "nova",
    participantName: "Nova",
    text: "The key insight here is that AI systems are fundamentally changing how we approach problem-solving.",
    timestamp: new Date(Date.now() - 45000),
  },
  {
    id: "2",
    participantId: "echo",
    participantName: "Echo",
    text: "Exactly! And what's really interesting is the creative potential...",
    timestamp: new Date(Date.now() - 30000),
    isTyping: true,
  },
];

export default function TranscriptPanel({ room }: TranscriptPanelProps) {
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [typingParticipant, setTypingParticipant] = useState<string | null>(null);

  // Simulate new messages
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate typing indicator
      const participants = room.participants.filter((p) => !p.isMuted);
      if (participants.length > 0) {
        const randomParticipant = participants[Math.floor(Math.random() * participants.length)];
        setTypingParticipant(randomParticipant.id);

        setTimeout(() => {
          setTypingParticipant(null);
          // Add new message after typing
          const newMessage: Message = {
            id: String(Date.now()),
            participantId: randomParticipant.id,
            participantName: randomParticipant.name,
            text: "This is an interesting perspective...",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev.slice(-8), newMessage]);
        }, 1500);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [room]);

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

  const messageVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full rounded-xl border border-border bg-surface/40 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-foreground">Live Transcript</h3>
        <p className="text-xs text-muted-foreground">Real-time conversation</p>
      </div>

      {/* Messages */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <motion.div key={message.id} variants={messageVariants} layout className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {message.participantName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {message.timestamp.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {message.text}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {typingParticipant && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {room.participants.find((p) => p.id === typingParticipant)?.name}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ y: [0, -6, 0] }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.1,
                    }}
                    className="w-1.5 h-1.5 rounded-full bg-primary/50"
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spacer to keep messages at bottom */}
        <div />
      </motion.div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-border bg-surface/60">
        <input
          type="text"
          placeholder="Add a note..."
          className="w-full text-xs px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </motion.div>
  );
}
