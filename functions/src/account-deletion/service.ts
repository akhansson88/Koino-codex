import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { adminApp, firestore } from "../firebase-admin";
import { emulatorTestConfiguration } from "../emulator-safety";
import { GROUP_AUTHORED_COLLECTIONS, USER_COLLECTIONS } from "./manifest";

type Obj = Record<string, any>;
type TargetType = "post" | "check_in" | "reply" | "event";
type Target = { groupId: string; targetType: TargetType; targetId: string };
type CommunityMember = { id: string; name: string };
type OwnedCommunity = { id: string; name: string; members: CommunityMember[] };
type DeletionJob = {
  uid: string;
  status: "pending" | "running" | "completed" | "failed";
  requestedAt: string;
  attempts: number;
  steps: Record<string, boolean>;
  lastErrorCode?: string;
  completedAt?: string;
  authDeleted?: boolean;
};

const db = () => getDatabase(adminApp);
const ROOTS = ["", "encryptedData"] as const;
const JOB_COLLECTION = "accountDeletionJobs";
const LEDGER_COLLECTION = "accountDeletionLedger";
const DELETION_VERSION = 1;
const REAUTH_WINDOW_SECONDS = 5 * 60;
const DELETION_PHRASES = new Set(["RADERA MITT KONTO", "DELETE MY ACCOUNT"]);
const PEPPER = process.env.KOINO_DELETION_PEPPER ?? "koino-account-deletion-v1";

const isObject = (value: unknown): value is Obj => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const timestamp = () => new Date().toISOString();
const uidHash = (uid: string) => createHash("sha256").update(`${uid}:${PEPPER}`).digest("hex");
const errorCode = (error: unknown) => {
  const value = error as { code?: unknown; name?: unknown };
  const code = typeof value?.code === "string" ? value.code : typeof value?.name === "string" ? value.name : "UNKNOWN";
  return code.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
};

async function read(path: string): Promise<Obj | null> {
  const value = (await db().ref(path).get()).val();
  return isObject(value) ? value : null;
}

async function readJob(uid: string): Promise<DeletionJob | null> {
  const value = await read(`${JOB_COLLECTION}/${uid}`);
  return value as DeletionJob | null;
}

async function writeJob(uid: string, patch: Obj) {
  await db().ref(`${JOB_COLLECTION}/${uid}`).update(patch);
}

async function createJob(uid: string): Promise<DeletionJob> {
  const existing = await readJob(uid);
  if (existing) return existing;
  const job: DeletionJob = {
    uid,
    status: "pending",
    requestedAt: timestamp(),
    attempts: 0,
    steps: {},
  };
  await db().ref(`${JOB_COLLECTION}/${uid}`).set(job);
  return job;
}

type Match = { path: string; record: Obj };

async function collectMatches(basePath: string, predicate: (record: Obj, path: string) => boolean): Promise<Match[]> {
  const root = await read(basePath);
  if (!root) return [];
  const matches: Match[] = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (!isObject(value) || depth > 5) return;
    const record = value;
    const hasOwner =
      typeof record.userId === "string" ||
      typeof record.actorUserId === "string" ||
      typeof record.authorUserId === "string" ||
      typeof record.recipientUserId === "string";
    if (hasOwner) {
      if (predicate(record, path)) matches.push({ path, record });
      return;
    }
    for (const [key, child] of Object.entries(record)) visit(child, `${path}/${key}`, depth + 1);
  };
  visit(root, basePath, 0);
  return matches;
}

class DeletionWriter {
  private readonly paths = new Set<string>();

  add(path: string) {
    const clean = path.replace(/\/+$/, "");
    if (clean) this.paths.add(clean);
  }

  addTree(path: string) {
    this.add(path);
  }

  get size() {
    return this.paths.size;
  }

  private pruned(): string[] {
    const ordered = [...this.paths].sort((left, right) => left.length - right.length || left.localeCompare(right));
    const kept: string[] = [];
    for (const path of ordered) {
      if (kept.some((parent) => path === parent || path.startsWith(`${parent}/`))) continue;
      kept.push(path);
    }
    return kept;
  }

  async commit(): Promise<number> {
    const paths = this.pruned();
    let removed = 0;
    for (let start = 0; start < paths.length; start += 400) {
      const chunk = paths.slice(start, start + 400);
      const updates: Record<string, null> = {};
      for (const path of chunk) updates[path] = null;
      await db().ref().update(updates);
      removed += chunk.length;
    }
    return removed;
  }
}

