import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const flush = async (turns = 8) => { for (let i = 0; i < turns; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const base = "https://github.com/akhansson88/reformationsbibeln-audio/releases/download/audio-topic-test";
function recording(bookId, book, bookName, chapterNumber, numbers) {
  const entry = { bookId, book, bookName, chapter: chapterNumber, revision: "topic-test", sourceHash: "source", manifestUrl: `${base}/${bookId}-${chapterNumber}.json` };
  const chapter = { ...entry, schemaVersion: 1, translation: "reformationsbibeln2026", expectedVerses: numbers,
    verses: numbers.map(verse => ({ verse, duration: verse + 6, sha256: `${bookId.toString(16).padStart(2, "0")}${chapterNumber.toString(16).padStart(2, "0")}${verse.toString(16).padStart(2, "0")}`.padEnd(64, "a"), textHash: "b".repeat(64), url: `${base}/${bookId}-${chapterNumber}-${verse}.mp3` })) };
  return { entry, chapter };
}
const john = recording(43, "John", "Johannesevangeliet", 1, [1, 2, 3, 5]);
const psalm = recording(19, "Psalms", "Psaltaren", 8, [1, 2, 3, 4, 5, 6, 7, 8]);
const later = recording(43, "John", "Johannesevangeliet", 2, [1, 2]);
const item = (id, book, chapter, startVerse, endVerse = startVerse) => ({ id, reference: `${book} ${chapter}:${startVerse}${startVerse === endVerse ? "" : `-${endVerse}`}`, book, chapter, startVerse, endVerse });
const definition = { id: "topic:hope", topic: "hope", title: "Hope", translation: "reformationsbibeln2026", unavailableCount: 0, items: [item("range", "John", 1, 2, 3), item("psalm", "Psalms", 8, 2), item("overlap", "John", 1, 3)] };

async function harness() {
  const files = new Map(), storage = new Map(), handlers = new Map(), downloads = [], fetches = [], starts = [], options = [];
  const manifests = new Map([john, psalm, later].map(value => [value.entry.manifestUrl, value.chapter]));
  const native = { queue: [], index: 0, position: 0, state: "paused", intent: false, rate: 1, repeat: "off", initialized: false, events: true, downloadFailure: undefined, downloadBlock: undefined, fetchFailure: undefined, fetchBlock: undefined, concurrent: 0, peakConcurrent: 0, pauseHook: undefined, insertFailure: false, shortTimeouts: false };
  const emit = (event, payload) => { if (native.events) for (const listener of handlers.get(event) ?? []) listener(payload); };
  const eventNames = ["RemotePlay", "RemotePause", "RemoteStop", "RemoteNext", "RemotePrevious", "RemoteSeek", "PlaybackState", "PlaybackError", "PlaybackActiveTrackChanged", "PlaybackProgressUpdated", "PlaybackQueueEnded"];
  const player = {
    setupPlayer: async () => { native.initialized = true; },
    updateOptions: async value => { options.push(value); },
    addEventListener: (event, listener) => { handlers.set(event, [...(handlers.get(event) ?? []), listener]); return { remove() {} }; },
    pause: async () => { if (native.pauseHook) await native.pauseHook(); native.intent = false; native.state = "paused"; emit("PlaybackState", { state: native.state }); },
    play: async () => { assert.ok(native.queue.length, "Native playback needs a nonempty queue"); starts.push(native.queue.map(track => ({ ...track }))); native.intent = true; native.state = "playing"; emit("PlaybackState", { state: native.state }); },
    reset: async () => { native.queue = []; native.index = 0; native.position = 0; native.intent = false; native.state = "paused"; emit("PlaybackState", { state: native.state }); },
    add: async (tracks, before) => { const values = Array.isArray(tracks) ? tracks : [tracks]; if (before === undefined) native.queue.push(...values); else { if (native.insertFailure) throw new Error("Native cache replacement failed"); if (native.queue.length && before <= native.index) native.index += values.length; native.queue.splice(before, 0, ...values); } },
    skip: async (index, offset = 0) => { assert.ok(native.queue[index], `Native queue index ${index} must exist`); native.index = index; native.position = offset; emit("PlaybackActiveTrackChanged", { index, track: native.queue[index] }); emit("PlaybackProgressUpdated", { track: index, position: offset }); },
    seekTo: async position => { native.position = position; },
    setRate: async rate => { native.rate = rate; }, getRate: async () => native.rate,
    setRepeatMode: async mode => { native.repeat = mode; }, getRepeatMode: async () => native.repeat,
    getQueue: async () => [...native.queue], getActiveTrackIndex: async () => native.queue.length ? native.index : undefined,
    getTrack: async index => native.queue[index], getPlayWhenReady: async () => native.intent,
    getPlaybackState: async () => { if (!native.initialized) throw new Error("Player not initialized"); return { state: native.state }; },
    getProgress: async () => ({ position: native.position, duration: native.queue[native.index]?.duration ?? 0, buffered: native.queue[native.index]?.duration ?? 0 }),
    remove: async indices => { const list = Array.isArray(indices) ? indices : [indices]; native.index -= list.filter(index => index < native.index).length; native.queue = native.queue.filter((_, index) => !list.includes(index)); },
    updateMetadataForTrack: async (index, metadata) => { Object.assign(native.queue[index], metadata); },
  };
  const fs = { cacheDirectory: "file:///cache/", documentDirectory: "file:///documents/", EncodingType: { Base64: "base64" },
    makeDirectoryAsync: async () => {},
    getInfoAsync: async uri => ({ exists: files.has(uri), size: files.get(uri)?.size ?? 0 }),
    writeAsStringAsync: async (uri, data, encoding) => { const bytes = Buffer.from(data, encoding?.encoding === "base64" ? "base64" : "utf8"); files.set(uri, { size: bytes.length, bytes }); },
    downloadAsync: async (url, destination) => { downloads.push(url); native.concurrent++; native.peakConcurrent = Math.max(native.peakConcurrent, native.concurrent); try { if (native.downloadBlock) await native.downloadBlock(url); if (native.downloadFailure?.(url)) throw new Error("offline"); files.set(destination, { size: 1000 }); return { status: 200 }; } finally { native.concurrent--; } },
    moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
    deleteAsync: async uri => { files.delete(uri); },
  };
  globalThis.__topicAudio = { player, fs, constants: Object.fromEntries(eventNames.map(name => [name, name])), storage: { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); }, removeItem: async key => { storage.delete(key); } } };
  globalThis.fetch = async url => { fetches.push(url); if (native.fetchBlock) await native.fetchBlock(url); if (native.fetchFailure?.(url)) throw new Error("offline"); return { ok: manifests.has(url), status: manifests.has(url) ? 200 : 404, json: async () => manifests.get(url) }; };
  const mocked = {
    "react-native-track-player": `export default globalThis.__topicAudio.player; export const Event=globalThis.__topicAudio.constants; export const RepeatMode={Off:'off',Track:'track',Queue:'queue'}; export const Capability={Play:'play',Pause:'pause',Stop:'stop',SkipToNext:'next',SkipToPrevious:'previous',SeekTo:'seek'}; export const AppKilledPlaybackBehavior={}; export const State={Playing:'playing',Paused:'paused',Ended:'ended',Loading:'loading',Buffering:'buffering',Error:'error'};`,
    "expo-file-system/legacy": `export const {cacheDirectory,documentDirectory,EncodingType,makeDirectoryAsync,getInfoAsync,downloadAsync,writeAsStringAsync,moveAsync,deleteAsync}=globalThis.__topicAudio.fs;`,
    "@/state/encryption/local-storage": `export default globalThis.__topicAudio.storage;`,
  };
  const loadEngine = async () => {
    const result = await build({ entryPoints: ["features/bible-audio/engine.ts"], bundle: true, format: "cjs", platform: "node", write: false, logLevel: "silent", plugins: [{ name: "topic-native-mocks", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => mocked[path] ? { path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocked[path], loader: "js" }));
  } }] });
  const module = { exports: {} };
  // Exercise the production timeout path without making the validation wait tens of
  // seconds. Only this module's long deadlines are shortened; test guards use real time.
  const moduleTimeout = (callback, milliseconds, ...args) => setTimeout(callback, native.shortTimeouts && milliseconds >= 1000 ? 20 : milliseconds, ...args);
  new Function("require", "module", "exports", "setTimeout", "clearTimeout", result.outputFiles[0].text)(require, module, module.exports, moduleTimeout, clearTimeout);
    const engine = module.exports;
    engine.setAudioCatalog({ schemaVersion: 1, translation: "reformationsbibeln2026", chapters: Object.fromEntries([john, psalm, later].map(({ entry }) => [`${entry.bookId}:${entry.chapter}`, entry])) });
    return engine;
  };
  const engine = await loadEngine();
  const activeTrack = () => native.queue[native.index];
  const speech = () => native.queue.filter(track => track.topic?.phase === "verse");
  const gaps = () => native.queue.filter(track => track.topic?.phase === "gap");
  const at = async (itemId, verse, phase = "verse", position = 0) => { const index = native.queue.findIndex(track => track.topic?.itemId === itemId && track.topic.phase === phase && track.entry && manifests.get(track.entry.manifestUrl)?.verses[track.verseIndex].verse === verse); assert.notEqual(index, -1, `Queue contains ${itemId}:${verse}:${phase}`); await player.skip(index, position); await engine.syncFromNative(); };
  const end = async () => { native.index = native.queue.length - 1; native.position = activeTrack().duration; native.state = "ended"; native.intent = false; emit("PlaybackQueueEnded", { track: native.index, position: native.position }); await flush(); await engine.syncFromNative(); };
  return { engine, loadEngine, native, player, files, storage, downloads, fetches, starts, options, manifests, emit, speech, gaps, activeTrack, at, end, async cleanup() { await engine.stop(); await flush(); } };
}

