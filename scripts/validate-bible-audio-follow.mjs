import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

// Exercise the real screen's effects and user callbacks. Native rendering, the
// audio service, and child screens are boundaries; history/follow logic is real.
const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "..");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const audio = globalThis.__bibleAudioFollowTest = { snapshot: {}, listeners: new Set(), navigations: [] };
const frames = new Map();
let frameId = 0;
const originalRequestFrame = globalThis.requestAnimationFrame;
const originalCancelFrame = globalThis.cancelAnimationFrame;
globalThis.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => frames.delete(id);

const mocks = {
  "react-native": `
    export const ActivityIndicator = "ActivityIndicator", Pressable = "Pressable",
      ScrollView = "ScrollView", Text = "Text", View = "View";
    export const Platform = { OS: "android", select: values => values.android ?? values.default };
    export const useWindowDimensions = () => ({ height: 900, width: 420 });
    export const PanResponder = { create: () => ({ panHandlers: {} }) };
    export const Easing = { cubic: value => value, out: value => value };
    export const Animated = {
      View: "AnimatedView",
      Value: class { setValue() {} stopAnimation() {} },
      spring: () => ({ start: callback => callback?.({ finished: true }) }),
      timing: () => ({ start: callback => callback?.({ finished: true }) }),
    };
  `,
  "@react-navigation/native": `export const useIsFocused = () => true;`,
  "react-native-safe-area-context": `export const useSafeAreaInsets = () => ({ top: 0, bottom: 0 });`,
  "expo-router": `
    const navigation = { canGoBack: () => false, goBack() {} };
    const params = {};
    export const useNavigation = () => navigation, useLocalSearchParams = () => params;
    export const router = { push: value => globalThis.__bibleAudioFollowTest.navigations.push(value) };
  `,
  "expo-clipboard": `export const setStringAsync = async () => {};`,
  "@/state/encryption/local-storage": `export default { getItem: async () => null, setItem: async () => {} };`,
  "@/features/bible-audio/provider": `
    import { useSyncExternalStore } from "react";
    const audio = globalThis.__bibleAudioFollowTest;
    const subscribe = listener => { audio.listeners.add(listener); return () => audio.listeners.delete(listener); };
    const getSnapshot = () => audio.snapshot;
    export const useBibleAudio = () => useSyncExternalStore(subscribe, getSnapshot);
  `,
  "@/features/use-bible-book-language": `
    import { createContext } from "react";
    export const BibleBookVersionContext = createContext("kjv");
    export const useBibleBookLanguage = () => "en";
  `,
  "@/features/bible-preferences": `
    export const defaultBibleVersionId = "kjv", readerStorageKey = () => undefined;
    export const notifyBibleVersionPreferenceChanged = () => {};
  `,
  "@/state/koino-store": `
    const state = { bibleHighlightColors: [], bibleHighlights: [], biblePlans: [], groups: [],
      journalEntries: [], savedVerses: [], theme: "light" };
    const actions = { dispatch: async () => {} };
    export const useKoinoFields = () => state, useKoinoActions = () => actions;
  `,
  "@/features/bible-kjv": `
    export { kjvBooks, normalizeBiblePosition, previousBibleChapter, nextBibleChapter } from "@/features/bible-canon";
    export { bibleVersionFor, isBibleVersionId } from "@/features/bible-versions";
    export const bibleChapterAsync = async () => ({ verses: [{ verse: 1, text: "Fixture text" }], subtitles: [] });
    export const bibleCrossReferences = () => [], buildBibleVerse = () => undefined,
      bibleVerseFromReference = () => undefined;
  `,
  "@/features/bible-search": `
    export const displayBibleReference = value => value, displayBibleBookName = value => value;
  `,
  "@/features/bible-reader/preferences-sync": `
    export const fetchCloudBibleReaderPreferences = async () => null,
      saveCloudBibleReaderPreferences = async () => null;
    export const listenForCloudBibleReaderPreferences = () => () => {},
      listenForDatabaseConnection = () => () => {}, readStoredBibleReaderPreferences = () => null;
    export const readerPreferencesSignature = JSON.stringify, serializeStoredBibleReaderPreferences = JSON.stringify;
  `,
  "@/features/bible-reader/topics-api": `
    export const fetchBibleTopic = async () => ({ references: [] }), searchBibleTopicText = async () => [],
      submitBibleTopicVote = async () => {}, bibleTopicVoteKey = () => "", bibleTopicKey = value => value;
  `,
  "@/ui/app-language": `export const useAppTranslation = () => ({ language: "en", t: key => key });`,
};
const childBoundaries = {
  "@/features/bible-audio/player": ["BibleAudioPlayer"],
  "@/features/bible-reader/header": ["BibleReaderHeader"],
  "@/features/bible-reader/plan-panel": ["BiblePlanReaderPanel"],
  "@/features/bible-reader/chapter-text": ["BibleText"],
  "@/features/bible-reader/swipe-indicator": ["ChapterSwipeIndicator"],
  "@/features/bible-reader/reading-controls": ["BibleBottomReadingControls"],
  "@/features/bible-reader/verse-actions": ["SelectedVerseSuggestionBar", "VerseActionSheet"],
  "@/features/bible-reader/toast": ["ReaderToastMessage"],
  "@/features/bible-reader/highlight-colors": ["HighlightColorManagerSheet"],
  "@/features/bible-reader/reading-settings": ["ReadingSettingsSheet"],
  "@/features/bible-reader/version-sheet": ["BibleVersionSheet"],
  "@/features/bible-reader/reference-sheets": ["CrossReferenceSheet", "FootnoteSheet"],
  "@/features/bible-reader/drawer": ["BibleDrawer"],
  "@/features/bible-reader/topics-modal": ["BibleTopicsModal"],
  "@/ui/shared-composer": ["SharedComposer"],
};
for (const [moduleName, exports] of Object.entries(childBoundaries)) {
  mocks[moduleName] = exports.map(name => `export const ${name} = "${name}";`).join("\n");
}

