import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";

const providerBundle = await build({
  bundle: true,
  entryPoints: [fileURLToPath(new URL("../state/koino-store.tsx", import.meta.url))],
  logLevel: "silent",
  metafile: true,
  packages: "external",
  platform: "neutral",
  write: false,
});
const providerDependencies = Object.keys(providerBundle.metafile.inputs).map((path) => path.replaceAll("\\", "/"));
const providerBibleTextDependencies = providerDependencies.filter(
  (path) =>
    /(^|\/)features\/(bible-data|bible-kjv)\.ts$/.test(path) ||
    /(^|\/)features\/\.generated\//.test(path),
);
assert.deepEqual(
  providerBibleTextDependencies,
  [],
  "KoinoProvider's dependency graph must not include Bible text or generated Bible payloads",
);

const source = await readFile(new URL("../state/bible-plan-schedule.ts", import.meta.url), "utf8");
const compiled = await transform(source, { loader: "ts", format: "esm" });
const scheduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`;
const { isPlanDate, addPlanDays, scheduledPlanDate, todayPlanDay, nextUnreadPlanDay, rescheduleBiblePlan } = await import(scheduleUrl);
assert.equal(isPlanDate("2026-02-30"), false);
assert.equal(isPlanDate("2028-02-29"), true);
assert.equal(isPlanDate("2026-02-29"), false);
assert.equal(isPlanDate("invalid"), false);
for (const [start, expected] of [["2026-03-29", "2026-03-30"], ["2026-10-25", "2026-10-26"], ["2026-12-31", "2027-01-01"]]) assert.equal(addPlanDays(start, 1), expected);
const passage = { id: "r", displayReference: "Genesis 1:1", start: { book: "Genesis", chapter: 1, verse: 1 }, end: { book: "Genesis", chapter: 1, verse: 1 } };
const plan = { startDate: "2026-09-01", days: [
  { dayNumber: 1, ranges: [passage] },
  { dayNumber: 2, ranges: [passage], completedAt: "2026-09-02T12:00:00Z" },
  { dayNumber: 3, ranges: [] },
  { dayNumber: 4, ranges: [passage] },
] };
assert.equal(todayPlanDay(plan, "2026-09-04").dayNumber, 4);
assert.equal(nextUnreadPlanDay(plan).dayNumber, 1, "Catch-up differs from today's schedule");
assert.equal(todayPlanDay(plan, "2026-08-31"), undefined);
assert.equal(todayPlanDay(plan, "2026-09-08"), undefined);
assert.equal(todayPlanDay({ ...plan, pausedAt: "paused" }, "2026-09-04"), undefined);
const days = rescheduleBiblePlan(plan, "2026-10-25");
assert.equal(days[1], plan.days[1], "Completed readings, dates and timestamps are preserved");
assert.deepEqual(days.filter((day) => !day.completedAt).map((day) => day.scheduledDate), ["2026-10-25", "2026-10-26", "2026-10-27"]);
assert.equal(days[0].ranges, plan.days[0].ranges, "Rescheduling must not rebuild passages");
assert.equal(plan.days[0].scheduledDate, undefined, "Original plan is unchanged");
const resumed = { ...plan, days };
assert.equal(scheduledPlanDate(resumed, 2), "2026-09-02");
assert.equal(todayPlanDay(resumed, "2026-10-27").dayNumber, 4);
assert.equal(todayPlanDay(resumed, "2026-09-04"), undefined);
assert.throws(() => rescheduleBiblePlan(plan, "2026-02-30"));
const overlap = { ...plan, days: rescheduleBiblePlan(plan, "2026-09-02") };
assert.equal(todayPlanDay(overlap, "2026-09-02").dayNumber, 1, "Prefer unfinished reading when restart shares a completed day's date");
assert.equal(nextUnreadPlanDay({ days: [{ dayNumber: 1, ranges: [] }] }), undefined);
assert.equal(nextUnreadPlanDay({ days: plan.days.map((day) => ({ ...day, completedAt: "read" })) }), undefined);

// Exercise the real preview distributor with a small, deterministic Bible fixture.
let previewSource = await readFile(new URL("../features/bible-plans.ts", import.meta.url), "utf8");
previewSource = previewSource.replace(/import\s*\{[\s\S]*?\}\s*from "@\/features\/bible-canon";/, `
const kjvBooks = [{ name: "Genesis", chapters: [1, 2] }];
const normalizeBiblePosition = (position) => position;
const verseCountForChapter = () => 2;
`);
previewSource = previewSource.replace('"@/state/bible-plan-schedule"', JSON.stringify(scheduleUrl));
const previewCode = await transform(previewSource, { loader: "ts", format: "esm" });
const { buildBiblePlanDays, currentPlanDay } = await import(`data:text/javascript;base64,${Buffer.from(previewCode.code).toString("base64")}`);
const preview = buildBiblePlanDays([passage], 7);
assert.equal(preview.length, 7);
assert.equal(preview.filter((day) => !day.ranges.length).length, 6, "Preview identifies empty days");
assert.equal(buildBiblePlanDays([passage], 1)[0].ranges[0].displayReference, passage.displayReference);
assert.equal(currentPlanDay(resumed, new Date(2026, 9, 27)).day.dayNumber, 4);
assert.equal(currentPlanDay({ ...resumed, pausedAt: "paused" }, new Date(2026, 9, 27)), undefined);
console.log("Bible plan schedule checks passed: today/next unread, pause, resume, preserved completion, date validation, DST boundaries, and empty-day preview.");
