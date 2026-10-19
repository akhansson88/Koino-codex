import type { SQLiteDatabase } from "expo-sqlite";

export type BibleDatabaseConnection = Pick<SQLiteDatabase, "getAllAsync" | "getAllSync" | "getFirstSync">;

export type BibleDatabaseVerseRow = {
  book: string;
  chapter: number;
  text: string;
  verse: number;
};

export type BibleDatabaseVerseRange = {
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
};

export type BibleDatabaseFootnote = {
  marker: string;
  text: string;
};

export type BibleDatabaseChapterSubtitle = {
  beforeVerse: number;
  text: string;
};

export type BibleDatabaseChapterVerseRow = BibleDatabaseVerseRow & {
  footnotes: BibleDatabaseFootnote[];
};

export type BibleDatabaseChapter = {
  heading: string | null;
  subtitles: BibleDatabaseChapterSubtitle[];
  verses: BibleDatabaseChapterVerseRow[];
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
const activeDatabases = new Map<BibleDatabaseConnection, number>();
const chapterCache = new Map<string, BibleDatabaseChapter>();
const crossReferenceChapterCache = new Map<string, Set<number>>();
const pendingChapters = new Map<string, Promise<BibleDatabaseChapter>>();

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
  if (metadata?.user_version !== 2) {
    throw new Error(`Unsupported Bible database version: ${metadata?.user_version ?? "unknown"}`);
  }
  await nextDatabase.execAsync("PRAGMA query_only = ON");
  database = nextDatabase;
  chapterCache.clear();
  crossReferenceChapterCache.clear();
  pendingChapters.clear();
}

export function retainBibleDatabase(retainedDatabase: BibleDatabaseConnection) {
  activeDatabases.set(retainedDatabase, (activeDatabases.get(retainedDatabase) ?? 0) + 1);
  database = retainedDatabase;
}

export function releaseBibleDatabase(releasedDatabase: BibleDatabaseConnection) {
  const remainingReferences = (activeDatabases.get(releasedDatabase) ?? 1) - 1;
  if (remainingReferences > 0) {
    activeDatabases.set(releasedDatabase, remainingReferences);
    return;
  }
  activeDatabases.delete(releasedDatabase);
  if (database === releasedDatabase) {
    database = Array.from(activeDatabases.keys()).at(-1);
    chapterCache.clear();
    crossReferenceChapterCache.clear();
    pendingChapters.clear();
  }
}

export function setBibleDatabaseForTesting(nextDatabase: BibleDatabaseConnection) {
  activeDatabases.clear();
  activeDatabases.set(nextDatabase, 1);
  database = nextDatabase;
  chapterCache.clear();
  crossReferenceChapterCache.clear();
  pendingChapters.clear();
}

/** Search excerpts need exact verse text, without loading chapter decorations. */
export async function queryBibleVerseRangesAsync(translation: string, ranges: readonly BibleDatabaseVerseRange[]): Promise<BibleDatabaseVerseRow[][]> {
  if (!ranges.length) return [];
  const groups: BibleDatabaseVerseRow[][] = ranges.map(() => []);
  const connection = requireDatabase();
  // Keep every statement below SQLite's conservative 999-variable limit.
  for (let offset = 0; offset < ranges.length; offset += 100) {
    const batch = ranges.slice(offset, offset + 100);
    const rows = await connection.getAllAsync<BibleDatabaseVerseRow & { request_index: number }>(
      `WITH requested(request_index,book,chapter,first,last) AS (VALUES ${batch.map(() => "(?,?,?,?,?)").join(",")})
       SELECT requested.request_index,books.name AS book,verses.chapter,verses.verse,verses.text
         FROM requested
         JOIN books ON books.name=requested.book
         JOIN translations ON translations.code=?
         JOIN verses ON verses.book_id=books.id AND verses.translation_id=translations.id
                    AND verses.chapter=requested.chapter AND verses.verse BETWEEN requested.first AND requested.last
        ORDER BY requested.request_index,verses.verse`,
      ...batch.flatMap((range, index) => [index, range.book, range.chapter, range.startVerse, range.endVerse]), translation);
    for (const { request_index, ...row } of rows) groups[offset + request_index].push(row);
  }
  return groups;
}