const failures = [];
async function scenario(name, verify) { try { await verify(); } catch (error) { failures.push({ name, error }); } }

// A topic queue keeps displayed order, cross-chapter coordinates and overlapping ranges.
await scenario("exact topic queue and completion", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    await engine.startTopicPlaylist(definition, { mode: "all" });
    assert.equal(engine.getSnapshot().problem, null);
    assert.deepEqual(h.speech().map(track => [track.topic.itemId, track.entry.bookId, track.entry.chapter, track.verseIndex]), [["range", 43, 1, 1], ["range", 43, 1, 2], ["psalm", 19, 8, 1], ["overlap", 43, 1, 2]]);
    assert.equal(h.gaps().length, 3, "Pause after every numbered verse except the topic's final verse");
    assert.equal(native.queue.at(-1).topic.phase, "verse");
    assert.equal(native.repeat, "off");
    const firstQueue = h.starts[0];
    assert.ok(firstQueue.filter(track => track.topic.itemId === "range" && track.topic.phase === "verse").every(track => h.files.has(track.url)), "The first passage is downloaded before playback");
    assert.equal(new Set(h.downloads).size, h.downloads.length, "Overlapping passages share recording downloads");
    assert.equal(engine.adjacent(1), undefined, "Topic queues never offer automatic chapter continuation");
    await engine.setContinuous(true); await engine.moveChapter(1);
    assert.equal(engine.getSnapshot().session.topic.definition.id, definition.id);
    await engine.playbackService();
    h.emit("RemoteNext"); h.emit("RemotePrevious"); await flush();
    assert.equal(native.index, 0, "Background chapter-skipping controls cannot leave a topic");
    for (const gap of h.gaps()) {
      const wav = h.files.get(gap.url)?.bytes; assert.ok(wav, "Each pause has a local WAV file");
      assert.equal(wav.toString("ascii", 0, 4), "RIFF"); assert.equal(wav.toString("ascii", 8, 12), "WAVE");
      assert.ok(Math.abs((wav.readUInt32LE(40) / wav.readUInt32LE(28)) - gap.duration) < 0.01, "Native pause metadata matches the generated WAV duration");
      const silenceByte = wav.readUInt16LE(34) === 8 ? 128 : 0;
      assert.ok(wav.subarray(44).every(byte => byte === silenceByte), "Pause WAVs contain silent PCM samples");
      assert.equal(gap.duration / native.rate, 3);
    }
    await h.end();
    assert.equal(engine.getSnapshot().playWhenReady, false);
    assert.equal(h.activeTrack().topic.itemId, "overlap", "Ending a topic does not continue to a different chapter");
    await engine.toggle();
    assert.equal(h.activeTrack().topic.itemId, "range"); assert.equal(native.position, 0, "Completed Play all replays from the start");
  } finally { await h.cleanup(); }
});

