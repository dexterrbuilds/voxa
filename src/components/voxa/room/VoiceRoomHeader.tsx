import { motion } from "framer-motion";
import { ArrowLeft, Users, Radio, Share2 } from "lucide-react";
import { Room } from "@/lib/rooms";
import { Button } from "@/components/ui/button";

interface VoiceRoomHeaderProps {
  room: Room;
  onBack: () => void;
  participantCount: number;
  listenerCount: number;
}

export default function VoiceRoomHeader({
  room,
  onBack,
  participantCount,
  listenerCount,
}: VoiceRoomHeaderProps) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="border-b border-border bg-surface/40 backdrop-blur-md px-4 lg:px-8 py-4"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Back & Title */}
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-border rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              </motion.div>
              <h1 className="text-lg font-bold text-foreground truncate">LIVE</h1>
            </div>
            <p className="text-sm text-muted-foreground truncate">{room.title}</p>
          </div>
        </div>

        {/* Right: Stats & Actions */}
        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users size={16} />
              <span>{participantCount} speaking</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Radio size={16} />
              <span>{listenerCount} listening</span>
            </div>
          </div>

          {/* Share Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 flex-shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(`Check out this voice room: "${room.title}" on Voxa`);
            }}
          >
            <Share2 size={16} />
            <span className="hidden sm:inline">Share</span>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
