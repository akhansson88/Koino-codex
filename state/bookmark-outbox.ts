import storage from "@/state/encryption/local-storage";
import { ref, update } from "@/state/encryption/database";
import { database } from "@/state/store/firebase";

export type BookmarkOutboxEntry = {
  path: string;
  value: unknown;
  at: string;
};

function outboxKey(uid: string) {
  return `koino.bookmarks.outbox.${uid}`;
}

function isEntry(value: unknown): value is BookmarkOutboxEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BookmarkOutboxEntry>;
  return typeof candidate.path === "string" && candidate.path.length > 0 && "value" in candidate && typeof candidate.at === "string";
}

export async function readBookmarkOutbox(uid: string): Promise<BookmarkOutboxEntry[]> {
  try {
    const raw = await storage.getItem(outboxKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export async function bookmarkOutboxCount(uid: string) {
  return (await readBookmarkOutbox(uid)).length;
}

export async function enqueueBookmarkWrites(uid: string, writes: Record<string, unknown>) {
  const entries = await readBookmarkOutbox(uid);
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const at = new Date().toISOString();
  for (const [path, value] of Object.entries(writes)) byPath.set(path, { path, value, at });
  await storage.setItem(outboxKey(uid), JSON.stringify([...byPath.values()]));
}

export async function clearBookmarkOutbox(uid: string) {
  try {
    await storage.removeItem(outboxKey(uid));
  } catch {
    // Sign-out must not fail because an empty queue key was already gone.
  }
}

/**
 * Applies queued bookmark writes in one atomic multi-path update, then clears
 * the queue. A failed flush keeps every entry so it can be retried.
 */
export async function flushBookmarkOutbox(uid: string) {
  const entries = await readBookmarkOutbox(uid);
  if (!entries.length) return 0;
  const writes = Object.fromEntries(entries.map((entry) => [entry.path, entry.value]));
  await update(ref(database), writes);
  await clearBookmarkOutbox(uid);
  return entries.length;
}

/**
 * Online writes go straight to Firebase. Offline writes are queued locally so
 * they survive a cold start and are replayed when the connection returns.
 */
export async function writeBookmarkWrites(uid: string, writes: Record<string, unknown>, online: boolean) {
  if (online) {
    try {
      await update(ref(database), writes);
      return "written" as const;
    } catch {
      // A connection that dropped between the check and the write is still a
      // local change. Keep it in the outbox and retry on the next connection.
      await enqueueBookmarkWrites(uid, writes);
      return "queued" as const;
    }
  }
  await enqueueBookmarkWrites(uid, writes);
  return "queued" as const;
}
