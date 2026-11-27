import { createHmac, randomBytes } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";

import { adminApp } from "../firebase-admin";
import {
  DEFAULT_CONFIG,
  DEFAULT_LIMITS,
  type SignupBucket,
  type SignupGuardConfig,
  type SignupGuardLimits,
} from "./policy";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CONFIG_CACHE_MS = 60 * 1000;
const VERIFICATION_WINDOW_MS = 48 * HOUR_MS;
const EVENT_RETENTION_MS = 90 * DAY_MS;

const db = () => getDatabase(adminApp);
const auth = () => getAuth(adminApp);

let pepperCache: string | null = null;
let configCache: { value: SignupGuardConfig; expiresAt: number } | null = null;

export class ActionLimitError extends Error {
  constructor(readonly action: string) {
    super("ACTION_RATE_LIMITED");
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizeLimits(value: unknown): SignupGuardLimits {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    ipHour: positiveInteger(raw.ipHour, DEFAULT_LIMITS.ipHour),
    ipDay: positiveInteger(raw.ipDay, DEFAULT_LIMITS.ipDay),
    netHour: positiveInteger(raw.netHour, DEFAULT_LIMITS.netHour),
    netDay: positiveInteger(raw.netDay, DEFAULT_LIMITS.netDay),
    emailDay: positiveInteger(raw.emailDay, DEFAULT_LIMITS.emailDay),
    emailMonth: positiveInteger(raw.emailMonth, DEFAULT_LIMITS.emailMonth),
    domainHour: positiveInteger(raw.domainHour, DEFAULT_LIMITS.domainHour),
    domainDay: positiveInteger(raw.domainDay, DEFAULT_LIMITS.domainDay),
    globalHour: positiveInteger(raw.globalHour, DEFAULT_LIMITS.globalHour),
    globalDay: positiveInteger(raw.globalDay, DEFAULT_LIMITS.globalDay),
  };
}

function normalizeConfig(value: unknown): SignupGuardConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const mode = raw.mode === "closed" || raw.mode === "limited" || raw.mode === "open" ? raw.mode : DEFAULT_CONFIG.mode;
  return {
    mode,
    enforce: raw.enforce === true,
    limits: normalizeLimits(raw.limits),
    blockDisposableDomains: raw.blockDisposableDomains !== false,
    allowlistDomains: Array.isArray(raw.allowlistDomains)
      ? raw.allowlistDomains.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().toLowerCase())
      : [],
  };
}

/**
 * The pepper lives under a server-only RTDB path. Admin SDK access bypasses
 * rules; clients can never read it. It is created once, atomically.
 */
export async function getPepper(): Promise<string> {
  if (pepperCache) return pepperCache;
  const target = db().ref("signupGuard/secret/pepper");
  const existing = await target.get();
  if (typeof existing.val() === "string" && existing.val().length >= 32) {
    pepperCache = existing.val() as string;
    return pepperCache;
  }
  const generated = randomBytes(32).toString("hex");
  const result = await target.transaction((current) => {
    if (typeof current === "string" && current.length >= 32) return current;
    return generated;
  });
  const value = result.snapshot.val();
  if (typeof value !== "string" || value.length < 32) throw new Error("Signup guard pepper could not be created.");
  pepperCache = value;
  return value;
}

export async function hashValue(value: string): Promise<string> {
  const pepper = await getPepper();
  return createHmac("sha256", pepper).update(value).digest("hex");
}

export async function getConfig(): Promise<SignupGuardConfig> {
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) return configCache.value;

  const target = db().ref("signupGuard/config");
  const snapshot = await target.get();
  if (!snapshot.exists()) {
    await target.set(DEFAULT_CONFIG);
    configCache = { value: DEFAULT_CONFIG, expiresAt: now + CONFIG_CACHE_MS };
    return DEFAULT_CONFIG;
  }

  const normalized = normalizeConfig(snapshot.val());
  configCache = { value: normalized, expiresAt: now + CONFIG_CACHE_MS };
  return normalized;
}

export function clearConfigCache(): void {
  configCache = null;
}

export async function isBlocked(type: "ip" | "subnet" | "email" | "domain", valueHash: string): Promise<boolean> {
  const snapshot = await db().ref(`signupGuard/blocklist/${type}_${valueHash}`).get();
  if (!snapshot.exists()) return false;
  const value = snapshot.val() as { expiresAt?: unknown } | null;
  const expiresAt = typeof value?.expiresAt === "number" ? value.expiresAt : 0;
  return expiresAt === 0 || expiresAt > Date.now();
}

export async function incrementBucket(bucket: SignupBucket): Promise<number> {
  const target = db().ref(`signupGuard/buckets/${bucket.key}`);
  const result = await target.transaction((current) => {
    const previous = current && typeof current === "object" ? (current as { count?: unknown }).count : undefined;
    const count = (typeof previous === "number" ? previous : 0) + 1;
    return { count, expiresAt: bucket.expiresAt };
  });
  const value = result.snapshot.val() as { count?: unknown } | null;
  return typeof value?.count === "number" ? value.count : 0;
}

export type SignupEvent = {
  decision: "allowed" | "blocked" | "shadow_blocked";
  reason: string;
  bucket?: string;
  ipHash: string;
  netHash: string;
  emailHash: string;
  uaHash: string;
  domainHash: string;
  count?: number;
  limit?: number;
};

