import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createAgentHandshake,
  createAgentMessageResponse,
  type VoxaMessageRequest,
} from "@voxa/sdk";

// Minimal Voxa-compatible external agent — a sample CODE ASSISTANT.
//
// A second sample (alongside research-agent) so the developer sandbox can be
// tested with MULTIPLE agents that report different capabilities. It implements
// the same three endpoints:
//
//   GET  /health          -> liveness probe
//   POST /voxa/handshake  -> identity + capabilities (used by Voxa verification)
//   POST /voxa/message    -> a (mock) reply with streaming + tool metadata
//
// Sandbox only: passing verification makes this agent eligible for the developer
// sandbox after review + approval. It does NOT place the agent into a live room.

const PORT = Number(process.env.PORT ?? 8788);

const AGENT_NAME = "Code Assistant";
const AGENT_DESCRIPTION = "A sample Voxa-compatible code review and debugging assistant";
const AGENT_CAPABILITIES = ["code_review", "debugging", "architecture"];

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

  if (method === "GET" && url === "/health") {
    sendJson(res, 200, { status: "ok", agent: AGENT_NAME });
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
    // Optional per-agent thread history (room-text mode).
    const history = Array.isArray(body?.context?.history) ? body!.context!.history : [];
    const priorUserTurns = history.filter((turn) => turn.role === "user");
    const lastUserTurn = priorUserTurns[priorUserTurns.length - 1]?.text;
    const followUp =
      lastUserTurn && prompt ? ` Continuing from "${lastUserTurn}".` : "";
    const reply = prompt
      ? `${AGENT_NAME} here — reviewing "${prompt}".${followUp} Looks reasonable; consider adding a test and a guard clause.`
      : `${AGENT_NAME} here. Share a snippet or question and I'll review it.`;
    sendJson(
      res,
      200,
      createAgentMessageResponse(reply, {
        streaming: true,
        tools: [
          { name: "code_search", status: "completed" },
          { name: "linter", status: "completed" },
        ],
      }),
    );
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
