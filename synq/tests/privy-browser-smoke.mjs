// Fixture-only auth/SDK boundary. Real production components; no Privy OTP, keys or live network.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("./register.cjs");
const { build } = require("esbuild");
const { chromium } = require("playwright");
const { fixtureFetch, ADDRESS, MINT } = require("./chain-fixtures.cjs");
const { RpcSolanaProvider } = require("../app/lib/server/nova-launch/chain/solana.ts");
const {
  SolanaSwapAdapter,
  JupiterQuoteProvider,
} = require("../app/lib/server/nova-launch/chain/quotes.ts");
const { handleChainRequest } = require("../app/lib/server/nova-launch/chain/service.ts");
const out = "/private/tmp/synq-privy-smoke";
await mkdir(out, { recursive: true });
await build({
  entryPoints: ["tests/fixtures/privy-entry.jsx"],
  outfile: join(out, "app.js"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  alias: {
    "@": resolve("app"),
    "@privy-io/react-auth/solana": resolve("tests/fixtures/privy-react.jsx"),
    "@privy-io/react-auth": resolve("tests/fixtures/privy-react.jsx"),
    "next/navigation": resolve("tests/fixtures/next-navigation.jsx"),
    "next/dynamic": resolve("tests/fixtures/next-dynamic.jsx"),
    "next/link": resolve("tests/fixtures/next-link.jsx"),
  },
  define: {
    "process.env": "{}",
    "process.env.NODE_ENV": '"development"',
    "process.env.NEXT_PUBLIC_SYNQ_AUTH_PROVIDER": '"privy"',
    "process.env.NEXT_PUBLIC_PRIVY_APP_ID": '"fixture-public-id"',
    "process.env.NEXT_PUBLIC_PRIVY_GOOGLE_ENABLED": '"false"',
    "process.env.NEXT_PUBLIC_SYNQ_PLATFORM_ENABLED": '"false"',
  },
  loader: { ".wasm": "empty" },
  logLevel: "warning",
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = process.env.SMOKE_URL || "http://localhost:3000";
await page.goto(base + "/login");
const styles = await page
  .locator("link[rel=stylesheet]")
  .evaluateAll((nodes) => nodes.map((n) => n.href));
const baseStyles = (
  await Promise.all(
    styles.map(async (url) => {
      const response = await fetch(url);
      assert.ok(response.ok, "Preview stylesheet must load");
      return response.text();
    }),
  )
).join("\n");
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/base.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(baseStyles);
      return;
    }
    if (["/app.js", "/app.css"].includes(req.url)) {
      res.setHeader("Content-Type", req.url.endsWith(".js") ? "text/javascript" : "text/css");
      res.end(await readFile(join(out, req.url)));
      return;
    }
    if (req.url.endsWith(".svg")) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end(await readFile(join(resolve("public"), req.url)));
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<html><head><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/app.css"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="synq-app"><div id="root"></div><script type="module" src="/app.js"></script></body></html>`,
    );
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const owner = randomUUID(),
  chats = [],
  turns = new Map(),
  results = new Map(),
  plans = new Map();
const data = new RpcSolanaProvider("https://rpc.example.com", fixtureFetch());
const adapter = new SolanaSwapAdapter(new JupiterQuoteProvider("fixture-only", fixtureFetch()));
let observedAccount;
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
await page.route("**/api/nova/**", async (route) => {
  const fixture = await page.evaluate(() => window.__privyFixture);
  if (
    !fixture?.authenticated ||
    route.request().headers().authorization !== "Bearer fixture-privy-token"
  )
    return json(route, { error: "Please sign in again." }, 401);
  const path = new URL(route.request().url()).pathname.split("/").at(-1);
  const method = route.request().method();
  if (path === "session")
    return json(
      route,
      method === "DELETE"
        ? { ok: true }
        : {
            user: {
              id: owner,
              email: "fixture@example.com",
              wallet: fixture.wallet
                ? {
                    address: fixture.wallet,
                    chain: "solana",
                    provider: "privy",
                    access: ["read", "propose"],
                  }
                : null,
            },
          },
    );
  if (path === "capabilities") return json(route, { solanaReads: true });
  if (path === "conversations") {
    if (method === "POST") {
      const conversation = {
        id: randomUUID(),
        title: "New conversation",
        updated_at: new Date().toISOString(),
      };
      chats.push(conversation);
      turns.set(conversation.id, []);
      return json(route, { conversation });
    }
    const id = new URL(route.request().url()).searchParams.get("id");
    if (id)
      return json(route, {
        conversation: chats.find((c) => c.id === id),
        messages: turns.get(id) || [],
        plans: [...plans.values()]
          .filter((p) => p.conversationId === id)
          .map((p) => ({
            id: p.id,
            status: results.has(p.id) ? "executed" : "pending",
            result: results.get(p.id) || null,
          })),
      });
    return json(route, { conversations: chats });
  }
  if (path === "message") {
    const body = route.request().postDataJSON();
    observedAccount = body.account;
    const result = await handleChainRequest(
      {
        prompt: body.text,
        owner,
        conversationId: body.conversationId,
        account: body.account,
        history: [],
        signal: new AbortController().signal,
      },
      data,
      adapter,
    );
    if (result.plan) plans.set(result.plan.id, result.plan);
    turns
      .get(body.conversationId)
      .push(
        { id: body.requestId, role: "user", text: body.text, blocks: [] },
        { id: randomUUID(), role: "nova", text: result.text, blocks: result.blocks },
      );
    return route.fulfill({
      contentType: "application/x-ndjson",
      body:
        [
          { type: "state", state: "thinking" },
          { type: "text", delta: result.text },
          { type: "complete", blocks: result.blocks },
        ]
          .map(JSON.stringify)
          .join("\n") + "\n",
    });
  }
  if (path === "actions") {
    const body = route.request().postDataJSON();
    const result = await adapter.simulate(plans.get(body.id), new AbortController().signal);
    results.set(body.id, result);
    return json(route, result);
  }
  return json(route, { error: "Unexpected fixture request" }, 400);
});
async function shot(name) {
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    name,
  );
  await page.screenshot({ path: join(out, name + ".png"), animations: "disabled" });
}
async function send(text) {
  await page.getByRole("textbox", { name: "Message Nova" }).fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Read & quote only" }).waitFor();
}
try {
  await page.goto(origin + "/login");
  await page.getByRole("button", { name: "Continue with email" }).waitFor();
  await shot("login-light");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByRole("textbox", { name: "Message Nova" }).waitFor({ timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__privyFixture.created), 1);
  await page.getByRole("button", { name: "Account and wallet", exact: true }).first().click();
  await page.getByText("Your Synq wallet", { exact: true }).waitFor();
  await shot("wallet-desktop");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await send("What do I own?");
  await page.getByText("Wallet portfolio", { exact: true }).waitFor();
  assert.equal(observedAccount.kind, "wallet");
  await send("Swap 1 SOL to USDC");
  await page.getByRole("button", { name: "Approve quote", exact: true }).click();
  await page.getByText(/Quote approved.*execution is not enabled yet/i).waitFor();
  await shot("quote-review");
  await page.getByRole("button", { name: "Account and wallet", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Solana address" }).fill(MINT);
  await page.getByRole("button", { name: "Use read-only address" }).click();
  await send("What do I own?");
  assert.equal(observedAccount.kind, "watch");
  assert.equal(observedAccount.address, MINT);
  await page.getByRole("button", { name: "Account and wallet", exact: true }).first().click();
  assert.equal(
    await page.evaluate(() => window.__privyFixture.wallet),
    "So11111111111111111111111111111111111111112",
  );
  await page.getByRole("button", { name: "Use my Synq wallet" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Continue with email" }).waitFor();
  assert.equal(
    await page.evaluate(
      async () =>
        (
          await fetch("/api/nova/session", {
            headers: { Authorization: "Bearer fixture-privy-token" },
          })
        ).status,
    ),
    401,
  );
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByRole("textbox", { name: "Message Nova" }).waitFor();
  assert.equal(await page.evaluate(() => window.__privyFixture.created), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("nova-mobile-light");
  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await shot("nova-mobile-dark");
  await page.getByRole("button", { name: "Account and wallet", exact: true }).first().click();
  await shot("wallet-mobile-dark");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Privy fixture new/returning user, one wallet, default context, inspection, portfolio, quote review, logout rejection, mobile light/dark. NOT live Privy validation.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
