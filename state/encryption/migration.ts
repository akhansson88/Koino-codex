import * as Raw from "firebase/database";
import { updateProfile } from "firebase/auth";
import { auth, database } from "@/state/store/firebase";
import { policies } from "./schema";
import { encodeAt, decodeAt, set, ref, physicalPath } from "./database";
import { crypto, session, encryptedOperation, createEncryptedGroup, groupJoinRequest, loadGroup } from "./session";
import storage from "./local-storage";
import { uploadRoomImage, uploadUserAvatar, deleteRoomImage, deleteUserAvatar } from "@/state/supabase-storage";
import { legacyPersonalCollections, legacyGroupCollections } from "./legacy-collections";

export type MigrationProgress = (message: string) => void;
const digest = (value: unknown) => {
  // Match the server's libsodium hash of canonical JSON, including legacy arrays.
  return import("react-native-libsodium").then(({ default: sodium }) => sodium.to_hex(sodium.crypto_generichash(32, crypto.canonical(value), null)));
};
async function deleteSource(path: string, source: unknown) {
  await encryptedOperation("deleteLegacyBatch", { records: [{ path, digest: await digest(source) }] });
}
async function archiveRetiredCollections(kind: "user" | "group", target: string, progress: MigrationProgress) {
  for (const collection of kind === "user" ? legacyPersonalCollections : legacyGroupCollections) {
    const { source } = await encryptedOperation<{ source: unknown }>("readLegacyArchive", { kind, target, collection });
    if (source === null) continue;
    progress("Encrypting older account history…");
    const path = `${kind === "user" ? "legacyUserArchives" : "legacyGroupArchives"}/${target}/${collection}`;
    const archive = { sourceCollection: collection, createdAt: new Date().toISOString(), ...(kind === "group" ? { userId: session().uid } : {}), content: JSON.stringify(source) };
    await set(ref(database, path), archive);
    const restored = decodeAt(path, (await Raw.get(Raw.ref(database, physicalPath(path)))).val()) as typeof archive;
    if (crypto.canonical(JSON.parse(restored.content)) !== crypto.canonical(source)) throw new Error("Older history verification failed. Original data has been preserved.");
    await deleteSource(`${collection}/${target}`, source);
  }
}
async function migrateImage(image: any, bucket: "room-images" | "user-avatars") {
  if (!image || image.encryption) return image;
  const cacheKey = `e2ee.image-migration.${session().uid}.${bucket}.${image.path}`;
  const cached = await storage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);
  const response = await encryptedOperation<{ bytes: string }>("legacyImage", { bucket, path: image.path });
  const bytes = crypto.decode(response.bytes);
  const path = `${image.path.split("/")[0]}/${crypto.randomKey()}.kenc`;
  const uploaded = bucket === "room-images" ? await uploadRoomImage(path, bytes.slice().buffer as ArrayBuffer) : await uploadUserAvatar(path, bytes.slice().buffer as ArrayBuffer);
  const next = { ...image, ...uploaded, path };
  await storage.setItem(cacheKey, JSON.stringify(next));
  return next;
}
async function copy(path: string, source: unknown, progress: MigrationProgress): Promise<void> {
  if (source === null || source === undefined) return;
  const parts = path.split("/"), definition = policies[parts[0]];
  if (parts.length < definition.depth) {
    for (const [id, value] of Object.entries(source as Record<string, unknown>)) await copy(`${path}/${id}`, value, progress);
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
  await set(ref(database, path), content);
  const stored = (await Raw.get(Raw.ref(database, physicalPath(path)))).val();
  const restored = decodeAt(path, stored);
  if (crypto.canonical(restored) !== crypto.canonical(JSON.parse(JSON.stringify(content)))) throw new Error("Migration verification failed. Original content has been preserved.");
  if (parts[0] === "profiles" && (source as any).image?.path) await deleteUserAvatar((source as any).image.path);
  await deleteSource(path, source);
}
export async function migratePersonal(progress: MigrationProgress) {
  const state = session();
  const status = (await Raw.get(Raw.ref(database, `e2eeMigrations/user/${state.uid}`))).val();
  if (status?.status === "complete") return;
  await encryptedOperation("beginMigration", { scope: `user:${state.uid}` });
  await storage.migrateLegacy();
  for (const [collection, definition] of Object.entries(policies)) {
    if (definition.scope !== "user" && definition.scope !== "routing") continue;
    if (["inviteCodes", "discussionFollowers", "pushDeliveryDiagnostics", "legacyUserArchives"].includes(collection)) continue;
    const path = `${collection}/${state.uid}`;
    const source = (await Raw.get(Raw.ref(database, path))).val();
    await copy(path, source, progress);
  }
  const existing = (await Raw.get(Raw.ref(database, `encryptedData/profiles/${state.uid}`))).exists();
  if (!existing) {
    const name = await storage.getItem(`e2ee.signup-name.${state.uid}`);
    await set(ref(database, `profiles/${state.uid}`), { id: state.uid, name: name?.trim() || auth.currentUser?.displayName || "KOINO member", theme: "light", createdAt: new Date().toISOString() });
  }
  if (auth.currentUser?.displayName) await updateProfile(auth.currentUser, { displayName: null });
  await archiveRetiredCollections("user", state.uid, progress);
  await encryptedOperation("finishMigration", { scope: `user:${state.uid}` });
}
export async function migrateOwnedGroups(progress: MigrationProgress) {
  const state = session();
  const memberships = (await Raw.get(Raw.ref(database, `userGroups/${state.uid}`))).val() as Record<string, any> | null;
  const queue = (await Raw.get(Raw.ref(database, `e2eeMigrationGroups/${state.uid}`))).val() as Record<string, boolean> | null;
  for (const groupId of new Set([...Object.keys(memberships ?? {}), ...Object.keys(queue ?? {})])) {
    let legacy = (await Raw.get(Raw.ref(database, `groups/${groupId}`))).val();
    const archiveKey = `e2ee.legacy-group.${state.uid}.${groupId}`;
    if (legacy) await storage.setItem(archiveKey, JSON.stringify(legacy));
    else { const saved = await storage.getItem(archiveKey); legacy = saved ? JSON.parse(saved) : null; }
    if (!legacy || legacy.ownerId !== state.uid) continue;
    progress("Encrypting community history…");
    await encryptedOperation("beginMigration", { scope: `group:${groupId}` });
    const exists = (await Raw.get(Raw.ref(database, `e2eeGroups/${groupId}`))).exists();
    if (!exists) {
      const membership = { ...memberships![groupId], image: undefined };
      const group = { ...legacy, image: undefined };
      delete membership.image; delete group.image;
      await createEncryptedGroup(groupId, () => ({ group: encodeAt(`groups/${groupId}`, group), membership: encodeAt(`groupMembers/${groupId}/${state.uid}`, membership), userMembership: encodeAt(`userGroups/${state.uid}/${groupId}`, membership) }));
    } else await loadGroup(groupId);
    const members = (await Raw.get(Raw.ref(database, `groupMembers/${groupId}`))).val() as Record<string, unknown> | null;
    // Preserve admission information for existing members who have not yet
    // enrolled; their owner must verify their identity before sharing keys.
    await encryptedOperation("stageLegacyMembers", { groupId });
    for (const [collection, definition] of Object.entries(policies)) {
      if ((definition.scope !== "group" && collection !== "discussionFollowers") || ["groupMembers", "legacyGroupArchives"].includes(collection)) continue;
      const path = `${collection}/${groupId}`;
      await copy(path, (await Raw.get(Raw.ref(database, path))).val(), progress);
    }
    for (const uid of Object.keys(members ?? {})) {
      const path = `userGroups/${uid}/${groupId}`;
      const value = (await Raw.get(Raw.ref(database, path))).val();
      if (value) await deleteSource(path, value);
    }
    if (members) await deleteSource(`groupMembers/${groupId}`, members);
    const invitePath = `inviteCodes/${legacy.inviteCode}`;
    const invite = (await Raw.get(Raw.ref(database, invitePath))).val();
    if (invite) await deleteSource(invitePath, invite);
    if (legacy.image?.path) await deleteRoomImage(legacy.image.path);
    await archiveRetiredCollections("group", groupId, progress);
    await encryptedOperation("finishMigration", { scope: `group:${groupId}` });
    await storage.removeItem(archiveKey);
  }
  const pending = (await Raw.get(Raw.ref(database, `e2eePendingGroups/${state.uid}`))).val() as Record<string, { inviteCode: string }> | null;
  const profile = decodeAt(`profiles/${state.uid}`, (await Raw.get(Raw.ref(database, `encryptedData/profiles/${state.uid}`))).val()) as { name: string };
  for (const entry of Object.values(pending ?? {})) await groupJoinRequest(entry.inviteCode, profile.name);
}