const result = await build({
  entryPoints: [path.join(projectRoot, "features/bible-screen.tsx")],
  bundle: true, format: "cjs", platform: "node", jsx: "automatic", write: false,
  tsconfig: path.join(projectRoot, "tsconfig.json"), logLevel: "silent",
  plugins: [{
    name: "screen-test-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (name in mocks) return { path: name, namespace: "mock" };
        if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "js", resolveDir: projectRoot }));
    },
  }],
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
const { BibleScreen } = module.exports;

const emptyPlayback = () => ({ navigationRevision: 0, loading: false, playing: false, playWhenReady: false,
  commandPending: false, position: 0, problem: null, speed: 1, continuous: true, sleep: 0 });
function session(book, chapterNumber, passage, verse = passage?.startVerse ?? 1) {
  const entry = { bookId: 43, book, bookName: book, chapter: chapterNumber, manifestUrl: `fixture:${book}:${chapterNumber}` };
  return { entry, index: verse - 1, passage,
    chapter: { ...entry, verses: Array.from({ length: 40 }, (_, index) => ({ verse: index + 1, duration: 10 })) } };
}
const first = session("John", 3, { startVerse: 16, endVerse: 17, savedVerseId: "saved-john" });
const second = session("Romans", 8, { startVerse: 28, endVerse: 28, savedVerseId: "saved-romans" });
const chapterSession = session("Psalms", 23);
const request = value => ({ entry: value.entry, offset: 0, autoplay: true, passage: value.passage });
let renderer;

async function flushFrames() {
  for (let count = 0; frames.size; count++) {
    assert.ok(count < 20, "Animation frames did not settle");
    const pending = [...frames.entries()];
    frames.clear();
    await act(async () => { for (const [, callback] of pending) callback(); });
  }
}
async function mount(playback = {}) {
  audio.snapshot = { ...emptyPlayback(), ...playback };
  await act(async () => { renderer = create(React.createElement(BibleScreen)); });
  await flushFrames();
}
async function publish(changes) {
  await act(async () => {
    audio.snapshot = { ...audio.snapshot, ...changes };
    for (const listener of audio.listeners) listener();
  });
  await flushFrames();
}
const props = type => renderer.root.findByType(type).props;
const reader = () => ({ position: props("BibleDrawer").initialPosition, version: props("BibleVersionSheet").bibleVersionId });
async function openDrawer() {
  await act(async () => { props("BibleReaderHeader").onOpenMyPlaces(); });
  return { ...reader(), stage: props("BibleDrawer").initialStage };
}
function assertUnchanged(baseline, message) {
  assert.deepEqual(reader(), { position: baseline.position, version: baseline.version }, message);
  assert.equal(props("BibleDrawer").visible, true, `${message}: drawer stays open`);
  assert.equal(props("BibleDrawer").initialStage, baseline.stage, `${message}: drawer entry stage stays unchanged`);
  // A new initialPosition object runs the drawer's layout reset effect even if
  // coordinates are equal, so verify its input is preserved by reference too.
  assert.equal(props("BibleDrawer").initialPosition, baseline.position, `${message}: drawer reset input stays unchanged`);
  assert.equal(props("BibleAudioPlayer").follow, false, `${message}: follow requires a user action`);
}
async function unmount() {
  await act(async () => { renderer.unmount(); });
  renderer = undefined;
  frames.clear();
  assert.equal(audio.listeners.size, 0);
}

