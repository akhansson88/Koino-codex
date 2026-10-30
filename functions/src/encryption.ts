import { moderationReference, removeCommunityContent } from "./community-moderation";
import sodium from "libsodium-wrappers";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getDatabase } from "firebase-admin/database";
import { adminApp } from "./firebase-admin";
import { storageHeadersFor } from "./storage-auth";
import { assertEmulatorOperationAllowed, assertExternalStorageAllowed, emulatorTestConfiguration, withEmulatorAdmissionDiagnostics } from "./emulator-safety";

const storageKey = emulatorTestConfiguration() ? undefined : defineSecret("KOINO_SUPABASE_SERVICE_KEY");
const storageUrl = "https://prumjueusdyqnwwovpen.supabase.co";
const retiredPersonalCollections = ["privateBiblePlans", "privateBiblePlanProgress", "pendingNotificationBundles", "pushDeliveryDiagnostics"];
const retiredGroupCollections = ["groupBiblePlans", "groupBiblePlanProgress", "commentReactions"];
function storageHeaders() {
  assertExternalStorageAllowed();
  try { return storageHeadersFor(storageKey!.value()); }
  catch { throw new HttpsError("failed-precondition", "Configure a Supabase backend secret key or the project's legacy service_role credential."); }
}
const db = () => getDatabase(adminApp);
export const ROOT_UNCHANGED = Symbol("root-unchanged");
export async function rootTransaction(action: (root: Obj | null) => any) {
  // The Admin SDK's root transaction stalled against the deployed database.
  // REST ETags keep the same atomic comparisons with bounded retries and no
  // dependency on the SDK's overlapping local transaction cache.
  const databaseUrl = emulatorTestConfiguration()?.databaseURL ?? adminApp.options.databaseURL;
  if (!databaseUrl) throw new HttpsError("unavailable", "Database configuration is missing.");
  const emulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const endpoint = emulator ? `http://${emulator}/.json?ns=${new URL(databaseUrl).hostname.split(".")[0]}` : `${databaseUrl.replace(/\/$/, "")}/.json`;
  const token = emulator ? "owner" : (await adminApp.options.credential!.getAccessToken()).access_token;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", "X-Firebase-ETag": "true" };
  const deadline = Date.now() + 45_000;
  for (let attempt = 0; attempt < 8 && Date.now() < deadline; attempt++) {
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new HttpsError("unavailable", "Database comparison could not be read.");
    const etag = response.headers.get("etag"), root = await response.json();
    if (!etag) throw new HttpsError("unavailable", "Database comparison token is missing.");
    if (root === null) return { committed: false };
    const next = action(root);
    if (next === ROOT_UNCHANGED) return { committed: true };
    if (next === undefined || next === null) return { committed: false };
    const write = await fetch(endpoint, { method: "PUT", headers: { ...headers, "if-match": etag }, body: JSON.stringify(next), signal: AbortSignal.timeout(10_000) });
    await write.body?.cancel();
    if (write.ok) return { committed: true };
    if (write.status !== 412) throw new HttpsError("unavailable", "Database comparison could not be committed.");
  }
  return { committed: false };
}
type Obj = Record<string, any>;
const canonical = (value: any): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}` : JSON.stringify(value);
const invalid = (message = "Invalid encrypted request."): never => { throw new HttpsError("invalid-argument", message); };
const denied = (message = "This encrypted operation is not authorized."): never => { throw new HttpsError("permission-denied", message); };
const id = (value: unknown): string => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value) ? value : invalid();
const decode = (value: string) => sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
function publicKey(value: unknown) { if (typeof value !== "string") return invalid(); try { if (decode(value).length !== 32) return invalid(); } catch { return invalid(); } return value; }
function verify(value: unknown, signature: unknown, key: string) { try { return typeof signature === "string" && sodium.crypto_sign_verify_detached(decode(signature), canonical(value), decode(key)); } catch { return false; } }
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right);
function envelope(value: any) {
  if (!value || value.v !== 1 || typeof value.ciphertext !== "string" || value.ciphertext.length > 4_000_000 || typeof value.nonce !== "string" || typeof value.signature !== "string" || typeof value.keyId !== "string") invalid();
  publicKey(value.signer);
  try { if (decode(value.nonce).length !== 24) invalid(); } catch { invalid(); }
  return value;
}
function device(value: any, uid: string, accountKey: string) {
  const deviceId = id(value?.id);
  publicKey(value.publicKey); publicKey(value.signingPublicKey);
  if (typeof value.grant !== "string" || value.grant.length > 4_000_000 || !verify({ uid, id: deviceId, publicKey: value.publicKey, signingPublicKey: value.signingPublicKey }, value.certificate, accountKey)) invalid("Invalid device certificate.");
  return { publicKey: value.publicKey, signingPublicKey: value.signingPublicKey, active: true, grant: value.grant, certificate: value.certificate };
}
function encryptedRecord(path: string, record: Obj, metadata: string[], signer: string, keyId: string) {
  const walk = (value: any, location: string, depth: number) => {
    if (depth > 7 || !value || typeof value !== "object") invalid("Content must be encrypted before upload.");
    if (value.v === 1 && typeof value.ciphertext === "string") {
      envelope(value);
      const { signature, ...payload } = value;
      if (value.signer !== signer || value.keyId !== keyId || !verify({ path: location, ...payload }, signature, signer)) denied("Encrypted content signature is invalid.");
      return;
    }
    for (const [name, child] of Object.entries(value)) walk(child, `${location}/${name}`, depth + 1);
  };
  for (const [field, value] of Object.entries(record)) if (!metadata.includes(field)) walk(value, `${path}/${field}`, 0);
}
async function requireGroup(groupId: string, uid: string, owner = false) {
  const group = (await db().ref(`e2eeGroups/${id(groupId)}`).get()).val() as Obj | null;
  if (!group || !group.members?.[uid] || (owner && group.ownerId !== uid)) denied();
  if ((await db().ref(`e2eeDepartures/${groupId}/${uid}`).get()).exists()) denied();
  return group!;
}
function validGroup(next: Obj, uid: string, account: Obj, previous?: Obj) {
  id(next.id); id(next.ownerId);
  if (!Number.isSafeInteger(next.epoch) || !Number.isSafeInteger(next.revision) || next.status !== "ready" || !next.members || !next.grants || !Array.isArray(next.signers)) invalid();
  const { signature, previous: history, ...payload } = next;
  const ownerKey = previous ? previous.members[previous.ownerId]?.signingPublicKey : account.signingPublicKey;
  if (next.signer !== ownerKey || !verify({ ...payload, previous: history ?? null }, signature, ownerKey)) denied("Group signature could not be verified.");
  if (!previous) {
    if (next.ownerId !== uid || next.revision !== 1 || next.epoch !== 1 || history || Object.keys(next.members).length !== 1 || !same(next.members[uid], { publicKey: account.publicKey, signingPublicKey: account.signingPublicKey })) invalid();
  } else {
    if (previous.ownerId !== uid || next.id !== previous.id || next.revision !== previous.revision + 1 || !same(history, previous) || next.epoch < previous.epoch || next.epoch > previous.epoch + 1) denied("Group state changed. Reload and try again.");
    const removed = Object.keys(previous.members).filter((member) => !next.members[member]);
    if ((removed.length || previous.status === "rotation_required") && next.epoch !== previous.epoch + 1) invalid("Removing access requires a new encryption key.");
    if (removed.includes(uid)) invalid("Transfer ownership before leaving.");
  }
  if (!next.members[next.ownerId] || Object.keys(next.members).length > 200 || !same(Object.keys(next.members).sort(), Object.keys(next.grants).sort())) invalid();
  for (const [member, identity] of Object.entries(next.members) as [string, Obj][]) { id(member); publicKey(identity.publicKey); publicKey(identity.signingPublicKey); if (typeof next.grants[member] !== "string" || next.grants[member].length > 4_000_000) invalid(); }
  return next;
}

export const encryptedAccount = onCall({ region: "europe-west1", secrets: storageKey ? [storageKey] : [], timeoutSeconds: 120 }, (request) => withEmulatorAdmissionDiagnostics(request.data?.operation, async () => {
  await sodium.ready;
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const payload = request.data as Obj;
  if (!payload || typeof payload.operation !== "string" || !Number.isFinite(payload.timestamp) || Math.abs(Date.now() - payload.timestamp) > 120_000) invalid();
  id(payload.requestId);
  assertEmulatorOperationAllowed(payload.operation);
  const accountRef = db().ref(`e2eeAccounts/${uid}`);
  const account = (await accountRef.get()).val() as Obj | null;
  const { signature, ...signed } = payload;
  const data = payload.data as Obj;
  if (!data || typeof data !== "object") invalid();
  const policy = (await db().ref("e2eePolicy").get()).val();
  if (policy?.encryptedGroupsOnly && (payload.operation === "stageLegacyMembers" || ["beginMigration", "finishMigration"].includes(payload.operation) && String(data.scope).startsWith("group:") || payload.operation === "readLegacyArchive" && data.kind === "group" || payload.operation === "legacyImage" && data.bucket === "room-images")) {
    throw new HttpsError("failed-precondition", "Legacy communities have been retired. Use an encrypted community.");
  }
  if (policy?.sharedWritesFrozen && ["removeCommunityContent", "createGroup", "groupChange", "deleteGroup", "leaveGroup", "imageUpload", "imageDelete", "requestJoin", "stageLegacyMembers", "deleteLegacyBatch"].includes(payload.operation)) {
    throw new HttpsError("unavailable", "Community maintenance is in progress. Try again shortly.");
  }
  const firstOperations = ["setup", "recover", "requestDevice"];
  if (!firstOperations.includes(payload.operation)) {
    const activeDevice = account?.devices?.[id(payload.deviceId)];
    if (!activeDevice?.active || !verify(signed, signature, activeDevice.signingPublicKey)) denied("Unlock this device before continuing.");
  }
  // Requests are signed with random IDs and a bounded lifetime. A transaction
  // prevents replay of destructive operations while preserving retries safely.
  if (payload.operation !== "removeCommunityContent") {
    const replay = await db().ref(`e2eeRequests/${uid}/${payload.requestId}`).transaction((value) => value ? undefined : payload.timestamp);
    if (!replay.committed) throw new HttpsError("already-exists", "This request was already processed. Reload its result.");
  }
  switch (payload.operation) {
    case "removeCommunityContent": {
      const target = moderationReference(data);
      // Reject unauthorized callers before downloading the database root.
      // The transaction still repeats all checks against its current snapshot.
      await requireGroup(target.groupId, uid, true);
      if ((await db().ref(`moderationTombstones/${target.groupId}/${target.targetType}/${target.targetId}`).get()).exists()) return { removed: true };
      const timestamp = new Date().toISOString();
      const result = await rootTransaction(root => {
        if (!root) return;
        const alreadyRemoved = Object.hasOwn(root.moderationTombstones?.[target.groupId]?.[target.targetType] ?? {}, target.targetId);
        removeCommunityContent(root, uid, payload.deviceId, account!.devices[payload.deviceId].signingPublicKey, data, timestamp);
        // Authorization is still checked for retries, but a successful read-only
        // retry does not upload the entire database or contend with new writes.
        return alreadyRemoved ? ROOT_UNCHANGED : root;
      });
      if (!result.committed) throw new HttpsError("aborted", "Community changed. Retry removal.");
      return { removed: true };
    }
    case "setup": {
      if (account) throw new HttpsError("already-exists", "Encryption is already configured.");
      publicKey(data.publicKey); publicKey(data.signingPublicKey); envelope(data.recovery);
      const { proof, ...initial } = data;
      if (!verify(initial, proof, data.signingPublicKey)) denied();
      const registration = device(data.device, uid, data.signingPublicKey);
      const result = await accountRef.transaction((value) => value ? undefined : { publicKey: data.publicKey, signingPublicKey: data.signingPublicKey, personalEpoch: 1, recovery: data.recovery, devices: { [data.device.id]: registration } });
      if (!result.committed) throw new HttpsError("already-exists", "Encryption is already configured.");
      await db().ref(`e2eeSigners/${registration.signingPublicKey}`).set({ uid, deviceId: data.device.id, active: true });
      return {};
    }
    case "recover": {
      if (!account) denied();
      if (!verify({ device: data.device }, data.proof, account!.signingPublicKey)) denied("Recovery proof could not be verified.");
      const registration = device(data.device, uid, account!.signingPublicKey);
      const recovered = await rootTransaction((root) => {
        if (!root || !same(root.e2eeAccounts?.[uid], account)) return undefined;
        root.e2eeAccounts[uid].devices[data.device.id] = registration;
        root.e2eeSigners ??= {}; root.e2eeSigners[registration.signingPublicKey] = { uid, deviceId: data.device.id, active: true };
        return root;
      });
      if (!recovered.committed) throw new HttpsError("aborted", "Account changed during recovery. Retry with the current recovery code.");
      return {};
    }
    case "requestDevice": {
      if (!account) denied();
      const deviceId = id(data.id); publicKey(data.publicKey); publicKey(data.signingPublicKey);
      if (payload.deviceId !== deviceId || !verify(signed, signature, data.signingPublicKey)) denied();
      await db().ref(`e2eeDeviceRequests/${uid}/${deviceId}`).set({ publicKey: data.publicKey, signingPublicKey: data.signingPublicKey });
      return {};
    }
    case "approveDevice": {
      const deviceId = id(data.id);
      const pending = (await db().ref(`e2eeDeviceRequests/${uid}/${deviceId}`).get()).val();
      if (!pending || !same(pending, data.expected)) denied("Device request changed.");
      const registration = device({ id: deviceId, ...pending, certificate: data.certificate, grant: data.grant }, uid, account!.signingPublicKey);
      const approved = await rootTransaction((root) => {
        if (!root || !same(root.e2eeAccounts?.[uid], account) || !same(root.e2eeDeviceRequests?.[uid]?.[deviceId], pending)) return undefined;
        root.e2eeAccounts[uid].devices[deviceId] = registration;
        delete root.e2eeDeviceRequests[uid][deviceId];
        root.e2eeSigners ??= {}; root.e2eeSigners[registration.signingPublicKey] = { uid, deviceId, active: true };
        return root;
      });
      if (!approved.committed) throw new HttpsError("aborted", "Account or device request changed. Reload and retry.");
      return {};
    }
    case "backup": {
      envelope(data.recovery);
      if (data.recovery.signer !== account!.signingPublicKey) denied();
      const { signature: recoverySignature, ...recoveryPayload } = data.recovery;
      if (!verify({ path: `recovery/${uid}`, ...recoveryPayload }, recoverySignature, account!.signingPublicKey)) denied();
      const updates: Obj = { recovery: data.recovery };
      for (const [deviceId, registration] of Object.entries(account!.devices) as [string, Obj][]) {
        if (registration.active) { if (typeof data.grants?.[deviceId] !== "string") invalid(); updates[`devices/${deviceId}/grant`] = data.grants[deviceId]; }
      }
      const expectedAccount = canonical(account);
      await accountRef.once("value");
      const saved = await accountRef.transaction((current) => {
        if (current === null) return null;
        if (canonical(current) !== expectedAccount) return undefined;
        current = JSON.parse(JSON.stringify(current));
        current.recovery = updates.recovery;
        for (const [deviceId, registration] of Object.entries(current.devices) as [string, Obj][]) if (registration.active) registration.grant = data.grants[deviceId];
        return current;
      });
      if (!saved.committed || !saved.snapshot.exists()) throw new HttpsError("aborted", "Account changed while saving keys. Reload and retry.");
      return {};
    }
    case "revokeDevice": {
      const revokedId = id(data.id);
      if (revokedId === payload.deviceId || !account!.devices[revokedId]?.active || data.personalEpoch !== account!.personalEpoch + 1) denied();
      publicKey(data.next?.publicKey); publicKey(data.next?.signingPublicKey); envelope(data.recovery);
      const { signature: recoverySignature, ...recoveryPayload } = data.recovery;
      if (data.recovery.signer !== data.next.signingPublicKey || !verify({ path: `recovery/${uid}`, ...recoveryPayload }, recoverySignature, data.next.signingPublicKey)) denied("Invalid replacement recovery backup.");
      const previous = { publicKey: account!.publicKey, signingPublicKey: account!.signingPublicKey };
      if (!same(data.rotation?.previous, previous) || !same(data.rotation.next, data.next) || !verify({ previous, next: data.next }, data.rotation.signature, account!.signingPublicKey)) denied();
      if (!same(Object.keys(data.devices ?? {}).sort(), Object.keys(account!.devices).sort())) invalid();
      for (const [deviceId, entry] of Object.entries(data.devices) as [string, Obj][]) {
        const old = account!.devices[deviceId];
        device({ id: deviceId, ...entry }, uid, data.next.signingPublicKey);
        if (entry.publicKey !== old.publicKey || entry.signingPublicKey !== old.signingPublicKey || entry.active !== (deviceId === revokedId ? false : old.active)) invalid();
      }
      const result = await rootTransaction((root: Obj | null) => {
        if (!root || !same(root.e2eeAccounts?.[uid], account)) return;
        root.e2eeAccounts[uid] = { ...account, ...data.next, personalEpoch: data.personalEpoch, recovery: data.recovery, devices: data.devices, rotations: [...(account!.rotations ?? []), data.rotation] };
        root.e2eeSigners[account!.devices[revokedId].signingPublicKey].active = false;
        for (const groupId of Object.keys(root.encryptedData?.userGroups?.[uid] ?? {})) {
          const group = root.e2eeGroups[groupId];
          root.e2eeGroupLocks ??= {}; root.e2eeGroupLocks[groupId] = true;
          if (group.ownerId !== uid) {
            if (typeof data.groupRequests?.[groupId] !== "string") return;
            root.e2eeJoinRequests ??= {}; root.e2eeJoinRequests[groupId] ??= {};
            root.e2eeJoinRequests[groupId][uid] = { ...data.next, name: data.groupRequests[groupId] };
          }
        }
        return root;
      });
      if (!result.committed) throw new HttpsError("aborted", "Account changed. Retry revocation.");
      return {};
    }
    case "createGroup": {
      const group = validGroup(data.group, uid, account!);
      const records = data.records as Obj;
      if (!records?.group || !records?.membership || !records?.userMembership || records.group.id !== group.id || records.group.ownerId !== uid || records.membership.userId !== uid || records.membership.groupId !== group.id || records.membership.role !== "owner" || records.userMembership.userId !== uid || records.userMembership.groupId !== group.id || records.userMembership.role !== "owner") invalid();
      id(records.group.inviteCode);
      const signer = account!.devices[payload.deviceId].signingPublicKey, keyId = `group:${group.id}:${group.epoch}`;
      encryptedRecord(`groups/${group.id}`, records.group, ["id", "ownerId", "createdAt", "updatedAt", "inviteCode"], signer, keyId);
      encryptedRecord(`groupMembers/${group.id}/${uid}`, records.membership, ["id", "userId", "groupId", "role", "createdAt"], signer, keyId);
      encryptedRecord(`userGroups/${uid}/${group.id}`, records.userMembership, ["id", "userId", "groupId", "role", "createdAt"], signer, keyId);
      // A root transaction makes group authority, invite, and membership fanout
      // atomic. Group changes are rare; content writes do not use this path.
      const result = await rootTransaction((root: Obj | null) => {
        const next = root ?? {};
        if (!same(next.e2eeAccounts?.[uid], account) || next.e2eeGroups?.[group.id] || next.encryptedData?.inviteCodes?.[records.group.inviteCode] || (next.inviteCodes?.[records.group.inviteCode] && next.e2eeMigrations?.group?.[group.id]?.ownerId !== uid)) return;
        next.e2eeGroups ??= {}; next.e2eeGroups[group.id] = group;
        next.encryptedData ??= {};
        const store = next.encryptedData;
        store.groups ??= {}; store.groups[group.id] = records.group;
        store.groupMembers ??= {}; store.groupMembers[group.id] = { [uid]: records.membership };
        store.userGroups ??= {}; store.userGroups[uid] ??= {}; store.userGroups[uid][group.id] = records.userMembership;
        store.inviteCodes ??= {}; store.inviteCodes[records.group.inviteCode] = { groupId: group.id, createdAt: records.group.createdAt };
        store.profiles ??= {}; store.profiles[uid] ??= {}; store.profiles[uid].currentGroupId = group.id;
        return next;
      });
      if (!result.committed) throw new HttpsError("already-exists", "Group or invite already exists.");
      return {};
    }
    case "resolveInvite": {
      const code = id(data.code);
      const invite = (await db().ref(`encryptedData/inviteCodes/${code}`).get()).val();
      if (!invite) throw new HttpsError("not-found", "No encrypted community uses that invite code.");
      const group = (await db().ref(`e2eeGroups/${invite.groupId}`).get()).val();
      if (!group) denied();
      return { groupId: invite.groupId, owner: group.members[group.ownerId] };
    }
    case "requestJoin": {
      const invite = (await db().ref(`encryptedData/inviteCodes/${id(data.code)}`).get()).val();
      if (!invite) throw new HttpsError("not-found", "No community uses that invite code.");
      if (!same(data.identity, { publicKey: account!.publicKey, signingPublicKey: account!.signingPublicKey }) || typeof data.name !== "string" || data.name.length > 4096) invalid();
      const group = (await db().ref(`e2eeGroups/${invite.groupId}`).get()).val();
      if (same(group?.members?.[uid], data.identity) && !(await db().ref(`e2eeDepartures/${invite.groupId}/${uid}`).get()).exists()) {
        await db().ref().update({ [`e2eePendingGroups/${uid}/${invite.groupId}`]: null, [`e2eeJoinRequests/${invite.groupId}/${uid}`]: null });
        return {};
      }
      await db().ref(`e2eeJoinRequests/${invite.groupId}/${uid}`).set({ ...data.identity, name: data.name });
      return {};
    }
    case "groupChange": {
      const previous = await requireGroup(data.group.id, uid, true);
      const group = validGroup(data.group, uid, account!, previous);
      const added = Object.keys(group.members).filter((member) => !previous.members[member]);
      const changedMembers = Object.keys(group.members).filter((member) => previous.members[member] && !same(group.members[member], previous.members[member]));
      if (added.length > 1) invalid("Approve one member at a time.");
      for (const member of added) {
        const pending = (await db().ref(`e2eeJoinRequests/${group.id}/${member}`).get()).val();
        if (!pending || pending.publicKey !== group.members[member].publicKey || pending.signingPublicKey !== group.members[member].signingPublicKey || data.records?.membership?.userId !== member || data.records.membership.groupId !== group.id || data.records.membership.role !== "member" || data.records.userMembership?.userId !== member || data.records.userMembership?.groupId !== group.id || data.records.userMembership?.role !== "member") denied();
      }
      for (const member of added) {
        const signer = account!.devices[payload.deviceId].signingPublicKey, keyId = `group:${group.id}:${group.epoch}`;
        const metadata = ["id", "userId", "groupId", "role", "createdAt"];
        encryptedRecord(`groupMembers/${group.id}/${member}`, data.records.membership, metadata, signer, keyId);
        encryptedRecord(`userGroups/${member}/${group.id}`, data.records.userMembership, metadata, signer, keyId);
      }
      for (const member of changedMembers) {
        const remote = (await db().ref(`e2eeAccounts/${member}`).get()).val();
        if (!same(group.members[member], { publicKey: remote?.publicKey, signingPublicKey: remote?.signingPublicKey })) denied();
        if (member !== uid) {
          const pending = (await db().ref(`e2eeJoinRequests/${group.id}/${member}`).get()).val();
          if (!pending || pending.publicKey !== group.members[member].publicKey || pending.signingPublicKey !== group.members[member].signingPublicKey) denied();
        }
      }
      const result = await rootTransaction((root: Obj | null) => {
        if (!root || !same(root.e2eeAccounts?.[uid], account) || !same(root.e2eeGroups?.[group.id], previous)) return;
        root.e2eeGroups[group.id] = group;
        if (root.e2eeGroupLocks?.[group.id] && group.epoch !== previous.epoch + 1) return;
        delete root.e2eeGroupLocks?.[group.id];
        delete root.e2eeDepartures?.[group.id];
        for (const [member, identity] of Object.entries(group.members) as [string, Obj][]) {
          if (identity.publicKey !== root.e2eeAccounts[member]?.publicKey) { root.e2eeGroupLocks ??= {}; root.e2eeGroupLocks[group.id] = true; }
        }
        for (const member of changedMembers) delete root.e2eeJoinRequests?.[group.id]?.[member];
        const store = root.encryptedData;
        store.groups[group.id].ownerId = group.ownerId;
        for (const member of Object.keys(previous.members)) {
          if (!group.members[member]) {
            delete store.groupMembers[group.id][member];
            delete store.userGroups[member]?.[group.id];
          } else {
            const role = group.ownerId === member ? "owner" : "member";
            if (store.groupMembers[group.id][member]) store.groupMembers[group.id][member].role = role;
            if (store.userGroups[member]?.[group.id]) store.userGroups[member][group.id].role = role;
          }
        }
        for (const member of added) {
          store.groupMembers[group.id][member] = data.records.membership;
          store.userGroups[member] ??= {}; store.userGroups[member][group.id] = data.records.userMembership;
          delete root.e2eeJoinRequests?.[group.id]?.[member];
          delete root.e2eePendingGroups?.[member]?.[group.id];
        }
        return root;
      });
      if (!result.committed) throw new HttpsError("aborted", "Group changed. Reload and retry.");
      return {};
    }
    case "beginMigration": {
      const scope = data.scope;
      if (typeof scope !== "string" || !/^(user|group):[A-Za-z0-9_-]+$/.test(scope)) invalid();
      const [kind, target] = scope.split(":");
      if (kind === "user" && target !== uid) denied();
      if (kind === "group") {
        const legacy = (await db().ref(`groups/${target}`).get()).val();
        const encrypted = (await db().ref(`e2eeGroups/${target}`).get()).val();
        if ((legacy?.ownerId ?? encrypted?.ownerId) !== uid) denied();
      }
      const migrationRef = db().ref(`e2eeMigrations/${kind}/${target}`);
      if ((await migrationRef.child("status").get()).val() === "complete") {
        if (kind === "group") await db().ref(`e2eeMigrationGroups/${uid}/${target}`).remove();
        return { complete: true };
      }
      await migrationRef.update({ status: "copying", ownerId: uid });
      // Keep these IDs after completion so delayed database events from the
      // history copy cannot deliver old replies or prayer notices again.
      const legacyEvents = (await db().ref(`${kind === "group" ? "replies" : "prayerNotifications"}/${target}`).get()).val() ?? {};
      const importedEventIds = Object.fromEntries(Object.keys(legacyEvents).map((eventId) => [eventId, true]));
      if (Object.keys(importedEventIds).length) await migrationRef.child("importedEventIds").update(importedEventIds);
      if (kind === "group") await db().ref(`e2eeMigrationGroups/${uid}/${target}`).set(true);
      return {};
    }
    case "stageLegacyMembers": {
      const groupId = id(data.groupId);
      const authority = await requireGroup(groupId, uid, true);
      const legacyMembers = (await db().ref(`groupMembers/${groupId}`).get()).val() ?? {};
      const group = (await db().ref(`encryptedData/groups/${groupId}`).get()).val();
      const updates: Obj = {};
      for (const member of Object.keys(legacyMembers)) if (member !== uid && !authority.members[member]) updates[`e2eePendingGroups/${member}/${groupId}`] = { inviteCode: group.inviteCode };
      if (Object.keys(updates).length) await db().ref().update(updates);
      return {};
    }
    case "readLegacyArchive": {
      const kind = data.kind, target = id(data.target), collection = data.collection;
      if (kind !== "user" && kind !== "group") invalid();
      if (!(kind === "user" ? retiredPersonalCollections : retiredGroupCollections).includes(collection)) invalid();
      const migration = (await db().ref(`e2eeMigrations/${kind}/${target}`).get()).val();
      if (migration?.ownerId !== uid || migration.status !== "copying" || (kind === "user" && target !== uid)) denied();
      return { source: (await db().ref(`${collection}/${target}`).get()).val() };
    }
    case "deleteLegacyBatch": {
      if (!Array.isArray(data.records) || data.records.length > 50) invalid();
      for (const entry of data.records) {
        const segments = typeof entry.path === "string" ? entry.path.split("/") : [];
        if (segments.length < 2 || segments.length > 5 || segments.some((segment: string) => !/^[^.$#\[\]/\x00-\x1f\x7f]{1,768}$/.test(segment))) invalid();
        const personal = ["profiles", "journalEntries", "privateCheckIns", "prayerSessions", "prayerNotifications", "activityNotifications", "savedVerses", "bibleHighlights", "bibleHighlightColors", "bibleHighlightColorSettings", "bibleReaderPreferences", "biblePlans", "notificationPreferences", "pushTokens", "checkInDailyClaims", "userDiscussionFollows", "groupBiblePlanParticipantIds", "supportIntents", ...retiredPersonalCollections];
        const shared = ["groups", "groupMembers", "posts", "checkIns", "replies", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupBiblePlanParticipation", "discussionFollowers", ...retiredGroupCollections];
        if (personal.includes(segments[0])) { if (segments[1] !== uid) denied(); }
        else if (shared.includes(segments[0])) {
          const migration = (await db().ref(`e2eeMigrations/group/${segments[1]}`).get()).val();
          if (migration?.ownerId !== uid || migration.status !== "copying") denied();
        } else if (segments[0] === "userGroups") {
          const migration = (await db().ref(`e2eeMigrations/group/${segments[2]}`).get()).val();
          if (migration?.ownerId !== uid) denied();
        } else if (segments[0] === "inviteCodes") {
          const old = (await db().ref(entry.path).get()).val();
          if (old && (await db().ref(`e2eeMigrations/group/${old.groupId}`).get()).child("ownerId").val() !== uid) denied();
        } else invalid();
        // Deletion is conditional on the exact source the client verified.
        // A race or interrupted migration retains the source for retry.
        const result = await db().ref(entry.path).transaction((value) => {
          if (value === null) return null;
          const digest = sodium.to_hex(sodium.crypto_generichash(32, canonical(value), null));
          return digest === entry.digest ? null : undefined;
        });
        if (!result.committed) throw new HttpsError("aborted", "Legacy content changed. Retry migration.");
      }
      return {};
    }
    case "finishMigration": {
      const [kind, target] = typeof data.scope === "string" ? data.scope.split(":") : [];
      if (!["user", "group"].includes(kind) || !target) invalid();
      const migration = (await db().ref(`e2eeMigrations/${kind}/${id(target)}`).get()).val();
      if (migration?.ownerId !== uid) denied();
      const collections = kind === "group" ? ["groups", "groupMembers", "posts", "checkIns", "replies", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupBiblePlanParticipation", "discussionFollowers"] : ["profiles", "journalEntries", "privateCheckIns", "prayerSessions", "prayerNotifications", "activityNotifications", "savedVerses", "bibleHighlights", "bibleHighlightColors", "bibleHighlightColorSettings", "bibleReaderPreferences", "biblePlans", "notificationPreferences", "pushTokens", "checkInDailyClaims", "userDiscussionFollows", "groupBiblePlanParticipantIds", "supportIntents"];
      for (const collection of [...collections, ...(kind === "user" ? retiredPersonalCollections : retiredGroupCollections)]) if ((await db().ref(`${collection}/${target}`).get()).exists()) throw new HttpsError("failed-precondition", "Legacy content remains. Resume migration before completing it.");
      await db().ref(`e2eeMigrations/${kind}/${target}`).update({ status: "complete" });
      if (kind === "group") await db().ref(`e2eeMigrationGroups/${uid}/${target}`).remove();
      return {};
    }
    case "legacyImage": {
      const bucket = data.bucket;
      if (!["room-images", "user-avatars"].includes(bucket) || typeof data.path !== "string" || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(data.path)) invalid();
      const ownerId = data.path.split("/")[0];
      const legacy = (await db().ref(`${bucket === "room-images" ? "groups" : "profiles"}/${ownerId}`).get()).val();
      if ((bucket === "room-images" ? legacy?.ownerId : ownerId) !== uid || legacy?.image?.path !== data.path) denied();
      const response = await fetch(`${storageUrl}/storage/v1/object/authenticated/${bucket}/${data.path}`, { headers: storageHeaders() });
      if (!response.ok) throw new HttpsError("unavailable", "Legacy image could not be read.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2 * 1024 * 1024) invalid("Legacy image is too large.");
      return { bytes: sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING) };
    }
    case "leaveGroup": {
      const groupId = id(data.groupId), previous = await requireGroup(groupId, uid);
      if (previous.ownerId === uid) denied("Transfer ownership before leaving.");
      await db().ref().update({ [`e2eeDepartures/${groupId}/${uid}`]: true, [`e2eeGroupLocks/${groupId}`]: true, [`encryptedData/groupMembers/${groupId}/${uid}`]: null, [`encryptedData/userGroups/${uid}/${groupId}`]: null });
      return {};
    }
    case "deleteGroup": {
      const groupId = id(data.groupId);
      const group = await requireGroup(groupId, uid, true);
      const objects = (await db().ref(`e2eeImageObjects/room-images/${groupId}`).get()).val() ?? {};
      const paths = Object.values(objects);
      if (paths.length) {
        assertExternalStorageAllowed();
        const response = await fetch(`${storageUrl}/storage/v1/object/room-images`, { method: "DELETE", headers: { ...storageHeaders(), "content-type": "application/json" }, body: JSON.stringify({ prefixes: paths }) });
        if (!response.ok) throw new HttpsError("unavailable", "Community images could not be removed. Retry deletion.");
      }
      const info = (await db().ref(`encryptedData/groups/${groupId}`).get()).val();
      const updates: Obj = { [`e2eeImageObjects/room-images/${groupId}`]: null, [`e2eeGroupLocks/${groupId}`]: null, [`e2eeGroups/${groupId}`]: null, [`e2eeJoinRequests/${groupId}`]: null, [`e2eeDepartures/${groupId}`]: null };
      for (const collection of ["groups", "groupMembers", "checkIns", "posts", "replies", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupBiblePlanParticipation", "discussionFollowers", "legacyGroupArchives"]) updates[`encryptedData/${collection}/${groupId}`] = null;
      if (info?.inviteCode) updates[`encryptedData/inviteCodes/${info.inviteCode}`] = null;
      for (const member of Object.keys(group.members)) updates[`encryptedData/userGroups/${member}/${groupId}`] = null;
      await db().ref().update(updates);
      return {};
    }
    case "imageUpload":
    case "imageDownload":
    case "imageDelete": {
      const bucket = data.bucket;
      if (!["room-images", "user-avatars"].includes(bucket) || typeof data.path !== "string" || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(data.path)) invalid();
      const ownerId = data.path.split("/")[0];
      if (bucket === "room-images") await requireGroup(ownerId, uid, payload.operation !== "imageDownload");
      else if (ownerId !== uid) {
        if (payload.operation !== "imageDownload" || typeof data.groupId !== "string") denied();
        const group = await requireGroup(data.groupId, uid);
        if (!group.members[ownerId]) denied();
      }
      const headers = { ...storageHeaders(), "content-type": "application/json" };
      const objectPath = `${bucket}/${data.path.split("/").map(encodeURIComponent).join("/")}`;
      const url = `${storageUrl}/storage/v1/object/${payload.operation === "imageDownload" ? "authenticated/" : ""}${objectPath}`;
      let response: Response;
      if (payload.operation === "imageUpload") {
        envelope(data.record);
        const { signature: imageSignature, ...imagePayload } = data.record;
        const signer = account!.devices[payload.deviceId].signingPublicKey;
        if (data.record.signer !== signer || !verify({ path: `images/${objectPath}`, ...imagePayload }, imageSignature, signer)) denied();
        response = await fetch(url, { method: "POST", headers: { ...headers, "x-upsert": "false", "cache-control": "no-store" }, body: JSON.stringify(data.record) });
      } else if (payload.operation === "imageDelete") response = await fetch(`${storageUrl}/storage/v1/object/${bucket}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: [data.path] }) });
      else response = await fetch(url, { headers });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as { error?: unknown; message?: unknown };
        console.warn("Encrypted storage provider rejected request", { status: response.status, operation: payload.operation, bucket, error: typeof failure.error === "string" ? failure.error.slice(0, 120) : "unknown" });
        throw new HttpsError("unavailable", "Encrypted image storage request failed.");
      }
      const objectId = sodium.to_hex(sodium.crypto_generichash(24, data.path, null));
      if (payload.operation === "imageUpload") await db().ref(`e2eeImageObjects/${bucket}/${ownerId}/${objectId}`).set(data.path);
      else if (payload.operation === "imageDelete") await db().ref(`e2eeImageObjects/${bucket}/${ownerId}/${objectId}`).remove();
      return payload.operation === "imageDownload" ? { record: await response.json() } : {};
    }
    default: return invalid("Unsupported encrypted operation.");
  }
}));

// A request outside the two-minute acceptance window cannot be replayed. Keep
// a full extra day of markers so clock skew cannot reopen a valid request.
export const pruneEncryptedRequests = onSchedule({ schedule: "every 24 hours", region: "europe-west1", timeZone: "UTC" }, async () => {
  const users = (await db().ref("e2eeRequests").get()).val() ?? {};
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const removals: Obj = {};
  for (const [uid, requests] of Object.entries(users) as [string, Obj][]) for (const [requestId, timestamp] of Object.entries(requests)) if (typeof timestamp === "number" && timestamp < cutoff) removals[`e2eeRequests/${uid}/${requestId}`] = null;
  if (Object.keys(removals).length) await db().ref().update(removals);
});
