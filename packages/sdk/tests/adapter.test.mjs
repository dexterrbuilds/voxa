import { test } from "node:test";
import assert from "node:assert/strict";
import { createVoxaAgent, createSynqAgent, SynqAgent, VoxaAgent } from "../dist/index.js";

test("Synq aliases retain the exact legacy adapter and base-class contracts", async () => {
  assert.equal(SynqAgent, VoxaAgent);
  assert.equal(createSynqAgent, createVoxaAgent);
  const handler = createSynqAgent({ identity: { name: "Synq Example" }, onMessage: (message) => ({ text: message }) });
  const response = await handler(new Request("https://example.com/synq/handshake", { method: "POST", body: JSON.stringify({ type: "synq.handshake" }) }));
  assert.equal((await response.json()).protocol, "synq-agent");
});

test("adapter handshake and message work without a framework dependency", async () => {
  const handler = createSynqAgent({
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
      new Request("https://agent.example/synq/message", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  const discovery = await (await send({ type: "synq.handshake" })).json();
  assert.equal(discovery.protocol, "synq-agent");
  assert.equal(discovery.agent.supports.voice, false);
  assert.equal(discovery.agent.runtime, "langchain");
  assert.equal(
    (
      await (
        await send({ type: "synq.message", message: "hello", context: { agentId: "agent1" } })
      ).json()
    ).text,
    "agent1: hello",
  );
  assert.equal((await send({ type: "synq.voice", message: "hello" })).status, 422);
  assert.equal((await send({ type: "synq.message", message: " " })).status, 400);
  assert.equal((await send({ type: "synq.message", message: "x".repeat(70000) })).status, 413);
});

test("adapter hides exceptions from provider implementations", async () => {
  const handler = createSynqAgent({
    identity: { name: "Example" },
    onMessage: () => {
      throw Error("secret-key");
    },
  });
  const response = await handler(
    new Request("https://agent.example/synq/message", {
      method: "POST",
      body: JSON.stringify({ type: "synq.message", message: "hello" }),
    }),
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "agent_failed" });
});
