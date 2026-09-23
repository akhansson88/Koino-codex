import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { setBibleDatabaseForTesting, queryBibleChapter, queryBibleChapterAsync, bibleChapterCrossReferenceVersesAsync, bibleChapterHasCrossReference } from "../features/bible-database.ts";

const database = new DatabaseSync("assets/bible/koino-bible-v2.db", { readOnly: true });
const connection = {
  getAllSync: (sql, ...args) => database.prepare(sql).all(...args),
  getFirstSync: (sql, ...args) => database.prepare(sql).get(...args),
  getAllAsync: async (sql, ...args) => database.prepare(sql).all(...args),
};
try {
  setBibleDatabaseForTesting(connection);
  for (const [book, chapter] of [["Genesis", 1], ["Psalms", 23], ["John", 3]]) {
    const syncChapter = queryBibleChapter("kjv", book, chapter);
    const syncCrossReferences = new Set(syncChapter.verses.filter((verse) => bibleChapterHasCrossReference(book, chapter, verse.verse)).map((verse) => verse.verse));
    setBibleDatabaseForTesting(connection);
    const asyncChapter = await queryBibleChapterAsync("kjv", book, chapter);
    assert.deepEqual(asyncChapter, syncChapter, `${book} ${chapter} must match sync output`);
    const crossReferenceVerses = await bibleChapterCrossReferenceVersesAsync(book, chapter);
    for (const verse of asyncChapter.verses) {
      assert.equal(crossReferenceVerses.has(verse.verse), syncCrossReferences.has(verse.verse));
    }
  }
  console.log("Async Bible chapter and cross-reference query parity passed.");
} finally {
  database.close();
}
