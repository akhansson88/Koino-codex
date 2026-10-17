import * as Raw from "firebase/database";
import { updateProfile } from "firebase/auth";
import { auth, database } from "@/state/store/firebase";
import { policies } from "./schema";
import { encodeAt, decodeAt, set, ref, physicalPath } from "./database";
import { crypto, session, sessionGeneration, encryptedOperation, groupJoinRequest } from "./session";
import storage from "./local-storage";
import { uploadRoomImage, uploadUserAvatar, deleteUserAvatar } from "@/state/supabase-storage";
import { legacyPersonalCollections, legacyGroupCollections } from "./legacy-collections";
export { listenLegacyCommunities, type LegacyCommunitySnapshot } from "./legacy-communities";

export type MigrationProgress = (message: string) => void;
const personalCompletionKey = (uid: string) => `e2ee.migration-complete.user.${uid}`;
function migrationGuard() {
  const uid = session().uid, token = sessionGeneration();
  return () => { if (auth.currentUser?.uid !== uid || sessionGeneration() !== token) throw new Error("The account changed while preparing encrypted history."); };
}
export async function personalMigrationComplete() {
  const uid = session().uid;
  const ensureCurrent = migrationGuard();
  const cached = await storage.getItem(personalCompletionKey(uid));
  ensureCurrent();
  if (cached === "true") return true;
  const complete = (await Raw.get(Raw.ref(database, `e2eeMigrations/user/${uid}/status`))).val() === "complete";
  ensureCurrent();
  if (complete) await storage.setItem(personalCompletionKey(uid), "true");
  return complete;
}

