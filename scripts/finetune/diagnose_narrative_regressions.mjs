#!/usr/bin/env node
/** Pair English/Swedish narrative benchmark results to isolate language-specific regressions. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = path.join(ROOT, "scripts/hybrid-search/.cache/finetune");
const baseline = JSON.parse(readFileSync(path.join(cache, "narrative-benchmark-production-full.json"), "utf8")).results;
const candidate = JSON.parse(readFileSync(path.join(cache, "narrative-benchmark-production.json"), "utf8")).results;
const byKey = new Map(candidate.map((row) => [`${row.id}|${row.language}`, row]));
const rankOf = (row) => row.rank ?? 999;
const stories = new Map();
for (const before of baseline) {
  const after = byKey.get(`${before.id}|${before.language}`);
  if (!after) continue;
  const entry = stories.get(before.id) ?? { id: before.id, story: before.story };
  entry[before.language] = {
    beforeRank: before.rank,
    afterRank: after.rank,
    beforeQuery: before.query,
    afterQuery: after.query,
  };
  stories.set(before.id, entry);
}
const rows = [...stories.values()].map((entry) => {
  const en = entry.en ?? {};
  const sv = entry.sv ?? {};
  return {
    ...entry,
    enDelta: (en.afterRank ? 1 / en.afterRank : 0) - (en.beforeRank ? 1 / en.beforeRank : 0),
    svDelta: (sv.afterRank ? 1 / sv.afterRank : 0) - (sv.beforeRank ? 1 / sv.beforeRank : 0),
    englishPreserved: (en.afterRank ?? 999) <= 3,
    swedishRegressed: (sv.afterRank ?? 999) > (sv.beforeRank ?? 999) || (sv.afterRank ?? 999) > 5,
  };
});
rows.sort((a, b) => a.svDelta - b.svDelta);
const summary = {
  stories: rows.length,
  english: {
    beforeRecallAt1: baseline.filter((row) => row.language === "en" && row.rank === 1).length / baseline.filter((row) => row.language === "en").length,
    afterRecallAt1: candidate.filter((row) => row.language === "en" && row.rank === 1).length / candidate.filter((row) => row.language === "en").length,
    beforeMrr: baseline.filter((row) => row.language === "en").reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / baseline.filter((row) => row.language === "en").length,
    afterMrr: candidate.filter((row) => row.language === "en").reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / candidate.filter((row) => row.language === "en").length,
  },
  swedish: {
    beforeRecallAt1: baseline.filter((row) => row.language === "sv" && row.rank === 1).length / baseline.filter((row) => row.language === "sv").length,
    afterRecallAt1: candidate.filter((row) => row.language === "sv" && row.rank === 1).length / candidate.filter((row) => row.language === "sv").length,
    beforeMrr: baseline.filter((row) => row.language === "sv").reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / baseline.filter((row) => row.language === "sv").length,
    afterMrr: candidate.filter((row) => row.language === "sv").reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / candidate.filter((row) => row.language === "sv").length,
  },
  englishPreservedButSwedishWeak: rows.filter((row) => row.englishPreserved && row.swedishRegressed).length,
  worstSwedishRegressions: rows.slice(0, 15),
};
const output = path.join(cache, "narrative-language-regressions-v5.json");
writeFileSync(output, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`\nSaved ${output}`);
