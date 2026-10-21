import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
      ScrollView = "ScrollView", Text = "Text", View = "View", Modal = "Modal";
    export const Platform = { OS: "android", select: values => values.android ?? values.default };
    export const AppState = {
      get currentState() { return globalThis.__bibleAudioFollowTest.appState ?? "active"; },
      addEventListener: (_event, callback) => {
        const listeners = globalThis.__bibleAudioFollowTest.appStateListeners ??= new Set();
        listeners.add(callback); return { remove: () => listeners.delete(callback) };
      },
    };
    export const PixelRatio = { getFontScale: () => 1 };
    export const BackHandler = { addEventListener: (_event, callback) => {
      globalThis.__bibleAudioFollowTest.hardwareBack = callback;
      return { remove: () => { if (globalThis.__bibleAudioFollowTest.hardwareBack === callback) globalThis.__bibleAudioFollowTest.hardwareBack = undefined; } };
    } };
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
  "@react-navigation/native": `export const useIsFocused = () => globalThis.__bibleAudioFollowTest.focused !== false;`,
  "react-native-safe-area-context": `export const useSafeAreaInsets = () => ({ top: 0, bottom: 0 });`,
  "expo-router": `
    const navigation = { canGoBack: () => !!globalThis.__bibleAudioFollowTest.canGoBack,
      goBack() { globalThis.__bibleAudioFollowTest.backCount = (globalThis.__bibleAudioFollowTest.backCount ?? 0) + 1; } };
    const params = {};
    export const useNavigation = () => navigation, useLocalSearchParams = () => params;
    export const router = { push: value => globalThis.__bibleAudioFollowTest.navigations.push(value) };
  `,
  "expo-clipboard": `export const setStringAsync = async () => {};`,
  "@/ui/native-pressable": `export const NativePressable = "NativePressable";`,
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
    const actions = { dispatch: action => globalThis.__bibleAudioFollowTest.dispatch?.(action) ?? Promise.resolve() };
    export const useKoinoFields = () => ({ ...state, ...globalThis.__bibleAudioFollowTest.store }), useKoinoActions = () => actions;
  `,
  "@/features/bible-kjv": `
    export { kjvBooks, normalizeBiblePosition, previousBibleChapter, nextBibleChapter } from "@/features/bible-canon";
    export { bibleVersionFor, isBibleVersionId } from "@/features/bible-versions";
    export const bibleChapterAsync = async () => ({ verses: Array.from({ length: 40 }, (_, index) => ({ verse: index + 1, text: "Fixture text" })), subtitles: [] });
    export const bibleCrossReferences = () => [], buildBibleVerse = (...args) => globalThis.__bibleAudioFollowTest.buildVerse?.(...args),
      bibleVerseFromReference = () => undefined;
  `,
  "@/features/bible-search": `
    export const displayBibleReference = value => value, displayBibleBookName = value => value;
    export const normalizeScriptureQuery = value => value.trim();
    export const searchScripture = async () => globalThis.__bibleAudioFollowTest.searchResponse ?? { results: [], mode: "hybrid", semanticState: "ready" };
  `,
  "./semantic-runtime": `export const prepareSemanticRuntime = async () => {};`,
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
  "@/features/bible-reader/header": ["BibleReaderHeader", "ReaderCircleButton"],
  "@/features/bible-reader/plan-panel": ["BiblePlanReaderPanel", "BiblePlanInlineMarker"],
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
  "@/features/bible-search/search-content": ["ScriptureSearchContent"],
  "@/ui/shared-composer": ["SharedComposer"],
};
for (const [moduleName, exports] of Object.entries(childBoundaries)) {
  mocks[moduleName] = exports.map(name => `export const ${name} = "${name}";`).join("\n");
}

async function loadComponent(entryPoint) {
  const result = await build({
    entryPoints: [path.join(projectRoot, entryPoint)],
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
  return module.exports;
}
const { BibleScreen } = await loadComponent("features/bible-screen.tsx");

const emptyPlayback = () => ({ navigationRevision: 0, loading: false, playing: false, playWhenReady: false,
  commandPending: false, position: 0, problem: null, speed: 1, continuous: true, sleep: 0,
  selectChapter: async selection => {
    audio.snapshot = { ...audio.snapshot, chapterSelection: selection, session: undefined, pendingRequest: undefined, pendingTopic: undefined,
      playing: false, playWhenReady: false, loading: false, position: 0 };
    for (const listener of audio.listeners) listener();
  } });
function session(book, chapterNumber, passage, verse = passage?.startVerse ?? 1) {
  const entry = { bookId: 43, book, bookName: book, chapter: chapterNumber, manifestUrl: `fixture:${book}:${chapterNumber}` };
  return { entry, index: verse - 1, passage,
    chapter: { ...entry, verses: Array.from({ length: 40 }, (_, index) => ({ verse: index + 1, duration: 10 })) } };
}
const first = session("John", 3, { startVerse: 16, endVerse: 17, savedVerseId: "saved-john" });
const second = session("Romans", 8, { startVerse: 28, endVerse: 28, savedVerseId: "saved-romans" });
const chapterSession = session("Psalms", 23);
const topicDefinition = {
  id: "hope-fixture", topic: "Hope", title: "Hope", translation: "reformationsbibeln2026", unavailableCount: 0,
  items: [
    { id: "hope-john", reference: "John 3:16-17", book: "John", chapter: 3, startVerse: 16, endVerse: 17 },
    { id: "hope-romans", reference: "Romans 8:28", book: "Romans", chapter: 8, startVerse: 28, endVerse: 28 },
  ],
};
const topicSession = (base, itemIndex = 0, phase = "verse") => ({ ...base, passage: undefined,
  topic: { definition: topicDefinition, mode: "all", loop: "off", pauseSeconds: 3, itemIndex, phase, unavailableItemIds: [] } });
const pendingTopic = { definition: topicDefinition, options: { mode: "all" } };
const request = value => ({ entry: value.entry, offset: 0, autoplay: true, passage: value.passage });
let renderer;
const measuredScrolls = [];
let simulatedScroll = 0;
let deferredMeasurements;
const geometry = new Map();
const scrollView = () => {
  const native = renderer.root.findByType("ScrollView").props;
  return { ...native, onScroll: event => {
    simulatedScroll = event.nativeEvent.contentOffset.y;
    native.onScroll(event);
  } };
};
function layoutVerses(start = 0, step = 100, rowHeight = step) {
  for (let verse = 1; verse <= 40; verse++) {
    geometry.set(verse, { offset: start + (verse - 1) * step, height: rowHeight });
    props("BibleText").onVerseLayout(verse, start + (verse - 1) * step);
    props("BibleText").onVerseRef(verse, { measureInWindow: done => {
      const { offset, height } = geometry.get(verse);
      // Capture a native measurement now, even if delivery is delayed.
      const y = 100 + offset - simulatedScroll;
      if (deferredMeasurements) deferredMeasurements.push(() => done(0, y, 380, height));
      else done(0, y, 380, height);
    } });
  }
}

async function flushFrames() {
  for (let count = 0; frames.size; count++) {
    assert.ok(count < 20, "Animation frames did not settle");
    const pending = [...frames.entries()];
    frames.clear();
    await act(async () => { for (const [, callback] of pending) callback(); });
  }
}
async function mount(playback = {}) {
  simulatedScroll = 0;
  deferredMeasurements = undefined;
  geometry.clear();
  audio.snapshot = { ...emptyPlayback(), ...playback };
  await act(async () => { renderer = create(React.createElement(BibleScreen), { createNodeMock: element => element.type === "ScrollView"
    ? { scrollTo: value => measuredScrolls.push(value) }
    : { measureInWindow: done => done(0, 100, 420, audio.viewportHeight ?? 800) } }); });
  await act(async () => { props("AnimatedView").onLayout({ nativeEvent: { layout: { y: 0 } } }); });
  await flushFrames();
}
async function publish(changes) {
  await act(async () => {
    audio.snapshot = { ...audio.snapshot, ...changes };
    for (const listener of audio.listeners) listener();
  });
  await flushFrames();
}
async function changeAppState(value) {
  await act(async () => {
    audio.appState = value;
    for (const listener of audio.appStateListeners ?? []) listener(value);
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
  await mount();
  assert.equal(props("BibleReaderHeader").audioAvailable, false, "KJV has no headphones entry point");
  await act(async () => { props("BibleReaderHeader").onOpenAudio(); });
  assert.equal(audio.snapshot.chapterSelection, undefined, "unsupported translations cannot stage audio");
  await act(async () => { props("BibleVersionSheet").onChangeBibleVersion("reformationsbibeln2026"); });
  await flushFrames();
  assert.equal(props("BibleReaderHeader").audioAvailable, true);
  await act(async () => {
    layoutVerses();
  });
  await flushFrames();
  const realNow = Date.now;
  Date.now = () => realNow() + 1000;
  try {
    await act(async () => {
      // Clear the initial programmatic scroll, then make two rapid user scrolls.
      scrollView().onScroll({ nativeEvent: { contentOffset: { y: 300 } } });
      scrollView().onScrollBeginDrag();
      scrollView().onScroll({ nativeEvent: { contentOffset: { y: 700 } } });
      scrollView().onScroll({ nativeEvent: { contentOffset: { y: 1100 } } });
    });
    assert.notEqual(reader().position.verse, 12, "reader position is still throttled after rapid scrolling");
    await act(async () => { props("BibleReaderHeader").onOpenAudio(); });
  } finally { Date.now = realNow; }
  await flushFrames();
  assert.deepEqual(audio.snapshot.chapterSelection, { book: "Philippians", chapter: 4, verse: 12 }, "headphones uses the latest scroll offset instead of throttled position");
  assert.equal(props("BibleAudioPlayer").visible, false, "headphones opens the compact player directly");
  assert.equal(props("BibleAudioPlayer").follow, true);
  assert.equal(props("BibleText").spokenVerse, 12, "selected verse is highlighted before the audio loads");
  assert.equal(renderer.root.findAllByType("BibleBottomReadingControls").length, 0, "paused Follow reserves the normal audio controls area");
  await publish({ chapterSelection: undefined, session: session("Philippians", 4, undefined, 12), playWhenReady: true });
  assert.equal(props("BibleAudioPlayer").follow, true, "Follow survives the selection-to-playing transition");
  await publish({ session: { ...audio.snapshot.session, index: 12 }, navigationRevision: 1 });
  assert.equal(props("BibleText").spokenVerse, 13);
  await act(async () => { scrollView().onScrollBeginDrag(); });
  assert.equal(props("BibleAudioPlayer").follow, false);
  await act(async () => { props("BibleReaderHeader").onOpenAudio(); });
  await flushFrames();
  assert.equal(audio.snapshot.playWhenReady, false, "another header tap replaces existing playing audio with a paused selection");
  assert.equal(audio.snapshot.session, undefined);
  assert.equal(props("BibleAudioPlayer").follow, true);
  await act(async () => { scrollView().onScrollBeginDrag(); });
  await publish({ chapterSelection: undefined, session: session("Philippians", 4, undefined, 12), playWhenReady: true });
  assert.equal(props("BibleAudioPlayer").follow, false, "manual browsing while loading is not overridden when playback begins");
  await act(async () => {
    layoutVerses(80);
    scrollView().onScrollBeginDrag();
    scrollView().onScroll({ nativeEvent: { contentOffset: { y: 700 } } });
    scrollView().onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    props("BibleReaderHeader").onOpenAudio();
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection.verse, 1, "returning to the chapter heading selects verse 1 even before the first verse reaches the viewport top");
  await unmount();

  // Native geometry, rather than the reading-position cache or scroll target,
  // determines the selection. Rows are deliberately different heights here.
  await mount();
  await act(async () => { props("BibleVersionSheet").onChangeBibleVersion("reformationsbibeln2026"); });
  await flushFrames();
  await act(async () => { layoutVerses(80, 100, 80); });
  await flushFrames();
  await act(async () => {
    props("AnimatedView").onLayout({ nativeEvent: { layout: { y: 18 } } });
    props("BibleDrawer").onSelect({ book: "Philippians", chapter: 4, verse: 20 });
  });
  await flushFrames();
  assert.equal(measuredScrolls.at(-1).y, 1980, "cached verse offsets include the surrounding content origin");
  await act(async () => {
    props("AnimatedView").onLayout({ nativeEvent: { layout: { y: 38 } } });
    props("BibleDrawer").onSelect({ book: "Philippians", chapter: 4, verse: 20 });
  });
  await flushFrames();
  assert.equal(measuredScrolls.at(-1).y, 2000, "moving the content origin refreshes cached offsets without row layout events");
  await act(async () => { props("AnimatedView").onLayout({ nativeEvent: { layout: { y: 0 } } }); });
  for (const [y, expected, message] of [
    [425, 4, "partially visible top row"],
    [460, 5, "gap after a fully scrolled-off row"],
    [480, 5, "exact row boundary"],
    [0, 1, "chapter heading"],
    [4500, 40, "padding below the final verse"],
  ]) {
    await act(async () => {
      scrollView().onScrollBeginDrag();
      scrollView().onScroll({ nativeEvent: { contentOffset: { y } } });
      props("BibleReaderHeader").onOpenAudio();
    });
    await flushFrames();
    assert.equal(audio.snapshot.chapterSelection.verse, expected, message);
    assert.equal(audio.snapshot.playWhenReady, false, "headphones stages paused audio");
  }
  // Leave a pending scroll-to-1 target, then report a different visible row.
  await act(async () => {
    props("BibleDrawer").onSelect({ book: "Philippians", chapter: 4, verse: 1 });
    scrollView().onScroll({ nativeEvent: { contentOffset: { y: 980 } } });
    props("BibleReaderHeader").onOpenAudio();
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection.verse, 10, "a stale programmatic target cannot override the viewport");
  await act(async () => {
    for (let verse = 1; verse <= 40; verse++) props("BibleText").onVerseLayout(verse, 9000 + verse * 100);
    props("BibleReaderHeader").onOpenAudio();
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection.verse, 10, "incorrect cached offsets cannot fall back to verse 1 when native rows show verse 10");

  // A font/layout change invalidates in-flight native measurements.
  deferredMeasurements = [];
  await act(async () => { props("BibleReaderHeader").onOpenAudio(); });
  await flushFrames();
  const beforeFontChange = deferredMeasurements;
  deferredMeasurements = undefined;
  await act(async () => {
    props("ReadingSettingsSheet").onFontSizeChange(26);
  });
  await act(async () => {
    layoutVerses(80, 200, 180);
    beforeFontChange.forEach(deliver => deliver());
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection.verse, 5, "font reflow discards old row measurements");

  // Scroll changes while native callbacks are in flight must be remeasured.
  deferredMeasurements = [];
  await act(async () => { props("BibleReaderHeader").onOpenAudio(); });
  await flushFrames();
  const beforeScroll = deferredMeasurements;
  deferredMeasurements = undefined;
  await act(async () => {
    scrollView().onScrollBeginDrag();
    scrollView().onScroll({ nativeEvent: { contentOffset: { y: 2080 } } });
    beforeScroll.forEach(deliver => deliver());
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection.verse, 11, "scrolling during measurement selects the latest top row");

  // A newer tap wins even if the first native callback arrives last.
  deferredMeasurements = [];
  await act(async () => { props("BibleReaderHeader").onOpenAudio(); });
  await flushFrames();
  const superseded = deferredMeasurements;
  deferredMeasurements = undefined;
  await act(async () => {
    scrollView().onScroll({ nativeEvent: { contentOffset: { y: 3080 } } });
    props("BibleReaderHeader").onOpenAudio();
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection.verse, 16);
  await act(async () => { superseded.forEach(deliver => deliver()); });
  assert.equal(audio.snapshot.chapterSelection.verse, 16, "superseded callbacks cannot replace a newer selection");

  deferredMeasurements = [];
  await act(async () => { props("BibleReaderHeader").onOpenAudio(); });
  await flushFrames();
  const beforeChapterChange = deferredMeasurements;
  deferredMeasurements = undefined;
  const existingSelection = audio.snapshot.chapterSelection;
  const oldVerseLayout = props("BibleText").onVerseLayout;
  await act(async () => {
    props("BibleDrawer").onSelect({ book: "John", chapter: 3, verse: 16 });
    beforeChapterChange.forEach(deliver => deliver());
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection, existingSelection, "navigation cancels an in-flight selection");
  await act(async () => {
    oldVerseLayout(1, 9000);
    props("BibleReaderHeader").onOpenAudio();
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection, existingSelection, "a new chapter waits for its own rows rather than using old refs or verse 1");
  await act(async () => {
    layoutVerses();
    scrollView().onScrollBeginDrag();
    scrollView().onScroll({ nativeEvent: { contentOffset: { y: 1250 } } });
  });
  await flushFrames();
  assert.deepEqual(audio.snapshot.chapterSelection, { book: "John", chapter: 3, verse: 13 }, "layout callbacks resume a waiting headphones selection");

  const beforeZeroHeight = audio.snapshot.chapterSelection;
  await act(async () => {
    layoutVerses(0, 100, 0);
    props("BibleReaderHeader").onOpenAudio();
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection, beforeZeroHeight, "unmeasured native rows wait for layout instead of selecting verse 1");
  await act(async () => { layoutVerses(); });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection.verse, 13);

  deferredMeasurements = [];
  await act(async () => { props("BibleReaderHeader").onOpenAudio(); });
  await flushFrames();
  const beforeTranslationChange = deferredMeasurements;
  deferredMeasurements = undefined;
  const selectedBeforeTranslation = audio.snapshot.chapterSelection;
  await act(async () => {
    props("BibleVersionSheet").onChangeBibleVersion("kjv");
    beforeTranslationChange.forEach(deliver => deliver());
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection, selectedBeforeTranslation, "translation changes cancel delayed selections");
  await act(async () => { props("BibleVersionSheet").onChangeBibleVersion("reformationsbibeln2026"); });
  await flushFrames();
  await act(async () => { layoutVerses(); });
  deferredMeasurements = [];
  await act(async () => { props("BibleReaderHeader").onOpenAudio(); });
  await flushFrames();
  const beforeUnmount = deferredMeasurements;
  deferredMeasurements = undefined;
  await unmount();
  await act(async () => { beforeUnmount.forEach(deliver => deliver()); });
  assert.equal(audio.snapshot.chapterSelection, selectedBeforeTranslation, "unmounting cancels delayed selections");

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

  // Topic playback has its own identity: a restored or pending playlist must
  // not inherit chapter following or navigate away from topic details.
  await mount({ session: topicSession(first), playWhenReady: true });
  assert.deepEqual(reader(), { position: { book: "Philippians", chapter: 4, verse: 4 }, version: "kjv" });
  const topicRestoreBaseline = await openDrawer();
  await publish({ session: topicSession({ ...first, index: 16 }, 0, "gap"), navigationRevision: 1 });
  assertUnchanged(topicRestoreBaseline, "Restored topic advances into silence without navigation");
  await unmount();

  await mount({ session: chapterSession, pendingTopic, loading: true });
  assert.deepEqual(reader(), { position: { book: "Philippians", chapter: 4, verse: 4 }, version: "kjv" });
  const pendingTopicBaseline = await openDrawer();
  await publish({ loading: false, problem: "network" });
  assertUnchanged(pendingTopicBaseline, "Failed topic request does not follow stale chapter");
  await publish({ pendingTopic: undefined, problem: null, session: topicSession(first), playWhenReady: true });
  assertUnchanged(pendingTopicBaseline, "Prepared topic does not inherit chapter following");
  await act(async () => { props("BibleReaderHeader").onOpenSearch(); });
  await flushFrames();
  const topicReader = reader();
  assert.equal(props("Modal").visible, true);
  await publish({ session: topicSession({ ...first, index: 16 }, 0, "gap"), navigationRevision: 2 });
  assert.deepEqual(reader(), topicReader, "Topic controls preserve reader position and translation");
  assert.equal(props("Modal").visible, true, "Playing search passages leaves search open");
  await publish({ session: topicSession(second, 1), navigationRevision: 3 });
  assert.deepEqual(reader(), topicReader, "Moving to another topic passage does not navigate the reader");
  assert.equal(props("Modal").visible, true);
  await act(async () => { props("BibleAudioPlayer").onFollow(); });
  await flushFrames();
  assert.equal(props("Modal").visible, false, "Explicit Follow closes the search view");
  assert.deepEqual(reader(), { position: { book: "Romans", chapter: 8, verse: 28 }, version: "reformationsbibeln2026" });
  assert.equal(props("BibleAudioPlayer").follow, true);
  await publish({ session: topicSession(first), navigationRevision: 4 });
  assert.deepEqual(reader(), { position: { book: "John", chapter: 3, verse: 16 }, version: "reformationsbibeln2026" }, "Explicit topic Follow spans passage changes and loops");
  await act(async () => { props("BibleReaderHeader").onOpenSearch(); });
  await flushFrames();
  const reopenedTopicReader = reader();
  await publish({ session: topicSession(second, 1), navigationRevision: 5 });
  assert.deepEqual(reader(), reopenedTopicReader, "Reopening search suspends explicit topic Follow");
  assert.equal(props("BibleAudioPlayer").follow, false);
  await unmount();

  // Search navigation uses selected-translation bounds rather than the KJV verse ceiling.
  await mount();
  await act(async () => { props("BibleVersionSheet").onChangeBibleVersion("reformationsbibeln2026"); });
  await act(async () => { props("BibleReaderHeader").onOpenSearch(); });
  assert.equal(props("Modal").visible, true);
  await act(async () => { props("ScriptureSearchContent").onSelect({ book: "Psalms", chapter: 3, startVerse: 9, endVerse: 9, reference: "Psalms 3:9", text: "Swedish-only final verse", translation: "Reformationsbibeln 2026" }); });
  assert.equal(props("Modal").visible, false);
  assert.deepEqual(reader().position, { book: "Psalms", chapter: 3, verse: 9 });
  await act(async () => { props("BibleVersionSheet").onChangeBibleVersion("kjv"); });
  assert.deepEqual(reader().position, { book: "Psalms", chapter: 3, verse: 1 }, "Translation changes keep positions inside the selected Bible");
  await act(async () => { props("BibleReaderHeader").onHistoryBack(); });
  assert.deepEqual(reader().position, { book: "Philippians", chapter: 4, verse: 4 }, "Translation changes preserve previous reading stops");
  await act(async () => { props("BibleReaderHeader").onHistoryForward(); });
  assert.deepEqual(reader().position, { book: "Psalms", chapter: 3, verse: 1 });
  await unmount();

  // Search is a return destination independent of reading history and playback.
  const searchVerse = { book: "John", chapter: 3, startVerse: 16, endVerse: 17, reference: "John 3:16-17", text: "Fixture passage" };
  audio.searchResponse = { results: [{ id: "search-john", verse: searchVerse }], mode: "hybrid", semanticState: "ready" };
  for (const playback of ["none", "paused", "playing"]) {
    await mount(playback === "none" ? {} : { session: topicSession(first), playWhenReady: playback === "playing" });
    assert.equal(props("BibleReaderHeader").canGoBack, false);
    await act(async () => { props("BibleReaderHeader").onOpenSearch(); });
    await act(async () => { props("ScriptureSearchContent").session.setQuery("hope"); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 210)); });
    const retained = props("ScriptureSearchContent").session.search.response;
    props("ScriptureSearchContent").session.scroll.offset = 420;
    await act(async () => { props("Modal").onRequestClose(); });
    assert.equal(props("BibleReaderHeader").canGoBack, false, "Closing search without selecting a result creates no return destination");
    await act(async () => { props("BibleReaderHeader").onOpenSearch(); });
    assert.equal(props("ScriptureSearchContent").session.query, "hope", "The search icon resumes the last session");
    await act(async () => { props("ScriptureSearchContent").onSelect(searchVerse); });
    assert.equal(props("Modal").visible, false);
    assert.equal(props("BibleReaderHeader").canGoBack, true, "Opening a search result makes reader Back available");
    assert.deepEqual(reader().position, { book: "John", chapter: 3, verse: 16 });
    assert.equal(typeof audio.hardwareBack, "function");
    if (playback !== "none") {
      await publish({ session: topicSession(second, 1), navigationRevision: 10, playWhenReady: playback === "playing" });
      assert.deepEqual(reader().position, { book: "John", chapter: 3, verse: 16 }, "Audio advancing while away preserves the selected passage");
    }
    await act(async () => {
      if (playback === "paused") assert.equal(audio.hardwareBack(), true);
      else props("BibleReaderHeader").onBack();
    });
    assert.equal(props("Modal").visible, true, `${playback}: Back reopens search`);
    assert.equal(props("ScriptureSearchContent").session.query, "hope");
    assert.equal(props("ScriptureSearchContent").session.search.response, retained);
    assert.equal(props("ScriptureSearchContent").session.scroll.offset, 420);
    assert.equal(props("ScriptureSearchContent").session.scroll.restore, true);
    assert.equal(props("BibleAudioPlayer").follow, false, "Returning suspends reader following without changing playback");
    assert.equal(audio.snapshot.playWhenReady, playback === "playing");
    assert.equal(props("BibleReaderHeader").canGoBack, false, "Returning consumes the pending destination");
    assert.equal(audio.hardwareBack, undefined);
    await act(async () => { props("ScriptureSearchContent").onSelect({ ...searchVerse, book: "Romans", chapter: 8, startVerse: 28 }); });
    assert.equal(props("BibleReaderHeader").canGoBack, true, "Another result establishes a new return destination");
    await act(async () => { props("BibleReaderHeader").onHistoryBack(); });
    assert.equal(props("Modal").visible, false, "The reading-history arrows keep their existing behavior");
    assert.deepEqual(reader().position, { book: "John", chapter: 3, verse: 16 });
    audio.focused = false;
    await publish({});
    assert.equal(audio.hardwareBack, undefined, "An inactive Bible tab cannot intercept Android Back");
    audio.focused = true;
    await publish({});
    await act(async () => { assert.equal(audio.hardwareBack(), true); });
    await act(async () => { props("Modal").onRequestClose(); });
    assert.equal(props("BibleReaderHeader").canGoBack, false);
    await unmount();
  }
  audio.canGoBack = true;
  audio.backCount = 0;
  await mount();
  await act(async () => { props("BibleReaderHeader").onOpenSearch(); });
  await act(async () => { props("ScriptureSearchContent").onSelect(searchVerse); });
  await act(async () => { props("BibleReaderHeader").onBack(); });
  assert.equal(audio.backCount, 0, "Search takes priority over leaving the reader");
  await act(async () => { props("Modal").onRequestClose(); });
  await act(async () => { props("BibleReaderHeader").onBack(); });
  assert.equal(audio.backCount, 1, "Ordinary reader Back resumes after closing the restored search");
  await unmount();
  audio.canGoBack = false;
  delete audio.searchResponse;

  // Preserve ordinary chapter startup behavior.
  await mount({ session: chapterSession, playWhenReady: true });
  assert.deepEqual(reader(), { position: { book: "Psalms", chapter: 23, verse: 1 }, version: "reformationsbibeln2026" });
  assert.equal(props("BibleAudioPlayer").follow, true);
  let measuredVerseY = 680;
  props("BibleText").onVerseRef(1, { measureInWindow: done => done(0, measuredVerseY, 380, 60) });
  const scrollCount = measuredScrolls.length;
  await act(async () => { props("BibleAudioPlayer").onMiniTopChange(700); });
  await flushFrames();
  assert.equal(measuredScrolls.length, scrollCount + 1, "Measured player top triggers follow before the verse goes beneath the player");
  assert.equal(measuredScrolls.at(-1).y, 562, "Player and verse use the same window coordinate system");
  measuredVerseY = 600;
  await act(async () => { props("BibleAudioPlayer").onMiniTopChange(620); });
  await flushFrames();
  assert.equal(measuredScrolls.length, scrollCount + 2, "A taller player rechecks the current spoken verse without advancing playback");
  measuredVerseY = 300;
  await act(async () => { props("BibleAudioPlayer").onMiniTopChange(700); });
  await flushFrames();
  assert.equal(measuredScrolls.length, scrollCount + 2, "Already-visible verse stays still after player layout changes");
  assert.equal(audio.navigations.length, 0, "Playback does not navigate to another app route");
  const verseRowLayoutCallback = props("BibleText").onVerseLayout;
  await publish({ session: { ...chapterSession, index: 1 } });
  assert.equal(props("BibleText").onVerseLayout, verseRowLayoutCallback, "audio advancement preserves stable layout callbacks for ordinary verse rows");
  await unmount();
  // Highlight callbacks must clear selection before the write settles, allow
  // the next selection, report actual errors, and batch disjoint deletions.
  const pendingWrites = [];
  audio.store = { currentUserId: 'highlight-user' };
  audio.dispatch = action => new Promise((resolve, reject) => pendingWrites.push({ action, resolve, reject }));
  audio.buildVerse = (book, chapter, startVerse, endVerse) => ({ book, chapter, startVerse, endVerse, reference: `${book} ${chapter}:${startVerse}-${endVerse}`, text: 'Fixture', translation: 'KJV' });
  await mount();
  await act(async () => { props('BibleText').onVersePress(1); props('BibleText').onVersePress(3); });
  assert.equal(props('SelectedVerseSuggestionBar').saving, false);
  await act(async () => { props('SelectedVerseSuggestionBar').onHighlight({ id: 'red', hex: '#FF0000' }); });
  assert.deepEqual(props('BibleText').selectedVerseNumbers, [], 'clear the selection while the write is pending');
  assert.equal(pendingWrites[0].action.type, 'highlightVerses');
  assert.equal(pendingWrites[0].action.verses.length, 2, 'nonadjacent selections preserve both ranges');
  assert.equal(props('ReaderToastMessage').toast, undefined, 'do not announce success before the server acknowledges');
  await act(async () => { props('BibleText').onVersePress(2); });
  assert.equal(props('SelectedVerseSuggestionBar').saving, false, 'a slow write must not disable the next selection');
  await act(async () => { props('SelectedVerseSuggestionBar').onHighlight({ id: 'blue', hex: '#0000FF' }); });
  await act(async () => { pendingWrites[0].reject(new Error('earlier failure')); });
  assert.equal(props('ReaderToastMessage').toast.tone, 'error', 'a failed earlier write is reported while the newer selection is still pending');
  await act(async () => { pendingWrites[1].resolve(); });
  assert.equal(props('ReaderToastMessage').toast.tone, 'success');
  await act(async () => { props('BibleText').onVersePress(4); });
  await act(async () => { props('SelectedVerseSuggestionBar').onHighlight({ id: 'red', hex: '#FF0000' }); });
  await act(async () => { pendingWrites[2].reject(new Error('permission denied')); });
  assert.equal(props('ReaderToastMessage').toast.tone, 'error', 'a rejected write must display an error');
  audio.store.bibleHighlights = [1, 3].map(verse => ({ ...props('BibleText').position, id: `highlight-${verse}`, startVerse: verse, endVerse: verse, translation: 'KJV', color: '#FF0000', createdAt: '2026-01-01' }));
  await act(async () => { props('BibleText').onVersePress(1); props('BibleText').onVersePress(3); });
  await act(async () => { void props('SelectedVerseSuggestionBar').onDeleteHighlight(); });
  assert.deepEqual(pendingWrites[3].action, { type: 'removeBibleHighlights', ids: ['highlight-1', 'highlight-3'] }, 'delete all selected highlights with one action');
  await act(async () => { pendingWrites[3].resolve(); });
  await act(async () => { props('BibleText').onVersePress(5); });
  await act(async () => { props('SelectedVerseSuggestionBar').onHighlight({ id: 'red', hex: '#FF0000' }); });
  audio.store.currentUserId = 'next-user';
  await act(async () => { renderer.update(React.createElement(BibleScreen)); });
  await act(async () => { pendingWrites[4].reject(new Error('previous account failed')); });
  assert.equal(props('ReaderToastMessage').toast, undefined, 'previous-account failures never display in the new account');
  await act(async () => { props('BibleText').onVersePress(6); });
  await act(async () => { props('SelectedVerseSuggestionBar').onHighlight({ id: 'blue', hex: '#0000FF' }); });
  await unmount();
  await act(async () => { pendingWrites[5].reject(new Error('screen closed')); });
  delete audio.dispatch; delete audio.buildVerse; delete audio.store;
  console.log('Bible highlight screen checks passed: immediate selection clearing, unlocked controls, multiple ranges, acknowledgement/error feedback, stale feedback, and batch deletion.');

  await mount();
  await act(async () => { props("BibleVersionSheet").onChangeBibleVersion("reformationsbibeln2026"); });
  await act(async () => { props("BibleText").onVersePress(7); });
  const positionBeforeLayoutChange = reader().position;
  await act(async () => { props("ReadingSettingsSheet").onChangeFlowingParagraphText(true); });
  assert.equal(props("BibleText").flowingParagraphText, true);
  assert.deepEqual(reader().position, positionBeforeLayoutChange, "switching layout retains the current verse");
  await act(async () => { layoutVerses(0, 50, 50); });
  await flushFrames();
  assert.equal(measuredScrolls.at(-1).y, 282, "layout change restores the current verse with new measurements");
  await act(async () => {
    scrollView().onScrollBeginDrag();
    scrollView().onScroll({ nativeEvent: { contentOffset: { y: 500 } } });
    props("BibleReaderHeader").onOpenAudio();
  });
  await flushFrames();
  assert.equal(audio.snapshot.chapterSelection.verse, 11, "paragraph geometry selects the visible audio verse");
  await act(async () => { props("ReadingSettingsSheet").onChangeFlowingParagraphText(false); });
  assert.equal(props("BibleText").flowingParagraphText, false);
  await unmount();

  // Exercise the real text component as well as the screen. Reporting verse
  // positions must work regardless of native parent/child layout event order.
  const { BibleText } = await loadComponent("features/bible-reader/chapter-text.tsx");
  const flattenStyle = style => Array.isArray(style) ? Object.assign({}, ...style.map(flattenStyle)) : style ?? {};
  const numberText = root => root.findAllByType("Text").find(node => node.children.every(child => typeof child === "string") && node.children.join("") === "1 ");

  // Connect the real paragraph's layout callbacks to the real reader. Its native
  // Text origin is deliberately unmeasurable, as can happen outside the viewport.
  const paragraphSession = session("John", 3);
  await mount({ session: paragraphSession, playWhenReady: true });
  await act(async () => {
    props("ReadingSettingsSheet").onChangeFlowingParagraphText(true);
    props("BibleAudioPlayer").onMiniTopChange(700);
  });
  await flushFrames();
  let paragraphReader;
  const paragraphVerses = props("BibleText").verses.map(item => ({ ...item, reference: `John 3:${item.verse}`, footnotes: [] }));
  const paragraphElement = key => React.createElement(BibleText, { ...props("BibleText"), verses: paragraphVerses, key });
  const nativeParagraph = () => paragraphReader.root.findAllByType("Text").find(node => node.props.onTextLayout);
  const paragraphLines = (lineHeight, shared = false, top = 0) => Array.from({ length: shared ? 20 : 40 }, (_, index) => ({
    text: shared ? "\uFFFCFixture text \uFFFCFixture text" : "\uFFFCFixture text",
    y: top + index * lineHeight, height: lineHeight, ascender: lineHeight * 0.75,
  }));
  const layoutParagraph = async lines => {
    await act(async () => {
      const nodes = paragraphReader.root.findAllByType("View").filter(node => node.props.onLayout);
      nodes[0].props.onLayout({ nativeEvent: { layout: { y: 40 } } });
      nodes[1].props.onLayout({ nativeEvent: { layout: { y: 0 } } });
      nodes[2].props.onLayout({ nativeEvent: { layout: { y: 0 } } });
      nativeParagraph().props.onLayout({ nativeEvent: { layout: { y: 8 } } });
      nativeParagraph().props.onTextLayout({ nativeEvent: { lines } });
    });
    await flushFrames();
  };
  const acknowledgeScroll = async () => {
    await act(async () => { scrollView().onScroll({ nativeEvent: { contentOffset: { y: measuredScrolls.at(-1).y } } }); });
  };
  try {
    await act(async () => { paragraphReader = create(paragraphElement("initial"), {
      createNodeMock: () => ({ measureInWindow() { throw new Error("Audio follow must use verse bounds, not measure the entire paragraph"); } }),
    }); });
    const beforeLayout = measuredScrolls.length;
    await layoutParagraph(paragraphLines(29));
    assert.equal(measuredScrolls.length, beforeLayout, "the first paragraph verse is already visible");
    await publish({ session: { ...paragraphSession, index: 25 } });
    await act(async () => { paragraphReader.update(paragraphElement("initial")); });
    assert.equal(measuredScrolls.at(-1).y, 755, "advancing playback follows verse 26 using its paragraph bounds");
    await acknowledgeScroll();

    await layoutParagraph(paragraphLines(58));
    assert.equal(measuredScrolls.at(-1).y, 1480, "paragraph reflow rechecks a verse whose previous follow request was completed");
    await acknowledgeScroll();
    const afterReflow = measuredScrolls.length;
    await layoutParagraph(paragraphLines(58));
    assert.equal(measuredScrolls.length, afterReflow, "unchanged layout cannot repeat a completed follow scroll");

    await layoutParagraph(paragraphLines(29, true));
    assert.equal(measuredScrolls.at(-1).y, 378, "shared-line verses use their shared measured line");
    await acknowledgeScroll();
    const beforeSharedVerse = measuredScrolls.length;
    await publish({ session: { ...paragraphSession, index: 24 } });
    await act(async () => { paragraphReader.update(paragraphElement("initial")); });
    assert.equal(measuredScrolls.length, beforeSharedVerse, "advancing to an already-visible shared line stays still");

    await act(async () => { props("ReadingSettingsSheet").onFontSizeChange(10); });
    await flushFrames();
    await act(async () => { paragraphReader.update(paragraphElement("large-font")); });
    await layoutParagraph(paragraphLines(45));
    assert.equal(measuredScrolls.at(-1).y, 1110, "changing font size retains audio following while fresh bounds arrive");
    await acknowledgeScroll();

    await act(async () => { scrollView().onScrollBeginDrag(); });
    await act(async () => { paragraphReader.update(paragraphElement("large-font")); });
    const beforeManual = measuredScrolls.length;
    await layoutParagraph(paragraphLines(45, false, 900));
    await publish({ session: { ...paragraphSession, index: 26 } });
    await act(async () => { paragraphReader.update(paragraphElement("large-font")); });
    assert.equal(measuredScrolls.length, beforeManual, "layout changes and playback cannot override manual browsing");
    await act(async () => { props("BibleAudioPlayer").onFollow(); });
    await flushFrames();
    assert.equal(measuredScrolls.at(-1).y, 2100, "Follow resumes at the current verse using the latest paragraph layout");
    await acknowledgeScroll();
    await act(async () => { props("BibleAudioPlayer").onMiniTopChange(150); });
    await flushFrames();
    await act(async () => { props("BibleAudioPlayer").onMiniTopChange(700); });
    await flushFrames();
    const afterPlayerLayout = measuredScrolls.length;
    const viewportNode = renderer.root.findAllByType("View").find(node => node.props.onLayout && node.props.onTouchStart);
    await act(async () => { viewportNode.props.onLayout(); });
    await flushFrames();
    assert.equal(measuredScrolls.length, afterPlayerLayout, "an unchanged viewport keeps the visible spoken verse still");
    await act(async () => { scrollView().onScroll({ nativeEvent: { contentOffset: { y: 2018 } } }); });
    audio.viewportHeight = 150;
    await act(async () => { viewportNode.props.onLayout(); });
    await flushFrames();
    assert.equal(measuredScrolls.length, afterPlayerLayout + 1, "shrinking the viewport rechecks an already-followed paragraph verse");
    assert.equal(measuredScrolls.at(-1).y, 2100, "viewport changes align the current spoken verse above the controls");
    delete audio.viewportHeight;
    await act(async () => { paragraphReader.update(paragraphElement("large-font")); });
    await act(async () => {
      paragraphReader.root.findByProps({ testID: "bible-paragraph-content" }).props.onLayout({ nativeEvent: { layout: { y: 0, width: 320 } } });
      paragraphReader.root.findByProps({ testID: "bible-paragraph-chapter" }).props.onLayout({ nativeEvent: { layout: { width: 28, height: 50 } } });
    });
    await act(async () => { paragraphReader.root.findByProps({ testID: "bible-paragraph-measurement" }).props.onTextLayout({
      nativeEvent: { lines: paragraphLines(45) },
    }); });
    await act(async () => {
      const opening = paragraphReader.root.findByProps({ testID: "bible-paragraph-opening" });
      const continuation = paragraphReader.root.findByProps({ testID: "bible-paragraph-continuation" });
      opening.props.onTextLayout({ nativeEvent: { lines: paragraphLines(45).slice(0, 2) } });
      opening.props.onLayout({ nativeEvent: { layout: { y: 8 } } });
      continuation.props.onTextLayout({ nativeEvent: { lines: paragraphLines(45, true).slice(0, 19) } });
      continuation.props.onLayout({ nativeEvent: { layout: { y: 98 } } });
    });
    await flushFrames();
    assert.equal(measuredScrolls.at(-1).y, 660, "audio follows a continuation verse after the chapter's two-line wrap changes paragraph geometry");
  } finally {
    delete audio.viewportHeight;
    if (paragraphReader) await act(async () => { paragraphReader.unmount(); });
    await unmount();
  }

  // Follow must recover if an earlier animation or a foreground restoration
  // moves a verse after its initial visibility check has already completed.
  // These are the measured Esra 6:6 bounds from the phone's flowing text view.
  const ezraPlayback = session("Ezra", 6, undefined, 6);
  await mount({ session: ezraPlayback, playWhenReady: true });
  await act(async () => {
    props("ReadingSettingsSheet").onChangeFlowingParagraphText(true);
    props("BibleAudioPlayer").onMiniTopChange(715);
  });
  await act(async () => { props("BibleText").onVerseLayout(6, 785.523811340332, 192); });
  await flushFrames();
  const sixthVerseTop = 785.523811340332 - 18;
  assert.equal(measuredScrolls.at(-1).y, sixthVerseTop);
  const reportOffset = async y => act(async () => { scrollView().onScroll({ nativeEvent: { contentOffset: { y } } }); });
  await reportOffset(sixthVerseTop);
  const beforeDrift = measuredScrolls.length;
  await reportOffset(1100);
  await publish({ position: 1 });
  assert.equal(measuredScrolls.length, beforeDrift + 1, "a playback tick recovers verse 6 after a completed check and a late scroll");
  assert.equal(measuredScrolls.at(-1).y, sixthVerseTop);
  await reportOffset(sixthVerseTop);
  const beforeVisibleTick = measuredScrolls.length;
  await publish({ position: 2 });
  assert.equal(measuredScrolls.length, beforeVisibleTick, "playback ticks leave an already-visible paragraph verse still");

  await changeAppState("background");
  await reportOffset(0);
  await publish({ position: 3 });
  assert.equal(measuredScrolls.length, beforeVisibleTick, "background measurements cannot consume follow or scroll hidden content");
  await changeAppState("active");
  assert.equal(measuredScrolls.length, beforeVisibleTick + 1, "returning to the reader rechecks verse 6 without waiting for verse 7");
  assert.equal(measuredScrolls.at(-1).y, sixthVerseTop);
  await reportOffset(sixthVerseTop);

  await reportOffset(1100);
  const beforeScrollEnd = measuredScrolls.length;
  await act(async () => { scrollView().onMomentumScrollEnd(); });
  await flushFrames();
  assert.equal(measuredScrolls.length, beforeScrollEnd + 1, "a settling animation cannot leave the current verse above the reader");
  await reportOffset(sixthVerseTop);
  await act(async () => { props("BibleText").onVerseLayout(6, 785.523811340332, 900); });
  await flushFrames();
  const beforeTallTick = measuredScrolls.length;
  await publish({ position: 4 });
  await act(async () => { scrollView().onMomentumScrollEnd(); });
  await flushFrames();
  assert.equal(measuredScrolls.length, beforeTallTick, "a verse taller than the viewport cannot restart the same scroll repeatedly");

  await act(async () => { scrollView().onScrollBeginDrag(); });
  await reportOffset(0);
  const beforeManualTick = measuredScrolls.length;
  await publish({ position: 5 });
  await changeAppState("background");
  await changeAppState("active");
  await act(async () => { scrollView().onMomentumScrollEnd(); });
  await flushFrames();
  assert.equal(measuredScrolls.length, beforeManualTick, "recovery checks respect manual browsing until Follow is pressed");
  delete audio.appState;
  await unmount();

  let verseRowNumberStyle;
  const reportedOffsets = [];
  const textProps = {
    chapterHighlightByVerse: {}, onVerseLayout: (...args) => reportedOffsets.push(args), onVerseRef() {},
    palette: { accent: "accent", peach: "peach" }, planMarkers: [], position: { book: "John", chapter: 1, verse: 1 },
    readerLineHeight: 24, readerTextStyle: { fontSize: 18, lineHeight: 24 }, selectedVerseNumbers: [], showVerseNumbers: true,
    subtitles: [], verses: [{ verse: 1, reference: "John 1:1", text: "Fixture", footnotes: [] }, { verse: 2, reference: "John 1:2", text: "Another verse", footnotes: [] }],
  };
  let text;
  try {
    await act(async () => { text = create(React.createElement(BibleText, { ...textProps, key: "John:1" })); });
    verseRowNumberStyle = flattenStyle(numberText(text.root).props.style);
    const firstPressableProps = text.root.findAllByType('NativePressable')[0].props;
    await act(async () => { text.update(React.createElement(BibleText, { ...textProps, key: 'John:1' })); });
    assert.equal(text.root.findAllByType('NativePressable')[0].props, firstPressableProps, 'unchanged chapter props do not rebuild verses or detach their native refs');
    const secondPressableProps = text.root.findAllByType('NativePressable')[1].props;
    await act(async () => { text.update(React.createElement(BibleText, { ...textProps, chapterHighlightByVerse: { 1: '#FF0000' }, selectedVerseNumbers: [1], key: 'John:1' })); });
    assert.equal(text.root.findAllByType('NativePressable')[1].props, secondPressableProps, 'highlighting or selecting one verse must not rebuild another verse');
    assert.equal(text.root.findAllByType('NativePressable')[0].props.accessibilityState.selected, true);
    await act(async () => { text.update(React.createElement(BibleText, { ...textProps, key: 'John:1' })); });
    const layoutNodes = () => text.root.findAllByType("View").filter(node => node.props.onLayout);
    const layout = y => ({ nativeEvent: { layout: { y } } });
    await act(async () => { layoutNodes()[1].props.onLayout(layout(100)); });
    assert.deepEqual(reportedOffsets, [], "child-first layout waits for the text container origin");
    await act(async () => { layoutNodes()[0].props.onLayout(layout(300)); });
    assert.deepEqual(reportedOffsets.at(-1), [1, 400], "late parent layout publishes the correct combined verse position");
    await act(async () => { layoutNodes()[0].props.onLayout(layout(500)); });
    assert.deepEqual(reportedOffsets.at(-1), [1, 600], "a moved plan panel refreshes positions without verse row layout changes");
    await act(async () => {
      text.update(React.createElement(BibleText, { ...textProps, readerTextStyle: { fontSize: 26 }, key: "John:1" }));
      layoutNodes()[1].props.onLayout(layout(200));
    });
    assert.deepEqual(reportedOffsets.at(-1), [1, 700], "font reflow refreshes a verse position under the current parent origin");
    await act(async () => { text.update(React.createElement(BibleText, { ...textProps, key: "John:2", position: { book: "John", chapter: 2, verse: 1 } })); });
    const reportCount = reportedOffsets.length;
    await act(async () => { layoutNodes()[1].props.onLayout(layout(25)); });
    assert.equal(reportedOffsets.length, reportCount, "chapter remount discards the preceding text origin");
    await act(async () => { layoutNodes()[0].props.onLayout(layout(10)); });
    assert.deepEqual(reportedOffsets.at(-1), [1, 35]);
  } finally {
    if (text) await act(async () => { text.unmount(); });
  }

  const paragraphOffsets = [], paragraphRefs = new Map(), interactions = [];
  const paragraphProps = { ...textProps, flowingParagraphText: true,
    palette: { peach: "peach", accent: "accent" },
    selectedVerseNumbers: [2], chapterHighlightByVerse: { 1: "#FF0000" }, spokenVerse: 2,
    verses: [{ ...textProps.verses[0], text: "Hello*", footnotes: [{ marker: "*", text: "Note" }] }, textProps.verses[1]],
    onVerseLayout: (...args) => paragraphOffsets.push(args),
    onVerseRef: (verse, ref) => paragraphRefs.set(verse, ref),
    onVersePress: verse => interactions.push(["press", verse]), onVersePressIn: () => interactions.push(["pressIn"]),
    onVerseLongPress: verse => interactions.push(["longPress", verse]),
    onFootnotePress: (...args) => interactions.push(["footnote", ...args]),
  };
  try {
    await act(async () => { text = create(React.createElement(BibleText, paragraphProps), {
      createNodeMock: () => ({ measureInWindow: callback => callback(0, 500, 380, 72) }),
    }); });
    assert.equal(text.root.findAllByType("NativePressable").length, 0, "flowing verses use inline text rather than individual rows");
    const paragraphText = () => text.root.findAllByType("Text").find(node => node.props.onTextLayout);
    assert.ok(paragraphText().findAllByType("Text").every(node => (flattenStyle(node.props.style).fontSize ?? 18) <= 18),
      "the large chapter number must be outside the native paragraph to avoid changing its font metrics");
    const flowingNumberStyle = flattenStyle(numberText(text.root).props.style);
    for (const key of ["color", "fontFamily", "fontSize", "fontWeight", "fontVariant", "lineHeight", "marginTop"]) {
      assert.deepEqual(flowingNumberStyle[key], verseRowNumberStyle[key], `flowing verse numbers retain the row's ${key}`);
    }
    await act(async () => {
      paragraphText().props.onTextLayout({ nativeEvent: { lines: [
        { text: "\uFFFCHello* \uFFFCAnother", y: 0, height: 24, ascender: 18 }, { text: "verse", y: 24, height: 24, ascender: 18 },
      ] } });
      paragraphText().props.onLayout({ nativeEvent: { layout: { y: 8 } } });
      text.root.findAllByType("View").filter(node => node.props.onLayout)[2].props.onLayout({ nativeEvent: { layout: { y: 17 } } });
      text.root.findAllByType("View").filter(node => node.props.onLayout)[1].props.onLayout({ nativeEvent: { layout: { y: 100 } } });
    });
    assert.equal(paragraphOffsets.length, 0, "paragraph-first layout waits for the outer origin");
    await act(async () => { text.root.findAllByType("View")[0].props.onLayout({ nativeEvent: { layout: { y: 300 } } }); });
    assert.deepEqual(paragraphOffsets, [[1, 425, 24], [2, 425, 48]]);
    let measured;
    paragraphRefs.get(2).measureInWindow((x, y, width, height) => { measured = { y, height }; });
    assert.deepEqual(measured, { y: 508, height: 48 }, "paragraph verse adapters include the text's offset inside its shared content view");
    const inlineVerses = text.root.findAllByType("Text").filter(node => node.props.onLongPress);
    assert.equal(inlineVerses.length, 2);
    assert.equal(inlineVerses[0].props.accessibilityState.selected, true, "saved highlights remain marked");
    assert.equal(inlineVerses[1].props.style.backgroundColor, "peach", "selection and spoken verse remain highlighted");
    assert.ok(!String(flattenStyle(inlineVerses[1].props.style).textDecorationLine).includes("underline"), "the spoken paragraph verse is never underlined");
    assert.equal(text.root.findAllByType("Text").find(node => node.props.accessibilityLabel === "bible.footnote.open").props.style.textDecorationLine,
      "underline", "footnotes retain their link styling");
    await act(async () => {
      inlineVerses[1].props.onPressIn(); inlineVerses[1].props.onPress(); inlineVerses[0].props.onLongPress();
      text.root.findAllByType("Text").find(node => node.props.accessibilityLabel === "bible.footnote.open").props.onPress({ stopPropagation() { interactions.push(["stopPropagation"]); } });
    });
    assert.deepEqual(interactions.slice(0, 4), [["pressIn"], ["press", 2], ["longPress", 1], ["stopPropagation"]]);
    assert.equal(interactions[4][0], "footnote");
    assert.equal(interactions[4][3], 1);
    await act(async () => {
      paragraphText().props.onTextLayout({ nativeEvent: { lines: [
        { text: "\uFFFCHello*", y: 0.25, height: 24, ascender: 19 },
        { text: "\uFFFCAnother verse", y: 24.25, height: 24, ascender: 18 },
      ] } });
    });
    assert.deepEqual(paragraphOffsets.at(-1), [2, 449.25, 24], "font reflow refreshes the final verse's complete line bounds");
    assert.equal(flattenStyle(paragraphText().props.style).minHeight, 49, "round the native last line upward so its descenders fit");
    await act(async () => { text.unmount(); });
    text = undefined;
    assert.equal(paragraphRefs.get(1), null, "unmount removes paragraph measurement adapters");

    paragraphOffsets.length = 0;
    await act(async () => { text = create(React.createElement(BibleText, { ...paragraphProps, showVerseNumbers: false }), {
      createNodeMock: () => ({ measureInWindow: callback => callback(0, 500, 380, 72) }),
    }); });
    const nodes = text.root.findAllByType("View").filter(node => node.props.onLayout);
    await act(async () => {
      nodes[0].props.onLayout({ nativeEvent: { layout: { y: 300 } } });
      nodes[1].props.onLayout({ nativeEvent: { layout: { y: 100 } } });
      nodes[2].props.onLayout({ nativeEvent: { layout: { y: 17 } } });
      paragraphText().props.onLayout({ nativeEvent: { layout: { y: 8 } } });
    });
    assert.deepEqual(paragraphOffsets, [], "parent-first layout waits for native line measurements");
    await act(async () => {
      paragraphText().props.onTextLayout({ nativeEvent: { lines: [
        { text: "Hello* Another verse", y: 0, height: 24, ascender: 18 },
      ] } });
    });
    assert.deepEqual(paragraphOffsets, [[1, 425, 24], [2, 425, 24]], "hidden numbers and parent-first layout retain both shared-line verses");
    assert.equal(numberText(text.root), undefined, "hiding verse numbers removes the inline number layout boxes");
  } finally {
    if (text) await act(async () => { text.unmount(); });
  }

  const nativeText = node => node.children.map(child => typeof child === "string" ? child : nativeText(child)).join("");
  for (const [chapterNumber, fontSize, numberWidth] of [[1, 16, 28], [10, 18, 56], [119, 28, 84]]) {
    const lineHeight = Math.round(fontSize * 1.62);
    const positions = [], presses = [], notes = [];
    const wrapProps = { ...paragraphProps,
      position: { book: "Psalms", chapter: chapterNumber, verse: 1 },
      readerLineHeight: lineHeight, readerTextStyle: { fontSize, lineHeight },
      selectedVerseNumbers: [1], spokenVerse: 1,
      verses: [
        { verse: 1, reference: "Psalms 1:1", text: "Alpha beta** gamma delta epsilon", footnotes: [{ marker: "**", text: "Note" }] },
        { verse: 2, reference: "Psalms 1:2", text: "Second verse.", footnotes: [] },
      ],
      onVerseLayout: (...args) => positions.push(args), onVersePress: verse => presses.push(verse),
      onFootnotePress: (...args) => notes.push(args),
    };
    try {
      await act(async () => { text = create(React.createElement(BibleText, wrapProps), {
        createNodeMock: () => ({ measureInWindow: done => done(0, 500, 320, 500) }),
      }); });
      await act(async () => {
        const nodes = text.root.findAllByType("View").filter(node => node.props.onLayout);
        nodes[0].props.onLayout({ nativeEvent: { layout: { y: 0 } } });
        nodes[1].props.onLayout({ nativeEvent: { layout: { y: 0 } } });
        text.root.findByProps({ testID: "bible-paragraph-content" }).props.onLayout({ nativeEvent: { layout: { y: 0, width: 320 } } });
        text.root.findByProps({ testID: "bible-paragraph-chapter" }).props.onLayout({ nativeEvent: { layout: { width: numberWidth, height: 50 } } });
      });
      const probe = () => text.root.findByProps({ testID: "bible-paragraph-measurement" });
      const opening = () => text.root.findByProps({ testID: "bible-paragraph-opening" });
      const tail = () => text.root.findByProps({ testID: "bible-paragraph-continuation" });
      const measurementContainer = text.root.findAllByType("View").find(node => node.props.style?.opacity === 0);
      assert.equal(measurementContainer.props.pointerEvents, "none");
      assert.equal(measurementContainer.props.importantForAccessibility, "no-hide-descendants");
      assert.equal(probe().findAllByType("Text").filter(node => node.props.onLongPress).length, 0, "the hidden measurement copy cannot expose verse actions");
      await act(async () => {
        numberText(probe()).props.onTextLayout({ nativeEvent: { lines: [{ text: "1 ", width: 11, y: 0, height: lineHeight }] } });
        probe().props.onTextLayout({ nativeEvent: { lines: [
          { text: "\uFFFCAlpha beta", y: 0, height: lineHeight, ascender: lineHeight * 0.75 },
          { text: "*", y: lineHeight, height: lineHeight, ascender: lineHeight * 0.75 },
          { text: "* gamma delta epsilon \uFFFCSecond verse.", y: lineHeight * 2, height: lineHeight, ascender: lineHeight * 0.75 },
        ] } });
      });
      assert.equal(flattenStyle(opening().props.style).marginLeft, numberWidth + 10, "only the opening lines reserve the measured chapter width");
      assert.equal(flattenStyle(tail().props.style).marginLeft ?? 0, 0, "continuation text uses the full available width");
      assert.equal(flattenStyle(probe().props.style).width, 320 - numberWidth - 10);
      assert.equal(numberText(opening()).parent.props.style.width, 11, "visible text and the measurement copy share exact number widths");
      assert.equal(nativeText(opening()), "1 Alpha beta*");
      assert.equal(nativeText(tail()), "* gamma delta epsilon 2 Second verse.");
      await act(async () => {
        opening().props.onTextLayout({ nativeEvent: { lines: [
          { text: "\uFFFCAlpha beta", y: 0, height: lineHeight, ascender: lineHeight * 0.75 },
          { text: "*", y: lineHeight, height: lineHeight, ascender: lineHeight * 0.75 },
        ] } });
        opening().props.onLayout({ nativeEvent: { layout: { y: 8 } } });
        tail().props.onTextLayout({ nativeEvent: { lines: [
          { text: "* gamma delta epsilon \uFFFCSecond verse.", y: 0, height: lineHeight, ascender: lineHeight * 0.75 },
        ] } });
        tail().props.onLayout({ nativeEvent: { layout: { y: 8 + 2 * lineHeight } } });
      });
      assert.deepEqual(positions.slice(-2), [[1, 8, lineHeight * 3], [2, 8 + lineHeight * 2, lineHeight]], "a verse crossing the join publishes one complete geometry rectangle");
      const pieces = [opening(), tail()].flatMap(node => node.findAllByType("Text").filter(item => item.props.onLongPress));
      assert.equal(pieces[0].props.style.backgroundColor, pieces[1].props.style.backgroundColor);
      assert.ok(pieces.every(node => !String(node.props.style.textDecorationLine).includes("underline")));
      await act(async () => {
        pieces[0].props.onPress(); pieces[1].props.onPress();
        for (const root of [opening(), tail()]) root.findAllByType("Text").find(node => node.props.accessibilityLabel === "bible.footnote.open")
          .props.onPress({ stopPropagation() {} });
      });
      assert.deepEqual(presses, [1, 1], "both pieces still select the original complete verse");
      assert.deepEqual(notes.map(args => [args[0], args[2]]), [["**", 1], ["**", 1]], "both halves of a split marker open the original footnote");
      await act(async () => { text.root.findByProps({ testID: "bible-paragraph-content" }).props.onLayout({ nativeEvent: { layout: { y: 0, width: 230 } } }); });
      assert.equal(flattenStyle(probe().props.style).width, 230 - numberWidth - 10);
      await act(async () => { probe().props.onTextLayout({ nativeEvent: { lines: [
        { text: "\uFFFCAlpha", y: 0, height: lineHeight }, { text: "beta**", y: lineHeight, height: lineHeight },
        { text: "gamma delta epsilon \uFFFCSecond verse.", y: lineHeight * 2, height: lineHeight },
      ] } }); });
      assert.equal(nativeText(opening()), "1 Alpha beta**");
      assert.equal(nativeText(tail()), "gamma delta epsilon 2 Second verse.", "width reflow chooses a fresh native split without a leading space");
      await act(async () => { text.update(React.createElement(BibleText, { ...wrapProps, showVerseNumbers: false })); });
      await act(async () => { probe().props.onTextLayout({ nativeEvent: { lines: [
        { text: "Alpha beta", y: 0, height: lineHeight }, { text: "*", y: lineHeight, height: lineHeight },
        { text: "* gamma delta epsilon Second verse.", y: lineHeight * 2, height: lineHeight },
      ] } }); });
      assert.equal(numberText(opening()), undefined);
      assert.equal(nativeText(opening()) + nativeText(tail()), "Alpha beta** gamma delta epsilon Second verse.", "hidden numbers retain all text and footnote content across the join");
    } finally {
      if (text) await act(async () => { text.unmount(); });
      text = undefined;
    }
  }

  try {
    await act(async () => { text = create(React.createElement(BibleText, { ...paragraphProps,
      verses: [{ verse: 1, reference: "John 1:1", text: "Short.", footnotes: [] }],
    })); });
    await act(async () => {
      text.root.findByProps({ testID: "bible-paragraph-content" }).props.onLayout({ nativeEvent: { layout: { y: 0, width: 320 } } });
      text.root.findByProps({ testID: "bible-paragraph-chapter" }).props.onLayout({ nativeEvent: { layout: { width: 28, height: 50 } } });
    });
    await act(async () => { text.root.findByProps({ testID: "bible-paragraph-measurement" }).props.onTextLayout({ nativeEvent: { lines: [
      { text: "\uFFFCShort.", y: 0, height: 29 },
    ] } }); });
    assert.equal(text.root.findAllByProps({ testID: "bible-paragraph-continuation" }).length, 0, "short paragraphs do not create an empty continuation");
    assert.ok(text.root.findByProps({ testID: "bible-paragraph-content" }).props.style.minHeight >= 66, "a short opening still clears the entire chapter number");
  } finally {
    if (text) await act(async () => { text.unmount(); });
    text = undefined;
  }

  const bibleFixture = JSON.parse(readFileSync(path.join(projectRoot, "assets/bible/reformationsbibeln.json"), "utf8"));
  const ezraChapter = bibleFixture.books.find(book => book.name === "Esra").chapters.find(chapter => chapter.number === 6);
  for (const fontSize of [16, 18, 28]) {
    const lineHeight = Math.round(fontSize * 1.62);
    const offsets = [];
    try {
      await act(async () => { text = create(React.createElement(BibleText, {
        ...paragraphProps, position: { book: "Ezra", chapter: 6, verse: 22 },
        readerLineHeight: lineHeight, readerTextStyle: { fontSize, lineHeight },
        selectedVerseNumbers: [], chapterHighlightByVerse: {}, spokenVerse: undefined,
        verses: ezraChapter.verses.map(item => ({ ...item, verse: item.number, reference: `Ezra 6:${item.number}` })),
        onVerseLayout: (...args) => offsets.push(args),
      }), { createNodeMock: () => ({ measureInWindow: callback => callback(0, 500, 260, 2000) }) }); });
      const paragraph = text.root.findAllByType("Text").find(node => node.props.onTextLayout);
      const verseNodes = paragraph.findAllByType("Text").filter(node => node.props.onLongPress);
      assert.equal(verseNodes.length, 22, "Esra 6 renders every selectable verse in its single paragraph");
      const lastFootnote = verseNodes.at(-1).findAllByType("Text").find(node => node.props.accessibilityLabel === "bible.footnote.open");
      assert.ok(lastFootnote, "the final verse retains its usable footnote");
      const nativeLines = ezraChapter.verses.map((verse, index) => ({
        text: `\uFFFC${verse.text}`, y: 0.25 + index * lineHeight, height: lineHeight, ascender: lineHeight * 0.75,
      }));
      await act(async () => {
        const layoutViews = text.root.findAllByType("View").filter(node => node.props.onLayout);
        layoutViews[0].props.onLayout({ nativeEvent: { layout: { y: 0 } } });
        layoutViews[1].props.onLayout({ nativeEvent: { layout: { y: 0 } } });
        layoutViews[2].props.onLayout({ nativeEvent: { layout: { y: 0 } } });
        paragraph.props.onLayout({ nativeEvent: { layout: { y: 8 } } });
        paragraph.props.onTextLayout({ nativeEvent: { lines: nativeLines } });
      });
      const finalLineBottom = nativeLines.at(-1).y + nativeLines.at(-1).height;
      assert.equal(offsets.at(-1)[0], 22);
      assert.equal(offsets.at(-1)[1] + offsets.at(-1)[2], 8 + finalLineBottom, "Esra 6:22 reports its entire last line");
      assert.ok(flattenStyle(paragraph.props.style).minHeight >= finalLineBottom, "the paragraph reserves room for the last descender at each font size");
      await act(async () => {
        text.root.findByProps({ testID: "bible-paragraph-content" }).props.onLayout({ nativeEvent: { layout: { y: 0, width: 320 } } });
        text.root.findByProps({ testID: "bible-paragraph-chapter" }).props.onLayout({ nativeEvent: { layout: { width: 28, height: 50 } } });
      });
      await act(async () => { text.root.findByProps({ testID: "bible-paragraph-measurement" }).props.onTextLayout({ nativeEvent: { lines: nativeLines } }); });
      const opening = text.root.findByProps({ testID: "bible-paragraph-opening" });
      const continuation = text.root.findByProps({ testID: "bible-paragraph-continuation" });
      const continuationY = 8 + Math.ceil(0.25 + lineHeight * 2);
      const continuationLines = nativeLines.slice(2).map((line, index) => ({ ...line, y: 0.25 + index * lineHeight }));
      await act(async () => {
        opening.props.onLayout({ nativeEvent: { layout: { y: 8 } } });
        opening.props.onTextLayout({ nativeEvent: { lines: nativeLines.slice(0, 2) } });
        continuation.props.onLayout({ nativeEvent: { layout: { y: continuationY } } });
        continuation.props.onTextLayout({ nativeEvent: { lines: continuationLines } });
      });
      const continuationBottom = continuationLines.at(-1).y + continuationLines.at(-1).height;
      assert.equal(offsets.at(-1)[0], 22);
      assert.equal(offsets.at(-1)[1] + offsets.at(-1)[2], continuationY + continuationBottom, "wrapped Esra 6 retains the full final verse bounds");
      assert.ok(flattenStyle(continuation.props.style).minHeight >= continuationBottom, "the full-width continuation contains the final descender");
      assert.ok(continuation.findAllByType("Text").filter(node => node.props.onLongPress).at(-1)
        .findAllByType("Text").some(node => node.props.accessibilityLabel === "bible.footnote.open"), "Esra 6:22 retains its footnote after wrapping below the chapter number");
    } finally {
      if (text) await act(async () => { text.unmount(); });
      text = undefined;
    }
  }
  console.log("Bible audio follow validation passed: search return, reading history, native verse selection, paragraph playback/reflow/viewport changes, spoken-verse styling, manual cancellation/resume, and saved/topic/chapter Follow behavior.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  globalThis.requestAnimationFrame = originalRequestFrame;
  globalThis.cancelAnimationFrame = originalCancelFrame;
  delete globalThis.__bibleAudioFollowTest;
}
