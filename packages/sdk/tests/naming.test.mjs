import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSynqAgent,
  createSynqMessageRequest,
  createSynqVoiceRequest,
  createVoxaMessageRequest,
  createVoxaVoiceRequest,
  canonicalAgentPath,
  protocolForPath,
} from "../dist/index.js";
test("canonical SDK emits canonical messages; deprecated factories preserve wire values", () => {
  assert.equal(createSynqMessageRequest("hello").type, "synq.message");
  assert.equal(createSynqVoiceRequest("hello").type, "synq.voice");
  assert.equal(createVoxaMessageRequest("hello").type, "voxa.message");
  assert.equal(createVoxaVoiceRequest("hello").type, "voxa.voice");
});
test("canonical adapter accepts old and new clients without exposing the old protocol to new clients", async () => {
  const handle = createSynqAgent({
    identity: { name: "Synq" },
    onMessage: (message) => ({ text: message }),
    onVoice: (message) => ({ text: message }),
  });
  for (const brand of ["synq", "voxa"]) {
    const send = (kind) =>
      handle(
        new Request(`https://example.com/${brand}/${kind}`, {
          method: "POST",
          body: JSON.stringify({ type: `${brand}.${kind}`, message: "hello" }),
        }),
      );
    assert.equal((await (await send("handshake")).json()).protocol, `${brand}-agent`);
    assert.equal((await (await send("message")).json()).text, "hello");
    assert.equal((await (await send("voice")).json()).text, "hello");
  }
  assert.equal(canonicalAgentPath("/voxa/message"), "/synq/message");
  assert.equal(protocolForPath("/voxa/handshake"), "voxa-agent");
});
