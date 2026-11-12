#!/usr/bin/env node
/** Select hard distractor documents from the shipped index for proxy evaluation. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import * as runtime from "onnxruntime-node";
import { createTextEncoder } from "../../features/bible-search/embedding-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ASSETS = path.join(ROOT, "assets/bible/search");
const CACHE = path.join(ROOT, "scripts/hybrid-search/.cache/finetune");
const database = new DatabaseSync(path.join(ASSETS, "koino-search-v1.db"), { readOnly: true, allowExtension: true });
database.loadExtension(path.join(ROOT, "scripts/hybrid-search/.deps/sqlite_vec/vec0.dll"));
const meta = new Map(database.prepare("SELECT key,value FROM meta").all().map(({ key, value }) => [key, value]));
const vectorType = meta.get("vector_type");
const vectorSQL = vectorType === "int8" ? "vec_quantize_int8(?, 'unit')" : "?";
const knn = database.prepare(`SELECT id FROM vec_documents
  WHERE embedding MATCH ${vectorSQL} AND k=200 AND translation_id=1 ORDER BY distance`);
const encoder = await createTextEncoder({
  runtime,
  modelPath: path.join(ASSETS, "multilingual-e5-small-int8.onnx"),
  tokenizerJson: JSON.parse(readFileSync(path.join(ASSETS, "multilingual-e5-small.tokenizer"), "utf8")),
  tokenizerConfig: JSON.parse(readFileSync(path.join(ASSETS, "multilingual-e5-small-config.tokenizer"), "utf8")),
});
const queries = JSON.parse(readFileSync(path.join(ROOT, "scripts/hybrid-search/recall-queries.json"), "utf8"));
const ids = new Set();
try {
  for (const pair of queries) {
    for (const query of pair) {
      const vector = await encoder.embed(query, "query");
      const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
      for (const row of knn.all(bytes)) ids.add(row.id);
    }
  }
} finally {
  await encoder.dispose();
  database.close();
}
writeFileSync(path.join(CACHE, "proxy-hard-ids.json"), `${JSON.stringify({ ids: [...ids].sort((a, b) => a - b) })}\n`);
console.log(JSON.stringify({ queries: queries.length * 2, documents: ids.size }));
