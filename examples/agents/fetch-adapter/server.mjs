import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createVoxaAgent } from "../../../packages/sdk/dist/index.js";

const handle = createVoxaAgent({
  identity: {
    name: "My Agent",
    description: "A framework-neutral Voxa adapter.",
    capabilities: ["text"],
  },
  runtime: "custom_endpoint",
  async onMessage(message, context, signal) {
    signal.throwIfAborted();
    // Replace this reply with your runtime call. Pass the signal to its SDK/fetch.
    // context.history contains only permitted, bounded, agent-specific context.
    return { text: `Received: ${message}` };
  },
});

const server = createServer(async (incoming, outgoing) => {
  const controller = new AbortController();
  outgoing.on("close", () => {
    if (!outgoing.writableEnded) controller.abort();
  });
  try {
    const request = new Request(new URL(incoming.url, "http://localhost"), {
      method: incoming.method,
      headers: incoming.headers,
      signal: controller.signal,
      ...(!["GET", "HEAD"].includes(incoming.method)
        ? { body: Readable.toWeb(incoming), duplex: "half" }
        : {}),
    });
    const response = await handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ error: "adapter_failed" }));
  }
});
server.requestTimeout = 15000;
server.listen(Number(process.env.PORT || 8789), "127.0.0.1", () =>
  console.log("Adapter ready at http://127.0.0.1:8789"),
);
