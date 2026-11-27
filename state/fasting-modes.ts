import type { Fast, FastMode, FastSchedule } from "@/state/types";

export type FastModeFamily = "continuous" | "daily" | "weekly" | "partial";

export type FastModeTint = "water" | "warm" | "reflection" | "lavender" | "moss" | "danger" | "neutral";

export type FastModeConfig = {
  mode: FastMode;
  family: FastModeFamily;
  icon: string;
  tint: FastModeTint;
  badge?: "partial" | "advanced";
  titleKey: string;
  shortKey: string;
  detailKey: string;
  defaultDurationDays: number;
  defaultDurationHours?: number;
  maxDurationDays: number;
  maxDurationHours?: number;
  defaultSchedule: FastSchedule;
};

const DAILY_START = "20:00";
const DAILY_END = "12:00";

export const fastModeOrder: FastMode[] = [
  "water",
  "until_1800",
  "if_16_8",
  "monk",
  "daniel",
  "dry",
  "custom",
];

export const intermittentModeOrder: FastMode[] = [
  "if_16_8",
  "if_18_6",
  "if_20_4",
  "if_5_2",
  "if_24_weekly",
];

export const fastModeConfigs: Record<FastMode, FastModeConfig> = {
  water: {
    mode: "water",
    family: "continuous",
    icon: "droplet",
    tint: "water",
    titleKey: "fasting.mode.water.title",
    shortKey: "fasting.mode.water.short",
    detailKey: "fasting.mode.water.detail",
    defaultDurationDays: 1,
    defaultDurationHours: 24,
    maxDurationDays: 3,
    maxDurationHours: 72,
    defaultSchedule: { kind: "continuous" },
  },
  dry: {
    mode: "dry",
    family: "continuous",
    icon: "sun",
    tint: "danger",
    badge: "advanced",
    titleKey: "fasting.mode.dry.title",
    shortKey: "fasting.mode.dry.short",
    detailKey: "fasting.mode.dry.detail",
    defaultDurationDays: 1,
    defaultDurationHours: 12,
    maxDurationDays: 1,
    maxDurationHours: 24,
    defaultSchedule: { kind: "continuous" },
  },
  until_1800: {
    mode: "until_1800",
    family: "daily",
    icon: "sunset",
    tint: "warm",
    titleKey: "fasting.mode.until1800.title",
    shortKey: "fasting.mode.until1800.short",
    detailKey: "fasting.mode.until1800.detail",
    defaultDurationDays: 1,
    maxDurationDays: 21,
    defaultSchedule: { kind: "daily", fastStart: "00:00", fastEnd: "18:00" },
  },
  if_16_8: {
    mode: "if_16_8",
    family: "daily",
    icon: "clock",
    tint: "reflection",
    titleKey: "fasting.mode.if16.title",
    shortKey: "fasting.mode.if16.short",
    detailKey: "fasting.mode.if16.detail",
    defaultDurationDays: 21,
    maxDurationDays: 42,
    defaultSchedule: { kind: "daily", fastStart: DAILY_START, fastEnd: DAILY_END },
  },
  if_18_6: {
    mode: "if_18_6",
    family: "daily",
    icon: "clock",
    tint: "reflection",
    titleKey: "fasting.mode.if18.title",
    shortKey: "fasting.mode.if18.short",
    detailKey: "fasting.mode.if18.detail",
    defaultDurationDays: 21,
    maxDurationDays: 42,
    defaultSchedule: { kind: "daily", fastStart: "19:00", fastEnd: "13:00" },
  },
  if_20_4: {
    mode: "if_20_4",
    family: "daily",
    icon: "clock",
    tint: "reflection",
    badge: "advanced",
    titleKey: "fasting.mode.if20.title",
    shortKey: "fasting.mode.if20.short",
    detailKey: "fasting.mode.if20.detail",
    defaultDurationDays: 14,
    maxDurationDays: 42,
    defaultSchedule: { kind: "daily", fastStart: "20:00", fastEnd: "16:00" },
  },
  if_5_2: {
    mode: "if_5_2",
    family: "weekly",
    icon: "calendar",
    tint: "reflection",
    titleKey: "fasting.mode.if52.title",
    shortKey: "fasting.mode.if52.short",
    detailKey: "fasting.mode.if52.detail",
    defaultDurationDays: 28,
    maxDurationDays: 42,
    defaultSchedule: { kind: "weekly", weekdays: [1, 4], startTime: "18:00", durationHours: 24 },
  },
  if_24_weekly: {
    mode: "if_24_weekly",
    family: "weekly",
    icon: "calendar",
    tint: "reflection",
    titleKey: "fasting.mode.if24.title",
    shortKey: "fasting.mode.if24.short",
    detailKey: "fasting.mode.if24.detail",
    defaultDurationDays: 28,
    maxDurationDays: 42,
    defaultSchedule: { kind: "weekly", weekdays: [1], startTime: "18:00", durationHours: 24 },
  },
  monk: {
    mode: "monk",
    family: "weekly",
    icon: "moon",
    tint: "lavender",
    badge: "advanced",
    titleKey: "fasting.mode.monk.title",
    shortKey: "fasting.mode.monk.short",
    detailKey: "fasting.mode.monk.detail",
    defaultDurationDays: 28,
    maxDurationDays: 42,
    defaultSchedule: { kind: "weekly", weekdays: [1], startTime: "20:00", durationHours: 36 },
  },
  daniel: {
    mode: "daniel",
    family: "partial",
    icon: "feather",
    tint: "moss",
    badge: "partial",
    titleKey: "fasting.mode.daniel.title",
    shortKey: "fasting.mode.daniel.short",
    detailKey: "fasting.mode.daniel.detail",
    defaultDurationDays: 21,
    maxDurationDays: 21,
    defaultSchedule: { kind: "partial", ruleSet: "daniel" },
  },
  custom: {
    mode: "custom",
    family: "continuous",
    icon: "sliders",
    tint: "neutral",
    titleKey: "fasting.mode.custom.title",
    shortKey: "fasting.mode.custom.short",
    detailKey: "fasting.mode.custom.detail",
    defaultDurationDays: 1,
    defaultDurationHours: 24,
    maxDurationDays: 365,
    maxDurationHours: 8760,
    defaultSchedule: { kind: "continuous" },
  },
};

