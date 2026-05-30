"use client";

import { useEffect } from "react";
import type { Subscription } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";

type VoxaAuthGlobal = {
  hydrationPromise: Promise<void> | null;
  subscription: Subscription | null;
};

declare global {
  var __voxaAuth: VoxaAuthGlobal | undefined;
}

function getAuthGlobal() {
  if (!globalThis.__voxaAuth) {
    globalThis.__voxaAuth = {
      hydrationPromise: null,
      subscription: null,
    };
  }

  return globalThis.__voxaAuth;
}

function ensureAuthInitialized() {
  const authGlobal = getAuthGlobal();

  // Hydrate exactly once for the app lifetime. Do NOT reset the promise to
  // null on completion — re-running hydrate() on every mount flaps the
  // `loading` flag and creates a window where guards see (loading=false,
  // user=null), firing a redirect to /login and producing the loop.
  if (!authGlobal.hydrationPromise) {
    authGlobal.hydrationPromise = useAuthStore.getState().hydrate();
  }

  const supabase = getSupabaseClient();
  if (!supabase || authGlobal.subscription) {
    return;
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session);
  });

  authGlobal.subscription = subscription;
}

export const useAuth = () => {
  const {
    user,
    loading,
    initialized,
    authError,
    isAuthenticated,
    login,
    loginWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerificationEmail,
    logout,
    setAuthError,
  } = useAuthStore();

  useEffect(() => {
    ensureAuthInitialized();
  }, []);

  return {
    user,
    loading,
    initialized,
    authError,
    login,
    loginWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerificationEmail,
    logout,
    isAuthenticated,
    setAuthError,
  };
};
