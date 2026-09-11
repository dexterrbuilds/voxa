const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { NextRequest, NextResponse } = require("next/server");
const access = require("../app/lib/server/nova-launch/access.ts");
const model = require("../app/lib/server/nova-launch/model.ts");
const { createPlan } = require("../app/lib/server/nova-launch/plans.ts");
const actions = require("../app/api/nova/actions/route.ts");
const messages = require("../app/api/nova/message/route.ts");
const conversations = require("../app/api/nova/conversations/route.ts");
const req = (path, body, method = "POST", signal) =>
  new NextRequest(`http://localhost/api/nova/${path}`, {
    method,
    signal,
    headers: { "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
const swap = { type: "swap", params: { chain: "solana", input: "SOL", output: "USDC", amount: 1 } };

function setup(t, record = null) {
  const owner = randomUUID(),
    filters = [],
    calls = [];
  const query = {
    select() {
      return this;
    },
    eq(k, v) {
      filters.push([k, v]);
      return this;
    },
    neq() {
      return this;
    },
    order() {
      return this;
    },
    limit: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: record, error: null }),
  };
  const db = {
    from: () => query,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { mode: "simulation" }, error: null };
    },
  };
  t.mock.method(access, "launchAccess", async () => ({ user: { id: owner }, db }));
  return { owner, db, filters, calls };
}

test("Nova routes require authentication before touching storage", async (t) => {
  t.mock.method(access, "launchAccess", async () =>
    NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  );
  for (const [handler, path, method] of [
    [actions.POST, "actions", "POST"],
    [messages.POST, "message", "POST"],
    [messages.DELETE, "message", "DELETE"],
    [conversations.GET, "conversations", "GET"],
  ])
    assert.equal((await handler(req(path, {}, method))).status, 401);
});

test("approval route scopes owner, rejects mutation and never accepts conversational authorization", async (t) => {
  const plan = createPlan(randomUUID(), swap);
  const record = { plan, status: "pending" };
  const state = setup(t, record);
  const body = {
    id: plan.id,
    hash: plan.hash,
    approvalToken: plan.approvalToken,
    operation: "approve",
  };
  for (const operation of ["okay", "yes", "do it", undefined])
    assert.equal((await actions.POST(req("actions", { ...body, operation }))).status, 400);
  assert.equal(state.calls.length, 0);
  plan.action.params.amount = 2;
  assert.equal((await actions.POST(req("actions", body))).status, 409);
  assert.equal(state.calls.length, 0);
  plan.action.params.amount = 1;
  assert.equal((await actions.POST(req("actions", body))).status, 200);
  assert.ok(state.filters.some(([k, v]) => k === "owner_id" && v === state.owner));
  assert.deepEqual(state.calls[0].args, {
    p_owner: state.owner,
    p_id: plan.id,
    p_hash: plan.hash,
    p_token: plan.approvalToken,
    p_cancel: false,
  });
  state.db.rpc = async () => ({ error: { message: "private database detail" } });
  const stale = await actions.POST(req("actions", body));
  assert.equal(stale.status, 409);
  assert.equal((await stale.text()).includes("private database"), false);
});

test("unowned plan and conversation are unavailable", async (t) => {
  const state = setup(t);
  const plan = createPlan(randomUUID(), swap);
  assert.equal(
    (
      await actions.POST(
        req("actions", {
          id: plan.id,
          hash: plan.hash,
          approvalToken: plan.approvalToken,
          operation: "approve",
        }),
      )
    ).status,
    404,
  );
  assert.equal(
    (await conversations.GET(req(`conversations?id=${randomUUID()}`, null, "GET"))).status,
    404,
  );
  assert.equal(state.calls.length, 0);
  assert.ok(state.filters.filter(([k, v]) => k === "owner_id" && v === state.owner).length >= 2);
});

test("swap and perpetual routes persist plans but never approve or execute them", async (t) => {
  const state = setup(t);
  t.mock.method(model, "getNovaModelProvider", () => {
    throw new Error("deterministic actions must not call model");
  });
  for (const text of ["Swap 1 SOL to USDC", "Open a 3x SOL long with 100 USDC"]) {
    const cid = randomUUID();
    const response = await messages.POST(
      req("message", { conversationId: cid, requestId: randomUUID(), text }),
    );
    const events = (await response.text()).trim().split("\n").map(JSON.parse);
    const plan = events.at(-1).blocks[0].plan;
    assert.equal(plan.conversationId, cid);
    assert.equal(plan.quote.mode, "simulation");
    assert.equal(plan.status, "pending");
  }
  assert.ok(state.calls.every((c) => c.name === "nova_launch_turn"));
  assert.equal(state.calls.filter((c) => c.args.p_operation === "finish").length, 2);
});

test("provider streaming is replaceable; cancellation prevents a late reply from persisting", async (t) => {
  const state = setup(t);
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(model, "getNovaModelProvider", () => ({
    id: "test-provider",
    async *stream({ signal, context }) {
      assert.deepEqual(context, []);
      yield { type: "text", delta: "First output" };
      await wait;
      signal.throwIfAborted();
      yield { type: "text", delta: "Late output" };
    },
  }));
  const controller = new AbortController();
  const response = await messages.POST(
    req(
      "message",
      { conversationId: randomUUID(), requestId: randomUUID(), text: "Explain blockchains" },
      "POST",
      controller.signal,
    ),
  );
  const reader = response.body.getReader();
  let text = "";
  while (!text.includes("First output"))
    text += new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  release();
  while (!(await reader.read()).done) {}
  assert.equal(
    state.calls.some((c) => c.args.p_operation === "finish"),
    false,
  );
  assert.ok(state.calls.some((c) => c.args.p_operation === "cancel"));
});
