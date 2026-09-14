const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");
const { readMigratedStorage } = require("../app/lib/legacy-storage.ts");
const {
  agentWireType,
  isSupportedAgentProtocol,
  requestIdFromHeaders,
  agentRequestHeaders,
} = require("../app/lib/agents/protocol-compatibility.ts");

test("canonical protocol and deprecated endpoints retain independent dialects without retry", () => {
  assert.ok(isSupportedAgentProtocol("synq-agent"));
  assert.ok(isSupportedAgentProtocol("voxa-agent"));
  assert.equal(isSupportedAgentProtocol("unknown"), false);
  assert.equal(agentWireType("https://example.com/synq/handshake", "synq.message"), "synq.message");
  assert.equal(agentWireType("https://example.com/voxa/handshake", "synq.message"), "voxa.message");
  assert.equal(agentWireType("https://example.com/custom", "synq.voice"), "voxa.voice");
});
test("request IDs accept the deprecated header while canonical identity wins", () => {
  assert.equal(requestIdFromHeaders(new Headers({ "X-Voxa-Request-Id": "old" })), "old");
  assert.equal(
    requestIdFromHeaders(new Headers({ "X-Voxa-Request-Id": "old", "X-Synq-Request-Id": "new" })),
    "new",
  );
  assert.deepEqual(agentRequestHeaders("https://example.com/synq/message", "id"), {
    "X-Synq-Request-Id": "id",
  });
  assert.deepEqual(agentRequestHeaders("https://example.com/voxa/message", "id"), {
    "X-Synq-Request-Id": "id",
    "X-Voxa-Request-Id": "id",
  });
});
function storage(values) {
  const map = new Map(Object.entries(values));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}
test("browser keys migrate once without overwriting canonical state", () => {
  for (const [key, old] of [
    ["synq-theme", "voxa-theme"],
    ["synq-room-storage", "voxa-room-storage"],
    ["synq.supabase.auth", "voxa.supabase.auth"],
    ["synq.supabase.auth-code-verifier", "voxa.supabase.auth-code-verifier"],
    ["synq-sdk-beta-requests", "voxa-sdk-beta-requests"],
  ]) {
    const s = storage({ [old]: "saved" });
    assert.equal(readMigratedStorage(s, key), "saved");
    assert.equal(s.getItem(old), null);
    s.setItem(key, "current");
    s.setItem(old, "stale");
    assert.equal(readMigratedStorage(s, key), "current");
    assert.equal(s.getItem(old), null);
  }
});
test("blocked storage fails safely and a failed migration never deletes old state", () => {
  const s = storage({ "voxa-theme": "dark" });
  s.setItem = () => {
    throw new Error("Storage unavailable");
  };
  assert.equal(readMigratedStorage(s, "synq-theme"), null);
  assert.equal(s.getItem("voxa-theme"), "dark");
});
test("active naming scan allows only exact documented compatibility lines", () => {
  execFileSync(process.execPath, ["scripts/check-naming.cjs"], {
    cwd: resolve(__dirname, "../.."),
  });
});
