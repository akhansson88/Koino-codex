import { displayableDurationSeconds, displayableText } from "@/state/display-values";
import type { PrayerNotification, PrayerSessionTargetType } from "@/state/types";

const prayerNotificationTargets: readonly PrayerSessionTargetType[] = [
  "post",
  "check_in",
  "journal_entry",
  "reply",
  "user",
];

function displayableTargetType(value: unknown): PrayerSessionTargetType | undefined {
  return prayerNotificationTargets.includes(value as PrayerSessionTargetType)
    ? value as PrayerSessionTargetType
    : undefined;
}

// Only plaintext prayer notifications can be shown. Records written before the
// plaintext model still carry an encrypted object in completedAt or
// durationSeconds; they cannot be read any more and must never reach a Text
// node.
export function normalizePrayerNotification(value: unknown): PrayerNotification | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const id = displayableText(record.id);
  const userId = displayableText(record.userId);
  const recipientUserId = displayableText(record.recipientUserId);
  const createdAt = displayableText(record.createdAt);
  const completedAt = displayableText(record.completedAt);
  const startedAt = displayableText(record.startedAt);
  const durationSeconds = displayableDurationSeconds(record.durationSeconds);
  if (!id || !userId || !recipientUserId || !createdAt || !completedAt || !startedAt || durationSeconds === undefined) {
    return undefined;
  }
  return {
    id,
    userId,
    recipientUserId,
    createdAt,
    completedAt,
    startedAt,
    durationSeconds,
    ...(displayableText(record.groupId) ? { groupId: displayableText(record.groupId) } : {}),
    ...(displayableTargetType(record.targetType) ? { targetType: displayableTargetType(record.targetType) } : {}),
    ...(displayableText(record.targetId) ? { targetId: displayableText(record.targetId) } : {}),
    ...(displayableText(record.requestTitle) ? { requestTitle: displayableText(record.requestTitle) } : {}),
    ...(displayableText(record.readAt) ? { readAt: displayableText(record.readAt) } : {}),
  };
}

export function normalizePrayerNotifications(values: readonly unknown[]): PrayerNotification[] {
  return values
    .map(normalizePrayerNotification)
    .filter((record): record is PrayerNotification => Boolean(record));
}

export function prayerNotificationTitle(value: Pick<PrayerNotification, "targetType" | "requestTitle">): string | undefined {
  return value.targetType === "post" ? displayableText(value.requestTitle) : undefined;
}
