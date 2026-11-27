import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { adminApp } from "./firebase-admin";

const REGION = "europe-west1";
const MAX_BYTES = 1_572_864;
const MAX_CLIPS_PER_DAY = 30;
const MAX_BYTES_PER_DAY = 60 * 1024 * 1024;
const UPLOAD_URL_TTL_MS = 10 * 60_000;
const DOWNLOAD_URL_TTL_MS = 15 * 60_000;
const CLIP_ID = /^clip_[a-z0-9]{6,40}$/;
const AUDIO_PATH = /^audio\/(users|groups)\/([A-Za-z0-9_-]{1,128})\/(clip_[a-z0-9]{6,40})\.m4a$/;

const bucketByProject: Record<string, string> = {
  "koino-codex": "koino-codex-audio-181081151239",
  "koino-dev": "koino-dev-audio-97611993234",
};

type Scope = "user" | "group";

type AudioRequest =
  | { operation: "createUpload"; scope: Scope; groupId?: string; clipId: string; bytes: number }
  | { operation: "finalizeUpload"; path: string }
  | { operation: "createDownload"; path: string }
  | { operation: "delete"; path: string }
  | { operation: "copyForShare"; sourcePath: string; groupId: string; clipId: string }
  | { operation: "copyForPrivate"; sourcePath: string; clipId: string };

function invalid(message = "Invalid audio request."): never {
  throw new HttpsError("invalid-argument", message);
}

function denied(message = "You do not have access to this recording."): never {
  throw new HttpsError("permission-denied", message);
}

function audioBucket() {
  const project = process.env.GCLOUD_PROJECT;
  const bucket = project ? bucketByProject[project] : undefined;
  if (!bucket) throw new HttpsError("failed-precondition", "Audio storage is not configured for this project.");
  return getStorage(adminApp).bucket(bucket);
}

function parsePath(value: unknown) {
  if (typeof value !== "string") invalid();
  const match = AUDIO_PATH.exec(value);
  if (!match) invalid();
  return {
    path: value,
    scope: match[1] === "users" ? "user" as const : "group" as const,
    ownerId: match[2],
    clipId: match[3],
  };
}

async function requireGroup(groupId: string, uid: string, moderator = false) {
  const database = getDatabase(adminApp);
  const [groupSnapshot, departureSnapshot] = await Promise.all([
    database.ref(`e2eeGroups/${groupId}`).get(),
    database.ref(`e2eeDepartures/${groupId}/${uid}`).get(),
  ]);
  if (departureSnapshot.exists()) denied();
  const group = groupSnapshot.val() as { ownerId?: string; members?: Record<string, { role?: string }> } | null;
  const member = group?.members?.[uid];
  if (!group || !member) denied();
  if (moderator && group.ownerId !== uid && member.role !== "leader") denied();
  return group;
}

async function assertUploadAllowed(scope: Scope, ownerId: string, uid: string) {
  if (scope === "user") {
    if (ownerId !== uid) denied();
    return;
  }
  await requireGroup(ownerId, uid);
  const lock = await getDatabase(adminApp).ref(`e2eeGroupLocks/${ownerId}`).get();
  if (lock.exists()) throw new HttpsError("unavailable", "This community is temporarily locked.");
}

async function takeUploadTicket(uid: string, bytes: number) {
  const day = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const reference = getDatabase(adminApp).ref(`audioTickets/${uid}/${day}`);
  const result = await reference.transaction((current: { count?: number; bytes?: number } | null) => {
    const count = Number(current?.count ?? 0);
    const used = Number(current?.bytes ?? 0);
    if (count >= MAX_CLIPS_PER_DAY || used + bytes > MAX_BYTES_PER_DAY) return undefined;
    return { count: count + 1, bytes: used + bytes, updatedAt: new Date().toISOString() };
  });
  if (!result.committed) throw new HttpsError("resource-exhausted", "Daily audio limit reached. Try again tomorrow.");
}

