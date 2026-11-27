import assert from "node:assert/strict";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["features/bible-reader/split-anchor.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { anchorAtOffset, composeAnchor, offsetForAnchor, resolveAnchor } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

const layout = {
  verses: [1, 2, 3, 4],
  tops: [30, 130, 230, 330],
  heights: [100, 100, 100, 100],
};

// The line sits a third of the way through verse 2.
assert.deepEqual(anchorAtOffset(layout, 140, 20), { verse: 2, fraction: 0.3 });
// Above the first verse clamps to its top.
assert.deepEqual(anchorAtOffset(layout, 0, 5), { verse: 1, fraction: 0 });
// Below the last verse clamps to its end.
assert.deepEqual(anchorAtOffset(layout, 500, 20), { verse: 4, fraction: 1 });

// The inverse round-trips through the same line.
for (const anchor of [{ verse: 1, fraction: 0 }, { verse: 2, fraction: 0.5 }, { verse: 4, fraction: 1 }]) {
  const offset = offsetForAnchor(layout, anchor, 20);
  assert.deepEqual(anchorAtOffset(layout, offset, 20), anchor);
}

const link = (overrides = {}) => ({
  approximate: false,
  confidence: 0.9,
  crossChapter: false,
  sourceEnd: 1,
  sourceStart: 0,
  targetChapter: 3,
  targetEnd: 1,
  targetStart: 0,
  targetVerse: 2,
  ...overrides,
});

// A title verse maps to the top of the first content verse and is approximate.
const titleLinks = new Map([[1, [link({ approximate: true, targetEnd: 0, targetVerse: 1 })]]]);
assert.deepEqual(resolveAnchor(titleLinks, { verse: 1, fraction: 0.4 }), {
  approximate: true,
  chapter: 3,
  crossChapter: false,
  fraction: 0,
  verse: 1,
});

// KJV 13:13 maps into the second half of the merged Swedish v12.
const mergedLinks = new Map([[13, [link({ sourceStart: 0.45, targetChapter: 1, targetStart: 0.45, targetVerse: 12 })]]]);
const merged = resolveAnchor(mergedLinks, { verse: 13, fraction: 0.7 });
assert.equal(merged.verse, 12);
assert.ok(merged.fraction > 0.45 && merged.fraction < 1, `merged fraction ${merged.fraction}`);

// A source verse that is one half of a target verse keeps the sub-verse ratio.
const splitLinks = new Map([[14, [link({ targetChapter: 1, targetStart: 0.5, targetVerse: 14 })]]]);
const split = resolveAnchor(splitLinks, { verse: 14, fraction: 0.25 });
assert.equal(split.verse, 14);
assert.ok(Math.abs(split.fraction - 0.625) < 0.001, `split fraction ${split.fraction}`);

// A cross-chapter correspondence is marked so the UI can clamp and explain it.
const crossLinks = new Map([[18, [link({ crossChapter: true, targetChapter: 13, targetEnd: 1, targetStart: 0, targetVerse: 1 })]]]);
const cross = resolveAnchor(crossLinks, { verse: 18, fraction: 0 });
assert.equal(cross.chapter, 13);
assert.equal(cross.crossChapter, true);
assert.equal(cross.approximate, true);

// Composition through the pivot keeps the fraction and flags approximation.
const first = { approximate: false, chapter: 1, crossChapter: false, fraction: 0.6, verse: 13 };
const second = composeAnchor(first, () => ({ approximate: false, chapter: 1, crossChapter: false, fraction: 0.4, verse: 12 }));
assert.equal(second.verse, 12);
assert.equal(second.fraction, 0.4);
assert.equal(second.approximate, false);

// Missing data never invents a target.
assert.equal(resolveAnchor(new Map(), { verse: 1, fraction: 0 }), undefined);

console.log("Split anchor OK — line anchoring, fractions, titles, merges, splits, cross-chapter and composition.");
