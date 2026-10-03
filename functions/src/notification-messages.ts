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

export function buildPrayerPushMessage(_actorName: string, notificationId: string): ExpoPushMessage {
  return {
    title: "KOINO",
    body: "New activity in KOINO.",
    sound: "default",
    priority: "high",
    channelId: "prayer-activity",
    data: { prayerNotificationId: notificationId },
  };
}
