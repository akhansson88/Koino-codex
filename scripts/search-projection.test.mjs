import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const built = await build({ entryPoints: ["features/bible-search/retrieval.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { projectSearchDocuments, reciprocalRankFusion, createScriptureSearchBackend, isBroadTopicMatch, canonicalTopicLabel } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const document = (id, translation, book, chapter, first, last = first, kind = "verse") => ({ id, translation_id: translation, book, chapter, start_verse: first, end_verse: last, kind, title: "Native section", text: `Local verse ${id}`, canonical_order: id });

function fixture() {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  db.exec(`CREATE TABLE documents(id INTEGER PRIMARY KEY,translation_id INTEGER,book TEXT,chapter INTEGER,start_verse INTEGER,end_verse INTEGER,kind TEXT,title TEXT,text TEXT,canonical_order INTEGER);
    CREATE TABLE document_verses(document_id INTEGER,verse_document_id INTEGER,PRIMARY KEY(document_id,verse_document_id));
    CREATE TABLE verse_correspondence(source_verse_id INTEGER,target_verse_id INTEGER,PRIMARY KEY(source_verse_id,target_verse_id));`);
  const add = (doc, members = [doc.id]) => {
    db.prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?)").run(...Object.values(doc));
    for (const id of members) db.prepare("INSERT INTO document_verses VALUES(?,?)").run(doc.id, id);
    return doc;
  };
  const map = (source, target) => {
    db.prepare("INSERT INTO verse_correspondence VALUES(?,?),(?,?)").run(source, target, target, source);
  };
  return { db, add, map, connection: { getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args) } };
}

test("corpus projection uses correspondence for Psalm headings and one-to-many native verses", async () => {
  const { db, add, map, connection } = fixture();
  try {
    const kjv = add(document(1, 1, "Psalms", 3, 1));
    const svHeading = add(document(101, 2, "Psalms", 3, 1));
    const sv = add(document(102, 2, "Psalms", 3, 2));
    map(kjv.id, sv.id);
    assert.deepEqual(await projectSearchDocuments(connection, [kjv], 2), [sv]);
    assert.deepEqual(await projectSearchDocuments(connection, [svHeading], 1), [], "Unmapped native headings are omitted, not assigned a false equivalent");
    assert.deepEqual(await projectSearchDocuments(connection, [svHeading], 2), [svHeading]);
    const single = add(document(2, 1, "1 Samuel", 20, 42));
    const first = add(document(103, 2, "1 Samuel", 20, 42));
    const last = add(document(104, 2, "1 Samuel", 20, 43));
    map(single.id, first.id); map(single.id, last.id);
    const [range] = await projectSearchDocuments(connection, [single], 2);
    assert.deepEqual([range.start_verse, range.end_verse, range.kind], [42, 43, "passage"]);
    assert.equal(Number.isSafeInteger(range.id), true); assert.ok(range.id < 0);
    assert.equal((await projectSearchDocuments(connection, [single], 2))[0].id, range.id, "Projected range IDs are stable");
  } finally { db.close(); }
});

test("projection splits native chapter boundaries and holes while preserving passage kind", async () => {
  const { db, add, map, connection } = fixture();
  try {
    const verse = add(document(1, 1, "Revelation", 13, 1));
    const before = add(document(101, 2, "Revelation", 12, 18));
    const after = add(document(102, 2, "Revelation", 13, 1));
    map(1, 101); map(1, 102);
    const boundary = await projectSearchDocuments(connection, [verse], 2);
    assert.deepEqual(boundary.map((doc) => [doc.chapter, doc.start_verse, doc.end_verse]), [[12,18,18], [13,1,1]]);
    const sourceFirst = add(document(2, 1, "John", 3, 1));
    const sourceLast = add(document(3, 1, "John", 3, 2));
    const nativeFirst = add(document(103, 2, "John", 3, 1));
    const nativeLast = add(document(104, 2, "John", 3, 3));
    map(sourceFirst.id, nativeFirst.id); map(sourceLast.id, nativeLast.id);
    const window = add(document(1000, 1, "John", 3, 1, 2, "window"), [2,3]);
    const ranges = await projectSearchDocuments(connection, [window], 2);
    assert.deepEqual(ranges.map((doc) => [doc.start_verse, doc.end_verse, doc.kind]), [[1,1,"window"], [3,3,"window"]], "A missing native verse never becomes an invented continuous passage");
    const controller = new AbortController(); controller.abort();
    await assert.rejects(projectSearchDocuments(connection, [window], 2, controller.signal), { name: "AbortError" });
  } finally { db.close(); }
});

test("native and projected evidence share range identity without duplicate source votes", () => {
  const native = document(101, 2, "John", 3, 16, 17, "passage");
  const projected = { ...native, id: -1010017, kind: "window" };
  const ranked = reciprocalRankFusion([
    { source: "lexical", documents: [native] },
    { source: "lexical", documents: [projected] },
    { source: "semantic", documents: [projected] },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].score, 2/61);
  assert.deepEqual(ranked[0].sources, ["lexical", "semantic"]);
  assert.equal(reciprocalRankFusion([{ source: "lexical", documents: [native, { ...native, translation_id: 1 }] }]).length, 2);
});

test("broad-topic matching rejects one-word matches inside short narratives", () => {
  assert.equal(isBroadTopicMatch(["speaking", "donkey"], "speaking", .98, .98), false);
  assert.equal(isBroadTopicMatch(["axe", "floating"], "floating", .99, .99), false);
  assert.equal(isBroadTopicMatch(["holy", "spirit", "speaking"], "holy spirit", .97, .97), false);
  assert.equal(isBroadTopicMatch(["grace"], "grace", .7, .9), true);
  assert.equal(isBroadTopicMatch(["nåd"], "grace", .88, .89), true);
  assert.equal(isBroadTopicMatch(["nåd"], "noahs ark", .99, .99), false);
  assert.equal(isBroadTopicMatch(["nåd"], "jonah", .99, .99), false);
  assert.equal(isBroadTopicMatch(["grace"], "gracious", .99, .99), false);
  assert.equal(isBroadTopicMatch(["sinnesro"], "peace of mind", .7, .9), true);
  assert.equal(isBroadTopicMatch(["holy", "spirit"], "holy spirit", .8, .9), true);
  for (const [english, swedish] of [["anxiety","oro"], ["hope","hopp"], ["forgiveness","förlåtelse"], ["identity","identitet"], ["loneliness","ensamhet"], ["purpose","mening"], ["prayer","bön"]]) {
    assert.equal(canonicalTopicLabel([english]), english);
    assert.equal(canonicalTopicLabel([swedish]), english);
  }
});

test("Swedish concept labels resolve their canonical topic directly without admitting unrelated nearby names", async () => {
  const grace = document(102,2,"Ephesians",2,8);
  const connection = { getAllAsync: async (sql, ...args) => {
    if (sql.includes("FROM vec_documents")) return [];
    if (sql.includes("FROM vec_topics")) return [{ id: 1, name: "noahs ark", distance: .01 }];
    if (sql === "SELECT id,name FROM topics WHERE name=?") { assert.equal(args[0], "grace"); return [{ id: 2, name: "grace" }]; }
    if (sql.includes("FROM topic_documents")) { assert.deepEqual(args, [2,2,120]); return [grace]; }
    if (sql.includes("WITH neighbors AS")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const backend = createScriptureSearchBackend({ connection, vectorType: "float32", stemSwedish: (text) => text, embedQuery: async () => new Float32Array(384) });
  const results = await backend.hybrid("nåd", 2, [], 20);
  assert.deepEqual(results.map((item) => item.document), [grace]);
  assert.deepEqual(results[0].sources, ["topic"]);
});

const actualAsset = path.resolve("assets/bible/search/koino-search-v1.db");
test("both language suggestion labels resolve to real bundled topics", { skip: !existsSync(actualAsset) && "Build the bundled search asset first" }, () => {
  const db = new DatabaseSync(actualAsset, { readOnly: true });
  try {
    for (const [english, swedish] of [["anxiety","oro"], ["hope","hopp"], ["forgiveness","förlåtelse"], ["identity","identitet"], ["loneliness","ensamhet"], ["purpose","mening"], ["prayer","bön"], ["grace","nåd"], ["love","kärlek"], ["faith","tro"], ["peace","frid"], ["peace of mind","sinnesro"]]) {
      const lookup = (label) => db.prepare("SELECT id FROM topics WHERE name=?").get(canonicalTopicLabel([label]))?.id;
      assert.ok(lookup(english), `${english}: bundled topic missing`);
      assert.equal(lookup(swedish), lookup(english), `${swedish}: labels must resolve to the same actual topic`);
    }
  } finally { db.close(); }
});

const extension = process.env.SQLITE_VEC_EXTENSION ?? path.resolve("scripts/hybrid-search/.deps/sqlite_vec", process.platform === "win32" ? "vec0.dll" : process.platform === "darwin" ? "vec0.dylib" : "vec0.so");
test("dual-corpus lexical and KNN retrieve foreign evidence as exact selected native ranges", { skip: !existsSync(extension) && "Install the pinned build-only sqlite-vec extension" }, async () => {
  const { db, add, map, connection } = fixture();
  try {
    db.loadExtension(extension);
    db.exec(`CREATE VIRTUAL TABLE documents_en USING fts5(title,text,metadata,tokenize='porter unicode61');
      CREATE VIRTUAL TABLE documents_sv USING fts5(title,text,metadata);
      CREATE VIRTUAL TABLE vec_documents USING vec0(id INTEGER PRIMARY KEY,embedding float[384] distance_metric=cosine,translation_id INTEGER partition key);`);
    const foreign = add({ ...document(1,1,"Numbers",22,30), text: "The donkey spoke" });
    const selected = add({ ...document(102,2,"Numbers",22,31), text: "Åsnan talade" });
    const unrelated = add(document(103,2,"Acts",2,8));
    map(foreign.id, selected.id);
    db.prepare("INSERT INTO documents_en(rowid,title,text,metadata) VALUES(?,?,?,?)").run(foreign.id, foreign.title, foreign.text, "speaking donkey");
    db.prepare("INSERT INTO documents_sv(rowid,title,text,metadata) VALUES(?,?,?,?)").run(selected.id, selected.title, selected.text, "");
    const unit = (x, y) => { const v = new Float32Array(384); v[0] = x; v[1] = y; return new Uint8Array(v.buffer); };
    const vector = db.prepare("INSERT INTO vec_documents VALUES(?,?,?)");
    vector.run(1n, unit(1,0), 1n); vector.run(102n, unit(.7,.7), 2n); vector.run(103n, unit(.9,.1), 2n);
    const backend = createScriptureSearchBackend({ connection, vectorType: "float32", stemSwedish: (text) => text, embedQuery: async () => new Float32Array(unit(1,0).buffer) });
    const lexical = await backend.lexical("speaking donkey", 2, 20);
    assert.equal(lexical[0].document.id, selected.id, "English FTS evidence projects through the shifted native verse mapping");
    const allLexical = await backend.all("speaking donkey", 2, false);
    assert.equal(allLexical[0].document.id, selected.id, "Complete lexical paging keeps audited bilingual projection");
    // More than three terms deliberately avoids topic lookup, isolating the semantic branches.
    const hybrid = await backend.hybrid("the animal unexpectedly spoke aloud", 2, [], 20);
    assert.equal(hybrid[0].document.id, selected.id, "The global best cosine may come from the foreign corpus");
    assert.equal(hybrid.every((item) => item.document.translation_id === 2), true);
    assert.deepEqual(hybrid[0].sources, ["semantic"]);
    const allSemantic = await backend.all("the animal unexpectedly spoke aloud", 2, true);
    assert.equal(allSemantic[0].document.id, selected.id, "Complete semantic paging projects foreign matches into native ranges");
    assert.equal(allSemantic.every((item) => item.document.translation_id === 2), true);
  } finally { db.close(); }
});
