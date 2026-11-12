#!/usr/bin/env node
/** Compare the rebuilt production index with the pre-fine-tune baseline. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = path.join(ROOT, "scripts/hybrid-search/.cache/finetune");
const baselinePath = process.argv[2] ?? path.join(cache, "index-baseline.json");
const afterPath = process.argv[3] ?? path.join(cache, "index-after.json");
const tolerance = Number(process.argv[4] ?? 0);
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")).summary;
const after = JSON.parse(readFileSync(afterPath, "utf8")).summary;
const round = (value) => Math.round(value * 1e6) / 1e6;
const metrics = ["recallAt10", "recallAt20", "mrr"];
const compare = (before, next) => Object.fromEntries(metrics.map((metric) => [
  metric,
  { before: round(before[metric]), after: round(next[metric]), delta: round(next[metric] - before[metric]) },
]));
const report = {
  tolerance,
  queries: after.queries,
  overall: compare(baseline, after),
  byLanguage: Object.fromEntries(Object.keys(baseline.byLanguage).map((language) => [
    language,
    compare(baseline.byLanguage[language], after.byLanguage[language]),
  ])),
};
report.passed = [
  ...Object.values(report.overall),
  ...Object.values(report.byLanguage).flatMap((values) => Object.values(values)),
].every(({ delta }) => delta >= -tolerance);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
