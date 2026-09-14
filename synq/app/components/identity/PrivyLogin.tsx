"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { BetaShell, BetaHeader, BetaPanel, BetaEyebrow, BetaButton } from "@/components/BetaChrome";
import { LaunchAuthProvider, useLaunchAuth } from "./LaunchAuth";
function LoginSurface() {
  const auth = useLaunchAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.initialized && auth.authenticated) router.replace("/nova");
  }, [auth.initialized, auth.authenticated, router]);
  return (
    <BetaShell className="glacier-world glacier-auth">
      <BetaHeader />
      <div className="mx-auto grid max-w-5xl items-start gap-8 px-5 py-8 sm:py-16 lg:grid-cols-2 lg:gap-16">
        <div className="glacier-auth-intro">
          <img className="nova-presence" src="/nova-prism.svg" alt="" />
          <BetaEyebrow>Nova, by Synq</BetaEyebrow>
          <h1 className="beta-text-gradient mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
            A conversation.
            <br />A clearer next move.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[var(--muted-foreground)]">
            Understand your wallet and explore on-chain ideas with Nova.
          </p>
        </div>
        <BetaPanel className="p-6 sm:p-8 glacier-auth-panel glass-elevated">
          <h2 className="text-2xl font-semibold">Welcome to Synq</h2>
          <p className="mt-3 text-[var(--muted-foreground)]">
            Sign in or create your account. Your Solana wallet is included. No external wallet
            needed.
          </p>
          {auth.error && (
            <p className="mt-4" role="alert">
              {auth.error}
            </p>
          )}
          <BetaButton
            className="w-full mt-8"
            disabled={!auth.initialized}
            onClick={() => auth.login("email")}
          >
            <Mail size={18} /> Continue with email
          </BetaButton>
          {process.env.NEXT_PUBLIC_PRIVY_GOOGLE_ENABLED === "true" && (
            <BetaButton
              variant="glass"
              className="w-full mt-3"
              disabled={!auth.initialized}
              onClick={() => auth.login("google")}
            >
              Continue with Google
            </BetaButton>
          )}
          <p className="mt-6 text-sm text-[var(--muted-foreground)]">
            Read balances and review quotes. Transactions remain disabled.
          </p>
        </BetaPanel>
      </div>
    </BetaShell>
  );
}
export default function PrivyLogin() {
  return (
    <LaunchAuthProvider>
      <LoginSurface />
    </LaunchAuthProvider>
  );
}
