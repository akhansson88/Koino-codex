#!/usr/bin/env node
/** Compare app-level hybrid search (lexical + topic + semantic) for two indexes. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import * as ort from "onnxruntime-node";
import { createTextEncoder } from "../../features/bible-search/embedding-core.mjs";
import { normalizeSwedishForSearch } from "../hybrid-search/lexical.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const assets = path.join(root, "assets/bible/search");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
if (!args.model || !args.database || !args.output) {
  throw new Error("Usage: evaluate_hybrid.mjs --model <onnx> --database <db> --output <json> [--min .25 --only .36 --floor .25 --margin .05]");
}
const thresholds = {
  semanticMinSimilarity: Number(args.min ?? 0.25),
  semanticOnlyMinSimilarity: Number(args.only ?? 0.36),
  semanticRelativeFloor: Number(args.floor ?? 0.25),
  semanticRelativeMargin: Number(args.margin ?? 0.05),
};
const temporary = await mkdtemp(path.join(os.tmpdir(), "koino-hybrid-eval-"));
let search;
try {
  const reader = new DatabaseSync(path.join(root, "assets/bible/koino-bible-v2.db"), { readOnly: true });
  const bookNames = new Map(reader.prepare("SELECT id,name FROM books").all().map(({ id, name }) => [id, name]));
  search = new DatabaseSync(path.resolve(args.database), { readOnly: true, allowExtension: true });
  search.loadExtension(path.join(root, "scripts/hybrid-search/.deps/sqlite_vec/vec0.dll"));
  const databaseMeta = new Map(search.prepare("SELECT key,value FROM meta").all().map(({ key, value }) => [key, value]));
  const vectorType = databaseMeta.get("vector_type");
  const outfile = path.join(temporary, "search.mjs");
  await build({
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
    stdin: { contents: 'export * from "./features/bible-search.ts"; export * from "./features/bible-search/retrieval.ts"; export {setBibleDatabaseForTesting} from "./features/bible-database.ts";', resolveDir: root },
    plugins: [{ name: "native-boundary", setup(builder) {
      builder.onResolve({ filter: /bible-search\/native-backend$/ }, () => ({ path: "koino-native-search-not-installed-in-node", external: true }));
    } }],
  });
  const api = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  const adapt = (db) => ({ getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params), getAllSync: (sql, ...params) => db.prepare(sql).all(...params), getFirstSync: (sql, ...params) => db.prepare(sql).get(...params) });
  api.setBibleDatabaseForTesting(adapt(reader));
  const encoder = await createTextEncoder({
    runtime: ort,
    modelPath: path.resolve(args.model),
    tokenizerJson: JSON.parse(await readFile(path.join(assets, "multilingual-e5-small.tokenizer"), "utf8")),
    tokenizerConfig: JSON.parse(await readFile(path.join(assets, "multilingual-e5-small-config.tokenizer"), "utf8")),
  });
  const cache = new Map();
  const backend = api.createScriptureSearchBackend({
    connection: adapt(search),
    vectorType,
    stemSwedish: normalizeSwedishForSearch,
    ...thresholds,
    embedQuery: async (text) => {
      if (!cache.has(text)) cache.set(text, encoder.embed(text, "query"));
      return cache.get(text);
    },
  });
  api.setScriptureSearchBackendForTesting(backend);
  const queries = JSON.parse(await readFile(path.join(root, "scripts/hybrid-search/recall-queries.json"), "utf8"));
  const gold = JSON.parse(await readFile(path.join(root, "scripts/hybrid-search/recall-gold.json"), "utf8"));
  const results = [];
  for (let index = 0; index < queries.length; index += 1) {
    for (let languageIndex = 0; languageIndex < 2; languageIndex += 1) {
      const query = queries[index][languageIndex];
      const response = await api.searchScripture({
        query, versionId: "kjv", language: languageIndex === 0 ? "en" : "sv", limit: 20,
      });
      const relevant = response.results.map((result) => {
        const verse = result.verse;
        return gold[index].some(([bookId, chapter, first, last]) =>
          verse.book === bookNames.get(bookId) && verse.chapter === chapter && verse.startVerse <= last && verse.endVerse >= first);
      });
      const first = relevant.findIndex(Boolean);
      results.push({
        query, language: languageIndex === 0 ? "en" : "sv",
        mode: response.mode,
        results: response.results.length,
        recallAt10: relevant.slice(0, 10).some(Boolean),
        recallAt20: relevant.some(Boolean),
        rank: first >= 0 ? first + 1 : null,
        top: response.results.slice(0, 5).map((result) => result.verse.reference),
      });
    }
  }
  const summary = {
    model: path.resolve(args.model),
    database: path.resolve(args.database),
    thresholds,
    queries: results.length,
    recallAt10: results.filter((item) => item.recallAt10).length / results.length,
    recallAt20: results.filter((item) => item.recallAt20).length / results.length,
    mrr: results.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) / results.length,
    byLanguage: Object.fromEntries(["en", "sv"].map((language) => {
      const subset = results.filter((item) => item.language === language);
      return [language, {
        recallAt10: subset.filter((item) => item.recallAt10).length / subset.length,
        recallAt20: subset.filter((item) => item.recallAt20).length / subset.length,
        mrr: subset.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) / subset.length,
      }];
    })),
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(path.resolve(args.output), `${JSON.stringify({ summary, results }, null, 2)}\n`));
  console.log(JSON.stringify(summary, null, 2));
  await encoder.dispose();
  reader.close();
} finally {
  search?.close();
  await rm(temporary, { recursive: true, force: true });
}
