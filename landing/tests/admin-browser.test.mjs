import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
test.after(async () => browser.close());

const adminOverview = {
  ok: true,
  generatedAt: "2026-09-10T10:00:00+00:00",
  timezone: "Europe/Stockholm",
  counts: { total: 3, ios: 1, android: 1, unknown: 1 },
  daily: [
    { date: "2026-09-08", total: 1, ios: 1, android: 0 },
    { date: "2026-09-09", total: 0, ios: 0, android: 0 },
    { date: "2026-09-10", total: 2, ios: 0, android: 1 },
  ],
};

const registrationsByFilter = {
  all: [
    { id: 3, email: "unknown@example.com", device: "unknown", createdAt: "2026-09-10T12:00:00+02:00" },
    { id: 2, email: "android@example.com", device: "android", createdAt: "2026-09-10T11:00:00+02:00" },
    { id: 1, email: "ios@example.com", device: "ios", createdAt: "2026-09-08T09:00:00+02:00" },
  ],
  ios: [{ id: 1, email: "ios@example.com", device: "ios", createdAt: "2026-09-08T09:00:00+02:00" }],
  android: [{ id: 2, email: "android@example.com", device: "android", createdAt: "2026-09-10T11:00:00+02:00" }],
  unknown: [{ id: 3, email: "unknown@example.com", device: "unknown", createdAt: "2026-09-10T12:00:00+02:00" }],
};

function registrationPage(filter) {
  const items = registrationsByFilter[filter];
  return { ok: true, filter, page: 1, pageSize: 50, total: items.length, totalPages: 1, items };
}

async function routeAuthenticatedAdmin(page) {
  await page.route("**/api/admin/session.php", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        user: { username: "operator" },
        csrfToken: "test-csrf",
        expiresAt: "2026-09-10T18:00:00+00:00",
      }),
    }),
  );
  await page.route("**/api/admin/overview.php", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(adminOverview) }),
  );
  await page.route("**/api/admin/registrations.php**", (route) => {
    const filter = new URL(route.request().url()).searchParams.get("device") || "all";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(registrationPage(filter)) });
  });
}

test("admin direct route restores session, renders chart and filters table", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await routeAuthenticatedAdmin(page);
  await page.goto(base + "/stats777");
  await page.getByText("Totalt på väntelistan").waitFor();
  assert.equal(await page.title(), "Koino · Statistik");
  assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
  assert.ok((await page.getByText("3", { exact: true }).count()) > 0);
  assert.deepEqual(
    (await page.locator(".recharts-legend-item-text").allTextContents()).sort(),
    ["Android", "Totalt", "iOS"],
   );
  assert.equal(await page.getByText("unknown@example.com", { exact: true }).isVisible(), true);

  await page.getByRole("tab", { name: "Android" }).click();
  assert.equal(await page.getByText("android@example.com", { exact: true }).isVisible(), true);
  assert.equal(await page.getByText("unknown@example.com", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Google Play CSV" }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "TestFlight CSV" }).count(), 0);

  await page.getByRole("tab", { name: "Okänd" }).click();
  assert.equal(await page.getByText("unknown@example.com", { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: /CSV/ }).count(), 0);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 1280);

  await page.reload();
  await page.getByText("Totalt på väntelistan").waitFor();
  await page.close();
});

test("admin login handles invalid credentials, rate limits and success", async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" });
  await page.route("**/api/admin/session.php", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: '{"ok":false,"code":"unauthorized"}' }),
  );
  let loginStatus = 401;
  await page.route("**/api/admin/login.php", (route) => {
    const payload = route.request().postDataJSON();
    assert.equal(payload.username, "operator");
    assert.equal(payload.password, "test-password-value");
    if (loginStatus !== 200) {
      return route.fulfill({
        status: loginStatus,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, code: loginStatus === 429 ? "rate_limited" : "invalid_credentials" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true,"user":{"username":"operator"},"csrfToken":"test-csrf","expiresAt":"2026-09-10T18:00:00+00:00"}',
    });
  });
  await page.route("**/api/admin/overview.php", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(adminOverview) }),
  );
  await page.route("**/api/admin/registrations.php**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(registrationPage("all")) }),
  );

  await page.goto(base + "/stats777");
  await page.getByLabel("Användarnamn").fill("operator");
  await page.getByLabel("Lösenord").fill("test-password-value");
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.getByText(/Inloggningen misslyckades/).waitFor();
  loginStatus = 429;
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.getByText(/För många inloggningsförsök/).waitFor();
  loginStatus = 200;
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.getByText("Totalt på väntelistan").waitFor();
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await page.close();
});

