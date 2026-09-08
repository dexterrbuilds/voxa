// Controlled browser fixtures: never registers agents, signs up users or writes
// production Supabase data. Real route handlers are covered by routes.test.cjs.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.env.SMOKE_URL || "http://localhost:3100";
const artifacts = process.env.SMOKE_ARTIFACTS || "/private/tmp/voxa-smoke";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SMOKE_BROWSER_CHANNEL ? { channel: process.env.SMOKE_BROWSER_CHANNEL } : {}),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const owner = "00000000-0000-4000-8000-000000000010";
const user = {
  id: owner,
  email: "smoke@example.com",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { full_name: "Smoke Tester" },
  app_metadata: { provider: "email", providers: ["email"] },
  created_at: new Date().toISOString(),
};
const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
const fixtureAgents = ["Research", "Code"].map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 1}`,
  slug: name.toLowerCase(),
  name,
  description: `${name} agent`,
  endpointUrl: "https://example.com/voxa/handshake",
  status: "approved",
  verificationStatus: "verified",
  visibility: "private",
  permissions: ["room_text_reply", "memory_read_thread", "memory_write_thread"],
  capabilities: ["web_search"],
  tags: [],
  importSource: "custom_endpoint",
  importMetadata: {},
  metadata: {},
  createdAt: new Date().toISOString(),
}));
let externalInRoom = false;
let registrationPayload;
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
async function screenshot(name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    `horizontal overflow: ${name}`,
  );
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
}
try {
  for (const path of ["discover", "sandbox/message", "room/message", "room/invite"]) {
    const response = await context.request.post(`${base}/api/agents/${path}`, { data: {} });
    assert.equal(response.status(), 401, `unauthenticated ${path}`);
  }
  await page.goto(`${base}/agents`);
  await page.getByRole("heading", { name: "Explore agents" }).waitFor();
  await screenshot("directory-mobile-light");
  await page
    .getByRole("textbox", { name: "Search agents and developers" })
    .fill("not-a-real-agent");
  await page.getByText("No agents match that search yet.").waitFor();
  await page.goto(`${base}/agents/research-agent`);
  await page.getByText("This first-party agent is planned and is not yet available.").waitFor();
  await page.goto(`${base}/room/ROOM123`);
  await page.waitForURL(/\/login/);

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
  await page.route("**/api/agents", (route) => json(route, { agents: fixtureAgents }));
  await page.route("**/api/agents/register", (route) => {
    registrationPayload = route.request().postDataJSON();
    return json(route, {
      agent: {
        ...fixtureAgents[0],
        ...registrationPayload,
        id: "00000000-0000-4000-8000-000000000099",
        status: "pending_review",
        verificationStatus: "verification_pending",
      },
    });
  });
  await page.route("**/api/developers/profile", (route) =>
    json(route, {
      profile: null,
      suggestedProfile: {
        displayName: "Smoke Tester",
        username: "smoke-tester",
        bio: "",
        avatarUrl: "",
        website: "",
        xHandle: "",
      },
    }),
  );
  await page.route("**/api/agents/discover", (route) =>
    json(route, {
      detected: {
        name: "Detected Agent",
        description: "Detected description",
        capabilities: ["web_search"],
        importSource: "langchain",
        supports: { text: true, tools: true, voice: false },
        protocol: "voxa-agent",
        sdkVersion: "0.1",
      },
      durationMs: 123,
    }),
  );
  await page.route("**/api/agents/room-eligible", (route) =>
    json(route, { enabled: true, agents: [fixtureAgents[0]] }),
  );
  await page.route("**/api/agents/room/invite", (route) => {
    externalInRoom = true;
    return json(route, {
      ok: true,
      participantUserId: `agent:${fixtureAgents[0].id}`,
      agent: fixtureAgents[0],
    });
  });
  const thread = [];
  await page.route("**/api/agents/room/thread?**", (route) => json(route, { turns: thread }));
  await page.route("**/api/agents/room/message", async (route) => {
    const { message } = route.request().postDataJSON();
    if (message === "Slow request") await new Promise((resolve) => setTimeout(resolve, 1000));
    if (message !== "Slow request")
      thread.push(
        { role: "user", text: message, createdAt: new Date().toISOString() },
        { role: "agent", text: "Room reply", createdAt: new Date().toISOString() },
      );
    await json(route, {
      reply: {
        text: message === "Slow request" ? "Cancelled stale reply" : "Room reply",
        tools: [],
      },
    }).catch(() => {});
  });
  await page.route("**/api/livekit/token", (route) =>
    json(route, { error: "Voice is unavailable in this test fixture." }, 503),
  );
  await page.route("**/rest/v1/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/rpc/")) return json(route, null);
    const room = {
      id: "room-db-id",
      room_id: "ROOM123",
      created_by: owner,
      created_at: new Date().toISOString(),
      status: "active",
      ended_at: null,
    };
    const human = {
      id: "participant-db-id",
      room_id: "ROOM123",
      user_id: owner,
      display_name: "Smoke Tester",
      participant_type: "human",
      joined_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };
    const single =
      route.request().headers().accept?.includes("vnd.pgrst.object") ||
      url.searchParams.has("user_id");
    if (url.pathname.endsWith("/rooms")) return json(route, single ? room : [room]);
    if (url.pathname.endsWith("/room_participants"))
      return json(
        route,
        single
          ? human
          : [
              human,
              ...(externalInRoom
                ? [
                    {
                      ...human,
                      id: "agent-db-id",
                      user_id: `agent:${fixtureAgents[0].id}`,
                      display_name: "Research",
                      participant_type: "agent",
                    },
                  ]
                : []),
            ],
      );
    return json(route, []);
  });
  await page.goto(`${base}/login`);
  await page.locator('input[type="email"]').fill("smoke@example.com");
  await page.locator('input[type="password"]').fill("fixture-password");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`${base}/`);
  await page.goto(`${base}/developers/agents`);
  const endpoint = page.getByPlaceholder("https://your-agent.example/voxa/handshake");
  await endpoint.fill("https://example.com/voxa/handshake");
  await page.getByRole("button", { name: "Test connection", exact: true }).first().click();
  await page.getByText("Detected Agent detected").waitFor();
  await page.getByRole("button", { name: "Use detected details" }).click();
  assert.equal(await page.locator('input[value="Detected Agent"]').count(), 1);
  await screenshot("developer-mobile-light");
  await page.evaluate(() => {
    localStorage.setItem("voxa-theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot("developer-desktop-dark");
  const registered = page.waitForResponse("**/api/agents/register");
  await page.getByRole("button", { name: "Register agent", exact: true }).click();
  await registered;
  assert.equal(registrationPayload.importSource, "langchain");
  assert.equal(registrationPayload.status, "pending_review");

  const session = {
    mode: "sandbox",
    isolated: true,
    runtimeReady: false,
    sandboxRoomId: `sandbox:${fixtureAgents.map((a) => a.id).join(",")}:00000000-0000-4000-8000-000000000030`,
    agents: fixtureAgents,
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
  };
  await page.route("**/api/agents/sandbox", (route) => json(route, { session }));
  let sendCount = 0;
  await page.route("**/api/agents/sandbox/message", async (route) => {
    sendCount++;
    if (sendCount === 2)
      return json(
        route,
        { error: "The agent took too long. Try again.", code: "agent_timeout" },
        504,
      );
    return json(route, {
      replies: fixtureAgents.map((agent) => ({
        agentId: agent.id,
        agentName: agent.name,
        ok: true,
        durationMs: 120,
        reply: { text: `Reply from ${agent.name}`, tools: [] },
      })),
    });
  });
  await page.goto(`${base}/developers/sandbox`);
  // Current selector uses checkboxes; choose both eligible agents.
  await page.getByRole("checkbox").first().waitFor();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: /Start.*sandbox|Start.*session/i }).click();
  const message = page.getByRole("textbox", { name: "Message your agent" });
  await message.fill("Hello agents");
  await page.getByRole("button", { name: "Send to all", exact: true }).click();
  await page.getByText("Reply from Research", { exact: true }).waitFor();
  await page.getByText("Reply from Code", { exact: true }).waitFor();
  await message.fill("Try a failed request");
  await page.getByRole("button", { name: "Send to Research", exact: true }).click();
  await page.getByRole("button", { name: "Retry Research", exact: true }).click();
  await page.getByText("Reply from Research", { exact: true }).nth(1).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("sandbox-mobile-dark");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(await page.getByText("Reply from Research", { exact: true }).count(), 0);
  await page.goto(`${base}/room/ROOM123`);
  await page.getByText("Smoke Tester", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Invite (text-only)", exact: true }).click();
  const roomMessage = page.getByRole("textbox", { name: "Message Research", exact: true });
  await roomMessage.fill("Room question");
  await page.getByRole("button", { name: "Send to Research", exact: true }).click();
  await page.getByText("Room reply", { exact: true }).waitFor();
  await roomMessage.fill("Slow request");
  await page.getByRole("button", { name: "Send to Research", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByText("Request stopped. You can try again.", { exact: true }).waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await page.getByText("Cancelled stale reply", { exact: true }).count(), 0);
  await screenshot("room-mobile-dark");
  await page.reload();
  await page.getByText("Smoke Tester", { exact: true }).first().waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: public routes, auth gates, fixture login/refresh, discovery/prefill, multi-agent replies, failed request/retry/reset, room card, mobile/desktop overflow.",
  );
  console.log(`Screenshots: ${artifacts}`);
} finally {
  await browser.close();
}
