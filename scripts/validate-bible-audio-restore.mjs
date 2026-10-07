import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const entry = { bookId: 43, book: "John", bookName: "Johannesevangeliet", chapter: 1, revision: "test", sourceHash: "source", manifestUrl: "https://github.com/akhansson88/reformationsbibeln-audio/releases/download/audio-test/chapter.json" };
const catalog = { schemaVersion: 1, translation: "reformationsbibeln2026", chapters: { "43:1": entry } };
const passage = { startVerse: 3, endVerse: 5, savedVerseId: "saved-passage" };
const snapshot = { loading: false };
let scenario;
globalThis.__audioRestoreTest = {
  snapshot,
  storage: {
    getItem: async key => key === "koino.audio.catalog.v1" ? JSON.stringify(catalog) : scenario.stored,
    setItem: async () => {},
  },
  engine: {
    subscribe: () => () => {}, getSnapshot: () => snapshot,
    getSessionGeneration: () => scenario.generation,
    setAudioCatalog: () => {}, applyAudioCatalog: async () => {},
    observeForeground: () => () => {},
    hasNativeQueue: async () => {
      if (scenario.advanceGeneration) scenario.generation++;
      return scenario.nativeQueue ?? false;
    },
    ensurePlayer: async () => { scenario.nativeInitialized = true; },
    syncFromNative: async () => { scenario.nativeSynced = true; },
    isAudioPassage: value => { scenario.validatedPassage = value; return scenario.passageValid; },
    setSpeed: async speed => { scenario.speed = speed; },
    start: async (...args) => { scenario.start = args; },
    startPassage: () => {}, stop: async () => {}, savePosition: async () => {},
    adjacent: () => undefined,
  },
};
globalThis.fetch = async () => ({ ok: true, json: async () => catalog });

const result = await build({
  entryPoints: ["features/bible-audio/provider.tsx"], bundle: true, format: "cjs", platform: "node", jsx: "automatic", write: false, logLevel: "silent",
  external: ["react", "react/jsx-runtime"],
  plugins: [{ name: "provider-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(react-native|@\/state\/encryption\/local-storage|\.\/engine)$/ }, ({ path }) => ({ path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: path === "react-native"
      ? `export const AppState = { currentState: "active", addEventListener: () => ({ remove: () => {} }) };`
      : path === "./engine"
        ? `export const {subscribe,getSnapshot,getSessionGeneration,setAudioCatalog,applyAudioCatalog,observeForeground,hasNativeQueue,ensurePlayer,syncFromNative,isAudioPassage,setSpeed,start,startPassage,stop,savePosition,adjacent,toggle,move,moveChapter,seek,setContinuous,setSleep,retry}=globalThis.__audioRestoreTest.engine;`
        : `export default globalThis.__audioRestoreTest.storage;`, loader: "js" }));
  } }],
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
const { BibleAudioProvider, useBibleAudio } = module.exports;
let controller;
function Consumer() { controller = useBibleAudio(); return null; }
async function restore(saved, overrides, verify) {
  scenario = { generation: 0, passageValid: true, stored: JSON.stringify(saved), ...overrides };
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(BibleAudioProvider, null, React.createElement(Consumer)));
      await new Promise(resolve => setImmediate(resolve));
    });
    verify(scenario);
  } finally {
    if (renderer) await act(async () => { renderer.unmount(); });
  }
}

const saved = { entry, index: 3, offset: 4.5, speed: 1.25 };
await restore({ ...saved, passage }, {}, value => {
  assert.deepEqual(value.validatedPassage, passage, "provider validates stored passage metadata with the engine");
  assert.deepEqual(value.start, [entry, 3, 4.5, false, passage], "range and saved identity must survive paused restoration");
  assert.equal(value.speed, 1.25);
  assert.equal(controller.startPassage, globalThis.__audioRestoreTest.engine.startPassage, "saved rows can request passage playback through context");
});
await restore(saved, {}, value => {
  assert.deepEqual(value.start, [entry, 3, 4.5, false, undefined], "legacy chapter positions still restore paused without a passage");
  assert.equal(value.validatedPassage, undefined);
});
for (const invalidPassage of [null, {}, { ...passage, endVerse: 0 }]) {
  await restore({ ...saved, passage: invalidPassage }, { passageValid: false }, value => {
    assert.deepEqual(value.validatedPassage, invalidPassage);
    assert.equal(value.start, undefined, "invalid metadata must not restore as an unbounded chapter");
    assert.equal(value.speed, undefined);
  });
}
await restore({ ...saved, passage }, { nativeQueue: true }, value => {
  assert.equal(value.nativeInitialized, true);
  assert.equal(value.nativeSynced, true);
  assert.equal(value.start, undefined, "existing native passage queue takes precedence over stale persisted state");
});
await restore({ ...saved, passage }, { advanceGeneration: true }, value => {
  assert.equal(value.start, undefined, "a user request started during initialization must prevent stale restoration");
});
console.log("Bible audio restoration validation passed: paused passage restore, legacy compatibility, invalid metadata, native queue precedence, and session generation guard.");
