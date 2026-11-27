import type { Fast, GroupFast, GroupFastParticipant, Id } from "@/state/types";
import { fastPlanEnd, fastPlanStart } from "@/state/fasting-plan";

export function groupFastProjection(fast: Fast, groupId: Id, updatedAt: string): GroupFast {
  return {
    id: fast.id,
    groupId,
    userId: fast.userId,
    mode: fast.mode,
    schedule: fast.schedule,
    startDate: fast.startDate,
    startAt: fast.startAt,
    endAt: fast.endAt,
    durationDays: fast.durationDays,
    ...(fast.durationHours ? { durationHours: fast.durationHours } : {}),
    timeZone: fast.timeZone,
    joinCutoffMs: fastPlanStart(fast),
    createdAt: fast.createdAt,
    updatedAt,
  };
}

export function groupFastParticipant(userId: Id, joinedAt: string, personalFastId: Id): GroupFastParticipant {
  return { userId, joinedAt, personalFastId };
}

export function sortGroupFasts(fasts: readonly GroupFast[]) {
  return [...fasts].sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
}

export function upcomingGroupFasts(fasts: readonly GroupFast[], now = Date.now()) {
  return sortGroupFasts(fasts.filter((fast) => fastPlanEnd(fast) > now));
}

export function activeGroupFast(fasts: readonly GroupFast[], now = Date.now()) {
  return sortGroupFasts(fasts.filter((fast) => {
    const start = fastPlanStart(fast);
    const end = fastPlanEnd(fast);
    return now >= start && now < end;
  }))[0];
}

export function nextGroupFast(fasts: readonly GroupFast[], now = Date.now()) {
  return sortGroupFasts(fasts.filter((fast) => fastPlanStart(fast) > now))[0];
}

export function groupFastParticipantList(fast: GroupFast | undefined) {
  if (!fast?.participants) return [];
  return Object.values(fast.participants).filter((participant) => participant && typeof participant.userId === "string");
}

export function participantCount(fast: GroupFast | undefined) {
  return groupFastParticipantList(fast).length;
}

export function joinedGroupFast(fasts: readonly GroupFast[], userId: Id | undefined) {
  if (!userId) return undefined;
  return fasts.find((fast) => Boolean(fast.participants?.[userId]));
}

export function canJoinGroupFast(fast: GroupFast, now = Date.now()) {
  return now < fast.joinCutoffMs;
}

export function groupFastStart(fast: GroupFast) {
  return fastPlanStart(fast);
}

export function groupFastEnd(fast: GroupFast) {
  return fastPlanEnd(fast);
}
