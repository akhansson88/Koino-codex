import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const test = globalThis.__chapterNavigationTest = { animations: [], haptics: [], requests: [], os: "android" };
const frames = new Map();
let frameId = 0;
const originalFrame = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = id => frames.delete(id);

const mocks = {
  "react-native": `export const View = "View", Text = "Text", Pressable = "Pressable"; export const Platform = { get OS() { return globalThis.__chapterNavigationTest.os; } };`,
  "@expo/vector-icons": `export const Feather = "Feather";`,
  "@/ui/app-language": `export const useAppTranslation = () => ({ t: key => key });`,
  "expo-haptics": `
    const test = globalThis.__chapterNavigationTest;
    export const AndroidHaptics = { Segment_Tick: "segment-tick" };
    export const performAndroidHapticsAsync = async type => { test.haptics.push(type); };
    export const selectionAsync = async () => { test.haptics.push("selection"); };
  `,
  "react-native-worklets": `export const scheduleOnRN = (callback, ...args) => callback(...args);`,
  "react-native-reanimated": `
    import { useRef } from "react";
    const test = globalThis.__chapterNavigationTest;
    export function useSharedValue(initial) {
      const ref = useRef();
      if (!ref.current) {
        let value = initial;
        ref.current = {
          get value() { return value; },
          set value(next) {
            if (next?.animation) {
              cancelAnimation(ref.current);
              test.animations.push({ ...next, shared: ref.current, apply: () => { value = next.toValue; } });
            } else value = next;
          },
        };
      }
      return ref.current;
    }
    export const cancelAnimation = shared => {
      for (const item of test.animations) if (item.shared === shared && !item.done) {
        item.done = true; item.callback?.(false);
      }
    };
    export const useAnimatedStyle = callback => callback();
    export const ReduceMotion = { Never: "never" };
    export const withSpring = (toValue, config, callback) => ({ animation: "spring", toValue, config, callback });
    export const withTiming = (toValue, config, callback) => ({ animation: "timing", toValue, config, callback });
    export default { View: "AnimatedView", Text: "AnimatedText" };
  `,
  "react-native-gesture-handler": `
    import React from "react";
    class Handler {
      handlers = {}; config = {};
      enabled(value) { this.config.enabled = value; return this; }
      maxPointers(value) { this.config.maxPointers = value; return this; }
      manualActivation(value) { this.config.manualActivation = value; return this; }
      requireExternalGestureToFail(value) { this.config.waitFor = value; return this; }
    }
    for (const name of ["onTouchesDown", "onTouchesMove", "onTouchesUp", "onStart", "onUpdate", "onEnd", "onFinalize"]) {
      Handler.prototype[name] = function(callback) { this.handlers[name] = callback; return this; };
    }
    export const Gesture = { Pan: () => new Handler(), Native: () => new Handler() };
    export const GestureDetector = props => React.createElement("Detector", props, props.children);
  `,
  "@/features/bible-kjv": `
    export { nextBibleChapter, previousBibleChapter } from "@/features/bible-canon";
    export const bibleChapterAsync = (book, chapter, version) => new Promise((resolve, reject) => {
      globalThis.__chapterNavigationTest.requests.push({ book, chapter, version, resolve, reject });
    });
  `,
};