// Loop changes reconstruct native queues without losing the current recording or offset.
await scenario("native passage and topic loop transitions", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    await engine.startTopicPlaylist(definition, { mode: "all", pauseSeconds: 3 });
    await h.at("range", 3, "verse", 2.5);
    await engine.setTopicLoop("passage");
    assert.equal(native.repeat, "queue");
    assert.deepEqual(h.speech().map(track => track.topic.itemId), ["range", "range"]);
    assert.equal(native.queue.at(-1).topic.phase, "gap", "The repeated passage pauses after its last verse");
    assert.equal(h.activeTrack().verseIndex, 2); assert.equal(native.position, 2.5);
    await engine.setTopicLoop("off");
    assert.equal(native.repeat, "off"); assert.equal(h.speech().length, 4, "Disabling current passage repeat restores the remaining topic list");
    assert.equal(h.activeTrack().verseIndex, 2); assert.equal(native.position, 2.5);
    await engine.setTopicLoop("topic");
    assert.equal(native.repeat, "queue"); assert.equal(h.speech().length, 4); assert.equal(native.queue.at(-1).topic.phase, "gap");
    await engine.setTopicLoop("passage");
    assert.equal(h.speech().length, 2);
    await engine.startTopicPlaylist(definition, { mode: "single", initialItemId: "psalm" });
    assert.equal(engine.getSnapshot().session.topic.loop, "off", "Starting another individual passage resets looping");
    assert.deepEqual(h.speech().map(track => track.topic.itemId), ["psalm"]);
    await h.at("psalm", 2, "verse", 4);
    await engine.setTopicLoop("topic");
    assert.equal(engine.getSnapshot().session.topic.mode, "all", "Whole topic repeat expands an individual passage to the complete topic");
    assert.equal(h.speech().length, 4); assert.equal(h.activeTrack().topic.itemId, "psalm"); assert.equal(native.position, 4);
    await flush(); native.events = false;
    await h.player.skip(native.queue.length - 1, 1); await engine.syncFromNative();
    assert.equal(engine.getSnapshot().session.topic.phase, "gap", "Foreground reconciliation recovers background pauses without events");
    // Native queue repetition itself works without a JavaScript timer or callback.
    await h.player.skip(0, 0); await flush(); await engine.syncFromNative();
    assert.equal(engine.getSnapshot().session.topic.itemIndex, 0);
    assert.equal(engine.getSnapshot().session.topic.loop, "topic");
  } finally { await h.cleanup(); }
});

