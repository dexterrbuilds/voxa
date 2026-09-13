"use client";
import { getSupabaseClient } from "@/lib/supabase";
import { privyEnabled } from "@/lib/identity/config";
export async function novaFetch(path: string, options: RequestInit = {}) {
  const token = privyEnabled
    ? await (await import("@privy-io/react-auth")).getAccessToken()
    : (await getSupabaseClient()?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const response = await fetch(`/api/nova/${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Nova is unavailable. Try again.");
  }
  return response;
}
