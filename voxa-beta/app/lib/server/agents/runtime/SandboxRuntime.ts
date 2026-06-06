import type {
  AgentRuntimeMessageInput,
  AgentRuntimeReply,
  AgentRuntimeTransport,
} from "@/lib/server/agents/runtime/types";

// SandboxRuntime: the only live agent transport today.
//
// It sends a `voxa.message` request to a verified agent's message endpoint and
// returns the `{ text }` reply. It NEVER touches production rooms, LiveKit, or
// Supabase room state — it is a direct, isolated HTTP call from Voxa's server to
// the developer's own endpoint. Every message is forced to `sandbox: true`.
//
// A future `ProductionRuntime` will implement the same `AgentRuntimeTransport`
// interface and add room/dispatch wiring. It does not exist yet.

export const VOXA_MESSAGE_TYPE = "voxa.message";
const MESSAGE_TIMEOUT_MS = 8000;

// Agents register their verified handshake URL. Derive the sibling message URL
// from it so the same registration covers both probes.
export function deriveMessageEndpoint(endpointUrl: string): string {
  if (endpointUrl.endsWith("/voxa/handshake")) {
    return `${endpointUrl.slice(0, -"/voxa/handshake".length)}/voxa/message`;
  }
  if (endpointUrl.endsWith("/handshake")) {
    return `${endpointUrl.slice(0, -"/handshake".length)}/message`;
  }
  // Fall back to posting to the registered URL directly (single-endpoint agents).
  return endpointUrl;
}

export class SandboxRuntime implements AgentRuntimeTransport {
  readonly mode = "sandbox" as const;

  async sendMessage(input: AgentRuntimeMessageInput): Promise<AgentRuntimeReply> {
    const messageUrl = deriveMessageEndpoint(input.endpointUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MESSAGE_TIMEOUT_MS);

    try {
      const response = await fetch(messageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          type: VOXA_MESSAGE_TYPE,
          message: input.message,
          // Force sandbox marking regardless of caller input.
          context: { ...input.context, sandbox: true },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          ok: false,
          code: "agent_bad_response",
          detail: `Agent endpoint responded with HTTP ${response.status}.`,
        };
      }

      const payload = (await response.json().catch(() => null)) as { text?: unknown } | null;
      if (!payload || typeof payload.text !== "string") {
        return {
          ok: false,
          code: "agent_bad_response",
          detail: "Agent endpoint did not return a JSON `{ text }` reply.",
        };
      }

      return { ok: true, text: payload.text, raw: payload };
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "AbortError" ? "timed out" : "was unreachable";
      return { ok: false, code: "agent_unreachable", detail: `Agent endpoint ${reason}.` };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const sandboxRuntime = new SandboxRuntime();
