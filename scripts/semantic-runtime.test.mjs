import assert from "node:assert/strict";
import { test, after } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fixtures = globalThis.__semanticRuntimeTests = {};
const previousFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (callback) => { queueMicrotask(() => callback(0)); return 1; };
after(() => { globalThis.requestAnimationFrame = previousFrame; delete globalThis.__semanticRuntimeTests; });
let sequence = 0;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const vector = (value = 1) => { const result = new Float32Array(384); result[0] = value; return result; };
async function until(predicate) {
  for (let count = 0; !predicate(); count++) {
    assert.ok(count < 100, "Synthetic native operation did not start");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/** Bundle the production runtime, mocking only native I/O and the encoder boundary. */
async function harness() {
  const key = String(++sequence);
  const state = fixtures[key] = { embeds: [], creations: 0, disposals: 0, running: 0, maxRunning: 0, fileInfo: {}, assets: {} };
  state.embed = async () => vector();
  state.encoder = () => ({
    async embed(text, kind) {
      assert.equal(kind, "query");
      state.embeds.push(text);
      state.running++;
      state.maxRunning = Math.max(state.maxRunning, state.running);
      try { return await state.embed(text); } finally { state.running--; }
    },
    async dispose() { state.disposals++; },
  });
  state.create = async () => state.encoder();
  const fixture = `globalThis.__semanticRuntimeTests[${JSON.stringify(key)}]`;
  const mocks = {
    "expo-asset": `export const Asset={fromModule:id=>${fixture}.assets[id]};`,
    "expo-file-system/legacy": `export const getInfoAsync=async uri=>${fixture}.fileInfo[uri];export const readAsStringAsync=async()=>"{}";`,
    "onnxruntime-react-native": `export const mockedNativeRuntime=true;`,
    "./embedding-core.mjs": `export const E5_DIMENSIONS=384,E5_MAX_TOKENS=512,E5_MODEL_REVISION="761b726dd34fb83930e26aab4e9ac3899aa1fa78";export const createTextEncoder=async options=>{const state=${fixture};state.creations++;return state.create(options);};`,
    "../../assets/bible/search/search-manifest.json": `module.exports=${fixture}.manifest;`,
    "../../assets/bible/search/multilingual-e5-small-int8.onnx": `module.exports="model";`,
    "../../assets/bible/search/multilingual-e5-small.tokenizer": `module.exports="tokenizer";`,
    "../../assets/bible/search/multilingual-e5-small-config.tokenizer": `module.exports="tokenizerConfig";`,
  };
  const built = await build({ entryPoints: ["features/bible-search/semantic-runtime.ts"], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent", plugins: [{ name: "semantic-native-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], loader: "js" }));
  } }] });
  const module = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(require, module, module.exports);
  const api = module.exports;
  state.manifest = { schemaVersion: 1, modelRevision: api.semanticModelMetadata.revision, dimensions: 384, model: { maxTokens: 512 }, assets: {} };
  for (const [name, metadata] of Object.entries(api.semanticModelMetadata.assets)) {
    const md5 = "a".repeat(32), localUri = `file:///mock/${metadata.file}`;
    state.manifest.assets[name] = { ...metadata, md5 };
    state.assets[name] = { name, localUri, hash: md5, downloadAsync: async () => {} };
    state.fileInfo[localUri] = { exists: true, isDirectory: false, size: metadata.bytes, md5 };
  }
  return { api, state };
}

test("canceled queued queries skip native inference while the newest query still runs", async () => {
  const { api, state } = await harness();
  await api.prepareSemanticRuntime();
  const firstInference = deferred();
  state.embed = (text) => text === "first" ? firstInference.promise : Promise.resolve(vector(2));
  const first = api.embedQuery("first");
  await until(() => state.embeds.length === 1);
  const controller = new AbortController();
  const obsolete = api.embedQuery("obsolete", controller.signal);
  const rejected = assert.rejects(obsolete, { name: "AbortError" });
  const latest = api.embedQuery("latest");
  controller.abort();
  firstInference.resolve(vector());
  await first;
  await rejected;
  assert.equal((await latest)[0], 2);
  assert.deepEqual(state.embeds, ["first", "latest"]);
  assert.equal(state.maxRunning, 1, "Native model calls remain serialized");
  assert.equal(state.creations, 1);
  await api.resetSemanticRuntime();
});

