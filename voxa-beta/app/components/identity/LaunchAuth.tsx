"use client";
import { createContext, useContext, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { privyEnabled } from "@/lib/identity/config";
import type { SynqIdentity } from "@/lib/identity/wallet";
import Loading from "@/loading";

export type LaunchAuthState = {
  user: SynqIdentity | null;
  initialized: boolean;
  authenticated: boolean;
  error: string;
  status: string;
  retry: () => void;
  login: (method: "email" | "google") => void;
  logout: () => Promise<void>;
};
export const LaunchAuthContext = createContext<LaunchAuthState | null>(null);
const PrivyBoundary = dynamic(() => import("./PrivyBoundary"), {
  ssr: false,
  loading: () => <Loading />,
});
function LegacyBoundary({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  return (
    <LaunchAuthContext.Provider
      value={{
        user: auth.user ? { id: auth.user.id, email: auth.user.email, wallet: null } : null,
        initialized: auth.initialized,
        authenticated: !!auth.user,
        error: "",
        status: "",
        retry: () => {},
        login: () => {},
        logout: async () => {
          await auth.logout();
        },
      }}
    >
      {children}
    </LaunchAuthContext.Provider>
  );
}
export function LaunchAuthProvider({ children }: { children: React.ReactNode }) {
  return privyEnabled ? (
    <PrivyBoundary>{children}</PrivyBoundary>
  ) : (
    <LegacyBoundary>{children}</LegacyBoundary>
  );
}
export function useLaunchAuth() {
  const state = useContext(LaunchAuthContext);
  if (!state) throw new Error("Launch auth provider missing");
  return state;
}
export function LaunchGate({ children }: { children: React.ReactNode }) {
  const auth = useLaunchAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.initialized && !auth.authenticated) router.replace("/login?next=%2Fnova");
  }, [auth.initialized, auth.authenticated, router]);
  if (!auth.initialized)
    return auth.error ? (
      <main className="glacier-world min-h-screen grid place-items-center p-6">
        <p role="alert">{auth.error}</p>
      </main>
    ) : (
      <Loading />
    );
  if (!auth.authenticated) return null;
  if (!auth.user || (privyEnabled && !auth.user.wallet))
    return (
      <main className="glacier-world min-h-screen grid place-items-center p-6">
        <section className="glass-elevated p-6 max-w-md" aria-live="polite">
          <h1 className="text-xl font-semibold">Your Synq wallet</h1>
          <p className="mt-3">{auth.error || auth.status || "Preparing your wallet..."}</p>
          {auth.error && (
            <button className="nova-primary mt-4" onClick={auth.retry}>
              Try again
            </button>
          )}
          <button
            className="nova-text-action mt-4"
            onClick={() => void auth.logout().catch(() => {})}
          >
            Sign out
          </button>
        </section>
      </main>
    );
  return children;
}
