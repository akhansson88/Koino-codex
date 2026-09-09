import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { isBibleVersionId, type BibleVersionId } from "@/features/bible-versions";

export const defaultBibleVersionId: BibleVersionId = "reformationsbibeln2026";

export function readerStorageKey(userId?: string) {
  return userId ? `koino.bibleReader.${userId}` : undefined;
}

export function bibleVersionFromStoredPreferences(value: string | null): BibleVersionId {
  if (!value) return defaultBibleVersionId;

  try {
    const parsed = JSON.parse(value) as { bibleVersionId?: unknown } | null;
    return isBibleVersionId(parsed?.bibleVersionId) ? parsed.bibleVersionId : defaultBibleVersionId;
  } catch {
    return defaultBibleVersionId;
  }
}

const listeners = new Set<(versionId: BibleVersionId) => void>();

export function notifyBibleVersionPreferenceChanged(versionId: BibleVersionId) {
  listeners.forEach((listener) => listener(versionId));
}

export function usePreferredBibleVersion(userId?: string): BibleVersionId {
  const [versionId, setVersionId] = useState<BibleVersionId>(defaultBibleVersionId);
  const storageKey = readerStorageKey(userId);

  useEffect(() => {
    let active = true;

    if (!storageKey) {
      setVersionId(defaultBibleVersionId);
      return () => {
        active = false;
      };
    }

    void AsyncStorage.getItem(storageKey).then((value) => {
      if (active) setVersionId(bibleVersionFromStoredPreferences(value));
    });

    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    const listener = (nextVersionId: BibleVersionId) => setVersionId(nextVersionId);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return versionId;
}
