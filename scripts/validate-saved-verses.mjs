import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "koino-saved-verses-"));
const bundlePath = path.join(temporaryDirectory, "saved-verses.mjs");

try {
  await build({
    bundle: true,
    entryPoints: [path.join(projectRoot, "state", "saved-verses.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const { normalizeSavedVerseRecords, savedVerseIdentity, savedVerseStorageId } = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );

  const verse = {
    book: "Philippians",
    chapter: 4,
    endVerse: 4,
    reference: "Philippians 4:4",
    startVerse: 4,
    text: "Rejoice in the Lord always.",
    translation: "Reformationsbibeln 2026",
  };

  const identity = savedVerseIdentity(verse);
  assert.ok(identity, "a complete verse has an identity");
  assert.equal(savedVerseIdentity({ ...verse, book: "  philippians  ", text: "changed" }), identity, "book case and spacing do not change identity");
  assert.equal(savedVerseIdentity({ ...verse, startVerse: 5, endVerse: 5, reference: "Philippians 4:5" }) === identity, false, "different verses have different identities");
  assert.equal(savedVerseIdentity({ ...verse, translation: "KJV" }) === identity, true, "translation does not change identity");
  assert.equal(savedVerseIdentity({ ...verse, startVerse: 5, endVerse: 4 }) , savedVerseIdentity({ ...verse, startVerse: 4, endVerse: 5 }), "reversed ranges normalize to the same passage");

  const storageId = savedVerseStorageId(verse);
  assert.ok(storageId?.startsWith("passage_"), "storage IDs are deterministic passage keys");
  assert.doesNotMatch(storageId, /[.#$\[\]/]/, "storage IDs are Firebase-safe");
  assert.equal(savedVerseStorageId({ ...verse, book: "  philippians  " }), storageId, "storage IDs follow the normalized identity");

  const older = { ...verse, id: "older", savedAt: "2026-01-01T00:00:00.000Z", text: "older" };
  const newer = { ...verse, id: "newer", savedAt: "2026-02-01T00:00:00.000Z", text: "newer" };
  const unknown = { reference: "not a reference", savedAt: "2026-01-01T00:00:00.000Z", text: "legacy" };
  const normalized = normalizeSavedVerseRecords({
    FirebaseKeyOlder: older,
    FirebaseKeyNewer: newer,
    FirebaseKeyUnknown: unknown,
  });

  assert.equal(normalized.verses.length, 2, "one record per identity is kept plus unidentifiable records");
  assert.equal(normalized.verses.find((item) => item.text === "newer")?.id, "FirebaseKeyNewer", "the newest duplicate is kept");
  assert.deepEqual(normalized.duplicateStorageKeys, ["FirebaseKeyOlder"], "the older duplicate is reported for cleanup");
  assert.equal(normalized.verses.find((item) => item.text === "legacy")?.id, "FirebaseKeyUnknown", "unidentifiable legacy records are preserved");

  const crossTranslation = normalizeSavedVerseRecords({
    Sorb: { ...verse, id: "Sorb", savedAt: "2026-01-01T00:00:00.000Z", text: "Rejoice always.", translation: "KJV" },
    Srb: { ...verse, id: "Srb", savedAt: "2026-02-01T00:00:00.000Z", text: "Gläd er alltid.", translation: "Reformationsbibeln 2026" },
  });
  assert.equal(crossTranslation.verses.length, 1, "the same passage in two translations is one bookmark");
  assert.equal(crossTranslation.verses[0].text, "Gläd er alltid.", "the newest wording is shown");
  assert.equal(crossTranslation.verses[0].savedAt, "2026-01-01T00:00:00.000Z", "the earliest save date is kept");
  assert.deepEqual(crossTranslation.duplicateStorageKeys, ["Sorb"], "the older translation key is cleaned up");

  assert.deepEqual(normalizeSavedVerseRecords(null), { duplicateStorageKeys: [], verses: [] }, "empty data is safe");
  console.log("Saved verse validation passed.");
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
