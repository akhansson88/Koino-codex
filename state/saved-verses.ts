import type { BibleVerse, SavedVerse } from "@/state/types";

type SavedVerseIdentitySource = Pick<
  BibleVerse,
  "book" | "chapter" | "endVerse" | "reference" | "startVerse" | "translation"
>;

type SavedVerseRecord = Record<string, SavedVerse>;

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

/** Stable identity for one translation and one exact contiguous Scripture range. */
export function savedVerseIdentity(verse: SavedVerseIdentitySource) {
  const coordinates = passageCoordinates(verse);
  if (!coordinates) return undefined;

  return JSON.stringify([
    normalizeIdentityPart(typeof verse.translation === "string" ? verse.translation : ""),
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

/**
 * Keeps the newest record for each exact structural identity. Records that cannot
 * be identified are preserved independently so unrelated legacy data is untouched.
 */
export function normalizeSavedVerseRecords(value: unknown) {
  if (!value || typeof value !== "object") {
    return { duplicateStorageKeys: [] as string[], verses: [] as SavedVerse[] };
  }

  const entries = Object.entries(value as SavedVerseRecord)
    .filter((entry): entry is [string, SavedVerse] => Boolean(entry[1]) && typeof entry[1] === "object")
    .sort(([firstKey, first], [secondKey, second]) => savedTime(second) - savedTime(first) || firstKey.localeCompare(secondKey));
  const duplicateStorageKeys: string[] = [];
  const seenIdentities = new Set<string>();
  const verses: SavedVerse[] = [];

  entries.forEach(([storageKey, verse]) => {
    const identity = savedVerseIdentity(verse);
    if (identity && seenIdentities.has(identity)) {
      duplicateStorageKeys.push(storageKey);
      return;
    }

    if (identity) seenIdentities.add(identity);
    verses.push({ ...verse, id: storageKey });
  });

  return { duplicateStorageKeys, verses };
}
