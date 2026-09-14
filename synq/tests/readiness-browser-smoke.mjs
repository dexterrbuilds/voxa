// Explicit UI fixture only. No credentials, SQL migrations, wallet or protocol calls.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("./register.cjs");
const { build } = require("esbuild");
const { chromium } = require("playwright");
const { dexterPlanningDemo } = require("../app/lib/server/nova-launch/planning-demo.ts");
const out = "/private/tmp/synq-readiness-smoke",
  base = process.env.SMOKE_URL || "http://localhost:3000";
await mkdir(out, { recursive: true });
await build({
  entryPoints: ["tests/fixtures/planner-entry.jsx"],
  outfile: join(out, "app.js"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  alias: { "@": resolve("app") },
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "warning",
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let server;
try {
  await page.goto(base + "/login?next=%2Fnova");
  await page.getByRole("heading", { name: "Welcome to Synq" }).waitFor();
  await page
    .getByRole("alert")
    .filter({ hasText: "Privy authentication is not configured" })
    .waitFor();
  assert.equal(await page.locator("input[type=password]").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Continue with email" }).isDisabled(), true);
  await page.waitForFunction(() => {
    const panel = document.querySelector(".glacier-auth-panel");
    return panel && getComputedStyle(panel).opacity === "1";
  });
  await page.screenshot({
    path: join(out, "login-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(out, "login-mobile.png"), fullPage: true });
  await page.goto(base + "/nova");
  await page
    .getByRole("alert")
    .filter({ hasText: "Privy authentication is not configured" })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/nova");
  const styles = await page
    .locator("link[rel=stylesheet]")
    .evaluateAll((nodes) => nodes.map((n) => n.href));
  const css = (await Promise.all(styles.map(async (url) => (await fetch(url)).text()))).join("\n");
  const plan = dexterPlanningDemo(randomUUID(), randomUUID());
  server = createServer(async (req, res) => {
    if (req.url === "/app.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(await readFile(join(out, "app.js")));
      return;
    }
    if (req.url === "/base.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(css);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<html><head><link rel="stylesheet" href="/base.css"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="synq-app"><div id="root"></div><script>window.__planningFixture=${JSON.stringify(plan).replaceAll("<", "\\u003c")}</script><script type="module" src="/app.js"></script></body></html>`,
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "Show example plan" }).click();
  await page.getByText("Execution not enabled yet.", { exact: false }).waitFor();
  assert.equal(
    await page.getByRole("region", { name: "Nova planning preview" }).locator("li").count(),
    7,
  );
  assert.equal(
    await page.getByRole("button", { name: /approve|execute|sign transaction/i }).count(),
    0,
  );
  await page.getByText("Plan details", { exact: true }).nth(1).click();
  await page.getByText("Awaiting launch: mint", { exact: true }).waitFor();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        localStorage.setItem("synq-theme", theme);
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.toggle("dark", theme === "dark");
      }, theme);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      await page.screenshot({ path: join(out, `plan-${width}-${theme}.png`), fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Privy-primary unconfigured login, no legacy form or redirect loop; seven-step non-executing graph, typed references, mobile/desktop light/dark. Fixtures only; no migrations or providers.",
  );
} finally {
  await browser.close();
  if (server) await new Promise((r) => server.close(r));
}
