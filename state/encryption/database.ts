import * as Firebase from "firebase/database";
import { database as sessionDatabase } from "@/state/store/firebase";
import { policies } from "./schema";
export { equalTo, orderByChild, endBefore, limitToLast } from "firebase/database";
export type { DatabaseReference, Query } from "firebase/database";

// KOINO stores account and community content as plain records under
// encryptedData/. The path segment is kept so database rules can keep group
// content member-only while the app reads and writes normal values.
const logicalPaths = new WeakMap<object, string>();
const parts = (path: string) => path.split("/").filter(Boolean);

function logical(query: Firebase.Query): string {
  const path = logicalPaths.get(query);
  if (path === undefined) throw new Error("Use the KOINO database reference adapter.");
  return path;
}

export function physicalPath(path: string) {
  const values = parts(path);
  return `encryptedData/${values.join("/")}`;
}

export function ref(db: Firebase.Database, path = ""): Firebase.DatabaseReference {
  const value = Firebase.ref(db, path.startsWith(".info/") ? path : physicalPath(path));
  logicalPaths.set(value, path);
  return value;
}

export function query(base: Firebase.Query, ...constraints: Firebase.QueryConstraint[]) {
  const value = Firebase.query(base, ...constraints);
  logicalPaths.set(value, logical(base));
  return value;
}

export function encodeAt(_path: string, value: unknown): unknown {
  return value;
}

export const decodeAt = (_path: string, value: unknown) => value;

export async function get(reference: Firebase.Query) {
  const path = logical(reference);
  // Rejections from the rules are surfaced to the caller unchanged.
  return Firebase.get(reference);
}

export function onValue(reference: Firebase.Query, listener: (snapshot: Firebase.DataSnapshot) => unknown, onError?: (error: Error) => unknown) {
  logical(reference);
  return Firebase.onValue(reference, listener, onError);
}

export async function set(reference: Firebase.DatabaseReference, value: unknown, canCommit?: () => boolean) {
  if (canCommit && !canCommit()) throw new Error("The write audience changed.");
  return Firebase.set(reference, encodeAt(logical(reference), value));
}

export async function update(reference: Firebase.DatabaseReference, values: Record<string, unknown>, canCommit?: () => boolean) {
  if (canCommit && !canCommit()) throw new Error("The write audience changed.");
  const base = logical(reference);
  const encoded: Record<string, unknown> = {};
  for (const [child, value] of Object.entries(values)) {
    const path = [base, child].filter(Boolean).join("/");
    encoded[physicalPath(path).slice("encryptedData/".length)] = encodeAt(path, value);
  }
  return Firebase.update(Firebase.ref(sessionDatabase, "encryptedData"), encoded);
}

export const remove = (reference: Firebase.DatabaseReference) => set(reference, null);

export async function runTransaction(reference: Firebase.DatabaseReference, action: (value: any) => unknown, options?: Firebase.TransactionOptions) {
  const path = logical(reference);
  const result = await Firebase.runTransaction(reference, (value) => {
    const next = action(decodeAt(path, value));
    return next === undefined ? undefined : encodeAt(path, next);
  }, options);
  return { ...result, snapshot: result.snapshot };
}

export { policies };
