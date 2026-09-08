import type { BiblePlan } from "./types";

export function isPlanDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addPlanDays(value: string, offset: number) {
  if (!isPlanDate(value)) return value;
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function scheduledPlanDate(plan: Pick<BiblePlan, "startDate"> & Partial<Pick<BiblePlan, "days">>, dayNumber: number) {
  return plan.days?.find((day) => day.dayNumber === dayNumber)?.scheduledDate ?? addPlanDays(plan.startDate, dayNumber - 1);
}

export function nextUnreadPlanDay(plan: Pick<BiblePlan, "days">) {
  return plan.days.find((day) => !day.completedAt && day.ranges?.length);
}

export function todayPlanDay(plan: Pick<BiblePlan, "days" | "startDate" | "pausedAt">, date: string) {
  if (plan.pausedAt) return undefined;
  const days = plan.days.filter((day) => scheduledPlanDate(plan, day.dayNumber) === date);
  return days.find((day) => !day.completedAt) ?? days[0];
}

export function rescheduleBiblePlan(plan: BiblePlan, startDate: string) {
  if (!isPlanDate(startDate)) throw new Error("Use a valid date in YYYY-MM-DD format.");
  let offset = 0;
  return plan.days.map((day) => day.completedAt ? day : { ...day, scheduledDate: addPlanDays(startDate, offset++) });
}
