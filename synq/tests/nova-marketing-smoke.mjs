import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.env.MARKETING_SMOKE_URL || "http://localhost:4173";
const dir = process.env.SMOKE_ARTIFACTS || "/private/tmp/synq-nova-launch-smoke";
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(base);
    await page.getByRole("heading", { name: "Nova", exact: true }).waitFor();
    assert.ok(
      (await page.getByRole("link", { name: "Talk to Nova" }).getAttribute("href")).endsWith(
        "/nova",
      ),
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({
      path: `${dir}/marketing-${name}-light.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: /Switch to dark/ }).click();
    await page.screenshot({
      path: `${dir}/marketing-${name}-dark.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: /Switch to light/ }).click();
  }
  await page.goto(`${base}/developers/docs`);
  await page.waitForURL(`${base}/`);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: marketing launch homepage, Nova CTA, old page redirect, desktop/mobile, light/dark, no overflow.",
  );
} finally {
  await browser.close();
}
