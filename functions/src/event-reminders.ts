import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { adminApp } from "./firebase-admin";
import { buildEventPushMessage } from "./notification-messages";
import { pushAllowed, sendExpoPush } from "./push-delivery";

type GroupEvent = {
  endAt?: string;
  groupId?: string;
  id?: string;
  meetingUrl?: string;
  reminderMinutes?: number[];
  startAt?: string;
  timeZone?: string;
  title?: string;
  userId?: string;
};

type EventRsvp = {
  status?: "going" | "maybe" | "declined";
  userId?: string;
};

const allowedOffsets = new Set([1440, 60, 15]);
const reminderWindowMs = 5 * 60 * 1000;
const lookAheadMs = 25 * 60 * 60 * 1000;

// Events are small and sparse compared with posts, so a five-minute sweep over
// the event collection keeps reminders exact without another write per event.
export const sendEventReminders = onSchedule(
  { schedule: "every 5 minutes", region: "europe-west1", timeZone: "UTC" },
  async () => {
    const database = getDatabase(adminApp);
    const snapshot = await database.ref("encryptedData/groupEvents").get();
    if (!snapshot.exists()) return;
    const now = Date.now();
    let delivered = 0;

    const groups = snapshot.val() as Record<string, Record<string, GroupEvent>>;
    for (const [groupId, events] of Object.entries(groups)) {
      for (const [eventId, event] of Object.entries(events ?? {})) {
        if (!event || typeof event !== "object" || event.groupId !== groupId || !event.startAt || !event.title) continue;
        const start = Date.parse(event.startAt);
        if (!Number.isFinite(start) || start <= now || start - now > lookAheadMs) continue;
        if (event.endAt && Date.parse(event.endAt) <= now) continue;

        const offsets = (Array.isArray(event.reminderMinutes) ? event.reminderMinutes : [1440, 60])
          .filter((offset) => Number.isInteger(offset) && allowedOffsets.has(offset));
        if (!offsets.length) continue;

        for (const offset of offsets) {
          const fireAt = start - offset * 60000;
          if (now < fireAt || now > fireAt + reminderWindowMs) continue;

          const rsvpsSnapshot = await database.ref(`encryptedData/eventRsvps/${groupId}/${eventId}`).get();
          const recipients = new Set<string>();
          const rsvps = (rsvpsSnapshot.val() ?? {}) as Record<string, EventRsvp>;
          for (const [userId, rsvp] of Object.entries(rsvps)) {
            if (rsvp?.status === "going" || rsvp?.status === "maybe") recipients.add(userId);
          }
          if (event.userId) recipients.add(event.userId);

          for (const userId of recipients) {
            try {
              if (!(await database.ref(`encryptedData/groupMembers/${groupId}/${userId}`).get()).exists()) continue;
              const deliveryRef = database.ref(`eventReminderDeliveries/${groupId}/${eventId}/${userId}/${offset}`);
              if ((await deliveryRef.get()).exists()) continue;
              if (!(await pushAllowed(database, userId, "eventReminders"))) continue;
              await sendExpoPush(
                database,
                userId,
                `event:${eventId}:${offset}`,
                buildEventPushMessage({
                  eventId,
                  groupId,
                  minutes: offset,
                  startAt: event.startAt,
                  timeZone: event.timeZone,
                  title: event.title,
                }),
              );
              await deliveryRef.set({
                eventId,
                groupId,
                offset,
                sentAt: new Date().toISOString(),
                userId,
              });
              delivered += 1;
            } catch (error) {
              logger.error("Event reminder delivery failed", { error, eventId, groupId, userId });
            }
          }
        }
      }
    }

    if (delivered > 0) logger.info("Event reminders delivered", { delivered });
  },
);
