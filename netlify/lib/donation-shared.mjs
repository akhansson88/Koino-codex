import { decodeProtectedHeader, importX509, jwtVerify } from "jose";
import Stripe from "stripe";

const allowedFrequency = new Set(["one_time", "monthly"]);
const allowedPlatform = new Set(["web", "native"]);
const manageableSubscriptionStatuses = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);
const firebaseProjectId = "koino-codex";
const firebaseIssuer = `https://securetoken.google.com/${firebaseProjectId}`;
const firebaseCertificatesUrl = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let firebaseCertificates = {};
let firebaseCertificatesExpireAt = 0;

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

function certificateMaxAge(cacheControl) {
  const seconds = Number(cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60 * 60 * 1000;
}

async function firebaseCertificate(kid) {
  if (Date.now() >= firebaseCertificatesExpireAt || !firebaseCertificates[kid]) {
    const response = await fetch(firebaseCertificatesUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Firebase certificate request failed with ${response.status}`);
    firebaseCertificates = await response.json();
    firebaseCertificatesExpireAt = Date.now() + certificateMaxAge(response.headers.get("cache-control"));
  }
  const certificate = firebaseCertificates[kid];
  if (typeof certificate !== "string") throw new Error("Firebase token key is not trusted");
  return importX509(certificate, "RS256");
}

async function verifyFirebaseIdToken(idToken) {
  const header = decodeProtectedHeader(idToken);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("Firebase token header is invalid");
  }
  const key = await firebaseCertificate(header.kid);
  const { payload } = await jwtVerify(idToken, key, {
    algorithms: ["RS256"],
    audience: firebaseProjectId,
    issuer: firebaseIssuer,
  });
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new Error("Firebase token subject is invalid");
  if (typeof payload.iat !== "number" || payload.iat > now) throw new Error("Firebase token issued-at time is invalid");
  if (typeof payload.auth_time !== "number" || payload.auth_time > now) throw new Error("Firebase token authentication time is invalid");
  if (typeof payload.email !== "string" || !payload.email) throw new Error("Firebase token email is missing");
  return { uid: payload.sub, email: payload.email };
}

export async function authenticatedUser(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error("Authentication required"), { status: 401 });
  try {
    return await verifyFirebaseIdToken(match[1]);
  } catch (error) {
    const kind = error?.code || error?.name || "unknown";
    const message = error?.message || "No error message";
    console.log(`Donation authentication error: ${kind}: ${message}`);
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

export async function findCustomer(stripe, user) {
  const escapedUid = user.uid.replace(/['\\]/g, "");
  const existing = await stripe.customers.search({
    query: `metadata['firebase_uid']:'${escapedUid}'`,
    limit: 1,
  });
  return existing.data[0] || null;
}

export async function findOrCreateCustomer(stripe, user) {
  const customer = await findCustomer(stripe, user);
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

export function summarizeDonationStatus(sessions, subscriptions, userUid) {
  const belongsToUser = (metadata, clientReferenceId) =>
    metadata?.firebase_uid === userUid || clientReferenceId === userUid;
  const paidSessions = sessions.filter((session) =>
    session.status === "complete" &&
    session.payment_status === "paid" &&
    belongsToUser(session.metadata, session.client_reference_id));
  const userSubscriptions = subscriptions.filter((subscription) =>
    belongsToUser(subscription.metadata));

  return {
    hasCompletedDonation: paidSessions.length > 0,
    hasSubscriptionHistory:
      userSubscriptions.length > 0 || paidSessions.some((session) => session.mode === "subscription"),
    hasManageableSubscription: userSubscriptions.some((subscription) =>
      manageableSubscriptionStatuses.has(subscription.status)),
  };
}

export async function donationStatusForCustomer(stripe, customerId, userUid) {
  const [sessions, subscriptions] = await Promise.all([
    stripe.checkout.sessions.list({ customer: customerId, limit: 100, status: "complete" }),
    stripe.subscriptions.list({ customer: customerId, limit: 100, status: "all" }),
  ]);
  return summarizeDonationStatus(sessions.data, subscriptions.data, userUid);
}

export function safeErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) {
    const kind = error?.type || error?.name || "unknown";
    const code = error?.code ? ` (${error.code})` : "";
    const message = error?.message || "No error message";
    console.log(`Donation service error: ${kind}${code}: ${message}`);
  }
  return jsonResponse({ error: status < 500 ? error.message : "Donation service unavailable" }, status);
}