export function queryBibleChapterAsync(translation: string, book: string, chapter: number): Promise<BibleDatabaseChapter> {
  const key = `${translation}|${book}|${chapter}`;
  const cached = chapterCache.get(key);
  if (cached) return Promise.resolve(cacheValue(chapterCache, key, cached, CHAPTER_CACHE_LIMIT));
  const pending = pendingChapters.get(key);
  if (pending) return pending;
  const connection = requireDatabase();
  const args = [translation, book, chapter] as const;
  const load = (async () => {
    const [headings, rows, subtitles, footnotes] = await Promise.all([
      connection.getAllAsync<{ heading: string | null }>(
        `SELECT chapters.heading FROM chapters JOIN translations ON translations.id = chapters.translation_id JOIN books ON books.id = chapters.book_id WHERE translations.code = ? AND books.name = ? AND chapters.chapter = ? LIMIT 1`, ...args),
      connection.getAllAsync<BibleDatabaseVerseRow>(
        `SELECT books.name AS book, verses.chapter, verses.verse, verses.text FROM verses JOIN translations ON translations.id = verses.translation_id JOIN books ON books.id = verses.book_id WHERE translations.code = ? AND books.name = ? AND verses.chapter = ? ORDER BY verses.verse`, ...args),
      connection.getAllAsync<{ before_verse: number; text: string }>(
        `SELECT chapter_subtitles.before_verse, chapter_subtitles.text FROM chapter_subtitles JOIN chapters ON chapters.id = chapter_subtitles.chapter_id JOIN translations ON translations.id = chapters.translation_id JOIN books ON books.id = chapters.book_id WHERE translations.code = ? AND books.name = ? AND chapters.chapter = ? ORDER BY chapter_subtitles.before_verse, chapter_subtitles.display_order`, ...args),
      connection.getAllAsync<{ marker: string; text: string; verse: number }>(
        `SELECT verses.verse, verse_footnotes.marker, verse_footnotes.text FROM verse_footnotes JOIN verses ON verses.id = verse_footnotes.verse_id JOIN translations ON translations.id = verses.translation_id JOIN books ON books.id = verses.book_id WHERE translations.code = ? AND books.name = ? AND verses.chapter = ? ORDER BY verses.verse, verse_footnotes.display_order`, ...args),
    ]);
    const footnotesByVerse = new Map<number, BibleDatabaseFootnote[]>();
    footnotes.forEach((footnote) => {
      const items = footnotesByVerse.get(footnote.verse) ?? [];
      items.push({ marker: footnote.marker, text: footnote.text });
      footnotesByVerse.set(footnote.verse, items);
    });
    const result: BibleDatabaseChapter = {
      heading: headings[0]?.heading ?? null,
      subtitles: subtitles.map((item) => ({ beforeVerse: item.before_verse, text: item.text })),
      verses: rows.map((row) => ({ ...row, footnotes: footnotesByVerse.get(row.verse) ?? [] })),
    };
    if (database === connection) cacheValue(chapterCache, key, result, CHAPTER_CACHE_LIMIT);
    return result;
  })();
  pendingChapters.set(key, load);
  void load.finally(() => { if (pendingChapters.get(key) === load) pendingChapters.delete(key); }).catch(() => undefined);
  return load;
}