async function groupIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const base of ["e2eeGroups", "encryptedData/groups", "groups", "groupMembers", "encryptedData/groupMembers"]) {
    const value = await read(base);
    for (const id of Object.keys(value ?? {})) ids.add(id);
  }
  return [...ids].sort();
}

async function groupName(groupId: string): Promise<string> {
  for (const path of [`encryptedData/groups/${groupId}`, `groups/${groupId}`, `e2eeGroups/${groupId}`]) {
    const group = await read(path);
    if (typeof group?.name === "string" && group.name.trim()) return group.name.trim();
  }
  return groupId;
}

async function groupMembers(groupId: string): Promise<CommunityMember[]> {
  const records = (await read(`encryptedData/groupMembers/${groupId}`)) ?? (await read(`groupMembers/${groupId}`)) ?? {};
  const members: CommunityMember[] = [];
  for (const [id, value] of Object.entries(records)) {
    if (!isObject(value)) continue;
    members.push({ id, name: typeof value.userName === "string" ? value.userName : typeof value.name === "string" ? value.name : "KOINO member" });
  }
  if (members.length) return members.sort((left, right) => left.name.localeCompare(right.name));

  const group = (await read(`e2eeGroups/${groupId}`)) ?? {};
  const memberMap = isObject(group.members) ? group.members : {};
  for (const id of Object.keys(memberMap)) {
    const profile = (await read(`encryptedData/profiles/${id}`)) ?? (await read(`profiles/${id}`)) ?? {};
    members.push({ id, name: typeof profile.name === "string" ? profile.name : "KOINO member" });
  }
  return members.sort((left, right) => left.name.localeCompare(right.name));
}

async function groupOwner(groupId: string): Promise<string | undefined> {
  for (const path of [`encryptedData/groups/${groupId}`, `groups/${groupId}`, `e2eeGroups/${groupId}`]) {
    const group = await read(path);
    if (typeof group?.ownerId === "string") return group.ownerId;
  }
  return undefined;
}

export async function ownedCommunities(uid: string): Promise<OwnedCommunity[]> {
  const communities: OwnedCommunity[] = [];
  for (const groupId of await groupIds()) {
    if ((await groupOwner(groupId)) !== uid) continue;
    const members = (await groupMembers(groupId)).filter((member) => member.id !== uid);
    communities.push({ id: groupId, name: await groupName(groupId), members });
  }
  return communities.sort((left, right) => left.name.localeCompare(right.name));
}

async function assertNoOwnedCommunities(uid: string) {
  const communities = await ownedCommunities(uid);
  if (communities.length) {
    throw new HttpsError("failed-precondition", "OWNED_COMMUNITIES", { communities });
  }
}

function relativePath(base: string, path: string): string {
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
}

function targetKey(groupId: string, targetType: string, targetId: string) {
  return `${groupId}:${targetType}:${targetId}`;
}

function addTarget(targets: Map<string, Target>, groupId: string, targetType: string, targetId: unknown) {
  if (typeof targetId !== "string" || !targetId) return;
  if (targetType !== "post" && targetType !== "check_in" && targetType !== "reply" && targetType !== "event") return;
  const target: Target = { groupId, targetType, targetId };
  targets.set(targetKey(groupId, targetType, targetId), target);
}

function recordTargets(targets: Map<string, Target>, groupId: string, record: Obj): boolean {
  const targetType = record.targetType;
  const targetId = record.targetId;
  if (typeof targetType !== "string" || typeof targetId !== "string") return false;
  return targets.has(targetKey(groupId, targetType, targetId));
}

function addUserPath(writer: DeletionWriter, path: string, mirrored: boolean) {
  writer.add(path);
  if (mirrored) writer.add(`encryptedData/${path}`);
}

async function deletePrivateData(uid: string): Promise<number> {
  const writer = new DeletionWriter();
  for (const entry of USER_COLLECTIONS) {
    if (entry.collection === "profiles") continue;
    const path = entry.path.replace("{uid}", uid);
    if (entry.collection === "e2eeAccounts") continue;
    const mirrored = !entry.collection.startsWith("e2ee") && entry.collection !== "legacyUndecryptable" && entry.collection !== "moderatedCheckInDays";
    addUserPath(writer, path, mirrored);
  }
  writer.add(`encryptedData/pushDeliveryDiagnostics/${uid}`);
  for (const match of await collectMatches("pendingExpoPushReceipts", (record) => record.recipientUserId === uid)) {
    writer.add(match.path);
  }
  return writer.commit();
}

