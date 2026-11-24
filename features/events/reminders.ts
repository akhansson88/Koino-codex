import { developmentMode } from "@/state/store/firebase";
import { formatEventTime } from "@/state/events";
import type { EventRsvp, GroupEvent } from "@/state/types";
import type { TranslationFunction } from "@/ui/localization";

type NotificationsModule = typeof import("expo-notifications");

let Notifications: NotificationsModule | undefined;
try {
  // KOINO Dev keeps notification registration off; scheduling follows the same rule.
  Notifications = developmentMode ? undefined : require("expo-notifications");
} catch {
  Notifications = undefined;
}

const maxScheduledReminders = 40;

export async function syncEventReminders({
  events,
  language,
  pushEnabled,
  rsvps,
  t,
  userId,
}: {
  events: GroupEvent[];
  language: "en" | "sv";
  pushEnabled: boolean;
  rsvps: EventRsvp[];
  t: TranslationFunction;
  userId: string;
}) {
  if (!Notifications) return;
  try {
    const targetIds = new Set(rsvps.filter((rsvp) => rsvp.userId === userId && (rsvp.status === "going" || rsvp.status === "maybe")).map((rsvp) => rsvp.eventId));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter((item) => (item.content.data as { koinoEvent?: boolean } | undefined)?.koinoEvent === true);
    await Promise.all(ours.map((item) => Notifications!.cancelScheduledNotificationAsync(item.identifier)));
    if (!pushEnabled || !targetIds.size) return;

    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") return;

    const now = Date.now();
    const horizon = now + 30 * 86400000;
    const upcoming = events
      .filter((event) => targetIds.has(event.id))
      .map((event) => ({ event, start: Date.parse(event.startAt) }))
      .filter((item) => Number.isFinite(item.start) && item.start > now && item.start < horizon)
      .sort((left, right) => left.start - right.start)
      .slice(0, 12);

    const pending: { body: string; date: Date; event: GroupEvent; minutes: number }[] = [];
    for (const { event, start } of upcoming) {
      for (const minutes of event.reminderMinutes ?? []) {
        const fireAt = start - minutes * 60000;
        if (fireAt <= now) continue;
        pending.push({
          body: t("events.notification.body", { time: formatEventTime(event.startAt, language) }),
          date: new Date(fireAt),
          event,
          minutes,
        });
      }
    }

    for (const item of pending.slice(0, maxScheduledReminders)) {
      await Notifications.scheduleNotificationAsync({
        identifier: `koino-event-${item.event.id}-${item.minutes}`,
        content: {
          title: item.event.title,
          body: item.body,
          sound: "default",
          data: { koinoEvent: true, eventId: item.event.id, groupId: item.event.groupId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.date,
          channelId: "event-reminders",
        },
      });
    }
  } catch {
    // Reminders are best effort; a denied permission or stale native module must never block the app.
  }
}
