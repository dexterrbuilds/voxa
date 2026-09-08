const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const endpoint = require("../app/lib/server/agents/runtime/endpoint.ts");
const {
  boundAgentHistory,
  buildAgentContext,
} = require("../app/lib/server/agents/runtime/context.ts");
const { runAgentRequest, agentRequestId } = require("../app/lib/server/agents/runtime/requests.ts");
const {
  postVoxaMessage,
  deriveMessageEndpoint,
  parseTools,
} = require("../app/lib/server/agents/runtime/voxaMessageClient.ts");

test("endpoint policy rejects private networks, credentials and alternate IP spellings", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "2002:7f00:1::",
  ]) {
    assert.equal(endpoint.isPublicAddress(ip), false, ip);
  }
  for (const url of [
    "http://127.1",
    "http://2130706433",
    "http://[::1]",
    "http://localhost",
    "https://user:secret@example.com",
    "file:///etc/passwd",
  ]) {
    assert.throws(() => endpoint.parseAgentEndpoint(url), undefined, url);
  }
  assert.equal(endpoint.isPublicAddress("8.8.8.8"), true);
  assert.equal(endpoint.isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(endpoint.isPublicAddress("2001:4860:4860::8888"), true);
  assert.equal(
    deriveMessageEndpoint("https://example.com/voxa/handshake/?v=1"),
    "https://example.com/voxa/message?v=1",
  );
});

test("DNS validation rejects mixed/private answers and pins a public socket address", async (t) => {
  const dns = require("node:dns/promises");
  const https = require("node:https");
  const { EventEmitter } = require("node:events");
  let records = [{ address: "127.0.0.1", family: 4 }];
  t.mock.method(dns, "lookup", async () => records);
  const input = {
    url: "https://example.com/voxa/message",
    body: {},
    signal: new AbortController().signal,
  };
  await assert.rejects(endpoint.requestAgentJson(input), /public addresses/);
  records = [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ];
  await assert.rejects(endpoint.requestAgentJson(input), /public addresses/);
  records = [{ address: "8.8.8.8", family: 4 }];
  let status = 200,
    payload = '{"text":"ok"}',
    destroyed = false;
  t.mock.method(https, "request", (url, options, done) => {
    assert.equal(url.hostname, "example.com");
    options.lookup("example.com", {}, (error, address) => {
      assert.equal(error, null);
      assert.equal(address, "8.8.8.8");
    });
    const request = new EventEmitter();
    request.destroy = (error) => request.emit("error", error);
    request.end = () =>
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = status;
        response.destroy = () => {
          destroyed = true;
        };
        done(response);
        if (status === 200) {
          response.emit("data", Buffer.from(payload));
          response.emit("end");
        }
      });
    return request;
  });
  assert.deepEqual(await endpoint.requestAgentJson(input), {
    status: 200,
    payload: { text: "ok" },
  });
  payload = "x".repeat(100);
  await assert.rejects(endpoint.requestAgentJson({ ...input, maxBytes: 10 }), /size limit/);
  status = 302;
  assert.deepEqual(await endpoint.requestAgentJson(input), { status: 302, payload: null });
  assert.equal(destroyed, true);
});

test("context is bounded, chronological and strips private fields", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 ? "agent" : "user",
    text: `${i}:` + "a".repeat(2000),
  }));
  const bounded = boundAgentHistory(history);
  assert.ok(bounded.length <= 12);
  assert.ok(bounded.reduce((sum, turn) => sum + turn.text.length, 0) <= 12000);
  assert.match(bounded.at(-1).text, /^19:/);
  assert.deepEqual(
    buildAgentContext({
      agentId: "a",
      roomId: "r",
      history,
      allowMemory: false,
      email: "private",
      transcript: "private",
    }),
    { agentId: "a", roomId: "r" },
  );
  assert.equal(buildAgentContext({ agentId: "b", allowMemory: true }).history.length, 0);
});

test("request coordination rejects concurrent duplicates, replays completed IDs and isolates agents", async () => {
  const scope = randomUUID();
  let finish;
  let calls = 0;
  const first = runAgentRequest(scope, "request-1", () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  assert.deepEqual(await runAgentRequest(scope, "request-2", async () => "wrong"), { ok: false });
  assert.deepEqual(await runAgentRequest(scope + "other", "request-1", async () => "independent"), {
    ok: true,
    value: "independent",
  });
  finish("reply");
  await first;
  assert.deepEqual(
    await runAgentRequest(scope, "request-1", async () => {
      calls++;
    }),
    { ok: true, value: "reply" },
  );
  assert.equal(calls, 1);
  assert.deepEqual(await runAgentRequest(scope, "request-3", async () => "followup"), {
    ok: true,
    value: "followup",
  });
  await assert.rejects(
    runAgentRequest(scope, "request-4", async () => {
      throw Error("failed");
    }),
  );
  assert.equal((await runAgentRequest(scope, "request-5", async () => "retry")).ok, true);
  assert.notEqual(agentRequestId("bad\nheader"), "bad\nheader");
});

test("transport reports success, malformed replies, HTTP failures, timeout and cancellation without leaking content", async (t) => {
  const logs = [];
  t.mock.method(console, "info", (entry) => logs.push(entry));
  const input = {
    endpointUrl: "https://example.com/voxa/handshake",
    message: "private-message",
    context: { agentId: "a" },
    timeoutMs: 10,
  };
  let handler = async () => ({ status: 200, payload: { text: "response" } });
  t.mock.method(endpoint, "requestAgentJson", (value) => handler(value));
  assert.equal((await postVoxaMessage(input)).ok, true);
  handler = async () => ({ status: 200, payload: { text: "" } });
  assert.equal((await postVoxaMessage(input)).code, "agent_bad_response");
  handler = async () => ({ status: 403, payload: null });
  assert.equal((await postVoxaMessage(input)).code, "agent_bad_response");
  handler = ({ signal }) =>
    new Promise((_, reject) => {
      if (signal.aborted) reject(Error("cancel"));
      else signal.addEventListener("abort", () => reject(Error("cancel")), { once: true });
    });
  assert.equal((await postVoxaMessage(input)).code, "agent_timeout");
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (await postVoxaMessage({ ...input, signal: controller.signal })).code,
    "agent_cancelled",
  );
  assert.ok(logs.some((entry) => entry.includes("agent_response_complete")));
  assert.ok(
    logs.every((entry) => !entry.includes("private-message") && !entry.includes("example.com")),
  );
  assert.equal(parseTools(Array(30).fill({ name: "search", detail: "x".repeat(500) })).length, 16);
});
