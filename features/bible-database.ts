import type { SQLiteDatabase } from "expo-sqlite";

export type BibleDatabaseConnection = Pick<SQLiteDatabase, "getAllAsync" | "getAllSync" | "getFirstSync">;

export type BibleDatabaseVerseRow = {
  book: string;
  chapter: number;
  text: string;
  verse: number;
};

export type BibleDatabaseCrossReferenceRow = {
  target_book: string;
  target_chapter: number;
  target_end_book: string | null;
  target_end_chapter: number | null;
  target_end_osis: string | null;
  target_end_verse: number | null;
  target_osis: string;
  target_verse: number;
  votes: number;
};

const CHAPTER_CACHE_LIMIT = 6;
const CROSS_REFERENCE_CHAPTER_CACHE_LIMIT = 6;

let database: BibleDatabaseConnection | undefined;
const chapterCache = new Map<string, BibleDatabaseVerseRow[]>();
const crossReferenceChapterCache = new Map<string, Set<number>>();

function cacheValue<Key, Value>(cache: Map<Key, Value>, key: Key, value: Value, limit: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value as Key | undefined;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  return value;
}

function requireDatabase() {
  if (!database) {
    throw new Error("Bible database is unavailable outside BibleDatabaseProvider");
  }
  return database;
}

export async function initializeBibleDatabase(nextDatabase: SQLiteDatabase) {
  const metadata = nextDatabase.getFirstSync<{ user_version: number }>("PRAGMA user_version");
  if (metadata?.user_version !== 1) {
    throw new Error(`Unsupported Bible database version: ${metadata?.user_version ?? "unknown"}`);
  }
  await nextDatabase.execAsync("PRAGMA query_only = ON");
  database = nextDatabase;
  chapterCache.clear();
  crossReferenceChapterCache.clear();
}

export function setBibleDatabaseForTesting(nextDatabase: BibleDatabaseConnection) {
  database = nextDatabase;
  chapterCache.clear();
  crossReferenceChapterCache.clear();
}

export function queryBibleChapter(translation: string, book: string, chapter: number) {
  const key = `${translation}|${book}|${chapter}`;
  const cached = chapterCache.get(key);
  if (cached) {
    cacheValue(chapterCache, key, cached, CHAPTER_CACHE_LIMIT);
    return cached;
  }

  const rows = requireDatabase().getAllSync<BibleDatabaseVerseRow>(
    `SELECT books.name AS book, verses.chapter, verses.verse, verses.text
       FROM verses
       JOIN translations ON translations.id = verses.translation_id
       JOIN books ON books.id = verses.book_id
      WHERE translations.code = ? AND books.name = ? AND verses.chapter = ?
      ORDER BY verses.verse`,
    translation,
    book,
    chapter,
  );
  return cacheValue(chapterCache, key, rows, CHAPTER_CACHE_LIMIT);
}

export function bibleChapterHasCrossReference(book: string, chapter: number, verse: number) {
  const key = `${book}|${chapter}`;
  let verses = crossReferenceChapterCache.get(key);
  if (!verses) {
    const rows = requireDatabase().getAllSync<{ source_verse: number }>(
      `SELECT DISTINCT cross_references.source_verse
         FROM cross_references
         JOIN books ON books.id = cross_references.source_book_id
        WHERE books.name = ? AND cross_references.source_chapter = ?`,
      book,
      chapter,
    );
    verses = cacheValue(
      crossReferenceChapterCache,
      key,
      new Set(rows.map((row) => row.source_verse)),
      CROSS_REFERENCE_CHAPTER_CACHE_LIMIT,
    );
  } else {
    cacheValue(crossReferenceChapterCache, key, verses, CROSS_REFERENCE_CHAPTER_CACHE_LIMIT);
  }
  return verses.has(verse);
}

export function queryBibleCrossReferences(book: string, chapter: number, verse: number) {
  return requireDatabase().getAllSync<BibleDatabaseCrossReferenceRow>(
    `SELECT target_books.name AS target_book, target_books.osis AS target_osis,
            cross_references.target_chapter, cross_references.target_verse,
            target_end_books.name AS target_end_book,
            target_end_books.osis AS target_end_osis,
            cross_references.target_end_chapter, cross_references.target_end_verse,
            cross_references.votes
       FROM cross_references
       JOIN books AS source_books ON source_books.id = cross_references.source_book_id
       JOIN books AS target_books ON target_books.id = cross_references.target_book_id
       LEFT JOIN books AS target_end_books ON target_end_books.id = cross_references.target_end_book_id
      WHERE source_books.name = ?
        AND cross_references.source_chapter = ?
        AND cross_references.source_verse = ?
      ORDER BY cross_references.votes DESC, cross_references.id`,
    book,
    chapter,
    verse,
  );
}

function ftsQuery(value: string) {
  return (value.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" ");
}

export async function queryBibleText(translation: string, query: string, limit: number) {
  const matchQuery = ftsQuery(query);
  if (!matchQuery) return [];

  return requireDatabase().getAllAsync<BibleDatabaseVerseRow>(
    `SELECT books.name AS book, verses.chapter, verses.verse, verses.text
       FROM verse_search
       JOIN verses ON verses.id = verse_search.rowid
       JOIN translations ON translations.id = verses.translation_id
       JOIN books ON books.id = verses.book_id
      WHERE verse_search MATCH ? AND translations.code = ?
      ORDER BY bm25(verse_search), verses.canonical_order
      LIMIT ?`,
    matchQuery,
    translation,
    limit,
  );
}
