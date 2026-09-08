import { randomUUID } from "node:crypto";

export function agentRequestId(value: unknown): string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : randomUUID();
}

type Entry = { requestId: string; expires: number; response?: unknown };
const requests = new Map<string, Entry>();

// Per-process coordination only. Frontend controllers also prevent duplicate sends.
// A distributed lease store is needed before running concurrent workers at scale.
export async function runAgentRequest<T>(
  scope: string,
  requestId: string,
  work: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  const now = Date.now();
  for (const [key, value] of requests) if (value.expires < now) requests.delete(key);
  const existing = requests.get(scope);
  if (existing) {
    if (existing.requestId === requestId && existing.response !== undefined)
      return { ok: true, value: existing.response as T };
    if (existing.response === undefined) return { ok: false };
  }
  if (!existing && requests.size >= 1000) return { ok: false };
  const entry: Entry = { requestId, expires: now + 60000 };
  requests.set(scope, entry);
  try {
    const value = await work();
    entry.response = value;
    return { ok: true, value };
  } catch (error) {
    if (requests.get(scope) === entry) requests.delete(scope);
    throw error;
  }
}
