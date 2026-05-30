import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import WelcomeHero from "@/components/voxa/auth/WelcomeHero";
import AnimatedBackground from "@/components/voxa/auth/AnimatedBackground";

export default function VoxaLoginPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [betaCode, setBetaCode] = useState("");
  const [showBetaInput, setShowBetaInput] = useState(false);

  const handleContinue = async () => {
    setIsLoading(true);
    // Simulate auth delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    navigate("/voxa");
  };

  const handleBetaAccess = () => {
    if (betaCode.trim()) {
      handleContinue();
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <AnimatedBackground />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <WelcomeHero />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="mt-8 space-y-4"
          >
            {!showBetaInput ? (
              <>
                <Button
                  onClick={handleContinue}
                  disabled={isLoading}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base"
                >
                  {isLoading ? "Signing in..." : "Continue with Google"}
                </Button>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-4">Don&apos;t have access yet?</p>
                  <button
                    onClick={() => setShowBetaInput(true)}
                    className="text-sm text-primary hover:text-primary/80 transition-colors font-medium"
                  >
                    Enter Beta Code
                  </button>
                </div>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <input
                  type="text"
                  placeholder="Enter your beta access code"
                  value={betaCode}
                  onChange={(e) => setBetaCode(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleBetaAccess()}
                  className="w-full px-4 py-3 rounded-lg bg-surface border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                <Button
                  onClick={handleBetaAccess}
                  disabled={isLoading || !betaCode.trim()}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3"
                >
                  {isLoading ? "Verifying..." : "Verify Code"}
                </Button>
                <button
                  onClick={() => {
                    setShowBetaInput(false);
                    setBetaCode("");
                  }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                >
                  Back
                </button>
              </motion.div>
            )}

            <p className="text-xs text-muted-foreground text-center mt-6">
              By continuing, you agree to Voxa&apos;s Terms of Service and Privacy Policy
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