async function deleteGroupContent(uid: string): Promise<Map<string, Target>> {
  const writer = new DeletionWriter();
  const targets = new Map<string, Target>();

  for (const { collection, cascade } of GROUP_AUTHORED_COLLECTIONS) {
    for (const root of ROOTS) {
      const base = root ? `${root}/${collection}` : collection;
      const matches = await collectMatches(base, (record, path) => {
        if (record.userId === uid) return true;
        return collection === "discussionFollowers" && path.endsWith(`/${uid}`);
      });
      for (const match of matches) {
        writer.add(match.path);
        if (!cascade) continue;
        const groupId = relativePath(base, match.path).split("/")[0];
        const recordId = match.record.id ?? match.path.split("/").pop();
        if (collection === "posts") addTarget(targets, groupId, "post", recordId);
        if (collection === "checkIns") addTarget(targets, groupId, "check_in", recordId);
        if (collection === "replies") addTarget(targets, groupId, "reply", recordId);
        if (collection === "groupEvents") addTarget(targets, groupId, "event", recordId);
      }
    }
  }

  // Remove replies to authored posts and check-ins, then reactions and
  // notifications that point at any removed target.
  for (const root of ROOTS) {
    const repliesBase = root ? `${root}/replies` : "replies";
    const replies = await collectMatches(repliesBase, (record, path) => {
      const groupId = relativePath(repliesBase, path).split("/")[0];
      return recordTargets(targets, groupId, record);
    });
    for (const match of replies) {
      writer.add(match.path);
      const groupId = relativePath(repliesBase, match.path).split("/")[0];
      addTarget(targets, groupId, "reply", match.record.id ?? match.path.split("/").pop());
    }
  }

  for (const collection of ["prayerReactions", "postReactions"]) {
    for (const root of ROOTS) {
      const base = root ? `${root}/${collection}` : collection;
      const matches = await collectMatches(base, (record, path) => {
        const groupId = relativePath(base, path).split("/")[0];
        return recordTargets(targets, groupId, record);
      });
      for (const match of matches) writer.add(match.path);
    }
  }

  for (const target of targets.values()) {
    for (const root of ROOTS) {
      const prefix = root ? `${root}/` : "";
      if (target.targetType === "event") {
        writer.add(`${prefix}eventRsvps/${target.groupId}/${target.targetId}`);
        writer.add(`eventReminderDeliveries/${target.groupId}/${target.targetId}`);
      } else {
        writer.add(`${prefix}discussionFollowers/${target.groupId}/${target.targetType}/${target.targetId}`);
      }
    }
  }

  for (const root of ROOTS) {
    const base = root ? `${root}/userDiscussionFollows` : "userDiscussionFollows";
    const matches = await collectMatches(base, (record, path) => {
      const parts = relativePath(base, path).split("/");
      const groupId = parts[1] ?? "";
      return recordTargets(targets, groupId, record);
    });
    for (const match of matches) writer.add(match.path);
  }

  for (const collection of ["activityNotifications", "prayerNotifications"]) {
    for (const root of ROOTS) {
      const base = root ? `${root}/${collection}` : collection;
      const matches = await collectMatches(base, (record, path) => {
        void path;
        if (record.actorUserId === uid || record.userId === uid || record.recipientUserId === uid) return true;
        const groupId = typeof record.groupId === "string" ? record.groupId : "";
        if (recordTargets(targets, groupId, record)) return true;
        return typeof record.replyId === "string" && targets.has(targetKey(groupId, "reply", record.replyId));
      });
      for (const match of matches) writer.add(match.path);
    }
  }

  for (const root of ROOTS) {
    const base = root ? `${root}/moderationActions` : "moderationActions";
    const matches = await collectMatches(base, (record) => record.authorUserId === uid || record.actorUserId === uid);
    for (const match of matches) writer.add(match.path);
  }

  await writer.commit();
  return targets;
}

