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
      ScrollView = "ScrollView", Text = "Text", View = "View", Modal = "Modal";
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
    const actions = { dispatch: async () => {} };
    export const useKoinoFields = () => state, useKoinoActions = () => actions;
  `,
  "@/features/bible-kjv": `
    export { kjvBooks, normalizeBiblePosition, previousBibleChapter, nextBibleChapter } from "@/features/bible-canon";
    export { bibleVersionFor, isBibleVersionId } from "@/features/bible-versions";
    export const bibleChapterAsync = async () => ({ verses: Array.from({ length: 40 }, (_, index) => ({ verse: index + 1, text: "Fixture text" })), subtitles: [] });
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
    : { measureInWindow: done => done(0, 100, 420, 800) } }); });
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
  await unmount();
  // Exercise the real text component as well as the screen. Reporting verse
  // positions must work regardless of native parent/child layout event order.
  const { BibleText } = await loadComponent("features/bible-reader/chapter-text.tsx");
  const reportedOffsets = [];
  const textProps = {
    chapterHighlightByVerse: {}, onVerseLayout: (...args) => reportedOffsets.push(args), onVerseRef() {},
    palette: {}, planMarkers: [], position: { book: "John", chapter: 1, verse: 1 },
    readerLineHeight: 24, readerTextStyle: { fontSize: 18 }, selectedVerseNumbers: [], showVerseNumbers: true,
    subtitles: [], verses: [{ verse: 1, reference: "John 1:1", text: "Fixture", footnotes: [] }],
  };
  let text;
  try {
    await act(async () => { text = create(React.createElement(BibleText, { ...textProps, key: "John:1" })); });
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
  console.log("Bible audio follow validation passed: native top-visible selection, rapid scrolling, delayed/stale measurements, chapter/translation cancellation, layout ordering/reflow, and saved/topic/chapter Follow behavior.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  globalThis.requestAnimationFrame = originalRequestFrame;
  globalThis.cancelAnimationFrame = originalCancelFrame;
  delete globalThis.__bibleAudioFollowTest;
}
