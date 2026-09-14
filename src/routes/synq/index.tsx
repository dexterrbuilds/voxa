import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Sidebar from "@/components/synq/dashboard/Sidebar";
import TopNav from "@/components/synq/dashboard/TopNav";
import RoomFeed from "@/components/synq/dashboard/RoomFeed";
import CreateRoomModal from "@/components/synq/modals/CreateRoomModal";

export default function SynqDashboard() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleRoomClick = (roomId: string) => {
    navigate(`/synq/room/${roomId}`);
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation */}
        <TopNav
          onCreateRoom={() => setShowCreateModal(true)}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Content area */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="flex-1 overflow-y-auto"
        >
          <RoomFeed onRoomClick={handleRoomClick} />
        </motion.div>
      </div>

      {/* Create Room Modal */}
      <CreateRoomModal open={showCreateModal} onOpenChange={setShowCreateModal} />
    </div>
  );
}
