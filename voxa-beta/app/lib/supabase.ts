"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const authStorageKey = "voxa.supabase.auth";

type VoxaSupabaseGlobal = {
  client: SupabaseClient | null;
  url: string | null;
};

declare global {
  var __voxaSupabase: VoxaSupabaseGlobal | undefined;
}

function normalizeSupabaseUrl(url: string) {
  const normalizedUrl = url
    .trim()
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");

  if (normalizedUrl !== url.trim()) {
    console.warn(
      "NEXT_PUBLIC_SUPABASE_URL should be the Supabase project URL, not the REST endpoint. Voxa normalized it for this session.",
    );
  }

  return normalizedUrl;
}

function getSupabaseGlobal() {
  if (!globalThis.__voxaSupabase) {
    globalThis.__voxaSupabase = {
      client: null,
      url: null,
    };
  }

  return globalThis.__voxaSupabase;
}

export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const normalizedUrl = normalizeSupabaseUrl(supabaseUrl);
  const supabaseGlobal = getSupabaseGlobal();

  if (supabaseGlobal.client && supabaseGlobal.url !== normalizedUrl) {
    console.warn(
      "Supabase URL changed while Voxa is running. Restart the dev server and refresh the browser to use the new project.",
    );
  }

  if (!supabaseGlobal.client) {
    supabaseGlobal.client = createClient(normalizedUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: authStorageKey,
      },
    });
    supabaseGlobal.url = normalizedUrl;
  }

  return supabaseGlobal.client;
}

export function getAuthRedirectUrl(nextPath = "/") {
  if (typeof window === "undefined") {
    return undefined;
  }

  const next = nextPath.startsWith("/") ? nextPath : "/";
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  callbackUrl.searchParams.set("next", next);
  return callbackUrl.toString();
}

export function getEmailVerificationRedirectUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const loginUrl = new URL("/login", window.location.origin);
  loginUrl.searchParams.set("verified", "true");
  return loginUrl.toString();
}
