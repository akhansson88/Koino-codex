#!/usr/bin/env node
/** Validate the curated narrative paraphrase training seeds. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = JSON.parse(readFileSync(path.join(ROOT, "scripts/finetune/narrative-paraphrase-training.json"), "utf8"));
const benchmark = JSON.parse(readFileSync(path.join(ROOT, "scripts/finetune/narrative-paraphrase-benchmark.json"), "utf8"));
const recallQueries = JSON.parse(readFileSync(path.join(ROOT, "scripts/hybrid-search/recall-queries.json"), "utf8"));
const recallGold = JSON.parse(readFileSync(path.join(ROOT, "scripts/hybrid-search/recall-gold.json"), "utf8"));
const search = new DatabaseSync(path.join(ROOT, "assets/bible/search/koino-search-v1.db"), { readOnly: true });
const reader = new DatabaseSync(path.join(ROOT, "assets/bible/koino-bible-v2.db"), { readOnly: true });
const books = new Map(reader.prepare("SELECT id,name FROM books").all().map(({ id, name }) => [id, name]));
const verseAt = search.prepare("SELECT 1 FROM documents WHERE translation_id=1 AND kind='verse' AND book=? AND chapter=? AND start_verse BETWEEN ? AND ? LIMIT 1");
const failures = [];
const benchmarkRefs = benchmark.queries.flatMap((entry) => entry.references);
const fixedQueries = new Set(recallQueries.flat().map((query) => query.trim().toLowerCase()));
const examples = { benchmarkOverlap: [], fixedGoldOverlap: [] };
let overlapsBenchmark = 0;
let overlapsFixedGold = 0;
for (const story of source.stories) {
  if (!story.id || !story.en || !story.sv) failures.push(`Missing id/en/sv in ${story.id}`);
  for (const query of [story.en, story.sv]) {
    if (fixedQueries.has(query.trim().toLowerCase())) failures.push(`${story.id}: query overlaps fixed 80`);
  }
  for (const [bookId, chapter, first, last] of story.references ?? []) {
    if (!books.has(bookId)) failures.push(`${story.id}: unknown book ${bookId}`);
    if (!verseAt.get(books.get(bookId), chapter, first, last)) failures.push(`${story.id}: no verse in reference`);
    for (const [b, c, f, l] of benchmarkRefs) {
      if (b === bookId && c === chapter && f <= last && l >= first) {
        overlapsBenchmark += 1;
        if (examples.benchmarkOverlap.length < 10) examples.benchmarkOverlap.push(`${story.id}: ${books.get(bookId)} ${chapter}:${first}-${last}`);
      }
    }
    for (const gold of recallGold) {
      for (const [b, c, f, l] of gold) {
        if (b === bookId && c === chapter && f <= last && l >= first) {
          overlapsFixedGold += 1;
          if (examples.fixedGoldOverlap.length < 10) examples.fixedGoldOverlap.push(`${story.id}: ${books.get(bookId)} ${chapter}:${first}-${last}`);
        }
      }
    }
  }
}
search.close();
reader.close();
const report = {
  stories: source.stories.length,
  queries: source.stories.length * 2,
  overlapsBenchmark,
  overlapsFixedGold,
  failures,
  examples,
  passed: failures.length === 0 && overlapsBenchmark === 0 && overlapsFixedGold === 0,
};
writeFileSync(path.join(ROOT, "scripts/finetune/narrative-paraphrase-training.validation.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
