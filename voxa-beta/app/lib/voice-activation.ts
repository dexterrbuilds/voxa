"use client";

export function getNovaListenWindowMs() {
  return Number(
    process.env.NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS ||
      process.env.NEXT_PUBLIC_NOVA_ACTIVE_MS ||
      10000,
  );
}
