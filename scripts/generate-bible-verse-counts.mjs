import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

// Keep navigation bounds synchronized with the exact Bible text bundled for reading.
const database = new DatabaseSync(fileURLToPath(new URL("../assets/bible/koino-bible-v2.db", import.meta.url)), { readOnly: true });
const destination = new URL("../features/bible-verse-counts.json", import.meta.url);
try {
  const counts = {};
  const rows = database.prepare(`SELECT translations.code, books.name AS book, verses.chapter, MAX(verses.verse) AS verse_count
    FROM verses JOIN translations ON translations.id = verses.translation_id JOIN books ON books.id = verses.book_id
    GROUP BY translations.id, books.id, verses.chapter ORDER BY translations.id, books.id, verses.chapter`).all();
  for (const row of rows) {
    const translation = counts[row.code] ??= {};
    const chapters = translation[row.book] ??= [];
    chapters[row.chapter - 1] = row.verse_count;
  }
  const json = `${JSON.stringify(counts)}\n`;
  if (await readFile(destination, "utf8").catch(() => "") !== json) await writeFile(destination, json, "utf8");
  console.log("Bible translation verse counts are up to date.");
} finally {
  database.close();
}
