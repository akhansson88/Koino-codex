import { bibleBookLanguage, swedishBibleBookNames } from "@/features/bible-book-names";
export { displayBibleBookName, displayBibleReference } from "@/features/bible-book-names";
import {
  bibleVersionFor,
  bibleVerseFromReference,
  biblePassagesFromRanges,
  bibleChapterVerses,
  buildBibleVerse,
  kjvBooks,
  searchBibleText,
  type BiblePosition,
  type BiblePassage,
  type BibleVersionId,
} from "@/features/bible-kjv";
import type { BibleVerse } from "@/state/types";
import type { AppLanguage } from "@/ui/localization";
import { collapseSearchRanges, type RankedDocument, type ScriptureSearchBackend, type SearchSource } from "./bible-search/retrieval";

export type ScriptureSearchResult = {
  id: string;
  matchType: "reference" | "text" | "semantic" | "topic";
  kind: "verse" | "passage";
  sources: SearchSource[];
  verse: BibleVerse;
  verses: BiblePassage["verses"];
};

export type ScriptureSearchResponse = {
  results: ScriptureSearchResult[];
  mode: "hybrid" | "lexical";
  semanticState: "loading" | "ready" | "unavailable";
};

export type SearchScriptureOptions = {
  language: AppLanguage;
  limit?: number;
  query: string;
  versionId: BibleVersionId;
  signal?: AbortSignal;
  onPartialResults?: (response: ScriptureSearchResponse) => void;
};

let backendForTesting: ScriptureSearchBackend | undefined;
export function setScriptureSearchBackendForTesting(backend?: ScriptureSearchBackend) { backendForTesting = backend; }

