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
  mentionUserIds?: string[];
  createdAt: string;
};

type PrayerNotification = {
  id: string;
  userId: string;
  recipientUserId: string;
  durationSeconds: number;
};

function categoryForReason(reason: "owner" | "participant" | "mention"): PushCategory {
  if (reason === "owner") return "ownContent";
  if (reason === "mention") return "mentions";
  return "followedDiscussions";
}

export const createCommentNotification = onValueCreated(
  { ref: "/encryptedData/replies/{groupId}/{replyId}", region: "europe-west1" },
  async (event) => {
    const reply = event.data.val() as Reply | null;
    const { groupId, replyId } = event.params;
    if (!reply || !groupId || !replyId) return;

    const database = getDatabase(adminApp);
    if ((await database.ref(`e2eeMigrations/group/${groupId}/importedEventIds/${replyId}`).get()).exists()) return;
    const targetCollection = reply.targetType === "post" ? "posts" : "checkIns";
    const targetSnapshot = await database.ref(`encryptedData/${targetCollection}/${groupId}/${reply.targetId}`).get();
    if (!targetSnapshot.exists()) return;

    const target = targetSnapshot.val() as { userId?: string; kind?: string };
    const [followersSnapshot, membersSnapshot] = await Promise.all([
      database.ref(`encryptedData/discussionFollowers/${groupId}/${reply.targetType}/${reply.targetId}`).get(),
      database.ref(`encryptedData/groupMembers/${groupId}`).get(),
    ]);
    const membersById = membersSnapshot.val() ?? {};
    if (!membersById[reply.userId]) return;
    const bundleKey = `${groupId}:${reply.targetType}:${reply.targetId}`;
    const recipients = new Map<string, "owner" | "participant" | "mention">();
    if (target.userId && target.userId !== reply.userId) recipients.set(target.userId, "owner");
    Object.values((followersSnapshot.val() ?? {}) as Record<string, { userId?: string }>).forEach((follow) => {
      if (follow.userId && follow.userId !== reply.userId && !recipients.has(follow.userId)) {
        recipients.set(follow.userId, "participant");
      }
    });
    for (const uid of reply.mentionUserIds ?? []) {
      if (typeof uid === "string" && uid !== reply.userId && membersById[uid]) recipients.set(uid, "mention");
    }

    await Promise.all(Array.from(recipients, async ([recipientUserId, reason]) => {
      if (!membersById[recipientUserId]) return;
      const notificationRef = database.ref(`encryptedData/activityNotifications/${recipientUserId}/${replyId}`);
      const notification = {
        id: replyId,
        type: reason === "mention" ? "mention" : reason === "participant" ? "discussion_activity" : "comment",
        reason,
        priority: reason === "mention" ? "high" : "normal",
        bundleKey,
        actorUserId: reply.userId,
        recipientUserId,
        groupId,
        targetType: reply.targetType,
        targetId: reply.targetId,
        replyId,
        createdAt: reply.createdAt,
      };
      const transaction = await notificationRef.transaction((current) => (current ? undefined : notification));
      if (!transaction.committed || !(await pushAllowed(database, recipientUserId, categoryForReason(reason)))) return;

      await sendExpoPush(database, recipientUserId, `comment:${replyId}`, buildCommentPushMessage({
        actorName: "",
        body: "",
        groupId,
        label: "",
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
  { ref: "/encryptedData/prayerNotifications/{recipientUserId}/{notificationId}", region: "europe-west1" },
  async (event) => {
    const notification = event.data.val() as PrayerNotification | null;
    const { recipientUserId, notificationId } = event.params;
    if (!notification || !recipientUserId || !notificationId || notification.recipientUserId !== recipientUserId) return;

    const database = getDatabase(adminApp);
    if ((await database.ref(`e2eeMigrations/user/${recipientUserId}/importedEventIds/${notificationId}`).get()).exists()) return;
    if (!(await pushAllowed(database, recipientUserId, "prayerActivity"))) return;
    await sendExpoPush(database, recipientUserId, `prayer:${notificationId}`, buildPrayerPushMessage("", notificationId));
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
