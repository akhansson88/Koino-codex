import { getDatabase, type Database } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { onValueCreated } from "firebase-functions/v2/database";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { adminApp } from "./firebase-admin";

type Reply = {
  id: string;
  userId: string;
  targetType: "post" | "check_in";
  targetId: string;
  body: string;
  createdAt: string;
};

type PushTokenRecord = {
  token?: string;
};

type ExpoPushTicket = {
  status?: "ok" | "error";
  details?: { error?: string };
};

type NotificationPreferences = {
  pushEnabled?: boolean;
  ownContent?: boolean;
  mentions?: boolean;
  followedDiscussions?: boolean;
  prayerActivity?: boolean;
};

const BUNDLE_QUIET_WINDOW_MS = 30 * 1000;
const BUNDLE_MAX_WAIT_MS = 2 * 60 * 1000;

type PendingNotificationBundle = {
  recipientUserId: string;
  reason: "owner" | "participant";
  groupId: string;
  targetType: Reply["targetType"];
  targetId: string;
  contentLabel: ReturnType<typeof contentLabel>;
  targetOwnerName: string;
  count: number;
  latestActorName: string;
  latestPreview: string;
  latestNotificationId: string;
  firstAtMs: number;
  lastAtMs: number;
  sendAfterMs: number;
  status: "pending" | "sending";
  claimedAtMs?: number;
};

async function sendExpoPush(
  database: Database,
  recipientUserId: string,
  message: Record<string, unknown>,
) {
  const tokensSnapshot = await database.ref(`pushTokens/${recipientUserId}`).get();
  const tokenEntries = Object.entries((tokensSnapshot.val() ?? {}) as Record<string, PushTokenRecord>)
    .filter((entry): entry is [string, { token: string }] => typeof entry[1]?.token === "string");

  for (let start = 0; start < tokenEntries.length; start += 100) {
    const batch = tokenEntries.slice(start, start + 100);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(batch.map(([, tokenRecord]) => ({ ...message, to: tokenRecord.token }))),
    });
    if (!response.ok) throw new Error(`Expo push request failed with status ${response.status}`);

    const payload = (await response.json()) as { data?: ExpoPushTicket[] };
    const removals: Record<string, null> = {};
    payload.data?.forEach((ticket, index) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        removals[`pushTokens/${recipientUserId}/${batch[index][0]}`] = null;
      }
    });
    if (Object.keys(removals).length > 0) await database.ref().update(removals);
  }
}

async function unreadCount(database: Database, recipientUserId: string) {
  const snapshot = await database.ref(`activityNotifications/${recipientUserId}`).get();
  return Object.values((snapshot.val() ?? {}) as Record<string, { readAt?: string }>).filter((item) => !item.readAt).length;
}

async function pushAllowed(
  database: Database,
  recipientUserId: string,
  reason: "owner" | "participant" | "mention",
) {
  const snapshot = await database.ref(`notificationPreferences/${recipientUserId}`).get();
  const preferences = (snapshot.val() ?? {}) as NotificationPreferences;
  if (preferences.pushEnabled === false) return false;
  if (reason === "owner") return preferences.ownContent !== false;
  if (reason === "mention") return preferences.mentions !== false;
  return preferences.followedDiscussions !== false;
}

function contentLabel(targetType: Reply["targetType"], kind?: unknown) {
  if (targetType === "check_in") return "check-in";
  if (kind === "reflection" || kind === "praise") return kind;
  if (kind === "prayer_request") return "prayer request";
  if (kind === "prayer_moment") return "prayer";
  if (kind === "update") return "update";
  if (kind === "scripture") return "scripture reflection";
  return "post";
}

function ownerNotificationTitle(actorName: string, label: ReturnType<typeof contentLabel>) {
  if (label === "reflection") return `${actorName} encouraged you on your reflection`;
  if (label === "prayer request") return `${actorName} responded to your prayer request`;
  if (label === "prayer") return `${actorName} responded to your prayer`;
  if (label === "praise") return `${actorName} responded to your praise`;
  if (label === "check-in") return `${actorName} commented on your check-in`;
  return `${actorName} commented on your ${label}`;
}

function bundledNotificationTitle(reason: "owner" | "participant", count: number, label: ReturnType<typeof contentLabel>) {
  return reason === "owner"
    ? `${count} new responses to your ${label}`
    : `${count} new responses in a discussion you follow`;
}

function mentionTokens(body: string) {
  return new Set(Array.from(body.matchAll(/@([\p{L}\p{N}_-]+)/gu), (match) => match[1].toLocaleLowerCase()));
}