const digest = (value: unknown) => {
  // Match the server's libsodium hash of canonical JSON, including legacy arrays.
  return import("react-native-libsodium").then(({ default: sodium }) => sodium.to_hex(sodium.crypto_generichash(32, crypto.canonical(value), null)));
};
async function deleteSource(path: string, source: unknown) {
  const ensureCurrent = migrationGuard();
  const sourceDigest = await digest(source);
  ensureCurrent();
  await encryptedOperation("deleteLegacyBatch", { records: [{ path, digest: sourceDigest }] });
}
async function archiveRetiredCollections(kind: "user" | "group", target: string, progress: MigrationProgress) {
  const ensureCurrent = migrationGuard();
  for (const collection of kind === "user" ? legacyPersonalCollections : legacyGroupCollections) {
    ensureCurrent();
    const { source } = await encryptedOperation<{ source: unknown }>("readLegacyArchive", { kind, target, collection });
    ensureCurrent();
    if (source === null) continue;
    progress("Encrypting older account history…");
    const path = `${kind === "user" ? "legacyUserArchives" : "legacyGroupArchives"}/${target}/${collection}`;
    const archive = { sourceCollection: collection, createdAt: new Date().toISOString(), ...(kind === "group" ? { userId: session().uid } : {}), content: JSON.stringify(source) };
    await set(ref(database, path), archive);
    ensureCurrent();
    const restored = decodeAt(path, (await Raw.get(Raw.ref(database, physicalPath(path)))).val()) as typeof archive;
    ensureCurrent();
    if (crypto.canonical(JSON.parse(restored.content)) !== crypto.canonical(source)) throw new Error("Older history verification failed. Original data has been preserved.");
    await deleteSource(`${collection}/${target}`, source);
  }
}
async function migrateImage(image: any, bucket: "room-images" | "user-avatars") {
  if (!image || image.encryption) return image;
  const ensureCurrent = migrationGuard();
  const cacheKey = `e2ee.image-migration.${session().uid}.${bucket}.${image.path}`;
  const cached = await storage.getItem(cacheKey);
  ensureCurrent();
  if (cached) return JSON.parse(cached);
  const response = await encryptedOperation<{ bytes: string }>("legacyImage", { bucket, path: image.path });
  ensureCurrent();
  const bytes = crypto.decode(response.bytes);
  const path = `${image.path.split("/")[0]}/${crypto.randomKey()}.kenc`;
  const uploaded = bucket === "room-images" ? await uploadRoomImage(path, bytes.slice().buffer as ArrayBuffer) : await uploadUserAvatar(path, bytes.slice().buffer as ArrayBuffer);
  ensureCurrent();
  const next = { ...image, ...uploaded, path };
  await storage.setItem(cacheKey, JSON.stringify(next));
  return next;
}
async function copy(path: string, source: unknown, progress: MigrationProgress): Promise<void> {
  if (source === null || source === undefined) return;
  const ensureCurrent = migrationGuard();
  const parts = path.split("/"), definition = policies[parts[0]];
  if (parts.length < definition.depth) {
    for (const [id, value] of Object.entries(source as Record<string, unknown>)) { await copy(`${path}/${id}`, value, progress); ensureCurrent(); }
    return;
  }
  progress(`Encrypting ${parts[0]}…`);
  const content = source && typeof source === "object" ? { ...source } as Record<string, unknown> : source;
  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>;
    if (parts[0] === "profiles") { delete record.email; if (record.image) record.image = await migrateImage(record.image, "user-avatars"); }
    if (parts[0] === "groups" && record.image) record.image = await migrateImage(record.image, "room-images");
    // Images were not authorable by this app's post/journal composer. Retain any
    // unexpected legacy attachment until its source can be safely migrated.
    if (Array.isArray(record.images) && record.images.length) throw new Error("Legacy attachments need migration before this account can be unlocked. Their original data has been preserved.");
    if (parts[0] === "activityNotifications") for (const field of ["actorName", "actorImage", "targetOwnerName", "contentLabel", "preview"]) delete record[field];
  }
  ensureCurrent();
  await set(ref(database, path), content);
  ensureCurrent();
  const stored = (await Raw.get(Raw.ref(database, physicalPath(path)))).val();
  ensureCurrent();
  const restored = decodeAt(path, stored);
  if (crypto.canonical(restored) !== crypto.canonical(JSON.parse(JSON.stringify(content)))) throw new Error("Migration verification failed. Original content has been preserved.");
  if (parts[0] === "profiles" && (source as any).image?.path) await deleteUserAvatar((source as any).image.path);
  await deleteSource(path, source);
}
export async function migratePersonal(progress: MigrationProgress) {
  const state = session();
  const ensureCurrent = migrationGuard();
  const complete = await personalMigrationComplete();
  ensureCurrent();
  if (complete) return;
  await encryptedOperation("beginMigration", { scope: `user:${state.uid}` });
  ensureCurrent();
  await storage.migrateLegacy();
  ensureCurrent();
  for (const [collection, definition] of Object.entries(policies)) {
    if (definition.scope !== "user" && definition.scope !== "routing") continue;
    if (["inviteCodes", "discussionFollowers", "pushDeliveryDiagnostics", "legacyUserArchives"].includes(collection)) continue;
    const path = `${collection}/${state.uid}`;
    const source = (await Raw.get(Raw.ref(database, path))).val();
    ensureCurrent();
    await copy(path, source, progress);
    ensureCurrent();
  }
  const existing = (await Raw.get(Raw.ref(database, `encryptedData/profiles/${state.uid}`))).exists();
  ensureCurrent();
  if (!existing) {
    const name = await storage.getItem(`e2ee.signup-name.${state.uid}`);
    await set(ref(database, `profiles/${state.uid}`), { id: state.uid, name: name?.trim() || auth.currentUser?.displayName || "KOINO member", theme: "light", createdAt: new Date().toISOString() });
  }
  if (auth.currentUser?.displayName) await updateProfile(auth.currentUser, { displayName: null });
  await archiveRetiredCollections("user", state.uid, progress);
  ensureCurrent();
  await encryptedOperation("finishMigration", { scope: `user:${state.uid}` });
  await storage.setItem(personalCompletionKey(state.uid), "true");
}
export async function migrateOwnedGroups(_progress: MigrationProgress) {
  const state = session();
  const ensureCurrent = migrationGuard();
  await storage.clearLegacyCommunities();
  const pending = (await Raw.get(Raw.ref(database, `e2eePendingGroups/${state.uid}`))).val() as Record<string, { inviteCode: string }> | null;
  ensureCurrent();
  if (pending && Object.keys(pending).length) {
    const profile = decodeAt(`profiles/${state.uid}`, (await Raw.get(Raw.ref(database, `encryptedData/profiles/${state.uid}`))).val()) as { name: string };
    ensureCurrent();
    for (const [groupId, entry] of Object.entries(pending)) {
      const request = (await Raw.get(Raw.ref(database, `e2eeJoinRequests/${groupId}/${state.uid}`))).val();
      ensureCurrent();
      if (request?.publicKey === state.vault.identity.publicKey && request?.signingPublicKey === state.vault.identity.signingPublicKey) continue;
      await groupJoinRequest(entry.inviteCode, profile.name);
    }
  }
}
