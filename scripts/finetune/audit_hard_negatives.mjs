#!/usr/bin/env node
/** Audit hard negatives for plausible alternative answers (same section/chapter). */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = path.join(ROOT, "scripts/hybrid-search/.cache/finetune");
const input = process.argv[2] ?? path.join(cache, "v4/train-mined.jsonl");
const output = process.argv[3] ?? path.join(cache, "v4/hard-negative-audit.json");
const docs = JSON.parse(readFileSync(path.join(ROOT, "assets/bible/search/.cache/tokenized-documents.json"), "utf8"));
const byText = new Map(docs.map((doc) => [doc.embeddingText, doc]));
const rows = readFileSync(input, "utf8").trim().split("\n").map(JSON.parse);
const summary = {
  rows: rows.length,
  negatives: 0,
  unresolvedNegatives: 0,
  sameTitle: 0,
  sameChapter: 0,
  overlappingPositive: 0,
  rowsWithSameTitleNegative: 0,
  examples: [],
};
for (const row of rows) {
  const positive = byText.get(row.positive);
  let rowSameTitle = false;
  for (const text of row.hard_negatives) {
    summary.negatives += 1;
    const negative = byText.get(text);
    if (!negative || !positive) {
      summary.unresolvedNegatives += 1;
      continue;
    }
    const sameChapter = positive.book === negative.book && positive.chapter === negative.chapter;
    const sameTitle = sameChapter && positive.title === negative.title;
    const overlapping = sameChapter && positive.start_verse <= negative.end_verse && positive.end_verse >= negative.start_verse;
    if (sameChapter) summary.sameChapter += 1;
    if (sameTitle) {
      summary.sameTitle += 1;
      rowSameTitle = true;
      if (summary.examples.length < 20) {
        summary.examples.push({
          query: row.query,
          positive: `${positive.book} ${positive.chapter}:${positive.start_verse}-${positive.end_verse} · ${positive.title}`,
          negative: `${negative.book} ${negative.chapter}:${negative.start_verse}-${negative.end_verse} · ${negative.title}`,
          kind: negative.kind,
        });
      }
    }
    if (overlapping) summary.overlappingPositive += 1;
  }
  if (rowSameTitle) summary.rowsWithSameTitleNegative += 1;
}
writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