export async function logSignupEvent(event: SignupEvent): Promise<void> {
  const now = Date.now();
  await db().ref("signupGuard/events").push({
    ...event,
    createdAt: now,
    expiresAt: now + EVENT_RETENTION_MS,
  });
}

export async function queueVerification(uid: string, emailHash: string): Promise<void> {
  const now = Date.now();
  await db().ref(`signupGuard/verificationQueue/${uid}`).set({
    createdAt: now,
    expiresAt: now + VERIFICATION_WINDOW_MS,
    emailHash,
  });
}

const ACTION_LIMITS: Record<string, { firstDay: number; firstWeek: number }> = {
  createGroup: { firstDay: 1, firstWeek: 1 },
  joinGroup: { firstDay: 3, firstWeek: 10 },
  createSupportPayment: { firstDay: 1, firstWeek: 3 },
};

/**
 * Server-side limits for callable account actions during the first week.
 * Direct database writes (posts, replies) are gated by the email-verification
 * rules; moving those to callables is tracked as a follow-up.
 */
export async function assertActionAllowed(uid: string, action: keyof typeof ACTION_LIMITS): Promise<void> {
  const limits = ACTION_LIMITS[action];
  if (!limits) return;

  const user = await auth().getUser(uid);
  const createdAt = Date.parse(user.metadata.creationTime ?? "");
  if (!Number.isFinite(createdAt)) return;
  const age = Date.now() - createdAt;
  if (age >= 7 * DAY_MS) return;

  const dayWindow = Math.floor(Date.now() / DAY_MS);
  const limit = age < DAY_MS ? limits.firstDay : limits.firstWeek;
  const target = db().ref(`signupGuard/actions/${uid}_${action}_${dayWindow}`);
  const result = await target.transaction((current) => {
    const previous = current && typeof current === "object" ? (current as { count?: unknown }).count : undefined;
    const count = (typeof previous === "number" ? previous : 0) + 1;
    return { count, expiresAt: (dayWindow + 8) * DAY_MS };
  });
  const value = result.snapshot.val() as { count?: unknown } | null;
  const count = typeof value?.count === "number" ? value.count : 0;
  if (count > limit) throw new ActionLimitError(action);
}

export async function sweepExpired(path: string, now: number, max = 500): Promise<number> {
  const snapshot = await db().ref(path).orderByChild("expiresAt").endAt(now).limitToFirst(max).get();
  if (!snapshot.exists()) return 0;
  const updates: Record<string, null> = {};
  snapshot.forEach((child) => {
    updates[child.key as string] = null;
  });
  await db().ref(path).update(updates);
  return Object.keys(updates).length;
}

const PRIVATE_ACCOUNT_PATHS = [
  "profiles",
  "journalEntries",
  "privateCheckIns",
  "prayerSessions",
  "prayerNotifications",
  "activityNotifications",
  "savedVerses",
  "bookmarkCollections",
  "bibleRibbons",
  "bookmarkTombstones",
  "bibleHighlights",
  "bibleHighlightColors",
  "bibleHighlightColorSettings",
  "bibleReaderPreferences",
  "notificationPreferences",
  "pushTokens",
  "checkInDailyClaims",
  "userDiscussionFollows",
  "groupBiblePlanParticipantIds",
  "supportIntents",
  "legacyUndecryptable",
  "legacyUserArchives",
  "e2eeAccounts",
  "e2eeEscrow",
  "e2eeDeviceRequests",
  "e2eeRequests",
  "e2eeJoinRequestStatuses",
];

/**
 * Deletes a signup that never verified its email. These accounts are created
 * after the gate is enabled, so they cannot have written community content.
 * The full account-deletion service owns normal account deletion; this is the
 * narrow cleanup for abandoned registrations.
 */
export async function deleteUnverifiedSignup(uid: string): Promise<void> {
  const database = db();
  const updates: Record<string, null> = {};
  for (const path of PRIVATE_ACCOUNT_PATHS) {
    updates[`${path}/${uid}`] = null;
    updates[`encryptedData/${path}/${uid}`] = null;
  }
  updates[`e2eeMigrations/user/${uid}`] = null;
  updates[`signupGuard/verificationQueue/${uid}`] = null;

  const memberships = await database.ref(`userGroups/${uid}`).get();
  if (memberships.exists()) {
    const groups = memberships.val() as Record<string, unknown>;
    for (const groupId of Object.keys(groups)) {
      updates[`groupMembers/${groupId}/${uid}`] = null;
      updates[`encryptedData/groupMembers/${groupId}/${uid}`] = null;
      updates[`e2eeGroups/${groupId}/members/${uid}`] = null;
      updates[`e2eeJoinRequests/${groupId}/${uid}`] = null;
      updates[`presence/${groupId}/${uid}`] = null;
    }
  }
  updates[`userGroups/${uid}`] = null;
  updates[`encryptedData/userGroups/${uid}`] = null;

  await database.ref().update(updates);
  try {
    await auth().deleteUser(uid);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") throw error;
  }
}

export function reportCleanupCounts(counts: Record<string, number>): void {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total > 0) logger.info("signup_guard_cleanup", counts);
}