try {
  // A restored saved passage must not override the current reading translation
  // or position, even though ordinary chapter playback follows by default.
  await mount({ session: first });
  assert.deepEqual(reader(), { position: { book: "Philippians", chapter: 4, verse: 4 }, version: "kjv" });
  const restoredBaseline = await openDrawer();
  await publish({ session: { ...first, index: 16 }, navigationRevision: 1, playWhenReady: true });
  assertUnchanged(restoredBaseline, "Restored passage playback");
  await unmount();

  // Loading can retain a previous native chapter session. Neither that stale
  // session nor the incoming passage is allowed to navigate the reader.
  await mount({ session: chapterSession, pendingRequest: request(first), loading: true });
  assert.deepEqual(reader(), { position: { book: "Philippians", chapter: 4, verse: 4 }, version: "kjv" });
  const pendingBaseline = await openDrawer();
  await publish({ loading: false, problem: "network" });
  assertUnchanged(pendingBaseline, "Failed pending passage with previous chapter session");
  await publish({ session: first, pendingRequest: undefined, problem: null, playWhenReady: true });
  assertUnchanged(pendingBaseline, "Pending passage completion");
  await unmount();

  // Starting/switching saved playback under an open drawer preserves its inputs.
  await mount();
  const newBaseline = await openDrawer();
  await publish({ pendingRequest: request(first), loading: true });
  assertUnchanged(newBaseline, "New saved passage loading");
  await publish({ session: first, pendingRequest: undefined, loading: false, playWhenReady: true });
  assertUnchanged(newBaseline, "New saved passage playing");
  await publish({ session: { ...first, index: 16 }, navigationRevision: 1 });
  assertUnchanged(newBaseline, "Saved passage verse advancement");

  await act(async () => { props("BibleAudioPlayer").onFollow(); });
  await flushFrames();
  assert.deepEqual(reader(), { position: { book: "John", chapter: 3, verse: 17 }, version: "reformationsbibeln2026" }, "Explicit Follow opens the narrated verse and translation");
  assert.equal(props("BibleAudioPlayer").follow, true);

  const followedBaseline = await openDrawer();
  assertUnchanged(followedBaseline, "Reopening saved verses suspends explicit Follow");
  await publish({ session: { ...first, index: 15 }, playWhenReady: false, playing: false, navigationRevision: 2 });
  assertUnchanged(followedBaseline, "Pausing or replaying the existing passage in saved verses");
  await publish({ session: { ...first, index: 16 }, playWhenReady: true, playing: true, navigationRevision: 3 });
  assertUnchanged(followedBaseline, "Resuming and advancing the existing passage in saved verses");
  await publish({ pendingRequest: request(second), loading: true });
  assertUnchanged(followedBaseline, "Switching away from an explicitly followed passage");
  await publish({ session: second, pendingRequest: undefined, loading: false });
  assertUnchanged(followedBaseline, "Replacement passage does not inherit Follow");
  await act(async () => { props("BibleAudioPlayer").onFollow(); });
  await flushFrames();
  assert.deepEqual(reader(), { position: { book: "Romans", chapter: 8, verse: 28 }, version: "reformationsbibeln2026" });
  assert.equal(props("BibleAudioPlayer").follow, true);

  const replayBaseline = await openDrawer();
  await publish({ pendingRequest: request(second), loading: true });
  await publish({ pendingRequest: undefined, loading: false, session: { ...second } });
  assertUnchanged(replayBaseline, "Restarting the same saved passage clears explicit Follow");
  await unmount();

  // Preserve ordinary chapter startup behavior.
  await mount({ session: chapterSession, playWhenReady: true });
  assert.deepEqual(reader(), { position: { book: "Psalms", chapter: 23, verse: 1 }, version: "reformationsbibeln2026" });
  assert.equal(props("BibleAudioPlayer").follow, true);
  assert.equal(audio.navigations.length, 0, "Playback does not navigate to another app route");
  await unmount();
  console.log("Bible audio follow validation passed: restored/pending/switching passages preserve reader and open drawer, explicit Follow enables navigation, and chapter auto-follow remains intact.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  globalThis.requestAnimationFrame = originalRequestFrame;
  globalThis.cancelAnimationFrame = originalCancelFrame;
  delete globalThis.__bibleAudioFollowTest;
}
