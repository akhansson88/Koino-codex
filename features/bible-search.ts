import {
  bibleChapterVerses,
  bibleVerseFromReference,
  buildBibleVerse,
  kjvBooks,
  searchBibleText,
  type BiblePosition,
  type BibleVersionId,
} from "@/features/bible-kjv";
import type { BibleVerse } from "@/state/types";
import type { AppLanguage } from "@/ui/localization";

export type ScriptureSearchResult = {
  matchType: "reference" | "text";
  verse: BibleVerse;
};

export type SearchScriptureOptions = {
  language: AppLanguage;
  limit?: number;
  query: string;
  versionId: BibleVersionId;
};

const swedishBibleBookNames: Readonly<Record<string, string>> = {
  Genesis: "Första Moseboken",
  Exodus: "Andra Moseboken",
  Leviticus: "Tredje Moseboken",
  Numbers: "Fjärde Moseboken",
  Deuteronomy: "Femte Moseboken",
  Joshua: "Josua",
  Judges: "Domarboken",
  Ruth: "Rut",
  "1 Samuel": "Första Samuelsboken",
  "2 Samuel": "Andra Samuelsboken",
  "1 Kings": "Första Kungaboken",
  "2 Kings": "Andra Kungaboken",
  "1 Chronicles": "Första Krönikeboken",
  "2 Chronicles": "Andra Krönikeboken",
  Ezra: "Esra",
  Nehemiah: "Nehemja",
  Esther: "Ester",
  Job: "Job",
  Psalms: "Psaltaren",
  Proverbs: "Ordspråksboken",
  Ecclesiastes: "Predikaren",
  "Solomon's Song": "Höga Visan",
  Isaiah: "Jesaja",
  Jeremiah: "Jeremia",
  Lamentations: "Klagovisorna",
  Ezekiel: "Hesekiel",
  Daniel: "Daniel",
  Hosea: "Hosea",
  Joel: "Joel",
  Amos: "Amos",
  Obadiah: "Obadja",
  Jonah: "Jona",
  Micah: "Mika",
  Nahum: "Nahum",
  Habakkuk: "Habackuk",
  Zephaniah: "Sefanja",
  Haggai: "Haggai",
  Zechariah: "Sakarja",
  Malachi: "Malaki",
  Matthew: "Matteusevangeliet",
  Mark: "Markusevangeliet",
  Luke: "Lukasevangeliet",
  John: "Johannesevangeliet",
  Acts: "Apostlagärningarna",
  Romans: "Romarbrevet",
  "1 Corinthians": "Första Korinthierbrevet",
  "2 Corinthians": "Andra Korinthierbrevet",
  Galatians: "Galaterbrevet",
  Ephesians: "Efesierbrevet",
  Philippians: "Filipperbrevet",
  Colossians: "Kolosserbrevet",
  "1 Thessalonians": "Första Thessalonikerbrevet",
  "2 Thessalonians": "Andra Thessalonikerbrevet",
  "1 Timothy": "Första Timotheosbrevet",
  "2 Timothy": "Andra Timotheosbrevet",
  Titus: "Titusbrevet",
  Philemon: "Filemonbrevet",
  Hebrews: "Hebreerbrevet",
  James: "Jakobsbrevet",
  "1 Peter": "Första Petrusbrevet",
  "2 Peter": "Andra Petrusbrevet",
  "1 John": "Första Johannesbrevet",
  "2 John": "Andra Johannesbrevet",
  "3 John": "Tredje Johannesbrevet",
  Jude: "Judasbrevet",
  Revelation: "Uppenbarelseboken",
};

const englishBookAliases: ReadonlyArray<readonly [string, string]> = [
  ["Gen", "Genesis"],
  ["Exod", "Exodus"],
  ["Ex", "Exodus"],
  ["Ps", "Psalms"],
  ["Psa", "Psalms"],
  ["Psalm", "Psalms"],
  ["Prov", "Proverbs"],
  ["Matt", "Matthew"],
  ["Mt", "Matthew"],
  ["Mk", "Mark"],
  ["Lk", "Luke"],
  ["Jn", "John"],
  ["Rom", "Romans"],
  ["1 Cor", "1 Corinthians"],
  ["2 Cor", "2 Corinthians"],
  ["Gal", "Galatians"],
  ["Eph", "Ephesians"],
  ["Phil", "Philippians"],
  ["Col", "Colossians"],
  ["1 Thess", "1 Thessalonians"],
  ["2 Thess", "2 Thessalonians"],
  ["1 Tim", "1 Timothy"],
  ["2 Tim", "2 Timothy"],
  ["Phlm", "Philemon"],
  ["Heb", "Hebrews"],
  ["Jas", "James"],
  ["1 Pet", "1 Peter"],
  ["2 Pet", "2 Peter"],
  ["Rev", "Revelation"],
];

