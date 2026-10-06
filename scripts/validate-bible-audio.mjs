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
const { parseCatalog, parseChapter, locateChapterTime, snapChapterTime } = await bundle("features/bible-audio/catalog.ts");
const entry = { bookId: 43, book: "John", bookName: "Johannesevangeliet", chapter: 1, revision: "test", sourceHash: "source", manifestUrl: "https://github.com/akhansson88/reformationsbibeln-audio/releases/download/audio-test/chapter.json" };
const chapter = { ...entry, schemaVersion: 1, translation: "reformationsbibeln2026", expectedVerses: [1, 2], verses: [1, 2].map((verse) => ({ verse, duration: 10, sha256: "a".repeat(64), textHash: "b".repeat(64), url: `https://github.com/akhansson88/reformationsbibeln-audio/releases/download/audio-test/verse-${verse}.mp3` })) };
const catalog = { schemaVersion: 1, translation: "reformationsbibeln2026", chapters: { "43:1": entry } };
assert.equal(parseCatalog(catalog), catalog);
assert.equal(parseChapter(chapter, entry), chapter);
assert.equal(parseChapter({ ...chapter, provider: 'elevenlabs', model: 'eleven_v4', voiceName: 'Jessica' }, entry).voiceName, 'Jessica');
assert.throws(() => parseChapter({ ...chapter, voiceName: 123 }, entry));
assert.throws(() => parseChapter({ ...chapter, verses: chapter.verses.slice(0, 1) }, entry));
assert.throws(() => parseChapter({ ...chapter, verses: [chapter.verses[1], chapter.verses[0]] }, entry));
assert.throws(() => parseChapter({ ...chapter, revision: "wrong" }, entry));
assert.throws(() => parseCatalog({ ...catalog, chapters: { "43:1": { ...entry, manifestUrl: "https://example.com/audio" } } }));
assert.deepEqual(locateChapterTime(chapter.verses, 12), { index: 1, offset: 2 });
assert.deepEqual(locateChapterTime(chapter.verses, -2), { index: 0, offset: 0 });
assert.deepEqual(locateChapterTime(chapter.verses, 10), { index: 1, offset: 0 });
assert.deepEqual(locateChapterTime(chapter.verses, 100), { index: 1, offset: 9.95 });
const unevenVerses = [{ verse: 1, duration: 4 }, { verse: 3, duration: 15 }, { verse: 4, duration: 2 }];
for (const [seconds, verse, start] of [[-1,1,0],[3.9,1,0],[4,3,4],[18.9,3,4],[19,4,19],[21,4,19],[100,4,19]]) {
  assert.deepEqual(snapChapterTime(unevenVerses, seconds), { verse, seconds: start });
}

