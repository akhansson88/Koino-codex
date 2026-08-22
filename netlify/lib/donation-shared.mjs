import { getApps, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import Stripe from "stripe";

const allowedFrequency = new Set(["one_time", "monthly"]);
const allowedPlatform = new Set(["web", "native"]);

export const corsHeaders = {
  "Access-Control-Allow-Headers": "Accept, Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function appOrigin() {
  return requiredEnvironment("STRIPE_APP_ORIGIN").replace(/\/$/, "");
}

export function stripeClient() {
  return new Stripe(requiredEnvironment("STRIPE_RESTRICTED_KEY"), {
    apiVersion: "2026-07-29.dahlia",
    appInfo: { name: "KOINO Donations", version: "1.0.0" },
  });
}

function firebaseAuth() {
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(requiredEnvironment("FIREBASE_SERVICE_ACCOUNT_JSON"));
    if (typeof serviceAccount.private_key === "string") {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getAuth();
}

export async function authenticatedUser(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error("Authentication required"), { status: 401 });
  try {
    const token = await firebaseAuth().verifyIdToken(match[1], true);
    if (!token.uid || !token.email) throw new Error("Incomplete identity");
    return { uid: token.uid, email: token.email };
  } catch {
    throw Object.assign(new Error("Invalid authentication"), { status: 401 });
  }
}

export async function requestBody(request) {
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error("Invalid request"), { status: 400 });
  }
}

export function parseDonation(body) {
  const amountSek = body?.amountSek;
  const frequency = body?.frequency;
  const platform = body?.platform;
  if (!Number.isSafeInteger(amountSek) || amountSek < 10 || amountSek > 100000) {
    throw Object.assign(new Error("Amount must be between 10 and 100000 SEK"), { status: 400 });
  }
  if (!allowedFrequency.has(frequency) || !allowedPlatform.has(platform)) {
    throw Object.assign(new Error("Invalid donation options"), { status: 400 });
  }
  return { amountSek, frequency, platform };
}

export function parsePlatform(value) {
  if (!allowedPlatform.has(value)) {
    throw Object.assign(new Error("Invalid platform"), { status: 400 });
  }
  return value;
}

export async function findOrCreateCustomer(stripe, user) {
  const escapedUid = user.uid.replace(/['\\]/g, "");
  const existing = await stripe.customers.search({
    query: `metadata['firebase_uid']:'${escapedUid}'`,
    limit: 1,
  });
  const customer = existing.data[0];
  if (customer) {
    if (customer.email !== user.email) {
      return stripe.customers.update(customer.id, { email: user.email });
    }
    return customer;
  }
  return stripe.customers.create(
    { email: user.email, metadata: { firebase_uid: user.uid } },
    { idempotencyKey: `koino-customer-${user.uid}` },
  );
}

export function safeErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error("Donation service error", error?.type || error?.name || "unknown");
  return jsonResponse({ error: status < 500 ? error.message : "Donation service unavailable" }, status);
}
