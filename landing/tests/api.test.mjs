import { test } from "node:test";
import assert from "node:assert/strict";

const endpoint =
  process.env.TEST_API_URL || "http://127.0.0.1:5174/api/waitlist.php";
test("PHP rejects bad methods, foreign origins, malformed input and spam", async () => {
  const cases = [
    [{ method: "GET" }, 405],
    [
      { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" },
      415,
    ],
    [
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: "{}",
      },
      403,
    ],
    ...[
      "{",
      "null",
      "[]",
      '{"email":[]}',
      '{"email":"wrong"}',
      '{"email":"emma@example.com"}',
      '{"email":"emma@example.com","device":"windows","website":""}',
      '{"email":"emma@example.com","website":"spam"}',
      '{"email":"emma@example.com","device":"ios","website":"spam"}',
      '{"email":"emma@example.com","device":"ios","website":[]}',
    ].map((body) => [
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      422,
    ]),
    [
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a".repeat(2100) }),
      },
      413,
    ],
  ];
  for (const [options, expected] of cases) {
    const response = await fetch(endpoint, options);
    assert.equal(response.status, expected);
    assert.deepEqual(await response.json(), { ok: false });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("unconfigured database returns a generic failure, not success or credentials", async () => {
  // Run only against a local endpoint without production configuration.
  if (!endpoint.startsWith("http://127.0.0.1:")) return;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"email":"emma@example.com","device":"ios","website":""}',
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false });
});

test("admin endpoints reject unauthenticated and cross-origin requests", async () => {
  const adminBase = new URL("admin/", endpoint).toString();
  for (const file of ["session.php", "overview.php", "registrations.php", "export.php?platform=google-play"]) {
    const response = await fetch(new URL(file, adminBase));
    assert.equal(response.status, 401, file);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("vary"), "Cookie");
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "unauthorized");
  }

  const login = await fetch(new URL("login.php", adminBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "operator", password: "not-a-real-password" }),
  });
  assert.equal(login.status, 403);
  assert.deepEqual(await login.json(), { ok: false });

  const logout = await fetch(new URL("logout.php", adminBase), { method: "GET" });
  assert.equal(logout.status, 405);
  assert.equal(logout.headers.get("allow"), "POST");
});