const storage = new Map(), files = new Map(), handlers = new Map();
let queue = [], active = 0, position = 0, state = 'paused', downloads = 0, setups = 0, plays = 0;
let blockDownload, failDownload = false, dropEvents = false, initialized = false, intent = false, rate = 1, progressRead;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const emit = (event, payload) => { if (dropEvents) return; for (const fn of handlers.get(event) ?? []) fn(payload); };
const constants = Object.fromEntries(['RemotePlay','RemotePause','RemoteStop','RemoteNext','RemotePrevious','RemoteSeek','PlaybackState','PlaybackError','PlaybackActiveTrackChanged','PlaybackProgressUpdated','PlaybackQueueEnded'].map((name) => [name, name]));
const player = {
  setupPlayer: async () => { initialized = true; setups++; }, updateOptions: async () => {},
  addEventListener: (event, fn) => { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
  pause: async () => { intent = false; state = 'paused'; emit('PlaybackState', { state }); },
  play: async () => { assert.ok(queue.length); assert.ok(queue.every((track) => files.has(track.url)), 'all queued audio must be downloaded before play'); plays++; intent = true; state = 'playing'; emit('PlaybackState', { state }); },
  reset: async () => { queue = []; position = 0; active = 0; intent = false; state = 'paused'; emit('PlaybackState', { state }); },
  add: async (tracks) => { queue.push(...tracks); },
  skip: async (index, offset = 0) => { active = index; position = offset; emit('PlaybackActiveTrackChanged', { track: queue[index] }); emit('PlaybackProgressUpdated', { position }); },
  setRate: async (value) => { rate = value; }, getRate: async () => rate, getQueue: async () => [...queue], getActiveTrackIndex: async () => queue.length ? active : undefined,
  getTrack: async (index) => queue[index], getProgress: async () => progressRead ? progressRead() : ({ position, duration: 10, buffered: 10 }), getPlayWhenReady: async () => intent,
  getPlaybackState: async () => { if (!initialized) throw new Error('not initialized'); return { state }; }, seekTo: async (value) => { position = value; },
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
const manifests = new Map([[entry.manifestUrl, chapter], [nextEntry.manifestUrl, nextChapter]]);
globalThis.fetch = async (url) => ({ ok: manifests.has(url), json: async () => manifests.get(url) });
const mockPlugin = { name: 'native-audio-mocks', setup(build) {
  build.onResolve({ filter: /^(react-native-track-player|expo-file-system\/legacy|@react-native-async-storage\/async-storage|@\/state\/encryption\/local-storage)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
  build.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'react-native-track-player'
    ? `export default globalThis.__audioTest.player; export const Event = globalThis.__audioTest.constants; export const Capability = {}; export const AppKilledPlaybackBehavior = {}; export const State = {Playing:'playing',Paused:'paused',Ended:'ended',Loading:'loading',Buffering:'buffering',Error:'error'};`
    : path === 'expo-file-system/legacy' ? `export const {cacheDirectory,makeDirectoryAsync,getInfoAsync,downloadAsync,moveAsync,deleteAsync}=globalThis.__audioTest.fs;`
    : `export default globalThis.__audioTest.storage;`, loader: 'js' }));
} };
const engine = await bundle('features/bible-audio/engine.ts', [mockPlugin]);
await engine.setContinuous(false);
engine.setAudioCatalog(catalog);
await engine.start(entry);
assert.equal(downloads, 2, 'fetch every verse before playback');
assert.equal(queue.length, 2);
assert.equal(setups, 1);
assert.equal(engine.getSnapshot().playing, true);
const beforeVerse = downloads;
await player.skip(1); // Native queue advances without UI / a replacement player.
await flush();
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
await engine.playbackService();
await engine.playbackService();
assert.equal(handlers.get('PlaybackState').length, 1, 'foreground and service share one subscription');
assert.equal(handlers.get('RemoteStop').length, 1, 'remote handlers must not duplicate');
emit('RemoteStop');
await new Promise((resolve) => setImmediate(resolve));
assert.equal(engine.getSnapshot().session, undefined);
assert.equal(queue.length, 0);

// Reproduce the reported regression: native playback advances with no events at all.
dropEvents = true;
await engine.start(entry);
active = 1; position = 6;
await engine.syncFromNative();
assert.equal(engine.getSnapshot().session.index, 1);
assert.equal(engine.getSnapshot().position, 6);
assert.equal(engine.getSnapshot().playing, true);
await engine.toggle();
assert.equal(intent, false, 'Pause must consult the native player, even with no events');
assert.equal(engine.getSnapshot().playWhenReady, false);
await engine.toggle();
assert.equal(intent, true);
state = 'buffering'; intent = true;
await engine.syncFromNative();
assert.equal(engine.getSnapshot().buffering, true);
assert.equal(engine.getSnapshot().loading, false, 'buffering does not disable Pause');
await engine.toggle();
assert.equal(intent, false);
await engine.seek(12);
assert.equal(engine.getSnapshot().session.index, 1);
assert.equal(engine.getSnapshot().position, 2);
assert.equal(intent, false, 'seeking while paused must stay paused');
await engine.move(-1);
assert.equal(engine.getSnapshot().session.index, 0);
assert.equal(intent, false);
await engine.moveChapter(1);
assert.equal(engine.getSnapshot().session.chapter.chapter, 2);
assert.equal(engine.getSnapshot().playing, false, 'uncached chapter navigation preserves pause');
await engine.moveChapter(-1);
assert.equal(engine.getSnapshot().session.chapter.chapter, 1);
assert.equal(intent, false);
await Promise.all([engine.toggle(), engine.toggle()]);
assert.equal(intent, false, 'rapid toggles are serialized against native intent');

const realPause = player.pause;
await engine.toggle();
player.pause = async () => { throw new Error('native command failed'); };
await engine.toggle();
assert.equal(engine.getSnapshot().commandPending, false, 'failed command must release controls');
assert.equal(engine.getSnapshot().problem, 'network');
player.pause = realPause;
await engine.toggle();
assert.equal(engine.getSnapshot().problem, null);

// Foreground polling recovers missed events, also while paused.
const stopObserving = engine.observeForeground();
active = 1; position = 4;
await new Promise((resolve) => setTimeout(resolve, 550));
assert.equal(engine.getSnapshot().session.index, 1);
assert.equal(engine.getSnapshot().position, 4);
stopObserving();

// A late progress event for the previous verse must not overwrite native position.
dropEvents = false;
emit('PlaybackProgressUpdated', { track: 0, position: 9 });
await flush();
assert.equal(engine.getSnapshot().position, 4);
let releaseProgress;
progressRead = () => new Promise((resolve) => { releaseProgress = resolve; });
const stale = engine.syncFromNative();
await flush();
await engine.stop();
releaseProgress({ position: 8 });
await stale;
progressRead = undefined;
assert.equal(engine.getSnapshot().session, undefined, 'stale read must never reopen a closed session');

await engine.start(entry, 0, 1, false);
progressRead = async () => { active = 1; return { position: 9 }; };
assert.equal(await engine.syncFromNative(), false, 'discard a read when native track changes mid-query');
assert.equal(engine.getSnapshot().position, 1);
progressRead = undefined; position = 2;
await engine.syncFromNative();
assert.equal(engine.getSnapshot().session.index, 1);
assert.equal(engine.getSnapshot().position, 2);
await engine.stop();

// Background playback has no foreground observer. Native service events must
// keep extending the queue beyond the one chapter initially prefetched.
const backgroundEntries = [entry, nextEntry, ...[3, 4].map((number) => ({ ...entry, chapter: number, manifestUrl: entry.manifestUrl.replace('audio-test', `audio-background-${number}`) }))];
for (const item of backgroundEntries.slice(2)) {
  manifests.set(item.manifestUrl, { ...chapter, ...item, verses: chapter.verses.map((verse) => ({ ...verse, url: verse.url.replace('audio-test', `audio-background-${item.chapter}`) })) });
}
const until = async (condition, message) => {
  for (let i = 0; i < 100 && !condition(); i++) await flush();
  assert.ok(condition(), message);
};
engine.setAudioCatalog({ ...catalog, chapters: Object.fromEntries(backgroundEntries.map((item) => [`${item.bookId}:${item.chapter}`, item])) });
await engine.setContinuous(true);
await engine.start(entry);
await until(() => queue.length === 4, 'prefetch chapter 2 before the first background transition');
await player.skip(2);
await until(() => queue.length === 6, 'chapter 2 service event must queue chapter 3 with no foreground polling');
await player.skip(4);
await until(() => queue.length === 8, 'chapter 3 service event must queue chapter 4 with no foreground polling');
await player.skip(6);
await until(() => engine.getSnapshot().session.chapter.chapter === 4, 'play a third chapter transition while the UI is inactive');
emit('RemotePause');
await until(() => !intent, 'lock-screen Pause must work in the playback service');
emit('RemotePlay');
await until(() => intent, 'lock-screen Play must work in the playback service');
await engine.moveChapter(-1);
await engine.setSleep('chapter');
assert.equal(queue.length, 6, 'end-of-chapter sleep must still remove upcoming audio');
active = 5; position = 10; state = 'ended'; intent = false;
const playsBeforeSleep = plays;
emit('PlaybackQueueEnded', { track: active, position });
await until(() => engine.getSnapshot().sleep === 0, 'background queue end must consume the chapter sleep timer');
assert.equal(plays, playsBeforeSleep, 'chapter sleep timer must prevent automatic continuation');
await engine.stop();

// Rehydrate a native queue with an empty in-memory chapter map, from the persisted manifest.
await engine.start(entry, 1, 3, false);
const preservedQueue = [...queue];
await engine.stop();
queue = preservedQueue; active = 1; position = 3;
const fresh = await bundle('features/bible-audio/engine.ts', [mockPlugin]);
assert.equal(await fresh.hasNativeQueue(), true);
await fresh.ensurePlayer();
assert.equal(setups, 1, 'existing native player must not be recreated');
await fresh.syncFromNative();
assert.equal(fresh.getSnapshot().session.index, 1);
assert.equal(fresh.getSnapshot().position, 3);
await fresh.stop();

// A refreshed catalog withdraws legacy playback, including persisted native queues.
fresh.setAudioCatalog(catalog);
await fresh.start(entry, 0, 2, false);
await fresh.applyAudioCatalog({ ...catalog, chapters: {} });
assert.equal(queue.length, 0);
assert.equal(fresh.getSnapshot().session, undefined);
assert.equal(storage.has('koino.audio.position.v1'), false);
await fresh.start(entry);
assert.equal(queue.length, 0, 'a stale UI entry must not restart a withdrawn chapter');
fresh.setAudioCatalog(catalog);

const { AudioFollowScroll } = await bundle('features/bible-audio/follow.ts');
const follow = new AudioFollowScroll();
let layoutReady = false, delayedMeasure, scrolls = [];
const measure = (_, done) => { if (layoutReady) done({ verse: { y: 900, height: 80 }, viewport: { y: 100, height: 900 }, offset: 200, controlsTop: 800 }); };
const scroll = (offset, verse) => scrolls.push({ offset, verse });
follow.request('John:1', 2);
follow.tryScroll('John:1', measure, scroll);
assert.equal(scrolls.length, 0);
layoutReady = true;
follow.tryScroll('John:1', measure, scroll);
assert.deepEqual(scrolls, [{ offset: 982, verse: 2 }], 'delayed layout scrolls above controls, independent of playing state');
follow.tryScroll('John:1', measure, scroll);
assert.equal(scrolls.length, 1, 'progress ticks cannot repeatedly scroll');
follow.request('John:1', 3);
follow.tryScroll('John:1', (_, done) => { delayedMeasure = done; }, scroll);
follow.cancel(); // Manual browsing / close.
delayedMeasure({ verse: { y: 900, height: 80 }, viewport: { y: 100, height: 900 }, offset: 0, controlsTop: 800 });
assert.equal(scrolls.length, 1, 'manual browsing cancels even an in-flight measurement');
follow.request('John:2', 1);
follow.tryScroll('John:1', measure, scroll);
assert.equal(scrolls.length, 1, 'old chapter layout cannot satisfy a new request');
follow.tryScroll('John:2', measure, scroll);
assert.equal(scrolls.length, 2);
follow.request('John:2', 2);
follow.tryScroll('John:2', (_, done) => done({ verse: { y: 200, height: 80 }, viewport: { y: 100, height: 900 }, offset: 0, controlsTop: 800 }), scroll);
assert.equal(scrolls.length, 2, 'already-visible verse must stay still');
// Exercise the real main/mini player components against the synchronized engine.
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__audioTest.ui = { engine: fresh, catalog, refresh: async () => {} };
globalThis.__audioTest.haptics = 0;
const uiMocks = { name: 'audio-ui-mocks', setup(build) {
  build.onResolve({ filter: /^(react-native|react-native-gesture-handler|expo-haptics|@expo\/vector-icons|@react-native-community\/slider|@\/ui\/(app-sheet|app-language|theme)|\.\/provider)$/ }, ({ path }) => ({ path, namespace: 'ui-mock' }));
  build.onLoad({ filter: /.*/, namespace: 'ui-mock' }, ({ path }) => {
    const modules = {
      'react-native': `export const ActivityIndicator='ActivityIndicator',Pressable='Pressable',Switch='Switch',Text='Text',View='View',Platform={OS:'android'};`,
      'expo-haptics': `export const selectionAsync=async()=>{globalThis.__audioTest.haptics++;};`,
      'react-native-gesture-handler': `export const NativeViewGestureHandler='NativeViewGestureHandler';`,
      '@expo/vector-icons': `export const Feather=()=>null;`,
      '@react-native-community/slider': `export default 'Slider';`,
      '@/ui/theme': `export const brandPalette={deepNavy:'#0B1220',warmPersika:'#FFC79A'};`,
      '@/ui/app-sheet': `import {createElement} from 'react'; export const AppSheet=({visible,children,onClose})=>createElement('AppSheet',{onClose},visible?children:null);`,
      '@/ui/app-language': `export const useAppTranslation=()=>({t:(key,args)=>key==='audio.verse'?'Verse '+args.verse:key});`,
      './provider': `import {useSyncExternalStore} from 'react'; const {engine,catalog,refresh}=globalThis.__audioTest.ui; export const useBibleAudio=()=>({...useSyncExternalStore(engine.subscribe,engine.getSnapshot),catalog,refresh,previousChapter:engine.adjacent(-1),nextChapter:engine.adjacent(1),toggle:engine.toggle,seek:engine.seek,move:engine.move,moveChapter:engine.moveChapter,stop:engine.stop,setSleep:engine.setSleep,setSpeed:engine.setSpeed,setContinuous:engine.setContinuous});`,
    };
    return { contents: modules[path], loader: 'js' };
  });
} };
const { BibleAudioPlayer } = await bundle('features/bible-audio/player.tsx', [uiMocks]);
let ui;
const props = { visible:true,onClose:()=>{},onOpen:()=>{},palette:{},book:'John',chapter:1,version:'reformationsbibeln2026',bottom:0,follow:true,onFollow:()=>{},onChooseTranslation:()=>{} };
await act(async () => {
  await fresh.setContinuous(false);
  await fresh.start(entry, 1, 4, false);
  ui = create(React.createElement(BibleAudioPlayer, props));
});
assert.equal(ui.root.findByType('Slider').props.value, 14, 'main timeline includes previous verses plus native progress');
const scrubGesture = ui.root.findByType('NativeViewGestureHandler');
assert.equal(scrubGesture.props.disallowInterruption, true, 'sheet cannot interrupt slider gesture');
assert.equal(scrubGesture.props.shouldActivateOnStart, true, 'Android scrub claims touch before sheet pan');
assert.equal(scrubGesture.findByType('Slider'), ui.root.findByType('Slider'));
assert.ok(ui.root.findAllByType('Text').some((node) => node.props.children === '0:14'));
assert.equal(ui.root.findAllByProps({accessibilityLabel:'audio.previousVerse'}).length, 0);
assert.equal(ui.root.findAllByProps({accessibilityLabel:'audio.previousChapter',accessibilityRole:'button'}).length, 1);
assert.equal(ui.root.findByProps({accessibilityLabel:'audio.nextChapter',accessibilityRole:'button'}).props.disabled, true);
await act(async () => { ui.root.findByType('Slider').props.onSlidingStart(3); });
assert.equal(ui.root.findByType('Slider').props.value, 0);
await act(async () => { ui.root.findByType('Slider').props.onValueChange(14); });
assert.equal(ui.root.findByType('Slider').props.value, 10);
assert.equal(ui.root.findByProps({testID:'audio-verse-tooltip'}).findByType('Text').props.children, 2);
await act(async () => { ui.root.findByType('Slider').props.onValueChange(17); });
assert.equal(globalThis.__audioTest.haptics, 1, 'one haptic per verse change');
await act(async () => { ui.root.findByType('Slider').props.onSlidingComplete(17); await flush(); });
assert.equal(position, 0, 'scrubbing releases at verse start');
assert.equal(active, 1);
assert.equal(intent, false, 'scrubbing preserves pause');
assert.equal(ui.root.findAllByProps({testID:'audio-verse-tooltip'}).length, 0);
await act(async () => { ui.root.findByType('Slider').props.onAccessibilityAction({nativeEvent:{actionName:'decrement'}}); await flush(); });
assert.equal(fresh.getSnapshot().session.index, 0, 'accessible adjustment selects previous verse');
assert.equal(position, 0);
assert.equal(intent, false);
await act(async () => { ui.root.findByType('Slider').props.onAccessibilityAction({nativeEvent:{actionName:'increment'}}); await flush(); });
assert.equal(fresh.getSnapshot().session.index, 1, 'accessible adjustment selects next verse');
await act(async () => { await ui.root.findByProps({accessibilityLabel:'audio.play',accessibilityRole:'button'}).props.onPress(); });
assert.equal(intent, true);
await act(async () => { await ui.root.findByProps({accessibilityLabel:'audio.pause',accessibilityRole:'button'}).props.onPress(); });
assert.equal(intent, false);
await act(async () => { ui.update(React.createElement(BibleAudioPlayer, {...props,visible:false})); });
assert.ok(ui.root.findAllByType('Text').some((node) => node.props.children === 'Verse 2'));
assert.equal(ui.root.findAllByType('Slider').length, 0, 'compact card leaves seeking in the full player');
assert.equal(ui.root.findAllByProps({accessibilityLabel:'audio.previousChapter',accessibilityRole:'button'}).length, 0);
assert.equal(ui.root.findAllByProps({accessibilityLabel:'audio.nextChapter',accessibilityRole:'button'}).length, 0);
let opened = 0;
await act(async () => { ui.update(React.createElement(BibleAudioPlayer, {...props,visible:false,onOpen:()=>{opened++;}})); });
await act(async () => { ui.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel?.startsWith('audio.open,')).props.onPress(); });
assert.equal(opened, 1, 'chapter and verse open the full player');
await act(async () => { await ui.root.findByProps({accessibilityLabel:'audio.play',accessibilityRole:'button'}).props.onPress(); });
assert.equal(intent, true, 'mini-player button controls native playback');
await act(async () => { await ui.root.findByProps({accessibilityLabel:'audio.pause',accessibilityRole:'button'}).props.onPress(); });
assert.equal(intent, false);
let followed = 0, measuredHeight = 0;
await act(async () => { ui.update(React.createElement(BibleAudioPlayer, {...props,visible:false,follow:false,onFollow:()=>{followed++;},onMiniHeightChange:(height)=>{measuredHeight=height;}})); });
const followButton = ui.root.findByProps({accessibilityLabel:'audio.follow',accessibilityRole:'button'});
assert.equal(followButton.props.accessibilityState.selected, false, 'manual scrolling exposes Follow in the mini player');
await act(async () => { followButton.props.onPress(); });
assert.equal(followed, 1);
assert.equal(intent, false, 'Follow while paused does not start playback');
ui.root.findAllByType('View').find((node) => node.props.onLayout).props.onLayout({nativeEvent:{layout:{height:116}}});
assert.equal(measuredHeight, 116, 'reader receives actual mini-player height including Follow');
// Chapter navigation remains in the full player, preserving native play/pause intent.
{
  await act(async () => {
    fresh.setAudioCatalog({ ...catalog, chapters: { ...catalog.chapters, '43:2': nextEntry } });
    await fresh.start(entry, 1, 3, false);
    ui.update(React.createElement(BibleAudioPlayer, { ...props, visible:true }));
  });
  const button = (label) => ui.root.findByProps({accessibilityLabel:label,accessibilityRole:'button'});
  assert.equal(button('audio.previousChapter').props.disabled, true);
  assert.equal(button('audio.nextChapter').props.disabled, false);
  await act(async () => { button('audio.nextChapter').props.onPress(); await flush(); await flush(); });
  assert.equal(fresh.getSnapshot().session.chapter.chapter, 2);
  assert.equal(fresh.getSnapshot().session.index, 0);
  assert.equal(intent, false, 'chapter change preserves pause');
  assert.equal(button('audio.nextChapter').props.disabled, true);
  await act(async () => { button('audio.play').props.onPress(); await flush(); });
  await act(async () => { button('audio.previousChapter').props.onPress(); await flush(); await flush(); });
  assert.equal(fresh.getSnapshot().session.chapter.chapter, 1);
  assert.equal(intent, true, 'chapter change preserves playback');
}
let dismissed = 0;
await act(async () => { ui.update(React.createElement(BibleAudioPlayer, {...props,onClose:()=>{dismissed++;},onFollow:()=>{followed++;}})); });
const beforeFollow = followed;
await act(async () => { ui.root.findByType('AppSheet').props.onClose(); });
assert.equal(followed, beforeFollow + 1, 'sheet close returns to follow');
assert.equal(dismissed, 1);
assert.ok(fresh.getSnapshot().session, 'sheet dismissal keeps session');
assert.equal(intent, true, 'sheet dismissal keeps playback');

