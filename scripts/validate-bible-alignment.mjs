import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const database = new DatabaseSync(path.join(root, "assets", "bible", "koino-bible-v5.db"), { readOnly: true });

const books = new Map(database.prepare("SELECT name, id FROM books").all().map((row) => [row.name, row.id]));
const translationIds = new Map(database.prepare("SELECT code, id FROM translations").all().map((row) => [row.code, row.id]));

function links(source, target, book, chapter, verse) {
  return database.prepare(
    `SELECT target_chapter, target_verse, source_start, source_end, target_start, target_end,
            confidence, approximate, cross_chapter
       FROM verse_links
      WHERE source_translation_id = ? AND target_translation_id = ? AND book_id = ? AND source_chapter = ? AND source_verse = ?
      ORDER BY source_start`,
  ).all(translationIds.get(source), translationIds.get(target), books.get(book), chapter, verse);
}

function resolve(source, target, book, chapter, verse, fraction = 0) {
  const rows = links(source, target, book, chapter, verse);
  if (rows.length === 0) return undefined;
  const covering = rows.filter((row) => fraction >= row.source_start - 1e-9 && fraction <= row.source_end + 1e-9);
  const candidates = covering.length ? covering : rows;
  const chosen = candidates.reduce((best, row) => {
    const bestSpan = best.source_end - best.source_start;
    const rowSpan = row.source_end - row.source_start;
    if (rowSpan < bestSpan) return row;
    if (rowSpan > bestSpan) return best;
    return row.confidence > best.confidence ? row : best;
  });
  const span = chosen.source_end - chosen.source_start;
  const ratio = span <= 1e-9 ? 0 : Math.min(1, Math.max(0, (fraction - chosen.source_start) / span));
  return {
    approximate: chosen.approximate === 1 || chosen.cross_chapter === 1,
    chapter: chosen.target_chapter,
    crossChapter: chosen.cross_chapter === 1,
    fraction: Math.min(1, Math.max(0, chosen.target_start + ratio * (chosen.target_end - chosen.target_start))),
    verse: chosen.target_verse,
  };
}

function expect(source, target, book, chapter, verse, expectedChapter, expectedVerse, options = {}) {
  const result = resolve(source, target, book, chapter, verse, options.fraction ?? 0);
  assert.ok(result, `${source} ${book} ${chapter}:${verse} has no link to ${target}`);
  assert.equal(result.chapter, expectedChapter, `${source} ${book} ${chapter}:${verse} chapter`);
  assert.equal(result.verse, expectedVerse, `${source} ${book} ${chapter}:${verse} verse`);
  if (options.approximate !== undefined) assert.equal(result.approximate, options.approximate, `${source} ${book} ${chapter}:${verse} approximate`);
  if (options.minimumTargetFraction !== undefined) {
    assert.ok(result.fraction >= options.minimumTargetFraction, `${source} ${book} ${chapter}:${verse} target fraction ${result.fraction}`);
  }
  return result;
}

// The psalm superscription is verse 1 in the Swedish translations and not a
// verse in KJV. This is the case a number-only sync gets wrong.
expect("sfb15", "kjv", "Psalms", 3, 1, 3, 1, { approximate: true });
expect("sfb15", "kjv", "Psalms", 3, 2, 3, 1, { approximate: false });
expect("kjv", "sfb15", "Psalms", 3, 1, 3, 2, { approximate: false });
expect("reformationsbibeln2026", "kjv", "Psalms", 3, 2, 3, 1, { approximate: false });
expect("kjv", "reformationsbibeln2026", "Psalms", 3, 1, 3, 2, { approximate: false });

// Two-verse titles (Ps 51, 52, 54, 60).
expect("sfb15", "kjv", "Psalms", 51, 2, 51, 1, { approximate: true });
expect("sfb15", "kjv", "Psalms", 51, 3, 51, 1, { approximate: false });
expect("kjv", "sfb15", "Psalms", 51, 1, 51, 3, { approximate: false });
expect("kjv", "sfb15", "Psalms", 51, 2, 51, 4, { approximate: false });
expect("reformationsbibeln2026", "kjv", "Psalms", 51, 1, 51, 1, { approximate: true });
expect("reformationsbibeln2026", "kjv", "Psalms", 51, 2, 51, 1, { approximate: true });

// A chapter whose counts happen to match must stay 1:1.
expect("sfb15", "kjv", "Psalms", 23, 1, 23, 1, { approximate: false });
expect("sfb15", "kjv", "Psalms", 73, 4, 73, 4, { approximate: false });
expect("nkjv", "kjv", "Psalms", 3, 1, 3, 1, { approximate: false });
expect("sfb15", "kjv", "Psalms", 119, 1, 119, 1, { approximate: false });

// 2 Cor 13: the Swedish v12 merges KJV 12+13; the Swedish grace verse is KJV 14.
const grace = expect("kjv", "reformationsbibeln2026", "2 Corinthians", 13, 13, 13, 12, { approximate: false });
assert.ok(grace.fraction > 0.4, `KJV 2 Cor 13:13 should land in the second half of Swedish v12, got ${grace.fraction}`);
expect("kjv", "reformationsbibeln2026", "2 Corinthians", 13, 14, 13, 13, { approximate: false });
expect("reformationsbibeln2026", "kjv", "2 Corinthians", 13, 13, 13, 14, { approximate: false });

