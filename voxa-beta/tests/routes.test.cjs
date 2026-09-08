const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const next = require("next/server");
const registration = require("../app/lib/server/agents/registration.ts");
const verification = require("../app/lib/server/agents/verification.ts");
const analytics = require("../app/lib/server/agents/analytics.ts");
const access = require("../app/lib/server/agents/room-access.ts");
const service = require("../app/lib/server/supabase-service.ts");
const memory = require("../app/lib/server/agents/room-memory.ts");
const { sandboxRuntime } = require("../app/lib/server/agents/runtime/SandboxRuntime.ts");
const { roomTextRuntime } = require("../app/lib/server/agents/runtime/RoomTextRuntime.ts");
const discover = require("../app/api/agents/discover/route.ts");
const sandbox = require("../app/api/agents/sandbox/message/route.ts");
const room = require("../app/api/agents/room/message/route.ts");
const invite = require("../app/api/agents/room/invite/route.ts");

function request(path, body, headers = {}) {
  return new next.NextRequest(`http://localhost/api/agents/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function setup(t, records = []) {
  const owner = randomUUID();
  const query = {
    in() {
      return this;
    },
    eq() {
      return this;
    },
    select() {
      return this;
    },
    returns: async () => ({ data: records, error: null }),
  };
  const supabase = { from: () => query };
  t.mock.method(registration, "getAuthenticatedSupabase", async () => ({
    user: { id: owner, email: "private@example.com" },
    supabase,
  }));
  t.mock.method(next, "after", () => {});
  t.mock.method(analytics, "recordAgentAnalytics", async () => {});
  t.mock.method(analytics, "recordAgentAnalyticsBatch", async () => {});
  return { owner, supabase };
}

test("discovery requires auth, rejects private endpoints and only returns descriptive fields", async (t) => {
  setup(t);
  const handshake = {
    protocol: "voxa-agent",
    sdkVersion: "0.1",
    agent: {
      name: "My agent",
      description: "helpful",
      capabilities: ["web_search"],
      runtime: "openclaw",
      supports: { voice: true },
      permissions: ["admin"],
      endpoint_url: "private",
      creator_user_id: "secret",
    },
  };
  const probe = t.mock.method(verification, "fetchHandshake", async () => ({
    ok: true,
    handshake,
  }));
  assert.equal(
    (await discover.POST(request("discover", { endpointUrl: "http://127.0.0.1" }))).status,
    400,
  );
  assert.equal(probe.mock.callCount(), 0);
  const response = await discover.POST(
    request("discover", { endpointUrl: "https://example.com/voxa/handshake" }),
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.detected.importSource, "openclaw");
  assert.equal(result.detected.supports.voice, true);
  assert.equal(result.detected.permissions, undefined);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  handshake.sdkVersion = "99";
  assert.equal(
    (
      await discover.POST(
        request("discover", { endpointUrl: "https://example.com/voxa/handshake" }),
      )
    ).status,
    422,
  );
  registration.getAuthenticatedSupabase.mock.mockImplementation(async () =>
    next.NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  );
  assert.equal((await discover.POST(request("discover", {}))).status, 401);
});

test("multi-agent sandbox streams fast replies before slow agents and isolates failed approval", async (t) => {
  const fast = randomUUID(),
    slow = randomUUID(),
    denied = randomUUID();
  const records = [fast, slow, denied].map((id) => ({
    id,
    name: id,
    endpoint_url: `https://example.com/${id}`,
    status: id === denied ? "pending_review" : "approved",
    verification_status: "verified",
  }));
  setup(t, records);
  let finishSlow;
  const slowReply = new Promise((resolve) => {
    finishSlow = resolve;
  });
  const calls = [];
  t.mock.method(sandboxRuntime, "sendMessageToAgent", async (input) => {
    calls.push(input);
    if (input.context.agentId === slow) return slowReply;
    return { ok: true, text: "fast reply", raw: {} };
  });
  const response = await sandbox.POST(
    request(
      "sandbox/message",
      {
        sandboxSessionId: `sandbox:${fast},${slow},${denied}:${randomUUID()}`,
        message: "hi",
        broadcast: true,
      },
      { Accept: "application/x-ndjson" },
    ),
  );
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  let received = "";
  while (!received.includes("fast reply"))
    received += new TextDecoder().decode((await reader.read()).value);
  assert.equal(received.includes("agent_not_approved"), true);
  assert.equal(received.includes("slow reply"), false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((input) => !JSON.stringify(input.context).includes("private@example")));
  finishSlow({ ok: true, text: "slow reply", raw: {} });
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += new TextDecoder().decode(chunk.value);
  }
  assert.equal(received.includes("slow reply"), true);
});

