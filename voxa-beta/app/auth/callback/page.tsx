"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BetaShell } from "@/components/BetaChrome";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing sign-in");

  useEffect(() => {
    let isMounted = true;

    async function completeSignIn() {
      const supabase = getSupabaseClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const nextPath = params.get("next") || "/";

      if (!supabase) {
        useAuthStore
          .getState()
          .setAuthError("Google sign-in is not available yet. Use email login for now.");
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          useAuthStore.getState().setAuthError("Google sign-in failed. Please try again.");
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }
      }

      await useAuthStore.getState().hydrate();

      if (isMounted) {
        setMessage("Opening Voxa");
        router.replace(nextPath.startsWith("/") ? nextPath : "/");
      }
    }

    void completeSignIn();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <BetaShell>
      <div className="grid min-h-screen place-items-center">
        <div className="beta-status-pill">{message}</div>
      </div>
    </BetaShell>
  );
}