// Settings preserve elapsed real silence and playback intent; speech seeking excludes pauses.
await scenario("pause, speed, seek, navigation and preferences", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    await engine.startTopicPlaylist(definition, { mode: "all", pauseSeconds: 3 });
    await h.at("range", 2, "gap", 1);
    assert.equal(engine.getSnapshot().session.topic.gapRemainingSeconds, 2);
    assert.equal(engine.getSnapshot().position, john.chapter.verses[1].duration, "Passage speech progress reaches the preceding verse's end during silence");
    await engine.toggle(); assert.equal(native.intent, false);
    await engine.setTopicPause(5);
    assert.equal(h.activeTrack().topic.phase, "gap"); assert.equal(native.position, 1); assert.equal(native.intent, false);
    assert.equal(engine.getSnapshot().session.topic.gapRemainingSeconds, 4);
    for (const speed of [0.75, 1, 1.25, 1.5, 2]) {
      await engine.setSpeed(speed);
      assert.equal(native.rate, speed);
      assert.equal(native.position / speed, 1, "Changing narration speed preserves elapsed real pause time");
      assert.ok(h.gaps().every(gap => Math.abs(gap.duration / speed - 5) < 0.01), "Selected pause duration is measured in real seconds at every narration speed");
      for (const gap of h.gaps()) { const wav = h.files.get(gap.url).bytes; assert.ok(Math.abs(wav.readUInt32LE(40) / wav.readUInt32LE(28) / speed - 5) < 0.01, "Generated silence lasts the selected real pause at each narration speed"); }
      assert.equal(native.intent, false);
    }
    await engine.setTopicPause(0);
    assert.equal(h.gaps().length, 0); assert.equal(h.activeTrack().topic.phase, "verse");
    assert.equal(h.activeTrack().verseIndex, 2, "Removing an active pause advances to the next verse");
    await engine.setTopicPause(60);
    assert.equal(engine.getSnapshot().topicPauseSeconds, 60); assert.ok(h.gaps().every(gap => gap.duration / native.rate === 60));
    await engine.seek(9.5);
    assert.equal(h.activeTrack().topic.itemId, "range"); assert.equal(h.activeTrack().verseIndex, 2); assert.equal(native.position, 1.5, "Seeking uses passage speech time, excluding all silent tracks");
    await engine.moveTopicPassage(1);
    assert.equal(h.activeTrack().topic.itemId, "psalm"); assert.equal(native.position, 0); assert.equal(native.intent, false, "Passage navigation preserves paused playback");
    await engine.moveTopicPassage(1); await engine.moveTopicPassage(1);
    assert.equal(h.activeTrack().topic.itemId, "overlap", "Forward navigation stays in the topic even at its last passage");
    await engine.moveTopicPassage(-1);
    assert.equal(h.activeTrack().topic.itemId, "psalm");
    await engine.playbackService();
    await h.at("range", 3, "verse", 3);
    h.emit("RemoteSeek", { position: 2 }); await flush();
    assert.equal(h.activeTrack().topic.itemId, "range"); assert.equal(h.activeTrack().verseIndex, 2); assert.equal(native.position, 2, "Background seek is relative to its current native track, preserving the verse");
    await h.at("range", 3, "gap", 2);
    h.emit("RemoteSeek", { position: 3 }); await flush();
    assert.equal(h.activeTrack().topic.phase, "gap"); assert.equal(native.position, 3, "Background seek during silence stays in the active pause");
    await h.at("psalm", 2, "verse", 1);
    h.emit("RemoteSeek", { position: 999 }); await flush();
    assert.equal(h.activeTrack().topic.itemId, "psalm"); assert.ok(native.position < h.activeTrack().duration, "Background seeking clamps to the active speech recording");
    await engine.savePosition();
    const saved = JSON.parse(h.storage.get("koino.audio.position.v1"));
    assert.equal(saved.topic.definition.id, definition.id); assert.equal(saved.topic.pauseSeconds, 60);
    const rememberedPause = [...h.storage.values()].map(value => { try { return JSON.parse(value); } catch { return value; } }).some(value => value === 60 || value?.pauseSeconds === 60);
    assert.ok(rememberedPause, "Pause preference is written independently of playback restoration");
    await engine.stop(); await engine.loadTopicPreferences();
    assert.equal(engine.getSnapshot().topicPauseSeconds, 60, "Remember the selected pause across sessions");
  } finally { await h.cleanup(); }
});

