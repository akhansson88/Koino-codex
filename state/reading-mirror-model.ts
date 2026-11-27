// Pure model for the live reading mirror. Kept free of React and Firebase so
// the parsing, freshness and privacy rules can be checked without a runtime.

export const MIRROR_PUBLISH_INTERVAL_MS = 1000;
export const MIRROR_HEARTBEAT_MS = 5000;
export const MIRROR_LIVE_WINDOW_MS = 20 * 1000;
export const MIRROR_STALE_WINDOW_MS = 60 * 1000;
export const MIRROR_RETENTION_MS = 10 * 60 * 1000;
export const MIRROR_CONNECT_GRACE_MS = 8000;
export const MIRROR_ALIGNMENT_VERSION = 1;

export type MirrorAnchor = { offset: number; verse: number };
export type MirrorSelection = { end: number; start: number };

export type MirrorRecord = {
  alignmentVersion?: number;
  anchorOffset: number;
  anchorVerse: number;
  at: number;
  book: string;
  chapter: number;
  highlights?: Record<number, string>;
  mode?: "single" | "split";
  secondaryVersionId?: string;
  segmentId?: number;
  selection?: MirrorSelection;
  splitRatio?: number;
  splitSync?: boolean;
  versionId?: string;
  verse: number;
};

export type MirrorStatus = "connecting" | "live" | "stale" | "ended";

export function followersPath(groupId: string, targetUserId: string) {
  return `groupReadingFollowers/${groupId}/${targetUserId}`;
}

export function followerPath(groupId: string, targetUserId: string, followerUserId: string) {
  return `${followersPath(groupId, targetUserId)}/${followerUserId}`;
}

export function mirrorPath(groupId: string, userId: string) {
  return `groupReadingLive/${groupId}/${userId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integerBetween(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function hexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

export function parseMirrorRecord(value: unknown): MirrorRecord | undefined {
  if (!isRecord(value)) return undefined;
  const book = typeof value.book === "string" ? value.book.trim() : "";
  const chapter = integerBetween(value.chapter, 1, 150);
  const verse = integerBetween(value.verse, 1, 200);
  const anchorVerse = integerBetween(value.anchorVerse, 1, 200);
  const at = typeof value.at === "number" && Number.isFinite(value.at) && value.at > 0 ? value.at : undefined;
  if (!book || book.length > 40 || chapter === undefined || verse === undefined || anchorVerse === undefined || at === undefined) {
    return undefined;
  }

  const rawAnchor = typeof value.anchorOffset === "number" && Number.isFinite(value.anchorOffset)
    ? value.anchorOffset
    : 0;
  const anchorOffset = Math.min(1, Math.max(0, rawAnchor));

  let selection: MirrorSelection | undefined;
  if (isRecord(value.selection)) {
    const start = integerBetween(value.selection.start, 1, 200);
    const end = integerBetween(value.selection.end, 1, 200);
    if (start !== undefined && end !== undefined) {
      selection = { start: Math.min(start, end), end: Math.max(start, end) };
    }
  }

  const highlights: Record<number, string> = {};
  if (isRecord(value.highlights)) {
    for (const [key, raw] of Object.entries(value.highlights)) {
      const number = Number(key);
      const color = hexColor(raw);
      if (!Number.isInteger(number) || number < 1 || number > 200 || !color) continue;
      highlights[number] = color;
    }
  }

  const mode = value.mode === "split" ? "split" : value.mode === "single" ? "single" : undefined;
  const secondaryVersionId = typeof value.secondaryVersionId === "string" && value.secondaryVersionId.length <= 60
    ? value.secondaryVersionId
    : undefined;
  const splitRatio = typeof value.splitRatio === "number" && Number.isFinite(value.splitRatio) &&
    value.splitRatio >= 0.35 && value.splitRatio <= 0.65
    ? value.splitRatio
    : undefined;
  const splitSync = typeof value.splitSync === "boolean" ? value.splitSync : undefined;
  const segmentId = integerBetween(value.segmentId, 0, 10_000_000);
  const alignmentVersion = integerBetween(value.alignmentVersion, 0, 1000);

  return {
    anchorOffset,
    anchorVerse,
    at,
    book,
    chapter,
    ...(alignmentVersion === undefined ? {} : { alignmentVersion }),
    ...(Object.keys(highlights).length > 0 ? { highlights } : {}),
    ...(mode ? { mode } : {}),
    ...(mode === "split" && secondaryVersionId ? { secondaryVersionId } : {}),
    ...(mode === "split" && splitRatio !== undefined ? { splitRatio } : {}),
    ...(mode === "split" && splitSync !== undefined ? { splitSync } : {}),
    ...(mode === "split" && segmentId !== undefined ? { segmentId } : {}),
    ...(selection ? { selection } : {}),
    ...(mode !== "split" && typeof value.versionId === "string" && value.versionId.length <= 60 ? { versionId: value.versionId } : {}),
    ...(mode === "split" && typeof value.versionId === "string" && value.versionId.length <= 60 ? { versionId: value.versionId } : {}),
    verse,
  };
}

/** The verses of one chapter that another member has highlighted, hex only. */
export function mirrorHighlightsFor(record: MirrorRecord | undefined, book: string, chapter: number) {
  const result: Record<number, string> = {};
  if (!record || record.book !== book || record.chapter !== chapter || !record.highlights) return result;
  return { ...record.highlights };
}

/** Turn a mirror selection into the list the text renderer tints. */
export function mirrorSelectedVerses(record: MirrorRecord | undefined, book: string, chapter: number) {
  if (!record || !record.selection || record.book !== book || record.chapter !== chapter) return [];
  const verses: number[] = [];
  for (let verse = record.selection.start; verse <= record.selection.end && verses.length < 200; verse += 1) {
    verses.push(verse);
  }
  return verses;
}

export function mirrorStatus(record: MirrorRecord | undefined, now: number, startedAt: number): MirrorStatus {
  if (record) {
    // A device clock can sit slightly behind the server timestamp; never let a
    // negative age turn a fresh record into a stale one.
    const age = Math.max(0, now - record.at);
    if (age <= MIRROR_LIVE_WINDOW_MS) return "live";
    if (age <= MIRROR_STALE_WINDOW_MS) return "stale";
    return "ended";
  }
  return now - startedAt <= MIRROR_CONNECT_GRACE_MS ? "connecting" : "ended";
}

export function mirrorIsReadOnly() {
  // Followers never receive a write path to the sharer's reading. Kept as a
  // named export so the reader screens can assert the mode explicitly.
  return true;
}
