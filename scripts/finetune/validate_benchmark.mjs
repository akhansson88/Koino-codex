#!/usr/bin/env node
/** Lock and validate the independent narrative paraphrase benchmark. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const benchmarkPath = path.join(ROOT, "scripts/finetune/narrative-paraphrase-benchmark.json");
const lockPath = path.join(ROOT, "scripts/finetune/narrative-paraphrase-benchmark.lock.json");
const benchmarkBytes = readFileSync(benchmarkPath);
const benchmark = JSON.parse(benchmarkBytes);
const search = new DatabaseSync(path.join(ROOT, "assets/bible/search/koino-search-v1.db"), { readOnly: true });
const reader = new DatabaseSync(path.join(ROOT, "assets/bible/koino-bible-v2.db"), { readOnly: true });
const books = new Map(reader.prepare("SELECT id,name FROM books").all().map(({ id, name }) => [id, name]));
const recallQueries = JSON.parse(readFileSync(path.join(ROOT, "scripts/hybrid-search/recall-queries.json"), "utf8"));
const recallGold = JSON.parse(readFileSync(path.join(ROOT, "scripts/hybrid-search/recall-gold.json"), "utf8"));
const trainingQueries = new Set(readFileSync(path.join(ROOT, "scripts/hybrid-search/.cache/finetune/v4/train-mined.jsonl"), "utf8")
  .trim().split("\n").map((line) => JSON.parse(line).query.trim().toLowerCase()));
const heldoutQueries = new Set(recallQueries.flat().map((query) => query.trim().toLowerCase()));
const verseAt = search.prepare("SELECT 1 FROM documents WHERE translation_id=1 AND kind='verse' AND book=? AND chapter=? AND start_verse BETWEEN ? AND ? LIMIT 1");
const failures = [];
const seenIds = new Set();
let referenceCount = 0;
let overlapWithOldGold = 0;
for (const item of benchmark.queries) {
  if (!item.id || seenIds.has(item.id)) failures.push(`Duplicate or missing id: ${item.id}`);
  seenIds.add(item.id);
  if (!item.en?.trim() || !item.sv?.trim()) failures.push(`${item.id}: missing en/sv query`);
  for (const query of [item.en, item.sv]) {
    if (heldoutQueries.has(query.trim().toLowerCase())) failures.push(`${item.id}: query overlaps the fixed 80-query set`);
    if (trainingQueries.has(query.trim().toLowerCase())) failures.push(`${item.id}: query overlaps v4 training`);
  }
  for (const [bookId, chapter, first, last] of item.references ?? []) {
    referenceCount += 1;
    if (!books.has(bookId)) failures.push(`${item.id}: unknown book ${bookId}`);
    if (!verseAt.get(books.get(bookId), chapter, first, last)) {
      failures.push(`${item.id}: no verse document at ${books.get(bookId)} ${chapter}:${first}-${last}`);
    }
    for (const goldItems of recallGold) {
      for (const [goldBook, goldChapter, goldFirst, goldLast] of goldItems) {
        if (goldBook === bookId && goldChapter === chapter && goldFirst <= last && goldLast >= first) {
          overlapWithOldGold += 1;
        }
      }
    }
  }
}
search.close();
reader.close();
if (benchmark.schemaVersion !== 1 || !Array.isArray(benchmark.queries) || benchmark.queries.length < 20) {
  failures.push("Benchmark must have schemaVersion 1 and at least 20 queries");
}
const hash = createHash("sha256").update(benchmarkBytes).digest("hex");
const lock = {
  schemaVersion: 1,
  benchmark: "scripts/finetune/narrative-paraphrase-benchmark.json",
  sha256: hash,
  createdAt: benchmark.createdAt,
  queryCount: benchmark.queries.length,
  languageCount: benchmark.queries.length * 2,
  referenceCount,
  overlapWithFixedGold: overlapWithOldGold,
  validation: failures.length ? "failed" : "passed",
  failures,
  note: "Do not train on these queries or reference spans. Gold is the whole passage section, so any verse in the span is correct.",
};
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(JSON.stringify(lock, null, 2));
if (failures.length) process.exitCode = 1;
