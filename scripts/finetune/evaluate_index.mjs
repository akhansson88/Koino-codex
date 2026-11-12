#!/usr/bin/env node
/** Held-out bilingual recall evaluation against the packaged sqlite-vec index. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import * as runtime from "onnxruntime-node";
import { createTextEncoder } from "../../features/bible-search/embedding-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const modelPath = args[0] ?? path.join(ROOT, "assets/bible/search/multilingual-e5-small-int8.onnx");
const output = args[1] ?? path.join(ROOT, "scripts/hybrid-search/.cache/finetune/index-eval.json");
const databasePath = path.resolve(args[2] ?? path.join(ROOT, "assets/bible/search/koino-search-v1.db"));
const round = (value) => Math.round(value * 1e6) / 1e6;
const database = new DatabaseSync(databasePath, { readOnly: true, allowExtension: true });
database.loadExtension(path.join(ROOT, "scripts/hybrid-search/.deps/sqlite_vec/vec0.dll"));
const reader = new DatabaseSync(path.join(ROOT, "assets/bible/koino-bible-v2.db"), { readOnly: true });
const bookNames = new Map(reader.prepare("SELECT id,name FROM books").all().map(({ id, name }) => [id, name]));
const encoder = await createTextEncoder({
  runtime,
  modelPath,
  tokenizerJson: JSON.parse(readFileSync(path.join(ROOT, "assets/bible/search/multilingual-e5-small.tokenizer"), "utf8")),
  tokenizerConfig: JSON.parse(readFileSync(path.join(ROOT, "assets/bible/search/multilingual-e5-small-config.tokenizer"), "utf8")),
});
const queries = JSON.parse(readFileSync(path.join(ROOT, "scripts/hybrid-search/recall-queries.json"), "utf8"));
const gold = JSON.parse(readFileSync(path.join(ROOT, "scripts/hybrid-search/recall-gold.json"), "utf8"));
const databaseMeta = new Map(database.prepare("SELECT key,value FROM meta").all().map(({ key, value }) => [key, value]));
const vectorType = databaseMeta.get("vector_type");
if (vectorType !== "int8" && vectorType !== "float32") throw new Error("Unsupported index vector type");
const vectorSQL = vectorType === "int8" ? "vec_quantize_int8(?, 'unit')" : "?";
const knn = database.prepare(`SELECT id,distance FROM vec_documents
  WHERE embedding MATCH ${vectorSQL} AND k=20 AND translation_id=1 ORDER BY distance`);
const doc = database.prepare("SELECT id,book,chapter,start_verse,end_verse,kind FROM documents WHERE id=?");
const results = [];
try {
  for (let index = 0; index < queries.length; index += 1) {
    for (const language of [0, 1]) {
      const query = queries[index][language];
      const vector = await encoder.embed(query, "query");
      const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
      const hits = knn.all(bytes).map(({ id, distance }) => {
        const value = doc.get(id);
        return value ? { ...value, distance } : null;
      }).filter(Boolean);
      const targets = gold[index];
      const relevant = hits.map((hit) => targets.some(([bookId, chapter, first, last]) =>
        hit.book === bookNames.get(bookId) && hit.chapter === chapter && hit.start_verse <= last && hit.end_verse >= first));
      const first = relevant.findIndex(Boolean);
      results.push({
        query, language: language === 0 ? "en" : "sv",
        recallAt10: relevant.slice(0, 10).some(Boolean),
        recallAt20: relevant.some(Boolean),
        rank: first >= 0 ? first + 1 : null,
        topSimilarity: hits[0] ? round(1 - hits[0].distance) : null,
        bestRelevantSimilarity: first >= 0 ? round(1 - hits[first].distance) : null,
        top: hits.slice(0, 5).map((hit) => `${hit.book} ${hit.chapter}:${hit.start_verse}-${hit.end_verse}`),
      });
    }
  }
  const summary = {
    model: path.relative(ROOT, modelPath),
    database: path.relative(ROOT, databasePath),
    vectorType,
    queries: results.length,
    recallAt10: results.filter((row) => row.recallAt10).length / results.length,
    recallAt20: results.filter((row) => row.recallAt20).length / results.length,
    mrr: results.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / results.length,
    similarity: {
      meanTop: round(results.reduce((sum, row) => sum + (row.topSimilarity ?? 0), 0) / results.length),
      meanBestRelevant: round(results.reduce((sum, row) => sum + (row.bestRelevantSimilarity ?? 0), 0) / results.filter((row) => row.bestRelevantSimilarity !== null).length),
      topAtOrAbove072: results.filter((row) => (row.topSimilarity ?? 0) >= 0.72).length / results.length,
      relevantAtOrAbove072: results.filter((row) => (row.bestRelevantSimilarity ?? 0) >= 0.72).length / results.length,
    },
    byLanguage: Object.fromEntries(["en", "sv"].map((language) => {
      const rows = results.filter((row) => row.language === language);
      return [language, {
        recallAt10: rows.filter((row) => row.recallAt10).length / rows.length,
        recallAt20: rows.filter((row) => row.recallAt20).length / rows.length,
        mrr: rows.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / rows.length,
      }];
    })),
  };
  writeFileSync(output, `${JSON.stringify({ summary, results }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await encoder.dispose();
  reader.close();
  database.close();
}
