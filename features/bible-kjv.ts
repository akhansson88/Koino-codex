import kjvVerseMap from "@/assets/bible/kjv-verses-1769.json";
import type { BibleVerse } from "@/state/types";

type VerseMap = Record<string, string>;

export type BibleBook = {
  name: string;
  chapters: number[];
};

export type BiblePosition = {
  book: string;
  chapter: number;
  verse: number;
};

export type BibleChapterVerse = {
  reference: string;
  text: string;
  verse: number;
};

const versesByReference = kjvVerseMap as VerseMap;
const parsedReferences = Object.keys(versesByReference)
  .map((reference) => {
    const match = reference.match(/^(.+) (\d+):(\d+)$/);
    if (!match) return null;
    return {
      book: match[1],
      chapter: Number(match[2]),
      reference,
      verse: Number(match[3]),
    };
  })
  .filter((item): item is { book: string; chapter: number; reference: string; verse: number } => Boolean(item));

export const kjvBooks: BibleBook[] = Array.from(
  parsedReferences.reduce<Map<string, Set<number>>>((books, item) => {
    const chapters = books.get(item.book) ?? new Set<number>();
    chapters.add(item.chapter);
    books.set(item.book, chapters);
    return books;
  }, new Map()),
).map(([name, chapters]) => ({ name, chapters: Array.from(chapters).sort((a, b) => a - b) }));

const bookIndexByName = new Map(kjvBooks.map((book, index) => [book.name, index]));
const defaultBook = kjvBooks[0] ?? { name: "Genesis", chapters: [1] };

function cleanVerseText(value: string) {
  return value.replace(/#/g, "").replace(/\s+/g, " ").trim();
}

export function versesForChapter(book: string, chapter: number) {
  return parsedReferences
    .filter((item) => item.book === book && item.chapter === chapter)
    .map((item) => item.verse)
    .sort((a, b) => a - b);
}

export function bibleChapterVerses(book: string, chapter: number): BibleChapterVerse[] {
  return parsedReferences
    .filter((item) => item.book === book && item.chapter === chapter)
    .sort((a, b) => a.verse - b.verse)
    .map((item) => ({
      reference: item.reference,
      text: cleanVerseText(versesByReference[item.reference] ?? ""),
      verse: item.verse,
    }))
    .filter((item) => item.text.length > 0);
}

export function normalizeBiblePosition(position?: Partial<BiblePosition> | null): BiblePosition {
  const book = kjvBooks.find((item) => item.name === position?.book) ?? defaultBook;
  const chapter = book.chapters.includes(Number(position?.chapter)) ? Number(position?.chapter) : book.chapters[0] ?? 1;
  const verses = versesForChapter(book.name, chapter);
  const verse = verses.includes(Number(position?.verse)) ? Number(position?.verse) : verses[0] ?? 1;

  return {
    book: book.name,
    chapter,
    verse,
  };
}

export function previousBibleChapter(bookName: string, chapter: number): BiblePosition | undefined {
  const position = normalizeBiblePosition({ book: bookName, chapter, verse: 1 });
  const bookIndex = bookIndexByName.get(position.book);
  if (typeof bookIndex !== "number") return undefined;
  const book = kjvBooks[bookIndex];
  const chapterIndex = book.chapters.indexOf(position.chapter);

  if (chapterIndex > 0) {
    return { book: book.name, chapter: book.chapters[chapterIndex - 1], verse: 1 };
  }

  const previousBook = kjvBooks[bookIndex - 1];
  if (!previousBook) return undefined;

  return {
    book: previousBook.name,
    chapter: previousBook.chapters[previousBook.chapters.length - 1] ?? 1,
    verse: 1,
  };
}

export function nextBibleChapter(bookName: string, chapter: number): BiblePosition | undefined {
  const position = normalizeBiblePosition({ book: bookName, chapter, verse: 1 });
  const bookIndex = bookIndexByName.get(position.book);
  if (typeof bookIndex !== "number") return undefined;
  const book = kjvBooks[bookIndex];
  const chapterIndex = book.chapters.indexOf(position.chapter);

  if (chapterIndex >= 0 && chapterIndex < book.chapters.length - 1) {
    return { book: book.name, chapter: book.chapters[chapterIndex + 1], verse: 1 };
  }

  const nextBook = kjvBooks[bookIndex + 1];
  if (!nextBook) return undefined;

  return {
    book: nextBook.name,
    chapter: nextBook.chapters[0] ?? 1,
    verse: 1,
  };
}

export function buildKjvVerse(book: string, chapter: number, startVerse: number, endVerse = startVerse): BibleVerse | undefined {
  const firstVerse = Math.min(startVerse, endVerse);
  const lastVerse = Math.max(startVerse, endVerse);
  const parts: string[] = [];

  for (let verse = firstVerse; verse <= lastVerse; verse += 1) {
    const text = versesByReference[`${book} ${chapter}:${verse}`];
    if (!text) return undefined;
    parts.push(cleanVerseText(text));
  }

  return {
    reference: `${book} ${chapter}:${firstVerse}${lastVerse > firstVerse ? `-${lastVerse}` : ""}`,
    text: parts.join(" "),
    translation: "KJV",
  };
}
