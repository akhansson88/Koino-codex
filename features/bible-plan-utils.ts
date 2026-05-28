import type { BiblePlan, BiblePlanReading } from "@/state/types";

export function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromDayKey(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export function sortedBiblePlanReadings(plan?: BiblePlan) {
  return Object.values(plan?.readings ?? {}).sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
}

export function todayBiblePlanReading(plan: BiblePlan | undefined, todayKey: string) {
  const readings = sortedBiblePlanReadings(plan);
  if (!plan || readings.length === 0) return undefined;

  const exactReading = readings.find((reading) => reading.dateKey === todayKey);
  if (exactReading) return exactReading;

  const startDate = dateFromDayKey(plan.startDate);
  const todayDate = dateFromDayKey(todayKey);
  if (!startDate || !todayDate) return undefined;

  const dayNumber = Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (dayNumber < 1) return undefined;
  return readings.find((reading) => reading.day === dayNumber);
}

export function biblePlanDayLabel(reading: BiblePlanReading, totalReadings: number) {
  return `Day ${reading.day} of ${totalReadings}`;
}
