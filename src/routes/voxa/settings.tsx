import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Lock, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function VoxaSettingsPage() {
  const navigate = useNavigate();

  const settings = [
    {
      icon: Volume2,
      title: "Audio Settings",
      description: "Microphone and speaker preferences",
      action: true,
    },
    {
      icon: Bell,
      title: "Notifications",
      description: "Control how and when you get notified",
      action: true,
    },
    {
      icon: Lock,
      title: "Privacy & Security",
      description: "Manage your privacy settings",
      action: true,
    },
  ];

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
        <h1 className="text-3xl font-bold text-foreground mb-8">Settings</h1>

        <div className="space-y-4">
          {settings.map((setting, index) => {
            const Icon = setting.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Icon size={20} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{setting.title}</h3>
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                  </div>
                </div>
                {setting.action && <Switch defaultChecked />}
              </motion.div>
            );
          })}
        </div>

        {/* Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12 p-6 bg-red-500/10 border border-red-500/30 rounded-lg"
        >
          <h3 className="font-semibold text-red-400 mb-2">Danger Zone</h3>
          <p className="text-sm text-muted-foreground mb-4">These actions cannot be undone.</p>
          <button className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors font-medium text-sm">
            Sign Out
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
