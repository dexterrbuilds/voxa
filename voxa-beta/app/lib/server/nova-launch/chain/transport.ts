import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export class ChainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ChainError(
      "bad_response",
      "The data provider returned an incomplete response. Try again.",
    );
  return value as Record<string, unknown>;
}
export function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new ChainError("bad_response", "The data provider returned an invalid number.");
  return value as number;
}
export function units(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{1,20}$/.test(value) ||
    BigInt(value) > 18446744073709551615n
  )
    throw new ChainError("bad_response", "The data provider returned an invalid amount.");
  return BigInt(value).toString();
}
export function safeLabel(value: unknown, max = 60): string | null {
  return typeof value === "string"
    ? // Strip control and bidi override characters from untrusted display metadata.
      // eslint-disable-next-line no-control-regex
      value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").slice(0, max)
    : null;
}
export async function readJson(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  provider: "solana" | "jupiter",
  operation: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<unknown> {
  const requestId = randomUUID(),
    start = performance.now();
  const timeout = AbortSignal.timeout(timeoutMs),
    combined = AbortSignal.any([signal, timeout]);
  let httpStatus: number | undefined;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      combined.throwIfAborted();
      const response = await fetcher(url, {
        ...init,
        signal: combined,
        redirect: "error",
        cache: "no-store",
      });
      httpStatus = response.status;
      if (!response.ok) {
        await response.body?.cancel();
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          await delay(250, undefined, { signal: combined });
          continue;
        }
        throw new ChainError(
          "provider_unavailable",
          provider === "solana"
            ? "Solana data is temporarily unavailable."
            : "I couldn't get a fresh quote. Try again.",
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("empty");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 4 * 1024 * 1024)
            throw new ChainError(
              "response_limit",
              "This account has more data than this view can safely load.",
            );
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      combined.throwIfAborted();
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      console.info("nova_chain", {
        requestId,
        provider,
        operation,
        status: "ok",
        httpStatus,
        latencyMs: Math.round(performance.now() - start),
      });
      return data;
    }
    throw new Error("unavailable");
  } catch (error) {
    const code = signal.aborted
      ? "cancelled"
      : timeout.aborted
        ? "timeout"
        : error instanceof ChainError
          ? error.code
          : "provider_unavailable";
    console.warn("nova_chain", {
      requestId,
      provider,
      operation,
      status: code,
      httpStatus,
      latencyMs: Math.round(performance.now() - start),
    });
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof ChainError) throw error;
    throw new ChainError(
      code,
      provider === "solana"
        ? "Solana data is temporarily unavailable."
        : "I couldn't get a fresh quote. Try again.",
    );
  }
}
