#!/usr/bin/env node
/**
 * Calibrate semantic score floors after the encoder changes, then refresh the
 * content-addressed database descriptor in the manifest.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assets = path.join(ROOT, "assets/bible/search");
const databasePath = path.join(assets, "koino-search-v1.db");
const manifestPath = path.join(assets, "search-manifest.json");
const [min, only, floor, margin] = process.argv.slice(2).map(Number);
if (![min, only, floor, margin].every((value) => Number.isFinite(value))) {
  throw new Error("Usage: set_semantic_floors.mjs <min> <only> <relative-floor> <relative-margin>");
}
const database = new DatabaseSync(databasePath);
try {
  const statement = database.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  for (const [key, value] of [
    ["semantic_min_similarity", min],
    ["semantic_only_min_similarity", only],
    ["semantic_relative_floor", floor],
    ["semantic_relative_margin", margin],
    ["model_revision", JSON.parse(readFileSync(manifestPath, "utf8")).modelRevision],
  ]) statement.run(key, String(value));
} finally {
  database.close();
}
const hash = (algorithm) => createHash(algorithm).update(readFileSync(databasePath)).digest("hex");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
Object.assign(manifest, {
  semanticMinSimilarity: min,
  semanticOnlyMinSimilarity: only,
  semanticRelativeFloor: floor,
  semanticRelativeMargin: margin,
  databaseSha256: hash("sha256"),
});
manifest.assets.database = {
  ...manifest.assets.database,
  bytes: statSync(databasePath).size,
  sha256: hash("sha256"),
  md5: hash("md5"),
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  semanticMinSimilarity: min,
  semanticOnlyMinSimilarity: only,
  semanticRelativeFloor: floor,
  semanticRelativeMargin: margin,
  databaseSha256: manifest.databaseSha256,
  databaseBytes: manifest.assets.database.bytes,
}, null, 2));
