import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import {
  accountDeletionPreflight,
  accountDeletionStatus,
  assertDeletionPhrase,
  assertRecentAuthentication,
  pendingDeletionJobs,
  purgeOldDeletionJobs,
  purgeOldFinancialRecords,
  runAccountDeletion,
} from "./service";

const callableOptions = {
  region: "europe-west1",
  timeoutSeconds: 540,
  memory: "512MiB" as const,
  cors: true,
};

export const koinoDeleteAccount = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const data = (request.data ?? {}) as { operation?: unknown; confirmation?: unknown };
  const operation = typeof data.operation === "string" ? data.operation : "preflight";

  if (operation === "preflight") {
    return { ...(await accountDeletionPreflight(uid)), authTime: request.auth.token.auth_time ?? 0 };
  }

  if (operation === "status") {
    return accountDeletionStatus(uid);
  }

  if (operation !== "delete") throw new HttpsError("invalid-argument", "Unsupported operation.");

  assertDeletionPhrase(data.confirmation);
  assertRecentAuthentication(request.auth.token.auth_time);

  const current = await accountDeletionStatus(uid);
  if (current.status === "running" && current.requestedAt) {
    const startedAt = Date.parse(current.requestedAt);
    if (Number.isFinite(startedAt) && Date.now() - startedAt < 10 * 60 * 1000) {
      return { status: "running" };
    }
  }

  await runAccountDeletion(uid);
  return { status: "completed" };
});

export const koinoAccountDeletionSweep = onSchedule(
  {
    schedule: "every 10 minutes",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const pending = await pendingDeletionJobs();
    for (const uid of pending) {
      try {
        await runAccountDeletion(uid);
      } catch (error) {
        logger.error("KOINO account deletion sweep failed", {
          code: (error as { code?: string }).code ?? "UNKNOWN",
        });
      }
    }
  },
);

export const koinoDeletionRetentionPurge = onSchedule(
  {
    schedule: "30 3 * * *",
    timeZone: "Europe/Stockholm",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    try {
      const removed = await purgeOldFinancialRecords();
      const jobs = await purgeOldDeletionJobs();
      logger.info("KOINO retention purge", { removed, jobs });
    } catch (error) {
      logger.error("KOINO financial retention purge failed", {
        code: (error as { code?: string }).code ?? "UNKNOWN",
      });
    }
  },
);