async function deleteMemberships(uid: string): Promise<number> {
  const writer = new DeletionWriter();
  const ids = await groupIds();
  writer.add(`userGroups/${uid}`);
  writer.add(`encryptedData/userGroups/${uid}`);
  for (const groupId of ids) {
    writer.add(`groupMembers/${groupId}/${uid}`);
    writer.add(`encryptedData/groupMembers/${groupId}/${uid}`);
    writer.add(`e2eeJoinRequests/${groupId}/${uid}`);
    writer.add(`e2eeDepartures/${groupId}/${uid}`);
    writer.add(`e2eeGroups/${groupId}/members/${uid}`);
  }
  return writer.commit();
}

async function deleteNotifications(uid: string, targets: Map<string, Target>): Promise<number> {
  const writer = new DeletionWriter();
  for (const root of ROOTS) {
    const prefix = root ? `${root}/` : "";
    writer.add(`${prefix}activityNotifications/${uid}`);
    writer.add(`${prefix}prayerNotifications/${uid}`);
  }
  for (const collection of ["activityNotifications", "prayerNotifications"]) {
    for (const root of ROOTS) {
      const base = root ? `${root}/${collection}` : collection;
      const matches = await collectMatches(base, (record, path) => {
        void path;
        return record.actorUserId === uid || record.userId === uid || record.recipientUserId === uid;
      });
      for (const match of matches) writer.add(match.path);
    }
  }
  for (const target of targets.values()) {
    for (const root of ROOTS) {
      const prefix = root ? `${root}/` : "";
      if (target.targetType === "event") {
        writer.add(`${prefix}eventRsvps/${target.groupId}/${target.targetId}`);
        writer.add(`eventReminderDeliveries/${target.groupId}/${target.targetId}`);
      } else {
        writer.add(`${prefix}discussionFollowers/${target.groupId}/${target.targetType}/${target.targetId}`);
      }
    }
  }
  return writer.commit();
}

async function deletePayments(uid: string): Promise<number> {
  // Firestore is not part of the Auth/Database emulator suite. The same guard
  // also protects local runs against the real Firestore project.
  if (emulatorTestConfiguration() || process.env.FIREBASE_DATABASE_EMULATOR_HOST) return 0;
  const snapshot = await firestore.collection("supportPayments").where("userId", "==", uid).get();
  if (snapshot.empty) return 0;
  const batch = firestore.batch();
  let count = 0;
  for (const document of snapshot.docs) {
    const data = document.data();
    if (data.status === "succeeded") {
      batch.update(document.ref, { userId: null, anonymizedAt: Timestamp.now() });
    } else {
      batch.delete(document.ref);
    }
    count += 1;
  }
  await batch.commit();
  return count;
}

async function deleteLegacy(uid: string): Promise<number> {
  const writer = new DeletionWriter();
  const account = await read(`e2eeAccounts/${uid}`);
  writer.add(`e2eeAccounts/${uid}`);
  writer.add(`e2eeEscrow/${uid}`);
  writer.add(`e2eeDeviceRequests/${uid}`);
  writer.add(`e2eeRequests/${uid}`);
  writer.add(`e2eeMigrations/user/${uid}`);
  writer.add(`e2eeMigrationGroups/${uid}`);
  writer.add(`e2eeImageObjects/user-avatars/${uid}`);
  const devices = isObject(account?.devices) ? account.devices : {};
  for (const device of Object.values(devices)) {
    if (isObject(device) && typeof device.signingPublicKey === "string") writer.add(`e2eeSigners/${device.signingPublicKey}`);
  }
  if (typeof account?.signingPublicKey === "string") writer.add(`e2eeSigners/${account.signingPublicKey}`);
  return writer.commit();
}

async function deleteProfile(uid: string): Promise<number> {
  const writer = new DeletionWriter();
  for (const root of ROOTS) {
    const prefix = root ? `${root}/` : "";
    writer.add(`${prefix}profiles/${uid}`);
  }
  return writer.commit();
}

async function deleteAuthUser(uid: string): Promise<void> {
  try {
    await getAuth(adminApp).deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }
}

async function writeLedger(uid: string) {
  const key = uidHash(uid);
  await db().ref(`${LEDGER_COLLECTION}/${key}`).set({
    deletedAt: timestamp(),
    dataVersion: DELETION_VERSION,
  });
}

async function runStep(uid: string, name: string, action: () => Promise<unknown>) {
  try {
    const result = await action();
    const removed = typeof result === "number" ? result : undefined;
    await writeJob(uid, { [`steps/${name}`]: true, ...(removed === undefined ? {} : { [`counts/${name}`]: removed }) });
    logger.info("KOINO account deletion step", { uidHash: uidHash(uid), step: name, removed });
    return result;
  } catch (error) {
    logger.error("KOINO account deletion step failed", { uidHash: uidHash(uid), step: name, code: errorCode(error) });
    throw error;
  }
}

