import assert from "node:assert/strict";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["state/reading-mirror-model.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const {
  MIRROR_LIVE_WINDOW_MS,
  followerPath,
  mirrorHighlightsFor,
  mirrorPath,
  mirrorSelectedVerses,
  mirrorStatus,
  parseMirrorRecord,
} = model;

const now = Date.UTC(2026, 10, 25, 22, 0, 0);
const secondsAgo = (seconds) => now - seconds * 1000;

const base = {
  anchorOffset: 0.25,
  anchorVerse: 13,
  at: secondsAgo(2),
  book: "Philippians",
  chapter: 4,
  verse: 13,
  versionId: "reformationsbibeln2026",
};

const parsed = parseMirrorRecord(base);
assert.equal(parsed.anchorVerse, 13);
assert.equal(parsed.anchorOffset, 0.25);
assert.equal(parsed.verse, 13);

// A malformed core is ignored rather than rendered.
for (const broken of [
  null,
  {},
  { ...base, book: "" },
  { ...base, chapter: 0 },
  { ...base, verse: 0 },
  { ...base, anchorVerse: 0 },
  { ...base, at: "now" },
  { ...base, book: "x".repeat(41) },
]) {
  assert.equal(parseMirrorRecord(broken), undefined, `Rejects ${JSON.stringify(broken)}`);
}

// The anchor offset is clamped, never trusted as a pixel value.
assert.equal(parseMirrorRecord({ ...base, anchorOffset: 4 }).anchorOffset, 1);
assert.equal(parseMirrorRecord({ ...base, anchorOffset: -1 }).anchorOffset, 0);
assert.equal(parseMirrorRecord({ ...base, anchorOffset: Number.NaN }).anchorOffset, 0);
assert.equal(parseMirrorRecord({ ...base, anchorOffset: "half" }).anchorOffset, 0);

// Highlights accept only real hex colours, so nothing else can reach the style.
assert.deepEqual(
  parseMirrorRecord({
    ...base,
    highlights: { 13: "#F2C94C", 14: "red", 15: "#12345", 16: "#abcdef", 999: "#ffffff" },
  }).highlights,
  { 13: "#f2c94c", 16: "#abcdef" },
);
assert.equal(parseMirrorRecord({ ...base, highlights: {} }).highlights, undefined);

// A selection is normalised and bounded.
assert.deepEqual(parseMirrorRecord({ ...base, selection: { start: 16, end: 14 } }).selection, { start: 14, end: 16 });
assert.deepEqual(parseMirrorRecord({ ...base, selection: { start: 0, end: 14 } }).selection, undefined);
assert.deepEqual(parseMirrorRecord({ ...base, selection: { start: 1, end: 500 } }).selection, undefined);

// Only the mirrored chapter gets the other member's highlights or selection.
assert.deepEqual(mirrorHighlightsFor(parsed, "Philippians", 4), {});
assert.deepEqual(
  mirrorHighlightsFor(parseMirrorRecord({ ...base, highlights: { 13: "#f2c94c" } }), "Philippians", 4),
  { 13: "#f2c94c" },
);
assert.deepEqual(mirrorHighlightsFor(parsed, "Romans", 8), {});
assert.deepEqual(
  mirrorSelectedVerses(parseMirrorRecord({ ...base, selection: { start: 13, end: 15 } }), "Philippians", 4),
  [13, 14, 15],
);
assert.deepEqual(mirrorSelectedVerses(parsed, "Romans", 8), []);
assert.deepEqual(
  mirrorSelectedVerses(parseMirrorRecord({ ...base, selection: { start: 1, end: 200 } }), "Philippians", 4).length,
  200,
  "A selection is capped at 200 verses",
);

// Freshness: live, stale, then ended; a connecting follower is not ended early.
assert.equal(MIRROR_LIVE_WINDOW_MS, 20_000);
assert.equal(mirrorStatus(parseMirrorRecord(base), now, now - 1000), "live");
assert.equal(mirrorStatus(parseMirrorRecord({ ...base, at: secondsAgo(30) }), now, now - 60_000), "stale");
assert.equal(mirrorStatus(parseMirrorRecord({ ...base, at: secondsAgo(61) }), now, now - 90_000), "ended");
assert.equal(mirrorStatus(undefined, now, now - 2000), "connecting");
assert.equal(mirrorStatus(undefined, now, now - 9000), "ended");

// The follower and the stream live on their own paths, never inside the
// sharer's reading record, so a follower has no write path to it at all.
assert.equal(mirrorPath("g1", "u2"), "groupReadingLive/g1/u2");
assert.equal(followerPath("g1", "u2", "u1"), "groupReadingFollowers/g1/u2/u1");

console.log("reading mirror model: all checks passed");
