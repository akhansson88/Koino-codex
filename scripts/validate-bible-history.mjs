import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: [new URL("../features/bible-history.ts", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});
const { initialBibleHistory, moveBibleHistory, readBibleHistory, updateBibleHistoryPosition, visitBiblePosition } =
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);

const at = (verse) => ({ book: "Philippians", chapter: 4, verse });
let history = initialBibleHistory(at(1));
assert.equal(moveBibleHistory(history, -1), history);
history = visitBiblePosition(history, at(2));
assert.equal(visitBiblePosition(history, at(2)), history);
history = visitBiblePosition(history, { book: "John", chapter: 3, verse: 16 });
history = moveBibleHistory(history, -1);
assert.deepEqual(history.entries[history.index], at(2));
history = updateBibleHistoryPosition(history, at(5));
assert.deepEqual(history.entries[history.index], at(5));
history = moveBibleHistory(history, 1);
assert.deepEqual(history.entries[history.index], { book: "John", chapter: 3, verse: 16 });
assert.equal(moveBibleHistory(history, 1), history);
history = moveBibleHistory(history, -1);
history = visitBiblePosition(history, { book: "Romans", chapter: 8, verse: 1 });
assert.equal(history.entries.length, 3);
assert.deepEqual(history.entries[2], { book: "Romans", chapter: 8, verse: 1 });
assert.equal(moveBibleHistory(history, 1), history);

// A reader can scroll within a chapter, jump elsewhere, and retrace both stops.
let reading = updateBibleHistoryPosition(initialBibleHistory(at(1)), at(7));
reading = visitBiblePosition(reading, at(12));
reading = visitBiblePosition(reading, { book: "John", chapter: 3, verse: 16 });
reading = moveBibleHistory(reading, -1);
assert.deepEqual(reading.entries[reading.index], at(12));
reading = moveBibleHistory(reading, -1);
assert.deepEqual(reading.entries[reading.index], at(7));
reading = moveBibleHistory(reading, 1);
reading = visitBiblePosition(reading, { book: "Romans", chapter: 8, verse: 1 });
assert.deepEqual(reading.entries.map((entry) => entry.book), ["Philippians", "Philippians", "Romans"]);

history = initialBibleHistory(at(1));
for (let verse = 2; verse <= 12; verse++) history = visitBiblePosition(history, at(verse));
assert.equal(history.entries.length, 10);
assert.deepEqual(history.entries[0], at(3));
assert.equal(history.index, 9);
assert.deepEqual(readBibleHistory(JSON.parse(JSON.stringify(history)), at(1)), history);
assert.deepEqual(readBibleHistory(undefined, at(1)), initialBibleHistory(at(1)));
assert.deepEqual(readBibleHistory({ entries: [{ book: "No book", chapter: 1, verse: 1 }], index: 0 }, at(1)), initialBibleHistory(at(1)));
assert.deepEqual(readBibleHistory({ entries: [at(1)], index: 2 }, at(1)), initialBibleHistory(at(1)));
const swedishPsalm = { book: "Psalms", chapter: 3, verse: 9 };
const swedishHistory = initialBibleHistory(swedishPsalm);
assert.deepEqual(readBibleHistory(swedishHistory, at(1), "reformationsbibeln2026"), swedishHistory, "Swedish-only verse numbers survive stored history");
assert.deepEqual(readBibleHistory(swedishHistory, at(1), "kjv"), initialBibleHistory(at(1)), "KJV cannot restore a verse absent from its translation");
console.log("Bible navigation history validation passed.");
