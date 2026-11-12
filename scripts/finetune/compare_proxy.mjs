#!/usr/bin/env node
/** Zero-regression gate for the fixed real-index proxy evaluation. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = path.join(ROOT, "scripts/hybrid-search/.cache/finetune");
const baseline = JSON.parse(readFileSync(process.argv[2] ?? path.join(cache, "proxy-production.json"), "utf8")).summary;
const candidate = JSON.parse(readFileSync(process.argv[3] ?? path.join(cache, "proxy-candidate.json"), "utf8")).summary;
const tolerance = Number(process.argv[4] ?? 0);
const metrics = ["recallAt10", "recallAt20", "mrr"];
const round = (value) => Math.round(value * 1e6) / 1e6;
const compare = (before, after) => Object.fromEntries(metrics.map((metric) => [
  metric,
  { before: round(before[metric]), after: round(after[metric]), delta: round(after[metric] - before[metric]) },
]));
const report = {
  tolerance,
  pool: candidate.pool,
  overall: compare(baseline, candidate),
  byLanguage: Object.fromEntries(Object.keys(baseline.byLanguage).map((language) => [
    language,
    compare(baseline.byLanguage[language], candidate.byLanguage[language]),
  ])),
};
report.passed = [
  ...Object.values(report.overall),
  ...Object.values(report.byLanguage).flatMap((values) => Object.values(values)),
].every(({ delta }) => delta >= -tolerance);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