// Native advancement and rapid settings must not rewind or corrupt a reconstructed queue.
await scenario("serialized settings and stable native position", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    await engine.startTopicPlaylist(definition, { mode: "all", pauseSeconds: 3 });
    await h.at("range", 2, "verse", 7.9);
    native.pauseHook = async () => {
      native.pauseHook = undefined;
      native.index = native.queue.findIndex(track => track.topic.itemId === "range" && track.topic.phase === "verse" && track.verseIndex === 2);
      native.position = 0.2;
    };
    await engine.setTopicPause(4);
    assert.equal(h.activeTrack().verseIndex, 2); assert.equal(native.position, 0.2, "Queue reconstruction reads the stable native position after pausing, preserving a verse that advances during the pause command");
    assert.equal(native.intent, true);
    await Promise.all([engine.setTopicPause(5), engine.setSpeed(2), engine.seek(4)]);
    assert.equal(engine.getSnapshot().session.topic.pauseSeconds, 5); assert.equal(native.rate, 2);
    assert.equal(h.activeTrack().verseIndex, 1); assert.equal(native.position, 4);
    assert.ok(h.gaps().every(track => track.duration === 10), "Rapid settings and seek commands leave one consistent native queue");
  } finally { await h.cleanup(); }
});

// Missing recordings are skipped; transient failures remain retryable with their boundaries.
await scenario("missing recordings, network failure and retry ownership", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    const mixed = { ...definition, id: "topic:mixed", items: [definition.items[0], item("missing-range", "John", 1, 3, 4), item("missing-chapter", "Revelation", 1, 1), definition.items[1]] };
    await engine.startTopicPlaylist(mixed, { mode: "all", pauseSeconds: 0 });
    assert.deepEqual(h.speech().map(track => track.topic.itemId), ["range", "range", "psalm"]);
    assert.deepEqual([...engine.getSnapshot().session.topic.unavailableItemIds].sort(), ["missing-chapter", "missing-range"]);
    assert.equal(engine.getSnapshot().problem, null, "Genuinely absent recordings do not fail an otherwise playable topic");
    await engine.startTopicPlaylist(mixed, { mode: "single", initialItemId: "missing-range" });
    assert.equal(engine.getSnapshot().problem, "unavailable"); assert.equal(engine.getSnapshot().playWhenReady, false, "An incomplete range must not play only its recorded fragment");
    const network = { ...definition, id: "topic:network", items: [item("network-passage", "John", 2, 1, 2)] };
    native.fetchFailure = url => url === later.entry.manifestUrl;
    await engine.startTopicPlaylist(network, { mode: "all", pauseSeconds: 5 });
    assert.equal(engine.getSnapshot().problem, "network"); assert.equal(engine.getSnapshot().pendingTopic.definition.id, network.id);
    native.fetchFailure = undefined;
    await engine.retry();
    assert.equal(engine.getSnapshot().problem, null); assert.equal(engine.getSnapshot().session.topic.definition.id, network.id);
    assert.equal(engine.getSnapshot().session.topic.pauseSeconds, 5); assert.equal(h.speech().length, 2);
    await h.at("network-passage", 2, "verse", 2);
    native.state = "error"; native.intent = false;
    h.emit("PlaybackError", { code: "network", message: "connection interrupted" }); await flush();
    assert.equal(engine.getSnapshot().problem, "network");
    await engine.retry();
    assert.equal(h.activeTrack().verseIndex, 1); assert.equal(native.position, 2, "Retry resumes the failed recording and offset");
    assert.equal(engine.getSnapshot().session.topic.pauseSeconds, 5);
    h.files.clear(); native.downloadFailure = () => true;
    await engine.startPassage(john.entry, { startVerse: 2, endVerse: 3, savedVerseId: "saved-after-topic" });
    assert.equal(engine.getSnapshot().problem, "network"); assert.ok(engine.getSnapshot().pendingRequest);
    native.downloadFailure = undefined; await engine.retry();
    assert.equal(engine.getSnapshot().session.passage.savedVerseId, "saved-after-topic", "A failed saved passage replacement outranks the stale prior topic when retrying");
    assert.equal(engine.getSnapshot().session.topic, undefined);
  } finally { await h.cleanup(); }
});