export function queryBibleChapter(translation: string, book: string, chapter: number) {
  const key = `${translation}|${book}|${chapter}`;
  const cached = chapterCache.get(key);
  if (cached) {
    cacheValue(chapterCache, key, cached, CHAPTER_CACHE_LIMIT);
    return cached;
  }

  const chapterData = requireDatabase().getFirstSync<{ heading: string | null }>(
    `SELECT chapters.heading
       FROM chapters
       JOIN translations ON translations.id = chapters.translation_id
       JOIN books ON books.id = chapters.book_id
      WHERE translations.code = ? AND books.name = ? AND chapters.chapter = ?`,
    translation,
    book,
    chapter,
  );
  const rows = requireDatabase().getAllSync<BibleDatabaseVerseRow & { verse_id: number }>(
    `SELECT verses.id AS verse_id, books.name AS book, verses.chapter, verses.verse, verses.text
       FROM verses
       JOIN translations ON translations.id = verses.translation_id
       JOIN books ON books.id = verses.book_id
      WHERE translations.code = ? AND books.name = ? AND verses.chapter = ?
      ORDER BY verses.verse`,
    translation,
    book,
    chapter,
  );
  const subtitles = requireDatabase()
    .getAllSync<{ before_verse: number; text: string }>(
      `SELECT chapter_subtitles.before_verse, chapter_subtitles.text
         FROM chapter_subtitles
         JOIN chapters ON chapters.id = chapter_subtitles.chapter_id
         JOIN translations ON translations.id = chapters.translation_id
         JOIN books ON books.id = chapters.book_id
        WHERE translations.code = ? AND books.name = ? AND chapters.chapter = ?
        ORDER BY chapter_subtitles.before_verse, chapter_subtitles.display_order`,
      translation,
      book,
      chapter,
    )
    .map((subtitle) => ({ beforeVerse: subtitle.before_verse, text: subtitle.text }));
  const footnotesByVerse = new Map<number, BibleDatabaseFootnote[]>();
  requireDatabase()
    .getAllSync<{ marker: string; text: string; verse: number }>(
      `SELECT verses.verse, verse_footnotes.marker, verse_footnotes.text
         FROM verse_footnotes
         JOIN verses ON verses.id = verse_footnotes.verse_id
         JOIN translations ON translations.id = verses.translation_id
         JOIN books ON books.id = verses.book_id
        WHERE translations.code = ? AND books.name = ? AND verses.chapter = ?
        ORDER BY verses.verse, verse_footnotes.display_order`,
      translation,
      book,
      chapter,
    )
    .forEach((footnote) => {
      const verseFootnotes = footnotesByVerse.get(footnote.verse) ?? [];
      verseFootnotes.push({ marker: footnote.marker, text: footnote.text });
      footnotesByVerse.set(footnote.verse, verseFootnotes);
    });

  const result: BibleDatabaseChapter = {
    heading: chapterData?.heading ?? null,
    subtitles,
    verses: rows.map(({ verse_id: _verseId, ...row }) => ({
      ...row,
      footnotes: footnotesByVerse.get(row.verse) ?? [],
    })),
  };
  return cacheValue(chapterCache, key, result, CHAPTER_CACHE_LIMIT);
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

export async function bibleChapterCrossReferenceVersesAsync(book: string, chapter: number): Promise<Set<number>> {
  const key = `${book}|${chapter}`;
  const cached = crossReferenceChapterCache.get(key);
  if (cached) return cacheValue(crossReferenceChapterCache, key, cached, CROSS_REFERENCE_CHAPTER_CACHE_LIMIT);
  const connection = requireDatabase();
  const rows = await connection.getAllAsync<{ source_verse: number }>(
    `SELECT DISTINCT cross_references.source_verse FROM cross_references JOIN books ON books.id = cross_references.source_book_id WHERE books.name = ? AND cross_references.source_chapter = ?`,
    book, chapter,
  );
  const verses = new Set(rows.map((row) => row.source_verse));
  if (database === connection) cacheValue(crossReferenceChapterCache, key, verses, CROSS_REFERENCE_CHAPTER_CACHE_LIMIT);
  return verses;
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
