import {
  endBefore,
  get,
  limitToLast,
  orderByChild,
  query,
  type DatabaseReference,
  type Query,
} from "firebase/database";

import type { Id } from "@/state/types";

export const FIREBASE_PAGE_SIZE = 50;

export type FirebasePageRecord = {
  id: Id;
  createdAt: string;
};

function compareNewestFirst(left: FirebasePageRecord, right: FirebasePageRecord) {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

export function firebaseRecords<T extends FirebasePageRecord>(value: unknown): T[] {
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, T>).sort(compareNewestFirst);
}

export function mergeFirebaseRecords<T extends FirebasePageRecord>(...pages: readonly T[][]): T[] {
  const records = new Map<Id, T>();
  pages.flat().forEach((record) => records.set(record.id, record));
  return Array.from(records.values()).sort(compareNewestFirst);
}

export function recentFirebaseQuery(reference: DatabaseReference): Query {
  return query(reference, orderByChild("createdAt"), limitToLast(FIREBASE_PAGE_SIZE));
}

export async function fetchOlderFirebasePage<T extends FirebasePageRecord>(
  reference: DatabaseReference,
  loadedRecords: readonly T[],
) {
  const oldestRecord = [...loadedRecords].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  )[0];

  if (!oldestRecord) return { hasMore: false, records: [] as T[] };

  const snapshot = await get(
    query(
      reference,
      orderByChild("createdAt"),
      endBefore(oldestRecord.createdAt, oldestRecord.id),
      limitToLast(FIREBASE_PAGE_SIZE),
    ),
  );
  const records = firebaseRecords<T>(snapshot.val());
  return { hasMore: records.length === FIREBASE_PAGE_SIZE, records };
}