export async function runAccountDeletion(uid: string): Promise<void> {
  const existing = await readJob(uid);
  if (existing?.status === "completed") return;

  const job = existing ?? (await createJob(uid));
  await writeJob(uid, {
    status: "running",
    attempts: Number(job.attempts ?? 0) + 1,
    requestedAt: job.requestedAt ?? timestamp(),
    lastErrorCode: null,
  });

  try {
    await assertNoOwnedCommunities(uid);
    try {
      await getAuth(adminApp).revokeRefreshTokens(uid);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    }
    await runStep(uid, "privateData", () => deletePrivateData(uid));
    const targets = await runStep(uid, "groupContent", () => deleteGroupContent(uid)) as Map<string, Target>;
    await runStep(uid, "membership", () => deleteMemberships(uid));
    await runStep(uid, "notifications", () => deleteNotifications(uid, targets));
    await runStep(uid, "payments", () => deletePayments(uid));
    await runStep(uid, "legacy", () => deleteLegacy(uid));
    await runStep(uid, "profile", () => deleteProfile(uid));
    await runStep(uid, "auth", () => deleteAuthUser(uid));
    await writeLedger(uid);
    await writeJob(uid, { status: "completed", completedAt: timestamp(), authDeleted: true, lastErrorCode: null });
    logger.info("KOINO account deletion completed", { uidHash: uidHash(uid), attempts: job.attempts + 1 });
  } catch (error) {
    const code = errorCode(error);
    await writeJob(uid, { status: "failed", lastErrorCode: code });
    logger.error("KOINO account deletion failed", { uidHash: uidHash(uid), code });
    throw error;
  }
}

export async function accountDeletionPreflight(uid: string) {
  return { communities: await ownedCommunities(uid) };
}

export async function accountDeletionStatus(uid: string) {
  const job = await readJob(uid);
  const ledger = await read(`${LEDGER_COLLECTION}/${uidHash(uid)}`);
  return {
    status: job?.status ?? (ledger ? "completed" : "none"),
    requestedAt: job?.requestedAt ?? null,
    completedAt: job?.completedAt ?? (typeof ledger?.deletedAt === "string" ? ledger.deletedAt : null),
    lastErrorCode: job?.lastErrorCode ?? null,
  };
}

export function assertDeletionPhrase(value: unknown): string {
  if (typeof value !== "string") throw new HttpsError("invalid-argument", "CONFIRMATION_REQUIRED");
  const phrase = value.trim().replace(/\s+/g, " ").toUpperCase();
  if (!DELETION_PHRASES.has(phrase)) throw new HttpsError("invalid-argument", "CONFIRMATION_REQUIRED");
  return phrase;
}

export function assertRecentAuthentication(authTime: unknown) {
  const seconds = typeof authTime === "number" ? authTime : 0;
  if (seconds < Date.now() / 1000 - REAUTH_WINDOW_SECONDS) {
    throw new HttpsError("failed-precondition", "REAUTH_REQUIRED");
  }
}

export async function pendingDeletionJobs(): Promise<string[]> {
  const jobs = await read(JOB_COLLECTION);
  if (!jobs) return [];
  const cutoff = Date.now() - 5 * 60 * 1000;
  const pending: string[] = [];
  for (const [uid, value] of Object.entries(jobs)) {
    if (!isObject(value)) continue;
    const status = value.status;
    const requestedAt = typeof value.requestedAt === "string" ? Date.parse(value.requestedAt) : 0;
    if (status === "pending" || status === "failed" || (status === "running" && requestedAt < cutoff)) pending.push(uid);
  }
  return pending;
}

export async function purgeOldFinancialRecords(): Promise<number> {
  if (emulatorTestConfiguration() || process.env.FIREBASE_DATABASE_EMULATOR_HOST) return 0;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 7);
  const snapshot = await firestore.collection("supportPayments").where("anonymizedAt", "<=", Timestamp.fromDate(cutoff)).get();
  if (snapshot.empty) return 0;
  const batch = firestore.batch();
  for (const document of snapshot.docs) batch.delete(document.ref);
  await batch.commit();
  return snapshot.size;
}
