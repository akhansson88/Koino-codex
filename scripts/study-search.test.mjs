import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

const built = await build({ entryPoints: ["features/bible-search/study.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent", external: ["expo-sqlite", "*.db"] });
const { createStudySearch } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const database = new DatabaseSync("assets/bible/study/koino-study-v1.db", { readOnly: true });
const search = createStudySearch({ getAllAsync: async (sql, ...args) => database.prepare(sql).all(...args) });

test("study search prioritizes exact dictionary entries", async () => {
  const baptism = await search.search("baptism");
  assert.ok(baptism[0]?.title.startsWith("Baptism"));
  assert.equal((await search.search("who was Moses"))[0]?.title, "Moses");
  assert.equal((await search.search("grace"))[0]?.title, "Grace");
  assert.equal((await search.search("justification"))[0]?.title, "Justification");
  assert.equal((await search.search("holy spirit"))[0]?.title, "Spirit, Holy");
});

test("mixed study results include dictionary and commentary cards", async () => {
  for (const query of ["Moses", "baptism", "grace"]) {
    const kinds = new Set((await search.search(query, 3)).map((entry) => entry.kind));
    assert.ok(kinds.has("dictionary"), `${query}: dictionary result expected`);
    assert.ok(kinds.has("commentary"), `${query}: commentary result expected`);
  }
});

test("study search returns citations, snippets, limits, and safe empty results", async () => {
  const results = await search.search("baptism", 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, "dictionary");
  assert.ok(results[0].text.length > 100);
  assert.ok(results[0].snippet.length > 20);
  assert.ok(results[0].refs.length > 0);
  assert.deepEqual(await search.search("zzzzzzzz"), []);
  assert.equal((await search.search('"grace" OR ('))[0]?.title, "Grace");
});

test("the built study database has the expected public-domain source metadata", () => {
  const meta = new Map(database.prepare("SELECT key,value FROM meta").all().map(({ key, value }) => [key, value]));
  assert.equal(meta.get("schema_version"), "1");
  assert.equal(meta.get("entry_count"), "9242");
  assert.equal(meta.get("dictionary_count"), "3962");
  assert.equal(meta.get("commentary_count"), "5280");
  assert.match(meta.get("source_commit") ?? "", /^b8e82aa7ca847f4d97fb432cd965e398a111333c$/);
  assert.match(meta.get("license") ?? "", /public domain/i);
  assert.match(meta.get("commentary_license") ?? "", /publicdomain\/mark\/1\.0/i);
});
