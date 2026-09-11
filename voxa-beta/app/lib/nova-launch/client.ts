"use client";
import { getSupabaseClient } from "@/lib/supabase";
export async function novaFetch(path: string, options: RequestInit = {}) {
  const session = await getSupabaseClient()?.auth.getSession();
  const token = session?.data.session?.access_token;
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
