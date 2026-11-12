import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const built = await build({ entryPoints: ["features/bible-search/synopsis.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { buildSearchSynopsis, looksLikeQuestion } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);

const result = (reference, text, matchType = "semantic") => ({
  id: reference,
  matchType,
  kind: "verse",
  sources: ["semantic"],
  verse: { reference, text },
  verses: [{ verse: 1, text }],
});

test("only natural-language questions receive a synopsis", () => {
  assert.equal(looksLikeQuestion("what does the bible say about anxiety"), true);
  assert.equal(looksLikeQuestion("hur hanterar jag sorg?"), true);
  assert.equal(looksLikeQuestion("grace"), false);
  assert.equal(buildSearchSynopsis([result("John 3:16", "For God so loved the world")], "what is love"), undefined);
});

test("synopsis quotes distinct top passages and skips reference cards", () => {
  const synopsis = buildSearchSynopsis([
    result("Philippians 4:6-7", "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God."),
    result("Philippians 4:6-7", "Duplicate"),
    result("1 Peter 5:6-7", "Humble yourselves therefore under the mighty hand of God, that he may exalt you in due time."),
    result("John 14:27", "Peace I leave with you, my peace I give unto you."),
    result("John 3:16", "Reference card", "reference"),
  ], "what does the bible say about anxiety");
  assert.deepEqual(synopsis?.points.map((point) => point.reference), ["Philippians 4:6-7", "1 Peter 5:6-7", "John 14:27"]);
});

test("long quotations are trimmed at a sentence boundary", () => {
  const long = `${"A complete sentence about hope. ".repeat(20)}Final clause that should not be included.`;
  const synopsis = buildSearchSynopsis([result("Psalms 42:11", long), result("Romans 8:24", "For we are saved by hope.")], "why should I have hope?");
  assert.ok(synopsis);
  assert.ok(synopsis.points[0].text.length <= 241);
  assert.ok(synopsis.points[0].text.endsWith("…"));
  assert.equal(synopsis.points[1].text, "For we are saved by hope.");
});
