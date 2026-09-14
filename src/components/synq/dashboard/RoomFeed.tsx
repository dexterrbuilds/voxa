import { motion } from "framer-motion";
import { mockRooms } from "@/lib/rooms";
import RoomCard from "./RoomCard";

interface RoomFeedProps {
  onRoomClick: (roomId: string) => void;
}

export default function RoomFeed({ onRoomClick }: RoomFeedProps) {
  const liveRooms = mockRooms.filter((room) => room.isLive);
  const scheduledRooms = mockRooms.filter((room) => !room.isLive);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      {/* Live Rooms Section */}
      {liveRooms.length > 0 && (
        <motion.section
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="mb-12"
        >
          <motion.div variants={itemVariants} className="flex items-center gap-3 mb-6">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
            <h2 className="text-2xl font-bold text-foreground">Live Now</h2>
            <span className="text-sm text-muted-foreground">
              {liveRooms.length} room{liveRooms.length !== 1 ? "s" : ""}
            </span>
          </motion.div>

          <motion.div
            variants={containerVariants}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {liveRooms.map((room, index) => (
              <motion.div key={room.id} variants={itemVariants}>
                <RoomCard room={room} isLive onClick={() => onRoomClick(room.id)} />
              </motion.div>
            ))}
          </motion.div>
        </motion.section>
      )}

      {/* Scheduled Rooms Section */}
      {scheduledRooms.length > 0 && (
        <motion.section initial="hidden" animate="visible" variants={containerVariants}>
          <motion.div variants={itemVariants} className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-foreground">Upcoming</h2>
            <span className="text-sm text-muted-foreground">
              {scheduledRooms.length} room{scheduledRooms.length !== 1 ? "s" : ""}
            </span>
          </motion.div>

          <motion.div
            variants={containerVariants}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {scheduledRooms.map((room) => (
              <motion.div key={room.id} variants={itemVariants}>
                <RoomCard room={room} isLive={false} onClick={() => onRoomClick(room.id)} />
              </motion.div>
            ))}
          </motion.div>
        </motion.section>
      )}
    </div>
  );
}
