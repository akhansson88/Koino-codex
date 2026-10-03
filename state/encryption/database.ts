import * as Firebase from "firebase/database";
import { database as sessionDatabase } from "@/state/store/firebase";
import { policy, policies, isEnvelope } from "./schema";
import { resolveEncryptedImages } from "@/state/supabase-storage";
import { crypto, session, prepareScope, keyForScope, ensureGroupDeviceSigners, sessionGeneration, account } from "./session";
export { equalTo, orderByChild, endBefore, limitToLast } from "firebase/database";
export type { DatabaseReference, Query } from "firebase/database";

const logicalPaths = new WeakMap<object, string>();
const recordContexts = new Map<string, string>();
const parts = (path: string) => path.split("/").filter(Boolean);
function logical(query: Firebase.Query): string {
  const path = logicalPaths.get(query);
  if (path === undefined) throw new Error("Use the encrypted database reference adapter.");
  return path;
}
function physical(path: string) {
  const values = parts(path);
  if (["savedVerses", "bibleHighlights"].includes(values[0]) && values.length >= 3) {
    values[2] = crypto.opaqueId(values[2], session().vault.personalKeys["1"]);
  }
  return `encryptedData/${values.join("/")}`;
}
export const physicalPath = physical;
export function ref(db: Firebase.Database, path = ""): Firebase.DatabaseReference {
  const value = Firebase.ref(db, path.startsWith(".info/") ? path : physical(path));
  logicalPaths.set(value, path);
  return value;
}
export function query(base: Firebase.Query, ...constraints: Firebase.QueryConstraint[]) {
  const value = Firebase.query(base, ...constraints);
  logicalPaths.set(value, logical(base));
  return value;
}
function transform(path: string, value: unknown, mode: "encrypt" | "decrypt"): unknown {
  if (value === null || value === undefined || path.startsWith(".info/")) return value ?? null;
  if (!path) return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, transform(name, child, mode)]));
  const definition = policy(path);
  const recordPath = definition.parts.slice(0, definition.definition.depth).join("/");
  if (definition.parts.length === definition.definition.depth && value && typeof value === "object" && !Array.isArray(value)) {
    const userId = (value as Record<string, unknown>).userId;
    recordContexts.set(recordPath, crypto.canonical({ subject: typeof userId === "string" ? userId : definition.scope }));
  }
  if (definition.definition.scope === "routing") {
    if (definition.sensitive && definition.definition.metadata.length) throw new Error(`Unexpected routing field: ${path}`);
    return value;
  }
  if (definition.sensitive && (mode === "decrypt" ? isEnvelope(value) : typeof value !== "object")) {
    const context = recordContexts.get(recordPath);
    if (mode === "decrypt" && context && (value as import("./crypto").EncryptedRecord).context !== context && definition.parts.at(-1) !== "__id") throw new Error("Encrypted author context does not match.");
    if (definition.parts[0] === "prayerNotifications") {
      const recipient = definition.parts[1];
      if (mode === "encrypt" && recipient !== session().uid) {
        const key = crypto.randomKey();
        const remote = session().accounts[recipient];
        if (!remote) throw new Error("Recipient encryption identity is unavailable.");
        return crypto.encrypt(value, path, `recipient:${recipient}`, key, session().device.identity, crypto.seal({ key }, remote.publicKey), context);
      }
      if (mode === "decrypt" && (value as import("./crypto").EncryptedRecord).wrappedKey) {
        const encrypted = value as import("./crypto").EncryptedRecord;
        if (recipient !== session().uid || encrypted.keyId !== `recipient:${recipient}`) throw new Error("Recipient context does not match.");
        let key: string | undefined;
        for (const identity of [session().vault.identity, ...(session().vault.previousIdentities ?? [])]) {
          try { key = (crypto.unseal(encrypted.wrappedKey!, identity) as { key: string }).key; break; } catch { /* Historical recipient identity may be needed after revocation. */ }
        }
        if (!key) throw new Error("Recipient encryption key is unavailable.");
        const trusted = new Set(Object.values(session().accounts).flatMap((remote) => Object.values(remote.devices).map((device) => device.signingPublicKey)));
        return crypto.decrypt(encrypted, path, key, trusted);
      }
    }
    const selected = keyForScope(definition.scope, mode === "decrypt" ? (value as import("./crypto").EncryptedRecord).keyId : undefined);
    if (mode === "encrypt") return crypto.encrypt(value, path, selected.keyId, selected.key, session().device.identity, undefined, context);
    if ((value as import("./crypto").EncryptedRecord).keyId !== selected.keyId) throw new Error("Encryption key context does not match.");
    return crypto.decrypt(value as import("./crypto").EncryptedRecord, path, selected.key, selected.trusted);
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.map((child, index) => transform(`${path}/${index}`, child, mode));
    const source = mode === "encrypt" && "encryptedUri" in value ? { ...value, url: (value as { encryptedUri: string }).encryptedUri } : value;
    return Object.fromEntries(Object.entries(source).filter(([name]) => mode !== "decrypt" || name !== "__id").map(([name, child]) => {
      // Saved verse/highlight IDs are opaque in Firebase; reconstruct the
      // original local ID before authenticating any record field.
      let childPath = `${path}/${name}`;
      let outputName = name;
      if (mode === "decrypt" && ["savedVerses", "bibleHighlights"].includes(definition.parts[0]) && definition.parts.length === 2) {
        const id = (child as Record<string, unknown>).__id;
        if (!isEnvelope(id)) throw new Error("Encrypted record identity is missing.");
        const selected = keyForScope(definition.scope, id.keyId);
        outputName = crypto.decrypt(id, `${path}/${name}/__id`, selected.key, selected.trusted) as string;
        childPath = `${path}/${outputName}`;
      }
      return [outputName, transform(childPath, child, mode)];
    }).filter(([name]) => name !== "__id"));
  }
  if (definition.sensitive) throw new Error("Plaintext content was found in encrypted storage.");
  return value;
}
export function encodeAt(path: string, value: unknown): unknown {
  const encoded = transform(path, value, "encrypt");
  const p = parts(path);
  if (["savedVerses", "bibleHighlights"].includes(p[0]) && p.length === 3 && value && typeof value === "object") {
    const { key, keyId } = keyForScope(`user:${p[1]}`);
    const physicalId = crypto.opaqueId(p[2], session().vault.personalKeys["1"]);
    (encoded as Record<string, unknown>).__id = crypto.encrypt(p[2], `${p[0]}/${p[1]}/${physicalId}/__id`, keyId, key, session().device.identity);
  }
  return encoded;
}
export const decodeAt = (path: string, value: unknown) => transform(path, value, "decrypt");
async function prepare(path: string, write: boolean, value?: unknown) {
  if (!path || path.startsWith(".info/")) return;
  const { definition, scope, parts: p } = policy(path);
  if (write && p.length > definition.depth && definition.scope !== "routing") {
    const recordPath = p.slice(0, definition.depth).join("/");
    const record = (await Firebase.get(Firebase.ref(sessionDatabase, physical(recordPath)))).val();
    recordContexts.set(recordPath, crypto.canonical({ subject: record?.userId ?? scope }));
  }
  if (p[0] === "prayerNotifications") {
    if (write && p[1] !== session().uid) { await account(p[1]); return; }
    if (!write && value && typeof value === "object") {
      const records = p.length === 2 ? Object.values(value) : [value];
      for (const record of records as Record<string, unknown>[]) if (typeof record.userId === "string" && Object.values(record).some((field) => isEnvelope(field) && field.wrappedKey)) await account(record.userId);
    }
  }
  if ((definition.scope === "group" && p.length >= 2) || (definition.scope === "membership" && p.length >= 3) || definition.scope === "user") {
    await prepareScope(scope, write);
    if (!write && scope.startsWith("group:")) await ensureGroupDeviceSigners(scope.slice(6));
  } else if (definition.scope === "membership" && p.length === 2) {
    const state = session();
    for (const groupId of Object.keys((value as Record<string, unknown>) ?? state.vault.groups)) { try { await prepareScope(`group:${groupId}`); await ensureGroupDeviceSigners(groupId); } catch { /* Pending/removed groups have no readable content. */ } }
  }
}
function decodedSnapshot(raw: Firebase.DataSnapshot, path: string, hydrated?: unknown): Firebase.DataSnapshot {
  const value = hydrated ?? decodeAt(path, raw.val());
  const build = (data: unknown, key: string | null): Firebase.DataSnapshot => ({
    key, ref: raw.ref, size: data && typeof data === "object" ? Object.keys(data).length : 0,
    val: () => data ?? null, exportVal: () => data ?? null, exists: () => data !== null && data !== undefined,
    hasChildren: () => Boolean(data && typeof data === "object" && Object.keys(data).length),
    hasChild: (child: string) => build(data, key).child(child).exists(),
    child: (child: string) => { let node = data; for (const segment of parts(child)) node = node && typeof node === "object" ? (node as Record<string, unknown>)[segment] : null; return build(node, parts(child).at(-1) ?? null); },
    forEach: (action: (child: Firebase.DataSnapshot) => boolean | void) => { if (!data || typeof data !== "object") return false; for (const [child, node] of Object.entries(data)) if (action(build(node, child)) === true) return true; return false; },
    toJSON: () => data,
  }) as Firebase.DataSnapshot;
  return build(value, raw.key);
}
export async function get(reference: Firebase.Query) {
  const path = logical(reference), token = sessionGeneration();
  const raw = await Firebase.get(reference);
  await prepare(path, false, raw.val());
  if (token !== sessionGeneration()) throw new Error("The encrypted session changed.");
  const scope = path && !path.startsWith(".info/") ? policy(path).scope : "";
  const hydrated = await resolveEncryptedImages(decodeAt(path, raw.val()), scope.startsWith("group:") ? scope.slice(6) : undefined);
  if (token !== sessionGeneration()) throw new Error("The encrypted session changed.");
  return decodedSnapshot(raw, path, hydrated);
}
export function onValue(reference: Firebase.Query, listener: (snapshot: Firebase.DataSnapshot) => unknown, onError?: (error: Error) => unknown) {
  const path = logical(reference);
  let active = true, revision = 0;
  const unsubscribe = Firebase.onValue(reference, (raw) => {
    const request = ++revision, token = sessionGeneration();
    void prepare(path, false, raw.val()).then(async () => {
      if (!active || revision !== request || token !== sessionGeneration()) return;
      const scope = path && !path.startsWith(".info/") ? policy(path).scope : "";
      const hydrated = await resolveEncryptedImages(decodeAt(path, raw.val()), scope.startsWith("group:") ? scope.slice(6) : undefined);
      if (!active || revision !== request || token !== sessionGeneration()) return;
      return listener(decodedSnapshot(raw, path, hydrated));
    }).catch((error: Error) => { if (active && revision === request) onError?.(error); });
  }, onError);
  return () => { active = false; revision++; unsubscribe(); };
}
export async function set(reference: Firebase.DatabaseReference, value: unknown) {
  const path = logical(reference), token = sessionGeneration();
  await prepare(path, true);
  if (token !== sessionGeneration()) throw new Error("The encrypted session changed.");
  return Firebase.set(reference, encodeAt(path, value));
}
export async function update(reference: Firebase.DatabaseReference, values: Record<string, unknown>) {
  const base = logical(reference), token = sessionGeneration();
  const encoded: Record<string, unknown> = {};
  for (const [child, value] of Object.entries(values)) {
    const path = [base, child].filter(Boolean).join("/");
    await prepare(path, value !== null);
    const relative = physical(path).slice("encryptedData/".length);
    const rootBase = physical(base).slice("encryptedData/".length);
    encoded[rootBase ? relative.slice(rootBase.length + 1) : relative] = encodeAt(path, value);
  }
  if (token !== sessionGeneration()) throw new Error("The encrypted session changed.");
  return Firebase.update(reference, encoded);
}
export const remove = (reference: Firebase.DatabaseReference) => set(reference, null);
export async function runTransaction(reference: Firebase.DatabaseReference, action: (value: any) => unknown, options?: Firebase.TransactionOptions) {
  const path = logical(reference), token = sessionGeneration();
  await prepare(path, true);
  const result = await Firebase.runTransaction(reference, (value) => {
    if (token !== sessionGeneration()) throw new Error("The encrypted session changed.");
    const next = action(decodeAt(path, value));
    return next === undefined ? undefined : encodeAt(path, next);
  }, options);
  return { ...result, snapshot: decodedSnapshot(result.snapshot, path) };
}
export { policies };
