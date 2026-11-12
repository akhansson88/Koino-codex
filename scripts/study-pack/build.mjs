#!/usr/bin/env node
/** Build the immutable offline dictionary/commentary study index. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCES = path.join(ROOT, "assets/bible/study/sources");
const ASSETS = path.join(ROOT, "assets/bible/study");
const lock = JSON.parse(readFileSync(path.join(SOURCES, "sources.lock.json"), "utf8"));
const commentaryLock = JSON.parse(readFileSync(path.join(SOURCES, "matthew-henry.lock.json"), "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = (file) => hash(readFileSync(file));

function clean(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKey(value) {
  const tokens = value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...tokens].sort().join(" ");
}

const entries = [];
let replacementCharacters = 0;
for (const file of lock.files) {
  const sourcePath = path.join(SOURCES, "easton", file.file);
  if (fileHash(sourcePath) !== file.sha256) throw new Error(`Unverified study source ${file.file}`);
  const dictionary = JSON.parse(readFileSync(sourcePath, "utf8"));
  for (const value of Object.values(dictionary)) {
    if (!value || typeof value !== "object" || typeof value.name !== "string" || !Array.isArray(value.definitions)) continue;
    const text = clean(value.definitions.map((definition) => definition?.text ?? "").filter(Boolean).join("\n\n"));
    if (!text) continue;
    const refs = [...new Set((value.scripture_refs ?? []).map((ref) => clean(ref?.reference)).filter(Boolean))].join("; ");
    replacementCharacters += (text.match(/\uFFFD/g) ?? []).length;
    const title = clean(value.name);
    entries.push({
      kind: "dictionary",
      title,
      title_key: titleKey(title),
      slug: clean(value.slug || value.name.toLowerCase()),
      text,
      refs,
    });
  }
}
const commentaryPath = path.join(SOURCES, "matthew-henry.json");
if (fileHash(commentaryPath) !== commentaryLock.sha256) throw new Error("Unverified Matthew Henry commentary source");
const commentary = JSON.parse(readFileSync(commentaryPath, "utf8"));
for (const item of commentary.entries) {
  const text = clean(item.text);
  if (!text) continue;
  const title = clean(item.reference);
  replacementCharacters += (text.match(/\uFFFD/g) ?? []).length;
  entries.push({
    kind: "commentary",
    title,
    title_key: titleKey(title),
    slug: `matthew-henry-${item.book}-${item.chapter}-${item.startVerse}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    text,
    refs: title,
  });
}
entries.sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }) || a.slug.localeCompare(b.slug));
if (!entries.length) throw new Error("No study entries were parsed");
const dictionaryCount = entries.filter((entry) => entry.kind === "dictionary").length;
const commentaryCount = entries.filter((entry) => entry.kind === "commentary").length;

const outputPath = path.join(ASSETS, "koino-study-v1.db");
const temporaryPath = `${outputPath}.tmp`;
mkdirSync(ASSETS, { recursive: true });
const database = new DatabaseSync(temporaryPath);
try {
  database.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=4096;
    DROP TABLE IF EXISTS entries; DROP TABLE IF EXISTS meta; DROP TABLE IF EXISTS entries_fts;
    CREATE TABLE entries(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, title_key TEXT NOT NULL, slug TEXT NOT NULL, text TEXT NOT NULL, refs TEXT NOT NULL);
    CREATE INDEX entries_title_key ON entries(title_key);
    CREATE VIRTUAL TABLE entries_fts USING fts5(title, text, refs, content='entries', content_rowid='id', tokenize='porter unicode61 remove_diacritics 2');
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const insert = database.prepare("INSERT INTO entries VALUES(?,?,?,?,?,?,?)");
  database.exec("BEGIN");
  entries.forEach((entry, index) => insert.run(index + 1, entry.kind, entry.title, entry.title_key, entry.slug, entry.text, entry.refs));
  database.exec("COMMIT");
  database.exec("INSERT INTO entries_fts(entries_fts) VALUES('rebuild'); ANALYZE;");
  const metadata = {
    schema_version: "1",
    entry_count: String(entries.length),
    dictionary_count: String(dictionaryCount),
    commentary_count: String(commentaryCount),
    source: "neuu-org/bible-dictionary-dataset",
    source_commit: lock.commit,
    dictionary: lock.dictionary,
    license: lock.license,
    source_fingerprint: hash(lock.files.map((file) => `${file.file}:${file.sha256}`).join("\n")),
    commentary_source: "bible.helloao.org/api/c/matthew-henry",
    commentary_license: commentary.source.licenseUrl,
    commentary_snapshot: commentary.source.snapshotDate,
    commentary_source_sha256: commentary.source.sourceSha256,
    commentary_fingerprint: commentaryLock.sha256,
  };
  const insertMeta = database.prepare("INSERT INTO meta VALUES(?,?)");
  for (const [key, value] of Object.entries(metadata)) insertMeta.run(key, value);
  database.exec("VACUUM;");
  if (database.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("Study DB integrity check failed");
} finally {
  database.close();
}
renameSync(temporaryPath, outputPath);
const manifest = {
  schemaVersion: 1,
  databaseSha256: fileHash(outputPath),
  bytes: statSync(outputPath).size,
  entries: entries.length,
  dictionaryEntries: dictionaryCount,
  commentaryEntries: commentaryCount,
  replacementCharacters,
  source: {
    repository: "https://github.com/neuu-org/bible-dictionary-dataset",
    commit: lock.commit,
    dictionary: lock.dictionary,
    license: lock.license,
  },
  commentary: {
    api: commentary.source.api,
    name: commentary.source.name,
    license: commentary.source.licenseUrl,
    snapshotDate: commentary.source.snapshotDate,
    sourceSha256: commentary.source.sourceSha256,
    fingerprint: commentaryLock.sha256,
  },
};
writeFileSync(path.join(ASSETS, "study-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
