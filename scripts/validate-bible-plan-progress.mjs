import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const result = await transform(await readFile(new URL("../state/bible-plan-progress.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" });
const { biblePlanProgressUpdates, preserveBiblePlanProgress, updateBiblePlanProgress } = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString("base64")}`);
const timestamp = "2026-09-08T12:00:00.000Z";
const plan = { status: "active", days: [{ dayNumber: 1, ranges: [] }, { dayNumber: 2, ranges: [] }] };
const first = updateBiblePlanProgress(plan, 1, true, timestamp);
assert.equal(first.days[0].completedAt, timestamp);
assert.equal(first.status, "active");
assert.equal(plan.days[0].completedAt, undefined, "Must not mutate the source plan");
const repeated = updateBiblePlanProgress(first, 1, true, "later");
assert.equal(repeated.days[0].completedAt, timestamp, "Repeated marking preserves the original completion time");
const completed = updateBiblePlanProgress(first, 2, true, timestamp);
assert.equal(completed.status, "completed");
assert.equal(completed.completedAt, timestamp);
const reopened = updateBiblePlanProgress(completed, 1, false, timestamp);
assert.equal(reopened.status, "active");
assert.equal(reopened.completedAt, null);
assert.equal(Object.hasOwn(reopened.days[0], "completedAt"), false, "Unread days must omit the property for Firebase");
assert.equal(reopened.days[1].completedAt, timestamp, "Other days keep their progress");
const cleared = updateBiblePlanProgress(reopened, 2, false, timestamp);
assert.equal(cleared.status, "active", "Clearing all progress must not hide a started plan in Saved");
assert.equal(updateBiblePlanProgress(plan, 99, true, timestamp), undefined);
assert.equal(updateBiblePlanProgress({ days: [] }, 1, true, timestamp), undefined);
const single = updateBiblePlanProgress({ days: [{ dayNumber: 1, ranges: [], completedAt: timestamp }], completedAt: timestamp }, 1, false, timestamp);
assert.equal(single.status, "active");
function assertFirebaseSafe(value) {
  assert.notEqual(value, undefined);
  if (value && typeof value === "object") Object.values(value).forEach(assertFirebaseSafe);
}
[first, completed, reopened, cleared, single].forEach(assertFirebaseSafe);
const rebuiltDays = [{ dayNumber: 1, ranges: [] }, { dayNumber: 2, ranges: [] }, { dayNumber: 3, ranges: [] }];
const unreadEdit = preserveBiblePlanProgress(rebuiltDays, plan.days);
const partialEdit = preserveBiblePlanProgress(rebuiltDays, first.days);
const completedEdit = preserveBiblePlanProgress(rebuiltDays.slice(0, 2), completed.days);
assert.equal(Object.hasOwn(unreadEdit[0], "completedAt"), false);
assert.equal(partialEdit[0].completedAt, timestamp, "Editing keeps existing completion timestamps");
assert.equal(Object.hasOwn(partialEdit[1], "completedAt"), false);
assert.equal(Object.hasOwn(partialEdit[2], "completedAt"), false, "New days start unread without undefined values");
assert.ok(completedEdit.every((day) => day.completedAt === timestamp));
assert.equal(Object.hasOwn(rebuiltDays[0], "completedAt"), false, "Editing must not mutate rebuilt days");
[unreadEdit, partialEdit, completedEdit].forEach(assertFirebaseSafe);
const dirtyRebuiltDays = rebuiltDays.map((day) => ({ ...day, completedAt: undefined }));
const cleanEdit = preserveBiblePlanProgress(dirtyRebuiltDays, first.days);
assertFirebaseSafe(cleanEdit);
assert.equal(cleanEdit[0].completedAt, timestamp);
assert.equal(Object.hasOwn(cleanEdit[1], "completedAt"), false, "Rebuilt unread days must also discard undefined timestamps");
assert.equal(Object.hasOwn(dirtyRebuiltDays[1], "completedAt"), true, "Sanitizing must not mutate the input");
const stalePlan = { ...plan, id: "plan", userId: "user", days: [
  { dayNumber: 1, ranges: [], completedAt: undefined },
  { dayNumber: 2, ranges: [], completedAt: timestamp },
] };
const unreadToggle = biblePlanProgressUpdates(stalePlan, 2, false, timestamp);
assertFirebaseSafe(unreadToggle);
assert.deepEqual(unreadToggle.updates, {
  "biblePlans/user/plan/days/1/completedAt": null,
  "biblePlans/user/plan/status": "active",
  "biblePlans/user/plan/completedAt": null,
  "biblePlans/user/plan/updatedAt": timestamp,
});
const readToggle = biblePlanProgressUpdates(stalePlan, 1, true, timestamp);
assertFirebaseSafe(readToggle);
assert.equal(readToggle.updates["biblePlans/user/plan/days/0/completedAt"], timestamp);
assert.equal(readToggle.updates["biblePlans/user/plan/status"], "completed");
assert.equal(biblePlanProgressUpdates(stalePlan, 99, false, timestamp), undefined);
// Use the Firebase SDK's real client validation without connecting or writing remote data.
const { initializeApp, deleteApp } = await import("firebase/app");
const { getDatabase, goOffline, ref, update } = await import("firebase/database");
const app = initializeApp({ databaseURL: "https://demo-plan-progress.firebaseio.com" }, "plan-progress-regression");
const database = getDatabase(app);
goOffline(database);
assert.throws(() => update(ref(database), { "biblePlans/user/plan/days": stalePlan.days }), /contains undefined/);
for (const payload of [unreadToggle.updates, readToggle.updates, { "biblePlans/user/plan/days": cleanEdit }]) {
  assert.doesNotThrow(() => { void update(ref(database), payload).catch(() => {}); });
}
await deleteApp(app);
console.log("Bible plan progress checks passed: marking, unmarking, reopening, single-day plans, invalid days, immutable updates, and Firebase-safe values.");
