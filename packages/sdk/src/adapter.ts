import { createAgentHandshake, type AgentHandshake } from "./handshake.js";
import type { VoxaMessageContext, VoxaMessageResponse } from "./messaging.js";

export type VoxaAdapterOptions = {
  identity: Parameters<typeof createAgentHandshake>[0];
  runtime?: string;
  tools?: boolean;
  onMessage: (
    message: string,
    context: VoxaMessageContext,
    signal?: AbortSignal,
  ) => Promise<VoxaMessageResponse> | VoxaMessageResponse;
  onVoice?: VoxaAdapterOptions["onMessage"];
};

// Framework-neutral Fetch API handler: mount behind your own authentication and hosting.
// It grants no Voxa permissions and never starts a server or executes reported tools.
export function createVoxaAgent(options: VoxaAdapterOptions) {
  const handshake: AgentHandshake = createAgentHandshake(options.identity);
  const discovery = {
    ...handshake,
    agent: {
      ...handshake.agent,
      runtime: options.runtime ?? "custom_endpoint",
      supports: { text: true, voice: Boolean(options.onVoice), tools: options.tools === true },
    },
  };
  return async function handleVoxaRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/\/$/, "");
    if (request.method === "GET" && path === "/health") return Response.json({ ok: true });
    if (request.method !== "POST")
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    let input: {
      type?: string;
      message?: string;
      context?: VoxaMessageContext;
      requestId?: string;
    };
    try {
      const reader = request.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 65536) {
            await reader.cancel();
            return Response.json({ error: "request_too_large" }, { status: 413 });
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      input = JSON.parse(new TextDecoder().decode(bytes));
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    } catch {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    if (input.type === "voxa.handshake") return Response.json(discovery);
    const handler =
      input.type === "voxa.voice"
        ? options.onVoice
        : input.type === "voxa.message"
          ? options.onMessage
          : undefined;
    if (!handler) return Response.json({ error: "unsupported_message" }, { status: 422 });
    if (
      typeof input.message !== "string" ||
      !input.message.trim() ||
      input.message.length > 4000 ||
      (input.context && (typeof input.context !== "object" || Array.isArray(input.context)))
    ) {
      return Response.json({ error: "invalid_message" }, { status: 400 });
    }
    try {
      const reply = await handler(input.message.trim(), input.context ?? {}, request.signal);
      if (
        !reply ||
        typeof reply.text !== "string" ||
        !reply.text.trim() ||
        reply.text.length > 32000
      )
        throw new Error();
      return Response.json(reply);
    } catch {
      return Response.json({ error: "agent_failed" }, { status: 502 });
    }
  };
}
