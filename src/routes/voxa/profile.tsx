import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mockUserProfile } from "@/lib/rooms";

export default function VoxaProfilePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-surface/40 backdrop-blur-md p-4">
        <button
          onClick={() => navigate("/voxa")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto px-4 py-12"
      >
        <div className="space-y-8">
          {/* Profile Header */}
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-5xl mx-auto mb-6">
              {mockUserProfile.avatar}
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{mockUserProfile.name}</h1>
            <p className="text-muted-foreground mb-4">{mockUserProfile.bio}</p>
            <p className="text-sm text-muted-foreground">
              Joined {mockUserProfile.joinedAt.toLocaleDateString()}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-lg p-6 text-center">
              <p className="text-3xl font-bold text-primary mb-2">{mockUserProfile.roomsJoined}</p>
              <p className="text-sm text-muted-foreground">Rooms Joined</p>
            </div>
            <div className="bg-surface border border-border rounded-lg p-6 text-center">
              <p className="text-3xl font-bold text-primary mb-2">
                {mockUserProfile.favoritePersonalities.length}
              </p>
              <p className="text-sm text-muted-foreground">Favorites</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <Button variant="outline" className="px-8">
              Edit Profile
            </Button>
            <Button className="px-8">Download History</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
