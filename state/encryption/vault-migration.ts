import * as Raw from "firebase/database";
import sodium from "react-native-libsodium";
import { auth, database } from "@/state/store/firebase";
import storage from "./local-storage";
import { createCrypto, type EncryptedRecord } from "./crypto";
import { isEnvelope, policies } from "./schema";

// One-time conversion of a device's encrypted vault into ordinary records.
// Runs before the app reads content, so the rest of the app only ever sees
// plaintext. Records the device cannot decrypt are moved aside and listed.
const crypto = createCrypto(sodium);
const bundlePath = (uid: string) => `e2ee.vault.${uid}`;
const devicePath = (uid: string) => `e2ee.device.${uid}`;
const completePath = (uid: string) => `e2ee.plaintext-migration.${uid}`;
const skippedPath = (uid: string) => `e2ee.plaintext-skipped.${uid}`;
const personalEpochKey = (vault: Vault, epoch: string) => vault.personalKeys[epoch];
type Vault = {
  v: 1; uid: string; identity: Identity; personalEpoch: number; personalKeys: Record<string, string>;
  groups: Record<string, { keys: Record<string, string>; trustedSigners?: string[] }>;
  previousIdentities?: Identity[];
};
type Identity = { publicKey: string; privateKey: string; signingPublicKey: string; signingPrivateKey: string };
type Device = { id: string; identity: Identity };
type Account = { publicKey: string; signingPublicKey: string; devices: Record<string, { signingPublicKey: string; active: boolean }> };
type Group = { id: string; ownerId: string; members: Record<string, unknown>; signers?: string[] };

export type MigrationReport = { migrated: number; skipped: string[] };

const physical = (path: string) => `encryptedData/${path.split("/").filter(Boolean).join("/")}`;

async function raw(path: string) {
  return (await Raw.get(Raw.ref(database, physical(path)))).val();
}

async function trustedAccounts(uid: string, accounts: Map<string, Account>) {
  const existing = accounts.get(uid);
  if (existing) return existing;
  const value = await Raw.get(Raw.ref(database, `e2eeAccounts/${uid}`))
    .then((snapshot) => snapshot.val() as Account | null)
    .catch(() => null);
  if (value) accounts.set(uid, value);
  return value ?? undefined;
}

async function personalTrust(vault: Vault, accounts: Map<string, Account>) {
  const trusted = new Set<string>([vault.identity.signingPublicKey]);
  for (const previous of vault.previousIdentities ?? []) trusted.add(previous.signingPublicKey);
  const savedDevice = await storage.getItem(devicePath(vault.uid)).catch(() => null);
  if (savedDevice) {
    try {
      const device = JSON.parse(savedDevice) as Device;
      if (device?.identity?.signingPublicKey) trusted.add(device.identity.signingPublicKey);
    } catch { /* the device bundle is optional */ }
  }
  const account = await trustedAccounts(vault.uid, accounts);
  for (const device of Object.values(account?.devices ?? {})) trusted.add(device.signingPublicKey);
  return trusted;
}

async function groupTrust(vault: Vault, groupId: string, accounts: Map<string, Account>, personal: Set<string>) {
  const trusted = new Set(personal);
  for (const signer of vault.groups[groupId]?.trustedSigners ?? []) trusted.add(signer);
  const group = (await Raw.get(Raw.ref(database, `e2eeGroups/${groupId}`)).then((snapshot) => snapshot.val() as Group | null).catch(() => null));
  for (const signer of group?.signers ?? []) trusted.add(signer);
  for (const member of Object.keys(group?.members ?? {})) {
    const account = await trustedAccounts(member, accounts);
    for (const device of Object.values(account?.devices ?? {})) trusted.add(device.signingPublicKey);
  }
  return trusted;
}

function keyFor(vault: Vault, envelope: EncryptedRecord) {
  if (envelope.keyId.startsWith("user:")) {
    const [, uid, epoch] = envelope.keyId.split(":");
    if (uid !== vault.uid) throw new Error("This record belongs to another account.");
    const key = personalEpochKey(vault, epoch);
    if (!key) throw new Error("The account key for this record is unavailable.");
    return key;
  }
  if (envelope.keyId.startsWith("group:")) {
    const [, groupId, epoch] = envelope.keyId.split(":");
    const key = vault.groups[groupId]?.keys[epoch];
    if (!key) throw new Error("The community key for this record is unavailable.");
    return key;
  }
  if (envelope.keyId.startsWith("recipient:")) {
    const identities = [vault.identity, ...(vault.previousIdentities ?? [])];
    for (const identity of identities) {
      try { return (crypto.unseal(envelope.wrappedKey!, identity) as { key: string }).key; }
      catch { /* try the next historical identity */ }
    }
    throw new Error("The recipient key for this record is unavailable.");
  }
  throw new Error("Unknown record key.");
}

function decrypter(vault: Vault, trusted: Set<string>) {
  return function walk(value: unknown, path: string): unknown {
    if (isEnvelope(value)) {
      const key = keyFor(vault, value);
      return crypto.decrypt(value, path, key, trusted);
    }
    if (Array.isArray(value)) return value.map((child, index) => walk(child, `${path}/${index}`));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, walk(child, `${path}/${name}`)]));
    }
    return value;
  };
}

function realRecordId(collection: string, scope: string, id: string, record: Record<string, unknown>, decrypt: (value: unknown, path: string) => unknown) {
  if (!["savedVerses", "bibleHighlights"].includes(collection) || !isEnvelope(record.__id)) return id;
  const real = decrypt(record.__id, `${collection}/${scope}/${id}/__id`);
  return typeof real === "string" ? real : id;
}

