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

function ownerTitle(actorName: string, label: string) {
  if (label === "reflection") return `${actorName} encouraged you on your reflection`;
  if (label === "prayer request") return `${actorName} responded to your prayer request`;
  if (label === "prayer") return `${actorName} responded to your prayer`;
  if (label === "praise") return `${actorName} responded to your praise`;
  if (label === "check-in") return `${actorName} commented on your check-in`;
  return `${actorName} commented on your ${label}`;
}

export function buildCommentPushMessage(input: CommentMessageInput): ExpoPushMessage {
  return {
    title: input.reason === "mention"
      ? `${input.actorName} mentioned you in a comment`
      : input.reason === "owner"
        ? ownerTitle(input.actorName, input.label)
        : "New activity on a discussion you joined",
    body: input.body.slice(0, 160),
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

export function buildPrayerPushMessage(actorName: string, notificationId: string): ExpoPushMessage {
  return {
    title: `${actorName} prayed for you`,
    body: `${actorName} spent time praying for you.`,
    sound: "default",
    priority: "high",
    channelId: "prayer-activity",
    data: { prayerNotificationId: notificationId },
  };
}