// A failed deferred expansion keeps its retry intent through native foreground polling.
await scenario("failed deferred expansion retry", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    await engine.startTopicPlaylist(definition, { mode: "single", initialItemId: "range", pauseSeconds: 5 });
    await h.at("range", 3, "verse", 2);
    native.fetchFailure = url => url === psalm.entry.manifestUrl;
    await engine.setTopicLoop("topic");
    assert.equal(engine.getSnapshot().problem, "network", "Failure preparing the rest of a topic is a retryable command error");
    for (let i = 0; i < 3; i++) await engine.syncFromNative();
    assert.equal(engine.getSnapshot().problem, "network", "Foreground polling must not clear a failed expansion while the old native queue is paused");
    native.fetchFailure = undefined; await engine.retry();
    assert.equal(engine.getSnapshot().problem, null);
    assert.equal(engine.getSnapshot().session.topic.loop, "topic"); assert.equal(engine.getSnapshot().session.topic.mode, "all");
    assert.equal(h.speech().length, 4, "Retry applies the intended whole-topic expansion");
    assert.equal(h.activeTrack().topic.itemId, "range"); assert.equal(h.activeTrack().verseIndex, 2); assert.equal(native.position, 2);
  } finally { await h.cleanup(); }
});

// Start replacement wins over blocked preparation and four-worker prefetch cannot alter order.
await scenario("bounded manifest preparation and retry after an unresponsive request", async () => {
  const h = await harness(); const { engine, native } = h;
  const unresponsive = deferred();
  let timeoutGuard;
  try {
    await engine.startTopicPlaylist(definition, { mode: "single", initialItemId: "range", pauseSeconds: 5 });
    await h.at("range", 3, "verse", 2);
    await engine.setTopicLoop("passage");
    native.shortTimeouts = true;
    // Intentionally ignore AbortSignal, like a stuck native fetch/JSON operation.
    native.fetchBlock = async url => { if (url === psalm.entry.manifestUrl) await unresponsive.promise; };
    await Promise.race([
      engine.setTopicLoop("topic"),
      new Promise((_, reject) => { timeoutGuard = setTimeout(() => reject(new Error("Unresponsive topic metadata left controls pending instead of timing out")), 1000); }),
    ]);
    clearTimeout(timeoutGuard);
    assert.equal(engine.getSnapshot().commandPending, false, "A metadata timeout releases topic settings controls");
    assert.equal(engine.getSnapshot().loading, false);
    assert.equal(engine.getSnapshot().problem, "network", "Unresponsive metadata is retryable rather than reported as missing narration");
    for (let i = 0; i < 3; i++) await engine.syncFromNative();
    assert.equal(engine.getSnapshot().problem, "network");
    assert.equal(h.activeTrack().topic.itemId, "range"); assert.equal(h.activeTrack().verseIndex, 2); assert.equal(native.position, 2);
    native.fetchBlock = undefined;
    await engine.retry();
    assert.equal(engine.getSnapshot().problem, null); assert.equal(engine.getSnapshot().session.topic.loop, "topic");
    assert.equal(engine.getSnapshot().session.topic.mode, "all"); assert.equal(h.speech().length, 4);
    assert.equal(h.activeTrack().topic.itemId, "range"); assert.equal(h.activeTrack().verseIndex, 2); assert.equal(native.position, 2, "Retry preserves the intended scope, current recording and offset after metadata times out");
    unresponsive.resolve(); await flush();
    assert.equal(h.speech().length, 4, "A late abandoned metadata response cannot duplicate or replace the retried playlist");
  } finally {
    clearTimeout(timeoutGuard); unresponsive.resolve(); native.fetchBlock = undefined;
    await Promise.race([h.cleanup(), new Promise(resolve => setTimeout(resolve, 100))]);
  }
});

