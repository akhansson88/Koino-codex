import type { ExpoPushMessage } from "./push-delivery";

type CommentMessageInput = {
  actorName: string;
  body: string;
  groupId: string;
  label: string;
  notificationId: string;
  reason: "owner" | "participant" | "mention";
  targetId: string;
  targetType: "post" | "check_in";
  badge: number;
};

export function buildCommentPushMessage(input: CommentMessageInput): ExpoPushMessage {
  return {
    title: "KOINO",
    body: "New activity in KOINO.",
    sound: "default",
    badge: input.badge,
    priority: input.reason === "mention" ? "high" : "default",
    channelId: input.reason === "mention" ? "mentions" : "comments",
    data: {
      notificationId: input.notificationId,
      groupId: input.groupId,
      targetType: input.targetType,
      targetId: input.targetId,
      bundled: false,
    },
  };
}

export function buildPrayerPushMessage(input: {
  actorName: string;
  notificationId: string;
  targetType?: string;
  targetId?: string;
  groupId?: string;
  badge?: number;
}): ExpoPushMessage {
  const forRequest = input.targetType === "post";
  const name = input.actorName.trim();
  const body = forRequest
    ? name ? `${name} prayed for your prayer request` : "Someone prayed for your prayer request"
    : name ? `${name} prayed for you` : "Someone prayed for you";
  return {
    title: "KOINO",
    body,
    sound: "default",
    priority: "high",
    channelId: "prayer-activity",
    ...(input.badge !== undefined ? { badge: input.badge } : {}),
    data: {
      prayerNotificationId: input.notificationId,
      ...(input.targetType ? { targetType: input.targetType } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      ...(input.groupId ? { groupId: input.groupId } : {}),
    },
  };
}

export function buildEventPushMessage(input: {
  eventId: string;
  groupId: string;
  minutes: number;
  startAt: string;
  timeZone?: string;
  title: string;
}): ExpoPushMessage {
  const lead = input.minutes >= 1440
    ? "Tomorrow"
    : input.minutes >= 60
      ? `In ${Math.round(input.minutes / 60)} hour${input.minutes >= 120 ? "s" : ""}`
      : `In ${input.minutes} minutes`;
  let time = "";
  try {
    time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: input.timeZone || "Europe/Stockholm",
    }).format(new Date(input.startAt));
  } catch {
    time = "";
  }
  return {
    title: input.title,
    body: [lead, time].filter(Boolean).join(" · "),
    sound: "default",
    priority: "high",
    channelId: "event-reminders",
    data: {
      eventId: input.eventId,
      groupId: input.groupId,
      eventStartAt: input.startAt,
    },
  };
}
