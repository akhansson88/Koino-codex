import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const database = globalThis.__readerPreferencesDatabase = { value: null, listeners: new Set() };
const mocks = {
  "react-native": `export const Platform = { OS: "android" };`,
  "@/features/bible-kjv": `
    export { normalizeBiblePosition } from "@/features/bible-canon";
    export { isBibleVersionId } from "@/features/bible-versions";
  `,
  "@/features/bible-preferences": `export const defaultBibleVersionId = "reformationsbibeln2026";`,
  "@/state/store/firebase": `export const database = {}, emulatorMode = false;`,
  "@/state/encryption/database": `
    const db = globalThis.__readerPreferencesDatabase;
    export const ref = (_db, path) => path;
    const snapshot = value => ({ val: () => value });
    export const get = async () => snapshot(db.value);
    export const onValue = (_ref, listener) => {
      db.listeners.add(listener); listener(snapshot(db.value));
      return () => db.listeners.delete(listener);
    };
    export const runTransaction = async (_ref, update) => {
      const candidate = update(db.value);
      if (candidate !== undefined) {
        db.value = candidate;
        for (const listener of db.listeners) listener(snapshot(db.value));
      }
      return { snapshot: snapshot(db.value) };
    };
  `,
};
async function load(file) {
  const result = await build({ entryPoints: [file], bundle: true, format: "cjs", platform: "node", write: false,
    plugins: [{ name: "reader-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], loader: "js", resolveDir: process.cwd() }));
    }}],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

try {
  const { parsePreferences } = await load("features/bible-reader/preferences.ts");
  const sync = await load("features/bible-reader/preferences-sync.ts");
  for (const value of [null, "{", "{}", '{"flowingParagraphText":"true"}', '{"flowingParagraphText":1}']) {
    assert.equal(parsePreferences(value).flowingParagraphText, false, "legacy and invalid preferences retain verse rows");
  }
  for (const flowingParagraphText of [true, false]) {
    const preferences = { ...parsePreferences(null), appTheme: "dark", flowingParagraphText };
    const candidate = { preferences, updatedAt: flowingParagraphText ? 10 : 20 };
    const stored = sync.serializeStoredBibleReaderPreferences(candidate);
    assert.deepEqual(sync.readStoredBibleReaderPreferences(stored), candidate, "local restart restores the layout");
    assert.equal(sync.cloudBibleReaderPreferences(candidate).appTheme, undefined);
    const received = [];
    const stop = sync.listenForCloudBibleReaderPreferences("user", value => received.push(value), error => { throw error; });
    await sync.saveCloudBibleReaderPreferences("user", candidate);
    assert.equal(received.at(-1).preferences.flowingParagraphText, flowingParagraphText, "second session receives layout changes");
    assert.equal((await sync.fetchCloudBibleReaderPreferences("user")).preferences.flowingParagraphText, flowingParagraphText);
    stop();
    assert.equal(database.listeners.size, 0);
  }
  await sync.saveCloudBibleReaderPreferences("user", { preferences: { ...parsePreferences(null), flowingParagraphText: true }, updatedAt: 19 });
  assert.equal(database.value.flowingParagraphText, false, "stale cloud changes cannot overwrite newer choices");
  const older = { ...database.value }; delete older.flowingParagraphText;
  assert.equal(sync.parseCloudBibleReaderPreferences(older).preferences.flowingParagraphText, false);
  assert.notEqual(sync.readerPreferencesSignature(parsePreferences(null)),
    sync.readerPreferencesSignature({ ...parsePreferences(null), flowingParagraphText: true }), "layout changes trigger persistence");

  const { groupParagraphVerses, paragraphProjection, paragraphVerseBounds, paragraphOpeningSplit,
    paragraphProjectionSlice, paragraphFragments, mergeParagraphVerseBounds } = await load("features/bible-reader/paragraph-layout.ts");
  const verses = Array.from({ length: 6 }, (_, index) => ({ verse: index + 1, reference: `John 1:${index + 1}`, text: `Verse ${index + 1}.`, footnotes: [] }));
  const groups = groupParagraphVerses(verses, [{ beforeVerse: 3, text: "Heading" }], [{ kind: "start", verse: 4 }, { kind: "finish", verse: 5 }]);
  assert.deepEqual(groups.map(items => items.map(item => item.verse)), [[1, 2], [3], [4, 5], [6]]);
  assert.deepEqual(groupParagraphVerses([], [], []), []);
  assert.equal(groupParagraphVerses(verses, [], []).length, 1);
  const projection = paragraphProjection([
    { ...verses[0], text: "Hello* world.", footnotes: [{ marker: "*", text: "Note" }] },
    { ...verses[1], text: "Next verse.", footnotes: [{ marker: "**", text: "Appended note" }] },
  ], true);
  assert.equal(projection.text, "\uFFFCHello* world. \uFFFCNext verse. **");
  assert.deepEqual(paragraphVerseBounds(projection, [
    { text: "\uFFFCHello*", y: 0, height: 24 },
    { text: "world. \uFFFCNext", y: 24, height: 24 },
    { text: "verse. **", y: 48, height: 24 },
  ]), [{ verse: 1, y: 0, height: 48 }, { verse: 2, y: 24, height: 48 }], "inline objects, shared lines and appended footnotes retain verse bounds");
  const withoutNumbers = paragraphProjection(verses.slice(0, 2), false);
  assert.equal(withoutNumbers.text, "Verse 1. Verse 2.");
  assert.deepEqual(paragraphVerseBounds(withoutNumbers, [{ text: "Verse 1. Verse 2.", y: 0, height: 24 }]),
    [{ verse: 1, y: 0, height: 24 }, { verse: 2, y: 0, height: 24 }]);
  assert.deepEqual(paragraphVerseBounds(withoutNumbers, [
    { text: "Verse 1. ", y: 0, height: 24 }, { text: "Verse 2.", y: 24, height: 24 },
  ]), [{ verse: 1, y: 0, height: 24 }, { verse: 2, y: 24, height: 24 }], "font reflow recalculates line bounds");

  const wrappedProjection = paragraphProjection([
    { ...verses[0], text: "Alpha beta** gamma delta epsilon", footnotes: [{ marker: "**", text: "Note" }] },
    { ...verses[1], text: "Second verse." },
  ], true);
  const split = paragraphOpeningSplit(wrappedProjection, [
    { text: "\uFFFCAlpha beta", y: 0, height: 29 },
    { text: "*", y: 29, height: 29 },
    { text: "* gamma delta epsilon \uFFFCSecond verse.", y: 58, height: 29 },
  ], 50);
  assert.equal(wrappedProjection.text.slice(0, split.openingEnd), "\uFFFCAlpha beta*");
  assert.equal(wrappedProjection.text.slice(split.continuationStart), "* gamma delta epsilon \uFFFCSecond verse.");
  const openingFragments = paragraphFragments(wrappedProjection, 0, split.openingEnd);
  const tailFragments = paragraphFragments(wrappedProjection, split.continuationStart, wrappedProjection.text.length);
  assert.equal(openingFragments[0].showNumber, true);
  assert.equal(tailFragments[0].showNumber, false, "a verse crossing the wrap boundary must not repeat its number");
  assert.equal(tailFragments[1].showNumber, true);
  assert.equal(openingFragments[0].textEnd, tailFragments[0].textStart, "the split footnote keeps every source character exactly once");
  const merged = mergeParagraphVerseBounds([
    paragraphVerseBounds(paragraphProjectionSlice(wrappedProjection, 0, split.openingEnd), [
      { text: "\uFFFCAlpha beta", y: 8, height: 29 }, { text: "*", y: 37, height: 29 },
    ]),
    paragraphVerseBounds(paragraphProjectionSlice(wrappedProjection, split.continuationStart, wrappedProjection.text.length), [
      { text: "* gamma delta epsilon \uFFFCSecond verse.", y: 66, height: 29 },
    ]),
  ]);
  assert.deepEqual(merged, [{ verse: 1, y: 8, height: 87 }, { verse: 2, y: 66, height: 29 }], "a split verse has one complete scroll/focus rectangle");
  const unicode = paragraphProjection([{ ...verses[0], text: "A🙂  \nB" }], true);
  const unicodeSplit = paragraphOpeningSplit(unicode, [
    { text: "\uFFFCA🙂", y: 0, height: 29 }, { text: "B", y: 29, height: 29 },
  ], 20);
  assert.equal(unicode.text.slice(0, unicodeSplit.openingEnd), "\uFFFCA🙂");
  assert.equal(unicode.text.slice(unicodeSplit.continuationStart), "B", "wrapped whitespace does not add a blank continuation line");

  // Esra 6 has no subtitles: all 22 verses, including its final footnote, share
  // one native text node. Exercise reflow through the real chapter's ending.
  const bible = JSON.parse(readFileSync(new URL("../assets/bible/reformationsbibeln.json", import.meta.url), "utf8"));
  const ezra = bible.books.find(book => book.name === "Esra").chapters.find(chapter => chapter.number === 6);
  const ezraVerses = ezra.verses.map(item => ({ ...item, verse: item.number, reference: `Ezra 6:${item.number}` }));
  assert.equal(groupParagraphVerses(ezraVerses, ezra.subtitles, []).length, 1);
  for (const showNumbers of [true, false]) {
    const chapter = paragraphProjection(ezraVerses, showNumbers);
    assert.equal((chapter.text.match(/\uFFFC/g) ?? []).length, showNumbers ? 22 : 0);
    assert.ok(chapter.text.endsWith("deras arbete på Guds, Israels Guds, hus."));
    assert.ok(chapter.text.includes("understödde*"), "the last verse's inline footnote is retained");
    assert.equal(chapter.ranges.at(-1).end, chapter.text.length);
    for (const fontSize of [16, 18, 28]) {
      for (const availableWidth of [230, 340, 620]) {
        const capacity = Math.floor(availableWidth / (fontSize * 0.6));
        const wrapped = chapter.text.match(new RegExp(`.{1,${capacity}}`, "gu"));
        const lineHeight = Math.round(fontSize * 1.62);
        const lines = wrapped.map((text, index) => ({ text, y: 0.25 + index * lineHeight, height: lineHeight }));
        const measured = paragraphVerseBounds(chapter, lines);
        assert.deepEqual(measured.map(item => item.verse), ezraVerses.map(item => item.verse), "reflow retains every verse");
        assert.equal(measured.at(-1).verse, 22);
        assert.equal(measured.at(-1).y + measured.at(-1).height, lines.at(-1).y + lines.at(-1).height,
          "the final verse includes the entire last native line, also at large font sizes");
      }
    }
  }
  console.log("Bible reading layout validation passed: preferences, chapter wrapping, split verses/footnotes, inline numbers, and complete Esra 6 geometry across font sizes and widths.");
} finally {
  delete globalThis.__readerPreferencesDatabase;
}