export function isFastMode(value: unknown): value is FastMode {
  return typeof value === "string" && value in fastModeConfigs;
}

export function fastModeConfig(mode: FastMode): FastModeConfig {
  return fastModeConfigs[mode];
}

export function fastModeFamily(mode: FastMode): FastModeFamily {
  return fastModeConfigs[mode].family;
}

export function defaultFastSchedule(mode: FastMode): FastSchedule {
  return cloneSchedule(fastModeConfigs[mode].defaultSchedule);
}

export function cloneSchedule(schedule: FastSchedule): FastSchedule {
  if (schedule.kind === "weekly") return { ...schedule, weekdays: [...schedule.weekdays] };
  return { ...schedule };
}

function isClock(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return Boolean(match);
}

export function clockMinutes(value: string) {
  if (!isClock(value)) return undefined;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function firstNameWeekday(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

export function fastScheduleProblem(schedule: FastSchedule): string | null {
  if (schedule.kind === "daily") {
    const start = clockMinutes(schedule.fastStart);
    const end = clockMinutes(schedule.fastEnd);
    if (start === undefined || end === undefined) return "time";
    const length = end > start ? end - start : 24 * 60 - start + end;
    if (length < 4 * 60 || length > 23 * 60) return "window";
    return null;
  }
  if (schedule.kind === "weekly") {
    if (!schedule.weekdays.length || schedule.weekdays.length > 7) return "weekdays";
    if (!schedule.weekdays.every(firstNameWeekday)) return "weekdays";
    if (new Set(schedule.weekdays).size !== schedule.weekdays.length) return "weekdays";
    if (!isClock(schedule.startTime)) return "time";
    if (!Number.isFinite(schedule.durationHours) || schedule.durationHours < 12 || schedule.durationHours > 36) return "duration";
    return null;
  }
  if (schedule.kind === "partial") {
    return schedule.ruleSet === "daniel" ? null : "mode";
  }
  return null;
}

export function fastDurationProblem(mode: FastMode, durationDays: number, durationHours?: number) {
  const config = fastModeConfigs[mode];
  if (config.family === "continuous") {
    if (!durationHours || !Number.isFinite(durationHours)) return "duration";
    if (durationHours < 1 || durationHours > (config.maxDurationHours ?? 72)) return "duration";
    return null;
  }
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > config.maxDurationDays) return "duration";
  return null;
}

/** The plan's first window start. */
export function defaultFastStartTime(mode: FastMode) {
  const schedule = fastModeConfigs[mode].defaultSchedule;
  if (schedule.kind === "daily") return schedule.fastStart;
  if (schedule.kind === "weekly") return schedule.startTime;
  return "00:00";
}

export function fastModeDraftTitleKey(mode: FastMode) {
  return fastModeConfigs[mode].titleKey;
}

export function isLegacyFast(fast: Pick<Fast, "mode" | "schedule">) {
  return fast.mode === "custom" && fast.schedule.kind === "continuous";
}
