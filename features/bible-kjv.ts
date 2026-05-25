import kjvVerseMap from "@/assets/bible/kjv-verses-1769.json";
import reformationsbibelnVerseMap from "@/assets/bible/reformationsbibeln.json";
import sv1917VerseMap from "@/assets/bible/sv1917-verses.json";
import crossReferenceMap from "@/assets/bible/cross-references/cross_references.json";
import type { BibleVerse } from "@/state/types";

type VerseMap = Record<string, string>;
type BookNameMap = Record<string, string>;
type CrossReferenceMap = {
  references: Record<string, Array<{ verse: string; votes: number }>>;
};

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

export type BibleCrossReference = {
  endPosition?: BiblePosition;
  reference: string;
  source: string;
  startPosition: BiblePosition;
  text: string;
  votes: number;
};

const versesByReference = kjvVerseMap as VerseMap;
const crossReferencesBySource = (crossReferenceMap as CrossReferenceMap).references;
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
const osisBookByName: Record<string, string> = {
  Genesis: "Gen",
  Exodus: "Exod",
  Leviticus: "Lev",
  Numbers: "Num",
  Deuteronomy: "Deut",
  Joshua: "Josh",
  Judges: "Judg",
  Ruth: "Ruth",
  "1 Samuel": "1Sam",
  "2 Samuel": "2Sam",
  "1 Kings": "1Kgs",
  "2 Kings": "2Kgs",
  "1 Chronicles": "1Chr",
  "2 Chronicles": "2Chr",
  Ezra: "Ezra",
  Nehemiah: "Neh",
  Esther: "Esth",
  Job: "Job",
  Psalms: "Ps",
  Proverbs: "Prov",
  Ecclesiastes: "Eccl",
  "Solomon's Song": "Song",
  "Song of Solomon": "Song",
  Isaiah: "Isa",
  Jeremiah: "Jer",
  Lamentations: "Lam",
  Ezekiel: "Ezek",
  Daniel: "Dan",
  Hosea: "Hos",
  Joel: "Joel",
  Amos: "Amos",
  Obadiah: "Obad",
  Jonah: "Jonah",
  Micah: "Mic",
  Nahum: "Nah",
  Habakkuk: "Hab",
  Zephaniah: "Zeph",
  Haggai: "Hag",
  Zechariah: "Zech",
  Malachi: "Mal",
  Matthew: "Matt",
  Mark: "Mark",
  Luke: "Luke",
  John: "John",
  Acts: "Acts",
  Romans: "Rom",
  "1 Corinthians": "1Cor",
  "2 Corinthians": "2Cor",
  Galatians: "Gal",
  Ephesians: "Eph",
  Philippians: "Phil",
  Colossians: "Col",
  "1 Thessalonians": "1Thess",
  "2 Thessalonians": "2Thess",
  "1 Timothy": "1Tim",
  "2 Timothy": "2Tim",
  Titus: "Titus",
  Philemon: "Phlm",
  Hebrews: "Heb",
  James: "Jas",
  "1 Peter": "1Pet",
  "2 Peter": "2Pet",
  "1 John": "1John",
  "2 John": "2John",
  "3 John": "3John",
  Jude: "Jude",
  Revelation: "Rev",
};
const bookNameByOsis = Object.fromEntries(Object.entries(osisBookByName).map(([name, osis]) => [osis, name])) as Record<string, string>;
const sv1917BookNameMap: BookNameMap = {
  "Andra Konungaboken": "2 Kings",
  "Andra Krönikeboken": "2 Chronicles",
  "Andra Samuelsboken": "2 Samuel",
  Apostlagärningarna: "Acts",
  "Brevet till hebréerna": "Hebrews",
  Deuteronomium: "Deuteronomy",
  Domarboken: "Judges",
  "Evangelium enligt Johannes": "John",
  "Evangelium enligt Lukas": "Luke",
  "Evangelium enligt Markus": "Mark",
  "Evangelium enligt Matteus": "Matthew",
  Esra: "Ezra",
  Ester: "Esther",
  "Första Konungaboken": "1 Kings",
  "Första Krönikeboken": "1 Chronicles",
  "Första Samuelsboken": "1 Samuel",
  Habackuk: "Habakkuk",
  Hesekiel: "Ezekiel",
  Hosea: "Hosea",
  "Höga Visan": "Solomon's Song",
  "Jakobs' brev": "James",
  Jeremia: "Jeremiah",
  Jesaja: "Isaiah",
  Jona: "Jonah",
  Josua: "Joshua",
  Klagovisorna: "Lamentations",
  Malaki: "Malachi",
  Mika: "Micah",
  Nehemja: "Nehemiah",
  Numeri: "Numbers",
  "Ordspråksboken": "Proverbs",
  "Paulus' andra brev till korintierna": "2 Corinthians",
  "Paulus' andra brev till tessalonikerna": "2 Thessalonians",
  "Paulus' andra brev till Timoteus": "2 Timothy",
  "Paulus' brev till efesierna": "Ephesians",
  "Paulus' brev till Filemon": "Philemon",
  "Paulus' brev till filipperna": "Philippians",
  "Paulus' brev till galaterna": "Galatians",
  "Paulus' brev till kolosserna": "Colossians",
  "Paulus' brev till romarna": "Romans",
  "Paulus' brev till Titus": "Titus",
  "Paulus' första brev till korintierna": "1 Corinthians",
  "Paulus' första brev till tessalonikerna": "1 Thessalonians",
  "Paulus' första brev till Timoteus": "1 Timothy",
  "Petrus' andra brev": "2 Peter",
  "Petrus' första brev": "1 Peter",
  Predikaren: "Ecclesiastes",
  Psaltaren: "Psalms",
  Rut: "Ruth",
  Sakarja: "Zechariah",
  Sefanja: "Zephaniah",
  "Johannes' andra brev": "2 John",
  "Johannes' första brev": "1 John",
  "Johannes' tredje brev": "3 John",
  "Johannes' uppenbarelse": "Revelation",
  "Judas' brev": "Jude",
};

