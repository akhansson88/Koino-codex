#!/usr/bin/env node
/** Evaluate the locked independent narrative paraphrase benchmark on an index. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import * as runtime from "onnxruntime-node";
import { createTextEncoder } from "../../features/bible-search/embedding-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const modelPath = path.resolve(args.model ?? path.join(ROOT, "assets/bible/search/multilingual-e5-small-int8.onnx"));
const databasePath = path.resolve(args.database ?? path.join(ROOT, "assets/bible/search/koino-search-v1.db"));
const outputPath = path.resolve(args.output ?? path.join(ROOT, "scripts/hybrid-search/.cache/finetune/narrative-benchmark-production.json"));
const benchmark = JSON.parse(readFileSync(path.join(ROOT, "scripts/finetune/narrative-paraphrase-benchmark.json"), "utf8"));
const reader = new DatabaseSync(path.join(ROOT, "assets/bible/koino-bible-v2.db"), { readOnly: true });
const books = new Map(reader.prepare("SELECT id,name FROM books").all().map(({ id, name }) => [id, name]));
reader.close();
const database = new DatabaseSync(databasePath, { readOnly: true, allowExtension: true });
database.loadExtension(path.join(ROOT, "scripts/hybrid-search/.deps/sqlite_vec/vec0.dll"));
const meta = new Map(database.prepare("SELECT key,value FROM meta").all().map(({ key, value }) => [key, value]));
const vectorType = meta.get("vector_type");
if (vectorType !== "int8" && vectorType !== "float32") throw new Error("Unsupported index vector type");
const vectorSQL = vectorType === "int8" ? "vec_quantize_int8(?, 'unit')" : "?";
const knn = database.prepare(`SELECT id,distance FROM vec_documents
  WHERE embedding MATCH ${vectorSQL} AND k=20 AND translation_id=1 ORDER BY distance`);
const document = database.prepare("SELECT id,book,chapter,start_verse,end_verse,kind FROM documents WHERE id=?");
const encoder = await createTextEncoder({
  runtime,
  modelPath,
  tokenizerJson: JSON.parse(readFileSync(path.join(ROOT, "assets/bible/search/multilingual-e5-small.tokenizer"), "utf8")),
  tokenizerConfig: JSON.parse(readFileSync(path.join(ROOT, "assets/bible/search/multilingual-e5-small-config.tokenizer"), "utf8")),
});
const results = [];
try {
  for (const item of benchmark.queries) {
    for (const language of ["en", "sv"]) {
      const query = item[language];
      const vector = await encoder.embed(query, "query");
      const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
      const hits = knn.all(bytes).map(({ id, distance }) => {
        const value = document.get(id);
        return value ? { ...value, distance } : null;
      }).filter(Boolean);
      const relevant = hits.map((hit) => item.references.some(([bookId, chapter, first, last]) =>
        hit.book === books.get(bookId) && hit.chapter === chapter && hit.start_verse <= last && hit.end_verse >= first));
      const first = relevant.findIndex(Boolean);
      results.push({
        id: item.id,
        story: item.story,
        language,
        query,
        recallAt1: relevant.slice(0, 1).some(Boolean),
        recallAt5: relevant.slice(0, 5).some(Boolean),
        recallAt10: relevant.slice(0, 10).some(Boolean),
        recallAt20: relevant.some(Boolean),
        rank: first >= 0 ? first + 1 : null,
        reciprocalRank: first >= 0 ? 1 / (first + 1) : 0,
        top: hits.slice(0, 5).map((hit) => `${hit.book} ${hit.chapter}:${hit.start_verse}-${hit.end_verse}`),
      });
    }
  }
  const summary = {
    benchmarkSha256: readFileSync(path.join(ROOT, "scripts/finetune/narrative-paraphrase-benchmark.lock.json"), "utf8").match(/"sha256": "([a-f0-9]{64})"/)?.[1] ?? null,
    model: path.relative(ROOT, modelPath),
    database: path.relative(ROOT, databasePath),
    vectorType,
    stories: benchmark.queries.length,
    queries: results.length,
    recallAt1: results.filter((row) => row.recallAt1).length / results.length,
    recallAt5: results.filter((row) => row.recallAt5).length / results.length,
    recallAt10: results.filter((row) => row.recallAt10).length / results.length,
    recallAt20: results.filter((row) => row.recallAt20).length / results.length,
    mrr: results.reduce((sum, row) => sum + row.reciprocalRank, 0) / results.length,
    byLanguage: Object.fromEntries(["en", "sv"].map((language) => {
      const subset = results.filter((row) => row.language === language);
      return [language, {
        recallAt1: subset.filter((row) => row.recallAt1).length / subset.length,
        recallAt5: subset.filter((row) => row.recallAt5).length / subset.length,
        recallAt10: subset.filter((row) => row.recallAt10).length / subset.length,
        recallAt20: subset.filter((row) => row.recallAt20).length / subset.length,
        mrr: subset.reduce((sum, row) => sum + row.reciprocalRank, 0) / subset.length,
      }];
    })),
  };
  writeFileSync(outputPath, `${JSON.stringify({ summary, results }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await encoder.dispose();
  database.close();
}