await act(async () => { ui.root.findByType('Slider').props.onSlidingStart(12); });
const staleRelease = ui.root.findByType('Slider').props.onSlidingComplete;
await act(async () => { await fresh.moveChapter(1); });
assert.equal(ui.root.findAllByProps({testID:'audio-verse-tooltip'}).length, 0);
await act(async () => { staleRelease(12); await flush(); });
assert.equal(fresh.getSnapshot().session.index, 0, 'stale scrub cannot seek into new chapter');

await act(async () => { ui.root.findByType('Slider').props.onSlidingStart(12); });
const dismissedRelease = ui.root.findByType('Slider').props.onSlidingComplete;
await act(async () => { ui.update(React.createElement(BibleAudioPlayer, {...props,visible:false})); });
assert.equal(ui.root.findAllByType('NativeViewGestureHandler').length, 0, 'follow card retains its existing gesture handling');
await act(async () => { dismissedRelease(12); await flush(); });
assert.equal(fresh.getSnapshot().session.index, 0, 'sheet scrub is cancelled when opening card');
assert.equal(ui.root.findAllByProps({testID:'audio-verse-tooltip'}).length, 0);
await act(async () => { ui.root.findByProps({accessibilityLabel:'audio.close',accessibilityRole:'button'}).props.onPress(); await flush(); });
assert.equal(fresh.getSnapshot().session, undefined, 'card close clears session');
assert.equal(queue.length, 0);
assert.equal(intent, false);
assert.equal(ui.root.findAllByType('Slider').length, 0);
await act(async () => { ui.update(React.createElement(BibleAudioPlayer, {...props,onFollow:()=>{followed++;}})); });
const beforeEmptyClose = followed;
await act(async () => { ui.root.findByType('AppSheet').props.onClose(); });
assert.equal(followed, beforeEmptyClose, 'empty sheet closes without activating follow');
await act(async () => { ui.unmount(); await fresh.stop(); });
console.log('Audio validation passed: background chapter continuation, service controls and sleep timer, native synchronization, foreground recovery, main/mini controls, timeline, paused navigation, stale reads, cached queues and verse following.');
