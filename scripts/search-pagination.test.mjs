import assert from "node:assert/strict";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { normalizeSwedishForSearch } from "./hybrid-search/lexical.mjs";

const built = await build({ bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  stdin: { contents: 'export * from "./features/bible-search.ts"; export * from "./features/bible-search/retrieval.ts"; export {setBibleDatabaseForTesting} from "./features/bible-database.ts";', resolveDir: process.cwd() },
  plugins: [{ name: "native-boundary", setup(builder) { builder.onResolve({ filter: /bible-search\/native-backend$/ }, () => ({ path: "missing-native-search", external: true })); } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const reader = new DatabaseSync("assets/bible/koino-bible-v2.db", { readOnly: true });
after(() => reader.close());
api.setBibleDatabaseForTesting({
  getAllSync: (sql, ...args) => reader.prepare(sql).all(...args),
  getFirstSync: (sql, ...args) => reader.prepare(sql).get(...args),
  getAllAsync: async (sql, ...args) => reader.prepare(sql).all(...args),
});
const positions = reader.prepare(`SELECT b.name AS book,v.chapter,MIN(v.verse) AS verse
  FROM verses v JOIN books b ON b.id=v.book_id JOIN translations t ON t.id=v.translation_id
  WHERE t.code='kjv' GROUP BY b.id,v.chapter ORDER BY MIN(v.canonical_order) LIMIT 180`).all();
const documents = positions.map((position, index) => ({
  document: { id: index + 1, translation_id: 1, book: position.book, chapter: position.chapter,
    start_verse: position.verse, end_verse: position.verse, kind: "verse", title: "section", text: "",
    canonical_order: index + 1 }, score: 1 / (index + 1), sources: ["lexical"],
}));
documents[100].sources = ["semantic", "topic"];
documents[101].sources = ["lexical", "semantic", "topic"];

test("preview pages stay responsive while the full ranking is built and all later ranges remain reachable", async () => {
  let finishIndex;
  const index = new Promise((resolve) => { finishIndex = resolve; });
  let allCalls = 0;
  api.setScriptureSearchBackendForTesting({
    lexical: async () => documents.slice(0, 80), hybrid: async () => documents.slice(0, 80),
    all: async () => { allCalls++; return index; },
  });
  const session = api.createScriptureSearchPageSession({ language: "en", versionId: "kjv", query: "a search", limit: 20 });
  const first = await session.firstPage();
  assert.equal(first.results.length, 20);
  const nextRequest = session.nextPage();
  assert.equal(session.nextPage(), nextRequest, "Concurrent requests reuse the same page operation");
  const second = await nextRequest;
  assert.equal(second.results.length, 20, "Preview pages do not wait for the complete index");
  assert.equal(allCalls, 1);
  const third = await session.nextPage();
  const fourth = await session.nextPage();
  assert.equal(third.results.length, 20); assert.equal(fourth.results.length, 20);
  finishIndex(documents);
  const pages = [first, second, third, fourth];
  while (pages.at(-1).hasMore) pages.push(await session.nextPage());
  const ids = pages.flatMap((page) => page.results.map((item) => item.id));
  assert.equal(ids.length, 180);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, documents.map(({ document: d }) => `kjv:${d.book} ${d.chapter}:${d.start_verse}`));
  assert.deepEqual(pages.flatMap((page) => page.results)[100].sources, ["semantic", "topic"], "Compact indexing preserves source attribution");
  assert.equal(pages.flatMap((page) => page.results)[100].matchType, "topic");
  assert.deepEqual(pages.flatMap((page) => page.results)[101].sources, ["lexical", "semantic", "topic"]);
  for (const result of pages.flatMap((page) => page.results)) assert.ok(result.verse.text && result.verses[0].text);
  session.dispose();
});

test("an interrupted page never commits its cursor and can be retried", async () => {
  let calls = 0;
  api.setScriptureSearchBackendForTesting({
    lexical: async () => documents.slice(0, 20), hybrid: async () => documents.slice(0, 20),
    all: async (_query, _translation, _semantic, signal) => {
      calls++;
      if (calls > 1) return documents.slice(0, 40);
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { name: "AbortError" })), { once: true }));
    },
  });
  const session = api.createScriptureSearchPageSession({ language: "en", versionId: "kjv", query: "a search", limit: 20 });
  await session.firstPage();
  const controller = new AbortController();
  const pending = session.nextPage(controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort(); session.suspend();
  await assert.rejects(pending, { name: "AbortError" });
  const next = await session.nextPage();
  assert.equal(next.results[0].id, `kjv:${documents[20].document.book} ${documents[20].document.chapter}:${documents[20].document.start_verse}`);
  assert.equal(next.results.length, 20);
  session.dispose();
});