function abortIfNeeded(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("Search cancelled");
  error.name = "AbortError";
  throw error;
}


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
  return swedishAliasMap.get(bookAliasKey(value)) ?? englishAliasMap.get(bookAliasKey(value));
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
  const match = normalizedQuery.match(/^(.+?)\s*(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return undefined;

  const book = canonicalBibleBookName(match[1], language);
  const chapter = Number(match[2]);
  const startVerse = Number(match[3]);
  const endVerse = match[4] ? Number(match[4]) : startVerse;
  if (!book || chapter < 1 || startVerse < 1 || endVerse < startVerse) return undefined;

  return `${book} ${chapter}:${startVerse}${endVerse > startVerse ? `-${endVerse}` : ""}`;
}

export function resolveBibleReference(query: string, language: AppLanguage, versionId: BibleVersionId) {
  const canonicalReference = canonicalReferenceFromQuery(query, bibleBookLanguage(language, versionId));
  return canonicalReference ? bibleVerseFromReference(canonicalReference, versionId) : undefined;
}

export function biblePositionFromSearchQuery(query: string, language: AppLanguage, versionId: BibleVersionId): BiblePosition | undefined {
  const verse = resolveBibleReference(query, language, versionId);
  if (verse?.book && verse.chapter && verse.startVerse) {
    return { book: verse.book, chapter: verse.chapter, verse: verse.startVerse };
  }

  const chapterMatch = normalizeScriptureQuery(query).match(/^(.+?)\s*(\d+)$/);
  if (!chapterMatch) return undefined;
  const bookName = canonicalBibleBookName(chapterMatch[1], bibleBookLanguage(language, versionId));
  const chapter = Number(chapterMatch[2]);
  const book = kjvBooks.find((item) => item.name === bookName);
  if (!book || !book.chapters.includes(chapter)) return undefined;

  return { book: book.name, chapter, verse: 1 };
}

export async function searchScripture({ language, limit = 20, query, versionId, signal, onPartialResults }: SearchScriptureOptions): Promise<ScriptureSearchResponse> {
  abortIfNeeded(signal);
  const normalizedQuery = normalizeScriptureQuery(query);
  const empty: ScriptureSearchResponse = { results: [], mode: "lexical", semanticState: "ready" };
  if (!normalizedQuery || !Number.isFinite(limit) || limit <= 0) return empty;
  const boundedLimit = Math.min(100, Math.floor(limit));
  if (boundedLimit === 0) return empty;

  let referenceVerse = resolveBibleReference(normalizedQuery, language, versionId);
  const chapterQuery = normalizedQuery.match(/^(.+?)\s*(\d+)$/);
  if (!referenceVerse && chapterQuery && canonicalBibleBookName(chapterQuery[1], language)) {
    const position = biblePositionFromSearchQuery(normalizedQuery, language, versionId);
    if (position) {
      const rows = bibleChapterVerses(position.book, position.chapter, versionId);
      referenceVerse = rows.length ? buildBibleVerse(position.book, position.chapter, rows[0].verse, rows.at(-1)!.verse, versionId) : undefined;
    }
    if (!position) return empty;
  }
  if (referenceVerse) {
    const verses = bibleChapterVerses(referenceVerse.book!, referenceVerse.chapter!, versionId)
      .filter(({ verse }) => verse >= referenceVerse.startVerse! && verse <= referenceVerse.endVerse!)
      .map(({ verse, text }) => ({ verse, text }));
    return { ...empty, results: [{ id: `${versionId}:${referenceVerse.reference}`, matchType: "reference", kind: referenceVerse.startVerse === referenceVerse.endVerse ? "verse" : "passage", sources: ["reference"], verse: referenceVerse, verses }] };
  }
  if (/\d\s*:\s*\d/.test(normalizedQuery)) return empty;

  const verseCache = new Map<string, BiblePassage | undefined>();
  const resolveResults = async (ranked: RankedDocument[]) => {
    const candidates = collapseSearchRanges(ranked, boundedLimit).map((item) => ({ ...item,
      reference: `${item.document.book} ${item.document.chapter}:${item.document.start_verse}${item.document.end_verse > item.document.start_verse ? `-${item.document.end_verse}` : ""}`,
    }));
    const missing = [...new Map(candidates.filter((item) => !verseCache.has(item.reference)).map((item) => [item.reference, item])).values()];
    if (missing.length) {
      const verses = await biblePassagesFromRanges(missing.map(({ document }) => ({ book: document.book, chapter: document.chapter, startVerse: document.start_verse, endVerse: document.end_verse })), versionId);
      abortIfNeeded(signal);
      missing.forEach((item, index) => verseCache.set(item.reference, verses[index]));
    }
    return candidates.flatMap(({ document, sources, reference }): ScriptureSearchResult[] => {
      const passage = verseCache.get(reference);
      return passage ? [{ id: `${versionId}:${reference}`, matchType: sources.includes("lexical") ? "text" : sources.includes("topic") ? "topic" : "semantic", kind: document.start_verse === document.end_verse ? "verse" : "passage", sources, ...passage }] : [];
    });
  };

  let backend: ScriptureSearchBackend;
  try {
    backend = backendForTesting ?? await (await import("./bible-search/native-backend")).getNativeSearchBackend();
  } catch {
    abortIfNeeded(signal);
    const translation = bibleVersionFor(versionId).translation;
    const textResults = await searchBibleText(normalizedQuery, versionId, boundedLimit);
    abortIfNeeded(signal);
    return { mode: "lexical", semanticState: "unavailable", results: textResults.map((result) => ({
      id: `${versionId}:${result.reference}`, matchType: "text", kind: "verse", sources: ["lexical"],
      verse: { book: result.position.book, chapter: result.position.chapter, startVerse: result.position.verse, endVerse: result.position.verse, reference: result.reference, referenceText: result.reference, text: result.text, translation },
      verses: [{ verse: result.position.verse, text: result.text }],
    })) };
  }
  abortIfNeeded(signal);
  const translationId = versionId === "reformationsbibeln2026" ? 2 : 1;
  const lexical = await backend.lexical(normalizedQuery, translationId, boundedLimit);
  abortIfNeeded(signal);
  const partial: ScriptureSearchResponse = { results: await resolveResults(lexical), mode: "lexical", semanticState: "loading" };
  abortIfNeeded(signal);
  onPartialResults?.(partial);
  try {
    const results = await backend.hybrid(normalizedQuery, translationId, lexical, boundedLimit, signal);
    abortIfNeeded(signal);
    const resolved = await resolveResults(results);
    abortIfNeeded(signal);
    return { results: resolved, mode: "hybrid", semanticState: "ready" };
  } catch (error) {
    abortIfNeeded(signal);
    return { ...partial, semanticState: "unavailable" };
  }
}
