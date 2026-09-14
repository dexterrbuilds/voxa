import { motion } from "framer-motion";
import { Users, Radio } from "lucide-react";
import { Room } from "@/lib/rooms";
import { PERSONALITIES } from "@/lib/personalities";

interface RoomCardProps {
  room: Room;
  isLive: boolean;
  onClick: () => void;
}

export default function RoomCard({ room, isLive, onClick }: RoomCardProps) {
  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just started";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return "Today";
  };

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      className="group w-full text-left"
    >
      <div
        className="relative h-40 rounded-xl overflow-hidden mb-4 bg-surface border border-border group-hover:border-primary/50 transition-colors"
        style={
          {
            backgroundImage: `radial-gradient(circle at 50% 0%, var(--accent-color) 0%, transparent 70%)`,
          } as React.CSSProperties & { ["--accent-color"]: string }
        }
      >
        {/* Background gradient based on room */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `linear-gradient(135deg, ${room.personalities[0] ? PERSONALITIES[room.personalities[0]].accentColor : "oklch(0.72 0.20 245)"}, transparent)`,
          }}
        />

        {/* Live indicator */}
        {isLive && (
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-full"
          >
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-xs font-semibold text-red-400">LIVE</span>
          </motion.div>
        )}

        {/* Listener count */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users size={14} />
          <span>{room.listenerCount} listening</span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-2">
        {/* Title */}
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {room.title}
        </h3>

        {/* Topic & Time */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="px-2 py-1 rounded bg-muted">{room.topic}</span>
          <span>{formatTime(room.startedAt)}</span>
        </div>

        {/* Personality avatars */}
        <div className="flex items-center gap-2 pt-2">
          <div className="flex -space-x-2">
            {room.personalities.slice(0, 3).map((personalityId) => {
              const personality = PERSONALITIES[personalityId];
              return (
                <div
                  key={personalityId}
                  className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-sm"
                  style={{
                    background: `linear-gradient(135deg, ${personality.accentColor}, transparent)`,
                  }}
                  title={personality.name}
                >
                  <span className="text-xs font-bold">{personality.avatar}</span>
                </div>
              );
            })}
            {room.personalities.length > 3 && (
              <div className="w-7 h-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-semibold">
                +{room.personalities.length - 3}
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground ml-2">
            {room.personalities.length} AI personality{room.personalities.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
