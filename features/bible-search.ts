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
  /** Off-screen excerpts can be reloaded from the local reader database. */
  contentState?: "evicted" | "loading" | "error";
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
  /** Internal preview used by the paged session; quotations are still hydrated one page at a time. */
  onRankedPreview?: (ranked: RankedDocument[]) => void;
};

export type ScriptureSearchPage = ScriptureSearchResponse & { hasMore: boolean };
export type ScriptureSearchPageSession = {
  firstPage(signal?: AbortSignal, onPartialResults?: (response: ScriptureSearchResponse) => void): Promise<ScriptureSearchPage>;
  nextPage(signal?: AbortSignal): Promise<ScriptureSearchPage>;
  suspend(): void;
  dispose(): void;
};

type CompactSearchIndex = {
  books: string[]; book: Uint16Array; chapter: Uint16Array; first: Uint16Array; last: Uint16Array; sources: Uint8Array; length: number;
};

async function compactSearchIndex(rows: RankedDocument[], signal?: AbortSignal): Promise<CompactSearchIndex> {
  const length = rows.length, books: string[] = [], bookIndexes = new Map<string, number>();
  const index: CompactSearchIndex = { books, length, book: new Uint16Array(length), chapter: new Uint16Array(length), first: new Uint16Array(length), last: new Uint16Array(length), sources: new Uint8Array(length) };
  for (let position = 0; position < length; position++) {
    const { document, sources } = rows[position];
    let book = bookIndexes.get(document.book);
    if (book === undefined) { book = books.length; books.push(document.book); bookIndexes.set(document.book, book); }
    index.book[position] = book; index.chapter[position] = document.chapter;
    index.first[position] = document.start_verse; index.last[position] = document.end_verse;
    index.sources[position] = (sources.includes("lexical") ? 1 : 0) | (sources.includes("semantic") ? 2 : 0) | (sources.includes("topic") ? 4 : 0) | (sources.includes("reference") ? 8 : 0);
    if (position && position % 8192 === 0) { abortIfNeeded(signal); await new Promise<void>((resolve) => setTimeout(resolve, 0)); }
  }
  abortIfNeeded(signal);
  return index;
}

let backendForTesting: ScriptureSearchBackend | undefined;
export function setScriptureSearchBackendForTesting(backend?: ScriptureSearchBackend) { backendForTesting = backend; }

async function scriptureBackend() {
  return backendForTesting ?? await (await import("./bible-search/native-backend")).getNativeSearchBackend();
}

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

export async function searchScripture({ language, limit = 20, query, versionId, signal, onPartialResults, onRankedPreview }: SearchScriptureOptions): Promise<ScriptureSearchResponse> {
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
    backend = await scriptureBackend();
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
  onRankedPreview?.(collapseSearchRanges(lexical, 100));
  const partial: ScriptureSearchResponse = { results: await resolveResults(lexical), mode: "lexical", semanticState: "loading" };
  abortIfNeeded(signal);
  onPartialResults?.(partial);
  try {
    const results = await backend.hybrid(normalizedQuery, translationId, lexical, onRankedPreview ? 100 : boundedLimit, signal);
    abortIfNeeded(signal);
    onRankedPreview?.(results);
    // Preserve the original first-page grouping: resolving all 100 preview
    // candidates together can merge extra ranges into the first 20.
    const resolved = await resolveResults(results.slice(0, boundedLimit));
    abortIfNeeded(signal);
    return { results: resolved, mode: "hybrid", semanticState: "ready" };
  } catch (error) {
    abortIfNeeded(signal);
    return { ...partial, semanticState: "unavailable" };
  }
}

/**
 * The visible prefix stays stable. The complete ranking contains compact search
 * metadata; the reader database is consulted only for a requested page.
 */
