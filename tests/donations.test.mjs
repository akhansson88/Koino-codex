import assert from "node:assert/strict";
import test from "node:test";

import { parseDonation } from "../netlify/lib/donation-shared.mjs";
import donationCheckout from "../netlify/functions/donation-checkout.mjs";
import donationReturn from "../netlify/functions/donation-return.mjs";

test("accepts supported donation boundaries and frequencies", () => {
  assert.deepEqual(parseDonation({ amountSek: 10, frequency: "one_time", platform: "web" }), {
    amountSek: 10,
    frequency: "one_time",
    platform: "web",
  });
  assert.equal(parseDonation({ amountSek: 100000, frequency: "monthly", platform: "native" }).amountSek, 100000);
});

test("rejects malformed or tampered donation values", () => {
  for (const amountSek of [undefined, "100", 9, 100001, 10.5, Number.NaN]) {
    assert.throws(() => parseDonation({ amountSek, frequency: "one_time", platform: "web" }));
  }
  assert.throws(() => parseDonation({ amountSek: 100, frequency: "weekly", platform: "web" }));
  assert.throws(() => parseDonation({ amountSek: 100, frequency: "one_time", platform: "desktop" }));
});

test("checkout rejects unauthenticated requests without touching Stripe", async () => {
  const response = await donationCheckout(new Request("https://example.test/api/donations/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountSek: 100, frequency: "one_time", platform: "web" }),
  }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("native return only emits allowlisted app routes", async () => {
  const success = await donationReturn(new Request("https://example.test/.netlify/functions/donation-return?result=success&session_id=cs_test_123"));
  assert.match(await success.text(), /koino:\/\/donation-thank-you\?session_id=cs_test_123/);

  const untrusted = await donationReturn(new Request("https://example.test/.netlify/functions/donation-return?result=https%3A%2F%2Fevil.test"));
  assert.match(await untrusted.text(), /koino:\/\/donation-confirm/);
});