const swedishBookAliases: ReadonlyArray<readonly [string, string]> = [
  ["1 Mos", "Genesis"],
  ["2 Mos", "Exodus"],
  ["3 Mos", "Leviticus"],
  ["4 Mos", "Numbers"],
  ["5 Mos", "Deuteronomy"],
  ["Ps", "Psalms"],
  ["Ords", "Proverbs"],
  ["Matt", "Matthew"],
  ["Mark", "Mark"],
  ["Luk", "Luke"],
  ["Joh", "John"],
  ["Johannes", "John"],
  ["Apg", "Acts"],
  ["Rom", "Romans"],
  ["1 Kor", "1 Corinthians"],
  ["2 Kor", "2 Corinthians"],
  ["Gal", "Galatians"],
  ["Ef", "Ephesians"],
  ["Fil", "Philippians"],
  ["Kol", "Colossians"],
  ["1 Thess", "1 Thessalonians"],
  ["2 Thess", "2 Thessalonians"],
  ["1 Tim", "1 Timothy"],
  ["2 Tim", "2 Timothy"],
  ["Tit", "Titus"],
  ["Filem", "Philemon"],
  ["Heb", "Hebrews"],
  ["Jak", "James"],
  ["1 Pet", "1 Peter"],
  ["2 Pet", "2 Peter"],
  ["1 Joh", "1 John"],
  ["2 Joh", "2 John"],
  ["3 Joh", "3 John"],
  ["Jud", "Jude"],
  ["Upp", "Revelation"],
];

function bookAliasKey(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[’`]/g, "'")
    .toLocaleLowerCase("sv")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function makeBookAliasMap(language: AppLanguage) {
  const entries: Array<readonly [string, string]> = kjvBooks.map((book) => [book.name, book.name] as const);
  entries.push(["Psalms", "Psalms"], ["Song of Solomon", "Solomon's Song"], ["Song of Songs", "Solomon's Song"], ["Canticles", "Solomon's Song"]);
  entries.push(...englishBookAliases);
  if (language === "sv") {
    entries.push(...Object.entries(swedishBibleBookNames).map(([canonicalName, localizedName]) => [localizedName, canonicalName] as const));
    entries.push(...swedishBookAliases);
  }
  return new Map(entries.map(([alias, canonicalName]) => [bookAliasKey(alias), canonicalName]));
}

const englishAliasMap = makeBookAliasMap("en");
const swedishAliasMap = makeBookAliasMap("sv");

function canonicalBibleBookName(value: string, language: AppLanguage) {
  const aliases = language === "sv" ? swedishAliasMap : englishAliasMap;
  return aliases.get(bookAliasKey(value));
}

export function normalizeScriptureQuery(query: string) {
  return query
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalReferenceFromQuery(query: string, language: AppLanguage) {
  const normalizedQuery = normalizeScriptureQuery(query);
  const match = normalizedQuery.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return undefined;

  const book = canonicalBibleBookName(match[1], language);
  const chapter = Number(match[2]);
  const startVerse = Number(match[3]);
  const endVerse = match[4] ? Number(match[4]) : startVerse;
  if (!book || chapter < 1 || startVerse < 1 || endVerse < startVerse) return undefined;

  return `${book} ${chapter}:${startVerse}${endVerse > startVerse ? `-${endVerse}` : ""}`;
}

export function resolveBibleReference(query: string, language: AppLanguage, versionId: BibleVersionId) {
  const canonicalReference = canonicalReferenceFromQuery(query, language);
  return canonicalReference ? bibleVerseFromReference(canonicalReference, versionId) : undefined;
}

export function biblePositionFromSearchQuery(query: string, language: AppLanguage, versionId: BibleVersionId): BiblePosition | undefined {
  const verse = resolveBibleReference(query, language, versionId);
  if (verse?.book && verse.chapter && verse.startVerse) {
    return { book: verse.book, chapter: verse.chapter, verse: verse.startVerse };
  }

  const chapterMatch = normalizeScriptureQuery(query).match(/^(.+?)\s+(\d+)$/);
  if (!chapterMatch) return undefined;
  const bookName = canonicalBibleBookName(chapterMatch[1], language);
  const chapter = Number(chapterMatch[2]);
  const book = kjvBooks.find((item) => item.name === bookName);
  if (!book || !book.chapters.includes(chapter)) return undefined;

  const firstVerse = bibleChapterVerses(book.name, chapter, versionId)[0]?.verse;
  return firstVerse ? { book: book.name, chapter, verse: firstVerse } : undefined;
}

export async function searchScripture({ language, limit = 20, query, versionId }: SearchScriptureOptions): Promise<ScriptureSearchResult[]> {
  const normalizedQuery = normalizeScriptureQuery(query);
  if (!normalizedQuery || !Number.isFinite(limit) || limit <= 0) return [];

  const referenceVerse = resolveBibleReference(normalizedQuery, language, versionId);
  if (referenceVerse) return [{ matchType: "reference", verse: referenceVerse }];

  const textResults = await searchBibleText(normalizedQuery, versionId, Math.floor(limit));
  return textResults
    .map((result) => buildBibleVerse(result.position.book, result.position.chapter, result.position.verse, result.position.verse, versionId))
    .filter((verse): verse is BibleVerse => Boolean(verse))
    .map((verse) => ({ matchType: "text", verse }));
}

export function displayBibleBookName(bookName: string, language: AppLanguage) {
  return language === "sv" ? swedishBibleBookNames[bookName] ?? bookName : bookName;
}

export function displayBibleReference(reference: string, language: AppLanguage) {
  if (language !== "sv") return reference;
  const canonicalBook = Object.keys(swedishBibleBookNames)
    .sort((first, second) => second.length - first.length)
    .find((bookName) => reference === bookName || reference.startsWith(`${bookName} `));
  return canonicalBook
    ? `${displayBibleBookName(canonicalBook, language)}${reference.slice(canonicalBook.length)}`
    : reference;
}
