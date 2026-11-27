import type { FastMode, FastPhase, FastSchedule } from "@/state/types";
import {
  clockMinutes,
  defaultFastSchedule,
  fastDurationProblem,
  fastModeConfig,
  fastScheduleProblem,
} from "@/state/fasting-modes";

const DAY_MS = 86_400_000;

export type FastWindowPhase = "before" | "fasting" | "eating" | "after";

export type FastPlanLike = {
  startDate: string;
  durationDays: number;
  schedule: FastSchedule;
  startAt: string;
  endAt: string;
  status?: "active" | "ended";
};

export type FastWindow = {
  start: number;
  end: number;
  phase: FastWindowPhase;
};

export function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseLocalDayKey(dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date;
}

export function addLocalDays(dayKey: string, amount: number) {
  const date = parseLocalDayKey(dayKey);
  if (!date) return dayKey;
  return localDayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12, 0, 0, 0));
}

export function atLocalClock(dayKey: string, clock: string) {
  const date = parseLocalDayKey(dayKey);
  const minutes = clockMinutes(clock);
  if (!date || minutes === undefined) return undefined;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function windowForDay(dayKey: string, schedule: Extract<FastSchedule, { kind: "daily" }>) {
  const start = atLocalClock(dayKey, schedule.fastStart);
  const endSameDay = atLocalClock(dayKey, schedule.fastEnd);
  if (!start || !endSameDay) return undefined;
  const end = endSameDay.getTime() <= start.getTime()
    ? atLocalClock(addLocalDays(dayKey, 1), schedule.fastEnd)
    : endSameDay;
  if (!end) return undefined;
  return { start: start.getTime(), end: end.getTime() };
}

function weeklyOccurrences(startDate: string, schedule: Extract<FastSchedule, { kind: "weekly" }>, durationDays: number) {
  const occurrences: Array<{ start: number; end: number; dayKey: string }> = [];
  const first = parseLocalDayKey(startDate);
  if (!first) return occurrences;
  const weekdays = new Set(schedule.weekdays);
  for (let offset = 0; offset < Math.max(7, durationDays); offset++) {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset, 12, 0, 0, 0);
    if (!weekdays.has(date.getDay())) continue;
    const dayKey = localDayKey(date);
    const start = atLocalClock(dayKey, schedule.startTime);
    if (!start) continue;
    occurrences.push({
      start: start.getTime(),
      end: start.getTime() + schedule.durationHours * 3_600_000,
      dayKey,
    });
  }
  return occurrences;
}

export function fastPlanFirstWindow(fast: FastPlanLike): { start: number; end: number } | undefined {
  return fastPlanWindows(fast)[0];
}

export function fastPlanWindows(fast: FastPlanLike): Array<{ start: number; end: number }> {
  if (fast.schedule.kind === "continuous" || fast.schedule.kind === "partial") {
    const start = Date.parse(fast.startAt);
    const end = Date.parse(fast.endAt);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : [];
  }
  if (fast.schedule.kind === "daily") {
    const windows: Array<{ start: number; end: number }> = [];
    for (let index = 0; index < Math.max(1, fast.durationDays); index++) {
      const window = windowForDay(addLocalDays(fast.startDate, index), fast.schedule);
      if (window && window.end > window.start) windows.push(window);
    }
    return windows;
  }
  return weeklyOccurrences(fast.startDate, fast.schedule, fast.durationDays)
    .map(({ start, end }) => ({ start, end }));
}

export function fastPlanStart(fast: FastPlanLike) {
  return fastPlanWindows(fast)[0]?.start ?? Date.parse(fast.startAt);
}

export function fastPlanEnd(fast: FastPlanLike) {
  const windows = fastPlanWindows(fast);
  return windows[windows.length - 1]?.end ?? Date.parse(fast.endAt);
}

export function fastPlanWindowAt(fast: FastPlanLike, now = Date.now()): FastWindow | undefined {
  if (fast.status === "ended") return undefined;
  const windows = fastPlanWindows(fast);
  if (!windows.length) return undefined;
  for (const window of windows) {
    if (now >= window.start && now < window.end) return { ...window, phase: "fasting" };
  }
  if (now < windows[0].start) return { ...windows[0], phase: "before" };
  if (now >= windows[windows.length - 1].end) return undefined;
  const next = windows.find((window) => now < window.start);
  if (!next) return undefined;
  return { ...next, phase: "eating" };
}

export function fastPlanPhase(fast: FastPlanLike, now = Date.now()): FastPhase {
  if (fast.status === "ended") return "ended";
  const windows = fastPlanWindows(fast);
  if (!windows.length) return "complete";
  if (now < windows[0].start) return "scheduled";
  if (now >= windows[windows.length - 1].end) return "complete";
  return "active";
}

