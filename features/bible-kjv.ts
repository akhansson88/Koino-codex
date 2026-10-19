import {
  kjvBooks,
  nextBibleChapter,
  normalizeBibleBookName,
  normalizeBiblePosition,
  previousBibleChapter,
  versesForChapter,
  type BibleBook,
  type BiblePosition,
} from "@/features/bible-canon";
import {
  queryBibleChapter,
  queryBibleChapterAsync,
  queryBibleCrossReferences,
  queryBibleText,
  queryBibleVerseRangesAsync,
  type BibleDatabaseVerseRange,
  type BibleDatabaseVerseRow,
} from "@/features/bible-database";
import { bibleVersionFor, bibleVersions, isBibleVersionId, type BibleVersionId } from "@/features/bible-versions";
import type { BibleVerse } from "@/state/types";

export { kjvBooks, nextBibleChapter, normalizeBiblePosition, previousBibleChapter, versesForChapter };
export type { BibleBook, BiblePosition };
export { bibleVersionFor, bibleVersions, isBibleVersionId };
export type { BibleVersionId };

export type BibleChapterVerse = {
  footnotes: BibleFootnote[];
  reference: string;
  text: string;
  verse: number;
};

export type BibleFootnote = {
  marker: string;
  text: string;
};

export type BibleChapterSubtitle = {
  beforeVerse: number;
  text: string;
};

export type BibleChapter = {
  heading?: string;
  subtitles: BibleChapterSubtitle[];
  verses: BibleChapterVerse[];
};

export type BibleCrossReference = {
  endPosition?: BiblePosition;
  reference: string;
  source: string;
  startPosition: BiblePosition;
  text: string;
  votes: number;
};

export type BibleTextSearchResult = {
  position: BiblePosition;
  reference: string;
  text: string;
};

export function normalizeBibleReference(reference: string) {
  const cleanedReference = reference.replace(/[\u2013\u2014–—]/g, "-").replace(/\s+/g, " ").trim();
  const match = cleanedReference.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return cleanedReference;

  const book = normalizeBibleBookName(match[1]);
  return `${book} ${Number(match[2])}:${Number(match[3])}${match[4] ? `-${Number(match[4])}` : ""}`;
}

function readableReference(start: BiblePosition, end?: BiblePosition) {
  if (!end || (start.book === end.book && start.chapter === end.chapter && start.verse === end.verse)) {
    return `${start.book} ${start.chapter}:${start.verse}`;
  }
  if (start.book === end.book && start.chapter === end.chapter) {
    return `${start.book} ${start.chapter}:${start.verse}-${end.verse}`;
  }
  if (start.book === end.book) {
    return `${start.book} ${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`;
  }
  return `${start.book} ${start.chapter}:${start.verse}-${end.book} ${end.chapter}:${end.verse}`;
}

export async function searchBibleText(query: string, versionId: BibleVersionId, limit = 20): Promise<BibleTextSearchResult[]> {
  if (!query.trim() || !Number.isFinite(limit) || limit <= 0) return [];
  const rows = await queryBibleText(bibleVersionFor(versionId).id, query, Math.floor(limit));
  return rows.map((row) => ({
    position: { book: row.book, chapter: row.chapter, verse: row.verse },
    reference: `${row.book} ${row.chapter}:${row.verse}`,
    text: row.text,
  }));
}

export function bibleChapter(book: string, chapter: number, versionId?: BibleVersionId): BibleChapter {
  const normalizedBook = normalizeBibleBookName(book);
  const result = queryBibleChapter(bibleVersionFor(versionId).id, normalizedBook, chapter);
  return bibleChapterFromRows(result);
}

export async function bibleChapterAsync(book: string, chapter: number, versionId?: BibleVersionId): Promise<BibleChapter> {
  const normalizedBook = normalizeBibleBookName(book);
  return bibleChapterFromRows(await queryBibleChapterAsync(bibleVersionFor(versionId).id, normalizedBook, chapter));
}

function bibleChapterFromRows(result: ReturnType<typeof queryBibleChapter>): BibleChapter {
  return {
    heading: result.heading ?? undefined,
    subtitles: result.subtitles,
    verses: result.verses.map((row) => ({
      footnotes: row.footnotes,
      reference: `${row.book} ${row.chapter}:${row.verse}`,
      text: row.text,
      verse: row.verse,
    })),
  };
}

export function bibleChapterVerses(book: string, chapter: number, versionId?: BibleVersionId): BibleChapterVerse[] {
  return bibleChapter(book, chapter, versionId).verses;
}

