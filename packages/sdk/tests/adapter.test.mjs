import { test } from "node:test";
import assert from "node:assert/strict";
import { createVoxaAgent } from "../dist/index.js";

test("adapter handshake and message work without a framework dependency", async () => {
  const handler = createVoxaAgent({
    identity: { name: "Research", capabilities: ["web_search"] },
    runtime: "langchain",
    tools: true,
    onMessage: async (message, context, signal) => {
      assert.ok(signal);
      return { text: `${context.agentId}: ${message}` };
    },
  });
  const send = (body) =>
    handler(
      new Request("https://agent.example/voxa/message", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  const discovery = await (await send({ type: "voxa.handshake" })).json();
  assert.equal(discovery.protocol, "voxa-agent");
  assert.equal(discovery.agent.supports.voice, false);
  assert.equal(discovery.agent.runtime, "langchain");
  assert.equal(
    (
      await (
        await send({ type: "voxa.message", message: "hello", context: { agentId: "agent1" } })
      ).json()
    ).text,
    "agent1: hello",
  );
  assert.equal((await send({ type: "voxa.voice", message: "hello" })).status, 422);
  assert.equal((await send({ type: "voxa.message", message: " " })).status, 400);
  assert.equal((await send({ type: "voxa.message", message: "x".repeat(70000) })).status, 413);
});

test("adapter hides exceptions from provider implementations", async () => {
  const handler = createVoxaAgent({
    identity: { name: "Example" },
    onMessage: () => {
      throw Error("secret-key");
    },
  });
  const response = await handler(
    new Request("https://agent.example/voxa/message", {
      method: "POST",
      body: JSON.stringify({ type: "voxa.message", message: "hello" }),
    }),
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "agent_failed" });
});
