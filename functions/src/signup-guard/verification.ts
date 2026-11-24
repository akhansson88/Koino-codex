import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { adminApp } from "../firebase-admin";
import { deleteUnverifiedSignup, reportCleanupCounts, sweepExpired } from "./store";

const db = () => getDatabase(adminApp);
const auth = () => getAuth(adminApp);

type QueueEntry = { uid: string; expiresAt: number };

function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    if ("code" in error && typeof error.code === "string") return error.code;
    if ("name" in error && typeof error.name === "string") return error.name;
  }
  return "unknown";
}

/**
 * Removes accounts that ignored the 48-hour verification window. They are
 * created after the email gate is enabled, so they cannot have written
 * community content; the full account-deletion service handles normal
 * account deletion and any future data categories.
 */
export const koinoSignupVerificationSweep = onSchedule(
  { schedule: "every 60 minutes", region: "europe-west1", timeZone: "UTC", timeoutSeconds: 540 },
  async () => {
    const now = Date.now();
    const counts = { removed: 0, verified: 0, missing: 0, buckets: 0, actions: 0, events: 0 };

    try {
      const snapshot = await db()
        .ref("signupGuard/verificationQueue")
        .orderByChild("expiresAt")
        .endAt(now)
        .limitToFirst(200)
        .get();

      const entries: QueueEntry[] = [];
      snapshot.forEach((child) => {
        const value = child.val() as { expiresAt?: unknown } | null;
        if (typeof value?.expiresAt === "number") entries.push({ uid: child.key as string, expiresAt: value.expiresAt });
      });

      for (const entry of entries) {
        try {
          const user = await auth().getUser(entry.uid);
          if (user.emailVerified) {
            await db().ref(`signupGuard/verificationQueue/${entry.uid}`).remove();
            counts.verified += 1;
            continue;
          }
          await deleteUnverifiedSignup(entry.uid);
          counts.removed += 1;
        } catch (error) {
          const code = safeErrorCode(error);
          if (code === "auth/user-not-found") {
            await db().ref(`signupGuard/verificationQueue/${entry.uid}`).remove();
            counts.missing += 1;
            continue;
          }
          logger.error("signup_guard_verification_cleanup_failed", { code });
        }
      }

      counts.buckets = await sweepExpired("signupGuard/buckets", now);
      counts.actions = await sweepExpired("signupGuard/actions", now);
      counts.events = await sweepExpired("signupGuard/events", now);
      reportCleanupCounts(counts);
    } catch (error) {
      logger.error("signup_guard_sweep_failed", { code: safeErrorCode(error) });
      throw error;
    }
  },
);
