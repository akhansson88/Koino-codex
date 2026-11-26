import type { Fast, FastPhase } from "@/state/types";

const DAY_MS = 86_400_000;

function localDayKeyFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A calendar date in the form YYYY-MM-DD that exists in the device calendar. */
export function isFastDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function fastDurationDays(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.trim()) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 365 ? parsed : undefined;
}

/** Midnight at the start of the selected date, in the device's current zone. */
export function fastStartAt(startDate: string) {
  if (!isFastDate(startDate)) return undefined;
  const [year, month, day] = startDate.split("-").map(Number);
  const value = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

/** Midnight after the requested number of calendar days, so DST never moves it. */
export function fastEndAt(startDate: string, durationDays: number) {
  if (!isFastDate(startDate) || !fastDurationDays(durationDays)) return undefined;
  const [year, month, day] = startDate.split("-").map(Number);
  const value = new Date(year, month - 1, day + durationDays, 0, 0, 0, 0);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

export function fastPhase(fast: Pick<Fast, "status" | "startAt" | "endAt">, now = Date.now()): FastPhase {
  if (fast.status === "ended") return "ended";
  const start = Date.parse(fast.startAt);
  const end = Date.parse(fast.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "complete";
  if (now < start) return "scheduled";
  if (now < end) return "active";
  return "complete";
}

export function fastRemainingMinutes(fast: Pick<Fast, "status" | "startAt" | "endAt">, now = Date.now()) {
  const phase = fastPhase(fast, now);
  if (phase === "complete" || phase === "ended") return 0;
  const target = phase === "scheduled" ? Date.parse(fast.startAt) : Date.parse(fast.endAt);
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 60_000));
}

export function fastElapsedMinutes(fast: Pick<Fast, "status" | "startAt" | "endAt">, now = Date.now()) {
  const start = Date.parse(fast.startAt);
  const end = Date.parse(fast.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor(Math.max(0, Math.min(end, Math.max(start, now)) - start) / 60_000);
}

export function fastProgressPercent(fast: Pick<Fast, "status" | "startAt" | "endAt">, now = Date.now()) {
  const start = Date.parse(fast.startAt);
  const end = Date.parse(fast.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const elapsed = Math.max(0, Math.min(end, Math.max(start, now)) - start);
  return Math.max(0, Math.min(100, Math.floor((elapsed / (end - start)) * 100)));
}

/** 1 on the start date, then one more for each calendar day. */
export function fastDayNumber(fast: Pick<Fast, "startDate" | "durationDays" | "startAt">, now = Date.now()) {
  const start = Date.parse(fast.startAt);
  if (Number.isFinite(start) && now < start) return 1;
  const today = localDayKeyFor(new Date(now));
  const [startYear, startMonth, startDay] = fast.startDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  if (![startYear, startMonth, startDay, todayYear, todayMonth, todayDay].every(Number.isFinite)) return 1;
  const elapsedDays = Math.floor(
    (Date.UTC(todayYear, todayMonth - 1, todayDay) - Date.UTC(startYear, startMonth - 1, startDay)) / DAY_MS,
  );
  return Math.max(1, Math.min(fast.durationDays, elapsedDays + 1));
}

/** The fast that is scheduled or running now. An already-running fast wins. */
export function openFast(fasts: readonly Fast[], now = Date.now()) {
  const phaseRank = (fast: Fast) => fastPhase(fast, now) === "active" ? 0 : 1;
  return fasts
    .filter((fast) => fast.status === "active" && fastPhase(fast, now) !== "complete")
    .sort((left, right) =>
      phaseRank(left) - phaseRank(right)
      || Date.parse(right.startAt) - Date.parse(left.startAt),
    )[0];
}

export function latestFast(fasts: readonly Fast[]) {
  return [...fasts].sort((left, right) =>
    Date.parse(right.startAt) - Date.parse(left.startAt) || Date.parse(right.createdAt) - Date.parse(left.createdAt),
  )[0];
}

export function fastHistory(fasts: readonly Fast[]) {
  return [...fasts].sort((left, right) =>
    Date.parse(right.startAt) - Date.parse(left.startAt) || Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}