// Simultaneous overlapping references share one in-flight manifest fetch.
await scenario("in-flight chapter manifest deduplication", async () => {
  const h = await harness(); const { engine, native } = h;
  const manifest = deferred();
  try {
    const overlapping = { ...definition, id: "topic:simultaneous-overlap", items: [definition.items[0], item("psalm-first", "Psalms", 8, 1, 2), item("psalm-overlap", "Psalms", 8, 2, 3)] };
    native.fetchBlock = async url => { if (url === psalm.entry.manifestUrl) await manifest.promise; };
    const preparing = engine.startTopicPlaylist(overlapping, { mode: "all", pauseSeconds: 0 }); await flush();
    const simultaneousRequests = h.fetches.filter(url => url === psalm.entry.manifestUrl).length;
    manifest.resolve(); native.fetchBlock = undefined; await preparing;
    assert.equal(simultaneousRequests, 1, "Overlapping topic passages awaiting the same chapter share its pending metadata request");
    assert.equal(h.fetches.filter(url => url === psalm.entry.manifestUrl).length, 1);
    assert.deepEqual(h.speech().map(track => [track.topic.itemId, track.verseIndex]), [["range", 1], ["range", 2], ["psalm-first", 0], ["psalm-first", 1], ["psalm-overlap", 1], ["psalm-overlap", 2]], "Manifest deduplication preserves independent overlapping passage playback");
  } finally { manifest.resolve(); native.fetchBlock = undefined; await h.cleanup(); }
});

// Start replacement wins over blocked preparation and four-worker prefetch cannot alter order.
await scenario("rapid replacement and bounded hybrid prefetch", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    const release = deferred();
    native.downloadBlock = async url => { if (url.includes("/43-1-")) await release.promise; };
    const abandoned = engine.startTopicPlaylist(definition, { mode: "all" }); await flush();
    const replacement = { ...definition, id: "topic:replacement", items: [definition.items[1]] };
    await engine.startTopicPlaylist(replacement, { mode: "single", initialItemId: "psalm", pauseSeconds: 0 });
    release.resolve(); native.downloadBlock = undefined; await abandoned; await flush();
    assert.equal(engine.getSnapshot().session.topic.definition.id, replacement.id);
    assert.deepEqual(h.speech().map(track => track.topic.itemId), ["psalm"]);
    assert.ok(h.starts.every(queue => queue.every(track => track.topic?.itemId === "psalm")), "Late downloads cannot replace the newer requested topic");
    await engine.stop(); h.files.clear(); h.downloads.length = 0; native.peakConcurrent = 0;
    const prefetch = deferred();
    native.downloadBlock = async url => { if (url.includes("/19-8-")) await prefetch.promise; };
    const long = { ...definition, id: "topic:prefetch", items: [item("first", "John", 1, 2), item("future", "Psalms", 8, 1, 8)] };
    await engine.startTopicPlaylist(long, { mode: "all", pauseSeconds: 0 }); await flush();
    assert.equal(engine.getSnapshot().playWhenReady, true, "Future recording downloads do not delay the first passage");
    assert.ok(h.starts.at(-1).filter(track => track.topic.itemId === "future").every(track => track.url.startsWith(base)), "Uncached later passages remain native-streamable while prefetch is pending");
    assert.ok(native.peakConcurrent <= 4 && native.peakConcurrent >= 2, "Downloads use a bounded worker pool");
    assert.equal(native.queue.length, 9);
    prefetch.resolve(); native.downloadBlock = undefined; await flush(20);
    assert.equal(h.speech().length, 9, "Completing cache downloads never duplicates future queue entries");
    assert.equal(h.activeTrack().topic.itemId, "first");
  } finally { await h.cleanup(); }
});

// Catalog withdrawal prunes complete passages without installing stale prepared tracks.
await scenario("catalog changes during preparation and playback", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    const blocked = deferred();
    native.downloadBlock = async url => { if (url.includes("/43-1-")) await blocked.promise; };
    const preparing = engine.startTopicPlaylist(definition, { mode: "all", pauseSeconds: 3 }); await flush();
    const psalmOnly = { schemaVersion: 1, translation: "reformationsbibeln2026", chapters: { "19:8": psalm.entry } };
    await engine.applyAudioCatalog(psalmOnly);
    blocked.resolve(); native.downloadBlock = undefined; await preparing; await flush();
    assert.deepEqual(h.speech().map(track => track.topic.itemId), ["psalm"], "A withdrawn manifest cannot reappear from a completed pending download");
    assert.deepEqual([...engine.getSnapshot().session.topic.unavailableItemIds].sort(), ["overlap", "range"]);
    assert.ok(h.files.has(h.starts[0].find(track => track.topic.phase === "verse").url), "When the first prepared passage is withdrawn, its available replacement is local before playback starts");
    const fullCatalog = { schemaVersion: 1, translation: "reformationsbibeln2026", chapters: { "43:1": john.entry, "19:8": psalm.entry } };
    await engine.applyAudioCatalog(fullCatalog);
    await engine.startTopicPlaylist(definition, { mode: "all", pauseSeconds: 3 });
    await h.at("range", 3, "verse", 2);
    await engine.applyAudioCatalog({ ...fullCatalog, chapters: { "43:1": john.entry } });
    assert.deepEqual(h.speech().map(track => track.topic.itemId), ["range", "range", "overlap"], "Future withdrawn ranges are removed at passage granularity");
    assert.equal(h.activeTrack().verseIndex, 2); assert.equal(native.position, 2);
    assert.ok(engine.getSnapshot().session.topic.unavailableItemIds.includes("psalm"));
    await engine.applyAudioCatalog(psalmOnly);
    assert.equal(engine.getSnapshot().session, undefined, "Withdrawing the active passage stops its queue");
    assert.equal(native.queue.length, 0);
  } finally { await h.cleanup(); }
});

