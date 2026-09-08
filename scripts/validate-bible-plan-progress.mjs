import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const result = await transform(await readFile(new URL("../state/bible-plan-progress.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" });
const { updateBiblePlanProgress } = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString("base64")}`);
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
console.log("Bible plan progress checks passed: marking, unmarking, reopening, single-day plans, invalid days, immutable updates, and Firebase-safe values.");
