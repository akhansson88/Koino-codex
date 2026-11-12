import assert from "node:assert/strict";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { normalizeSwedishForSearch } from "./hybrid-search/lexical.mjs";

const built = await build({ bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  stdin: { contents: 'export * from "./features/bible-search.ts"; export * from "./features/bible-search/retrieval.ts"; export {setBibleDatabaseForTesting} from "./features/bible-database.ts";', resolveDir: process.cwd() },
  plugins: [{ name: "native-boundary", setup(builder) { builder.onResolve({ filter: /bible-search\/native-backend$/ }, () => ({ path: "missing-native-search", external: true })); } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const reader = new DatabaseSync("assets/bible/koino-bible-v2.db", { readOnly: true });
const search = new DatabaseSync("assets/bible/search/koino-search-v1.db", { readOnly: true });
after(() => { reader.close(); search.close(); });
api.setBibleDatabaseForTesting({
  getAllSync: (sql, ...args) => reader.prepare(sql).all(...args),
  getFirstSync: (sql, ...args) => reader.prepare(sql).get(...args),
  getAllAsync: async (sql, ...args) => reader.prepare(sql).all(...args),
});
const oldBooks = new Set(api.testamentBooks({ testament: "old" }));
const newBooks = new Set(api.testamentBooks({ testament: "new" }));
const doc = { document: { id: 1, translation_id: 1, book: "John", chapter: 3, start_verse: 16, end_verse: 16, kind: "verse", title: "", text: "", canonical_order: 1 }, score: 1, sources: ["lexical"] };

test("lexical and complete paging honor the testament scope", async () => {
  const backend = api.createScriptureSearchBackend({
    connection: { getAllAsync: async (sql, ...args) => search.prepare(sql).all(...args) },
    stemSwedish: normalizeSwedishForSearch,
    embedQuery: async () => { throw new Error("Lexical scope tests must not load inference"); },
  });
  const oldLexical = await backend.lexical("God", 1, 20, { scope: { testament: "old" } });
  assert.ok(oldLexical.length > 0);
  assert.ok(oldLexical.every(({ document }) => oldBooks.has(document.book)));
  const oldAll = await backend.all("God", 1, false, undefined, { scope: { testament: "old" } });
  assert.ok(oldAll.length > 0);
  assert.ok(oldAll.every(({ document }) => oldBooks.has(document.book)));
  const newAll = await backend.all("Jesus", 1, false, undefined, { scope: { testament: "new" } });
  assert.ok(newAll.length > 0);
  assert.ok(newAll.every(({ document }) => newBooks.has(document.book)));
  const psalms = await backend.all("God", 1, false, undefined, { scope: { book: "Psalms" } });
  assert.ok(psalms.length > 0);
  assert.ok(psalms.every(({ document }) => document.book === "Psalms"));
  const psalmsLexical = await backend.lexical("God", 1, 20, { scope: { book: "Psalms" } });
  assert.ok(psalmsLexical.length > 0);
  assert.ok(psalmsLexical.every(({ document }) => document.book === "Psalms"));
});

test("the UI scope options reach preview search and hybrid ranking", async () => {
  let lexicalScope, hybridScope;
  api.setScriptureSearchBackendForTesting({
    lexical: async (_query, _translation, _limit, options) => { lexicalScope = options?.scope; return [doc]; },
    hybrid: async (_query, _translation, _lexical, _limit, _signal, scope) => { hybridScope = scope; return [doc]; },
  });
  const response = await api.searchScripture({ query: "God", versionId: "kjv", language: "en", testament: "old", book: "Psalms" });
  assert.deepEqual(lexicalScope, { testament: "old", book: "Psalms" });
  assert.deepEqual(hybridScope, { testament: "old", book: "Psalms" });
  assert.equal(response.results.length, 1);
});

test("paged search carries the testament and book scope into complete indexing", async () => {
  let allScope;
  api.setScriptureSearchBackendForTesting({
    lexical: async () => [doc],
    hybrid: async () => [doc],
    all: async (_query, _translation, _semantic, _signal, options) => { allScope = options?.scope; return [doc]; },
  });
  const session = api.createScriptureSearchPageSession({ language: "en", versionId: "kjv", query: "God", testament: "new", book: "Matthew", limit: 20 });
  await session.firstPage();
  await session.nextPage();
  assert.deepEqual(allScope, { testament: "new", book: "Matthew" });
  session.dispose();
});
