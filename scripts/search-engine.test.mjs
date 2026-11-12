import assert from "node:assert/strict";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

const built = await build({ bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  stdin: { contents: 'export * from "./features/bible-search.ts"; export {setBibleDatabaseForTesting} from "./features/bible-database.ts";', resolveDir: process.cwd() },
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
const doc = { document: { id: 1, translation_id: 1, book: "John", chapter: 3, start_verse: 16, end_verse: 16, kind: "verse", title: "", text: "", canonical_order: 1 }, score: 1, sources: ["lexical"] };

test("precise mode uses keyword lookup and never loads the semantic model", async () => {
  let hybridCalls = 0;
  let lexicalMode;
  api.setScriptureSearchBackendForTesting({
    lexical: async (_query, _translation, _limit, options) => { lexicalMode = options?.mode; return [doc]; },
    hybrid: async () => { hybridCalls++; throw new Error("Precise search must not run semantic inference"); },
  });
  const response = await api.searchScripture({ query: "how do I deal with grief", versionId: "kjv", language: "en", engine: "precise" });
  assert.equal(lexicalMode, "keyword");
  assert.equal(response.mode, "lexical");
  assert.equal(response.semanticState, "ready");
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].verse.reference, "John 3:16");
  assert.equal(hybridCalls, 0);
});

test("smart mode still runs the hybrid ranking", async () => {
  let hybridCalls = 0;
  api.setScriptureSearchBackendForTesting({
    lexical: async () => [doc],
    hybrid: async () => { hybridCalls++; return [doc]; },
  });
  const response = await api.searchScripture({ query: "how do I deal with grief", versionId: "kjv", language: "en" });
  assert.equal(response.mode, "hybrid");
  assert.equal(hybridCalls, 1);
});

test("precise paging asks the complete index for keyword mode", async () => {
  let allMode;
  const documents = Array.from({ length: 24 }, (_, index) => ({ ...doc, document: { ...doc.document, id: index + 1, start_verse: 16, end_verse: 16 } }));
  api.setScriptureSearchBackendForTesting({
    lexical: async () => documents.slice(0, 20),
    hybrid: async () => documents.slice(0, 20),
    all: async (_query, _translation, _semantic, _signal, options) => { allMode = options?.mode; return documents; },
  });
  const session = api.createScriptureSearchPageSession({ language: "en", versionId: "kjv", query: "a search", engine: "precise", limit: 20 });
  await session.firstPage();
  await session.nextPage();
  assert.equal(allMode, "keyword");
  session.dispose();
});
