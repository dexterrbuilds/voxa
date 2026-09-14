const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { NextRequest, NextResponse } = require("next/server");
const access = require("../app/lib/server/nova-launch/access.ts");
const provider = require("../app/lib/server/nova-launch/chain/solana.ts");
const quotes = require("../app/lib/server/nova-launch/chain/quotes.ts");
const { handleChainRequest } = require("../app/lib/server/nova-launch/chain/service.ts");
const { createQuotePlan } = require("../app/lib/server/nova-launch/plans.ts");
const messages = require("../app/api/nova/message/route.ts");
const actions = require("../app/api/nova/actions/route.ts");
const capabilities = require("../app/api/nova/capabilities/route.ts");
const { ADDRESS, fixtureFetch } = require("./chain-fixtures.cjs");
const req = (path, body) =>
  new NextRequest(`http://localhost/api/nova/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
async function setup(t) {
  const oldFlag = process.env.NOVA_SOLANA_ENABLED;
  process.env.NOVA_SOLANA_ENABLED = "true";
  t.after(() => {
    if (oldFlag === undefined) delete process.env.NOVA_SOLANA_ENABLED;
    else process.env.NOVA_SOLANA_ENABLED = oldFlag;
  });
  const owner = randomUUID(),
    cid = randomUUID(),
    calls = [],
    filters = [];
  const data = new provider.RpcSolanaProvider("https://rpc.example.com", fixtureFetch());
  const adapter = new quotes.SolanaSwapAdapter(
    new quotes.JupiterQuoteProvider("fixture-key", fixtureFetch()),
  );
  t.mock.method(provider, "getSolanaProvider", () => data);
  t.mock.method(quotes, "getSwapAdapter", () => adapter);
  const { plan } = await handleChainRequest(
    {
      owner,
      conversationId: cid,
      prompt: "Swap 1 SOL to USDC",
      account: { address: ADDRESS },
      history: [],
      signal: new AbortController().signal,
      model: () => ({ id: "unused" }),
    },
    data,
    adapter,
  );
  const record = { plan, status: "pending" };
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
      return { data: { mode: "quote_only", transactionSignature: null }, error: null };
    },
  };
  t.mock.method(access, "launchAccess", async () => ({ user: { id: owner }, db }));
  return { owner, cid, plan, record, query, db, filters, calls, adapter };
}
test("chain capabilities are authenticated and reveal no provider configuration", async (t) => {
  t.mock.method(access, "launchAccess", async () =>
    NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  );
  assert.equal((await capabilities.GET(req("capabilities", {}))).status, 401);
  await setup(t);
  assert.deepEqual(await (await capabilities.GET(req("capabilities", {}))).json(), {
    solanaReads: true,
    quoteOnly: true,
    execution: false,
  });
});
test("fresh quotes persist through the existing owner-scoped turn RPC without approval", async (t) => {
  const s = await setup(t);
  const response = await messages.POST(
    req("message", {
      conversationId: s.cid,
      requestId: randomUUID(),
      text: "Swap 1 SOL to USDC",
      account: { address: ADDRESS, access: ["execute"] },
    }),
  );
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.equal(events.at(-1).blocks[0].plan.quote.mode, "quote_only");
  assert.equal(s.calls.length, 2);
  assert.ok(s.calls.every((c) => c.name === "nova_launch_turn" && c.args.p_owner === s.owner));
  assert.ok(s.filters.some(([k, v]) => k === "conversation_id" && v === s.cid));
});
test("refresh scopes both owner and conversation before invalidating or creating a plan", async (t) => {
  const s = await setup(t);
  s.query.maybeSingle = async () => ({ data: null, error: null });
  const body = {
    conversationId: randomUUID(),
    requestId: randomUUID(),
    text: "Refresh this quote",
    requotePlanId: s.plan.id,
  };
  assert.equal((await messages.POST(req("message", body))).status, 404);
  assert.equal(s.calls.length, 0);
  assert.ok(s.filters.some(([k, v]) => k === "owner_id" && v === s.owner));
  assert.ok(s.filters.some(([k, v]) => k === "conversation_id" && v === body.conversationId));
});
test("refresh creates a different immutable plan and starts supersession before persisting it", async (t) => {
  const s = await setup(t);
  const result = await messages.POST(
    req("message", {
      conversationId: s.cid,
      requestId: randomUUID(),
      text: "Refresh this quote",
      requotePlanId: s.plan.id,
    }),
  );
  const events = (await result.text()).trim().split("\n").map(JSON.parse);
  const next = events.at(-1).blocks[0].plan;
  assert.notEqual(next.hash, s.plan.hash);
  assert.notEqual(next.approvalToken, s.plan.approvalToken);
  assert.equal(s.calls[0].args.p_operation, "start");
  assert.equal(s.calls[1].args.p_plan.hash, next.hash);
});
test("quote approval rejects mutation/expiry, remains review-only and delegates replay checks to locked RPC", async (t) => {
  const s = await setup(t),
    body = {
      id: s.plan.id,
      hash: s.plan.hash,
      approvalToken: s.plan.approvalToken,
      operation: "approve",
    };
  t.mock.method(s.adapter, "execute", async () => {
    throw new Error("execution must never be called");
  });
  s.plan.quote.expectedOutput = "999";
  assert.equal((await actions.POST(req("actions", body))).status, 409);
  assert.equal(s.calls.length, 0);
  s.plan.quote.expectedOutput = "150";
  assert.equal((await actions.POST(req("actions", body))).status, 200);
  assert.equal(s.calls[0].name, "nova_launch_approve");
  assert.equal(s.calls[0].args.p_token, body.approvalToken);
  s.record.plan = createQuotePlan(s.cid, s.plan.action, {
    ...s.plan.quote,
    expiresAt: new Date(0).toISOString(),
  });
  const stale = {
    ...body,
    id: s.record.plan.id,
    hash: s.record.plan.hash,
    approvalToken: s.record.plan.approvalToken,
  };
  assert.equal((await actions.POST(req("actions", stale))).status, 409);
  s.record.status = "executed";
  assert.equal((await actions.POST(req("actions", stale))).status, 200); // Stored replay, not a second review.
  s.db.rpc = async () => ({ error: { message: "approval does not match plan" } });
  assert.equal(
    (await actions.POST(req("actions", { ...stale, approvalToken: randomUUID() }))).status,
    409,
  );
});
test("bad read context is rejected before storage; quote failure never becomes simulation", async (t) => {
  const s = await setup(t),
    body = { conversationId: s.cid, requestId: randomUUID(), text: "Swap 1 SOL to USDC" };
  assert.equal(
    (await messages.POST(req("message", { ...body, account: { address: "bad" } }))).status,
    400,
  );
  assert.equal(s.calls.length, 0);
  t.mock.method(s.adapter, "quote", async () => {
    throw new Error("private provider detail");
  });
  const response = await messages.POST(req("message", body));
  const text = await response.text();
  assert.equal(text.includes("private provider detail"), false);
  assert.equal(text.includes('"type":"error"'), true);
  assert.equal(
    s.calls.some((c) => c.args.p_operation === "finish"),
    false,
  );
  assert.equal(s.calls.at(-1).args.p_operation, "cancel");
});
