import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import VoiceRoomHeader from "@/components/voxa/room/VoiceRoomHeader";
import ParticipantGrid from "@/components/voxa/room/ParticipantGrid";
import ControlsPanel from "@/components/voxa/room/ControlsPanel";
import TranscriptPanel from "@/components/voxa/room/TranscriptPanel";
import { getRoomById } from "@/lib/rooms";

export default function VoxaRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const room = roomId ? getRoomById(roomId) : null;
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [speakingParticipant, setSpeakingParticipant] = useState<string | null>(
    room?.participants[0]?.id || null,
  );

  // Simulate participants speaking
  useEffect(() => {
    const interval = setInterval(() => {
      if (room) {
        const participants = room.participants.filter((p) => !p.isMuted);
        const randomIndex = Math.floor(Math.random() * participants.length);
        setSpeakingParticipant(participants[randomIndex]?.id || null);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [room]);

  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Room not found</h1>
          <button
            onClick={() => navigate("/voxa")}
            className="text-primary hover:text-primary/80 font-medium"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-background flex flex-col"
    >
      {/* Header */}
      <VoiceRoomHeader
        room={room}
        onBack={() => navigate("/voxa")}
        participantCount={room.participants.length}
        listenerCount={room.listenerCount}
      />

      {/* Main content */}
      <div className="flex-1 flex gap-4 p-4 lg:p-8 overflow-hidden">
        {/* Participants Grid */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex-1 flex flex-col min-w-0"
        >
          <ParticipantGrid
            participants={room.participants}
            speakingParticipant={speakingParticipant}
          />

          {/* Controls Panel */}
          <ControlsPanel
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted(!isMuted)}
            onTranscriptToggle={() => setShowTranscript(!showTranscript)}
            showTranscript={showTranscript}
          />
        </motion.div>

        {/* Transcript Panel */}
        {showTranscript && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="hidden lg:flex w-80 flex-col"
          >
            <TranscriptPanel room={room} />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
