import type { BiblePlan, BiblePlanDay } from "./types";

export function preserveBiblePlanProgress(days: BiblePlanDay[], existingDays: BiblePlanDay[]): BiblePlanDay[] {
  return days.map((day) => {
    const { completedAt: _completedAt, ...unreadDay } = day;
    const completedAt = existingDays.find((item) => item.dayNumber === day.dayNumber)?.completedAt;
    return completedAt ? { ...unreadDay, completedAt } : unreadDay;
  });
}

export function updateBiblePlanProgress(plan: BiblePlan, dayNumber: number, read: boolean, timestamp: string) {
  if (!plan.days.some((day) => day.dayNumber === dayNumber)) return undefined;
  const days: BiblePlanDay[] = plan.days.map((day) => {
    const { completedAt, ...unreadDay } = day;
    if (day.dayNumber !== dayNumber) return completedAt ? { ...unreadDay, completedAt } : unreadDay;
    return read ? { ...unreadDay, completedAt: completedAt ?? timestamp } : unreadDay;
  });
  const status = days.every((day) => Boolean(day.completedAt)) ? "completed" : "active";
  return { days, status, completedAt: status === "completed" ? plan.completedAt ?? timestamp : null };
}

export function biblePlanProgressUpdates(plan: BiblePlan, dayNumber: number, read: boolean, timestamp: string) {
  const progress = updateBiblePlanProgress(plan, dayNumber, read, timestamp);
  if (!progress) return undefined;
  const index = plan.days.findIndex((day) => day.dayNumber === dayNumber);
  const path = `biblePlans/${plan.userId}/${plan.id}`;
  return {
    progress,
    updates: {
      // Firebase rejects undefined; null removes a timestamp when marking unread.
      // Write only this day's timestamp so stale optional fields are never resent.
      [`${path}/days/${index}/completedAt`]: progress.days[index].completedAt ?? null,
      [`${path}/status`]: progress.status,
      [`${path}/completedAt`]: progress.completedAt,
      [`${path}/updatedAt`]: timestamp,
    },
  };
}
