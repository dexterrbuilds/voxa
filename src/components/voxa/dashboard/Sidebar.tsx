import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Home, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const navItems = [
  { icon: Home, label: "Dashboard", href: "/voxa" },
  { icon: User, label: "Profile", href: "/voxa/profile" },
  { icon: Settings, label: "Settings", href: "/voxa/settings" },
];

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isOpen ? "open" : "closed"}
        initial={{ x: isOpen ? 0 : -280 }}
        animate={{ x: 0 }}
        exit={{ x: -280 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className={cn(
          "fixed left-0 top-0 h-screen w-72 bg-surface/80 backdrop-blur-md border-r border-border",
          "flex flex-col z-40",
          !isOpen && "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">◆</span>
            </div>
            <span className="text-xl font-bold text-foreground">Voxa</span>
          </motion.div>
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-border rounded-lg transition-colors lg:hidden"
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;

            return (
              <motion.button
                key={item.href}
                onClick={() => {
                  navigate(item.href);
                  // Close sidebar on mobile
                  if (window.innerWidth < 1024) {
                    onToggle();
                  }
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                  isActive
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-border hover:text-foreground",
                )}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* User Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="px-4 py-4 border-t border-border"
        >
          <button
            onClick={() => navigate("/voxa/profile")}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-border transition-colors group"
          >
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg">
              👤
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-sm text-foreground">Alex Rivera</p>
              <p className="text-xs text-muted-foreground">Online</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          </button>
        </motion.div>
      </motion.div>

      {/* Mobile overlay */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onToggle}
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
        />
      )}
    </AnimatePresence>
  );
}
