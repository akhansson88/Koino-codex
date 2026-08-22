import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";

export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

const STRIPE_TEST_SECRET_PREFIX = "sk_test_";
let stripeServer: Stripe | undefined;

export function getStripeServer(): Stripe {
  if (stripeServer) return stripeServer;

  const secretKey = stripeSecretKey.value();
  if (!secretKey.startsWith(STRIPE_TEST_SECRET_PREFIX)) {
    throw new Error("KOINO payments require a Stripe test-mode secret key.");
  }

  stripeServer = new Stripe(secretKey);
  return stripeServer;
}

export function stripeIdempotencyKey(paymentAttemptId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(paymentAttemptId)) {
    throw new Error("Invalid server-generated payment attempt identifier.");
  }

  return `support_payment:${paymentAttemptId}`;
}
