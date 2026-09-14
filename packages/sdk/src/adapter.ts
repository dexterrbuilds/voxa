import { createAgentHandshake, type AgentHandshake } from "./handshake.js";
import type { SynqMessageContext, SynqMessageResponse } from "./messaging.js";
import { canonicalMessageType, legacyProtocol } from "./protocol-compatibility.js";

export type SynqAdapterOptions = {
  identity: Parameters<typeof createAgentHandshake>[0];
  runtime?: string;
  tools?: boolean;
  onMessage: (
    message: string,
    context: SynqMessageContext,
    signal?: AbortSignal,
  ) => Promise<SynqMessageResponse> | SynqMessageResponse;
  onVoice?: SynqAdapterOptions["onMessage"];
};

// Framework-neutral Fetch API handler: mount behind your own authentication and hosting.
// It grants no Synq permissions and never starts a server or executes reported tools.
export function createSynqAgent(options: SynqAdapterOptions) {
  const handshake: AgentHandshake = createAgentHandshake(options.identity);
  const discovery = {
    ...handshake,
    agent: {
      ...handshake.agent,
      runtime: options.runtime ?? "custom_endpoint",
      supports: { text: true, voice: Boolean(options.onVoice), tools: options.tools === true },
    },
  };
  return async function handleSynqRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/\/$/, "");
    if (request.method === "GET" && path === "/health") return Response.json({ ok: true });
    if (request.method !== "POST")
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    let input: {
      type?: string;
      message?: string;
      context?: SynqMessageContext;
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
    const type = canonicalMessageType(input.type);
    if (type === "synq.handshake")
      return Response.json({
        ...discovery,
        protocol: type === input.type ? discovery.protocol : legacyProtocol,
      });
    const handler =
      type === "synq.voice"
        ? options.onVoice
        : type === "synq.message"
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
