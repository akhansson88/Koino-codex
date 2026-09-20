import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "koino-bible-selection-"));
const bundlePath = path.join(temporaryDirectory, "bible-verse-selection.mjs");

try {
  await build({
    bundle: true,
    entryPoints: [path.join(projectRoot, "features", "bible-verse-selection.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const { nextBibleVerseSelection } = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);

  assert.deepEqual(nextBibleVerseSelection({}, 16), { start: 16, end: 16 });
  assert.deepEqual(nextBibleVerseSelection({ start: 16, end: 16 }, 18), { start: 16, end: 18 });
  assert.deepEqual(nextBibleVerseSelection({ start: 18, end: 18 }, 16), { start: 16, end: 18 });
  assert.deepEqual(nextBibleVerseSelection({ start: 16, end: 16 }, 16), {});
  assert.deepEqual(nextBibleVerseSelection({ start: 16, end: 18 }, 20), { start: 20, end: 20 });

  console.log("Bible verse selection validation passed.");
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
