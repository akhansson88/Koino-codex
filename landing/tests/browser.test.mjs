import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
await mkdir(".local/screenshots", { recursive: true });
test.after(async () => browser.close());

test("responsive layouts fit, desktop has no scrolling, no console errors", async () => {
  for (const [width, height] of [
    [1366, 768],
    [1519, 667],
    [1440, 900],
    [320, 740],
    [375, 812],
    [414, 896],
    [768, 1024],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    const size = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    assert.ok(
      size.width <= width,
      `${width}: horizontal overflow ${size.width}`,
    );
    if (width >= 1000)
      assert.ok(
        size.height <= height,
        `${width}: desktop overflow ${size.height}`,
      );
    const signup = await page
      .getByRole("button", { name: "Gå med i väntelistan" })
      .boundingBox();
    assert.ok(
      signup.y + signup.height <= height,
      `${width}: signup below fold`,
    );
    const prayer = await page
      .locator(".prayer-card")
      .evaluate((el) => el.offsetTop + el.offsetHeight);
    const nav = await page.locator(".app-nav").evaluate((el) => el.offsetTop);
    assert.ok(
      prayer <= nav,
      `${width}: phone preview content overlaps navigation`,
    );
    await page.screenshot({
      path: `.local/screenshots/${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test("signup loading, normalized payload, success and double-click protection", async () => {
  const page = await browser.newPage();
  await page.goto(base);
  let calls = 0;
  await page.route("**/api/waitlist.php", async (route) => {
    calls++;
    assert.equal(route.request().postDataJSON().email, "emma@example.com");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });
  await page.getByLabel("Din e-postadress").fill("emma@example.com");
  await page.getByLabel("iOS").check();
  await page.getByRole("button", { name: "Gå med i väntelistan" }).click();
  assert.equal(
    await page.getByRole("button", { name: "Sparar" }).isDisabled(),
    true,
  );
  await page.getByRole("status").waitFor();
  assert.equal(calls, 1);
  await page.close();
});

test("failed storage and rate limits never show success; retry works", async () => {
  for (const status of [503, 429, 422]) {
    const page = await browser.newPage();
    await page.goto(base);
    await page.route("**/api/waitlist.php", (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: '{"ok":false}',
      }),
    );
    await page.getByLabel("Din e-postadress").fill("emma@example.com");
    await page.getByLabel("Android").check();
    await page.getByRole("button", { name: "Gå med i väntelistan" }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByRole("status").count(), 0);
    await page.unroute("**/api/waitlist.php");
    await page.route("**/api/waitlist.php", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"ok":true}',
      }),
    );
    await page.getByRole("button", { name: "Gå med i väntelistan" }).click();
    await page.getByRole("status").waitFor();
    await page.close();
  }
});

test("malformed server replies never show success", async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await page.route("**/api/waitlist.php", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html>Server error</html>",
    }),
  );
  await page.getByLabel("Din e-postadress").fill("emma@example.com");
  await page.getByLabel("iOS").check();
  await page.getByRole("button", { name: "Gå med i väntelistan" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("status").count(), 0);
  await page.close();
});

test("network error and invalid email; privacy dialog works by keyboard", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await page.goto(base);
  await page.getByLabel("Din e-postadress").fill("invalid");
  assert.equal(
    await page
      .getByLabel("Din e-postadress")
      .evaluate((el) => el.checkValidity()),
    false,
  );
  await page.route("**/api/waitlist.php", (route) => route.abort());
  await page.getByLabel("Din e-postadress").fill("emma@example.com");
  await page.getByLabel("Android").check();
  await page.getByRole("button", { name: "Gå med i väntelistan" }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "Integritet", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("dialog").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").isVisible(), false);
  assert.equal(
    await page
      .locator(".phone-float")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.close();
});
