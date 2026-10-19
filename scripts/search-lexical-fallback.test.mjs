import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { normalizeSwedishForSearch } from "./hybrid-search/lexical.mjs";

const bundled = await build({ entryPoints: ["features/bible-search/retrieval.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { createScriptureSearchBackend } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE documents(id INTEGER PRIMARY KEY,translation_id INTEGER,book TEXT,chapter INTEGER,start_verse INTEGER,end_verse INTEGER,kind TEXT,title TEXT,text TEXT,canonical_order INTEGER);
    CREATE TABLE document_verses(document_id INTEGER,verse_document_id INTEGER,PRIMARY KEY(document_id,verse_document_id));
    CREATE TABLE verse_correspondence(source_verse_id INTEGER,target_verse_id INTEGER,PRIMARY KEY(source_verse_id,target_verse_id));
    CREATE VIRTUAL TABLE documents_en USING fts5(title,text,keywords,tokenize='porter unicode61');
    CREATE VIRTUAL TABLE documents_sv USING fts5(title,text,keywords,tokenize='unicode61');`);
  const probes = [];
  const connection = { getAllAsync: async (sql, ...args) => {
    if (sql.includes(" MATCH ")) probes.push({ corpus: sql.includes("documents_en") ? 1 : 2, expression: args[0] });
    return db.prepare(sql).all(...args);
  } };
  const add = (id, translation, text, canonicalOrder = id) => {
    const doc = { id, translation_id: translation, book: "John", chapter: 1, start_verse: id, end_verse: id, kind: "verse", title: "", text, canonical_order: canonicalOrder };
    db.prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?)").run(...Object.values(doc));
    db.prepare("INSERT INTO document_verses VALUES(?,?)").run(id,id);
    db.prepare(`INSERT INTO ${translation === 1 ? "documents_en" : "documents_sv"}(rowid,title,text,keywords) VALUES(?,?,?,?)`).run(id,"",translation === 2 ? normalizeSwedishForSearch(text) : text,"");
    return doc;
  };
  const map = (source, target) => db.prepare("INSERT INTO verse_correspondence VALUES(?,?),(?,?)").run(source,target,target,source);
  const backend = createScriptureSearchBackend({ connection, stemSwedish: normalizeSwedishForSearch, embedQuery: async () => { throw new Error("Lexical lookup must not load the model"); } });
  return { db, add, map, probes, backend };
}

test("a strong corpus match blocks foreign OR hits and weak same-corpus tails", async () => {
  const { db, add, map, probes, backend } = fixture();
  try {
    add(1,1,"hamn");
    const strong = add(101,2,"lykta hamn");
    add(102,2,"lykta");
    add(103,2,"annan text"); map(1,103);
    const results = await backend.lexical("lykta hamn",2,20);
    assert.deepEqual(results.map((row) => row.document.id),[strong.id]);
    assert.equal(probes.some(({ expression }) => expression.includes(" OR ") || expression.includes("*")),false,"No fallback query may run in either corpus after a strong hit");
    assert.deepEqual(new Set(probes.map(({ corpus }) => corpus)),new Set([1,2]));
    assert.equal(results[0].score,1/61,"The strong result receives one lexical source vote");
  } finally { db.close(); }
});

test("NEAR results precede additional AND matches without filling the branch with OR hits", async () => {
  const { db, add, probes, backend } = fixture();
  try {
    const near = add(101,2,"lykta hamn",1000);
    const distant = add(102,2,`lykta ${"ljus ".repeat(20)}hamn`,1);
    add(103,2,"lykta");
    const results = await backend.lexical("lykta hamn",2,20);
    assert.deepEqual(results.map((row) => row.document.id),[near.id,distant.id]);
    assert.equal(probes.some(({ expression }) => expression.includes(" OR ")),false);
  } finally { db.close(); }
});

test("OR fallback searches both corpora only after both strong branches are empty", async () => {
  const { db, add, map, probes, backend } = fixture();
  try {
    add(1,1,"hamn");
    add(101,2,"lykta");
    add(102,2,"annan text"); map(1,102);
    const results = await backend.lexical("lykta hamn",2,20);
    assert.deepEqual(new Set(results.map((row) => row.document.id)),new Set([101,102]));
    assert.deepEqual(probes.slice(-2).map(({ corpus, expression }) => [corpus,expression.includes(" OR ")]),[[1,true],[2,true]]);
    assert.equal(probes.some(({ expression }) => expression.includes("*")),false,"An OR hit in either corpus blocks prefix recovery globally");
  } finally { db.close(); }
});

test("prefix recovery runs only after whole-token lookup is empty in both corpora", async () => {
  const { db, add, probes, backend } = fixture();
  try {
    add(101,2,"fyrtorn hamn");
    const results = await backend.lexical("fyr ham",2,20);
    assert.deepEqual(results.map((row) => row.document.id),[101]);
    assert.equal(probes.length,8,"Each corpus probes NEAR, AND, OR and then prefix");
    assert.deepEqual(probes.slice(-2).map(({ corpus, expression }) => [corpus,expression.includes("*")]),[[1,true],[2,true]]);
  } finally { db.close(); }
});
