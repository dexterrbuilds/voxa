// Browser UI fixtures only. No production auth, provider calls or database writes.
// Actual API handlers and PostgreSQL approval rules have separate regression suites.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
require("./register.cjs");
const { createPlan } = require("../app/lib/server/nova-launch/plans.ts");
const { understandIntent } = require("../app/lib/nova-launch/actions.ts");
const { chromium } = require("playwright");
const base = process.env.SMOKE_URL || "http://localhost:3100";
const artifacts = process.env.SMOKE_ARTIFACTS || "/private/tmp/synq-nova-launch-smoke";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["microphone"],
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const user = {
  id: randomUUID(),
  email: "nova-fixture@example.com",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { full_name: "Launch Tester" },
  app_metadata: { provider: "email", providers: ["email"] },
  created_at: new Date().toISOString(),
};
const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
const chats = [],
  turns = new Map(),
  plans = new Map();
let holdSlow,
  audioCaptures = 0;
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
async function shot(name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    `overflow ${name}`,
  );
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
}
async function idle() {
  await page.getByRole("status").filter({ hasText: "Simulation only" }).waitFor();
}
async function send(text) {
  await idle();
  await page.getByRole("textbox", { name: "Message Nova" }).fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.locator(".nova-turn.user").filter({ hasText: text }).last().waitFor();
}
try {
  for (const path of ["actions", "message", "audio", "conversations"])
    assert.equal(
      (await context.request.post(`${base}/api/nova/${path}`, { data: {} })).status(),
      401,
    );
  for (const path of [
    "/",
    "/room/ROOM123",
    "/agents",
    "/agents/nova",
    "/developers/agents",
    "/developers/sandbox",
    "/developers/builder",
  ]) {
    const r = await context.request.get(`${base}${path}`, { maxRedirects: 0 });
    assert.equal(r.status(), 307, path);
    assert.ok(r.headers().location.endsWith("/nova"));
  }
  await page.route("**/auth/v1/**", (route) =>
    json(
      route,
      route.request().url().includes("/user")
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
  await page.route("**/rest/v1/**", (route) => json(route, []));
  await page.route("**/api/nova/conversations**", (route) => {
    const req = route.request(),
      id = new URL(req.url()).searchParams.get("id");
    if (req.method() === "POST") {
      const c = {
        id: randomUUID(),
        title: "New conversation",
        updated_at: new Date().toISOString(),
      };
      chats.unshift(c);
      turns.set(c.id, []);
      return json(route, { conversation: c });
    }
    if (req.method() === "PATCH") {
      const b = req.postDataJSON();
      chats.find((c) => c.id === b.id).title = b.title;
      return json(route, { ok: true });
    }
    return json(
      route,
      id
        ? {
            conversation: chats.find((c) => c.id === id),
            messages: turns.get(id),
            plans: [...plans.values()].filter((p) => p.conversationId === id),
          }
        : { conversations: chats },
    );
  });
  await page.route("**/api/nova/message", async (route) => {
    const b = route.request().postDataJSON();
    if (route.request().method() === "DELETE") return json(route, { ok: true });
    for (const p of plans.values())
      if (p.conversationId === b.conversationId && p.status === "pending") p.status = "superseded";
    const messages = turns.get(b.conversationId);
    messages.push({ id: b.requestId, role: "user", text: b.text, blocks: [] });
    if (b.text === "A slow reply") {
      await new Promise((resolve) => {
        holdSlow = resolve;
      });
      return route
        .fulfill({
          contentType: "application/x-ndjson",
          body: JSON.stringify({ type: "text", delta: "LATE CANCELLED REPLY" }) + "\n",
        })
        .catch(() => {});
    }
    const intent = understandIntent(b.text),
      blocks = [];
    let text =
      intent.clarification ||
      "A blockchain is a shared record. This is a fixture reply, not a live model response.";
    if (intent.action) {
      const plan = createPlan(b.conversationId, intent.action);
      plans.set(plan.id, { ...plan, result: null });
      blocks.push({ type: "action_plan", plan });
      text = "Review this simulation. No funds move.";
    }
    const turn = { id: randomUUID(), role: "nova", text, blocks };
    messages.push(turn);
    await route.fulfill({
      contentType: "application/x-ndjson",
      body:
        [
          { type: "state", state: "thinking" },
          { type: "text", delta: text.slice(0, 10) },
          { type: "text", delta: text.slice(10) },
          { type: "complete", blocks },
        ]
          .map(JSON.stringify)
          .join("\n") + "\n",
    });
  });
  await page.route("**/api/nova/actions", (route) => {
    const b = route.request().postDataJSON(),
      p = plans.get(b.id);
    if (!p || p.hash !== b.hash || p.approvalToken !== b.approvalToken)
      return json(route, { error: "Approval does not match plan." }, 409);
    if (p.result) return json(route, p.result);
    if (p.status !== "pending" || Date.parse(p.quote.expiresAt) <= Date.now())
      return json(
        route,
        { error: "This approval is expired, changed or no longer available. Request a new plan." },
        409,
      );
    p.status = b.operation === "cancel" ? "cancelled" : "executed";
    if (p.status === "cancelled") return json(route, { cancelled: true });
    p.result = {
      mode: "simulation",
      planId: p.id,
      message: "Simulation completed. No funds moved and no transaction was submitted.",
      transactionSignature: null,
    };
    return json(route, p.result);
  });
  await page.route("**/api/nova/audio", (route) => {
    if (route.request().postData()?.includes('name="audio"')) {
      audioCaptures++;
      return json(route, { text: "Explain blockchains" });
    }
    return json(route, { error: "Voice playback unavailable in browser fixture." }, 503);
  });
  await page.goto(`${base}/`);
  await page.waitForURL(/\/login/);
  await shot("login-desktop");
  await page.locator("input[type=email]").fill(user.email);
  await page.locator("input[type=password]").fill("fixture-password");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(`${base}/nova`);
  await page.getByRole("heading", { name: /What do you want/ }).waitFor();
  await shot("nova-desktop-light");
  await page.reload();
  await page.getByRole("heading", { name: /What do you want/ }).waitFor();
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await idle();
  await send("Explain blockchains");
  await idle();
  await page.locator(".nova-turn.nova").filter({ hasText: "shared record" }).waitFor();
  await page.getByRole("button", { name: "Rename conversation" }).click();
  await page.getByRole("textbox", { name: "Conversation title" }).fill("On-chain ideas");
  await page.getByRole("button", { name: "Save title" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await send("Swap 1 SOL to USDC");
  await idle();
  await page.getByRole("button", { name: "Approve simulation" }).click();
  await page
    .getByText("Simulation completed. No funds moved and no transaction was submitted.", {
      exact: true,
    })
    .waitFor();
  const executed = [...plans.values()].find((p) => p.status === "executed");
  const repeat = await page.evaluate(
    async (b) =>
      (
        await fetch("/api/nova/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b),
        })
      ).json(),
    {
      id: executed.id,
      hash: executed.hash,
      approvalToken: executed.approvalToken,
      operation: "approve",
    },
  );
  assert.deepEqual(repeat, executed.result);
  await send("Open a 3x SOL long with 100 USDC");
  await idle();
  await page.getByRole("heading", { name: "Review SOL position" }).waitFor();
  await shot("nova-desktop-plan");
  await page.getByRole("button", { name: "Approve simulation" }).click();
  await idle();
  await send("Swap 2 SOL to USDC");
  await idle();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByText("Cancelled. Request a new plan to continue.", { exact: true }).waitFor();
  await send("Swap 3 SOL to USDC");
  await idle();
  await page.getByRole("button", { name: "Modify", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Message Nova"]').value === "Swap 3 SOL to USDC",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Message Nova" }).inputValue(),
    "Swap 3 SOL to USDC",
  );
  await send("Swap 4 SOL to USDC");
  await idle();
  await send("okay");
  await idle();
  await page.getByText("Replaced by a newer request. Approval invalidated.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Approve simulation" }).count(), 0);
  await send("Swap 5 SOL to USDC");
  await idle();
  [...plans.values()].find((p) => p.status === "pending").quote.expiresAt = "2000-01-01";
  await page.getByRole("button", { name: "Approve simulation" }).click();
  await page.getByRole("alert").filter({ hasText: "expired" }).waitFor();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await send("Transfer all funds using an unknown protocol");
  await idle();
  await page
    .locator(".nova-turn.nova")
    .last()
    .getByText(/No balances, market quotes/)
    .waitFor();
  await send("A slow reply");
  await page.getByRole("button", { name: "Cancel response" }).waitFor();
  while (!holdSlow) await new Promise((resolve) => setTimeout(resolve, 10));
  await page.getByRole("button", { name: "Cancel response" }).click();
  holdSlow();
  await idle();
  assert.equal(await page.getByText("LATE CANCELLED REPLY").count(), 0);
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await page.getByRole("heading", { name: /What do you want/ }).waitFor();
  await page.getByRole("button", { name: "Conversation history", exact: true }).click();
  await page.getByRole("button", { name: "On-chain ideas", exact: true }).click();
  await page.locator(".nova-turn.user").filter({ hasText: "Explain blockchains" }).waitFor();
  await page.getByRole("button", { name: "Account and wallet", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Solana address" })
    .fill("11111111111111111111111111111111");
  await page.getByRole("button", { name: "Use read-only address" }).click();
  await page.getByRole("button", { name: "1111…1111", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("nova-mobile-light");
  await page.getByRole("button", { name: /Switch to dark/ }).click();
  await shot("nova-mobile-dark");
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await idle();
  await shot("nova-mobile-empty-dark");
  await page.setViewportSize({ width: 390, height: 500 });
  await page.getByRole("textbox", { name: "Message Nova" }).focus();
  const composer = await page.locator(".nova-composer").boundingBox();
  assert.ok(composer.y + composer.height <= 500);
  await shot("nova-mobile-keyboard-height");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Talk to Nova", exact: true }).click();
  await page.getByText("Listening · pause to send", { exact: true }).waitFor();
  await shot("nova-mobile-capture");
  await page.getByRole("button", { name: "Cancel response" }).click();
  await idle();
  await page.getByRole("button", { name: "Talk to Nova", exact: true }).click();
  await page.waitForTimeout(1000); // Allow MediaRecorder to produce a real fake-device chunk.
  await page.getByRole("button", { name: "Stop recording and send" }).click();
  await page.getByRole("alert").filter({ hasText: "Voice playback unavailable" }).waitFor();
  assert.equal(audioCaptures, 1);
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await send("Swap 1 SOL to USDC");
  await idle();
  await shot("nova-mobile-approval-dark");
  await page.reload();
  await page.getByRole("heading", { name: /What do you want/ }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Nova launch auth refresh, redirects, history/rename/restore, text NDJSON, swap/perp approvals, cancellation, mutation, stale/duplicate UI, wallet context, voice capture, mobile/light/dark. Fixture providers; no real funds or live Supabase calls.",
  );
} finally {
  await browser.close();
}
