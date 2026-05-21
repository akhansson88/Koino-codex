import kjvVerseMap from "@/assets/bible/kjv-verses-1769.json";
import type { BibleVerse } from "@/state/types";

type VerseMap = Record<string, string>;

export type BibleBook = {
  name: string;
  chapters: number[];
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

function cleanVerseText(value: string) {
  return value.replace(/#/g, "").replace(/\s+/g, " ").trim();
}

export function versesForChapter(book: string, chapter: number) {
  return parsedReferences
    .filter((item) => item.book === book && item.chapter === chapter)
    .map((item) => item.verse)
    .sort((a, b) => a - b);
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