// 3 John: KJV 14 merges the Swedish 14 and 15.
expect("kjv", "reformationsbibeln2026", "3 John", 1, 14, 1, 14, { approximate: false });
expect("reformationsbibeln2026", "kjv", "3 John", 1, 15, 1, 14, { approximate: false });

// Revelation 12:18 is the first half of KJV 13:1: a cross-chapter link.
const revelation = expect("reformationsbibeln2026", "kjv", "Revelation", 12, 18, 13, 1, { approximate: true });
assert.equal(revelation.crossChapter, true, "Revelation 12:18 should be marked cross-chapter");

// Every psalm title in every Swedish translation maps to the first content
// verse of KJV, and the first content verse maps to KJV 1. This is the class
// of problem that made Psalm 51 look unsynced above verse 3.
for (const code of ["sfb15", "reformationsbibeln2026"]) {
  for (let chapter = 1; chapter <= 150; chapter += 1) {
    const targetCount = database.prepare(
      `SELECT COUNT(*) AS count FROM verses v JOIN books b ON b.id = v.book_id
        WHERE v.translation_id = ? AND b.name = 'Psalms' AND v.chapter = ?`,
    ).get(translationIds.get(code), chapter).count;
    const kjvCount = database.prepare(
      `SELECT COUNT(*) AS count FROM verses v JOIN books b ON b.id = v.book_id
        WHERE v.translation_id = 1 AND b.name = 'Psalms' AND v.chapter = ?`,
    ).get(chapter).count;
    const titleCount = targetCount - kjvCount;
    if (titleCount <= 0) continue;
    for (let verse = 1; verse <= titleCount; verse += 1) {
      const title = resolve(code, "kjv", "Psalms", chapter, verse);
      assert.ok(title, `${code} Ps ${chapter}:${verse} title has no link`);
      assert.equal(title.chapter, chapter, `${code} Ps ${chapter}:${verse} title chapter`);
      assert.equal(title.verse, 1, `${code} Ps ${chapter}:${verse} title should land on KJV 1`);
    }
    const content = resolve(code, "kjv", "Psalms", chapter, titleCount + 1);
    assert.ok(content, `${code} Ps ${chapter} first content verse has no link`);
    assert.equal(content.verse, 1, `${code} Ps ${chapter} first content verse should land on KJV 1`);
  }
}

// Every verse resolves, in both directions.
for (const code of ["reformationsbibeln2026", "sfb15", "nkjv"]) {
  const missing = database.prepare(
    `SELECT COUNT(*) AS count
       FROM verses v JOIN books b ON b.id = v.book_id
      WHERE v.translation_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM verse_links l
           WHERE l.source_translation_id = v.translation_id
             AND l.target_translation_id = 1
             AND l.book_id = v.book_id
             AND l.source_chapter = v.chapter
             AND l.source_verse = v.verse)`,
  ).get(translationIds.get(code)).count;
  assert.equal(missing, 0, `${code} has ${missing} verses without a link to KJV`);
}
for (const code of ["reformationsbibeln2026", "sfb15", "nkjv"]) {
  const missing = database.prepare(
    `SELECT COUNT(*) AS count
       FROM verses v JOIN books b ON b.id = v.book_id
      WHERE v.translation_id = 1
        AND NOT EXISTS (
          SELECT 1 FROM verse_links l
           WHERE l.source_translation_id = 1
             AND l.target_translation_id = ?
             AND l.book_id = v.book_id
             AND l.source_chapter = v.chapter
             AND l.source_verse = v.verse)`,
  ).get(translationIds.get(code)).count;
  assert.equal(missing, 0, `KJV has ${missing} verses without a link to ${code}`);
}

// Monotonicity: a later source verse never lands before an earlier one.
for (const code of ["reformationsbibeln2026", "sfb15", "nkjv"]) {
  for (const direction of [[translationIds.get(code), 1], [1, translationIds.get(code)]]) {
    const rows = database.prepare(
      `SELECT book_id, source_chapter, source_verse, MIN(target_chapter * 1000000 + target_verse) AS target_min,
              MAX(target_chapter * 1000000 + target_verse) AS target_max
         FROM verse_links
        WHERE source_translation_id = ? AND target_translation_id = ?
        GROUP BY book_id, source_chapter, source_verse
        ORDER BY book_id, source_chapter, source_verse`,
    ).all(...direction);
    let lastMin = 0;
    let lastMax = 0;
    let lastKey = "";
    for (const row of rows) {
      const key = `${row.book_id}:${row.source_chapter}`;
      if (key !== lastKey) { lastMin = 0; lastMax = 0; lastKey = key; }
      assert.ok(row.target_min >= lastMin - 1, `${code} ${key} verse ${row.source_verse} moves backwards`);
      assert.ok(row.target_max >= lastMax - 1, `${code} ${key} verse ${row.source_verse} jumps backwards`);
      lastMin = row.target_min;
      lastMax = row.target_max;
    }
  }
}

const total = database.prepare("SELECT COUNT(*) AS count FROM verse_links").get().count;
console.log(`Bible alignment OK — ${total.toLocaleString("en-US")} links, all four translations covered, named cases pass.`);
database.close();
