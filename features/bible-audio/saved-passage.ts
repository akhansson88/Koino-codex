import { kjvBooks, normalizeBibleBookName } from "@/features/bible-canon";
import { swedishBibleBookNames } from "@/features/bible-book-names";
import { bibleVersions } from "@/features/bible-versions";
import type { SavedVerse } from "@/state/types";
import { AUDIO_TRANSLATION } from "./catalog";
import type { AudioPassage } from "./engine";

export type SavedAudioPassage = AudioPassage & { book: string; chapter: number };

function normalizedLabel(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

export function hasSavedAudioTranslation(translation?: string) {
  if (typeof translation !== "string") return false;
  const label = normalizedLabel(translation);
  const version = bibleVersions.find((item) =>
    [item.id, item.label, item.translation].some((value) => normalizedLabel(value) === label),
  );
  return version?.id === AUDIO_TRANSLATION;
}

function canonicalBook(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeBibleBookName(value);
  const book = kjvBooks.find((item) => item.name === normalized);
  if (book) return book.name;
  return Object.entries(swedishBibleBookNames).find(([, name]) => normalizedLabel(name) === normalizedLabel(value))?.[0];
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Resolve saved metadata or a legacy contiguous reference without database reads or clamping. */
export function savedAudioPassage(verse: SavedVerse): SavedAudioPassage | undefined {
  if (!hasSavedAudioTranslation(verse.translation)) return undefined;
  const reference = typeof verse.reference === "string" ? verse.reference.trim() : "";
  const match = /^(.+?)\s+(\d+)\s*:\s*(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(reference);
  const parsed = match ? {
    book: canonicalBook(match[1]),
    chapter: Number(match[2]),
    startVerse: Number(match[3]),
    endVerse: Number(match[4] ?? match[3]),
  } : undefined;
  if (!parsed && reference) return undefined;

  const book = verse.book === undefined ? parsed?.book : canonicalBook(verse.book);
  const chapter = verse.chapter === undefined ? parsed?.chapter : verse.chapter;
  const startVerse = verse.startVerse === undefined ? parsed?.startVerse : verse.startVerse;
  const endVerse = verse.endVerse === undefined ? parsed?.endVerse ?? startVerse : verse.endVerse;
  if (!book || !positiveInteger(chapter) || !positiveInteger(startVerse) || !positiveInteger(endVerse) || endVerse < startVerse) return undefined;
  if (!kjvBooks.find((item) => item.name === book)?.chapters.includes(chapter)) return undefined;
  if (parsed && (parsed.book !== book || parsed.chapter !== chapter || parsed.startVerse !== startVerse || parsed.endVerse !== endVerse)) return undefined;
  // Translation verse counts can differ from KJV. The audio manifest validates the exact range.
  return { book, chapter, startVerse, endVerse, savedVerseId: verse.id };
}
