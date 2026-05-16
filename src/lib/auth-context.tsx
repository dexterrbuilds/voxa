import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: Error | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error) {
        console.error("[v0] Auth error on mount:", error);
        setError(error as Error);
      } else {
        setUser(user);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[v0] Auth state changed:", event);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/voxa`,
        },
      });
      if (error) throw error;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