async function migrateCollection(vault: Vault, collection: string, scope: string, trusted: Set<string>, report: MigrationReport, personal: boolean, accounts: Map<string, Account>) {
  const depth = policies[collection].depth;
  const decrypt = decrypter(vault, trusted);
  async function walk(value: unknown, pathParts: string[]): Promise<void> {
    if (pathParts.length === depth) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const record = value as Record<string, unknown>;
      const scopePath = pathParts.slice(0, -1).join("/");
      const physicalId = pathParts.at(-1)!;
      try {
        let recordTrusted = trusted;
        if (collection === "prayerNotifications" && typeof record.userId === "string" && record.userId !== vault.uid) {
          const author = await trustedAccounts(record.userId, accounts);
          if (author) {
            recordTrusted = new Set(trusted);
            for (const device of Object.values(author.devices ?? {})) recordTrusted.add(device.signingPublicKey);
          }
        }
        const read = recordTrusted === trusted ? decrypt : decrypter(vault, recordTrusted);
        const id = realRecordId(collection, scopePath, physicalId, record, read);
        const plain = read(record, pathParts.join("/")) as Record<string, unknown>;
        delete plain.__id;
        if (id === physicalId) await Raw.set(Raw.ref(database, physical(pathParts.join("/"))), plain);
        else await Raw.update(Raw.ref(database, physical(scopePath)), { [physicalId]: null, [id]: plain });
        report.migrated++;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown error";
        if (personal) {
          // Keep unreadable content out of the app's lists, under the owner.
          // A top-level record (a profile or preferences) is left in place.
          if (depth >= 3) {
            const groupNode = Math.max(2, depth - 1);
            await Raw.update(Raw.ref(database, physical(pathParts.slice(0, groupNode).join("/"))), { [physicalId]: null });
            await Raw.set(Raw.ref(database, physical(`legacyUndecryptable/${vault.uid}/${collection}/${physicalId}`)), { reason, record });
          }
          report.skipped.push(pathParts.join("/"));
        } else {
          report.skipped.push(pathParts.join("/"));
        }
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [child, childValue] of Object.entries(value as Record<string, unknown>)) {
      await walk(childValue, [...pathParts, child]);
    }
  }
  let scoped: unknown;
  try {
    scoped = await raw(`${collection}/${scope}`);
  } catch (error) {
    // A community the account has left is no longer readable, and a change
    // made by a newer app version can deny a collection this build still
    // knows about. Skipping that scope must not stop the rest of the account
    // from opening, so a denied read is recorded instead of thrown.
    if (permissionDenied(error)) {
      report.skipped.push(`${collection}/${scope}`);
      return;
    }
    throw error;
  }
  await walk(scoped, [collection, scope]);
}

function permissionDenied(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "PERMISSION_DENIED" || code === "permission_denied" || /permission[_ ]denied/i.test(message);
}

export async function plaintextMigrationComplete(uid: string) {
  return (await storage.getItem(completePath(uid))) === "true";
}

export async function migrateVaultToPlaintext(progress: (message: string) => void = () => undefined): Promise<MigrationReport> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to continue.");
  const report: MigrationReport = { migrated: 0, skipped: [] };
  if (await plaintextMigrationComplete(uid)) return report;
  const saved = await storage.getItem(bundlePath(uid));
  if (!saved) {
    await storage.setItem(completePath(uid), "true");
    return report;
  }
  const vault = JSON.parse(saved) as Vault;
  if (vault.v !== 1 || vault.uid !== uid) throw new Error("The saved account keys do not belong to this account.");
  const accounts = new Map<string, Account>();
  const personal = await personalTrust(vault, accounts);
  const personalCollections = Object.entries(policies)
    .filter(([, policy]) => policy.scope === "user" || policy.scope === "routing" || policy.scope === "membership")
    .map(([collection]) => collection)
    .filter((collection) => !["inviteCodes", "discussionFollowers", "groupBiblePlanParticipantIds", "legacyGroupArchives", "pushDeliveryDiagnostics"].includes(collection));
  for (const collection of personalCollections) {
    progress(`Migrating ${collection}...`);
    await migrateCollection(vault, collection, uid, personal, report, true, accounts);
    if (auth.currentUser?.uid !== uid) throw new Error("The account changed while migrating.");
  }
  for (const groupId of Object.keys(vault.groups)) {
    const trusted = await groupTrust(vault, groupId, accounts, personal).catch(() => undefined);
    if (!trusted) continue;
    for (const [collection, policy] of Object.entries(policies)) {
      if (policy.scope !== "group" && policy.scope !== "membership") continue;
      progress(`Migrating ${collection}...`);
      await migrateCollection(vault, collection, groupId, trusted, report, false, accounts);
      if (auth.currentUser?.uid !== uid) throw new Error("The account changed while migrating.");
    }
  }
  await storage.setItem(skippedPath(uid), JSON.stringify(report.skipped));
  await import("./session").then(({ encryptedOperation }) => encryptedOperation("discardVault")).catch(() => undefined);
  for (const key of [bundlePath(uid), devicePath(uid), `e2ee.draft.${uid}`, `e2ee.migration-complete.user.${uid}`]) {
    await storage.removeItem(key);
  }
  await storage.setItem(completePath(uid), "true");
  if (report.skipped.length) console.warn("[plaintext-migration] skipped records", report.skipped);
  return report;
}