test("suspending during excerpt hydration prevents a stale page from advancing", async () => {
  let block = false, entered, release;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const releasePromise = new Promise((resolve) => { release = resolve; });
  api.setBibleDatabaseForTesting({
    getAllSync: (sql, ...args) => reader.prepare(sql).all(...args),
    getFirstSync: (sql, ...args) => reader.prepare(sql).get(...args),
    getAllAsync: async (sql, ...args) => {
      const rows = reader.prepare(sql).all(...args);
      if (block) { block = false; entered(); await releasePromise; }
      return rows;
    },
  });
  try {
    api.setScriptureSearchBackendForTesting({ lexical: async () => documents.slice(0, 40), hybrid: async () => documents.slice(0, 40), all: async () => documents.slice(0, 40) });
    const session = api.createScriptureSearchPageSession({ language: "en", versionId: "kjv", query: "a search" });
    await session.firstPage();
    block = true;
    const stale = session.nextPage();
    await enteredPromise; session.suspend(); release();
    await assert.rejects(stale, { name: "AbortError" });
    const retried = await session.nextPage();
    assert.equal(retried.results[0].id, `kjv:${documents[20].document.book} ${documents[20].document.chapter}:${documents[20].document.start_verse}`);
    session.dispose();
  } finally {
    api.setBibleDatabaseForTesting({ getAllSync: (sql, ...args) => reader.prepare(sql).all(...args), getFirstSync: (sql, ...args) => reader.prepare(sql).get(...args), getAllAsync: async (sql, ...args) => reader.prepare(sql).all(...args) });
  }
});

test("a failed full-index build can be retried without losing the preview", async () => {
  let attempts = 0;
  api.setScriptureSearchBackendForTesting({ lexical: async () => documents.slice(0, 20), hybrid: async () => documents.slice(0, 20),
    all: async () => { if (++attempts === 1) throw new Error("temporary database failure"); return documents.slice(0, 40); } });
  const session = api.createScriptureSearchPageSession({ language: "en", versionId: "kjv", query: "a search" });
  const first = await session.firstPage();
  await assert.rejects(session.nextPage(), /temporary database failure/);
  const retried = await session.nextPage();
  assert.equal(first.results.length, 20);
  assert.equal(retried.results[0].id, `kjv:${documents[20].document.book} ${documents[20].document.chapter}:${documents[20].document.start_verse}`);
  session.dispose();
});

test("reference searches finish immediately and unavailable hybrid assets still page word results", async () => {
  api.setScriptureSearchBackendForTesting(undefined);
  const reference = api.createScriptureSearchPageSession({ language: "en", versionId: "kjv", query: "John 3:16", limit: 8 });
  const one = await reference.firstPage();
  assert.equal(one.results.length, 1); assert.equal(one.hasMore, false); reference.dispose();
  const fallback = api.createScriptureSearchPageSession({ language: "en", versionId: "kjv", query: "God", limit: 8 });
  const first = await fallback.firstPage(), second = await fallback.nextPage(), third = await fallback.nextPage();
  assert.equal(first.results.length, 8); assert.equal(second.results.length, 20); assert.equal(third.results.length, 20);
  assert.equal(first.semanticState, "unavailable");
  assert.equal(new Set([...first.results, ...second.results, ...third.results].map((item) => item.id)).size, 48);
  fallback.dispose();
});

