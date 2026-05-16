import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import WelcomeHero from "@/components/voxa/auth/WelcomeHero";
import AnimatedBackground from "@/components/voxa/auth/AnimatedBackground";

export default function VoxaLoginPage() {
  const { signInWithGoogle, loading, error } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("[v0] Google sign-in failed:", err);
      setIsSigningIn(false);
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
            <Button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn || loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base"
            >
              {isSigningIn || loading ? "Signing in..." : "Continue with Google"}
            </Button>

            {error && (
              <div className="text-sm text-red-500 text-center">
                {error.message}
              </div>
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
