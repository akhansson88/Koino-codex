#!/usr/bin/env node
/** Explain per-query rank changes between the shipped and candidate indexes. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = path.join(ROOT, "scripts/hybrid-search/.cache/finetune");
const baseline = JSON.parse(readFileSync(process.argv[2] ?? path.join(cache, "index-baseline.json"), "utf8")).results;
const candidate = JSON.parse(readFileSync(process.argv[3] ?? path.join(cache, "index-after-v4.json"), "utf8")).results;
const language = process.argv[4];
const byQuery = new Map(candidate.map((row) => [`${row.language}|${row.query}`, row]));
const rows = [];
for (const before of baseline) {
  if (language && before.language !== language) continue;
  const after = byQuery.get(`${before.language}|${before.query}`);
  if (!after) continue;
  const beforeScore = before.rank ? 1 / before.rank : 0;
  const afterScore = after.rank ? 1 / after.rank : 0;
  rows.push({
    language: before.language,
    query: before.query,
    oldRank: before.rank,
    newRank: after.rank,
    reciprocalDelta: Math.round((afterScore - beforeScore) * 1e6) / 1e6,
    oldTop: before.top?.slice(0, 5),
    newTop: after.top?.slice(0, 5),
    oldBestSimilarity: before.bestRelevantSimilarity ?? null,
    newBestSimilarity: after.bestRelevantSimilarity ?? null,
    newTopKind: after.topKind ?? null,
  });
}
rows.sort((a, b) => a.reciprocalDelta - b.reciprocalDelta);
console.log(JSON.stringify({
  queryCount: rows.length,
  regressions: rows.filter((row) => row.reciprocalDelta < 0).length,
  improvements: rows.filter((row) => row.reciprocalDelta > 0).length,
  unchanged: rows.filter((row) => row.reciprocalDelta === 0).length,
  rows,
}, null, 2));
