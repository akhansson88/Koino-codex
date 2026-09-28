import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function bundle(file, plugins = []) {
  const result = await build({ entryPoints: [file], bundle: true, format: "cjs", platform: "node", jsx: "automatic", write: false, logLevel: "silent", external: ["react", "react/jsx-runtime"], plugins });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const { parseCatalog, parseChapter, locateChapterTime } = await bundle("features/bible-audio/catalog.ts");
const entry = { bookId: 43, book: "John", bookName: "Johannesevangeliet", chapter: 1, revision: "test", sourceHash: "source", manifestUrl: "https://github.com/akhansson88/reformationsbibeln-audio/releases/download/audio-test/chapter.json" };
const chapter = { ...entry, schemaVersion: 1, translation: "reformationsbibeln2026", expectedVerses: [1, 2], verses: [1, 2].map((verse) => ({ verse, duration: 10, sha256: "a".repeat(64), textHash: "b".repeat(64), url: `https://github.com/akhansson88/reformationsbibeln-audio/releases/download/audio-test/verse-${verse}.mp3` })) };
const catalog = { schemaVersion: 1, translation: "reformationsbibeln2026", chapters: { "43:1": entry } };
assert.equal(parseCatalog(catalog), catalog);
assert.equal(parseChapter(chapter, entry), chapter);
assert.throws(() => parseChapter({ ...chapter, verses: chapter.verses.slice(0, 1) }, entry));
assert.throws(() => parseChapter({ ...chapter, verses: [chapter.verses[1], chapter.verses[0]] }, entry));
assert.throws(() => parseChapter({ ...chapter, revision: "wrong" }, entry));
assert.throws(() => parseCatalog({ ...catalog, chapters: { "43:1": { ...entry, manifestUrl: "https://example.com/audio" } } }));
assert.deepEqual(locateChapterTime(chapter.verses, 12), { index: 1, offset: 2 });
assert.deepEqual(locateChapterTime(chapter.verses, -2), { index: 0, offset: 0 });
assert.deepEqual(locateChapterTime(chapter.verses, 10), { index: 1, offset: 0 });
assert.deepEqual(locateChapterTime(chapter.verses, 100), { index: 1, offset: 9.95 });

const storage = new Map();
let players = [];
let lockscreenOwner;
let lockscreenEvents = [];
let event;
class Player {
  constructor() { this.id = players.length; this.currentTime = 0; this.playing = false; this.isBuffering = false; this.listeners = []; players.push(this); }
  addListener(_, fn) { this.listeners.push(fn); return { remove: () => { this.listeners = this.listeners.filter((v) => v !== fn); } }; }
  emit(update = {}) { Object.assign(this, update); for (const fn of [...this.listeners]) fn({ isLoaded: true, isBuffering: false, currentTime: this.currentTime, playing: this.playing, didJustFinish: false, ...update }); }
  async seekTo(n) { this.currentTime = n; }
  play() { this.playing = true; }
  pause() { this.playing = false; }
  setPlaybackRate(n) { this.rate = n; }
  setActiveForLockScreen() { lockscreenOwner = this.id; lockscreenEvents.push(this.id); }
  clearLockScreenControls() { if (lockscreenOwner === this.id) { lockscreenOwner = undefined; lockscreenEvents.push(null); } }
  remove() { this.removed = true; }
}
globalThis.__audioTest = {
  createAudioPlayer: () => new Player(), setAudioModeAsync: async () => {},
  storage: { getItem: async (k) => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v); } },
  AppState: { addEventListener: (_, fn) => { event = fn; return { remove() {} }; } },
};
const mockPlugin = { name: "audio-mocks", setup(build) {
  build.onResolve({ filter: /^(expo-audio|react-native|@react-native-async-storage\/async-storage)$/ }, ({ path }) => ({ path, namespace: "mock" }));
  build.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: path === "expo-audio" ? "export const {createAudioPlayer,setAudioModeAsync}=globalThis.__audioTest;" : path === "react-native" ? "export const {AppState}=globalThis.__audioTest;" : "export default globalThis.__audioTest.storage;", loader: "js" }));
} };
globalThis.fetch = async (url) => ({ ok: true, json: async () => url.includes("catalog.json") ? catalog : chapter });
const { BibleAudioProvider, useBibleAudio } = await bundle("features/bible-audio/provider.tsx", [mockPlugin]);
let audio;
function Probe() { audio = useBibleAudio(); return null; }
let root;
await act(async () => { root = TestRenderer.create(React.createElement(BibleAudioProvider, null, React.createElement(Probe))); });
await act(async () => { await audio.start(entry); });
await act(async () => { players.at(-1).emit(); });
assert.equal(players.at(-1).playing, true);
assert.equal(audio.session.index, 0);
const first = players.at(-1);
const handoffStart = lockscreenEvents.length;
await act(async () => { first.emit({ didJustFinish: true, playing: false }); });
assert.equal(audio.session.index, 1);
assert.equal(first.removed, true);
assert.deepEqual(lockscreenEvents.slice(handoffStart), [audio.session.player.id], "verse handoff must preserve the active media session");
await act(async () => { players.at(-1).emit(); });
await act(async () => { audio.seek(4); });
await act(async () => { players.at(-1).emit(); });
assert.equal(audio.session.index, 0);
assert.equal(players.at(-1).currentTime, 4);
await act(async () => { audio.setSleep("chapter"); audio.move(1); });
await act(async () => { players.at(-1).emit(); });
await act(async () => { players.at(-1).emit({ didJustFinish: true, playing: false }); });
assert.equal(audio.sleep, 0);
assert.equal(audio.playing, false);
assert.equal(audio.problem, null);
await act(async () => { audio.move(-1); });
await act(async () => { players.at(-1).emit(); audio.setSpeed(1.5); event("background"); });
assert.equal(players.at(-1).rate, 1.5);
assert.equal(players.at(-1).playing, true);
await act(async () => { root.unmount(); });
await act(async () => { root = TestRenderer.create(React.createElement(BibleAudioProvider, null, React.createElement(Probe))); });
await act(async () => { players.at(-1).emit(); });
assert.equal(players.at(-1).playing, false, "restored position must be paused");
assert.equal(audio.speed, 1.5);
const restoredPlayerCount = players.length;
await act(async () => { players.at(-1).emit({ didJustFinish: true, playing: false }); });
assert.equal(players.length, restoredPlayerCount, "restoring an ended verse must not autoplay the next verse");
await act(async () => { root.unmount(); });
storage.clear();
await act(async () => { root = TestRenderer.create(React.createElement(BibleAudioProvider, null, React.createElement(Probe))); });
const entry2 = { ...entry, chapter: 2, manifestUrl: entry.manifestUrl.replace("audio-test/", "audio-test2/") };
const chapter2 = { ...chapter, ...entry2 };
let resolveFirst;
let resolveSecond;
globalThis.fetch = async (url) => ({ ok: true, json: () => new Promise((resolve) => {
  if (url === entry.manifestUrl) resolveFirst = resolve;
  else resolveSecond = resolve;
}) });
let requestFirst;
let requestSecond;
await act(async () => { requestFirst = audio.start(entry); });
await act(async () => { requestSecond = audio.start(entry2); });
await act(async () => { resolveSecond(chapter2); await requestSecond; });
await act(async () => { resolveFirst(chapter); await requestFirst; });
assert.equal(audio.session.chapter.chapter, 2, "a stale request must not replace the new queue");
globalThis.fetch = async () => { throw new Error("offline"); };
await act(async () => { await audio.start(entry); });
assert.equal(audio.problem, "network");
assert.equal(players.at(-1).playing, false);
globalThis.fetch = async () => ({ ok: true, json: async () => chapter });
await act(async () => { audio.retry(); });
await act(async () => { players.at(-1).emit(); });
assert.equal(audio.session.chapter.chapter, 1);
assert.equal(audio.problem, null);
assert.equal(players.at(-1).playing, true);
await act(async () => { audio.move(1); });
await act(async () => { players.at(-1).emit(); });
await act(async () => { players.at(-1).emit({ didJustFinish: true, playing: false }); });
assert.equal(audio.problem, "unavailable", "unpublished next chapter must stop playback");
await act(async () => { root.unmount(); });
delete globalThis.__audioTest;
console.log("Bible audio validation passed: manifests, seeking, queue transitions, timer, background, paused restoration, stale requests, and network recovery.");
