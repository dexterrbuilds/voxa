const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");
const {
  validateAction,
  understandIntent,
  boundedContext,
  simulationAdapter,
} = require("../app/lib/nova-launch/actions.ts");
const { createPlan, verifyPlan } = require("../app/lib/server/nova-launch/plans.ts");
const { getNovaModelProvider } = require("../app/lib/server/nova-launch/model.ts");
const { isDormantRoute } = require("../app/lib/product-features.ts");
const swap = { type: "swap", params: { chain: "solana", input: "SOL", output: "USDC", amount: 1 } };

test("launch gates only dormant page families, not Nova/auth/admin/APIs", () => {
  for (const path of ["/room/ABC123", "/agents/nova", "/developers/builder", "/developers/sandbox"])
    assert.ok(isDormantRoute(path));
  for (const path of ["/nova", "/login", "/api/agents/register", "/admin/agents"])
    assert.equal(isDormantRoute(path), false);
});
test("platform opt-in restores preserved page routes without changing APIs", () => {
  const features = require("../app/lib/product-features.ts");
  const { proxy } = require("../proxy.ts");
  const { NextRequest } = require("next/server");
  const original = features.platformEnabled;
  try {
    features.platformEnabled = false;
    assert.equal(proxy(new NextRequest("http://localhost/developers/agents")).status, 307);
    assert.equal(proxy(new NextRequest("http://localhost/api/agents")).status, 200);
    features.platformEnabled = true;
    for (const path of ["/", "/room/ABC123", "/agents", "/developers/sandbox"])
      assert.equal(proxy(new NextRequest(`http://localhost${path}`)).status, 200);
  } finally {
    features.platformEnabled = original;
  }
});
test("explicit schemas reject malformed amounts, arbitrary instructions and unsupported venues", () => {
  assert.deepEqual(validateAction(swap), swap);
  for (const amount of [-1, 0, NaN, Infinity, "1", 1e20])
    assert.throws(() => validateAction({ ...swap, params: { ...swap.params, amount } }));
  assert.throws(() => validateAction({ ...swap, code: "execute()" }));
  for (const action of [
    null,
    [],
    {},
    { type: "swap" },
    { type: "swap", params: {} },
    { type: "perp_open", params: { venue: "simulation", market: "SOL", side: "long" } },
  ])
    assert.throws(() => validateAction(action));
  assert.throws(() =>
    validateAction({
      type: "transfer",
      params: { recipient: "anything", amount: 1, token: "SOL" },
    }),
  );
  assert.throws(() =>
    validateAction({
      type: "perp_open",
      params: { venue: "unknown", market: "SOL", side: "long", collateral: 200, leverage: 3 },
    }),
  );
});
test("intent is constrained and conversation agreement never authorizes actions", () => {
  assert.deepEqual(understandIntent("Swap 1 SOL to USDC"), { action: swap });
  assert.equal(understandIntent("Open SOL long with 200 USDC at 3x").action.params.leverage, 3);
  assert.deepEqual(understandIntent("Open a 3x SOL long with 100 USDC").action.params, {
    venue: "simulation",
    market: "SOL",
    side: "long",
    collateral: 100,
    leverage: 3,
  });
  for (const text of ["okay", "yes", "do it", "sure", "sounds good"])
    assert.deepEqual(understandIntent(text), { conversation: true });
  assert.ok(understandIntent("Swap on unknown protocol").clarification);
  assert.ok(understandIntent("Show my positions").clarification);
});
test("approval is bound to immutable action, quote, conversation and identity", () => {
  const plan = createPlan("conversation", swap);
  verifyPlan(plan);
  const reorder = (value) =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([k, v]) => [k, reorder(v)]),
          )
        : value;
  verifyPlan(reorder(plan));
  for (const mutate of [
    (p) => p.action.params.amount++,
    (p) => (p.quote.expiresAt = "2099-01-01"),
    (p) => (p.conversationId = "other"),
    (p) => (p.id = "other"),
  ]) {
    const copy = structuredClone(plan);
    mutate(copy);
    assert.throws(() => verifyPlan(copy));
  }
  assert.notEqual(createPlan("conversation", swap).approvalToken, plan.approvalToken);
});
test("simulation is explicit, expiring, cancellable and cannot execute real funds", async () => {
  const plan = createPlan("conversation", swap);
  const result = await simulationAdapter.simulate(plan, new AbortController().signal);
  assert.equal(result.mode, "simulation");
  assert.equal(result.transactionSignature, null);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => simulationAdapter.simulate(plan, controller.signal));
  await assert.rejects(() =>
    simulationAdapter.simulate(
      { ...plan, quote: { ...plan.quote, expiresAt: "2000-01-01" } },
      new AbortController().signal,
    ),
  );
  await assert.rejects(() =>
    simulationAdapter.execute(plan, { access: ["execute"] }, new AbortController().signal),
  );
});
test("bounded model context excludes deterministic action/account/approval state", () => {
  const turns = Array.from({ length: 50 }, (_, i) => ({
    role: i % 2 ? "nova" : "user",
    text: "a".repeat(3000),
    account: { secret: "private" },
    approval: true,
  }));
  const context = boundedContext(turns);
  assert.ok(context.length <= 12);
  assert.ok(context.reduce((n, t) => n + t.text.length, 0) <= 12000);
  assert.ok(context.every((t) => Object.keys(t).sort().join() === "role,text"));
});
test("provider selection stays server-configurable and fails closed for unknown providers", () => {
  const old = process.env.NOVA_MODEL_PROVIDER;
  try {
    process.env.NOVA_MODEL_PROVIDER = "gemini";
    assert.equal(getNovaModelProvider().id, "gemini");
    process.env.NOVA_MODEL_PROVIDER = "unknown";
    assert.throws(() => getNovaModelProvider());
  } finally {
    if (old === undefined) delete process.env.NOVA_MODEL_PROVIDER;
    else process.env.NOVA_MODEL_PROVIDER = old;
  }
});
test("legacy Nova room voice, providers, capture and memory remain byte-identical to checkpoint", () => {
  const root = resolve(__dirname, "../..");
  for (const path of [
    "app/components/RoomVoice.tsx",
    "app/api/agents/nova/respond/route.ts",
    "app/lib/server/nova/providers/llm/gemini.ts",
    "app/lib/server/nova/providers/stt/deepgram.ts",
    "app/lib/server/nova/providers/tts/index.ts",
    "app/lib/server/nova/memory.ts",
    "app/lib/voice-activation.ts",
    "app/lib/wake-word/useWakeWord.ts",
  ]) {
    const baseline = execFileSync(
      "git",
      ["show", `ce5aead80fe117bc5094c029799ff85da1dedc8e:voxa-beta/${path}`],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(readFileSync(resolve(root, "voxa-beta", path), "utf8"), baseline, path);
  }
});
