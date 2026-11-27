import storage from "@/state/encryption/local-storage";
import type { BookmarkCollection, BibleRibbon, SavedVerse } from "@/state/types";

export type BookmarkCacheSnapshot = {
  version: 1;
  bookmarks: SavedVerse[];
  collections: BookmarkCollection[];
  ribbons: BibleRibbon[];
  savedAt: string;
};

function cacheKey(uid: string) {
  return `koino.bookmarks.${uid}`;
}

function sortKey(uid: string) {
  return `koino.bookmarks.sort.${uid}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function readBookmarkCache(uid: string): Promise<BookmarkCacheSnapshot | null> {
  try {
    const raw = await storage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) return null;
    return {
      version: 1,
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks as SavedVerse[] : [],
      collections: Array.isArray(parsed.collections) ? parsed.collections as BookmarkCollection[] : [],
      ribbons: Array.isArray(parsed.ribbons) ? parsed.ribbons as BibleRibbon[] : [],
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writeBookmarkCache(
  uid: string,
  snapshot: Omit<BookmarkCacheSnapshot, "version" | "savedAt">,
) {
  try {
    await storage.setItem(cacheKey(uid), JSON.stringify({
      version: 1,
      bookmarks: snapshot.bookmarks,
      collections: snapshot.collections,
      ribbons: snapshot.ribbons,
      savedAt: new Date().toISOString(),
    } satisfies BookmarkCacheSnapshot));
  } catch {
    // The network copy is still authoritative. A failed cache write must never
    // block reading or saving bookmarks.
  }
}

export async function clearBookmarkCache(uid: string) {
  try {
    await storage.removeItem(cacheKey(uid));
    await storage.removeItem(sortKey(uid));
  } catch {
    // Sign-out must not fail because a local cache key was already gone.
  }
}

export async function readBookmarkSort(uid: string) {
  try {
    const value = await storage.getItem(sortKey(uid));
    return value === "canonical" || value === "opened" || value === "recent" ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function writeBookmarkSort(uid: string, sort: "recent" | "canonical" | "opened") {
  try {
    await storage.setItem(sortKey(uid), sort);
  } catch {
    // A remembered sort order is a convenience, not data.
  }
}
