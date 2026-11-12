#!/usr/bin/env node
/** Export the bundled topic names for the search-box autocomplete. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const databasePath = path.join(ROOT, "assets/bible/search/koino-search-v1.db");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "assets/bible/search/search-manifest.json"), "utf8"));
const database = new DatabaseSync(databasePath, { readOnly: true });
try {
  const topics = database.prepare("SELECT name FROM topics ORDER BY name COLLATE NOCASE").all().map(({ name }) => name);
  if (!topics.length) throw new Error("The search index has no topics");
  writeFileSync(path.join(ROOT, "assets/bible/search/topic-suggestions.json"), `${JSON.stringify({
    schemaVersion: 1,
    buildFingerprint: manifest.buildFingerprint,
    topics,
  })}\n`);
  console.log(JSON.stringify({ topics: topics.length, file: "assets/bible/search/topic-suggestions.json" }));
} finally {
  database.close();
}
