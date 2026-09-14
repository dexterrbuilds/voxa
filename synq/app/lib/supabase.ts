"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readMigratedStorage } from "./legacy-storage";

const authStorageKey = "synq.supabase.auth";

type SynqSupabaseGlobal = {
  client: SupabaseClient | null;
  url: string | null;
};

declare global {
  var __synqSupabase: SynqSupabaseGlobal | undefined;
}

function normalizeSupabaseUrl(url: string) {
  const normalizedUrl = url
    .trim()
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");

  if (normalizedUrl !== url.trim()) {
    console.warn(
      "NEXT_PUBLIC_SUPABASE_URL should be the Supabase project URL, not the REST endpoint. Synq normalized it for this session.",
    );
  }

  return normalizedUrl;
}

function getSupabaseGlobal() {
  if (!globalThis.__synqSupabase) {
    globalThis.__synqSupabase = {
      client: null,
      url: null,
    };
  }

  return globalThis.__synqSupabase;
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
      "Supabase URL changed while Synq is running. Restart the dev server and refresh the browser to use the new project.",
    );
  }

  if (!supabaseGlobal.client) {
    if (typeof window !== "undefined") {
      readMigratedStorage(window.localStorage, authStorageKey);
      readMigratedStorage(window.localStorage, `${authStorageKey}-code-verifier`);
    }
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
