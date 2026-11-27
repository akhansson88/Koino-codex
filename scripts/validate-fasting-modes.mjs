import assert from "node:assert/strict";
import { buildSync } from "esbuild";

process.env.TZ = "Europe/Stockholm";

const bundle = buildSync({
  entryPoints: ["state/fasting-plan.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  alias: { "@": process.cwd() },
});
const {
  buildFastPlan,
  fastPlanDayNumber,
  fastPlanEnd,
  fastPlanPhase,
  fastPlanRemainingMinutes,
  fastPlanStart,
  fastPlanWindowAt,
  fastPlanWindows,
  fastWindowProgressPercent,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const modes = await import(`data:text/javascript;base64,${Buffer.from(buildSync({
  entryPoints: ["state/fasting-modes.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  alias: { "@": process.cwd() },
}).outputFiles[0].text).toString("base64")}`);
const { fastScheduleProblem, fastDurationProblem, defaultFastSchedule } = modes;

const start = "2026-11-27";

const water = buildFastPlan({ mode: "water", startDate: start, startTime: "18:00", durationDays: 1, durationHours: 24 });
assert.equal(new Date(water.endAt).getTime() - new Date(water.startAt).getTime(), 24 * 3_600_000);
assert.equal(water.durationDays, 1);

const dry = buildFastPlan({ mode: "dry", startDate: start, startTime: "20:00", durationDays: 1, durationHours: 12 });
assert.equal(new Date(dry.endAt).getTime() - new Date(dry.startAt).getTime(), 12 * 3_600_000);
assert.equal(fastDurationProblem("dry", 1, 24), null);
assert.equal(fastDurationProblem("dry", 1, 25), "duration");
assert.equal(fastDurationProblem("water", 1, 73), "duration");
assert.equal(fastDurationProblem("water", 1, 72), null);
assert.equal(fastDurationProblem("custom", 7, 168), null);
const legacyWeek = buildFastPlan({ mode: "custom", startDate: "2026-11-23", startTime: "00:00", durationDays: 7, durationHours: 168 });
assert.equal(new Date(legacyWeek.endAt).getTime() - new Date(legacyWeek.startAt).getTime(), 7 * 24 * 3_600_000);
assert.equal(legacyWeek.durationDays, 7);

const daily = buildFastPlan({
  mode: "if_16_8",
  startDate: start,
  durationDays: 21,
  schedule: { kind: "daily", fastStart: "20:00", fastEnd: "12:00" },
});
const dailyWindows = fastPlanWindows({ ...daily, status: "active" });
assert.equal(dailyWindows.length, 21);
assert.equal(new Date(daily.startAt).getHours(), 20);
assert.equal(new Date(daily.endAt).getHours(), 12);
assert.equal(new Date(daily.endAt).getDate(), 18);
assert.equal(new Date(daily.endAt).getMonth(), 11);
assert.equal(dailyWindows[0].end - dailyWindows[0].start, 16 * 3_600_000);
assert.equal(fastPlanWindowAt({ ...daily, status: "active" }, new Date("2026-11-27T21:00:00+01:00").getTime())?.phase, "fasting");
assert.equal(fastPlanWindowAt({ ...daily, status: "active" }, new Date("2026-11-28T10:00:00+01:00").getTime())?.phase, "fasting");
assert.equal(fastPlanWindowAt({ ...daily, status: "active" }, new Date("2026-11-28T14:00:00+01:00").getTime())?.phase, "eating");
assert.equal(fastPlanPhase({ ...daily, status: "active" }, new Date("2026-11-27T12:00:00+01:00").getTime()), "scheduled");
assert.equal(fastPlanPhase({ ...daily, status: "active" }, new Date("2026-12-18T13:00:00+01:00").getTime()), "complete");
assert.equal(fastPlanDayNumber({ ...daily, status: "active" }, new Date("2026-11-27T21:00:00+01:00").getTime()), 1);
assert.equal(fastPlanDayNumber({ ...daily, status: "active" }, new Date("2026-11-29T10:00:00+01:00").getTime()), 3);
assert.equal(fastPlanRemainingMinutes({ ...daily, status: "active" }, new Date("2026-11-27T22:00:00+01:00").getTime()), 840);
assert.equal(fastWindowProgressPercent({ ...daily, status: "active" }, new Date("2026-11-28T04:00:00+01:00").getTime()), 50);

const until = buildFastPlan({
  mode: "until_1800",
  startDate: start,
  durationDays: 3,
  schedule: { kind: "daily", fastStart: "00:00", fastEnd: "18:00" },
});
assert.equal(fastPlanWindows({ ...until, status: "active" }).length, 3);
assert.equal(new Date(until.startAt).getHours(), 0);
assert.equal(new Date(until.endAt).getHours(), 18);
assert.equal(new Date(until.endAt).getDate(), 29);

const evening = buildFastPlan({
  mode: "until_1800",
  startDate: start,
  durationDays: 1,
  schedule: { kind: "daily", fastStart: "20:00", fastEnd: "18:00" },
});
assert.equal(new Date(evening.endAt).getTime() - new Date(evening.startAt).getTime(), 22 * 3_600_000);

const weekly = buildFastPlan({
  mode: "if_5_2",
  startDate: "2026-11-23",
  durationDays: 28,
  schedule: { kind: "weekly", weekdays: [1, 4], startTime: "18:00", durationHours: 24 },
});
const weeklyWindows = fastPlanWindows({ ...weekly, status: "active" });
assert.equal(weeklyWindows.length, 8);
assert.equal(new Date(weekly.startAt).getDay(), 1);
assert.equal(new Date(weekly.startAt).getHours(), 18);
assert.equal(new Date(weeklyWindows[1].start).getDay(), 4);

const monk = buildFastPlan({
  mode: "monk",
  startDate: "2026-11-23",
  durationDays: 28,
  schedule: { kind: "weekly", weekdays: [1], startTime: "20:00", durationHours: 36 },
});
const monkWindows = fastPlanWindows({ ...monk, status: "active" });
assert.equal(monkWindows.length, 4);
assert.equal(new Date(monk.endAt).getTime(), monkWindows[3].end);
assert.equal(monkWindows[0].end - monkWindows[0].start, 36 * 3_600_000);
assert.equal(new Date(monkWindows[0].end).getHours(), 8);
assert.equal(new Date(monkWindows[0].end).getDay(), 3);

const daniel = buildFastPlan({ mode: "daniel", startDate: start, durationDays: 21 });
assert.equal(new Date(daniel.endAt).getDate(), 18);
assert.equal(daniel.durationDays, 21);
assert.equal(fastPlanPhase({ ...daniel, status: "active" }, new Date("2026-12-18T00:00:00+01:00").getTime()), "complete");

// Spring DST: local 18:00 must stay 18:00 even when the day is 23 hours long.
const dst = buildFastPlan({
  mode: "until_1800",
  startDate: "2027-03-27",
  durationDays: 2,
  schedule: { kind: "daily", fastStart: "00:00", fastEnd: "18:00" },
});
const dstWindows = fastPlanWindows({ ...dst, status: "active" });
assert.equal(new Date(dstWindows[1].end).getHours(), 18);
assert.equal(dstWindows[1].end - dstWindows[1].start, 17 * 3_600_000);

assert.equal(fastPlanStart({ ...daily, status: "active" }), dailyWindows[0].start);
assert.equal(fastPlanEnd({ ...daily, status: "active" }), dailyWindows[20].end);

assert.equal(fastScheduleProblem({ kind: "daily", fastStart: "20:00", fastEnd: "12:00" }), null);
assert.equal(fastScheduleProblem({ kind: "daily", fastStart: "20:00", fastEnd: "21:00" }), "window");
assert.equal(fastScheduleProblem({ kind: "weekly", weekdays: [1, 1], startTime: "18:00", durationHours: 24 }), "weekdays");
assert.equal(fastScheduleProblem({ kind: "weekly", weekdays: [1, 3], startTime: "18:00", durationHours: 24 }), null);
assert.equal(fastScheduleProblem({ kind: "partial", ruleSet: "daniel" }), null);
assert.equal(defaultFastSchedule("if_16_8").kind, "daily");

console.log("Fasting mode checks passed: continuous, daily windows, 18:00, 5:2, monk, Daniel, DST, phases, progress and validation.");