function normalizeVerseMapBookNames(verseMap: VerseMap, bookNameMap: BookNameMap): VerseMap {
  return Object.fromEntries(
    Object.entries(verseMap).map(([reference, text]) => {
      const match = reference.match(/^(.+) (\d+:\d+)$/);
      if (!match) return [reference, text];
      return [`${bookNameMap[match[1]] ?? match[1]} ${match[2]}`, text];
    }),
  );
}

export const bibleVersions = [
  { id: "kjv", label: "KJV", translation: "KJV", verses: versesByReference },
  { id: "sv1917", label: "Bibel 1917", translation: "Bibel 1917", verses: normalizeVerseMapBookNames(sv1917VerseMap as VerseMap, sv1917BookNameMap) },
  { id: "reformationsbibeln2026", label: "Reformationsbibeln 2026", translation: "Reformationsbibeln 2026", verses: reformationsbibelnVerseMap as VerseMap },
] as const;

export type BibleVersionId = (typeof bibleVersions)[number]["id"];

const defaultBibleVersionId: BibleVersionId = "kjv";

export function isBibleVersionId(value: unknown): value is BibleVersionId {
  return typeof value === "string" && bibleVersions.some((version) => version.id === value);
}

export function bibleVersionFor(versionId?: BibleVersionId) {
  return bibleVersions.find((version) => version.id === versionId) ?? bibleVersions.find((version) => version.id === defaultBibleVersionId) ?? bibleVersions[0];
}