function mentionHandles(name: string) {
  const normalized = name.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return Array.from(new Set([normalized.replace(/\s+/g, "_"), normalized.split(/\s+/)[0]]));
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

    await Promise.all(
      Array.from(recipients, async ([recipientUserId, reason]) => {
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
        if (!transaction.committed) return;
        if (!(await pushAllowed(database, recipientUserId, reason))) return;

        if (reason === "mention") {
          await sendExpoPush(database, recipientUserId, {
            title: `${actorName} mentioned you in a comment`,
            body: reply.body.slice(0, 160),
            sound: "default",
            badge: await unreadCount(database, recipientUserId),
            priority: "high",
            channelId: "mentions",
            data: {
              notificationId: replyId,
              groupId,
              targetType: reply.targetType,
              targetId: reply.targetId,
              bundled: false,
            },
          });
          return;
        }

        const timestamp = Date.now();
        const pendingBundleId = `${groupId}_${reply.targetType}_${reply.targetId}`.replace(/[.#$\[\]\/]/g, "_");
        await database.ref(`pendingNotificationBundles/${recipientUserId}/${pendingBundleId}`).transaction((current) => {
          const existing = current as PendingNotificationBundle | null;
          const continuing = existing?.status !== "sending";
          const firstAtMs = continuing && existing ? existing.firstAtMs : timestamp;
          return {
            recipientUserId,
            reason,
            groupId,
            targetType: reply.targetType,
            targetId: reply.targetId,
            contentLabel: label,
            targetOwnerName,
            count: continuing && existing ? existing.count + 1 : 1,
            latestActorName: actorName,
            latestPreview: reply.body.slice(0, 160),
            latestNotificationId: replyId,
            firstAtMs,
            lastAtMs: timestamp,
            sendAfterMs: Math.min(firstAtMs + BUNDLE_MAX_WAIT_MS, timestamp + BUNDLE_QUIET_WINDOW_MS),
            status: "pending",
          } satisfies PendingNotificationBundle;
        });
      }),
    );
  },
);

export const sendPendingNotificationBundles = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1", timeZone: "UTC" },
  async () => {
    const database = getDatabase(adminApp);
    const rootSnapshot = await database.ref("pendingNotificationBundles").get();
    const nowMs = Date.now();
    const pending = rootSnapshot.val() as Record<string, Record<string, PendingNotificationBundle>> | null;
    if (!pending) return;

    const dueBundles = Object.entries(pending).flatMap(([recipientUserId, bundles]) =>
      Object.entries(bundles)
        .filter(
          ([, bundle]) =>
            (bundle.status === "pending" && bundle.sendAfterMs <= nowMs) ||
            (bundle.status === "sending" && (bundle.claimedAtMs ?? 0) <= nowMs - 2 * 60 * 1000),
        )
        .map(([bundleId]) => ({ recipientUserId, bundleId })),
    );

    await Promise.all(
      dueBundles.map(async ({ recipientUserId, bundleId }) => {
        const bundleRef = database.ref(`pendingNotificationBundles/${recipientUserId}/${bundleId}`);
        const claim = await bundleRef.transaction((current) => {
          const bundle = current as PendingNotificationBundle | null;
          const staleClaim = bundle?.status === "sending" && (bundle.claimedAtMs ?? 0) <= Date.now() - 2 * 60 * 1000;
          if (!bundle || (!staleClaim && (bundle.status !== "pending" || bundle.sendAfterMs > Date.now()))) return;
          return { ...bundle, status: "sending", claimedAtMs: Date.now() };
        });
        if (!claim.committed) return;

        const bundle = claim.snapshot.val() as PendingNotificationBundle;
        const nativeBundleKey = `${bundleId}:${bundle.latestNotificationId}`;
        try {
          if (!(await pushAllowed(database, recipientUserId, bundle.reason))) {
            await bundleRef.transaction((current) => {
              const latest = current as PendingNotificationBundle | null;
              return latest?.status === "sending" && latest.latestNotificationId === bundle.latestNotificationId
                ? null
                : current;
            });
            return;
          }
          const title =
            bundle.count > 1
              ? bundledNotificationTitle(bundle.reason, bundle.count, bundle.contentLabel)
              : bundle.reason === "owner"
                ? ownerNotificationTitle(bundle.latestActorName, bundle.contentLabel)
                : "New activity on a discussion you joined";
          await sendExpoPush(database, recipientUserId, {
            title,
            body:
              bundle.reason === "participant" || bundle.count > 1
                ? `${bundle.latestActorName}: ${bundle.latestPreview}`.slice(0, 160)
                : bundle.latestPreview,
            sound: "default",
            badge: await unreadCount(database, recipientUserId),
            priority: "default",
            channelId: "comments",
            collapseId: nativeBundleKey.slice(0, 64),
            tag: nativeBundleKey.slice(0, 128),
            threadId: bundleId.slice(0, 64),
            data: {
              notificationId: bundle.latestNotificationId,
              groupId: bundle.groupId,
              targetType: bundle.targetType,
              targetId: bundle.targetId,
              bundled: bundle.count > 1,
            },
          });
          await bundleRef.transaction((current) => {
            const latest = current as PendingNotificationBundle | null;
            return latest?.status === "sending" && latest.latestNotificationId === bundle.latestNotificationId
              ? null
              : current;
          });
        } catch (error) {
          logger.error("Bundled notification delivery failed", { bundleId, error, recipientUserId });
          await bundleRef.transaction((current) => {
            const latest = current as PendingNotificationBundle | null;
            if (!latest || latest.status !== "sending" || latest.latestNotificationId !== bundle.latestNotificationId) {
              return current;
            }
            return { ...latest, status: "pending", claimedAtMs: null, sendAfterMs: Date.now() + 60_000 };
          });
        }
      }),
    );
  },
);
