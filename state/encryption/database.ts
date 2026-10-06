import * as Firebase from "firebase/database";
import { database as sessionDatabase } from "@/state/store/firebase";
import { policy, policies, isEnvelope } from "./schema";
import { resolveEncryptedImages } from "@/state/supabase-storage";
import { crypto, session, prepareScope, keyForScope, ensureGroupDeviceSigners, sessionGeneration, account } from "./session";
export { equalTo, orderByChild, endBefore, limitToLast } from "firebase/database";
export type { DatabaseReference, Query } from "firebase/database";

const logicalPaths = new WeakMap<object, string>();
const recordContexts = new Map<string, string>();
const pendingGroupReads = new Map<string, Promise<void>>();
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
const diagnosticClock = () => globalThis.performance?.now?.() ?? Date.now();
function reportDatabaseTiming(stage: string, path: string, value: unknown, started: number) {
  const elapsedMs = diagnosticClock() - started;
  if (elapsedMs > 50) console.info(`[encryption] ${stage}`, {
    collection: parts(path)[0] ?? "root",
    records: value && typeof value === "object" ? Object.keys(value).length : 0,
    elapsedMs: Math.round(elapsedMs),
  });
}
function decodeObservedValue(path: string, value: unknown) {
  const started = diagnosticClock();
  try { return decodeAt(path, value); }
  finally { reportDatabaseTiming("database decode", path, value, started); }
}
const pendingRecordDecodes: (() => void)[] = [];
let decodeTurnScheduled = false;
function scheduleDecodeTurn() {
  if (decodeTurnScheduled) return;
  decodeTurnScheduled = true;
  // All subscriptions share one budget. Independent zero-delay loops otherwise
  // consume a full frame each and collectively starve React's initial commit.
  setTimeout(() => {
    decodeTurnScheduled = false;
    const started = diagnosticClock();
    while (pendingRecordDecodes.length) {
      pendingRecordDecodes.shift()!();
      if (diagnosticClock() - started >= 8) break;
    }
    if (pendingRecordDecodes.length) scheduleDecodeTurn();
  }, 16);
}
function decodeInTurn<T>(work: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    pendingRecordDecodes.push(() => {
      try { resolve(work()); } catch (error) { reject(error); }
    });
    scheduleDecodeTurn();
  });
}
async function decodeReadableValue(path: string, value: unknown, isCurrent: () => boolean): Promise<unknown> {
  const checkCurrent = () => { if (!isCurrent()) throw new Error("The encrypted session changed."); };
  checkCurrent();
  if (!path || path.startsWith(".info/") || !value || typeof value !== "object" || Array.isArray(value)) return decodeObservedValue(path, value);
  const { definition, parts: p } = policy(path);
  if (p.length >= definition.depth) return decodeObservedValue(path, value);
  const started = diagnosticClock();
  let decodeMs = 0;
  const decoded: [string, unknown][] = [];
  const entries = Object.entries(value);
  for (let index = 0; index < entries.length; index++) {
    checkCurrent();
    const [id, record] = entries[index];
    // Decode through the parent so saved verse/highlight opaque IDs retain the
    // same reconstruction and authenticated paths as a complete snapshot.
    const row = await decodeInTurn(() => {
      checkCurrent();
      const recordStarted = diagnosticClock();
      const result = decodeAt(path, { [id]: record }) as Record<string, unknown>;
      decodeMs += diagnosticClock() - recordStarted;
      return result;
    });
    checkCurrent();
    decoded.push(...Object.entries(row));
  }
  checkCurrent();
  const elapsedMs = diagnosticClock() - started;
  if (elapsedMs > 50) console.info("[encryption] database collection decode", {
    collection: p[0], records: entries.length, elapsedMs: Math.round(elapsedMs), decodeMs: Math.round(decodeMs), yields: entries.length,
  });
  return Object.fromEntries(decoded);
}
function prepareReadableGroup(groupId: string) {
  const key = `${sessionGeneration()}:${groupId}`;
  const pending = pendingGroupReads.get(key);
  if (pending) return pending;
  const request = Promise.resolve().then(async () => {
    await prepareScope(`group:${groupId}`);
    await ensureGroupDeviceSigners(groupId);
  }).finally(() => {
    if (pendingGroupReads.get(key) === request) pendingGroupReads.delete(key);
  });
  pendingGroupReads.set(key, request);
  return request;
}
async function prepare(path: string, write: boolean, value?: unknown) {
  if (!path || path.startsWith(".info/")) return;
  const { definition, scope, parts: p } = policy(path);
  // An empty read has no encrypted fields or signers to resolve. In particular,
  // an empty membership index must not reload historical groups from the vault.
  if (!write && (value === null || value === undefined)) return;
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
    if (!write && scope.startsWith("group:")) await prepareReadableGroup(scope.slice(6));
    else await prepareScope(scope, write);
  } else if (definition.scope === "membership" && p.length === 2) {
    const groups = (value as Record<string, unknown>) ?? (write ? session().vault.groups : {});
    await Promise.all(Object.keys(groups).map(async (groupId) => {
      try { await prepareReadableGroup(groupId); } catch { /* Pending/removed groups have no readable content. */ }
    }));
  }
}
function imagePlaceholders(value: unknown): { value: unknown; pending: boolean } {
  if (!value || typeof value !== "object") return { value, pending: false };
  if (Array.isArray(value)) {
    const children = value.map(imagePlaceholders);
    return { value: children.map((child) => child.value), pending: children.some((child) => child.pending) };
  }
  const object = value as Record<string, unknown>;
  if (typeof object.url === "string" && object.url.startsWith("koino-encrypted://")) {
    return { value: { ...object, encryptedUri: object.url, url: undefined }, pending: true };
  }
  const children = Object.entries(object).map(([key, child]) => [key, imagePlaceholders(child)] as const);
  return {
    value: Object.fromEntries(children.map(([key, child]) => [key, child.value])),
    pending: children.some(([, child]) => child.pending),
  };
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
  const materializationStarted = diagnosticClock();
  const value = raw.val();
  reportDatabaseTiming("snapshot materialization", path, value, materializationStarted);
  await prepare(path, false, value);
  if (token !== sessionGeneration()) throw new Error("The encrypted session changed.");
  const scope = path && !path.startsWith(".info/") ? policy(path).scope : "";
  const decoded = await decodeReadableValue(path, value, () => token === sessionGeneration());
  if (token !== sessionGeneration()) throw new Error("The encrypted session changed.");
  const hydrated = await resolveEncryptedImages(decoded, scope.startsWith("group:") ? scope.slice(6) : undefined);
  if (token !== sessionGeneration()) throw new Error("The encrypted session changed.");
  return decodedSnapshot(raw, path, hydrated);
}
export function onValue(reference: Firebase.Query, listener: (snapshot: Firebase.DataSnapshot) => unknown, onError?: (error: Error) => unknown) {
  const path = logical(reference);
  let active = true, revision = 0;
  const unsubscribe = Firebase.onValue(reference, (raw) => {
    const request = ++revision, token = sessionGeneration();
    const materializationStarted = diagnosticClock();
    const value = raw.val();
    reportDatabaseTiming("snapshot materialization", path, value, materializationStarted);
    void prepare(path, false, value).then(async () => {
      if (!active || revision !== request || token !== sessionGeneration()) return;
      const decoded = await decodeReadableValue(path, value, () => active && revision === request && token === sessionGeneration());
      if (!active || revision !== request || token !== sessionGeneration()) return;
      const initial = imagePlaceholders(decoded);
      if (!initial.pending) return listener(decodedSnapshot(raw, path, decoded));
      // Text and membership are ready as soon as their ciphertext is verified;
      // avatar downloads can fill in afterwards without blocking startup.
      await listener(decodedSnapshot(raw, path, initial.value));
      if (!active || revision !== request || token !== sessionGeneration()) return;
      const scope = path && !path.startsWith(".info/") ? policy(path).scope : "";
      const hydrated = await resolveEncryptedImages(decoded, scope.startsWith("group:") ? scope.slice(6) : undefined);
      if (!active || revision !== request || token !== sessionGeneration()) return;
      return listener(decodedSnapshot(raw, path, hydrated));
    }).catch((error: Error) => { if (active && revision === request && token === sessionGeneration()) onError?.(error); });
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
