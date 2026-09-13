"use client";
import { useEffect, useRef, useState } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/solana";
import { LaunchAuthContext } from "./LaunchAuth";
import { novaFetch } from "@/lib/nova-launch/client";
import type { SynqIdentity } from "@/lib/identity/wallet";
import { useTheme } from "@/components/ThemeProvider";

// Single flight survives rerenders/remounts; SDK createAdditional:false also rejects duplicates.
const provisioning = new Map<string, Promise<unknown>>();
function Session({ children }: { children: React.ReactNode }) {
  const privy = usePrivy();
  const { createWallet } = useCreateWallet();
  const [identity, setIdentity] = useState<{ did: string; user: SynqIdentity } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [bootError, setBootError] = useState(false);
  const methods = useRef({ createWallet });
  methods.current = { createWallet };
  const did = privy.user?.id;
  useEffect(() => {
    if (privy.ready) return;
    const timer = setTimeout(() => setBootError(true), 15000);
    return () => clearTimeout(timer);
  }, [privy.ready]);
  useEffect(() => {
    if (!privy.ready || !privy.authenticated || !did) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]);
    async function sync() {
      try {
        for (let n = 0; n < 6; n++) {
          signal.throwIfAborted();
          const { user } = (await (await novaFetch("session", { signal })).json()) as {
            user: SynqIdentity;
          };
          if (user.wallet) {
            setIdentity({ did: did!, user });
            setError("");
            return;
          }
          if (n === 0) {
            let job = provisioning.get(did!);
            if (!job) {
              job = methods.current.createWallet({ createAdditional: false });
              provisioning.set(did!, job);
              void job.finally(() => provisioning.delete(did!)).catch(() => {});
            }
            // An existing/just-created wallet can race the automatic login flow. Refetch server truth.
            void job.catch(() => {});
          }
          await new Promise<void>((resolve, reject) => {
            const done = () => {
              signal.removeEventListener("abort", cancel);
              resolve();
            };
            const timer = setTimeout(done, 2000 + n * 1000);
            const cancel = () => {
              clearTimeout(timer);
              reject(new Error("cancelled"));
            };
            signal.addEventListener("abort", cancel, { once: true });
          });
        }
        throw new Error("wallet_not_ready");
      } catch {
        if (!controller.signal.aborted)
          setError(
            "We couldn't prepare your wallet. Try again; an existing wallet will be reused.",
          );
      }
    }
    void sync();
    return () => controller.abort();
  }, [privy.ready, privy.authenticated, did, attempt]);
  const current = privy.authenticated && identity && did === identity.did ? identity.user : null;
  async function logout() {
    try {
      await novaFetch("session", { method: "DELETE" });
      await privy.logout();
      setIdentity(null);
      setError("");
    } catch {
      setError("Sign-out could not be completed. Check your connection and try again.");
      throw new Error("Sign-out unavailable");
    }
  }
  return (
    <LaunchAuthContext.Provider
      value={{
        user: current,
        initialized: privy.ready,
        authenticated: privy.authenticated,
        status: "Preparing your wallet...",
        error:
          !privy.ready && bootError
            ? "Sign-in is taking longer than expected. Reload the page to try again."
            : error,
        retry: () => {
          setError("");
          setAttempt((n) => n + 1);
        },
        login: (method) => privy.login({ loginMethods: [method] }),
        logout,
      }}
    >
      {children}
    </LaunchAuthContext.Provider>
  );
}
export default function PrivyBoundary({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId)
    return (
      <main className="glacier-world min-h-screen grid place-items-center p-6">
        <p role="alert">Sign-in is temporarily unavailable. Please try again later.</p>
      </main>
    );
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods:
          process.env.NEXT_PUBLIC_PRIVY_GOOGLE_ENABLED === "true" ? ["email", "google"] : ["email"],
        appearance: {
          theme,
          accentColor: "#166cba",
          logo: "/synq-mark.svg",
          landingHeader: "Welcome to Synq",
          walletChainType: "solana-only",
        },
        embeddedWallets: {
          solana: { createOnLogin: "all-users" },
          ethereum: { createOnLogin: "off" },
        },
      }}
    >
      <Session>{children}</Session>
    </PrivyProvider>
  );
}
