import assert from "node:assert/strict";
import { buildSync } from "esbuild";

process.env.TZ = "Europe/Stockholm";

const bundle = buildSync({
  entryPoints: ["state/fasting.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  alias: { "@": process.cwd() },
});
const {
  fastDayNumber,
  fastDurationDays,
  fastElapsedMinutes,
  fastEndAt,
  fastPhase,
  fastProgressPercent,
  fastRemainingMinutes,
  fastStartAt,
  isFastDate,
  latestFast,
  openFast,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

assert.equal(isFastDate("2026-11-23"), true);
assert.equal(isFastDate("2026-02-29"), false);
assert.equal(isFastDate("2026-13-01"), false);
assert.equal(isFastDate("23-11-2026"), false);

assert.equal(fastDurationDays(1), 1);
assert.equal(fastDurationDays(365), 365);
assert.equal(fastDurationDays(0), undefined);
assert.equal(fastDurationDays(366), undefined);
assert.equal(fastDurationDays("7"), 7);
assert.equal(fastDurationDays("7.5"), undefined);
assert.equal(fastDurationDays(""), undefined);

const start = fastStartAt("2026-11-23");
assert.ok(start);
assert.equal(start.getFullYear(), 2026);
assert.equal(start.getMonth(), 10);
assert.equal(start.getDate(), 23);
assert.equal(start.getHours(), 0);
assert.equal(start.getMinutes(), 0);

const end = fastEndAt("2026-11-23", 7);
assert.ok(end);
assert.equal(end.getDate(), 30);
assert.equal(end.getHours(), 0);

// Spring forward: two calendar days are 47 hours long, not 48.
const springStart = fastStartAt("2027-03-27");
const springEnd = fastEndAt("2027-03-27", 2);
assert.ok(springStart && springEnd);
assert.equal(springEnd.getTime() - springStart.getTime(), 47 * 60 * 60 * 1000);
assert.equal(springEnd.getHours(), 0, "The end stays at local midnight across DST");

// Fall back: two calendar days are 49 hours long.
const autumnStart = fastStartAt("2026-10-24");
const autumnEnd = fastEndAt("2026-10-24", 2);
assert.ok(autumnStart && autumnEnd);
assert.equal(autumnEnd.getTime() - autumnStart.getTime(), 49 * 60 * 60 * 1000);
assert.equal(autumnEnd.getHours(), 0);

const fast = {
  status: "active",
  startDate: "2026-11-23",
  durationDays: 7,
  startAt: "2026-11-22T23:00:00.000Z",
  endAt: "2026-11-29T23:00:00.000Z",
};
const before = Date.parse("2026-11-22T22:00:00.000Z");
const during = Date.parse("2026-11-25T12:00:00.000Z");
const finalMinute = Date.parse("2026-11-29T22:59:01.000Z");
const atEnd = Date.parse("2026-11-29T23:00:00.000Z");

assert.equal(fastPhase(fast, before), "scheduled");
assert.equal(fastPhase(fast, during), "active");
assert.equal(fastPhase(fast, atEnd), "complete");
assert.equal(fastPhase({ ...fast, status: "ended" }, during), "ended");

assert.equal(fastRemainingMinutes(fast, before), 60);
assert.equal(fastRemainingMinutes(fast, finalMinute), 1);
assert.equal(fastRemainingMinutes(fast, atEnd), 0);
assert.equal(fastElapsedMinutes(fast, before), 0);
assert.equal(fastProgressPercent(fast, before), 0);
assert.equal(fastProgressPercent(fast, atEnd), 100);
assert.equal(fastProgressPercent(fast, during), 36);

assert.equal(fastDayNumber(fast, before), 1);
assert.equal(fastDayNumber(fast, during), 3);
assert.equal(fastDayNumber(fast, atEnd), 7);
assert.equal(fastDayNumber({ ...fast, durationDays: 365 }, during), 3);

const scheduled = { ...fast, startAt: "2026-11-27T23:00:00.000Z", endAt: "2026-12-04T23:00:00.000Z" };
assert.equal(openFast([fast, scheduled], during)?.startAt, fast.startAt);
assert.equal(openFast([{ ...fast, status: "ended" }], during), undefined);
assert.equal(openFast([{ ...fast, startAt: "2026-01-01T23:00:00.000Z", endAt: "2026-01-08T23:00:00.000Z" }], during), undefined);

const older = { ...fast, startAt: "2026-01-01T23:00:00.000Z", endAt: "2026-01-08T23:00:00.000Z" };
assert.equal(latestFast([older, fast])?.startAt, fast.startAt);
assert.equal(latestFast([]), undefined);

console.log("Fasting time checks passed: dates, duration limits, DST, phases, countdown, progress, day numbers, open and latest records.");