test("admin exports use platform-specific downloads", async () => {
  const page = await browser.newPage();
  await routeAuthenticatedAdmin(page);
  await page.route("**/api/admin/export.php?platform=google-play", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/csv; charset=utf-8",
      headers: { "Content-Disposition": 'attachment; filename="koino-google-play-testers-2026-09-10.csv"' },
      body: "android@example.com\r\n",
    }),
  );
  await page.route("**/api/admin/export.php?platform=testflight", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/csv; charset=utf-8",
      headers: { "Content-Disposition": 'attachment; filename="koino-testflight-testers-2026-09-10.csv"' },
      body: "First Name,Last Name,Email Address\r\n,,ios@example.com\r\n",
    }),
  );

  await page.goto(base + "/stats777");
  await page.getByText("Totalt på väntelistan").waitFor();
  const [googleDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Google Play CSV" }).click(),
  ]);
  assert.equal(googleDownload.suggestedFilename(), "koino-google-play-testers-2026-09-10.csv");
  const [appleDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "TestFlight CSV" }).click(),
  ]);
  assert.equal(appleDownload.suggestedFilename(), "koino-testflight-testers-2026-09-10.csv");
  await page.close();
});

test("admin stays within the viewport at supported responsive widths", async () => {
  for (const width of [320, 375, 414, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await routeAuthenticatedAdmin(page);
    await page.goto(base + "/stats777");
    await page.getByText("Totalt på väntelistan").waitFor();
    assert.ok(
      (await page.evaluate(() => document.documentElement.scrollWidth)) <= width,
      `dashboard overflowed at ${width}px`,
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  }
});

test("admin pagination requests the next page", async () => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 800 }, reducedMotion: "reduce" });
  await page.route("**/api/admin/session.php", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true,"user":{"username":"operator"},"csrfToken":"test-csrf","expiresAt":"2026-09-10T18:00:00+00:00"}',
    }),
  );
  await page.route("**/api/admin/overview.php", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(adminOverview) }),
  );
  await page.route("**/api/admin/registrations.php**", (route) => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get("page") || "1");
    const item = requestedPage === 1
      ? { id: 51, email: "newest@example.com", device: "ios", createdAt: "2026-09-10T12:00:00+02:00" }
      : { id: 1, email: "oldest@example.com", device: "android", createdAt: "2026-09-01T12:00:00+02:00" };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, filter: "all", page: requestedPage, pageSize: 50, total: 51, totalPages: 2, items: [item] }),
    });
  });

  await page.goto(base + "/stats777");
  await page.getByText("newest@example.com", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Nästa" }).click();
  await page.getByText("oldest@example.com", { exact: true }).waitFor();
  assert.equal(await page.getByText("Sida 2 av 2", { exact: true }).isVisible(), true);
  await page.close();
});

test("admin logout sends the CSRF token and returns to login", async () => {
  const page = await browser.newPage();
  await routeAuthenticatedAdmin(page);
  let logoutCalled = false;
  await page.route("**/api/admin/logout.php", (route) => {
    logoutCalled = true;
    assert.equal(route.request().method(), "POST");
    assert.equal(route.request().headers()["x-csrf-token"], "test-csrf");
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });

  await page.goto(base + "/stats777");
  await page.getByText("Totalt på väntelistan").waitFor();
  await page.getByRole("button", { name: "Logga ut" }).click();
  await page.getByRole("button", { name: "Logga in" }).waitFor();
  assert.equal(logoutCalled, true);
  await page.close();
});

test("admin returns to login when an authenticated request expires", async () => {
  const page = await browser.newPage();
  await page.route("**/api/admin/session.php", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true,"user":{"username":"operator"},"csrfToken":"test-csrf","expiresAt":"2026-09-10T18:00:00+00:00"}',
    }),
  );
  await page.route("**/api/admin/overview.php", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: '{"ok":false,"code":"unauthorized"}' }),
  );
  await page.route("**/api/admin/registrations.php**", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: '{"ok":false,"code":"unauthorized"}' }),
  );

  await page.goto(base + "/stats777");
  await page.getByText("Sessionen har gått ut. Logga in igen.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Logga in" }).isVisible(), true);
  await page.close();
});
