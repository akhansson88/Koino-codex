import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { adminApp } from "./firebase-admin";

// A reading record is only meaningful while it is fresh. The client hides
// anything older than the live window, and this sweep deletes the leftovers so
// no position outlives the day it was written.
const retentionMs = 24 * 60 * 60 * 1000;

type StoredReading = {
  at?: unknown;
};

export const pruneGroupReading = onSchedule(
  { schedule: "10 4 * * *", region: "europe-west1", timeZone: "Europe/Stockholm" },
  async () => {
    const database = getDatabase(adminApp);
    const snapshot = await database.ref("groupReading").get();
    if (!snapshot.exists()) return;

    const now = Date.now();
    const removals: Record<string, null> = {};
    const groups = snapshot.val() as Record<string, Record<string, StoredReading>>;

    for (const [groupId, members] of Object.entries(groups ?? {})) {
      for (const [userId, record] of Object.entries(members ?? {})) {
        const at = record?.at;
        if (typeof at === "number" && Number.isFinite(at) && now - at <= retentionMs) continue;
        removals[`groupReading/${groupId}/${userId}`] = null;
      }
    }

    const removed = Object.keys(removals).length;
    if (removed === 0) return;
    await database.ref().update(removals);
    logger.info("Stale group reading positions removed", { removed });
  },
);
