// Live group reading: a member publishes only the position they are reading
// right now, and only while they chose to share it. The record is overwritten
// in place and never appended, so no reading history exists on the server.
//
// A record alone is not enough to be shown: the member must also be present in
// the app (the same presence model the community already uses), so a killed app
// can never leave a position behind that looks live.

import type { PresenceByUser } from "@/state/presence-model";

export const READING_LIVE_WINDOW_MS = 2 * 60 * 1000;
export const READING_RECENT_WINDOW_MS = 30 * 60 * 1000;
export const READING_RETENTION_MS = 24 * 60 * 60 * 1000;
export const READING_HEARTBEAT_MS = 20 * 1000;
export const READING_SETTLE_MS = 1500;
export const READING_TICK_MS = 30 * 1000;

export type ReadingScope = "chapter" | "verse";
export type ReadingStatus = "live" | "recent";

export type ReadingRecord = {
  at: number;
  book: string;
  chapter: number;
  platform?: string;
  scope: ReadingScope;
  verse?: number;
  versionId?: string;
};

export type ReadingEntry = ReadingRecord & {
  status: ReadingStatus;
  userId: string;
};

export type ReadingPosition = {
  book: string;
  chapter: number;
  verse?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integerBetween(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

export function parseReadingRecord(value: unknown): ReadingRecord | undefined {
  if (!isRecord(value)) return undefined;
  const book = typeof value.book === "string" ? value.book.trim() : "";
  const chapter = integerBetween(value.chapter, 1, 150);
  const scope = value.scope === "verse" ? "verse" : value.scope === "chapter" ? "chapter" : undefined;
  const at = typeof value.at === "number" && Number.isFinite(value.at) && value.at > 0 ? value.at : undefined;
  if (!book || book.length > 40 || chapter === undefined || !scope || at === undefined) return undefined;

  const verse = integerBetween(value.verse, 1, 200);
  if (scope === "verse" && verse === undefined) return undefined;

  return {
    at,
    book,
    chapter,
    ...(verse === undefined ? {} : { verse }),
    scope,
    ...(typeof value.platform === "string" && value.platform.length <= 20 ? { platform: value.platform } : {}),
    ...(typeof value.versionId === "string" && value.versionId.length <= 60 ? { versionId: value.versionId } : {}),
  };
}

export function readingChapterKey(book: string, chapter: number) {
  return `${book}:${chapter}`;
}

/**
 * Build the list a screen may show. Both conditions must hold: a fresh publish
 * and a presence state that says the member is still in the app. Hidden or
 * offline members are never returned, even if a record still exists.
 */
export function deriveGroupReading(
  snapshot: unknown,
  presence: PresenceByUser,
  now: number,
  excludeUserId?: string,
): ReadingEntry[] {
  if (!isRecord(snapshot)) return [];
  const entries: ReadingEntry[] = [];
  for (const [userId, raw] of Object.entries(snapshot)) {
    if (userId === excludeUserId) continue;
    const record = parseReadingRecord(raw);
    if (!record) continue;
    const age = Math.max(0, now - record.at);
    if (age > READING_RETENTION_MS) continue;

    const info = presence[userId];
    if (!info || info.status === "hidden" || info.status === "offline") continue;
    const live = info.status === "online" && age <= READING_LIVE_WINDOW_MS;
    const recent = info.status === "inactive" && age <= READING_RECENT_WINDOW_MS;
    if (!live && !recent) continue;

    entries.push({ ...record, status: live ? "live" : "recent", userId });
  }
  return entries.sort((left, right) => compareReadingEntries(left, right));
}

/**
 * Live first, then the chapter the reader is in, then the same book, then the
 * closest verse. Ties break on the freshest publish, so a moving reader stays
 * at the top without a separate ordering pass in the UI.
 */
export function compareReadingEntries(left: ReadingEntry, right: ReadingEntry, position?: ReadingPosition) {
  if (left.status !== right.status) return left.status === "live" ? -1 : 1;

  if (position) {
    const leftChapter = left.book === position.book && left.chapter === position.chapter ? 0 : 1;
    const rightChapter = right.book === position.book && right.chapter === position.chapter ? 0 : 1;
    if (leftChapter !== rightChapter) return leftChapter - rightChapter;

    const leftBook = left.book === position.book ? 0 : 1;
    const rightBook = right.book === position.book ? 0 : 1;
    if (leftBook !== rightBook) return leftBook - rightBook;

    const leftDistance = Math.abs((left.verse ?? 1) - (position.verse ?? 1));
    const rightDistance = Math.abs((right.verse ?? 1) - (position.verse ?? 1));
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  }

  if (left.at !== right.at) return right.at - left.at;
  return left.userId.localeCompare(right.userId);
}

export function readingEntriesInChapter(entries: readonly ReadingEntry[], book: string, chapter: number) {
  return entries.filter((entry) => entry.book === book && entry.chapter === chapter);
}

/**
 * Only verse-level sharing can point at a row in the text. Chapter-level
 * records deliberately have no verse, so they appear in the list but never in
 * the margin.
 */
export function readingMarkersForChapter(entries: readonly ReadingEntry[], book: string, chapter: number) {
  const markers: { userId: string; verse: number }[] = [];
  for (const entry of entries) {
    if (entry.status !== "live" || entry.scope !== "verse" || entry.verse === undefined) continue;
    if (entry.book !== book || entry.chapter !== chapter) continue;
    markers.push({ userId: entry.userId, verse: entry.verse });
  }
  return markers.sort((left, right) => left.verse - right.verse);
}
