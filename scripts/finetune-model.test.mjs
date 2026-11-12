import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as runtime from "onnxruntime-node";
import { createTextEncoder, E5_DIMENSIONS, E5_MODEL_REVISION } from "../features/bible-search/embedding-core.mjs";

const root = path.resolve(import.meta.dirname, "..");
const asset = (name) => path.join(root, "assets/bible/search", name);
const hash = (file, algorithm = "sha256") => createHash(algorithm).update(readFileSync(file)).digest("hex");
const lock = JSON.parse(readFileSync(path.join(root, "scripts/hybrid-search/sources.lock.json"), "utf8"));
const manifest = JSON.parse(readFileSync(asset("search-manifest.json"), "utf8"));
const modelPath = asset("multilingual-e5-small-int8.onnx");
const modelLock = lock.sources.find((entry) => entry.path === "assets/bible/search/multilingual-e5-small-int8.onnx");

test("the installed model is pinned and the manifest matches the runtime and index", () => {
  assert.equal(lock.modelRevision, E5_MODEL_REVISION);
  assert.equal(manifest.modelRevision, E5_MODEL_REVISION);
  assert.equal(manifest.model.revision, E5_MODEL_REVISION);
  if (modelLock.localOnly) assert.equal(modelLock.training, "scripts/finetune");
  assert.equal(modelLock.bytes, statSync(modelPath).size);
  assert.equal(modelLock.sha256, hash(modelPath));
  assert.equal(manifest.assets.model.bytes, statSync(modelPath).size);
  assert.equal(manifest.assets.model.sha256, modelLock.sha256);
  assert.equal(manifest.assets.database.sha256, hash(asset("koino-search-v1.db")));
});

test("the installed model loads through the production encoder and matches the index metadata", async () => {
  const tokenizerJson = JSON.parse(readFileSync(asset("multilingual-e5-small.tokenizer"), "utf8"));
  const tokenizerConfig = JSON.parse(readFileSync(asset("multilingual-e5-small-config.tokenizer"), "utf8"));
  const encoder = await createTextEncoder({ runtime, modelPath, tokenizerJson, tokenizerConfig });
  try {
    const vector = await encoder.embed("what does the bible say about anxiety", "query");
    assert.equal(vector.length, E5_DIMENSIONS);
    const norm = Math.hypot(...vector);
    assert.ok(Math.abs(norm - 1) < 1e-5, `embedding norm ${norm}`);
    const database = new DatabaseSync(asset("koino-search-v1.db"), { readOnly: true });
    try {
      const metadata = new Map(database.prepare("SELECT key,value FROM meta").all().map(({ key, value }) => [key, value]));
      assert.equal(metadata.get("model_revision"), E5_MODEL_REVISION);
      assert.equal(metadata.get("dimensions"), String(E5_DIMENSIONS));
    } finally {
      database.close();
    }
  } finally {
    await encoder.dispose();
  }
});