test("room messaging preserves membership/permissions and suppresses duplicate successful requests", async (t) => {
  setup(t);
  const agentId = randomUUID(),
    roomId = randomUUID();
  const agent = {
    id: agentId,
    name: "Agent",
    endpoint_url: "https://example.com/voxa/handshake",
    permissions: ["tools_visualize"],
    capabilities: ["search"],
  };
  t.mock.method(access, "externalAgentsInRoomsEnabled", () => true);
  t.mock.method(access, "validateRoomTextAgent", async () => ({ ok: true, agent }));
  t.mock.method(service, "getServiceRoleClient", () => ({}));
  t.mock.method(access, "isHumanRoomMember", async () => false);
  t.mock.method(access, "isExternalAgentInRoom", async () => true);
  const history = t.mock.method(memory, "loadExternalAgentThread", async () => [
    { role: "user", text: "earlier", createdAt: "2026-01-01" },
  ]);
  const saved = t.mock.method(memory, "recordExternalAgentExchange", async () => {});
  const transport = t.mock.method(roomTextRuntime, "sendMessageToAgent", async () => ({
    ok: true,
    text: "reply",
    tools: [{ name: "unapproved", status: "completed" }],
    raw: {},
  }));
  const input = { roomId, agentId, message: "follow up" };
  assert.equal((await room.POST(request("room/message", input))).status, 403);
  access.isHumanRoomMember.mock.mockImplementation(async () => true);
  assert.equal((await room.POST(request("room/message", input))).status, 403);
  assert.equal(transport.mock.callCount(), 0);
  agent.permissions = ["room_text_reply"];
  assert.equal((await room.POST(request("room/message", input))).status, 200);
  assert.equal(history.mock.callCount(), 0);
  assert.equal(saved.mock.callCount(), 0);
  assert.equal(transport.mock.calls[0].arguments[0].context.history, undefined);
  agent.permissions = [
    "room_text_reply",
    "memory_read_thread",
    "memory_write_thread",
    "tools_visualize",
  ];
  const headers = { "X-Voxa-Request-Id": randomUUID() };
  const first = await room.POST(request("room/message", input, headers));
  const data = await first.json();
  assert.equal(data.reply.tools[0].untrusted, true);
  await room.POST(request("room/message", input, headers));
  assert.equal(saved.mock.callCount(), 1);
  assert.equal(history.mock.callCount(), 1);
  assert.deepEqual(transport.mock.calls.at(-1).arguments[0].context, {
    roomId,
    agentId,
    history: [{ role: "user", text: "earlier" }],
  });
  transport.mock.mockImplementation(async () => ({
    ok: false,
    code: "agent_timeout",
    detail: "Timed out",
  }));
  assert.equal((await room.POST(request("room/message", input))).status, 504);
  assert.equal(saved.mock.callCount(), 1);
});

test("concurrent invite loser never writes a duplicate event or counter", async (t) => {
  setup(t);
  t.mock.method(access, "externalAgentsInRoomsEnabled", () => true);
  t.mock.method(access, "validateRoomTextAgent", async () => ({
    ok: true,
    agent: { id: randomUUID(), name: "Agent" },
  }));
  t.mock.method(access, "isHumanRoomMember", async () => true);
  let eventWrites = 0;
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    limit: async () => ({ data: [], error: null }),
    insert: async () => ({ error: { code: "23505" } }),
  };
  t.mock.method(service, "getServiceRoleClient", () => ({
    from: (table) => {
      if (table === "room_events") eventWrites++;
      return query;
    },
  }));
  const response = await invite.POST(
    request("room/invite", { roomId: "ROOM123", agentId: randomUUID() }),
  );
  assert.equal(response.status, 200);
  assert.equal(eventWrites, 0);
  assert.equal(analytics.recordAgentAnalytics.mock.callCount(), 0);
});

test("analytics writes use server credentials only and failure is non-fatal", async (t) => {
  const browser = {
    rpc: () => {
      throw new Error("Must not use browser client");
    },
  };
  let writes = 0;
  t.mock.method(service, "getServiceRoleClient", () => ({
    rpc: async () => {
      writes++;
      return { error: null };
    },
  }));
  await analytics.recordAgentAnalytics(browser, {
    agentId: randomUUID(),
    ownerUserId: randomUUID(),
    metric: "room_invites",
  });
  assert.equal(writes, 1);
  service.getServiceRoleClient.mock.mockImplementation(() => null);
  await analytics.recordAgentAnalytics(browser, {
    agentId: randomUUID(),
    ownerUserId: randomUUID(),
    metric: "room_invites",
  });
  assert.equal(writes, 1);
});