export function bibleCrossReferences(position: BiblePosition, versionId?: BibleVersionId): BibleCrossReference[] {
  return queryBibleCrossReferences(position.book, position.chapter, position.verse)
    .map((row): BibleCrossReference | undefined => {
      const startPosition = normalizeBiblePosition({
        book: row.target_book,
        chapter: row.target_chapter,
        verse: row.target_verse,
      });
      const endPosition = row.target_end_book && row.target_end_chapter && row.target_end_verse
        ? normalizeBiblePosition({
            book: row.target_end_book,
            chapter: row.target_end_chapter,
            verse: row.target_end_verse,
          })
        : undefined;
      const textEndVerse = endPosition?.book === startPosition.book && endPosition.chapter === startPosition.chapter
        ? endPosition.verse
        : startPosition.verse;
      const text = buildBibleVerse(
        startPosition.book,
        startPosition.chapter,
        startPosition.verse,
        textEndVerse,
        versionId,
      )?.text;
      if (!text) return undefined;

      return {
        endPosition,
        reference: readableReference(startPosition, endPosition),
        source: `${row.target_osis}.${row.target_chapter}.${row.target_verse}${
          row.target_end_osis && row.target_end_chapter && row.target_end_verse
            ? `-${row.target_end_osis}.${row.target_end_chapter}.${row.target_end_verse}`
            : ""
        }`,
        startPosition,
        text,
        votes: row.votes,
      };
    })
    .filter((item): item is BibleCrossReference => Boolean(item));
}

export function buildBibleVerse(book: string, chapter: number, startVerse: number, endVerse = startVerse, versionId?: BibleVersionId): BibleVerse | undefined {
  const normalizedBook = normalizeBibleBookName(book);
  const firstVerse = Math.min(startVerse, endVerse);
  const lastVerse = Math.max(startVerse, endVerse);
  const version = bibleVersionFor(versionId);
  const chapterRows = queryBibleChapter(version.id, normalizedBook, chapter).verses;
  return bibleVerseFromRows(normalizedBook, chapter, firstVerse, lastVerse, chapterRows, version);
}

function bibleVerseFromRows(book: string, chapter: number, firstVerse: number, lastVerse: number, rows: readonly BibleDatabaseVerseRow[], version: ReturnType<typeof bibleVersionFor>): BibleVerse | undefined {
  const selectedRows = rows.filter((row) => row.verse >= firstVerse && row.verse <= lastVerse);
  if (selectedRows.length !== lastVerse - firstVerse + 1) return undefined;

  return {
    book,
    chapter,
    endVerse: lastVerse,
    reference: `${book} ${chapter}:${firstVerse}${lastVerse > firstVerse ? `-${lastVerse}` : ""}`,
    referenceText: `${book} ${chapter}:${firstVerse}${lastVerse > firstVerse ? `-${lastVerse}` : ""}`,
    startVerse: firstVerse,
    text: selectedRows.map((row) => row.text).join(" "),
    translation: version.translation,
  };
}

export async function bibleVersesFromRanges(ranges: readonly BibleDatabaseVerseRange[], versionId?: BibleVersionId): Promise<(BibleVerse | undefined)[]> {
  const version = bibleVersionFor(versionId);
  const normalized = ranges.map((range) => ({ ...range, book: normalizeBibleBookName(range.book), startVerse: Math.min(range.startVerse, range.endVerse), endVerse: Math.max(range.startVerse, range.endVerse) }));
  const rows = await queryBibleVerseRangesAsync(version.id, normalized);
  return normalized.map((range, index) => bibleVerseFromRows(range.book, range.chapter, range.startVerse, range.endVerse, rows[index], version));
}

export function bibleVerseFromReference(reference: string, versionId?: BibleVersionId): BibleVerse | undefined {
  const match = normalizeBibleReference(reference).match(/^(.+) (\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return undefined;

  return buildBibleVerse(match[1], Number(match[2]), Number(match[3]), match[4] ? Number(match[4]) : Number(match[3]), versionId);
}

export function bibleVerseForVersion(verse: BibleVerse, versionId?: BibleVersionId): BibleVerse {
  const resolved = bibleVerseFromReference(verse.reference, versionId);
  return resolved ? { ...verse, ...resolved, id: verse.id } : verse;
}

export function buildKjvVerse(book: string, chapter: number, startVerse: number, endVerse = startVerse): BibleVerse | undefined {
  return buildBibleVerse(book, chapter, startVerse, endVerse, "kjv");
}
