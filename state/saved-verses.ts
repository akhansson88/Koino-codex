import type { BibleVerse, SavedVerse } from "@/state/types";

type SavedVerseIdentitySource = Pick<
  BibleVerse,
  "book" | "chapter" | "endVerse" | "reference" | "startVerse"
>;

type SavedVerseRecord = Record<string, SavedVerse>;

const SCHEMA_VERSION = 2;

function normalizeIdentityPart(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function passageCoordinates(verse: SavedVerseIdentitySource) {
  const explicitChapter = positiveInteger(verse.chapter);
  const explicitStart = positiveInteger(verse.startVerse);
  const explicitEnd = positiveInteger(verse.endVerse) ?? explicitStart;

  if (typeof verse.book === "string" && verse.book.trim() && explicitChapter && explicitStart && explicitEnd) {
    return {
      book: normalizeIdentityPart(verse.book),
      chapter: explicitChapter,
      endVerse: Math.max(explicitStart, explicitEnd),
      startVerse: Math.min(explicitStart, explicitEnd),
    };
  }

  const reference = typeof verse.reference === "string" ? verse.reference.trim() : "";
  const match = /^(.+?)\s+(\d+):(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(reference);
  if (!match) return undefined;

  const chapter = positiveInteger(Number(match[2]));
  const startVerse = positiveInteger(Number(match[3]));
  const endVerse = positiveInteger(Number(match[4] ?? match[3]));
  if (!chapter || !startVerse || !endVerse) return undefined;

  return {
    book: normalizeIdentityPart(match[1]),
    chapter,
    endVerse: Math.max(startVerse, endVerse),
    startVerse: Math.min(startVerse, endVerse),
  };
}

/**
 * Stable identity for one exact contiguous Scripture range.
 *
 * The translation is deliberately not part of the identity: a bookmark belongs
 * to the passage, so switching Bible version must not create a second record.
 */
export function savedVerseIdentity(verse: SavedVerseIdentitySource) {
  const coordinates = passageCoordinates(verse);
  if (!coordinates) return undefined;

  return JSON.stringify([
    coordinates.book,
    coordinates.chapter,
    coordinates.startVerse,
    coordinates.endVerse,
  ]);
}

/** Firebase-safe deterministic key for newly saved passages. */
export function savedVerseStorageId(verse: SavedVerseIdentitySource) {
  const identity = savedVerseIdentity(verse);
  return identity ? `passage_${encodeURIComponent(identity)}` : undefined;
}

function savedTime(verse: SavedVerse) {
  const parsed = Date.parse(verse.savedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function updatedTime(verse: SavedVerse) {
  const parsed = Date.parse(verse.updatedAt ?? verse.savedAt);
  return Number.isFinite(parsed) ? parsed : savedTime(verse);
}

function noteTime(verse: SavedVerse) {
  const parsed = Date.parse(verse.noteUpdatedAt ?? verse.savedAt);
  return Number.isFinite(parsed) ? parsed : savedTime(verse);
}

function newerRecord<T extends SavedVerse>(current: T | undefined, candidate: T, time: (verse: T) => number) {
  if (!current) return candidate;
  return time(candidate) > time(current) ? candidate : current;
}

function mergeGroup(group: SavedVerse[], storageKey: string): SavedVerse {
  // The newest save supplies the displayed text and translation.
  const newest = group[0];
  const earliestSavedAt = group.reduce(
    (earliest, verse) => (savedTime(verse) < savedTime(earliest) ? verse : earliest),
    group[0],
  ).savedAt;
  const latestNote = group.reduce<SavedVerse | undefined>(
    (current, verse) => (typeof verse.note === "string" && verse.note.trim() ? newerRecord(current, verse, noteTime) : current),
    undefined,
  );
  const latestCollection = group.reduce<SavedVerse | undefined>(
    (current, verse) => (verse.collectionId ? newerRecord(current, verse, updatedTime) : current),
    undefined,
  );
  const latestUpdatedAt = group.reduce(
    (latest, verse) => (updatedTime(verse) > updatedTime(latest) ? verse : latest),
    group[0],
  ).updatedAt;

  return {
    ...newest,
    id: storageKey,
    schema: SCHEMA_VERSION,
    savedAt: earliestSavedAt,
    updatedAt: latestUpdatedAt ?? newest.updatedAt ?? newest.savedAt,
    ...(latestNote?.note?.trim()
      ? { note: latestNote.note.trim(), noteUpdatedAt: latestNote.noteUpdatedAt ?? latestNote.savedAt }
      : {}),
    ...(latestCollection?.collectionId ? { collectionId: latestCollection.collectionId } : {}),
  };
}

/**
 * Keeps one record per exact structural passage, merging duplicates that were
 * saved from different Bible translations. Records that cannot be identified
 * are preserved independently so unrelated legacy data is untouched.
 */
export function normalizeSavedVerseRecords(value: unknown) {
  if (!value || typeof value !== "object") {
    return { duplicateStorageKeys: [] as string[], verses: [] as SavedVerse[] };
  }

  const entries = Object.entries(value as SavedVerseRecord)
    .filter((entry): entry is [string, SavedVerse] => Boolean(entry[1]) && typeof entry[1] === "object")
    .sort(([firstKey, first], [secondKey, second]) => savedTime(second) - savedTime(first) || firstKey.localeCompare(secondKey));
  const duplicateStorageKeys: string[] = [];
  const groups = new Map<string, SavedVerse[]>();
  const unidentified: SavedVerse[] = [];

  entries.forEach(([storageKey, verse]) => {
    const identity = savedVerseIdentity(verse);
    if (!identity) {
      unidentified.push({ ...verse, id: storageKey });
      return;
    }
    const group = groups.get(identity) ?? [];
    group.push({ ...verse, id: storageKey });
    groups.set(identity, group);
  });

  const verses: SavedVerse[] = [];
  groups.forEach((group) => {
    const [newest] = group;
    const merged = mergeGroup(group, newest.id);
    verses.push(merged);
    group.slice(1).forEach((verse) => duplicateStorageKeys.push(verse.id));
  });

  verses.push(...unidentified);
  verses.sort((left, right) => savedTime(right) - savedTime(left) || left.id.localeCompare(right.id));

  return { duplicateStorageKeys, verses };
}

/** True when a stored record should be rewritten under its canonical key. */
export function savedVerseNeedsCanonicalKey(verse: SavedVerse) {
  const canonical = savedVerseStorageId(verse);
  return Boolean(canonical && canonical !== verse.id);
}

/** Compact record used when a legacy key is rewritten during migration. */
export function canonicalSavedVerseRecord(verse: SavedVerse) {
  const canonical = savedVerseStorageId(verse);
  if (!canonical) return undefined;
  return {
    ...verse,
    id: canonical,
    schema: SCHEMA_VERSION,
    updatedAt: verse.updatedAt ?? verse.savedAt,
  } satisfies SavedVerse;
}
