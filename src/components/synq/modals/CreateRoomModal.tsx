import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PERSONALITIES } from "@/lib/personalities";
import PersonalityCard from "./PersonalityCard";

interface CreateRoomModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateRoomModal({ open, onOpenChange }: CreateRoomModalProps) {
  const [roomTitle, setRoomTitle] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [selectedPersonalities, setSelectedPersonalities] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const togglePersonality = (personalityId: string) => {
    setSelectedPersonalities((prev) =>
      prev.includes(personalityId)
        ? prev.filter((p) => p !== personalityId)
        : [...prev, personalityId],
    );
  };

  const handleCreate = async () => {
    if (!roomTitle.trim() || selectedPersonalities.length === 0) {
      return;
    }

    setIsCreating(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setIsCreating(false);
    onOpenChange(false);
    setRoomTitle("");
    setRoomDescription("");
    setSelectedPersonalities([]);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] bg-surface border border-border rounded-2xl z-50 overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-border bg-surface">
              <h2 className="text-2xl font-bold text-foreground">Create a Voice Room</h2>
              <button
                onClick={() => onOpenChange(false)}
                className="p-2 hover:bg-border rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-8">
              {/* Room Details */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Room Title
                  </label>
                  <input
                    type="text"
                    value={roomTitle}
                    onChange={(e) => setRoomTitle(e.target.value)}
                    placeholder="e.g., The Future of AI: Trends & Predictions"
                    maxLength={60}
                    className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{roomTitle.length}/60</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={roomDescription}
                    onChange={(e) => setRoomDescription(e.target.value)}
                    placeholder="Describe the topic and discussion..."
                    maxLength={200}
                    rows={3}
                    className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{roomDescription.length}/200</p>
                </div>
              </div>

              {/* AI Personalities Selection */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-foreground">
                    Add AI Personalities
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {selectedPersonalities.length} selected
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.values(PERSONALITIES).map((personality) => (
                    <motion.div
                      key={personality.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 }}
                    >
                      <PersonalityCard
                        personality={personality}
                        isSelected={selectedPersonalities.includes(personality.id)}
                        onToggle={() => togglePersonality(personality.id)}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={isCreating || !roomTitle.trim() || selectedPersonalities.length === 0}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  {isCreating ? "Creating..." : "Create Room"}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
