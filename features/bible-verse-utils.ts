import type { BibleVerse } from "@/state/types";

export function normalizeBibleVerses(verse?: BibleVerse, verses?: BibleVerse[]) {
  if (verses?.length) return verses.slice(0, 5);
  return verse ? [verse] : [];
}

export function primaryBibleVerse(verses: BibleVerse[]) {
  return verses[0];
}

export function bibleVerseIdentity(verse: Pick<BibleVerse, "reference" | "translation">) {
  return `${verse.reference}|${verse.translation ?? ""}`;
}
