import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const directory = await mkdtemp(path.join(tmpdir(), "koino-rank-test-"));
const output = path.join(directory, "retrieval.mjs");
await build({ entryPoints: [path.resolve(import.meta.dirname, "../features/bible-search/retrieval.ts")], outfile: output, platform: "node", format: "esm", bundle: true, logLevel: "silent" });
const { reciprocalRankFusion, collapseSearchRanges, queryTerms } = await import(pathToFileURL(output).href);
await rm(directory, { recursive: true, force: true });
const doc = (id, verse = id, title = "Same passage") => ({ id, book: "John", chapter: 3, translation_id: 1, start_verse: verse, end_verse: verse, kind: "verse", title, text: "Local text", canonical_order: id });

test("agreement across retrieval sources outranks a lone first-place match", () => {
  const ranked = reciprocalRankFusion([{ source: "lexical", documents: [doc(1), doc(2)] }, { source: "semantic", documents: [doc(3), doc(2)] }]);
  assert.equal(ranked[0].document.id, 2);
  assert.deepEqual(ranked[0].sources, ["lexical", "semantic"]);
  assert.equal(reciprocalRankFusion([{ source: "lexical", documents: [doc(1), doc(1)] }, { source: "lexical", documents: [doc(1)] }])[0].score, 1/61);
});

test("passages suppress duplicate verse cards and merge only within their native section", () => {
  const ranked = [
    { document: { ...doc(100, 16), end_verse: 17, kind: "passage" }, score: 1, sources: ["semantic"] },
    { document: doc(16), score: .9, sources: ["lexical"] },
    { document: doc(20), score: .8, sources: ["lexical"] },
    { document: doc(21,21,"Next passage"), score: .7, sources: ["lexical"] },
    { document: doc(22,22,"Next passage"), score: .6, sources: ["semantic"] },
  ];
  const merged = collapseSearchRanges(ranked, 20);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged[0].sources, ["semantic", "lexical"]);
  assert.equal(merged[1].document.end_verse, 20);
  assert.equal(merged[2].document.end_verse, 22);
  assert.deepEqual(collapseSearchRanges(ranked, 1), merged.slice(0,1));
  assert.equal(ranked[0].sources.length, 1, "Ranking must not mutate cached source evidence");
});

test("bilingual lexical cleanup removes framing without treating FTS operators as syntax", () => {
  assert.deepEqual(queryTerms("show me verses where Jesus was worshiped"), ["jesus", "worshiped"]);
  assert.deepEqual(queryTerms("visa mig verser där Jesus blir tillbedd"), ["jesus", "blir", "tillbedd"]);
  assert.deepEqual(queryTerms('grace\" OR (mercy*)'), ["grace", "mercy"]);
  assert.deepEqual(queryTerms("[]()+*:"), []);
});
