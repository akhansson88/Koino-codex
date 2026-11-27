import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "koino-bookmarks-"));
const bundlePath = path.join(temporaryDirectory, "bookmarks.mjs");

try {
  await build({
    bundle: true,
    entryPoints: [path.join(projectRoot, "state", "bookmarks.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const {
    bookmarkCollectionCount,
    bookmarkCollectionName,
    bookmarkMatchesQuery,
    createBookmarkCollectionId,
    formatBookmarkCsv,
    formatBookmarkMarkdown,
    normalizeBookmarkText,
    ribbonStorageId,
    setBookmarkBookOrder,
    sortBookmarkCollections,
    sortBookmarks,
  } = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);

  setBookmarkBookOrder(["Genesis", "Psalms", "Philippians"]);

  const verse = {
    book: "Philippians",
    chapter: 4,
    startVerse: 13,
    endVerse: 13,
    reference: "Philippians 4:13",
    text: "I can do all things through Christ who strengthens me.",
    translation: "KJV",
    savedAt: "2026-01-01T00:00:00.000Z",
  };
  const psalm = {
    book: "Psalms",
    chapter: 23,
    startVerse: 1,
    endVerse: 3,
    reference: "Psalms 23:1-3",
    text: "The Lord is my shepherd.",
    translation: "KJV",
    savedAt: "2026-02-01T00:00:00.000Z",
  };

  assert.equal(normalizeBookmarkText("Tröst & bön"), "trost bon");
  assert.equal(bookmarkMatchesQuery(verse, "all things"), true);
  assert.equal(bookmarkMatchesQuery(verse, "filipperbrevet 4:13"), false);
  assert.equal(bookmarkMatchesQuery({ ...verse, note: "Bär den i bönen" }, "bonen"), true);
  assert.equal(bookmarkMatchesQuery(verse, "psalm"), false);

  assert.deepEqual(sortBookmarks([verse, psalm], "canonical").map((item) => item.reference), [
    "Psalms 23:1-3",
    "Philippians 4:13",
  ]);
  assert.deepEqual(sortBookmarks([psalm, verse], "recent").map((item) => item.reference), [
    "Psalms 23:1-3",
    "Philippians 4:13",
  ]);

  assert.equal(bookmarkCollectionCount([verse, { ...psalm, collectionId: "prayer" }], "prayer"), 1);
  assert.equal(bookmarkCollectionCount([verse, psalm], null), 2);
  assert.equal(bookmarkCollectionName([{ id: "prayer", name: "Bön" }], "prayer"), "Bön");

  assert.equal(createBookmarkCollectionId("Bön & tröst", []), "bon-trost");
  assert.equal(createBookmarkCollectionId("Bön", [{ id: "bon" }]), "bon-2");
  assert.equal(ribbonStorageId("Philippians", 4, 13), "ribbon_philippians_4_13");

  const collections = [
    { id: "prayer", name: "Bön", color: "rose", sortOrder: 2, createdAt: "", updatedAt: "" },
    { id: "comfort", name: "Tröst", color: "clay", sortOrder: 1, createdAt: "", updatedAt: "" },
  ];
  assert.deepEqual(sortBookmarkCollections(collections).map((item) => item.id), ["comfort", "prayer"]);

  const markdown = formatBookmarkMarkdown([{ ...verse, note: "Bär den här.", collectionId: "prayer" }, { ...psalm, collectionId: "comfort" }], collections);
  assert.match(markdown, /# Mina bokmärken/);
  assert.match(markdown, /## Tröst/);
  assert.match(markdown, /## Bön/);
  assert.match(markdown, /### Philippians 4:13/);
  assert.match(markdown, /\*\*Anteckning:\*\* Bär den här\./);

  const csv = formatBookmarkCsv([{ ...verse, note: 'En "anteckning", med komma' }], collections);
  assert.match(csv, /^"reference","book"/);
  assert.match(csv, /"En ""anteckning"", med komma"/);

  console.log("Bookmark validation passed.");
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
