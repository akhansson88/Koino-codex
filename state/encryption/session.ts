import sodium from "react-native-libsodium";
import { get, ref, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { auth, database, functions } from "@/state/store/firebase";
import storage from "./local-storage";
import { createCrypto, type Identity, type EncryptedRecord } from "./crypto";

export const crypto = createCrypto(sodium);
export type PublicIdentity = Pick<Identity, "publicKey" | "signingPublicKey">;
export type Vault = {
  v: 1; uid: string; identity: Identity; personalEpoch: number;
  personalKeys: Record<string, string>; recoveryKey: string;
  groups: Record<string, { keys: Record<string, string>; ownerKey: string; revision: number; trustedSigners: string[] }>;
  previousIdentities?: Identity[];
};
export type Device = { id: string; identity: Identity };
export type IdentityRotation = { previous: PublicIdentity; next: PublicIdentity; signature: string };
export type Account = PublicIdentity & { recovery: EncryptedRecord; devices: Record<string, PublicIdentity & { active: boolean; grant: string; certificate: string }>; rotations?: IdentityRotation[] };
export type GroupState = {
  id: string; ownerId: string; epoch: number; revision: number; status: "ready" | "rotation_required";
  members: Record<string, PublicIdentity>; grants: Record<string, string>;
  signers: string[]; signer: string; signature: string;
  previous?: GroupState;
};
type Session = { uid: string; vault: Vault; device: Device; accounts: Record<string, Account>; groups: Record<string, GroupState> };
let current: Session | undefined;
let generation = 0;
const changes = new Set<() => void>();
const changed = () => changes.forEach((listener) => listener());
export const subscribeEncryption = (listener: () => void) => { changes.add(listener); return () => { changes.delete(listener); }; };
export const session = () => { if (!current || current.uid !== auth.currentUser?.uid) throw new Error("Unlock your encrypted account before continuing."); return current; };
export const sessionGeneration = () => generation;
export function lockSession() { current = undefined; generation++; changed(); }
const vaultPath = (uid: string) => `e2ee.vault.${uid}`;
const devicePath = (uid: string) => `e2ee.device.${uid}`;
export const publicIdentity = (identity: PublicIdentity): PublicIdentity => ({ publicKey: identity.publicKey, signingPublicKey: identity.signingPublicKey });

async function invoke<T>(operation: string, data: unknown, device?: Device) {
  const signingDevice = device ?? current?.device;
  const payload = { operation, data, deviceId: signingDevice?.id ?? null, requestId: crypto.randomKey(), timestamp: Date.now() };
  const signature = signingDevice ? crypto.signature(payload, signingDevice.identity.signingPrivateKey) : null;
  const response = await httpsCallable<unknown, T>(functions, "encryptedAccount")({ ...payload, signature });
  return response.data;
}
export const encryptedOperation = invoke;
let backupQueue: Promise<void> = Promise.resolve();
function saveVault() {
  const token = generation;
  const run = backupQueue.catch(() => undefined).then(async () => {
    if (token !== generation) throw new Error("Account changed while saving encrypted keys.");
    await writeVault();
  });
  backupQueue = run;
  return run;
}
async function writeVault() {
  const state = session();
  await storage.setItem(vaultPath(state.uid), JSON.stringify(state.vault));
  const recovery = crypto.encrypt(state.vault, `recovery/${state.uid}`, "recovery:1", state.vault.recoveryKey, state.vault.identity);
  const grants = Object.fromEntries(Object.entries(state.accounts[state.uid].devices).filter(([, device]) => device.active).map(([id, device]) => [id, crypto.seal(state.vault, device.publicKey)]));
  await invoke("backup", { recovery, grants });
}
export async function account(uid: string) {
  const state = session();
  const token = generation;
  const value = (await get(ref(database, `e2eeAccounts/${uid}`))).val() as Account | null;
  if (token !== generation || current !== state) throw new Error("The account changed while loading identities.");
  if (!value) throw new Error("This member has not set up encryption yet.");
  for (const [id, device] of Object.entries(value.devices ?? {})) {
    if (!crypto.verify({ uid, id, publicKey: device.publicKey, signingPublicKey: device.signingPublicKey }, device.certificate, value.signingPublicKey)) throw new Error("Device certificate could not be verified.");
  }
  state.accounts[uid] = value;
  return value;
}
export async function localDevice(uid: string): Promise<Device> {
  const saved = await storage.getItem(devicePath(uid));
  if (saved) return JSON.parse(saved) as Device;
  const device = { id: crypto.opaqueId(crypto.randomKey(), crypto.randomKey()), identity: crypto.identity() };
  await storage.setItem(devicePath(uid), JSON.stringify(device));
  return device;
}
export async function unlockExisting(uid: string): Promise<"setup" | "recovery" | "ready"> {
  lockSession();
  const token = generation;
  const [snapshot, device] = await Promise.all([get(ref(database, `e2eeAccounts/${uid}`)), localDevice(uid)]);
  const remote = snapshot.val() as Account | null;
  if (auth.currentUser?.uid !== uid || token !== generation) throw new Error("The account changed while unlocking.");
  if (!remote) return "setup";
  const registration = remote.devices?.[device.id];
  if (!registration?.active) return "recovery";
  if (registration.publicKey !== device.identity.publicKey || registration.signingPublicKey !== device.identity.signingPublicKey) throw new Error("Device identity changed unexpectedly.");
  if (!crypto.verify({ uid, id: device.id, publicKey: registration.publicKey, signingPublicKey: registration.signingPublicKey }, registration.certificate, remote.signingPublicKey)) throw new Error("Device certificate could not be verified.");
  const vault = crypto.unseal(registration.grant, device.identity) as Vault;
  if (vault.v !== 1 || vault.uid !== uid || vault.identity.publicKey !== remote.publicKey || vault.identity.signingPublicKey !== remote.signingPublicKey) throw new Error("Account identity could not be verified.");
  if (auth.currentUser?.uid !== uid || token !== generation) throw new Error("The account changed while unlocking.");
  current = { uid, vault, device, accounts: { [uid]: remote }, groups: {} };
  await storage.setItem(vaultPath(uid), JSON.stringify(vault));
  changed();
  return "ready";
}
export async function draftAccount(uid: string) {
  const saved = await storage.getItem(`e2ee.draft.${uid}`);
  if (saved) return JSON.parse(saved) as Vault;
  const personalKey = crypto.randomKey();
  const vault: Vault = { v: 1, uid, identity: crypto.identity(), personalEpoch: 1, personalKeys: { "1": personalKey }, recoveryKey: crypto.randomKey(), groups: {} };
  await storage.setItem(`e2ee.draft.${uid}`, JSON.stringify(vault));
  return vault;
}
export async function confirmAccount(vault: Vault) {
  if (auth.currentUser?.uid !== vault.uid) throw new Error("Sign in again.");
  const device = await localDevice(vault.uid);
  const identity = publicIdentity(vault.identity);
  const recovery = crypto.encrypt(vault, `recovery/${vault.uid}`, "recovery:1", vault.recoveryKey, vault.identity);
  const certificate = crypto.signature({ uid: vault.uid, id: device.id, ...publicIdentity(device.identity) }, vault.identity.signingPrivateKey);
  const data = { ...identity, device: { id: device.id, ...publicIdentity(device.identity), active: true, certificate, grant: crypto.seal(vault, device.identity.publicKey) }, recovery };
  await invoke("setup", { ...data, proof: crypto.signature(data, vault.identity.signingPrivateKey) }, device);
  await unlockExisting(vault.uid);
  await storage.removeItem(`e2ee.draft.${vault.uid}`);
}
export async function recoverAccount(uid: string, code: string) {
  const remote = (await get(ref(database, `e2eeAccounts/${uid}`))).val() as Account | null;
  if (!remote) throw new Error("No encrypted account exists.");
  const recoveryKey = code.trim().replace(/\s/g, "");
  if (crypto.decode(recoveryKey).length !== 32) throw new Error("Enter your complete recovery code.");
  const vault = crypto.decrypt(remote.recovery, `recovery/${uid}`, recoveryKey, new Set([remote.signingPublicKey])) as Vault;
  if (vault.uid !== uid || vault.identity.publicKey !== remote.publicKey || vault.identity.signingPublicKey !== remote.signingPublicKey) throw new Error("Recovery identity could not be verified.");
  const device = await localDevice(uid);
  const certificate = crypto.signature({ uid, id: device.id, ...publicIdentity(device.identity) }, vault.identity.signingPrivateKey);
  const data = { device: { id: device.id, ...publicIdentity(device.identity), active: true, certificate, grant: crypto.seal(vault, device.identity.publicKey) } };
  await invoke("recover", { ...data, proof: crypto.signature(data, vault.identity.signingPrivateKey) }, device);
  await unlockExisting(uid);
}
export async function requestDeviceApproval(uid: string) {
  const device = await localDevice(uid);
  await invoke("requestDevice", { id: device.id, ...publicIdentity(device.identity) }, device);
  return crypto.fingerprint(device.identity.signingPublicKey);
}
export async function approveDevice(id: string, expectedFingerprint: string) {
  const state = session();
  const request = (await get(ref(database, `e2eeDeviceRequests/${state.uid}/${id}`))).val() as PublicIdentity | null;
  if (!request || crypto.fingerprint(request.signingPublicKey) !== expectedFingerprint.trim()) throw new Error("Device fingerprint does not match.");
  const certificate = crypto.signature({ uid: state.uid, id, ...publicIdentity(request) }, state.vault.identity.signingPrivateKey);
  await invoke("approveDevice", { id, expected: request, certificate, grant: crypto.seal(state.vault, request.publicKey) });
  await account(state.uid);
}
function verifyGroup(group: GroupState, pinnedOwner?: string): boolean {
  const { signature, previous, ...payload } = group;
  if (!crypto.verify({ ...payload, previous: previous ?? null }, signature, group.signer)) return false;
  if (previous) {
    if (previous.revision + 1 !== group.revision || previous.id !== group.id || !verifyGroup(previous, pinnedOwner)) return false;
    return group.signer === previous.members[previous.ownerId]?.signingPublicKey;
  }
  return group.revision === 1 && group.signer === group.members[group.ownerId]?.signingPublicKey && (!pinnedOwner || group.signer === pinnedOwner);
}
export async function loadGroup(groupId: string) {
  const state = session();
  const token = generation;
  const group = (await get(ref(database, `e2eeGroups/${groupId}`))).val() as GroupState | null;
  const cached = state.vault.groups[groupId];
  if (!group || !group.members[state.uid] || !group.grants[state.uid]) throw new Error("Group access is pending approval.");
  if (!verifyGroup(group, cached?.ownerKey) || (cached && group.revision < cached.revision)) throw new Error("Group identity or revision could not be verified.");
  const recipientIdentity = [state.vault.identity, ...(state.vault.previousIdentities ?? [])].find((identity) => identity.publicKey === group.members[state.uid].publicKey);
  if (!recipientIdentity) throw new Error("Ask the community owner to approve your updated identity.");
  const grant = crypto.unseal(group.grants[state.uid], recipientIdentity) as { id: string; keys: Record<string, string> };
  if (grant.id !== groupId || !grant.keys[String(group.epoch)]) throw new Error("Group keys could not be verified.");
  if (token !== generation || current !== state) throw new Error("The account changed while loading keys.");
  let genesis = group;
  while (genesis.previous) genesis = genesis.previous;
  state.groups[groupId] = group;
  state.vault.groups[groupId] = { keys: grant.keys, ownerKey: genesis.signer, revision: group.revision, trustedSigners: group.signers };
  if (!cached || cached.revision !== group.revision) await saveVault();
  return group;
}
export async function prepareScope(scope: string, write = false) {
  const state = session();
  if (scope.startsWith("group:")) {
    const group = await loadGroup(scope.slice(6));
    if (write) {
      const locked = (await get(ref(database, `e2eeGroupLocks/${group.id}`))).exists();
      if (group.status !== "ready" || locked) throw new Error("This community is waiting for its owner to rotate encryption keys.");
    }
    return;
  }
  if (scope !== `user:${state.uid}`) throw new Error("Private content belongs to another account.");
}
export function keyForScope(scope: string, keyId?: string) {
  const state = session();
  if (scope.startsWith("group:")) {
    const id = scope.slice(6);
    const group = state.groups[id];
    const epoch = keyId?.split(":").at(-1) ?? String(group?.epoch);
    const key = state.vault.groups[id]?.keys[epoch];
    if (!key || !group?.members[state.uid]) throw new Error("Group access is pending approval.");
    return { key, keyId: `group:${id}:${epoch}`, trusted: new Set([...group.signers, ...Object.values(state.accounts).flatMap((value) => Object.values(value.devices ?? {}).map((device) => device.signingPublicKey))]) };
  }
  if (scope !== `user:${state.uid}`) throw new Error("Private content belongs to another account.");
  const epoch = keyId?.split(":").at(-1) ?? String(state.vault.personalEpoch);
  const key = state.vault.personalKeys[epoch];
  if (!key) throw new Error("Personal encryption key is unavailable.");
  return { key, keyId: `user:${state.uid}:${epoch}`, trusted: new Set([state.vault.identity.signingPublicKey, ...Object.values(state.accounts[state.uid].devices ?? {}).map((device) => device.signingPublicKey)]) };
}
export async function ensureGroupDeviceSigners(groupId: string) {
  const group = current?.groups[groupId] ?? await loadGroup(groupId);
  await Promise.all(Object.keys(group.members).map(async (uid) => {
    const remote = await account(uid);
    if (!identityMatches(group.members[uid], remote)) throw new Error("A community member's identity changed. Ask the owner to verify it.");
  }));
}
export function identityMatches(expected: PublicIdentity, remote: Account) {
  let identity = expected;
  for (const rotation of remote.rotations ?? []) {
    if (rotation.previous.publicKey !== identity.publicKey || rotation.previous.signingPublicKey !== identity.signingPublicKey) continue;
    if (!crypto.verify({ previous: rotation.previous, next: rotation.next }, rotation.signature, identity.signingPublicKey)) return false;
    identity = rotation.next;
  }
  return identity.publicKey === remote.publicKey && identity.signingPublicKey === remote.signingPublicKey;
}
export async function draftRevocation(id: string): Promise<Vault> {
  const state = session();
  const remote = await account(state.uid);
  if (id === state.device.id || !remote.devices[id]?.active) throw new Error("Choose another authorized device.");
  return { ...state.vault, identity: crypto.identity(), previousIdentities: [...(state.vault.previousIdentities ?? []), state.vault.identity], personalEpoch: state.vault.personalEpoch + 1, personalKeys: { ...state.vault.personalKeys, [String(state.vault.personalEpoch + 1)]: crypto.randomKey() }, recoveryKey: crypto.randomKey() };
}
let rotatingIdentity = false;
export const identityRotationInProgress = () => rotatingIdentity;
export async function revokeDevice(id: string, vault: Vault, name: string) {
  const state = session();
  rotatingIdentity = true;
  try {
  const previous = publicIdentity(state.vault.identity), next = publicIdentity(vault.identity);
  const rotation = { previous, next, signature: crypto.signature({ previous, next }, state.vault.identity.signingPrivateKey) };
  const remote = await account(state.uid);
  const devices = Object.fromEntries(Object.entries(remote.devices).map(([deviceId, device]) => [deviceId, { ...device, active: deviceId === id ? false : device.active, certificate: crypto.signature({ uid: state.uid, id: deviceId, publicKey: device.publicKey, signingPublicKey: device.signingPublicKey }, vault.identity.signingPrivateKey), grant: deviceId !== id && device.active ? crypto.seal(vault, device.publicKey) : device.grant }]));
  const recovery = crypto.encrypt(vault, `recovery/${state.uid}`, "recovery:1", vault.recoveryKey, vault.identity);
  const groupRequests: Record<string, string> = {};
  for (const groupId of Object.keys(vault.groups)) {
    const group = await loadGroup(groupId);
    if (group.ownerId !== state.uid) groupRequests[groupId] = crypto.seal({ name }, group.members[group.ownerId].publicKey);
  }
  await invoke("revokeDevice", { id, next, rotation, devices, personalEpoch: vault.personalEpoch, recovery, groupRequests });
  state.vault = vault;
  await storage.setItem(vaultPath(state.uid), JSON.stringify(vault));
  await account(state.uid);
  for (const groupId of Object.keys(vault.groups)) {
    const group = state.groups[groupId];
    if (group?.ownerId === state.uid) await rotateGroup(groupId);
  }
  changed();
  } finally { rotatingIdentity = false; }
}
export function signedGroup(value: Omit<GroupState, "signature" | "signer">): GroupState {
  const state = session();
  const previousOwnerKey = value.previous?.members[value.previous.ownerId]?.signingPublicKey;
  const signingIdentity = [state.vault.identity, ...(state.vault.previousIdentities ?? [])].find((identity) => !previousOwnerKey || identity.signingPublicKey === previousOwnerKey);
  if (!signingIdentity) throw new Error("The prior community owner identity is unavailable.");
  const signer = signingIdentity.signingPublicKey;
  const { signature: _oldSignature, signer: _oldSigner, ...unsigned } = value as GroupState;
  const payload = { ...unsigned, signer, previous: value.previous ?? null };
  return { ...unsigned, signer, signature: crypto.signature(payload, signingIdentity.signingPrivateKey) };
}
export async function createEncryptedGroup(groupId: string, data: () => unknown) {
  const state = session();
  const keys = { "1": crypto.randomKey() };
  const group = signedGroup({ id: groupId, ownerId: state.uid, epoch: 1, revision: 1, status: "ready", members: { [state.uid]: publicIdentity(state.vault.identity) }, grants: { [state.uid]: crypto.seal({ id: groupId, keys }, state.vault.identity.publicKey) }, signers: [state.vault.identity.signingPublicKey, state.device.identity.signingPublicKey] });
  state.groups[groupId] = group;
  state.vault.groups[groupId] = { keys, ownerKey: group.signer, revision: 1, trustedSigners: group.signers };
  await invoke("createGroup", { group, records: data() });
  await saveVault();
}
export async function publishGroup(group: GroupState, records?: unknown) {
  await invoke("groupChange", { group, records: records ?? {} });
  await loadGroup(group.id);
}
export async function groupJoinRequest(code: string, name: string) {
  const state = session();
  const invite = await invoke<{ groupId: string; owner: PublicIdentity }>("resolveInvite", { code });
  await invoke("requestJoin", { code, identity: publicIdentity(state.vault.identity), name: crypto.seal({ name }, invite.owner.publicKey) });
}
export async function approveGroupMember(groupId: string, uid: string, fingerprint: string, records: (name: string) => unknown) {
  const state = session();
  const group = await loadGroup(groupId);
  if (group.ownerId !== state.uid) throw new Error("Only the community owner can approve members.");
  const request = (await get(ref(database, `e2eeJoinRequests/${groupId}/${uid}`))).val() as PublicIdentity & { name: string } | null;
  if (!request || crypto.fingerprint(request.signingPublicKey) !== fingerprint.trim()) throw new Error("Member fingerprint does not match.");
  const recipient = await account(uid);
  if (request.publicKey !== recipient.publicKey || request.signingPublicKey !== recipient.signingPublicKey) throw new Error("Member identity changed. Request access again.");
  const ownerIdentity = [state.vault.identity, ...(state.vault.previousIdentities ?? [])].find((identity) => identity.publicKey === group.members[state.uid].publicKey) ?? state.vault.identity;
  const name = (crypto.unseal(request.name, ownerIdentity) as { name: string }).name;
  const nextKeys = { ...state.vault.groups[groupId].keys, [String(group.epoch + 1)]: crypto.randomKey() };
  const nextMembers = { ...group.members, [uid]: publicIdentity(recipient), [state.uid]: publicIdentity(state.vault.identity) };
  const nextGrants = Object.fromEntries(Object.entries(nextMembers).map(([memberId, identity]) => [memberId, crypto.seal({ id: groupId, keys: nextKeys }, identity.publicKey)]));
  const next = signedGroup({ ...group, previous: group, epoch: group.epoch + 1, revision: group.revision + 1, members: nextMembers, grants: nextGrants, signers: [...new Set([...group.signers, recipient.signingPublicKey, ...Object.values(recipient.devices).map((device) => device.signingPublicKey)])] });
  const cachedKeys = state.vault.groups[groupId].keys;
  state.groups[groupId] = next; state.vault.groups[groupId].keys = nextKeys;
  try { await publishGroup(next, records(name)); }
  catch (error) { state.groups[groupId] = group; state.vault.groups[groupId].keys = cachedKeys; throw error; }
}
export async function rotateGroup(groupId: string, removedUid?: string, newOwnerId?: string) {
  const state = session();
  const group = await loadGroup(groupId);
  if (group.ownerId !== state.uid) throw new Error("The community owner must rotate its keys.");
  const members = { ...group.members, [state.uid]: publicIdentity(state.vault.identity) };
  const departures = (await get(ref(database, `e2eeDepartures/${groupId}`))).val() as Record<string, boolean> | null;
  for (const uid of Object.keys(departures ?? {})) delete members[uid];
  if (removedUid) delete members[removedUid];
  const epoch = group.epoch + 1;
  const keys = { ...state.vault.groups[groupId].keys, [String(epoch)]: crypto.randomKey() };
  const grants = Object.fromEntries(Object.entries(members).map(([uid, identity]) => [uid, crypto.seal({ id: groupId, keys }, identity.publicKey)]));
  const next = signedGroup({ ...group, previous: group, ownerId: newOwnerId ?? group.ownerId, epoch, revision: group.revision + 1, status: "ready", members, grants });
  await publishGroup(next);
}
export async function leaveEncryptedGroup(groupId: string) { await invoke("leaveGroup", { groupId }); delete session().vault.groups[groupId]; delete session().groups[groupId]; await saveVault(); }
export async function deleteEncryptedGroup(groupId: string) { await invoke("deleteGroup", { groupId }); delete session().vault.groups[groupId]; delete session().groups[groupId]; await saveVault(); }
export async function refreshBackup() { await account(session().uid); await saveVault(); }
export function listenRaw(path: string, listener: (value: unknown) => void) { return onValue(ref(database, path), (snapshot) => listener(snapshot.val())); }
