import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Only global unicast IPv6; mapped IPv4, loopback, link-local and ULA are excluded.
  if (isIP(address) !== 6 || !/^[23]/i.test(address)) return false;
  const [first, second = 0] = address.split(":").map((part) => parseInt(part || "0", 16));
  // Exclude protocol assignments, documentation and 6to4 embedded IPv4 routing.
  return (
    first !== 0x2002 &&
    first !== 0x3fff &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
  );
}

function resolveWithSignal(host: string, signal: AbortSignal) {
  return new Promise<Awaited<ReturnType<typeof lookup>>[]>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Request cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    lookup(host, { all: true, verbatim: true })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export function parseAgentEndpoint(value: string): URL {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("Use a public HTTP or HTTPS endpoint without credentials or a fragment.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (isIP(host) && !isPublicAddress(host))
  ) {
    throw new Error("Use a public endpoint. For local agents, use an HTTPS development tunnel.");
  }
  return url;
}

// Pin the validated DNS result to the socket lookup, preventing DNS rebinding.
// Redirects are intentionally rejected; the registered endpoint must answer directly.
export async function requestAgentJson(input: {
  url: string;
  body: unknown;
  signal: AbortSignal;
  requestId?: string;
  maxBytes?: number;
}): Promise<{ status: number; payload: unknown }> {
  const url = parseAgentEndpoint(input.url);
  input.signal.throwIfAborted();
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const records = await resolveWithSignal(hostname, input.signal);
  input.signal.throwIfAborted();
  if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
    throw new Error("Agent endpoint must resolve only to public addresses.");
  }
  const pinned = records[0];
  const maxBytes = input.maxBytes ?? 256 * 1024;
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "POST",
        signal: input.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(input.requestId ? { "X-Voxa-Request-Id": input.requestId } : {}),
        },
        lookup: (_host, options, callback) => {
          if (typeof options === "object" && options.all) {
            callback(null, [pinned] as never, pinned.family);
          } else callback(null, pinned.address, pinned.family);
        },
      },
      (response) => {
        const status = response.statusCode ?? 502;
        if (status < 200 || status >= 300) {
          response.destroy();
          resolve({ status, payload: null });
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) request.destroy(new Error("Agent response exceeds the size limit."));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve({ status, payload: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
          } catch {
            reject(new Error("Agent returned invalid JSON."));
          }
        });
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify(input.body));
  });
}
