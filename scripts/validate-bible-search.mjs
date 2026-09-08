import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(import.meta.dirname, "..");
const generatedBibleData = path.join(projectRoot, "features", ".generated", "bible-data.ts");

try {
  await access(generatedBibleData);
} catch {
  await import("./generate-bible-data.mjs");
}

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "koino-bible-search-"));
const bundlePath = path.join(temporaryDirectory, "bible-search.mjs");

try {
  await build({
    bundle: true,
    entryPoints: [path.join(projectRoot, "features", "bible-search.ts")],
    format: "esm",
    logLevel: "silent",
    outfile: bundlePath,
    platform: "node",
    tsconfig: path.join(projectRoot, "tsconfig.json"),
  });

  const {
    biblePositionFromSearchQuery,
    displayBibleBookName,
    displayBibleReference,
    resolveBibleReference,
    searchScripture,
  } = await import(`${pathToFileURL(bundlePath).href}?${Date.now()}`);

  function assertReference(query, language, expectedReference, versionId = "kjv") {
    const verse = resolveBibleReference(query, language, versionId);
    assert.ok(verse, `Expected ${query} to resolve in ${versionId}`);
    assert.equal(verse.reference, expectedReference);
    return verse;
  }

  [
    ["John 3:16", "John 3:16"],
    ["john 3:16", "John 3:16"],
    ["JOHN 3 : 16", "John 3:16"],
    ["Jn 3:16", "John 3:16"],
    ["Romans 8:28", "Romans 8:28"],
    ["Rom 8:28", "Romans 8:28"],
    ["1 Corinthians 13:4", "1 Corinthians 13:4"],
    ["1 Cor 13:4", "1 Corinthians 13:4"],
    ["Psalm 23:1", "Psalms 23:1"],
    ["Ps 23:1", "Psalms 23:1"],
  ].forEach(([query, expectedReference]) => assertReference(query, "en", expectedReference));

  [
    ["Johannes 3:16", "John 3:16"],
    ["Joh 3:16", "John 3:16"],
    ["Romarbrevet 8:28", "Romans 8:28"],
    ["Psaltaren 23:1", "Psalms 23:1"],
    ["Första Korinthierbrevet 13:4", "1 Corinthians 13:4"],
    ["1 Kor 13:4", "1 Corinthians 13:4"],
  ].forEach(([query, expectedReference]) => assertReference(query, "sv", expectedReference));

  assertReference("John 3:16-17", "en", "John 3:16-17");
  assertReference("Jn 3 : 16 - 17", "en", "John 3:16-17");

  ["John 999:1", "John 3:999", "John 3:17-16", "Fakebook 3:16", "Jn bananas", "3:16"].forEach((query) => {
    assert.equal(resolveBibleReference(query, "en", "kjv"), undefined, `${query} must not resolve as a reference`);
  });

  assert.deepEqual(biblePositionFromSearchQuery("Psalm 23", "en", "kjv"), { book: "Psalms", chapter: 23, verse: 1 });
  assert.deepEqual(biblePositionFromSearchQuery("Psaltaren 23", "sv", "kjv"), { book: "Psalms", chapter: 23, verse: 1 });
  assert.equal(biblePositionFromSearchQuery("Fakebook 3", "en", "kjv"), undefined);
  assert.equal(biblePositionFromSearchQuery("John 999", "en", "kjv"), undefined);
  assert.equal(displayBibleBookName("John", "sv"), "Johannesevangeliet");
  assert.equal(displayBibleReference("John 3:16", "sv"), "Johannesevangeliet 3:16");

  const swedishAliasWithKjv = assertReference("Johannes 3:16", "sv", "John 3:16", "kjv");
  assert.equal(swedishAliasWithKjv.translation, "KJV");

  const directResults = await searchScripture({ language: "en", query: "Rom 8:28", versionId: "kjv" });
  assert.equal(directResults.length, 1);
  assert.equal(directResults[0].matchType, "reference");
  assert.equal(directResults[0].verse.reference, "Romans 8:28");

  const phraseResults = await searchScripture({ language: "en", query: "for God so loved the world", versionId: "kjv" });
  assert.equal(phraseResults[0]?.matchType, "text");
  assert.equal(phraseResults[0]?.verse.reference, "John 3:16");

  const loveIsPatientResults = await searchScripture({ language: "en", query: "love is patient", versionId: "kjv", limit: 8 });
  assert.ok(loveIsPatientResults.every((result) => result.matchType === "text"), "English phrase queries must stay in text search");

  const partialResults = await searchScripture({ language: "sv", query: "bekymra morgondagen", versionId: "reformationsbibeln2026" });
  assert.equal(partialResults[0]?.matchType, "text");
  assert.equal(partialResults[0]?.verse.reference, "Matthew 6:34");

  const swedishPhraseResults = await searchScripture({ language: "sv", query: "så älskade Gud världen", versionId: "reformationsbibeln2026" });
  assert.equal(swedishPhraseResults[0]?.matchType, "text");
  assert.equal(swedishPhraseResults[0]?.verse.reference, "John 3:16");

  const wordingMismatchResults = await searchScripture({ language: "en", query: "do not worry tomorrow", versionId: "kjv", limit: 5 });
  assert.ok(wordingMismatchResults.every((result) => result.matchType === "text"), "Non-reference prose must use local text search");

  assert.deepEqual(await searchScripture({ language: "en", query: "", versionId: "kjv" }), []);
  assert.deepEqual(await searchScripture({ language: "en", query: "Fakebook 3:16", versionId: "kjv" }), []);
  assert.deepEqual(await searchScripture({ language: "en", query: "random text with no result", versionId: "kjv" }), []);

  const limitedResults = await searchScripture({ language: "en", limit: 8, query: "God", versionId: "kjv" });
  assert.equal(limitedResults.length, 8);
  assert.ok(limitedResults.every((result) => result.matchType === "text"));

  assert.deepEqual(await searchScripture({ language: "en", limit: 0, query: "John 3:16", versionId: "kjv" }), []);

  console.log("Bible search validation passed.");
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