// Optional cache promotion must preserve a playing queue even when native replacement fails.
await scenario("cache replacement failure preserves playback or exposes Retry", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    const prefetch = deferred();
    native.downloadBlock = async url => { if (url.includes("/19-8-")) await prefetch.promise; };
    await engine.startTopicPlaylist(definition, { mode: "all", pauseSeconds: 3 });
    await h.at("range", 2, "gap", 1); assert.equal(native.intent, true);
    native.insertFailure = true;
    prefetch.resolve(); native.downloadBlock = undefined; await flush(20);
    for (let i = 0; i < 3; i++) await engine.syncFromNative();
    assert.ok(native.intent || engine.getSnapshot().problem === "network", "A failed optional cache substitution must not silently pause the playlist");
    assert.ok(h.speech().some(track => track.topic.itemId === "psalm"), "The trusted streaming recording remains in the installed queue after a cache replacement failure");
  } finally { await h.cleanup(); }
});

// Persisted gap phase restores paused; surviving native metadata is sufficient for recovery.
await scenario("paused restoration and native reconciliation", async () => {
  const h = await harness(); const { engine, native } = h;
  try {
    await engine.startTopicPlaylist(definition, { mode: "all", pauseSeconds: 5 });
    await engine.setTopicLoop("topic"); await engine.setSpeed(1.25);
    await h.at("range", 3, "gap", 2.5);
    await engine.savePosition();
    const saved = JSON.parse(h.storage.get("koino.audio.position.v1"));
    await engine.stop();
    await engine.restoreTopicPlayback(saved);
    assert.equal(engine.getSnapshot().session.topic.phase, "gap");
    assert.equal(engine.getSnapshot().session.topic.loop, "topic");
    assert.equal(engine.getSnapshot().session.topic.itemIndex, 0);
    assert.equal(native.intent, false); assert.equal(native.rate, 1.25);
    assert.equal(native.position / native.rate, 2, "Restoration retains elapsed real silence");
    assert.equal(engine.getSnapshot().session.topic.gapRemainingSeconds, 3);
    native.events = false; await h.player.skip(native.queue.findIndex(track => track.topic.itemId === "psalm" && track.topic.phase === "verse"), 4);
    await engine.syncFromNative();
    assert.equal(engine.getSnapshot().session.topic.itemIndex, 1); assert.equal(engine.getSnapshot().position, 4);
    assert.equal(engine.getSnapshot().session.topic.definition.id, definition.id, "Native track metadata restores the topic identity and frozen list");
    h.options.length = 0;
    const freshEngine = await h.loadEngine();
    assert.equal(freshEngine.getSnapshot().session, undefined);
    assert.equal(await freshEngine.syncFromNative(), true);
    assert.equal(freshEngine.getSnapshot().session.topic.definition.id, definition.id);
    assert.equal(freshEngine.getSnapshot().session.topic.itemIndex, 1); assert.equal(freshEngine.getSnapshot().position, 4);
    assert.ok(h.options.at(-1).capabilities.every(capability => capability !== "next" && capability !== "previous"), "Recovering a surviving native topic queue reinstalls bounded background controls");
    assert.ok(h.speech().every(track => h.files.has(track.url)), "The surviving topic queue is fully cached before offline recovery");
    native.fetchFailure = () => true; native.downloadFailure = () => true;
    await freshEngine.setTopicPause(4); await freshEngine.setSpeed(2);
    assert.equal(freshEngine.getSnapshot().problem, null);
    assert.ok(h.speech().every(track => h.files.has(track.url)), "Settings after a fresh-process recovery preserve cached recordings while offline");
    assert.equal(h.activeTrack().topic.itemId, "psalm"); assert.equal(native.position, 4);
    await freshEngine.stop();
  } finally { await h.cleanup(); }
});
if (failures.length) { for (const failure of failures) console.error(`Failed: ${failure.name}\n`, failure.error); throw new AggregateError(failures.map(({ error }) => error), `${failures.length} topic audio scenarios failed`); }
console.log("Topic queues, exact ranges, native pauses and loops, settings, seek, retries, prefetch, replacement and restoration passed.");
