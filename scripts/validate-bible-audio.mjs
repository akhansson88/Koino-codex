import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

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

const storage = new Map(), files = new Map(), handlers = new Map();
let queue = [], active = 0, position = 0, state = 'paused', downloads = 0, setups = 0, plays = 0;
let blockDownload, failDownload = false;
const emit = (event, payload) => { for (const fn of handlers.get(event) ?? []) fn(payload); };
const constants = Object.fromEntries(['RemotePlay','RemotePause','RemoteStop','RemoteNext','RemotePrevious','RemoteSeek','PlaybackState','PlaybackError','PlaybackActiveTrackChanged','PlaybackProgressUpdated','PlaybackQueueEnded'].map((name) => [name, name]));
const player = {
  setupPlayer: async () => { setups++; }, updateOptions: async () => {},
  addEventListener: (event, fn) => { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
  pause: async () => { state = 'paused'; emit('PlaybackState', { state }); },
  play: async () => { assert.ok(queue.length); assert.ok(queue.every((track) => files.has(track.url)), 'all queued audio must be downloaded before play'); plays++; state = 'playing'; emit('PlaybackState', { state }); },
  reset: async () => { queue = []; position = 0; active = 0; state = 'paused'; emit('PlaybackState', { state }); },
  add: async (tracks) => { queue.push(...tracks); },
  skip: async (index, offset = 0) => { active = index; position = offset; emit('PlaybackActiveTrackChanged', { track: queue[index] }); emit('PlaybackProgressUpdated', { position }); },
  setRate: async () => {}, getQueue: async () => [...queue], getActiveTrackIndex: async () => active,
  getPlaybackState: async () => ({ state }), seekTo: async (value) => { position = value; },
  remove: async (indices) => { queue = queue.filter((_, index) => !indices.includes(index)); },
};
globalThis.__audioTest = {
  player, constants,
  storage: { getItem: async (key) => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); }, removeItem: async (key) => { storage.delete(key); } },
  fs: { cacheDirectory: 'file:///cache/', makeDirectoryAsync: async () => {},
    getInfoAsync: async (uri) => ({ exists: files.has(uri), size: files.get(uri) ?? 0 }),
    downloadAsync: async (url, destination) => { downloads++; if (blockDownload) await blockDownload; if (failDownload) throw new Error('offline'); files.set(destination, 1000); return { status: 200 }; },
    moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
    deleteAsync: async (uri) => { files.delete(uri); },
  },
};
const nextEntry = { ...entry, chapter: 2, manifestUrl: entry.manifestUrl.replace('audio-test', 'audio-test2') };
const nextChapter = { ...chapter, ...nextEntry, verses: chapter.verses.map((verse) => ({ ...verse, url: verse.url.replace('audio-test', 'audio-test2') })) };
globalThis.fetch = async (url) => ({ ok: true, json: async () => url === entry.manifestUrl ? chapter : nextChapter });
const mockPlugin = { name: 'native-audio-mocks', setup(build) {
  build.onResolve({ filter: /^(react-native-track-player|expo-file-system\/legacy|@react-native-async-storage\/async-storage)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
  build.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'react-native-track-player'
    ? `export default globalThis.__audioTest.player; export const Event = globalThis.__audioTest.constants; export const Capability = {}; export const AppKilledPlaybackBehavior = {}; export const State = {Playing:'playing',Paused:'paused',Ended:'ended',Loading:'loading',Buffering:'buffering'};`
    : path === 'expo-file-system/legacy' ? `export const {cacheDirectory,makeDirectoryAsync,getInfoAsync,downloadAsync,moveAsync,deleteAsync}=globalThis.__audioTest.fs;`
    : `export default globalThis.__audioTest.storage;`, loader: 'js' }));
} };
const engine = await bundle('features/bible-audio/engine.ts', [mockPlugin]);
await engine.playbackService();
await engine.setContinuous(false);
engine.setAudioCatalog(catalog);
await engine.start(entry);
assert.equal(downloads, 2, 'fetch every verse before playback');
assert.equal(queue.length, 2);
assert.equal(setups, 1);
assert.equal(engine.getSnapshot().playing, true);
const beforeVerse = downloads;
await player.skip(1); // Native queue advances without UI / a replacement player.
assert.equal(engine.getSnapshot().session.index, 1);
assert.equal(downloads, beforeVerse);
assert.equal(setups, 1);
await engine.seek(4);
assert.equal(active, 0); assert.equal(position, 4);
await engine.move(1);
assert.equal(active, 1);
await engine.stop();
assert.equal(queue.length, 0); assert.equal(engine.getSnapshot().session, undefined);
assert.equal(storage.has('koino.audio.position.v1'), false);
await engine.start(entry, 1, 3, false);
assert.equal(downloads, beforeVerse, 'cached chapter does not download again');
assert.equal(engine.getSnapshot().playing, false);
assert.equal(position, 3);

engine.setAudioCatalog({ ...catalog, chapters: { ...catalog.chapters, '43:2': nextEntry } });
await engine.setContinuous(true);
assert.equal(queue.length, 4, 'next chapter is prepared in the native queue');
const beforeChapter = downloads;
await engine.moveChapter(1);
assert.equal(engine.getSnapshot().session.chapter.chapter, 2);
assert.equal(downloads, beforeChapter);
await engine.moveChapter(-1);
assert.equal(engine.getSnapshot().session.chapter.chapter, 1);
await engine.setSleep('chapter');
assert.equal(queue.length, 2, 'end-of-chapter timer removes later chapters but preserves current verses');
await engine.setSleep(0);
assert.equal(queue.length, 4);
await engine.setContinuous(false);
assert.equal(queue.length, 2);

await engine.stop();
files.clear();
let releaseDownload;
blockDownload = new Promise((resolve) => { releaseDownload = resolve; });
const pendingStart = engine.start(entry);
await new Promise((resolve) => setImmediate(resolve));
const playsBeforeClose = plays;
await engine.stop();
releaseDownload(); blockDownload = undefined;
await pendingStart;
assert.equal(plays, playsBeforeClose, 'closing during download must not restart playback');
assert.equal(queue.length, 0);
assert.equal(engine.getSnapshot().session, undefined);

files.clear(); failDownload = true;
await engine.start(entry);
assert.equal(engine.getSnapshot().problem, 'network');
assert.equal(queue.length, 0, 'an incomplete chapter must not start');
failDownload = false;
await engine.start(entry);
assert.equal(engine.getSnapshot().problem, null);
emit('RemoteStop');
await new Promise((resolve) => setImmediate(resolve));
assert.equal(engine.getSnapshot().session, undefined);
assert.equal(queue.length, 0);
console.log('Audio checks passed: manifests, full-chapter prefetch, native queue, cached playback, seeking, chapter navigation, timers, close/cancellation, and network recovery.');
