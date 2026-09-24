import { get, onValue, ref, runTransaction } from "firebase/database";

import { database } from "@/state/store/firebase";
import { parsePreferences } from "@/features/bible-reader/preferences";
import type { BibleReaderPreferences } from "@/features/bible-reader/types";

export type StoredBibleReaderPreferences = {
  preferences: BibleReaderPreferences;
  updatedAt: number;
};

export type CloudBibleReaderPreferences = Omit<BibleReaderPreferences, "appTheme"> & {
  updatedAt: number;
};

export function bibleReaderPreferencesPath(userId: string) {
  return `bibleReaderPreferences/${userId}`;
}

export function readStoredBibleReaderPreferences(value: string | null): StoredBibleReaderPreferences | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      preferences: parsePreferences(value),
      updatedAt: typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function parseCloudBibleReaderPreferences(value: unknown): StoredBibleReaderPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const updatedAt = (value as Record<string, unknown>).updatedAt;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;

  try {
    const preferences = parsePreferences(JSON.stringify(value));
    return {
      preferences: { ...preferences, appTheme: undefined },
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function readerPreferencesSignature(preferences: BibleReaderPreferences) {
  const { appTheme: _appTheme, ...readerPreferences } = preferences;
  return JSON.stringify(readerPreferences);
}

export function serializeStoredBibleReaderPreferences(snapshot: StoredBibleReaderPreferences) {
  return JSON.stringify({ ...snapshot.preferences, updatedAt: snapshot.updatedAt });
}

export function cloudBibleReaderPreferences(snapshot: StoredBibleReaderPreferences): CloudBibleReaderPreferences {
  const { appTheme: _appTheme, ...preferences } = snapshot.preferences;
  return { ...preferences, updatedAt: snapshot.updatedAt };
}

export async function fetchCloudBibleReaderPreferences(userId: string) {
  const snapshot = await get(ref(database, bibleReaderPreferencesPath(userId)));
  return parseCloudBibleReaderPreferences(snapshot.val());
}

export function listenForCloudBibleReaderPreferences(
  userId: string,
  onPreferences: (snapshot: StoredBibleReaderPreferences | null) => void,
  onError: (error: Error) => void,
) {
  return onValue(
    ref(database, bibleReaderPreferencesPath(userId)),
    (snapshot) => onPreferences(parseCloudBibleReaderPreferences(snapshot.val())),
    onError,
  );
}

export function listenForDatabaseConnection(onConnection: (connected: boolean) => void, onError: (error: Error) => void) {
  return onValue(ref(database, ".info/connected"), (snapshot) => onConnection(snapshot.val() === true), onError);
}

export async function saveCloudBibleReaderPreferences(userId: string, candidate: StoredBibleReaderPreferences) {
  const result = await runTransaction(
    ref(database, bibleReaderPreferencesPath(userId)),
    (currentValue) => {
      const current = parseCloudBibleReaderPreferences(currentValue);
      if (current && current.updatedAt >= candidate.updatedAt) return;
      return cloudBibleReaderPreferences(candidate);
    },
    { applyLocally: false },
  );

  return parseCloudBibleReaderPreferences(result.snapshot.val());
}
