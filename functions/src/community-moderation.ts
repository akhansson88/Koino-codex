import { HttpsError } from "firebase-functions/v2/https";

type RecordTree = Record<string, any>;
export type ModerationTarget = "post" | "check_in" | "reply";
const collectionFor = { post: "posts", check_in: "checkIns", reply: "replies" } as const;
// Firebase IDs may be names such as __proto__ or constructor. Treat database
// maps as own properties, never as JavaScript's inherited object namespace.
function ownAt(value: any, ...keys: string[]): any {
  for (const key of keys) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}
function put(map: RecordTree, key: string, value: any) {
  Object.defineProperty(map, key, { value, enumerable: true, configurable: true, writable: true });
}
function ensureMap(root: RecordTree, ...keys: string[]): RecordTree {
  let map = root;
  for (const key of keys) {
    let child = ownAt(map, key);
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      child = Object.create(null);
      put(map, key, child);
    }
    map = child;
  }
  return map;
}
export function moderationReference(data: RecordTree) {
  const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
  if (!validId(data.groupId) || !validId(data.targetId) || !Object.hasOwn(collectionFor, data.targetType)) {
    throw new HttpsError("invalid-argument", "Invalid community content reference.");
  }
  return { groupId: data.groupId as string, targetId: data.targetId as string, targetType: data.targetType as ModerationTarget };
}

// Runs inside the existing root ETag transaction: authorization, cleanup,
// tombstones and the audit record either all commit or none of them do.
export function removeCommunityContent(root: RecordTree, uid: string, deviceId: string, signer: string, data: RecordTree, timestamp: string) {
  const { groupId, targetId, targetType } = moderationReference(data);
  const group = ownAt(root, "e2eeGroups", groupId);
  const device = ownAt(root, "e2eeAccounts", uid, "devices", deviceId);
  if (!ownAt(device, "active") || ownAt(device, "signingPublicKey") !== signer || ownAt(group, "ownerId") !== uid || !ownAt(group, "members", uid) || ownAt(root, "e2eeDepartures", groupId, uid)) {
    throw new HttpsError("permission-denied", "Only the current community owner can remove shared content.");
  }
  if (ownAt(root, "e2eePolicy", "sharedWritesFrozen") || ownAt(root, "e2eeGroupLocks", groupId)) throw new HttpsError("failed-precondition", "Community writes are temporarily locked.");
  if (ownAt(root, "moderationTombstones", groupId, targetType, targetId)) return root;
  const store = ownAt(root, "encryptedData") ?? {};
  const target = ownAt(store, collectionFor[targetType], groupId, targetId);
  if (!target) throw new HttpsError("not-found", "Shared content is no longer available.");
  if (typeof target.userId !== "string" || target.userId === uid) throw new HttpsError("failed-precondition", "Use author deletion for your own content.");
  if (target.groupId && target.groupId !== groupId) throw new HttpsError("failed-precondition", "Content belongs to another community.");
  if (targetType === "check_in" && target.visibility !== "group") throw new HttpsError("failed-precondition", "Only shared check-ins can be moderated.");
  const tombstone = (type: ModerationTarget, id: string) => {
    put(ensureMap(root, "moderationTombstones", groupId, type), id, { removedAt: timestamp });
  };
  tombstone(targetType, targetId);
  const replyIds = new Set<string>(targetType === "reply" ? [targetId] : []);
  if (targetType !== "reply") {
    for (const [id, reply] of Object.entries(ownAt(store, "replies", groupId) ?? {}) as [string, RecordTree][]) {
      if (reply.targetType === targetType && reply.targetId === targetId) { replyIds.add(id); tombstone("reply", id); }
    }
  }
  const matches = (record: RecordTree) => (targetType !== "reply" && record.targetType === targetType && record.targetId === targetId)
    || (record.targetType === "reply" && replyIds.has(record.targetId));
  for (const id of replyIds) delete ownAt(store, "replies", groupId)?.[id];
  for (const name of ["prayerReactions", "postReactions"]) {
    const records = ownAt(store, name, groupId);
    for (const [id, record] of Object.entries(records ?? {}) as [string, RecordTree][]) if (matches(record)) delete records[id];
  }
  if (targetType !== "reply") delete ownAt(store, "discussionFollowers", groupId, targetType)?.[targetId];
  for (const follows of Object.values(ownAt(store, "userDiscussionFollows") ?? {}) as RecordTree[]) {
    const records = ownAt(follows, groupId);
    for (const [id, follow] of Object.entries(records ?? {}) as [string, RecordTree][]) if (matches(follow)) delete records[id];
  }
  for (const notices of Object.values(ownAt(store, "activityNotifications") ?? {}) as RecordTree[]) {
    for (const [id, notice] of Object.entries(notices) as [string, RecordTree][]) {
      if (notice.groupId === groupId && (matches(notice) || replyIds.has(notice.replyId))) delete notices[id];
    }
  }
  if (targetType === "check_in") {
    // Keep the original daily claim; a moderator removal is not author deletion.
    const claims = ownAt(store, "checkInDailyClaims", target.userId, groupId) ?? {};
    const days = new Set<string>(typeof target.dayKey === "string" ? [target.dayKey] : []);
    for (const [day, claim] of Object.entries(claims) as [string, RecordTree][]) if (claim.checkInId === targetId) days.add(day);
    if (!days.size) throw new HttpsError("failed-precondition", "Check-in daily claim is missing; removal requires repair.");
    const moderatedDays = ensureMap(root, "moderatedCheckInDays", target.userId, groupId);
    const dailyClaims = ensureMap(store, "checkInDailyClaims", target.userId, groupId);
    for (const day of days) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (claims[day]?.checkInId && claims[day].checkInId !== targetId)) throw new HttpsError("failed-precondition", "Check-in daily claim is inconsistent; removal requires repair.");
      put(moderatedDays, day, true);
      put(dailyClaims, day, { ...(claims[day] ?? { dayKey: day, checkInId: targetId, visibility: "group", createdAt: Date.parse(target.createdAt) || Date.parse(timestamp) }), status: "committed", moderated: true });
    }
  }
  delete ownAt(store, collectionFor[targetType], groupId)[targetId];
  put(ensureMap(root, "moderationActions", groupId, targetType), targetId, { actorUserId: uid, authorUserId: target.userId, targetType, targetId, action: "remove", createdAt: timestamp });
  return root;
}
