import { createHash } from "node:crypto";

import type { Database } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { emulatorTestConfiguration } from "./emulator-safety";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_BATCH_SIZE = 100;

export type PushCategory = "ownContent" | "mentions" | "followedDiscussions" | "prayerActivity";

export type ExpoPushMessage = {
  title: string;
  body: string;
  sound: "default";
  badge?: number;
  priority: "default" | "high";
  channelId: "comments" | "mentions" | "prayer-activity";
  data: Record<string, string | boolean>;
};

type PushTokenRecord = {
  token?: string;
  platform?: "android" | "ios";
};

type ExpoErrorDetails = {
  error?: string;
};

export type ExpoPushTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: ExpoErrorDetails;
};

export type ExpoPushReceipt = {
  status?: "ok" | "error";
  message?: string;
  details?: ExpoErrorDetails;
};

type PendingReceipt = {
  recipientUserId: string;
  tokenId: string;
  tokenHash: string;
  createdAt: string;
};

type NotificationPreferences = {
  pushEnabled?: boolean;
  ownContent?: boolean;
  mentions?: boolean;
  followedDiscussions?: boolean;
  prayerActivity?: boolean;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function diagnosticId(value: string) {
  return value.replace(/[.#$\[\]\/]/g, "_");
}

export function isDeviceNotRegistered(details?: ExpoErrorDetails) {
  return details?.error === "DeviceNotRegistered";
}

export function preferenceAllows(preferences: NotificationPreferences, category: PushCategory) {
  return preferences.pushEnabled !== false && preferences[category] !== false;
}

async function recordDeliveryError(
  database: Database,
  recipientUserId: string,
  sourceId: string,
  error: { stage: "ticket" | "receipt"; message?: string; code?: string; tokenHash?: string },
) {
  const id = diagnosticId(`${sourceId}_${error.stage}_${error.tokenHash ?? "request"}`);
  await database.ref(`encryptedData/pushDeliveryDiagnostics/${recipientUserId}/${id}`).set({
    ...error,
    message: "Push delivery failed.",
    sourceId,
    occurredAt: new Date().toISOString(),
  });
  logger.error("Push notification delivery failed", { recipientUserId, sourceId, ...error });
}

export async function pushAllowed(database: Database, recipientUserId: string, category: PushCategory) {
  const snapshot = await database.ref(`encryptedData/notificationPreferences/${recipientUserId}`).get();
  return preferenceAllows((snapshot.val() ?? {}) as NotificationPreferences, category);
}

export async function activityUnreadCount(database: Database, recipientUserId: string) {
  const snapshot = await database.ref(`encryptedData/activityNotifications/${recipientUserId}`)
    .orderByChild("readAt").equalTo(null).get();
  return snapshot.numChildren();
}

export async function sendExpoPush(
  database: Database,
  recipientUserId: string,
  sourceId: string,
  message: ExpoPushMessage,
  fetchImpl: typeof fetch = fetch,
) {
  if (emulatorTestConfiguration()) return { accepted: 0, devices: 0 };
  if (message.data.groupId && sourceId.startsWith("comment:")) {
    const groupId = String(message.data.groupId), replyId = sourceId.slice("comment:".length);
    if ((await database.ref(`moderationTombstones/${groupId}/reply/${replyId}`).get()).exists()) return { accepted: 0, devices: 0 };
  }
  const tokensSnapshot = await database.ref(`encryptedData/pushTokens/${recipientUserId}`).get();
  const tokenEntries = Object.entries((tokensSnapshot.val() ?? {}) as Record<string, PushTokenRecord>)
    .filter((entry): entry is [string, { token: string; platform?: "android" | "ios" }] => typeof entry[1]?.token === "string");

  if (tokenEntries.length === 0) {
    logger.warn("Push skipped because recipient has no registered devices", { recipientUserId, sourceId });
    return { accepted: 0, devices: 0 };
  }

  let accepted = 0;
  for (let start = 0; start < tokenEntries.length; start += EXPO_BATCH_SIZE) {
    const batch = tokenEntries.slice(start, start + EXPO_BATCH_SIZE);
    const response = await fetchImpl(EXPO_SEND_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(batch.map(([, tokenRecord]) => ({ ...message, to: tokenRecord.token }))),
    });
    if (!response.ok) throw new Error(`Expo push request failed with status ${response.status}`);

    const payload = (await response.json()) as { data?: ExpoPushTicket[] };
    const tickets = payload.data ?? [];
    await Promise.all(batch.map(async ([tokenId, tokenRecord], index) => {
      const ticket = tickets[index];
      const hash = tokenHash(tokenRecord.token);
      if (!ticket || ticket.status !== "ok" || !ticket.id) {
        if (isDeviceNotRegistered(ticket?.details)) {
          await database.ref(`encryptedData/pushTokens/${recipientUserId}/${tokenId}`).remove();
        }
        await recordDeliveryError(database, recipientUserId, sourceId, {
          stage: "ticket",
          message: ticket?.message ?? "Expo did not return a valid push ticket",
          code: ticket?.details?.error,
          tokenHash: hash,
        });
        return;
      }
      accepted += 1;
      await database.ref(`pendingExpoPushReceipts/${ticket.id}`).set({
        recipientUserId,
        tokenId,
        tokenHash: hash,
        createdAt: new Date().toISOString(),
      } satisfies PendingReceipt);
    }));
  }

  logger.info("Push submitted to Expo", { accepted, devices: tokenEntries.length, recipientUserId, sourceId });
  return { accepted, devices: tokenEntries.length };
}

export async function processExpoReceipts(database: Database, fetchImpl: typeof fetch = fetch) {
  if (emulatorTestConfiguration()) return { processed: 0 };
  const snapshot = await database.ref("pendingExpoPushReceipts").limitToFirst(EXPO_BATCH_SIZE).get();
  const pending = (snapshot.val() ?? {}) as Record<string, PendingReceipt>;
  const receiptIds = Object.keys(pending);
  if (receiptIds.length === 0) return { processed: 0 };

  const response = await fetchImpl(EXPO_RECEIPTS_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ ids: receiptIds }),
  });
  if (!response.ok) throw new Error(`Expo receipt request failed with status ${response.status}`);
  const payload = (await response.json()) as { data?: Record<string, ExpoPushReceipt> };

  await Promise.all(receiptIds.map(async (receiptId) => {
    const receipt = payload.data?.[receiptId];
    if (!receipt) return;
    const item = pending[receiptId];
    if (receipt.status === "error") {
      if (isDeviceNotRegistered(receipt.details)) {
        await database.ref(`encryptedData/pushTokens/${item.recipientUserId}/${item.tokenId}`).remove();
      }
      await recordDeliveryError(database, item.recipientUserId, receiptId, {
        stage: "receipt",
        message: receipt.message,
        code: receipt.details?.error,
        tokenHash: item.tokenHash,
      });
    }
    await database.ref(`pendingExpoPushReceipts/${receiptId}`).remove();
  }));

  return { processed: receiptIds.length };
}