test("cancellation during model preparation skips inference and leaves preparation reusable", async () => {
  const { api, state } = await harness();
  const preparation = deferred();
  state.create = () => preparation.promise;
  const statuses = [];
  const unsubscribe = api.subscribeSemanticRuntime((status) => statuses.push(status.state));
  const controller = new AbortController();
  const canceled = api.embedQuery("old query", controller.signal);
  const rejected = assert.rejects(canceled, { name: "AbortError" });
  await until(() => state.creations === 1);
  controller.abort();
  preparation.resolve(state.encoder());
  await rejected;
  assert.deepEqual(state.embeds, []);
  await api.embedQuery("new query");
  assert.deepEqual(state.embeds, ["new query"]);
  assert.equal(state.creations, 1);
  assert.deepEqual(statuses, ["loading", "ready"]);
  unsubscribe();
  await api.resetSemanticRuntime();
  assert.deepEqual(statuses, ["loading", "ready"], "Unsubscribed observers do not receive future state");
});

test("duplicate requests share the completed cache, and reset clears it and disposes the encoder", async () => {
  const { api, state } = await harness();
  await api.prepareSemanticRuntime();
  const inference = deferred();
  state.embed = () => inference.promise;
  const first = api.embedQuery("hope");
  const duplicate = api.embedQuery(" hope ");
  await until(() => state.embeds.length === 1);
  const expected = vector();
  inference.resolve(expected);
  assert.equal(await first, expected);
  assert.equal(await duplicate, expected);
  assert.equal(await api.embedQuery("hope"), expected);
  assert.deepEqual(state.embeds, ["hope"]);
  const canceled = new AbortController(); canceled.abort();
  await assert.rejects(api.embedQuery("hope", canceled.signal), { name: "AbortError" });
  await api.resetSemanticRuntime();
  assert.equal(state.disposals, 1);
  assert.equal(api.getSemanticRuntimeStatus().state, "idle");
  state.embed = async () => vector(3);
  assert.equal((await api.embedQuery("hope"))[0], 3);
  assert.deepEqual(state.embeds, ["hope", "hope"]);
  assert.equal(state.creations, 2);
  await api.resetSemanticRuntime();
});

test("a failed native initialization or inference does not poison the next query", async () => {
  const { api, state } = await harness();
  state.create = async () => { throw new Error("Native model unavailable"); };
  await assert.rejects(api.embedQuery("hope"), /Native model unavailable/);
  assert.equal(api.getSemanticRuntimeStatus().state, "error");
  state.create = async () => state.encoder();
  state.embed = async () => { throw new Error("Transient inference failure"); };
  await assert.rejects(api.embedQuery("hope"), /Transient inference failure/);
  state.embed = async () => vector();
  assert.equal((await api.embedQuery("hope"))[0], 1);
  assert.equal(api.getSemanticRuntimeStatus().state, "ready");
  assert.equal(state.creations, 2);
  assert.deepEqual(state.embeds, ["hope", "hope"]);
  await api.resetSemanticRuntime();
});

test("reset during in-flight inference rejects the old result instead of repopulating the cache", async () => {
  const { api, state } = await harness();
  await api.prepareSemanticRuntime();
  const inference = deferred();
  state.embed = () => inference.promise;
  const old = api.embedQuery("hope");
  const rejected = assert.rejects(old, /reset/);
  await until(() => state.embeds.length === 1);
  await api.resetSemanticRuntime();
  inference.resolve(vector(1));
  await rejected;
  state.embed = async () => vector(4);
  assert.equal((await api.embedQuery("hope"))[0], 4);
  assert.equal(state.creations, 2);
  assert.deepEqual(state.embeds, ["hope", "hope"]);
  await api.resetSemanticRuntime();
});