async function load(entry, boundaries = mocks) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false,
    plugins: [{ name: "chapter-native-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        if (path in boundaries) return { path, namespace: "mock" };
        if (path === "react" || path.startsWith("react/")) return { path: require.resolve(path), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

async function flushFrames() {
  for (let round = 0; frames.size; round++) {
    assert.ok(round < 20, "Frame callbacks must settle");
    const callbacks = [...frames.values()]; frames.clear();
    await act(async () => { callbacks.forEach(callback => callback()); });
  }
}
async function finishAnimations() {
  const items = test.animations.filter(item => !item.done);
  await act(async () => { for (const item of items) { item.done = true; item.apply(); item.callback?.(true); } });
  await flushFrames();
  return items;
}

let renderer;
try {
  const navigation = await load("features/bible-reader/chapter-navigation.ts");
  const { chapterIndex, chapterGestureIntent, chapterSwipeStep, chapterDragProgress, ReaderScrollIntent } = navigation;
  assert.equal(chapterIndex({ book: "John", chapter: 21 }) + 1, chapterIndex({ book: "Acts", chapter: 1 }));
  assert.equal(chapterGestureIntent(4, 8), "vertical");
  assert.equal(chapterGestureIntent(24, 3), "horizontal");
  assert.equal(chapterGestureIntent(4, 4), "pending");
  assert.equal(chapterSwipeStep(-110, 5, -100, 390), 1);
  assert.equal(chapterSwipeStep(110, 5, 100, 390), -1);
  assert.equal(chapterSwipeStep(-60, 0, -900, 390), 1, "Fast flicks use points/second");
  assert.equal(chapterSwipeStep(-60, 0, -300, 390), 0);
  assert.equal(chapterSwipeStep(-140, 0, 900, 390), 0, "A quick reversal cancels the turn");
  assert.equal(chapterSwipeStep(-140, 100, -900, 390), 0, "Diagonal reading gestures do not turn pages");
  assert.equal(chapterDragProgress(-195, 390, true, true), 0.5);
  assert.ok(Math.abs(chapterDragProgress(500, 390, false, true) * 390) < 24, "Unavailable pages have bounded resistance");
  const scroll = new ReaderScrollIntent();
  const old = scroll.request("kjv:John:3", { kind: "verse", verse: 1 });
  const top = scroll.request("kjv:John:3", { kind: "top" });
  assert.equal(scroll.isCurrent(old, "kjv:John:3"), false, "Even same-chapter callbacks carry a request revision");
  scroll.complete(old);
  assert.equal(scroll.pending, top);
  assert.equal(scroll.isCurrent(top, "kjv:John:4"), false);
  scroll.complete(top);
  assert.equal(scroll.isCurrent(top, "kjv:John:3"), false, "Completed requests cannot scroll again from duplicate layout frames");
  scroll.cancel();
  assert.equal(scroll.isCurrent(top, "kjv:John:3"), false);

  const { ChapterPager, useChapterCursor } = await load("features/bible-reader/chapter-pager.tsx");
  const chapter = { heading: "A multiline heading", subtitles: [], verses: [{ verse: 1, text: "Actual chapter", footnotes: [] }] };
  const pages = [2, 3, 4].map(number => ({ key: `kjv:John:${number}`, index: chapterIndex({ book: "John", chapter: number }), position: { book: "John", chapter: number, verse: 1 }, chapter }));
  let pagerProps, cursor, commits = [], errors = 0;
  const pagerRef = React.createRef();
  function Harness() {
    cursor = useChapterCursor({ book: "John", chapter: 3, verse: 1 });
    return React.createElement(ChapterPager, { ...pagerProps, ref: pagerRef, cursor });
  }
  const update = async changes => {
    pagerProps = { ...pagerProps, ...changes };
    await act(async () => { renderer.update(React.createElement(Harness)); });
    await flushFrames();
  };
  const mount = async (overrides = {}) => {
    test.animations = []; test.haptics = []; commits = []; errors = 0;
    pagerProps = { pages, currentKey: pages[1].key, width: 390, layoutKey: "verse:20", navigationRevision: 0, reducedMotion: false,
      enabled: true, backgroundColor: "white", viewportRef: React.createRef(), onLayout() {}, onInteractionChange() {},
      onRetry() {}, onLoadError() { errors++; },
      onCommit(page) { commits.push(page.key); pagerProps = { ...pagerProps, currentKey: page.key, navigationRevision: pagerProps.navigationRevision + 1 }; renderer.update(React.createElement(Harness)); },
      renderPage: (page, active) => React.createElement("PageContent", { chapter: page.chapter, active }), ...overrides };
    await act(async () => { renderer = create(React.createElement(Harness)); });
    await act(async () => { renderer.root.findAllByType("AnimatedView").forEach(node => node.props.onLayout({ nativeEvent: { layout: { width: 390, height: 700 } } })); });
    await flushFrames();
  };
  const unmount = async () => { await act(async () => renderer.unmount()); renderer = undefined; frames.clear(); };
  const pan = () => renderer.root.findAllByType("Detector")[0].props.gesture;
  async function drag(dx, dy = 0, velocity = 0, interrupt = false) {
    const handler = pan().handlers;
    const event = (x, y) => ({ numberOfTouches: 1, allTouches: [{ absoluteX: x, absoluteY: y }] });
    let activated = false, failed = false;
    const manager = { fail() { failed = true; }, activate() { activated = true; handler.onStart(); } };
    await act(async () => {
      handler.onTouchesDown(event(200, 300), manager);
      handler.onTouchesMove(event(200 + dx, 300 + dy), manager);
      if (activated) {
        handler.onUpdate({ translationX: dx, translationY: dy });
        handler.onEnd({ translationX: dx, translationY: dy, velocityX: velocity }, !interrupt);
        handler.onFinalize();
      }
    });
    return { activated, failed, handler };
  }

  await mount();
  const retainedPan = pan();
  const inactive = renderer.root.findAllByType("AnimatedView").filter(node => node.props.importantForAccessibility === "no-hide-descendants");
  assert.equal(inactive.length, 2);
  assert.ok(inactive.every(node => node.props.pointerEvents === "none"));
  assert.equal(renderer.root.findAllByType("Detector")[1].props.gesture.config.waitFor, pan(), "Native scrolling waits only until horizontal intent is classified");
  const vertical = await drag(3, 40);
  assert.equal(vertical.failed, true); assert.equal(vertical.activated, false);
  await drag(-50); await finishAnimations();
  await drag(-140, 0, 900); await finishAnimations();
  await drag(-140, 0, -900, true); await finishAnimations();
  assert.deepEqual(commits, []); assert.deepEqual(test.haptics, []);
  await drag(-150);
  assert.equal(commits.length, 0, "History waits until the page settles");
  await act(async () => { pagerRef.current.step(1); pagerRef.current.step(1); });
  assert.equal(test.animations.filter(item => !item.done).length, 1, "Rapid taps cannot start duplicate transitions");
  const completed = await finishAnimations();
  assert.deepEqual(commits, [pages[2].key]);
  assert.deepEqual(test.haptics, ["segment-tick"]);
  assert.equal(pan(), retainedPan, "Promoting a preview keeps the native pan and its scroll relationships attached");
  // Run the installed animation engine, rather than instantly finishing its
  // mocked boundary, to catch invisible settling tails that keep input locked.
  const { withSpring: nativeSpring } = await load("node_modules/react-native-reanimated/src/animation/spring/spring.ts", {
    "../util": `export const defineAnimation = (_value, factory) => factory(); export const getReduceMotionForAnimation = () => false;`,
    "../../common": `export const logger = { warn(message) { throw new Error(message); } };`,
  });
  for (const distance of [-1, -0.75, -0.05, 0.05, 0.75, 1]) {
    const destination = pages[1].index;
    const start = destination + distance;
    const animation = nativeSpring(destination, completed[0].config);
    animation.onStart(animation, start, 1000);
    let settled = false;
    for (let elapsed = 16; elapsed <= 400; elapsed += 16) {
      settled = animation.onFrame(animation, 1000 + elapsed);
      assert.ok(animation.current >= Math.min(start, destination) && animation.current <= Math.max(start, destination), "Completion and cancellation never overshoot");
      if (settled) break;
    }
    assert.ok(settled, "A settled page releases input within 400ms instead of waiting through an invisible spring tail");
    assert.equal(animation.current, destination);
  }
  await act(async () => { completed[0].callback(true); });
  assert.equal(test.haptics.length, 1, "A duplicate completion is ignored");
  await act(async () => { pagerRef.current.step(1); });
  assert.equal(commits.length, 1, "No available destination means no additional turn or haptic");
  await drag(150);
  await finishAnimations();
  assert.deepEqual(commits, [pages[2].key, pages[1].key], "The retained gesture reads the newly active chapter and available directions");
  assert.equal(test.haptics.length, 2);
  await unmount();

  await mount({ reducedMotion: true });
  assert.ok(renderer.root.findAllByType("AnimatedView").every(node => node.props.style[1].transform[0].translateX === 0));
  await act(async () => { pagerRef.current.step(-1); });
  assert.equal(test.animations.at(-1).animation, "timing");
  assert.equal(test.animations.at(-1).config.duration, 120);
  await finishAnimations(); assert.equal(commits[0], pages[0].key);
  await unmount();

  await mount();
  await act(async () => { pagerRef.current.step(1); });
  const stale = test.animations.at(-1);
  await update({ currentKey: pages[0].key, navigationRevision: 1 });
  await act(async () => stale.callback(true));
  assert.deepEqual(commits, []); assert.deepEqual(test.haptics, []);
  await unmount();

  const waitingPages = pages.map((page, index) => index === 2 ? { ...page, chapter: undefined } : page);
  await mount({ pages: waitingPages });
  await act(async () => { pagerRef.current.step(1); });
  assert.equal(test.animations.length, 0, "The current chapter stays in place while its neighbor loads");
  await update({ pages });
  await finishAnimations(); assert.equal(commits.length, 1);
  await unmount();
  await mount({ pages: waitingPages });
  await act(async () => { pagerRef.current.step(1); });
  await update({ pages: waitingPages.map((page, index) => index === 2 ? { ...page, error: true } : page) });
  assert.equal(errors, 1); assert.deepEqual(commits, []); assert.deepEqual(test.haptics, []);
  await unmount();
  await mount(); await act(async () => { pagerRef.current.step(1); });
  const abandoned = test.animations.at(-1);
  await unmount(); await act(async () => abandoned.callback(true));
  assert.deepEqual(commits, []); assert.deepEqual(test.haptics, []);

  const { useChapterWindow } = await load("features/bible-reader/chapter-window.ts");
  let window, version = "kjv", position = { book: "John", chapter: 3, verse: 1 };
  function WindowProbe() { window = useChapterWindow(position, version); return null; }
  test.requests = [];
  await act(async () => { renderer = create(React.createElement(WindowProbe)); });
  assert.equal(test.requests.length, 3);
  const oldRequests = [...test.requests];
  version = "reformationsbibeln2026";
  await act(async () => { renderer.update(React.createElement(WindowProbe)); });
  await act(async () => { oldRequests.forEach(item => item.resolve(chapter)); });
  assert.ok(window.pages.every(page => !page.chapter), "Late results from the old translation never populate the new window");
  await act(async () => { test.requests.slice(3).forEach(item => item.resolve(chapter)); });
  assert.equal(window.pages.length, 3); assert.equal(window.loadedChapter.value, chapter);
  position = { book: "John", chapter: 4, verse: 1 };
  await act(async () => { renderer.update(React.createElement(WindowProbe)); });
  assert.equal(window.loadedChapter.value, chapter, "A preloaded neighbor is immediately available after committing");
  assert.equal(test.requests.length, 7, "Advancing loads only the new neighbor and preserves measured chapter/projection identities");
  assert.equal(window.pages.length, 3);
  await unmount();

  const { BibleReaderHeader } = await load("features/bible-reader/header.tsx");
  const headerCursor = { value: 3 };
  for (const progress of [0, 0.25, 0.5, 0.75, 1, -0.25, -0.75]) {
    headerCursor.value = 3 + progress;
    await act(async () => { renderer = create(React.createElement(BibleReaderHeader, {
      title: "John 3", chapterIndex: 3, chapterCursor: headerCursor, previousChapterTitle: "John 2", nextChapterTitle: "John 4", palette: {},
    })); });
    const visibleTitles = renderer.root.findAllByType("AnimatedText").filter(node => node.props.style.at(-1).opacity > 0);
    assert.ok(visibleTitles.length <= 1, "Chapter labels fade through without overlapping into a misleading chapter number");
    await unmount();
  }

  const { chapterSelectionHaptic } = await load("features/bible-reader/chapter-haptics.ts");
  test.haptics = []; test.os = "ios"; chapterSelectionHaptic();
  test.os = "web"; chapterSelectionHaptic();
  assert.deepEqual(test.haptics, ["selection"]);
  console.log("Bible chapter navigation passed: scroll request races, intent thresholds, actual page previews, cancellation, reversals, single commits/haptics, loading/errors, reduced motion, stale completions, unmounting, and bounded bilingual preloading.");
} finally {
  if (renderer) await act(async () => renderer.unmount());
  globalThis.requestAnimationFrame = originalFrame;
  globalThis.cancelAnimationFrame = originalCancel;
  delete globalThis.__chapterNavigationTest;
}
