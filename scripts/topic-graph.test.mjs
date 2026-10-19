import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const built = await build({ entryPoints: ["features/bible-search/topic-graph.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { expandTopicGraphCandidates } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const extension = process.env.SQLITE_VEC_EXTENSION ?? path.resolve("scripts/hybrid-search/.deps/sqlite_vec", process.platform === "win32" ? "vec0.dll" : process.platform === "darwin" ? "vec0.dylib" : "vec0.so");
const unit = (axis = 0) => { const value = new Float32Array(384); value[axis] = 1; return value; };
const document = (id, translation = 1, canonical = id) => ({ id, translation_id: translation, book: "John", chapter: 3, start_verse: id, end_verse: id, kind: "verse", title: "Grace", text: "Exact local text", canonical_order: canonical });
const options = (connection, topicDocuments, extra = {}) => ({ connection, topicDocuments, hasTopicMatch: true, contentTerms: ["grace"], translationId: 1, queryVector: unit(), vectorType: "float32", ...extra });

test("graph expansion requires a matched broad concept and never queries for narrative requests", async () => {
  let calls = 0;
  const connection = { getAllAsync: async () => { calls++; throw new Error("Unexpected graph lookup"); } };
  const direct = [document(1)];
  for (const extra of [{ hasTopicMatch: false }, { contentTerms: [] }, { contentTerms: ["borrowed", "iron", "tool", "water"] }, { translationId: 2 }]) {
    assert.deepEqual(await expandTopicGraphCandidates(options(connection, direct, extra)), direct);
  }
  assert.equal(calls, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(expandTopicGraphCandidates(options(connection, direct, { signal: controller.signal })), { name: "AbortError" });
});

function database(vectorType) {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  db.loadExtension(extension);
  db.exec(`CREATE TABLE documents(id INTEGER PRIMARY KEY,translation_id INTEGER,book TEXT,chapter INTEGER,start_verse INTEGER,end_verse INTEGER,kind TEXT,title TEXT,text TEXT,canonical_order INTEGER);
    CREATE TABLE search_cross_references(source_document_id INTEGER,target_document_id INTEGER,weight REAL);
    CREATE VIRTUAL TABLE vec_documents USING vec0(id INTEGER PRIMARY KEY,embedding ${vectorType === "int8" ? "int8" : "float"}[384] distance_metric=cosine,translation_id INTEGER partition key);`);
  const insertDocument = db.prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?)");
  const insertVector = db.prepare(vectorType === "int8" ? "INSERT INTO vec_documents VALUES(?,vec_quantize_int8(?,'unit'),?)" : "INSERT INTO vec_documents VALUES(?,?,?)");
  const add = (doc, embedding = unit()) => {
    insertDocument.run(...Object.values(doc));
    insertVector.run(BigInt(doc.id), new Uint8Array(embedding.buffer), BigInt(doc.translation_id));
  };
  const edge = (source, target, weight) => db.prepare("INSERT INTO search_cross_references VALUES(?,?,?)").run(source, target, weight);
  return { db, add, edge, connection: { getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args) } };
}

for (const vectorType of ["float32", "int8"]) test(`one-hop ${vectorType} expansion preserves direct rankings, cosine relevance, and translation`, { skip: !existsSync(extension) && "Install the pinned build-only sqlite-vec extension" }, async () => {
  const { db, add, edge, connection } = database(vectorType);
  try {
    const direct = [document(1), document(2)];
    [direct[0], direct[1], document(10, 1, 11), document(11, 1, 10), document(12), document(13, 2), document(14)].forEach((doc) => add(doc, doc.id === 12 ? unit(1) : unit()));
    edge(1, 10, 8); edge(2, 11, 8); edge(1, 12, 100); edge(1, 13, 100); edge(1, 2, 100); edge(10, 14, 100);
    const expanded = await expandTopicGraphCandidates(options(connection, direct, { vectorType }));
    assert.deepEqual(expanded.map((doc) => doc.id), [1, 2, 11, 10], "Direct topic ranking stays first; relevant neighbors sort deterministically");
    assert.equal(expanded.some((doc) => doc.id === 12), false, "A strong edge cannot admit an unrelated vector");
    assert.equal(expanded.some((doc) => doc.id === 13), false, "Graph evidence stays in the selected translation");
    assert.equal(expanded.some((doc) => doc.id === 14), false, "Expansion does not recursively traverse a second hop");
    assert.deepEqual(direct, [document(1), document(2)], "Topic candidates are not mutated");
  } finally { db.close(); }
});

test("graph fan-out is capped at eight seeds and 48 one-hop neighbors", { skip: !existsSync(extension) && "Install the pinned build-only sqlite-vec extension" }, async () => {
  const { db, add, edge, connection } = database("float32");
  try {
    const direct = Array.from({ length: 9 }, (_, index) => document(index + 1));
    direct.forEach((doc) => add(doc));
    direct.slice(1).forEach((doc) => edge(1, doc.id, 1000));
    for (let id = 20; id < 80; id++) { add(document(id)); edge(1, id, id); }
    add(document(100)); edge(9, 100, 1000);
    const expanded = await expandTopicGraphCandidates(options(connection, direct));
    assert.equal(expanded.length, direct.length + 48);
    assert.deepEqual(expanded.slice(direct.length).map((doc) => doc.id), Array.from({ length: 48 }, (_, index) => 79 - index));
    assert.equal(expanded.some((doc) => doc.id === 100), false, "The ninth topic seed is not expanded");
  } finally { db.close(); }
});
