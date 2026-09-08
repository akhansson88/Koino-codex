import type { BiblePlan, BiblePlanDay } from "./types";

export function updateBiblePlanProgress(plan: BiblePlan, dayNumber: number, read: boolean, timestamp: string) {
  if (!plan.days.some((day) => day.dayNumber === dayNumber)) return undefined;
  const days: BiblePlanDay[] = plan.days.map((day) => {
    if (day.dayNumber !== dayNumber) return day;
    const { completedAt, ...unreadDay } = day;
    return read ? { ...unreadDay, completedAt: completedAt ?? timestamp } : unreadDay;
  });
  const status = days.every((day) => Boolean(day.completedAt)) ? "completed" : "active";
  return { days, status, completedAt: status === "completed" ? plan.completedAt ?? timestamp : null };
}
