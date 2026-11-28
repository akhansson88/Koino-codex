import { pushCopy } from "./push-copy.generated";
import { serviceLanguage, serviceLocale, type ServiceLanguage } from "./service-language";
import type { ExpoPushMessage } from "./push-delivery";

type CommentMessageInput = {
  actorName: string;
  body: string;
  groupId: string;
  hasAudio?: boolean;
  label: string;
  language?: ServiceLanguage;
  notificationId: string;
  reason: "owner" | "participant" | "mention";
  targetId: string;
  targetType: "post" | "check_in";
  badge: number;
};

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function buildCommentPushMessage(input: CommentMessageInput): ExpoPushMessage {
  const copy = pushCopy[serviceLanguage(input.language)];
  const title = input.hasAudio ? copy.newVoicePrayer : "KOINO";
  const body = input.hasAudio
    ? input.actorName.trim()
      ? fill(copy.voicePrayerShared, { name: input.actorName.trim() })
      : copy.someoneVoicePrayer
    : copy.newActivity;
  return {
    title,
    body,
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
  language?: ServiceLanguage;
  notificationId: string;
  targetType?: string;
  targetId?: string;
  groupId?: string;
  badge?: number;
}): ExpoPushMessage {
  const copy = pushCopy[serviceLanguage(input.language)];
  const forRequest = input.targetType === "post";
  const name = input.actorName.trim();
  const body = forRequest
    ? name ? fill(copy.prayedForRequest, { name }) : copy.someonePrayedForRequest
    : name ? fill(copy.prayedForYou, { name }) : copy.someonePrayedForYou;
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
  language?: ServiceLanguage;
  minutes: number;
  startAt: string;
  timeZone?: string;
  title: string;
}): ExpoPushMessage {
  const language = serviceLanguage(input.language);
  const copy = pushCopy[language];
  const roundedHours = Math.round(input.minutes / 60);
  const lead = input.minutes >= 1440
    ? copy.tomorrow
    : input.minutes >= 60
      ? fill(roundedHours > 1 ? copy.inHours : copy.inHour, { count: roundedHours })
      : fill(copy.inMinutes, { count: input.minutes });
  let time = "";
  try {
    time = new Intl.DateTimeFormat(serviceLocale(language), {
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
