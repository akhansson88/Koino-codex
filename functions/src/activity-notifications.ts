import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { onValueCreated } from "firebase-functions/v2/database";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { adminApp } from "./firebase-admin";
import { buildCommentPushMessage, buildPrayerPushMessage } from "./notification-messages";
import { activityUnreadCount, processExpoReceipts, pushAllowed, sendExpoPush, type PushCategory } from "./push-delivery";

type Reply = {
  id: string;
  userId: string;
  targetType: "post" | "check_in";
  targetId: string;
  body: string;
  createdAt: string;
};

type PrayerNotification = {
  id: string;
  userId: string;
  recipientUserId: string;
  durationSeconds: number;
};

function contentLabel(targetType: Reply["targetType"], kind?: unknown) {
  if (targetType === "check_in") return "check-in";
  if (kind === "reflection" || kind === "praise") return kind;
  if (kind === "prayer_request") return "prayer request";
  if (kind === "prayer_moment") return "prayer";
  if (kind === "update") return "update";
  if (kind === "scripture") return "scripture reflection";
  return "post";
}

function mentionTokens(body: string) {
  return new Set(Array.from(body.matchAll(/@([\p{L}\p{N}_-]+)/gu), (match) => match[1].toLocaleLowerCase()));
}

function mentionHandles(name: string) {
  const normalized = name.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return Array.from(new Set([normalized.replace(/\s+/g, "_"), normalized.split(/\s+/)[0]]));
}

function categoryForReason(reason: "owner" | "participant" | "mention"): PushCategory {
  if (reason === "owner") return "ownContent";
  if (reason === "mention") return "mentions";
  return "followedDiscussions";
}

export const createCommentNotification = onValueCreated(
  { ref: "/replies/{groupId}/{replyId}", region: "europe-west1" },
  async (event) => {
    const reply = event.data.val() as Reply | null;
    const { groupId, replyId } = event.params;
    if (!reply || !groupId || !replyId) return;

    const database = getDatabase(adminApp);
    const targetCollection = reply.targetType === "post" ? "posts" : "checkIns";
    const targetSnapshot = await database.ref(`${targetCollection}/${groupId}/${reply.targetId}`).get();
    if (!targetSnapshot.exists()) return;

    const target = targetSnapshot.val() as { userId?: string; kind?: string };
    const [actorSnapshot, ownerSnapshot, followersSnapshot, membersSnapshot] = await Promise.all([
      database.ref(`profiles/${reply.userId}`).get(),
      target.userId ? database.ref(`profiles/${target.userId}`).get() : Promise.resolve(null),
      database.ref(`discussionFollowers/${groupId}/${reply.targetType}/${reply.targetId}`).get(),
      database.ref(`groupMembers/${groupId}`).get(),
    ]);
    const actor = (actorSnapshot.val() ?? {}) as { name?: string; image?: unknown };
    const actorName = actor.name?.trim() || "Someone";
    const targetOwnerName = ((ownerSnapshot?.child("name").val() as string | null) ?? "Someone").trim() || "Someone";
    const label = contentLabel(reply.targetType, target.kind);
    const bundleKey = `${groupId}:${reply.targetType}:${reply.targetId}`;
    const recipients = new Map<string, "owner" | "participant" | "mention">();
    if (target.userId && target.userId !== reply.userId) recipients.set(target.userId, "owner");
    Object.values((followersSnapshot.val() ?? {}) as Record<string, { userId?: string }>).forEach((follow) => {
      if (follow.userId && follow.userId !== reply.userId && !recipients.has(follow.userId)) {
        recipients.set(follow.userId, "participant");
      }
    });
    const tokens = mentionTokens(reply.body);
    const members = Object.values((membersSnapshot.val() ?? {}) as Record<string, { userId?: string; userName?: string }>);
    tokens.forEach((token) => {
      const matches = members.filter((member) => member.userId && member.userName && mentionHandles(member.userName).includes(token));
      if (matches.length === 1 && matches[0].userId && matches[0].userId !== reply.userId) {
        recipients.set(matches[0].userId, "mention");
      }
    });

    await Promise.all(Array.from(recipients, async ([recipientUserId, reason]) => {
      const notificationRef = database.ref(`activityNotifications/${recipientUserId}/${replyId}`);
      const notification = {
        id: replyId,
        type: reason === "mention" ? "mention" : reason === "participant" ? "discussion_activity" : "comment",
        reason,
        priority: reason === "mention" ? "high" : "normal",
        bundleKey,
        actorUserId: reply.userId,
        actorName,
        ...(actor.image ? { actorImage: actor.image } : {}),
        targetOwnerName,
        recipientUserId,
        groupId,
        targetType: reply.targetType,
        targetId: reply.targetId,
        replyId,
        contentLabel: label,
        preview: reply.body.slice(0, 160),
        createdAt: reply.createdAt,
      };
      const transaction = await notificationRef.transaction((current) => (current ? undefined : notification));
      if (!transaction.committed || !(await pushAllowed(database, recipientUserId, categoryForReason(reason)))) return;

      await sendExpoPush(database, recipientUserId, `comment:${replyId}`, buildCommentPushMessage({
        actorName,
        body: reply.body,
        groupId,
        label,
        notificationId: replyId,
        reason,
        targetId: reply.targetId,
        targetType: reply.targetType,
        badge: await activityUnreadCount(database, recipientUserId),
      }));
    }));
  },
);

export const sendPrayerNotification = onValueCreated(
  { ref: "/prayerNotifications/{recipientUserId}/{notificationId}", region: "europe-west1" },
  async (event) => {
    const notification = event.data.val() as PrayerNotification | null;
    const { recipientUserId, notificationId } = event.params;
    if (!notification || !recipientUserId || !notificationId || notification.recipientUserId !== recipientUserId) return;

    const database = getDatabase(adminApp);
    if (!(await pushAllowed(database, recipientUserId, "prayerActivity"))) return;
    const actorSnapshot = await database.ref(`profiles/${notification.userId}`).get();
    const actorName = ((actorSnapshot.child("name").val() as string | null) ?? "Someone").trim() || "Someone";
    await sendExpoPush(database, recipientUserId, `prayer:${notificationId}`, buildPrayerPushMessage(actorName, notificationId));
  },
);

export const checkPushReceipts = onSchedule(
  { schedule: "every 5 minutes", region: "europe-west1", timeZone: "UTC" },
  async () => {
    try {
      await processExpoReceipts(getDatabase(adminApp));
    } catch (error) {
      logger.error("Expo push receipt check failed", { error });
      throw error;
    }
  },
);
