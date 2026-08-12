import assert from "node:assert/strict";
import test from "node:test";

import { canTransitionPaymentStatus } from "./payment-types";
import { stripeIdempotencyKey } from "./stripe";
import {
  MAX_SUPPORT_PAYMENT_AMOUNT,
  MIN_SUPPORT_PAYMENT_AMOUNT,
  PaymentValidationError,
  requireAuthenticatedUser,
  validatePaymentProvider,
  validateSupportPaymentRequest,
} from "./payment-validation";

test("accepts valid SEK amounts expressed in integer minor units", () => {
  assert.deepEqual(
    validateSupportPaymentRequest({
      amount: 10_000,
      currency: "SEK",
      frequency: "once",
    }),
    {
      amount: 10_000,
      currency: "SEK",
      frequency: "once",
    },
  );
});

test("accepts both supported frequencies", () => {
  for (const frequency of ["once", "monthly"]) {
    assert.equal(
      validateSupportPaymentRequest({ amount: MIN_SUPPORT_PAYMENT_AMOUNT, currency: "SEK", frequency }).frequency,
      frequency,
    );
  }
});

test("rejects non-integer, unsafe, non-positive, and out-of-range amounts", () => {
  const invalidAmounts = [100.5, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, MIN_SUPPORT_PAYMENT_AMOUNT - 1, MAX_SUPPORT_PAYMENT_AMOUNT + 1];

  for (const amount of invalidAmounts) {
    assert.throws(
      () => validateSupportPaymentRequest({ amount, currency: "SEK", frequency: "once" }),
      PaymentValidationError,
    );
  }
});

test("rejects unsupported currencies and frequencies", () => {
  assert.throws(
    () => validateSupportPaymentRequest({ amount: 10_000, currency: "EUR", frequency: "once" }),
    /Unsupported payment currency/,
  );
  assert.throws(
    () => validateSupportPaymentRequest({ amount: 10_000, currency: "SEK", frequency: "weekly" }),
    /Unsupported payment frequency/,
  );
});

test("rejects client-controlled identity and status fields", () => {
  assert.throws(
    () => validateSupportPaymentRequest({ amount: 10_000, currency: "SEK", frequency: "once", userId: "other-user" }),
    /unsupported fields/,
  );
  assert.throws(
    () => validateSupportPaymentRequest({ amount: 10_000, currency: "SEK", frequency: "once", status: "succeeded" }),
    /unsupported fields/,
  );
});

test("requires Firebase Authentication as the user identity source", () => {
  assert.equal(requireAuthenticatedUser({ uid: "firebase-user" }), "firebase-user");
  assert.throws(() => requireAuthenticatedUser(undefined), /Firebase Authentication is required/);
  assert.throws(() => requireAuthenticatedUser({ uid: "" }), /Firebase Authentication is required/);
});

test("validates evolvable provider values", () => {
  assert.equal(validatePaymentProvider("stripe"), "stripe");
  assert.equal(validatePaymentProvider("apple_iap"), "apple_iap");
  assert.equal(validatePaymentProvider("external"), "external");
  assert.throws(() => validatePaymentProvider("unknown"), /Unsupported payment provider/);
});

test("only permits forward payment lifecycle transitions", () => {
  assert.equal(canTransitionPaymentStatus("created", "processing"), true);
  assert.equal(canTransitionPaymentStatus("processing", "succeeded"), true);
  assert.equal(canTransitionPaymentStatus("succeeded", "refunded"), true);
  assert.equal(canTransitionPaymentStatus("succeeded", "processing"), false);
  assert.equal(canTransitionPaymentStatus("refunded", "succeeded"), false);
});

test("derives provider idempotency from a server-generated payment attempt id", () => {
  assert.equal(stripeIdempotencyKey("firestore_document_id"), "support_payment:firestore_document_id");
  assert.throws(() => stripeIdempotencyKey("client editable value"), /Invalid server-generated payment attempt identifier/);
});
