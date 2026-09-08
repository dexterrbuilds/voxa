import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createAgentHandshake,
  createAgentMessageResponse,
  type VoxaMessageRequest,
  type VoxaVoiceRequest,
} from "@voxa/sdk";

// Mock OpenClaw -> Voxa ADAPTER.
//
// This shows how an EXISTING agent from another runtime (OpenClaw, LangChain,
// CrewAI, AutoGen, …) is "brought into" Voxa: you stand up a small adapter that
// exposes the Voxa-compatible endpoints and, inside, forwards the request to your
// real runtime and maps the result back to the Voxa response shape.
//
//   Voxa request  ->  this adapter  ->  OpenClaw/public runtime  ->  Voxa response
//
// SAFETY: the adapter only ever receives the single explicit user message Voxa
// sends. Voxa does NOT run the agent's tools and the agent gets NO room audio or
// transcript. This mock needs no real credentials — it returns canned replies so
// you can register/verify/sandbox the import flow end to end.

const PORT = Number(process.env.PORT ?? 8789);

const AGENT_NAME = "OpenClaw Agent (adapter)";
const AGENT_DESCRIPTION =
  "A sample external agent imported into Voxa via an OpenClaw-style adapter";
const AGENT_CAPABILITIES = ["web_search", "automation", "summaries"];

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

// Stand-in for "call OpenClaw / your real runtime". In a real adapter this is
// where you would invoke the upstream agent and map its result to text. It NEVER
// runs tools inside Voxa — the adapter owns that boundary.
function callUpstreamRuntime(message: string): string {
  if (!message) {
    return `${AGENT_NAME} here (mock). Send a message and the adapter forwards it to the upstream runtime.`;
  }
  return `[adapter -> OpenClaw mock] Upstream would handle "${message}" and return a result. (No real OpenClaw call was made.)`;
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = (req.url ?? "/").split("?")[0];

  if (method === "GET" && url === "/health") {
    sendJson(res, 200, { status: "ok", agent: AGENT_NAME, adapter: "openclaw" });
    return;
  }

  if (method === "POST" && url === "/voxa/handshake") {
    sendJson(
      res,
      200,
      createAgentHandshake({
        name: AGENT_NAME,
        description: AGENT_DESCRIPTION,
        capabilities: AGENT_CAPABILITIES,
      }),
    );
    return;
  }

  if (method === "POST" && url === "/voxa/message") {
    const body = (await readJsonBody(req)) as Partial<VoxaMessageRequest> | null;
    const prompt = typeof body?.message === "string" ? body.message.trim() : "";
    sendJson(
      res,
      200,
      createAgentMessageResponse(callUpstreamRuntime(prompt), {
        tools: [{ name: "web_search", status: "completed" }],
      }),
    );
    return;
  }

  // Optional: Voxa's voice route already posts to /voxa/message, but an adapter may
  // also implement /voxa/voice explicitly. Text is required in the reply.
  if (method === "POST" && url === "/voxa/voice") {
    const body = (await readJsonBody(req)) as Partial<VoxaVoiceRequest> | null;
    const prompt = typeof body?.message === "string" ? body.message.trim() : "";
    sendJson(res, 200, { text: callUpstreamRuntime(prompt) });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(PORT, () => {
  console.log(`Voxa OpenClaw adapter (mock) listening on http://localhost:${PORT}`);
  console.log(`  GET  /health`);
  console.log(`  POST /voxa/handshake`);
  console.log(`  POST /voxa/message`);
  console.log(`  POST /voxa/voice   (optional)`);
});
