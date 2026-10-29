import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import * as ort from "onnxruntime-node";
import { createTextEncoder, E5_MODEL_REVISION } from "../features/bible-search/embedding-core.mjs";
import { normalizeSwedishForSearch } from "./hybrid-search/lexical.mjs";

const root = path.resolve(import.meta.dirname, "..");
const assets = path.join(root, "assets/bible/search");
const temporary = await mkdtemp(path.join(os.tmpdir(), "koino-hybrid-validation-"));
let encoder, search, reader;
try {
  const manifest = JSON.parse(await readFile(path.join(assets, "search-manifest.json"), "utf8"));
  assert.equal(manifest.modelRevision, E5_MODEL_REVISION);
  assert.equal(manifest.dimensions, 384);
  assert.equal(createHash("sha256").update(await readFile(path.join(root, "assets/bible/koino-bible-v2.db"))).digest("hex"), manifest.readerSha256, "Rebuild the search index after changing the packaged Bible text");
  const extension = process.env.SQLITE_VEC_PATH ?? path.join(root, "scripts/hybrid-search/.deps/sqlite_vec", process.platform === "win32" ? "vec0.dll" : process.platform === "darwin" ? "vec0.dylib" : "vec0.so");
  await access(extension);
  search = new DatabaseSync(path.join(assets, "koino-search-v1.db"), { readOnly: true, allowExtension: true });
  search.loadExtension(extension);
  assert.equal(search.prepare("SELECT vec_version() AS version").get().version, "v0.1.7-alpha.2", "Asset validation must use the same vector extension as the mobile runtime");
  assert.equal(search.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.equal(search.prepare("SELECT COUNT(*) AS n FROM documents WHERE kind='verse'").get().n, 62272);
  assert.equal(search.prepare("SELECT COUNT(*) AS n FROM documents WHERE end_verse<start_verse").get().n, 0);
  assert.equal(search.prepare("SELECT COUNT(*) AS n FROM topic_documents t LEFT JOIN documents d ON d.id=t.document_id WHERE d.id IS NULL").get().n, 0);
  reader = new DatabaseSync(path.join(root, "assets/bible/koino-bible-v2.db"), { readOnly: true });
  const outfile = path.join(temporary, "search.mjs");
  await build({
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
    stdin: { contents: 'export * from "./features/bible-search.ts"; export * from "./features/bible-search/retrieval.ts"; export {setBibleDatabaseForTesting} from "./features/bible-database.ts";', resolveDir: root },
    plugins: [{ name: "native-boundary", setup(builder) {
      builder.onResolve({ filter: /bible-search\/native-backend$/ }, () => ({ path: "koino-native-search-not-installed-in-node", external: true }));
    } }],
  });
  const api = await import(pathToFileURL(outfile).href);
  const adapt = (db) => ({ getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args), getAllSync: (sql, ...args) => db.prepare(sql).all(...args), getFirstSync: (sql, ...args) => db.prepare(sql).get(...args) });
  api.setBibleDatabaseForTesting(adapt(reader));
  encoder = await createTextEncoder({ runtime: ort, modelPath: path.join(assets, "multilingual-e5-small-int8.onnx"), tokenizerJson: JSON.parse(await readFile(path.join(assets, "multilingual-e5-small.tokenizer"), "utf8")), tokenizerConfig: JSON.parse(await readFile(path.join(assets, "multilingual-e5-small-config.tokenizer"), "utf8")) });
  const cache = new Map();
  const backend = api.createScriptureSearchBackend({ connection: adapt(search), vectorType: manifest.vectorType, stemSwedish: normalizeSwedishForSearch, embedQuery: async (text) => {
    if (!cache.has(text)) cache.set(text, encoder.embed(text, "query"));
    return cache.get(text);
  } });
  api.setScriptureSearchBackendForTesting(backend);
  const cases = [
    ["verses where Jesus was worshiped", "verser där Jesus blev tillbedd", ["Matthew",2,11,11], ["Matthew",14,33,33], ["Matthew",28,9,17], ["John",9,38,38], ["Hebrews",1,6,6]],
    ["Jesus owning the angels", "Jesus äger änglarna", ["Matthew",13,41,41], ["Matthew",24,31,31], ["2 Thessalonians",1,7,7], ["Colossians",1,16,16], ["1 Peter",3,22,22], ["Revelation",22,16,16]],
    ["an axe floating", "en yxa som flyter", ["2 Kings",6,1,7]],
    ["grace", "nåd", ["Ephesians",2,8,9], ["John",1,14,17], ["2 Corinthians",12,9,9], ["Romans",3,24,24], ["Romans",5,20,21], ["Titus",2,11,11]],
    ["baal prophets being humiliated", "Baals profeter blir förödmjukade", ["1 Kings",18,20,40]],
    ["speaking donkey", "en talande åsna", ["Numbers",22,21,33], ["2 Peter",2,16,16]],
    ["seeing angels", "att se änglar", ["John",1,51,51], ["John",20,12,12], ["Genesis",28,12,12], ["2 Kings",6,17,17], ["Luke",2,9,15], ["Acts",12,7,9]],
    ["holy spirit speaking", "den helige Ande talar", ["Acts",8,29,29], ["Acts",10,19,20], ["Acts",13,2,2], ["Acts",28,25,25], ["1 Timothy",4,1,1], ["Hebrews",3,7,7]],
  ];
  const failures = [];
  const times = [];
  for (const [english, swedish, ...targets] of cases) for (const query of [english, swedish]) for (const versionId of ["kjv", "reformationsbibeln2026"]) for (const language of ["en", "sv"]) {
    const began = performance.now();
    let partial;
    const response = await api.searchScripture({ query, versionId, language, limit: 20, onPartialResults: (next) => { partial = next; } });
    times.push(performance.now() - began);
    assert.equal(response.mode, "hybrid", `${query}: semantic search must actually execute`);
    assert.equal(partial?.semanticState, "loading");
    const top = response.results.slice(0, 5).map((item) => item.verse);
    if (!targets.some(([book, chapter, first, last]) => top.some((v) => v.book === book && v.chapter === chapter && v.startVerse <= last && v.endVerse >= first))) failures.push({ query, versionId, language, top: top.map((v) => v.reference) });
    for (const result of response.results) {
      assert.ok(result.verse.text.trim());
      assert.equal(new Set(response.results.map((item) => item.id)).size, response.results.length);
      const canonical = api.resolveBibleReference(result.verse.reference, language, versionId);
      assert.equal(result.verse.text, canonical?.text, "Search must display exact local translation text");
    }
  }
  // Held-out wording is deliberately different from the document's examples.
  for (const [query, expected] of [["Balaams animal rebuked him", "Numbers"], ["Bileams djur tillrättavisade honom", "Numbers"], ["Elisha retrieves the borrowed tool from water", "2 Kings"], ["Elisa räddar det lånade verktyget ur vattnet", "2 Kings"]]) {
    for (const versionId of ["kjv", "reformationsbibeln2026"]) {
      const response = await api.searchScripture({ query, versionId, language: "en", limit: 20 });
      if (!response.results.slice(0,5).some((item) => item.verse.book === expected)) failures.push({ query, versionId, top: response.results.slice(0,5).map((item) => item.verse.reference) });
    }
  }
  // These modern Swedish expressions have no literal hits in either corpus.
  // They must still retrieve useful Scripture through actual model inference.
  for (const [query, book, chapter, verse] of [["hopplöshet", "Romans", 8, 24], ["osjälvisk generositet", "Proverbs", 22, 9]]) {
    for (const versionId of ["kjv", "reformationsbibeln2026"]) {
      assert.equal((await backend.lexical(query, versionId === "kjv" ? 1 : 2, 20)).length, 0, `${query}: fixture must exercise semantic-only retrieval`);
      const response = await api.searchScripture({ query, versionId, language: "en", limit: 20 });
      assert.equal(response.mode, "hybrid");
      assert.ok(response.results.slice(0,5).some((item) => item.verse.book === book && item.verse.chapter === chapter && item.verse.startVerse <= verse && item.verse.endVerse >= verse), `${query}: a useful semantic-only passage must survive abstention`);
    }
  }
  // High background similarity alone is not evidence that unrelated text occurs
  // in Scripture. These have no text hits and must not receive arbitrary verses.
  for (const query of ["zxqwvbnm9876", "quantum battery warranty", "recept på glutenfri chokladkaka"]) {
    for (const versionId of ["kjv", "reformationsbibeln2026"]) {
      const response = await api.searchScripture({ query, versionId, language: "en", limit: 20 });
      assert.equal(response.mode, "hybrid");
      assert.equal(response.results.length, 0, `${query}: unrelated input must not produce semantic-only false matches`);
    }
  }
  for (const query of ['"grace" OR (', "grace - mercy", "nådens gåvor", '[]()+*:"']) await api.searchScripture({ query, versionId: "reformationsbibeln2026", language: "en", limit: 5 });
  const previewOptions = { query: "grace", versionId: "kjv", language: "en", limit: 20 };
  const originalPreview = await api.searchScripture(previewOptions);
  const paged = api.createScriptureSearchPageSession(previewOptions);
  const initialPage = await paged.firstPage();
  assert.deepEqual(initialPage.results, originalPreview.results, "Pagination retains the existing top-ranked preview");
  const nextPage = await paged.nextPage();
  assert.ok(nextPage.results.length > 0, "The real bundled index provides another page");
  assert.equal(new Set([...initialPage.results, ...nextPage.results].map((item) => item.id)).size, initialPage.results.length + nextPage.results.length);
  paged.dispose();
  assert.equal((await api.searchScripture({ query: "Johannes 3:16-17", versionId: "kjv", language: "en" })).results[0].verse.endVerse, 17);
  assert.equal((await api.searchScripture({ query: "Psaltaren 3:9", versionId: "reformationsbibeln2026", language: "en" })).results[0].verse.startVerse, 9);
  assert.equal((await api.searchScripture({ query: "Fakebook 3:16", versionId: "kjv", language: "en" })).results.length, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.searchScripture({ query: "hope", versionId: "kjv", language: "en", signal: controller.signal }), { name: "AbortError" });
  api.setScriptureSearchBackendForTesting({ lexical: backend.lexical, hybrid: async () => { throw new Error("Model unavailable"); } });
  const fallback = await api.searchScripture({ query: "God loved world", versionId: "kjv", language: "en" });
  assert.equal(fallback.semanticState, "unavailable"); assert.ok(fallback.results.length);
  times.sort((a,b) => a-b);
  console.log(JSON.stringify({ scenarios: 64, vectorType: manifest.vectorType, desktopP95ms: Math.round(times[Math.floor(times.length*.95)]), failures }, null, 2));
  assert.equal(failures.length, 0, "Bilingual top-five retrieval regressions");
  console.log("Hybrid search validation passed.");
} finally {
  await encoder?.dispose(); search?.close(); reader?.close();
  await rm(temporary, { recursive: true, force: true });
}