function cleanVerseText(value: string) {
  return value.replace(/#/g, "").replace(/\s+/g, " ").trim();
}

function versesForVersion(versionId?: BibleVersionId) {
  return bibleVersionFor(versionId).verses;
}

function bookAliasKey(value: string) {
  return value
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const bibleBookAliases = new Map<string, string>([
  ...kjvBooks.map((book) => [bookAliasKey(book.name), book.name] as const),
  ["psalm", "Psalms"],
  ["psalms", "Psalms"],
  ["songofsolomon", "Solomon's Song"],
  ["songofsongs", "Solomon's Song"],
  ["solomonssong", "Solomon's Song"],
  ["canticles", "Solomon's Song"],
]);

function normalizeBibleReferenceBook(book: string) {
  return bibleBookAliases.get(bookAliasKey(book)) ?? book.trim();
}

export function normalizeBibleReference(reference: string) {
  const cleanedReference = reference.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const match = cleanedReference.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return cleanedReference;

  const book = normalizeBibleReferenceBook(match[1]);
  return `${book} ${Number(match[2])}:${Number(match[3])}${match[4] ? `-${Number(match[4])}` : ""}`;
}

function crossReferenceKey(position: BiblePosition) {
  const book = osisBookByName[position.book];
  return book ? `${book}.${position.chapter}.${position.verse}` : undefined;
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

function parseCrossReferenceVerse(value: string) {
  const match = value.match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:-([1-3]?[A-Za-z]+)\.(\d+)\.(\d+))?$/);
  if (!match) return undefined;

  const startBook = bookNameByOsis[match[1]];
  const endBook = match[4] ? bookNameByOsis[match[4]] : startBook;
  if (!startBook || !endBook) return undefined;

  const startPosition = normalizeBiblePosition({
    book: startBook,
    chapter: Number(match[2]),
    verse: Number(match[3]),
  });
  const endPosition = match[4]
    ? normalizeBiblePosition({
        book: endBook,
        chapter: Number(match[5]),
        verse: Number(match[6]),
      })
    : undefined;

  return { endPosition, startPosition };
}

function crossReferenceText(start: BiblePosition, end?: BiblePosition, versionId?: BibleVersionId) {
  const verseMap = versesForVersion(versionId);
  if (!end || start.book !== end.book || start.chapter !== end.chapter) {
    return cleanVerseText(verseMap[`${start.book} ${start.chapter}:${start.verse}`] ?? "");
  }

  const parts: string[] = [];
  for (let verse = start.verse; verse <= end.verse; verse += 1) {
    const text = verseMap[`${start.book} ${start.chapter}:${verse}`];
    if (!text) return "";
    parts.push(cleanVerseText(text));
  }
  return parts.join(" ");
}

export function versesForChapter(book: string, chapter: number) {
  return parsedReferences
    .filter((item) => item.book === book && item.chapter === chapter)
    .map((item) => item.verse)
    .sort((a, b) => a - b);
}

export function bibleChapterVerses(book: string, chapter: number, versionId?: BibleVersionId): BibleChapterVerse[] {
  const verseMap = versesForVersion(versionId);
  return parsedReferences
    .filter((item) => item.book === book && item.chapter === chapter)
    .sort((a, b) => a.verse - b.verse)
    .map((item) => ({
      reference: item.reference,
      text: cleanVerseText(verseMap[item.reference] ?? ""),
      verse: item.verse,
    }))
    .filter((item) => item.text.length > 0);
}

export function hasBibleCrossReferences(position: BiblePosition) {
  const key = crossReferenceKey(position);
  return Boolean(key && crossReferencesBySource[key]?.length);
}

export function bibleCrossReferences(position: BiblePosition, versionId?: BibleVersionId): BibleCrossReference[] {
  const key = crossReferenceKey(position);
  if (!key) return [];

  return (crossReferencesBySource[key] ?? [])
    .map((item): BibleCrossReference | undefined => {
      const parsed = parseCrossReferenceVerse(item.verse);
      if (!parsed) return undefined;

      const text = crossReferenceText(parsed.startPosition, parsed.endPosition, versionId);
      if (!text) return undefined;

      return {
        endPosition: parsed.endPosition,
        reference: readableReference(parsed.startPosition, parsed.endPosition),
        source: item.verse,
        startPosition: parsed.startPosition,
        text,
        votes: item.votes,
      };
    })
    .filter((item): item is BibleCrossReference => Boolean(item))
    .sort((a, b) => b.votes - a.votes);
}

export function normalizeBiblePosition(position?: Partial<BiblePosition> | null): BiblePosition {
  const normalizedBookName = typeof position?.book === "string" ? normalizeBibleReferenceBook(position.book) : undefined;
  const book = kjvBooks.find((item) => item.name === normalizedBookName) ?? defaultBook;
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

export function buildBibleVerse(book: string, chapter: number, startVerse: number, endVerse = startVerse, versionId?: BibleVersionId): BibleVerse | undefined {
  const normalizedBook = normalizeBibleReferenceBook(book);
  const firstVerse = Math.min(startVerse, endVerse);
  const lastVerse = Math.max(startVerse, endVerse);
  const version = bibleVersionFor(versionId);
  const verseMap = versesForVersion(version.id);
  const parts: string[] = [];

  for (let verse = firstVerse; verse <= lastVerse; verse += 1) {
    const text = verseMap[`${normalizedBook} ${chapter}:${verse}`];
    if (!text) return undefined;
    parts.push(cleanVerseText(text));
  }

  return {
    reference: `${normalizedBook} ${chapter}:${firstVerse}${lastVerse > firstVerse ? `-${lastVerse}` : ""}`,
    text: parts.join(" "),
    translation: version.translation,
  };
}

export function bibleVerseFromReference(reference: string, versionId?: BibleVersionId): BibleVerse | undefined {
  const match = normalizeBibleReference(reference).match(/^(.+) (\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return undefined;

  return buildBibleVerse(match[1], Number(match[2]), Number(match[3]), match[4] ? Number(match[4]) : Number(match[3]), versionId);
}

export function bibleVerseForVersion(verse: BibleVerse, versionId?: BibleVersionId): BibleVerse {
  return bibleVerseFromReference(verse.reference, versionId) ?? verse;
}

export function buildKjvVerse(book: string, chapter: number, startVerse: number, endVerse = startVerse): BibleVerse | undefined {
  return buildBibleVerse(book, chapter, startVerse, endVerse, "kjv");
}