export function fastPlanRemainingMinutes(fast: FastPlanLike, now = Date.now()) {
  const window = fastPlanWindowAt(fast, now);
  if (!window) return 0;
  const target = window.phase === "fasting" ? window.end : window.start;
  return Math.max(0, Math.ceil((target - now) / 60_000));
}

export function fastWindowProgressPercent(fast: FastPlanLike, now = Date.now()) {
  const window = fastPlanWindowAt(fast, now);
  if (!window || window.phase !== "fasting" || window.end <= window.start) return 0;
  return Math.max(0, Math.min(100, Math.floor(((now - window.start) / (window.end - window.start)) * 100)));
}

export function fastPlanProgressPercent(fast: FastPlanLike, now = Date.now()) {
  const start = fastPlanStart(fast);
  const end = fastPlanEnd(fast);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.min(100, Math.floor(((Math.max(start, Math.min(end, now)) - start) / (end - start)) * 100)));
}

export function fastPlanDayNumber(fast: FastPlanLike, now = Date.now()) {
  const start = parseLocalDayKey(fast.startDate);
  if (!start) return 1;
  const today = new Date(now);
  const elapsed = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / DAY_MS);
  return Math.max(1, Math.min(fast.durationDays || 1, elapsed + 1));
}

export function fastPlanTotalDays(fast: FastPlanLike) {
  return Math.max(1, fast.durationDays || 1);
}

export type FastPlanInput = {
  mode: FastMode;
  schedule?: FastSchedule;
  startDate: string;
  startTime?: string;
  durationDays: number;
  durationHours?: number;
};

export type BuiltFastPlan = {
  startDate: string;
  startAt: string;
  endAt: string;
  durationDays: number;
  durationHours?: number;
  schedule: FastSchedule;
};

export function buildFastPlan(input: FastPlanInput): BuiltFastPlan {
  const config = fastModeConfig(input.mode);
  const schedule = input.schedule ?? defaultFastSchedule(input.mode);
  const scheduleProblem = fastScheduleProblem(schedule);
  if (scheduleProblem) throw new Error(`This schedule is not valid (${scheduleProblem}).`);
  if (!parseLocalDayKey(input.startDate)) throw new Error("Choose a start date.");

  if (config.family === "continuous") {
    const hours = input.durationHours ?? config.defaultDurationHours ?? 24;
    const problem = fastDurationProblem(input.mode, input.durationDays, hours);
    if (problem) throw new Error("Choose a duration within the safe range for this fast.");
    const start = atLocalClock(input.startDate, input.startTime ?? "00:00");
    if (!start) throw new Error("Choose a valid start time.");
    const end = new Date(start.getTime() + hours * 3_600_000);
    return {
      startDate: input.startDate,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      durationDays: Math.max(1, Math.ceil(hours / 24)),
      durationHours: hours,
      schedule,
    };
  }

  if (config.family === "partial") {
    const problem = fastDurationProblem(input.mode, input.durationDays);
    if (problem) throw new Error("Choose 10 or 21 days for the Daniel fast.");
    const start = atLocalClock(input.startDate, "00:00");
    const end = atLocalClock(addLocalDays(input.startDate, input.durationDays), "00:00");
    if (!start || !end) throw new Error("Choose a valid start date.");
    return {
      startDate: input.startDate,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      durationDays: input.durationDays,
      schedule,
    };
  }

  if (config.family === "daily") {
    const problem = fastDurationProblem(input.mode, input.durationDays);
    if (problem) throw new Error("Choose a plan length within the safe range.");
    if (schedule.kind !== "daily") throw new Error("This fast needs a daily window.");
    const first = windowForDay(input.startDate, schedule);
    const last = windowForDay(addLocalDays(input.startDate, input.durationDays - 1), schedule);
    if (!first || !last) throw new Error("Choose valid window times.");
    return {
      startDate: input.startDate,
      startAt: new Date(first.start).toISOString(),
      endAt: new Date(last.end).toISOString(),
      durationDays: input.durationDays,
      schedule,
    };
  }

  const problem = fastDurationProblem(input.mode, input.durationDays);
  if (problem) throw new Error("Choose a plan length within the safe range.");
  if (schedule.kind !== "weekly") throw new Error("This fast needs weekly days.");
  const occurrences = weeklyOccurrences(input.startDate, schedule, input.durationDays);
  if (!occurrences.length) throw new Error("Choose at least one weekday.");
  return {
    startDate: occurrences[0].dayKey,
    startAt: new Date(occurrences[0].start).toISOString(),
    endAt: new Date(occurrences[occurrences.length - 1].end).toISOString(),
    durationDays: input.durationDays,
    schedule,
  };
}

export function fastPlanWindowLabel(fast: FastPlanLike) {
  if (fast.schedule.kind === "daily") return { start: fast.schedule.fastStart, end: fast.schedule.fastEnd };
  if (fast.schedule.kind === "weekly") return { start: fast.schedule.startTime, end: fast.schedule.startTime };
  return undefined;
}
