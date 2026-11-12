#!/usr/bin/env node
/** Review a training set before the expensive rebuild/training loop. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const input = path.resolve(process.argv[2] ?? path.join(ROOT, "scripts/hybrid-search/.cache/finetune/v4/train-mined.jsonl"));
const output = path.resolve(process.argv[3] ?? path.join(ROOT, "scripts/hybrid-search/.cache/finetune/v4/training-data-review.json"));
const docs = JSON.parse(readFileSync(path.join(ROOT, "assets/bible/search/.cache/tokenized-documents.json"), "utf8"));
const byText = new Map(docs.map((doc) => [doc.embeddingText, doc]));
const byId = new Map(docs.map((doc) => [doc.id, doc]));
const rows = readFileSync(input, "utf8").trim().split("\n").map(JSON.parse);
const benchmark = JSON.parse(readFileSync(path.join(ROOT, "scripts/finetune/narrative-paraphrase-benchmark.json"), "utf8"));
const benchmarkQueries = new Set(benchmark.queries.flatMap((entry) => [entry.en, entry.sv].map((query) => query.trim().toLowerCase())));
const benchmarkReferences = benchmark.queries.flatMap((entry) => entry.references);
const database = new DatabaseSync(path.join(ROOT, "assets/bible/search/koino-search-v1.db"), { readOnly: true });
const titles = new Set(database.prepare("SELECT DISTINCT title FROM documents WHERE translation_id=1 AND title<>''").all().map(({ title }) => title.trim().toLowerCase()));
database.close();
const titlesWithTemplates = new Set([...titles].flatMap((title) => [title, `bible passage: ${title}`, `bibeltext: ${title}`]));
const swedish = /\b(vad|vem|vilka|vilken|hur|och|att|det|är|för|gud|bibeln|jesus|kristus|nåd|frälsning|bön)\b/i;
const summary = {
  rows: rows.length,
  sources: {},
  languages: { en: 0, sv: 0 },
  versePositive: 0,
  nonVersePositive: 0,
  duplicatePairs: 0,
  exactSectionTitleQueries: 0,
  sameTitleNegatives: 0,
  rowsWithSameTitleNegative: 0,
  benchmarkQueryOverlap: 0,
  benchmarkReferenceOverlap: 0,
  negatives: 0,
  negativeKinds: { verse: 0, passage: 0, window: 0, unknown: 0 },
  examples: { exactSectionTitleQueries: [], sameTitleNegatives: [], benchmarkQueryOverlap: [], benchmarkReferenceOverlap: [] },
};
const pairKeys = new Set();
function overlapsBenchmark(doc) {
  return benchmarkReferences.some(([bookId, chapter, first, last]) => {
    const book = { 1: "Genesis", 2: "Exodus", 7: "Judges", 12: "2 Kings", 16: "Nehemiah", 17: "Esther", 32: "Jonah", 40: "Matthew", 41: "Mark", 42: "Luke", 43: "John", 44: "Acts" }[bookId];
    return doc.book === book && doc.chapter === chapter && doc.start_verse <= last && doc.end_verse >= first;
  });
}
for (const row of rows) {
  summary.sources[row.source] = (summary.sources[row.source] ?? 0) + 1;
  if (swedish.test(row.query)) summary.languages.sv += 1; else summary.languages.en += 1;
  const positive = byId.get(row.positive_id) ?? byText.get(row.positive);
  if (positive?.kind === "verse") summary.versePositive += 1;
  else summary.nonVersePositive += 1;
  const pairKey = `${row.query.toLowerCase()}|${row.positive}`;
  if (pairKeys.has(pairKey)) summary.duplicatePairs += 1;
  pairKeys.add(pairKey);
  const normalizedQuery = row.query.trim().toLowerCase();
  if (titlesWithTemplates.has(normalizedQuery)) {
    summary.exactSectionTitleQueries += 1;
    if (summary.examples.exactSectionTitleQueries.length < 10) summary.examples.exactSectionTitleQueries.push(row.query);
  }
  if (benchmarkQueries.has(normalizedQuery)) {
    summary.benchmarkQueryOverlap += 1;
    if (summary.examples.benchmarkQueryOverlap.length < 10) summary.examples.benchmarkQueryOverlap.push(row.query);
  }
  if (positive && overlapsBenchmark(positive)) {
    summary.benchmarkReferenceOverlap += 1;
    if (summary.examples.benchmarkReferenceOverlap.length < 10) summary.examples.benchmarkReferenceOverlap.push(`${row.query} -> ${positive.book} ${positive.chapter}:${positive.start_verse}-${positive.end_verse}`);
  }
  let rowSameTitle = false;
  for (const text of row.hard_negatives) {
    summary.negatives += 1;
    const negative = byText.get(text);
    const kind = negative?.kind;
    summary.negativeKinds[kind === "verse" || kind === "passage" || kind === "window" ? kind : "unknown"] += 1;
    if (!positive || !negative) continue;
    const sameChapter = positive.book === negative.book && positive.chapter === negative.chapter;
    const sameTitle = sameChapter && positive.title === negative.title;
    if (sameTitle) {
      summary.sameTitleNegatives += 1;
      rowSameTitle = true;
      if (summary.examples.sameTitleNegatives.length < 10) {
        summary.examples.sameTitleNegatives.push(`${row.query}: ${positive.book} ${positive.chapter}:${positive.start_verse} vs ${negative.start_verse}-${negative.end_verse} (${negative.kind})`);
      }
    }
  }
  if (rowSameTitle) summary.rowsWithSameTitleNegative += 1;
}
const checks = {
  "at least 2,000 rows": summary.rows >= 2000,
  "verse-only positives": summary.nonVersePositive === 0,
  "no duplicate query/positive pairs": summary.duplicatePairs === 0,
  "no same-section negatives": summary.sameTitleNegatives === 0,
  "no benchmark query overlap": summary.benchmarkQueryOverlap === 0,
  "no benchmark reference overlap": summary.benchmarkReferenceOverlap === 0,
  "exact section-title queries below 10%": summary.exactSectionTitleQueries <= summary.rows * 0.1,
};
const passed = Object.values(checks).every(Boolean);
const report = { ...summary, checks, passed };
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
