// UI fixtures using the real normalization/service/plan modules, not live providers.
// API authorization + PostgreSQL approval are tested independently.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
require("./register.cjs");
const { chromium } = require("playwright");
const { ADDRESS, MINT, SIGNATURE, fixtureFetch } = require("./chain-fixtures.cjs");
const { RpcSolanaProvider } = require("../app/lib/server/nova-launch/chain/solana.ts");
const {
  SolanaSwapAdapter,
  JupiterQuoteProvider,
} = require("../app/lib/server/nova-launch/chain/quotes.ts");
const { handleChainRequest } = require("../app/lib/server/nova-launch/chain/service.ts");
const { createQuotePlan } = require("../app/lib/server/nova-launch/plans.ts");
const base = process.env.SMOKE_URL || "http://localhost:3000";
const artifacts = "/private/tmp/synq-solana-smoke";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const user = {
  id: randomUUID(),
  email: "chain-fixture@example.com",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { full_name: "Chain Tester" },
  app_metadata: { provider: "email", providers: ["email"] },
  created_at: new Date().toISOString(),
};
const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
const chats = [],
  turns = new Map(),
  plans = new Map();
let expireNext = false;
const data = new RpcSolanaProvider("https://rpc.example.com", fixtureFetch());
const adapter = new SolanaSwapAdapter(new JupiterQuoteProvider("fixture-only", fixtureFetch()));
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
async function idle() {
  await page.getByRole("status").filter({ hasText: "Read & quote only" }).waitFor();
}
async function send(text) {
  await idle();
  await page.getByRole("textbox", { name: "Message Nova" }).fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.locator(".nova-turn.user").filter({ hasText: text }).last().waitFor();
  await idle();
}
async function shot(name) {
  await page.waitForTimeout(250); // Let existing material/viewport transitions settle for screenshots.
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    name,
  );
  await page.screenshot({
    path: `${artifacts}/${name}.png`,
    fullPage: false,
    animations: "disabled",
  });
}
try {
  await page.route("**/auth/v1/**", (r) =>
    json(
      r,
      r.request().url().includes("/user")
        ? user
        : {
            access_token: token,
            refresh_token: "fixture-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          },
    ),
  );
  await page.route("**/rest/v1/**", (r) => json(r, []));
  await page.route("**/api/nova/capabilities", (r) =>
    json(r, { solanaReads: true, quoteOnly: true, execution: false }),
  );
  await page.route("**/api/nova/conversations**", (r) => {
    const req = r.request(),
      id = new URL(req.url()).searchParams.get("id");
    if (req.method() === "POST") {
      const c = {
        id: randomUUID(),
        title: "New conversation",
        updated_at: new Date().toISOString(),
      };
      chats.unshift(c);
      turns.set(c.id, []);
      return json(r, { conversation: c });
    }
    return json(
      r,
      id
        ? {
            conversation: chats.find((c) => c.id === id),
            messages: turns.get(id),
            plans: [...plans.values()].filter((p) => p.conversationId === id),
          }
        : { conversations: chats },
    );
  });
  await page.route("**/api/nova/message", async (r) => {
    const b = r.request().postDataJSON();
    if (r.request().method() === "DELETE") return json(r, { ok: true });
    const history = turns.get(b.conversationId),
      requote = plans.get(b.requotePlanId);
    for (const p of plans.values())
      if (p.conversationId === b.conversationId && p.status === "pending") p.status = "superseded";
    history.push({ id: b.requestId, role: "user", text: b.text, blocks: [] });
    let events;
    try {
      const reply = await handleChainRequest(
        {
          prompt: b.text,
          owner: user.id,
          conversationId: b.conversationId,
          account: b.account,
          history: history.slice(0, -1),
          requote,
          signal: new AbortController().signal,
          model: () => ({
            id: "fixture",
            explainTransaction: async () => "The sender's net SOL decreased, including its fee.",
          }),
        },
        data,
        adapter,
      );
      assert.ok(reply);
      if (reply.plan) {
        if (expireNext) {
          reply.plan = createQuotePlan(b.conversationId, reply.plan.action, {
            ...reply.plan.quote,
            expiresAt: new Date(Date.now() + 1200).toISOString(),
          });
          reply.blocks = [{ type: "action_plan", plan: reply.plan }];
          expireNext = false;
        }
        plans.set(reply.plan.id, { ...reply.plan, result: null });
      }
      history.push({ id: randomUUID(), role: "nova", text: reply.text, blocks: reply.blocks });
      events = [
        { type: "state", state: "thinking" },
        { type: "text", delta: reply.text },
        { type: "complete", blocks: reply.blocks },
      ];
    } catch (e) {
      events = [{ type: "error", error: e.message }];
    }
    await r.fulfill({
      contentType: "application/x-ndjson",
      body: events.map(JSON.stringify).join("\n") + "\n",
    });
  });
  await page.route("**/api/nova/actions", async (r) => {
    const b = r.request().postDataJSON(),
      p = plans.get(b.id);
    if (!p || b.hash !== p.hash || b.approvalToken !== p.approvalToken)
      return json(r, { error: "Approval does not match plan." }, 409);
    if (p.result) return json(r, p.result);
    if (p.status !== "pending") return json(r, { error: "Quote no longer available." }, 409);
    if (b.operation === "cancel") {
      p.status = "cancelled";
      return json(r, { cancelled: true });
    }
    try {
      p.result = await adapter.simulate(p, new AbortController().signal);
      p.status = "executed";
      return json(r, p.result);
    } catch (e) {
      return json(r, { error: e.message }, 409);
    }
  });
  await page.goto(`${base}/nova`);
  await page.waitForURL(/login/);
  await page.locator("input[type=email]").fill(user.email);
  await page.locator("input[type=password]").fill("fixture-password");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(`${base}/nova`);
  await idle();
  await page.getByRole("button", { name: "Account and wallet", exact: true }).click();
  await page.getByRole("textbox", { name: "Solana address" }).fill(ADDRESS);
  await page.getByRole("button", { name: "Use read-only address" }).click();
  await send("What do I own?");
  await page.getByRole("heading", { name: "Wallet portfolio" }).waitFor();
  await shot("portfolio-desktop-light");
  await page.getByRole("button", { name: /Switch to dark/ }).click();
  await shot("portfolio-desktop-dark");
  await send(`What token is this ${MINT}?`);
  await page.getByRole("heading", { name: "Token mint" }).waitFor();
  await send(`Explain this transaction ${SIGNATURE}`);
  await page.getByRole("heading", { name: "Transaction facts" }).waitFor();
  await page.getByText("Balance changes and programs", { exact: true }).click();
  await shot("transaction-desktop-dark");
  await send("Show my recent transactions");
  await page.getByRole("heading", { name: "Recent activity" }).waitFor();
  await send("Swap 1 SOL to USDC");
  await page.getByRole("button", { name: "Approve quote", exact: true }).waitFor();
  await page.getByText("Tokens, route and quote details", { exact: true }).last().click();
  await shot("quote-desktop-dark");
  await page.getByRole("button", { name: /Switch to light/ }).click();
  await shot("quote-desktop-light");
  await page.getByRole("button", { name: "Approve quote", exact: true }).click();
  await page
    .getByText("Quote approved — execution is not enabled yet. No funds moved.", { exact: true })
    .waitFor();
  const approved = [...plans.values()].at(-1);
  assert.equal(approved.result.transactionSignature, null);
  expireNext = true;
  await send("Swap 2 SOL to USDC");
  const old = [...plans.values()].at(-1);
  await page
    .getByText(/Quote expired\. Refresh/)
    .last()
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Approve quote", exact: true }).isDisabled(),
    true,
  );
  const staleStatus = await page.evaluate(
    async (p) =>
      (
        await fetch("/api/nova/actions", {
          method: "POST",
          body: JSON.stringify({
            id: p.id,
            hash: p.hash,
            approvalToken: p.approvalToken,
            operation: "approve",
          }),
          headers: { "Content-Type": "application/json" },
        })
      ).status,
    old,
  );
  assert.equal(staleStatus, 409);
  await page.getByRole("button", { name: "Refresh quote", exact: true }).last().click();
  await idle();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".nova-turn.user")].some((el) =>
      el.textContent.includes("Refresh this quote"),
    ),
  );
  await page.getByRole("button", { name: "Approve quote", exact: true }).waitFor();
  const refreshed = [...plans.values()].at(-1);
  assert.notEqual(refreshed.hash, old.hash);
  assert.notEqual(refreshed.approvalToken, old.approvalToken);
  assert.equal(old.status, "superseded");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Approve quote", exact: true }).scrollIntoViewIfNeeded();
  await shot("quote-mobile-light");
  await page.getByRole("button", { name: /Switch to dark/ }).click();
  await shot("quote-mobile-dark");
  await page.getByRole("button", { name: "Approve quote", exact: true }).click();
  await send("Swap 11 SOL to USDC");
  await page.getByRole("alert").filter({ hasText: "enough SOL" }).waitFor();
  await shot("insufficient-mobile-dark");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await send("Swap 1 BONK to USDC");
  await page.getByRole("alert").filter({ hasText: "symbols can refer" }).waitFor();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await send("What do I own?");
  await shot("portfolio-mobile-dark");
  await page.getByRole("button", { name: /Switch to light/ }).click();
  await shot("portfolio-mobile-light");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Phase 2A UI fixtures: portfolio, mint, normalized transaction/explanation, recent activity, quote/details/review, expiry rejection/requote/new hash, insufficient balance, ambiguity, desktop/mobile/light/dark. No live auth or Jupiter quote asserted.",
  );
} catch (e) {
  await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true });
  throw e;
} finally {
  await browser.close();
}