test("complete lexical retrieval contains every distinct native FTS range beyond the preview cap", async () => {
  const db = new DatabaseSync("assets/bible/search/koino-search-v1.db", { readOnly: true });
  try {
    const connection = { getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args) };
    const backend = api.createScriptureSearchBackend({ connection, stemSwedish: normalizeSwedishForSearch, embedQuery: async () => { throw new Error("Lexical retrieval must not run the model"); } });
    const expected = db.prepare(`SELECT DISTINCT d.book,d.chapter,d.start_verse,d.end_verse FROM documents_en f
      JOIN documents d ON d.id=f.rowid WHERE documents_en MATCH '"jesus"' AND d.translation_id=1`).all();
    assert.ok(expected.length > 120);
    const all = await backend.all("Jesus", 1, false);
    const keys = new Set(all.map(({ document: d }) => `${d.book}:${d.chapter}:${d.start_verse}:${d.end_verse}`));
    for (const row of expected) assert.ok(keys.has(`${row.book}:${row.chapter}:${row.start_verse}:${row.end_verse}`));
    const swedish = db.prepare(`SELECT DISTINCT d.book,d.chapter,d.start_verse,d.end_verse FROM documents_sv f
      JOIN documents d ON d.id=f.rowid WHERE documents_sv MATCH ? AND d.translation_id=2`).all(`"${normalizeSwedishForSearch("nåd")}"`);
    const translated = await backend.all("nåd", 2, false);
    const swedishKeys = new Set(translated.map(({ document: d }) => `${d.book}:${d.chapter}:${d.start_verse}:${d.end_verse}`));
    assert.ok(swedish.length > 120);
    for (const row of swedish) assert.ok(swedishKeys.has(`${row.book}:${row.chapter}:${row.start_verse}:${row.end_verse}`));
  } finally { db.close(); }
});

const extension = process.env.SQLITE_VEC_EXTENSION ?? path.resolve("scripts/hybrid-search/.deps/sqlite_vec", process.platform === "win32" ? "vec0.dll" : process.platform === "darwin" ? "vec0.dylib" : "vec0.so");
test("complete semantic retrieval goes past sqlite-vec's 4096 KNN limit", { skip: !existsSync(extension) && "sqlite-vec extension unavailable" }, async () => {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  try {
    db.loadExtension(extension);
    db.exec(`CREATE TABLE documents(id INTEGER PRIMARY KEY,translation_id INTEGER,book TEXT,chapter INTEGER,start_verse INTEGER,end_verse INTEGER,kind TEXT,title TEXT,text TEXT,canonical_order INTEGER);
      CREATE TABLE document_verses(document_id INTEGER,verse_document_id INTEGER);
      CREATE TABLE verse_correspondence(source_verse_id INTEGER,target_verse_id INTEGER);
      CREATE TABLE topics(id INTEGER PRIMARY KEY,name TEXT);
      CREATE TABLE topic_documents(topic_id INTEGER,document_id INTEGER,weight REAL);
      CREATE TABLE document_authority(document_id INTEGER,weight REAL);
      CREATE TABLE search_cross_references(source_document_id INTEGER,target_document_id INTEGER,weight REAL);
      CREATE VIRTUAL TABLE documents_en USING fts5(title,text,keywords);
      CREATE VIRTUAL TABLE documents_sv USING fts5(title,text,keywords);
      CREATE VIRTUAL TABLE vec_documents USING vec0(id INTEGER PRIMARY KEY,embedding float[384] distance_metric=cosine,translation_id INTEGER partition key);`);
    const add = db.prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?)");
    const addVector = db.prepare("INSERT INTO vec_documents VALUES(?,?,?)");
    const vector = new Float32Array(384); vector[0] = 1;
    const bytes = new Uint8Array(vector.buffer);
    db.exec("BEGIN");
    for (let id = 1; id <= 4205; id++) { add.run(id, 1, "John", id, 1, 1, "verse", "", "", id); addVector.run(BigInt(id), bytes, 1n); }
    db.exec("INSERT INTO topics VALUES(1,'mercy'); INSERT INTO search_cross_references VALUES(1,501,1)");
    const addTopic = db.prepare("INSERT INTO topic_documents VALUES(1,?,?)");
    for (let id = 1; id <= 500; id++) addTopic.run(id, 1 / id);
    db.exec("COMMIT");
    const connection = { getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args) };
    const backend = api.createScriptureSearchBackend({ connection, vectorType: "float32", stemSwedish: (value) => value, embedQuery: async () => vector });
    const all = await backend.all("azure lantern stable valley", 1, true);
    assert.equal(all.length, 4205);
    assert.equal(new Set(all.map((item) => item.document.id)).size, 4205);
    assert.ok(all.every((item) => item.sources.includes("semantic")));
    const topic = await backend.all("mercy", 1, true);
    assert.equal(topic.filter((item) => item.sources.includes("topic")).length, 501, "Every associated passage and eligible graph neighbor is retained");
  } finally { db.close(); }
});
