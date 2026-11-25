import assert from "node:assert/strict";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["state/reading-model.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const {
  READING_LIVE_WINDOW_MS,
  READING_RECENT_WINDOW_MS,
  READING_RETENTION_MS,
  compareReadingEntries,
  deriveGroupReading,
  parseReadingRecord,
  readingMarkersForChapter,
} = model;

const now = Date.UTC(2026, 10, 25, 21, 0, 0);
const secondsAgo = (seconds) => now - seconds * 1000;

assert.equal(READING_LIVE_WINDOW_MS, 2 * 60_000);
assert.equal(READING_RECENT_WINDOW_MS, 30 * 60_000);
assert.equal(READING_RETENTION_MS, 24 * 60 * 60_000);

// A verse-level record keeps its verse; a chapter-level one has none.
assert.deepEqual(
  parseReadingRecord({ book: "Philippians", chapter: 4, verse: 13, scope: "verse", at: secondsAgo(5) }),
  { book: "Philippians", chapter: 4, verse: 13, scope: "verse", at: secondsAgo(5) },
);
assert.deepEqual(
  parseReadingRecord({ book: "Philippians", chapter: 4, scope: "chapter", at: secondsAgo(5) }),
  { book: "Philippians", chapter: 4, scope: "chapter", at: secondsAgo(5) },
);

// Anything malformed, or a verse-scope record without a verse, is ignored.
assert.equal(parseReadingRecord(null), undefined);
assert.equal(parseReadingRecord({}), undefined);
assert.equal(parseReadingRecord({ book: "", chapter: 4, scope: "verse", verse: 1, at: secondsAgo(5) }), undefined);
assert.equal(parseReadingRecord({ book: "Philippians", chapter: 0, scope: "verse", verse: 1, at: secondsAgo(5) }), undefined);
assert.equal(parseReadingRecord({ book: "Philippians", chapter: 4, scope: "verse", at: secondsAgo(5) }), undefined);
assert.equal(parseReadingRecord({ book: "Philippians", chapter: 4, scope: "all", verse: 1, at: secondsAgo(5) }), undefined);
assert.equal(parseReadingRecord({ book: "Philippians", chapter: 4, scope: "verse", verse: 1 }), undefined);

const presence = {
  anna: { status: "online", lastSeen: now },
  bo: { status: "inactive", lastSeen: secondsAgo(120) },
  cissi: { status: "offline", lastSeen: secondsAgo(600) },
  david: { status: "hidden" },
};

const snapshot = {
  anna: { book: "Philippians", chapter: 4, verse: 13, scope: "verse", at: secondsAgo(20) },
  bo: { book: "Romans", chapter: 8, scope: "chapter", at: secondsAgo(60) },
  cissi: { book: "Psalms", chapter: 23, verse: 1, scope: "verse", at: secondsAgo(30) },
  david: { book: "John", chapter: 1, verse: 1, scope: "verse", at: secondsAgo(10) },
  erik: { book: "John", chapter: 2, verse: 1, scope: "verse", at: secondsAgo(10) },
};

const entries = deriveGroupReading(snapshot, presence, now);
assert.deepEqual(entries.map((entry) => entry.userId), ["anna", "bo"]);
assert.equal(entries[0].status, "live");
assert.equal(entries[1].status, "recent");

// A live member whose record went stale is not shown at all.
assert.deepEqual(
  deriveGroupReading({ anna: { book: "Philippians", chapter: 4, verse: 1, scope: "verse", at: secondsAgo(180) } }, presence, now),
  [],
);

// An inactive member whose record is older than the recent window disappears.
assert.deepEqual(
  deriveGroupReading({ bo: { book: "Romans", chapter: 8, scope: "chapter", at: secondsAgo(31 * 60) } }, presence, now),
  [],
);

// The member's own record can be excluded in one pass.
assert.deepEqual(deriveGroupReading(snapshot, presence, now, "anna").map((entry) => entry.userId), ["bo"]);

// Same-chapter readers come before others, then the closest verse.
const sorted = [
  { userId: "z", book: "Romans", chapter: 8, verse: 2, scope: "verse", status: "live", at: secondsAgo(5) },
  { userId: "a", book: "Philippians", chapter: 4, verse: 20, scope: "verse", status: "live", at: secondsAgo(5) },
  { userId: "b", book: "Philippians", chapter: 4, verse: 14, scope: "verse", status: "live", at: secondsAgo(5) },
];
const ordered = [...sorted].sort((left, right) =>
  compareReadingEntries(left, right, { book: "Philippians", chapter: 4, verse: 13 }));
assert.deepEqual(ordered.map((entry) => entry.userId), ["b", "a", "z"]);

// Margin markers only exist for live, verse-level records in the open chapter.
assert.deepEqual(
  readingMarkersForChapter([
    { userId: "anna", book: "Philippians", chapter: 4, verse: 13, scope: "verse", status: "live", at: secondsAgo(5) },
    { userId: "bo", book: "Philippians", chapter: 4, scope: "chapter", status: "live", at: secondsAgo(5) },
    { userId: "cissi", book: "Philippians", chapter: 4, verse: 2, scope: "verse", status: "recent", at: secondsAgo(600) },
    { userId: "david", book: "Romans", chapter: 8, verse: 1, scope: "verse", status: "live", at: secondsAgo(5) },
  ], "Philippians", 4),
  [{ userId: "anna", verse: 13 }],
);

console.log("reading model: all checks passed");
