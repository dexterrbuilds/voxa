import { motion } from "framer-motion";
import { Menu, Plus, Search, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopNavProps {
  onCreateRoom: () => void;
  onMenuToggle: () => void;
}

export default function TopNav({ onCreateRoom, onMenuToggle }: TopNavProps) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="border-b border-border bg-surface/40 backdrop-blur-md"
    >
      <div className="px-4 lg:px-8 py-4 flex items-center justify-between">
        {/* Left: Menu & Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuToggle}
            className="p-2 hover:bg-border rounded-lg transition-colors lg:hidden"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        </div>

        {/* Right: Search, Notifications, Create */}
        <div className="flex items-center gap-3">
          {/* Search (hidden on mobile) */}
          <div className="hidden md:flex items-center bg-surface border border-border rounded-lg px-3 py-2 max-w-xs">
            <Search size={16} className="text-muted-foreground" />
            <input
              type="text"
              placeholder="Search rooms..."
              className="bg-transparent border-none outline-none ml-2 text-sm text-foreground placeholder-muted-foreground w-full"
            />
          </div>

          {/* Notifications */}
          <button className="p-2 hover:bg-border rounded-lg transition-colors relative">
            <Bell size={20} className="text-muted-foreground" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full"></span>
          </button>

          {/* Create Room Button */}
          <Button
            onClick={onCreateRoom}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Create Room</span>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
