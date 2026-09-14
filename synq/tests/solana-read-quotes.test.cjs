const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  atomicAmount,
  displayAmount,
  solanaAddress,
  solanaSignature,
  SOL_MINT,
  USDC_MINT,
} = require("../app/lib/nova-launch/solana.ts");
const {
  RpcSolanaProvider,
  normalizeTransaction,
} = require("../app/lib/server/nova-launch/chain/solana.ts");
const {
  JupiterQuoteProvider,
  SolanaSwapAdapter,
  resolveToken,
  slippage,
  validateQuoteAction,
} = require("../app/lib/server/nova-launch/chain/quotes.ts");
const { handleChainRequest } = require("../app/lib/server/nova-launch/chain/service.ts");
const {
  parseChainIntent,
  readContext,
  validateModelIntent,
} = require("../app/lib/server/nova-launch/chain/intent.ts");
const { readJson } = require("../app/lib/server/nova-launch/chain/transport.ts");
const { createQuotePlan, verifyPlan } = require("../app/lib/server/nova-launch/plans.ts");
const {
  ADDRESS,
  MINT,
  SIGNATURE,
  INJECTION,
  transaction,
  fixtureFetch,
} = require("./chain-fixtures.cjs");
const signal = () => new AbortController().signal;
const params = () => ({
  chain: "solana",
  input: "SOL",
  output: "USDC",
  inputMint: SOL_MINT,
  outputMint: USDC_MINT,
  inputDecimals: 9,
  outputDecimals: 6,
  amount: "1",
  slippageBps: 50,
});
function setup(override) {
  const calls = [],
    fetcher = fixtureFetch(calls, override),
    data = new RpcSolanaProvider("https://rpc.example.com", fetcher),
    adapter = new SolanaSwapAdapter(new JupiterQuoteProvider("fixture-only-key", fetcher));
  return {
    calls,
    data,
    adapter,
    run: (prompt, extra = {}) =>
      handleChainRequest(
        {
          prompt,
          owner: randomUUID(),
          conversationId: randomUUID(),
          account: { address: ADDRESS, kind: "watch" },
          history: [],
          signal: signal(),
          model: () => ({ id: "fixture", extractIntent: async () => ({ kind: "conversation" }) }),
          ...extra,
        },
        data,
        adapter,
      ),
  };
}
test("Solana identifiers validate decoded length and reject malformed addresses/signatures", () => {
  assert.equal(solanaAddress(ADDRESS), ADDRESS);
  assert.equal(solanaSignature(SIGNATURE), SIGNATURE);
  for (const value of [
    "0".repeat(44),
    "1".repeat(33),
    SIGNATURE,
    "seed words",
    "https://private/",
    null,
  ])
    assert.throws(() => solanaAddress(value));
  for (const value of [ADDRESS, "1".repeat(65), "not-a-signature"])
    assert.throws(() => solanaSignature(value));
});
test("pasted wallet context cannot grant signing or execution authority", () => {
  assert.deepEqual(
    readContext({ address: ADDRESS, kind: "watch", access: ["execute"], privateKey: "ignored" }),
    { address: ADDRESS, kind: "watch" },
  );
  assert.deepEqual(
    readContext({ address: ADDRESS, kind: "wallet", access: ["request_signature"] }),
    { address: ADDRESS, kind: "wallet" },
  );
});
test("decimal accounting is exact; zero, negatives, exponents, precision and u64 overflow fail", () => {
  assert.equal(atomicAmount("1.000000001", 9), 1000000001n);
  assert.equal(displayAmount(1000000001n, 9), "1.000000001");
  for (const value of ["0", "-1", "1e3", "01", "0.0000000001", "18446744074", "NaN"])
    assert.throws(() => atomicAmount(value, 9));
});
test("RPC portfolio reads both token programs, aggregates exact balances and bounds/cache reads", async () => {
  const s = setup(),
    first = await s.data.portfolio(ADDRESS, signal());
  assert.equal(first.sol, "10");
  assert.equal(first.tokens[0].amount, "500");
  assert.equal(first.tokens[0].mint, USDC_MINT);
  assert.equal(s.calls.length, 3);
  first.tokens[0].amount = "tampered";
  assert.equal((await s.data.portfolio(ADDRESS, signal())).tokens[0].amount, "500");
  assert.equal(s.calls.length, 3);
});
test("token lookup resolves exact mint and labels spoofed metadata as untrusted", async () => {
  const s = setup(),
    token = await s.data.token(MINT, signal());
  assert.equal(token.symbol, "SOL");
  assert.equal(token.metadataSource, "on-chain-untrusted");
  const resolved = await resolveToken(MINT, s.data, signal());
  assert.equal(resolved.symbol, MINT);
  assert.equal(resolved.mint, MINT);
  await assert.rejects(resolveToken("BONK", s.data, signal()), /symbols.*mints/);
});
test("mint/symbol substitution cannot enter a deterministic quote plan", () => {
  for (const patch of [
    { inputMint: MINT },
    { inputDecimals: 6 },
    { outputMint: SOL_MINT },
    { instructions: "execute" },
    { observedBalance: "20" },
  ])
    assert.throws(() => validateQuoteAction({ type: "swap", params: { ...params(), ...patch } }));
});
test("recent activity is bounded and transaction normalization excludes memos/log injection", async () => {
  const s = setup(),
    recent = await s.data.recent(ADDRESS, signal());
  assert.equal(recent.length, 1);
  assert.equal(JSON.parse(s.calls[0].init.body).params[1].limit, 10);
  const tx = normalizeTransaction(SIGNATURE, transaction());
  assert.equal(tx.feeSol, "0.000005");
  assert.equal(tx.solChanges[0].change, "-1.000005");
  assert.ok(tx.instructions.includes("transfer"));
  assert.ok(tx.instructions.some((v) => v.startsWith("Unidentified")));
  assert.equal(JSON.stringify(tx).includes(INJECTION), false);
});
test("all requested natural read and quote patterns map safely", () => {
  for (const prompt of ["What do I own?", "How much SOL do I have?", "Show my tokens."])
    assert.equal(parseChainIntent(prompt).kind, "portfolio");
  assert.equal(parseChainIntent("Explain my last transaction.").kind, "last_transaction");
  assert.equal(parseChainIntent("What did this wallet do recently?").kind, "activity");
  assert.equal(parseChainIntent("What token is this?").kind, "token");
  assert.equal(parseChainIntent("What would I get for 500 USDC worth of SOL?").amount, "500");
  assert.equal(parseChainIntent("Quote swapping half my SOL to USDC.").percent, 50);
});
test("percentage amounts use observed balances, preserve precision, reserve SOL and reject insufficient funds", async () => {
  const s = setup();
  assert.equal((await s.run("Swap half my SOL to USDC")).plan.action.params.amount, "5");
  assert.equal((await s.run("Swap 100% of my SOL to USDC")).plan.action.params.amount, "9.995");
  assert.equal((await s.run("Swap 25% of my USDC to SOL")).plan.action.params.amount, "125");
  await assert.rejects(s.run("Swap 11 SOL to USDC"), /enough SOL/);
  await assert.rejects(s.run("Swap half my SOL to USDC", { account: null }), /wallet address/);
  await assert.rejects(s.run("Swap 101% of my SOL to USDC"), /percentage/);
});
test("slippage default and bounds are deterministic, never selected by the model", () => {
  assert.equal(slippage(), 50);
  assert.equal(slippage(100), 100);
  for (const value of [0, -1, 101, 1.5, "50", Infinity]) assert.throws(() => slippage(value));
  assert.equal(
    validateModelIntent(
      { kind: "swap", input: "SOL", output: "USDC", amount: "1", slippageBps: 10000 },
      "Swap 1 SOL to USDC",
    ).slippageBps,
    undefined,
  );
});
test("model proposals cannot invent addresses, mints, amounts or authorization", () => {
  assert.throws(() =>
    validateModelIntent({ kind: "portfolio", address: ADDRESS }, "What do I own?"),
  );
  assert.throws(() =>
    validateModelIntent(
      { kind: "swap", input: MINT, output: "SOL", amount: "1000" },
      "Swap some tokens to SOL",
    ),
  );
  assert.throws(() => validateModelIntent({ kind: "execute" }, "okay"));
  assert.equal(parseChainIntent("okay"), null);
  assert.equal(parseChainIntent("yes"), null);
  assert.equal(parseChainIntent("do it"), null);
});
test("Jupiter V2 requests omit taker and normalize quote-only fields, not transaction capabilities", async () => {
  const s = setup(),
    reply = await s.run("Swap 1 SOL to USDC"),
    q = reply.plan.quote;
  assert.equal(q.mode, "quote_only");
  assert.equal(q.expectedOutput, "150");
  assert.equal(q.minimumOutput, "149.25");
  const outbound = s.calls.find((c) => c.url.hostname === "api.jup.ag");
  assert.equal(outbound.url.pathname, "/swap/v2/order");
  assert.equal(outbound.url.searchParams.has("taker"), false);
  assert.equal(outbound.init.method, undefined);
  assert.ok(Date.parse(q.expiresAt) - Date.parse(q.acquiredAt) <= 30000);
  assert.equal("transaction" in q, false);
  assert.equal("requestId" in q, false);
});
test("provider cannot substitute amount, mint, slippage, minimum or an unsigned transaction", async () => {
  for (const patch of [
    { inputMint: MINT },
    { inAmount: "2" },
    { slippageBps: 10000 },
    { otherAmountThreshold: "1" },
    { transaction: "unsigned-payload" },
    { taker: ADDRESS },
  ])
    await assert.rejects(setup(patch).run("Swap 1 SOL to USDC"), /quote/i);
});
test("requotes create new hashes/nonces and recheck the original observed balance", async () => {
  const s = setup(),
    prior = await s.run("Swap 1 SOL to USDC");
  const refreshed = await s.run("Refresh this quote", {
    requote: prior.plan,
    conversationId: prior.plan.conversationId,
    account: null,
  });
  assert.notEqual(refreshed.plan.id, prior.plan.id);
  assert.notEqual(refreshed.plan.hash, prior.plan.hash);
  assert.notEqual(refreshed.plan.approvalToken, prior.plan.approvalToken);
  assert.equal(refreshed.plan.action.params.observedAddress, ADDRESS);
  verifyPlan(refreshed.plan);
});
test("quote mutation, plan hash mismatch and stale quotes fail; execute always throws", async () => {
  const s = setup(),
    { plan } = await s.run("Swap 1 SOL to USDC");
  verifyPlan(plan);
  const mutated = structuredClone(plan);
  mutated.quote.outputAtomic = "999";
  assert.throws(() => verifyPlan(mutated));
  const swapped = structuredClone(plan);
  swapped.conversationId = randomUUID();
  assert.throws(() => verifyPlan(swapped));
  const expired = createQuotePlan(plan.conversationId, plan.action, {
    ...plan.quote,
    expiresAt: new Date(0).toISOString(),
  });
  await assert.rejects(s.adapter.simulate(expired, signal()), /expired/);
  const review = await s.adapter.simulate(plan, signal());
  assert.equal(review.transactionSignature, null);
  assert.equal(review.mode, "quote_only");
  await assert.rejects(s.adapter.execute(plan, {}, signal()), /disabled/);
});
test("RPC write methods are denied before transport", async () => {
  const s = setup();
  await assert.rejects(s.data.rpc("sendTransaction", [], signal()), /read-only/);
  assert.equal(s.calls.length, 0);
});
test("provider failures are normalized and retries are bounded", async () => {
  let calls = 0;
  await assert.rejects(
    readJson("https://rpc.example.com/private-key", {}, signal(), "solana", "balance", async () => {
      calls++;
      return new Response("secret provider message", { status: 503 });
    }),
    (e) => e.message === "Solana data is temporarily unavailable.",
  );
  assert.equal(calls, 2);
});
test("RPC timeout and cancellation cannot return or cache late data", async () => {
  const hanging = async (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(new Error("secret")), { once: true }),
    );
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      new RpcSolanaProvider("https://rpc.example.com", hanging, 10).balance(ADDRESS, signal()),
      (e) => e.code === "timeout",
    );
  } finally {
    clearTimeout(keepAlive);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(setup().data.portfolio(ADDRESS, controller.signal));
});
test("metadata remains data: token and transaction responses never send it to model instructions", async () => {
  const s = setup();
  let calls = 0;
  const model = () => ({
    id: "facts-only",
    explainTransaction: async (facts) => {
      calls++;
      assert.equal(JSON.stringify(facts).includes(INJECTION), false);
      assert.ok(facts.solChanges.length);
      return "Net changes include fees.";
    },
  });
  const token = await s.run(`What token is this ${MINT}?`, { model });
  assert.equal(token.blocks[0].data.name, INJECTION);
  assert.equal(calls, 0);
  const reply = await s.run(`Explain this transaction ${SIGNATURE}`, { model });
  assert.equal(calls, 1);
  assert.match(reply.text, /Nova's interpretation/);
});
test("Phase 2A network surface contains no signer, builder or transaction submission implementation", () => {
  const dir = path.join(__dirname, "../app/lib/server/nova-launch/chain");
  const code = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8"))
    .join("\n");
  for (const pattern of [
    /signTransaction\s*\(/,
    /sendRawTransaction\s*\(/,
    /Keypair\./,
    /\/swap\/v2\/(execute|build|submit)/,
    /method:\s*["']sendTransaction/,
  ])
    assert.equal(pattern.test(code), false);
});

test("base58 mint case cannot be substituted by model output; fractional percentages remain exact", async () => {
  const changedCase = MINT.replace(/[a-km-zA-HJ-NP-Z]/, (c) =>
    c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase(),
  );
  assert.throws(() =>
    validateModelIntent(
      { kind: "swap", input: changedCase, output: "SOL", amount: "1" },
      `Swap 1 ${MINT} to SOL`,
    ),
  );
  assert.equal(parseChainIntent("Swap 1 SOL to USDC with 0.29% slippage").slippageBps, 29);
  const reply = await setup().run("Swap 25.01% of my USDC to SOL");
  assert.equal(reply.plan.action.params.amount, "125.05");
  const remembered = await setup().run("Swap half my SOL to USDC", {
    account: null,
    history: [{ role: "user", text: ADDRESS }],
  });
  assert.equal(remembered.plan.action.params.amount, "5");
});

test("public quote access is opt-in and development-only; production requires a key", async (t) => {
  const previous = process.env.NODE_ENV;
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
  const calls = [],
    provider = new JupiterQuoteProvider("", fixtureFetch(calls), true);
  process.env.NODE_ENV = "production";
  await assert.rejects(provider.quote(params(), signal()), /not configured/);
  assert.equal(calls.length, 0);
  process.env.NODE_ENV = "development";
  assert.equal((await provider.quote(params(), signal())).mode, "quote_only");
  assert.equal("x-api-key" in calls[0].init.headers, false);
  await assert.rejects(
    new JupiterQuoteProvider("", fixtureFetch()).quote(params(), signal()),
    /not configured/,
  );
});
