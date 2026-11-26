import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const directory = await mkdtemp(path.join(process.cwd(), "node_modules", "koino-prayer-notifications-"));
try {
  const outfile = path.join(directory, "prayer-notifications.cjs");
  await build({ entryPoints: ["state/prayer-notifications.ts"], bundle: true, platform: "node", format: "cjs", outfile });
  const require = createRequire(import.meta.url);
  const { normalizePrayerNotification } = require(outfile);

  // The shape that crashed versionCode 41: a retired encrypted object where
  // completedAt and durationSeconds used to be plain values.
  const legacy = {
    id: "prayernotification_legacy",
    userId: "giver",
    recipientUserId: "recipient",
    startedAt: { ciphertext: "x", v: 1 },
    completedAt: { ciphertext: "y", v: 1 },
    durationSeconds: { ciphertext: "z", v: 1 },
    createdAt: "2026-11-03T04:33:05.151Z",
  };
  assert.equal(normalizePrayerNotification(legacy), undefined, "legacy encrypted records must not reach the Me page");

  const direct = {
    id: "prayernotification_1",
    userId: "giver",
    recipientUserId: "recipient",
    targetType: "user",
    targetId: "recipient",
    startedAt: "2026-11-26T06:00:00.000Z",
    completedAt: "2026-11-26T06:02:00.000Z",
    durationSeconds: 120.4,
    createdAt: "2026-11-26T06:02:00.000Z",
  };
  assert.deepEqual(normalizePrayerNotification(direct), { ...direct, durationSeconds: 120 });

  const request = {
    ...direct,
    id: "prayernotification_2",
    targetType: "post",
    targetId: "post_1",
    groupId: "group_1",
    requestTitle: "A new job",
    readAt: "2026-11-26T06:10:00.000Z",
  };
  const normalized = normalizePrayerNotification(request);
  assert.equal(normalized?.targetType, "post");
  assert.equal(normalized?.requestTitle, "A new job");
  assert.equal(normalized?.readAt, "2026-11-26T06:10:00.000Z");

  assert.equal(normalizePrayerNotification({ ...direct, targetType: "unknown" })?.targetType, undefined);
  assert.equal(normalizePrayerNotification({ ...direct, requestTitle: { ciphertext: "t" } })?.requestTitle, undefined);

  console.log("Prayer notifications passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
