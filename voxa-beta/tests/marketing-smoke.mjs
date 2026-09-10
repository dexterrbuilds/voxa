// Public marketing checks only. No account or production writes.
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.MARKETING_SMOKE_URL || "http://localhost:4173";
const artifacts = process.env.SMOKE_ARTIFACTS || "/private/tmp/synq-marketing-smoke";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(base);
    await page.getByRole("heading", { name: "Synq", exact: true }).waitFor();
    await page.locator('img[src="/synq-room.jpg"]').evaluate(async (image) => {
      await image.decode();
      if (!image.naturalWidth) throw new Error("Room image missing");
    });
    assert.equal(await page.getByText(/\bVoxa\b/).count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    if (width === 390) {
      assert.equal(await page.locator(".synq-nav").isVisible(), false);
      await page.getByRole("button", { name: "Toggle menu" }).click();
    }
    for (const theme of ["dark", "light"]) {
      const switcher = page.getByRole("button", { name: `Switch to ${theme} mode` });
      if (await switcher.isVisible()) await switcher.click();
      if (width === 390) await page.getByRole("button", { name: "Toggle menu" }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${artifacts}/home-${width}-${theme}.png`, fullPage: false });
      if (width === 390) await page.getByRole("button", { name: "Toggle menu" }).click();
    }
    if (width === 390) await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.reload();
    assert.equal(await page.evaluate(() => localStorage.getItem("voxa-theme")), "light");
    for (const path of ["/product", "/developers", "/developers/docs", "/developers/access"]) {
      await page.goto(`${base}${path}`);
      await page.locator("h1").waitFor();
      assert.equal(await page.getByText(/\bVoxa\b/).count(), 0, path);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        path,
      );
      await page.screenshot({
        path: `${artifacts}/${path.replaceAll("/", "-")}-${width}.png`,
        fullPage: false,
      });
    }
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: marketing routes, Synq branding, room asset, responsive navigation, theme refresh and overflow.",
  );
  console.log(`Screenshots: ${artifacts}`);
} finally {
  await browser.close();
}
