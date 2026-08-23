import assert from "node:assert/strict";
import test from "node:test";

import { findCustomer, parseDonation, summarizeDonationStatus } from "../netlify/lib/donation-shared.mjs";
import donationCheckout from "../netlify/functions/donation-checkout.mjs";
import donationReturn from "../netlify/functions/donation-return.mjs";
import donationStatus from "../netlify/functions/donation-status.mjs";

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

test("status rejects unauthenticated requests without touching Stripe", async () => {
  const response = await donationStatus(new Request("https://example.test/api/donations/status", { method: "POST" }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("customer lookup does not create a Stripe customer for a non-donor", async () => {
  let createCalled = false;
  const stripe = {
    customers: {
      create: async () => { createCalled = true; },
      search: async () => ({ data: [] }),
    },
  };
  assert.equal(await findCustomer(stripe, { uid: "new-user" }), null);
  assert.equal(createCalled, false);
});

test("summarizes one-time and recurring donor states without trusting other users", () => {
  const uid = "firebase-user";
  const paidOneTime = {
    client_reference_id: uid,
    metadata: { firebase_uid: uid },
    mode: "payment",
    payment_status: "paid",
    status: "complete",
  };
  assert.deepEqual(summarizeDonationStatus([paidOneTime], [], uid), {
    hasCompletedDonation: true,
    hasSubscriptionHistory: false,
    hasManageableSubscription: false,
  });

  for (const subscriptionStatus of ["active", "trialing", "past_due", "unpaid"]) {
    const monthly = { metadata: { firebase_uid: uid }, status: subscriptionStatus };
    assert.deepEqual(summarizeDonationStatus([{ ...paidOneTime, mode: "subscription" }], [monthly], uid), {
      hasCompletedDonation: true,
      hasSubscriptionHistory: true,
      hasManageableSubscription: true,
    });
  }

  const cancelled = { metadata: { firebase_uid: uid }, status: "canceled" };
  assert.deepEqual(summarizeDonationStatus([{ ...paidOneTime, mode: "subscription" }], [cancelled], uid), {
    hasCompletedDonation: true,
    hasSubscriptionHistory: true,
    hasManageableSubscription: false,
  });
  assert.deepEqual(summarizeDonationStatus([{ ...paidOneTime, client_reference_id: "other", metadata: {} }], [], uid), {
    hasCompletedDonation: false,
    hasSubscriptionHistory: false,
    hasManageableSubscription: false,
  });
});

test("native return only emits allowlisted app routes", async () => {
  const success = await donationReturn(new Request("https://example.test/.netlify/functions/donation-return?result=success&session_id=cs_test_123"));
  assert.match(await success.text(), /koino:\/\/donation-thank-you\?session_id=cs_test_123/);

  const untrusted = await donationReturn(new Request("https://example.test/.netlify/functions/donation-return?result=https%3A%2F%2Fevil.test"));
  assert.match(await untrusted.text(), /koino:\/\/donation-confirm/);
});