export const koinoAudio = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to record audio.");
  const data = request.data as AudioRequest | null;
  if (!data || typeof data !== "object" || typeof data.operation !== "string") invalid();

  const bucket = audioBucket();

  switch (data.operation) {
    case "createUpload": {
      if (data.scope !== "user" && data.scope !== "group") invalid();
      if (!Number.isSafeInteger(data.bytes) || data.bytes <= 0 || data.bytes > MAX_BYTES) invalid("Invalid recording size.");
      if (typeof data.clipId !== "string" || !CLIP_ID.test(data.clipId)) invalid("Invalid recording id.");
      let ownerId = uid;
      if (data.scope === "group") {
        if (typeof data.groupId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(data.groupId)) invalid("Invalid community.");
        ownerId = data.groupId;
      }
      await assertUploadAllowed(data.scope, ownerId, uid);
      await takeUploadTicket(uid, data.bytes);

      const path = `audio/${data.scope === "user" ? "users" : "groups"}/${ownerId}/${data.clipId}.m4a`;
      const file = bucket.file(path);
      const [uploadUrl] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + UPLOAD_URL_TTL_MS,
        contentType: "audio/mp4",
        extensionHeaders: { "x-goog-content-length-range": `0,${MAX_BYTES}` },
      });
      return {
        path,
        uploadUrl,
        headers: {
          "Content-Type": "audio/mp4",
          "x-goog-content-length-range": `0,${MAX_BYTES}`,
        },
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_MS).toISOString(),
      };
    }

    case "finalizeUpload": {
      const { path, scope, ownerId } = parsePath(data.path);
      if (scope === "user" && ownerId !== uid) denied();
      if (scope === "group") await requireGroup(ownerId, uid);
      const file = bucket.file(path);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size ?? 0);
      const contentType = String(metadata.contentType ?? "");
      if (size <= 0 || size > MAX_BYTES || contentType !== "audio/mp4") {
        await file.delete({ ignoreNotFound: true }).catch(() => undefined);
        throw new HttpsError("invalid-argument", "The uploaded recording is not a valid audio file.");
      }
      return { bytes: size, contentType };
    }

    case "createDownload": {
      const { path, scope, ownerId } = parsePath(data.path);
      if (scope === "user" && ownerId !== uid) denied();
      if (scope === "group") await requireGroup(ownerId, uid);
      const [url] = await bucket.file(path).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + DOWNLOAD_URL_TTL_MS,
      });
      return { url, expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_MS).toISOString() };
    }

    case "delete": {
      const { path, scope, ownerId } = parsePath(data.path);
      if (scope === "user" && ownerId !== uid) denied();
      if (scope === "group") await requireGroup(ownerId, uid, true);
      await bucket.file(path).delete({ ignoreNotFound: true });
      return {};
    }

    case "copyForShare": {
      if (typeof data.groupId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(data.groupId)) invalid("Invalid community.");
      if (typeof data.clipId !== "string" || !CLIP_ID.test(data.clipId)) invalid("Invalid recording id.");
      const source = parsePath(data.sourcePath);
      if (source.scope !== "user" || source.ownerId !== uid) denied();
      await requireGroup(data.groupId, uid);
      const destination = `audio/groups/${data.groupId}/${data.clipId}.m4a`;
      await bucket.file(source.path).copy(bucket.file(destination));
      return { path: destination };
    }

    case "copyForPrivate": {
      if (typeof data.clipId !== "string" || !CLIP_ID.test(data.clipId)) invalid("Invalid recording id.");
      const source = parsePath(data.sourcePath);
      if (source.scope === "group") await requireGroup(source.ownerId, uid);
      else if (source.ownerId !== uid) denied();
      const destination = `audio/users/${uid}/${data.clipId}.m4a`;
      await bucket.file(source.path).copy(bucket.file(destination));
      return { path: destination };
    }

    default:
      return invalid("Unsupported audio operation.");
  }
});
