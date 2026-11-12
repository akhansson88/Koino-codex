import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const built = await build({ entryPoints: ["features/bible-search/topic-suggestions.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { suggestTopics } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);

test("topic autocomplete suggests real bundled topics", () => {
  assert.ok(suggestTopics("anx").includes("anxiety"));
  assert.ok(suggestTopics("forgiv").includes("forgiveness"));
  assert.ok(suggestTopics("lonel").includes("loneliness"));
  assert.deepEqual(suggestTopics("zzzzzz"), []);
});

test("topic autocomplete respects limits, exact matches, and stability", () => {
  assert.equal(suggestTopics("a", 5).length, 0);
  assert.equal(suggestTopics("anxiety", 3).length, 3);
  assert.ok(!suggestTopics("anxiety", 5).includes("anxiety"));
  assert.deepEqual(suggestTopics("anx", 2), suggestTopics("anx", 2));
});
