import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createAgentHandshake,
  createAgentMessageResponse,
  type VoxaMessageRequest,
} from "@voxa/sdk";

// Minimal Voxa-compatible external agent.
//
// This is a SAMPLE for local development and Voxa sandbox testing. It implements
// the three endpoints Voxa expects from an external agent:
//
//   GET  /health          -> liveness probe
//   POST /voxa/handshake  -> identity + capabilities (used by Voxa verification)
//   POST /voxa/message    -> a (mock) agent reply
//
// Register the PUBLIC handshake URL (e.g. https://<tunnel>/voxa/handshake) as the
// agent endpoint in Voxa. Passing verification only makes the agent eligible for
// the developer sandbox — it does NOT place the agent into a live Voxa room yet.

const PORT = Number(process.env.PORT ?? 8787);

const AGENT_NAME = "Research Agent";
const AGENT_DESCRIPTION = "A sample Voxa-compatible research assistant";
const AGENT_CAPABILITIES = ["web_search", "summaries", "citations"];

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

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = (req.url ?? "/").split("?")[0];

  // Liveness probe.
  if (method === "GET" && url === "/health") {
    sendJson(res, 200, { status: "ok", agent: AGENT_NAME });
    return;
  }

  // Handshake: Voxa verification POSTs `{ type: "voxa.handshake" }` here.
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

  // Message: mock reply. Voxa POSTs `{ type: "voxa.message", message, context }`.
  if (method === "POST" && url === "/voxa/message") {
    const body = (await readJsonBody(req)) as Partial<VoxaMessageRequest> | null;
    // `message` is a string on the wire (see VoxaMessageRequest).
    const prompt = typeof body?.message === "string" ? body.message.trim() : "";
    const reply = prompt
      ? `This is a sample response from the ${AGENT_NAME} about "${prompt}".`
      : `This is a sample response from the ${AGENT_NAME}.`;
    sendJson(res, 200, createAgentMessageResponse(reply));
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(PORT, () => {
  console.log(`Voxa ${AGENT_NAME} example listening on http://localhost:${PORT}`);
  console.log(`  GET  /health`);
  console.log(`  POST /voxa/handshake`);
  console.log(`  POST /voxa/message`);
});
