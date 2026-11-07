import AsyncStorage from "@/state/encryption/local-storage";
import { useEffect, useState } from "react";

import { parseBibleHistory } from "@/features/bible-history";
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

export function hasRecordedBibleReadingPosition(value: string | null) {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as { bibleVersionId?: unknown; history?: unknown } | null;
    if (!isBibleVersionId(parsed?.bibleVersionId)) return false;
    const history = parseBibleHistory(parsed.history, parsed.bibleVersionId);
    // A single position can come from reader initialization, even on a fresh account.
    return Boolean(history && history.entries.length > 1);
  } catch {
    return false;
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
