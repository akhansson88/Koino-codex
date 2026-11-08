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

const compactSwedishBookNames: Record<string, string> = {
  Genesis: "1 Mos", Exodus: "2 Mos", Leviticus: "3 Mos", Numbers: "4 Mos", Deuteronomy: "5 Mos",
  "1 Samuel": "1 Sam", "2 Samuel": "2 Sam", "1 Kings": "1 Kung", "2 Kings": "2 Kung",
  "1 Chronicles": "1 Krön", "2 Chronicles": "2 Krön", Proverbs: "Ords",
  Matthew: "Matt", Mark: "Mark", Luke: "Luk", John: "Joh", Acts: "Apg", Romans: "Rom",
  "1 Corinthians": "1 Kor", "2 Corinthians": "2 Kor", Galatians: "Gal", Ephesians: "Ef",
  Philippians: "Fil", Colossians: "Kol", "1 Thessalonians": "1 Thess", "2 Thessalonians": "2 Thess",
  "1 Timothy": "1 Tim", "2 Timothy": "2 Tim", Philemon: "Filem", Hebrews: "Heb", James: "Jak",
  "1 Peter": "1 Pet", "2 Peter": "2 Pet", "1 John": "1 Joh", "2 John": "2 Joh", "3 John": "3 Joh",
  Revelation: "Upp",
};

const compactEnglishBookNames: Record<string, string> = {
  Deuteronomy: "Deut", "1 Chronicles": "1 Chr", "2 Chronicles": "2 Chr",
  "Solomon's Song": "Song", Matthew: "Matt", "1 Corinthians": "1 Cor", "2 Corinthians": "2 Cor",
  Philippians: "Phil", "1 Thessalonians": "1 Thess", "2 Thessalonians": "2 Thess",
  "1 Timothy": "1 Tim", "2 Timothy": "2 Tim", Revelation: "Rev",
};

export function compactChapterLabel(position: BiblePosition, language: AppLanguage = "en") {
  const labels = language === "sv" ? compactSwedishBookNames : compactEnglishBookNames;
  return `${labels[position.book] ?? displayBibleBookName(position.book, language)} ${position.chapter}`;
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
