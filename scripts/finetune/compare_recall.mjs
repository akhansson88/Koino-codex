#!/usr/bin/env node
/** Compare judged int8 recall before/after a model/index rebuild. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const before = JSON.parse(readFileSync(process.argv[2], "utf8"));
const after = JSON.parse(readFileSync(path.join(ROOT, "assets/bible/search/quantization-recall.json"), "utf8"));
const rows = Object.keys(before.languages).map((language) => {
  const old = before.languages[language];
  const next = after.languages[language];
  return {
    language,
    before: old,
    after: next,
    delta: {
      recallAt10: next.int8RecallAt10 - old.int8RecallAt10,
      hitRateAt10: next.int8HitRateAt10 - old.int8HitRateAt10,
    },
  };
});
console.log(JSON.stringify({
  queryCountBefore: before.queryCount,
  queryCountAfter: after.queryCount,
  vectorTypeBefore: before.selectedVectorType,
  vectorTypeAfter: after.selectedVectorType,
  rows,
}, null, 2));
for (const row of rows) {
  if (row.delta.recallAt10 < -0.02 || row.delta.hitRateAt10 < -0.02) process.exitCode = 1;
}