export function createScriptureSearchPageSession({ language, query, versionId, limit = 20 }: Pick<SearchScriptureOptions, "language" | "query" | "versionId" | "limit">): ScriptureSearchPageSession {
  const normalizedQuery = normalizeScriptureQuery(query);
  const pageSize = Number.isFinite(limit) && limit > 0 ? Math.max(1, Math.floor(limit)) : 20;
  const seen = new Set<string>();
  let response: ScriptureSearchResponse = { results: [], mode: "lexical", semanticState: "ready" };
  let ranked: CompactSearchIndex | undefined;
  let preview: RankedDocument[] = [];
  let previewOffset = 0;
  let rankOffset = 0;
  let fallbackOffset = 0;
  let exhausted = false;
  let disposed = false;
  let initialized = false;
  let indexController: AbortController | undefined;
  let indexPromise: Promise<void> | undefined;
  let indexError: unknown;
  let pendingPage: Promise<ScriptureSearchPage> | undefined;
  let generation = 0;

  function check(signal?: AbortSignal, expectedGeneration = generation) {
    abortIfNeeded(signal);
    if (disposed || expectedGeneration !== generation) { const error = new Error("Search cancelled"); error.name = "AbortError"; throw error; }
  }

  function prepareIndex(backend: ScriptureSearchBackend) {
    if (ranked || indexPromise || indexError || !backend.all) return;
    const controller = new AbortController();
    indexController = controller;
    const task = backend.all(normalizedQuery, versionId === "reformationsbibeln2026" ? 2 : 1, response.semanticState === "ready" && response.mode === "hybrid", controller.signal)
      .then((value) => compactSearchIndex(value, controller.signal))
      .then((value) => { if (!controller.signal.aborted && !disposed) ranked = value; })
      .catch((error) => { if (!controller.signal.aborted && !disposed) indexError = error; throw error; })
      .finally(() => { if (indexController === controller) { indexController = undefined; indexPromise = undefined; } });
    indexPromise = task;
    // Preview pages can finish before indexing. Keep an eventual rejection
    // handled until a later page awaits it and shows the retry control.
    void task.catch(() => undefined);
  }

  async function readNextPage(signal?: AbortSignal, size = 20): Promise<ScriptureSearchPage> {
    const requestGeneration = generation;
    check(signal, requestGeneration);
    if (!initialized) throw new Error("The first search page has not been requested.");
    if (exhausted) return { ...response, results: [], hasMore: false };
    let backend: ScriptureSearchBackend | undefined;
    try { backend = await scriptureBackend(); } catch { check(signal, requestGeneration); }
    check(signal, requestGeneration);
    if (backend?.all) {
      prepareIndex(backend);
      const usePreview = previewOffset < preview.length;
      if (!usePreview && !ranked) {
        try { await indexPromise; } catch (error) { indexError = undefined; throw error; }
      }
      check(signal, requestGeneration);
      if (!usePreview && !ranked && indexError) { const error = indexError; indexError = undefined; throw error; }
      const sourceLength = usePreview ? preview.length : ranked?.length ?? 0;
      const itemAt = (position: number): RankedDocument => {
        if (usePreview) return preview[position];
        const index = ranked!, flags = index.sources[position];
        const sources: SearchSource[] = [];
        if (flags & 1) sources.push("lexical");
        if (flags & 2) sources.push("semantic");
        if (flags & 4) sources.push("topic");
        if (flags & 8) sources.push("reference");
        const first = index.first[position], last = index.last[position];
        return { document: { id: position, translation_id: versionId === "reformationsbibeln2026" ? 2 : 1, book: index.books[index.book[position]], chapter: index.chapter[position], start_verse: first, end_verse: last, kind: first === last ? "verse" : "passage", title: "", text: "", canonical_order: 0 }, score: 0, sources };
      };
      const page: ScriptureSearchResult[] = [];
      const pendingIds = new Set<string>();
      let cursor = usePreview ? previewOffset : rankOffset;
      while (page.length < size && cursor < sourceLength) {
        const candidates: Array<{ ranked: RankedDocument; id: string; reference: string }> = [];
        while (candidates.length < size - page.length && cursor < sourceLength) {
          const item = itemAt(cursor++), doc = item.document;
          const reference = `${doc.book} ${doc.chapter}:${doc.start_verse}${doc.end_verse > doc.start_verse ? `-${doc.end_verse}` : ""}`;
          const id = `${versionId}:${reference}`;
          if (!seen.has(id) && !pendingIds.has(id)) { candidates.push({ ranked: item, id, reference }); pendingIds.add(id); }
        }
        if (!candidates.length) break;
        const passages = await biblePassagesFromRanges(candidates.map(({ ranked: item }) => ({ book: item.document.book, chapter: item.document.chapter, startVerse: item.document.start_verse, endVerse: item.document.end_verse })), versionId);
        check(signal, requestGeneration);
        candidates.forEach(({ ranked: item, id }, index) => {
          const passage = passages[index];
          if (passage) page.push({ id, matchType: item.sources.includes("lexical") ? "text" : item.sources.includes("topic") ? "topic" : "semantic", kind: item.document.start_verse === item.document.end_verse ? "verse" : "passage", sources: item.sources, ...passage });
        });
      }
      check(signal, requestGeneration);
      if (usePreview) previewOffset = cursor;
      else rankOffset = cursor;
      for (const id of pendingIds) seen.add(id);
      exhausted = !usePreview && cursor >= sourceLength;
      if (usePreview && page.length === 0 && previewOffset >= preview.length) return readNextPage(signal, size);
      return { ...response, results: page, hasMore: !exhausted };
    }

    // The packaged reader database remains usable if the hybrid search assets
    // or native vector extension are unavailable.
    const page: ScriptureSearchResult[] = [];
    const pendingIds = new Set<string>();
    let cursor = fallbackOffset, end = false;
    const translation = bibleVersionFor(versionId).translation;
    while (page.length < size && !end) {
      const batchStart = cursor;
      const rows = await searchBibleText(normalizedQuery, versionId, 40, cursor);
      check(signal, requestGeneration);
      if (!rows.length) { end = true; break; }
      for (const result of rows) {
        cursor++;
        const id = `${versionId}:${result.reference}`;
        if (seen.has(id) || pendingIds.has(id)) continue;
        pendingIds.add(id);
        page.push({ id, matchType: "text", kind: "verse", sources: ["lexical"],
          verse: { book: result.position.book, chapter: result.position.chapter, startVerse: result.position.verse, endVerse: result.position.verse, reference: result.reference, referenceText: result.reference, text: result.text, translation },
          verses: [{ verse: result.position.verse, text: result.text }] });
        if (page.length === size) break;
      }
      if (rows.length < 40 && cursor >= batchStart + rows.length) end = true;
    }
    check(signal, requestGeneration);
    fallbackOffset = cursor;
    for (const id of pendingIds) seen.add(id);
    exhausted = end;
    return { mode: "lexical", semanticState: "unavailable", results: page, hasMore: !exhausted };
  }

  function nextPage(signal?: AbortSignal) {
    if (pendingPage) return pendingPage;
    const task = readNextPage(signal);
    pendingPage = task;
    void task.finally(() => { if (pendingPage === task) pendingPage = undefined; }).catch(() => undefined);
    return task;
  }

  return {
    async firstPage(signal, onPartialResults) {
      const requestGeneration = generation;
      check(signal, requestGeneration);
      const first = await searchScripture({ language, query: normalizedQuery, versionId, limit: pageSize, signal, onPartialResults, onRankedPreview: (value) => { preview = value; } });
      check(signal, requestGeneration);
      response = first;
      initialized = true;
      first.results.forEach((item) => seen.add(item.id));
      const chapterQuery = normalizedQuery.match(/^(.+?)\s*(\d+)$/);
      exhausted = !normalizedQuery || first.results.some((item) => item.matchType === "reference") || /\d\s*:\s*\d/.test(normalizedQuery)
        || Boolean(chapterQuery && canonicalBibleBookName(chapterQuery[1], language) && !biblePositionFromSearchQuery(normalizedQuery, language, versionId));
      if (!exhausted && first.results.length === 0) {
        return readNextPage(signal, pageSize);
      }
      return { ...first, hasMore: !exhausted };
    },
    nextPage,
    suspend() { generation++; pendingPage = undefined; indexController?.abort(); indexController = undefined; indexPromise = undefined; },
    dispose() { disposed = true; generation++; pendingPage = undefined; indexController?.abort(); indexController = undefined; indexPromise = undefined; ranked = undefined; preview = []; seen.clear(); },
  };
}
