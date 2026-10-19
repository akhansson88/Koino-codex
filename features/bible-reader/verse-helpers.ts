import {
  bibleVerseFromReference,
  kjvBooks,
  normalizeBiblePosition,
  type BiblePosition,
  type BibleVersionId,
} from "@/features/bible-kjv";
import { displayBibleBookName } from "@/features/bible-search";
import type { BibleHighlight, BibleHighlightColor, BibleVerse } from "@/state/types";
import type { AppLanguage, TranslationFunction } from "@/ui/localization";
import { type SelectedVerseRange, type TestamentFilter } from "@/features/bible-reader/types";

const oldTestamentBookCount = 39;

export function selectedVerseRangesFor(verses: number[]): SelectedVerseRange[] {
  const sortedVerses = Array.from(new Set(verses)).sort((a, b) => a - b);
  const ranges: SelectedVerseRange[] = [];

  sortedVerses.forEach((verse) => {
    const previousRange = ranges[ranges.length - 1];
    if (previousRange && verse === previousRange.end + 1) {
      previousRange.end = verse;
      return;
    }

    ranges.push({ end: verse, start: verse });
  });

  return ranges;
}

export function selectedVerseReferenceLabel(position: Pick<BiblePosition, "book" | "chapter">, ranges: SelectedVerseRange[]) {
  if (ranges.length === 0) return "";

  const rangeLabels = ranges.map((range) => (range.start === range.end ? String(range.start) : `${range.start}-${range.end}`));
  return `${position.book} ${position.chapter}:${rangeLabels.join(", ")}`;
}

export function verseRangesOverlap(first: SelectedVerseRange, second: SelectedVerseRange) {
  return first.start <= second.end && second.start <= first.end;
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return withHash.toUpperCase();
}

export function isHexColor(value: string) {
  return /^#[0-9A-F]{6}$/.test(normalizeHexColor(value));
}

export function highlightColorWithOpacity(value: BibleHighlightColor, opacity: number) {
  const normalized = normalizeHexColor(value);
  if (!isHexColor(normalized)) return value;

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

export function highlightTime(highlight: BibleHighlight) {
  const parsed = Date.parse(highlight.updatedAt || highlight.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function referenceLabel(position: BiblePosition, language: AppLanguage = "en") {
  return `${displayBibleBookName(position.book, language)} ${position.chapter}:${position.verse}`;
}

export function chapterLabel(position: BiblePosition, language: AppLanguage = "en") {
  return `${displayBibleBookName(position.book, language)} ${position.chapter}`;
}

export function biblePositionFromVerse(verse?: Pick<BibleVerse, "book" | "chapter" | "reference" | "startVerse">, versionId: BibleVersionId = "kjv") {
  if (!verse) return undefined;
  if (verse.book && typeof verse.chapter === "number" && typeof verse.startVerse === "number") {
    return normalizeBiblePosition({ book: verse.book, chapter: verse.chapter, verse: verse.startVerse }, versionId);
  }

  const resolvedVerse = bibleVerseFromReference(verse.reference, versionId);
  if (!resolvedVerse?.book || typeof resolvedVerse.chapter !== "number" || typeof resolvedVerse.startVerse !== "number") {
    return undefined;
  }

  return normalizeBiblePosition({ book: resolvedVerse.book, chapter: resolvedVerse.chapter, verse: resolvedVerse.startVerse }, versionId);
}

export function biblePositionFromReference(reference?: string, versionId: BibleVersionId = "kjv") {
  if (!reference) return undefined;
  return biblePositionFromVerse(bibleVerseFromReference(reference, versionId), versionId);
}

export function testamentForBook(bookName: string): TestamentFilter {
  const index = kjvBooks.findIndex((book) => book.name === bookName);
  if (index < 0) return "all";
  return index < oldTestamentBookCount ? "old" : "new";
}

export function bibleVersionShortLabel(versionId: BibleVersionId) {
  if (versionId === "reformationsbibeln2026") return "SRB26";
  return "KJV";
}

export function bibleVersionDescription(versionId: BibleVersionId, t: TranslationFunction) {
  if (versionId === "reformationsbibeln2026") return t("bible.version.description.reformationsbibeln2026");
  return t("bible.version.description.kjv");
}
