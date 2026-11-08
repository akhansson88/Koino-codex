import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const test = globalThis.__readerHeaderTest = { animations: [], reactions: new Set(), accessibility: new Set(), screenReader: false };
const mocks = {
  "react-native": `
    export const ScrollView = "ScrollView", View = "View";
    export const AccessibilityInfo = {
      isScreenReaderEnabled: async () => globalThis.__readerHeaderTest.screenReader,
      addEventListener: (_name, callback) => {
        const listeners = globalThis.__readerHeaderTest.accessibility; listeners.add(callback);
        return { remove: () => listeners.delete(callback) };
      },
    };
  `,
  "react-native-worklets": `export const scheduleOnRN = (callback, ...args) => callback(...args);`,
  "react-native-reanimated": `
    import { useLayoutEffect, useRef } from "react";
    const test = globalThis.__readerHeaderTest;
    export const Easing = { bezier: (...curve) => curve };
    export function cancelAnimation(shared) {
      for (const item of test.animations) if (!item.done && item.shared === shared) {
        item.done = true; item.callback?.(false);
      }
    }
    export function useSharedValue(initial) {
      const ref = useRef();
      if (!ref.current) {
        let value = initial;
        ref.current = { get value() { return value; }, set value(next) {
          cancelAnimation(ref.current);
          if (next?.animation) test.animations.push({ ...next, shared: ref.current, apply: () => { value = next.target; } });
          else { value = next; for (const reaction of [...test.reactions]) reaction(); }
        } };
      }
      return ref.current;
    }
    export const withTiming = (target, config, callback) => ({ animation: true, target, config, callback, delay: 0 });
    export const withDelay = (delay, animation) => ({ ...animation, delay });
    export const useAnimatedStyle = callback => ({ get transform() { return callback().transform; }, get opacity() { return callback().opacity; } });
    export function useAnimatedReaction(prepare, react) {
      useLayoutEffect(() => {
        let previous = null;
        const check = () => { const next = prepare(); if (next !== previous) { const old = previous; previous = next; react(next, old); } };
        test.reactions.add(check); check(); return () => test.reactions.delete(check);
      }, [prepare, react]);
    }
    export function useAnimatedScrollHandler(handlers) {
      test.handlers = handlers;
      return event => handlers.onScroll(event.nativeEvent ?? event);
    }
    export default { View: "AnimatedView", ScrollView: "ScrollView" };
  `,
};

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false,
    plugins: [{ name: "native-header-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "mock" }
        : path === "react" || path.startsWith("react/") ? { path: require.resolve(path), external: true } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

const { advanceHeaderScroll, headerScrollState, headerSettleTarget, readerHeaderOcclusion } = await load("features/bible-reader/header-scroll.ts");
const begin = (y, hidden = 0) => ({ ...headerScrollState(y, hidden), tracking: true, dragging: true });
const step = (state, y, content = 2000, viewport = 800) => advanceHeaderScroll(state, y, content, viewport, 63);

let state = begin(100);
state = step(state, 111);
assert.equal(state.hidden, 0, "small downward movements do not move the header");
state = step(state, 120);
assert.equal(state.hidden, 8, "only travel beyond the 12 dp threshold moves the header");
assert.equal(headerSettleTarget(state, 63), 63);
state = step(state, 200);
assert.equal(state.hidden, 63, "the header stops exactly at its measured height");
state = step(state, 195);
assert.equal(state.hidden, 63, "a tiny upward correction is ignored");
state = step(state, 185);
assert.equal(state.hidden, 54, "upward tracking starts after 6 dp");
assert.equal(headerSettleTarget(state, 63), 0);
state = step(state, -40);
assert.equal(state.hidden, 0, "top overscroll reveals the header");
state = step(state, -10);
assert.equal(state.hidden, 0, "top bounce cannot hide it again");
state = step(begin(1180, 63), 1280);
state = step(state, 1240);
assert.equal(state.hidden, 63, "bottom bounce cannot count as an upward reading gesture");
state = step(state, 1180);
assert.ok(state.hidden < 63);
assert.equal(step(begin(0, 63), 20, 400, 800).hidden, 0, "short chapters keep the header visible");
assert.equal(step(headerScrollState(0, 63), 500).hidden, 63, "automatic scrolling preserves the header");
assert.equal(headerSettleTarget(step(begin(100), 106), 63), 0, "an unqualified drag keeps its resting state");
assert.equal(headerSettleTarget(step(begin(100, 40), 102), 63), 63, "an interrupted settle cannot leave the header halfway hidden");
assert.equal(headerSettleTarget(step(begin(100, 20), 102), 63), 0);
assert.equal(readerHeaderOcclusion(63, 20), 43);
assert.equal(readerHeaderOcclusion(63, 63), 0);
assert.equal(readerHeaderOcclusion(63, 63, true, 0.5), 63, "fading controls still occlude text");
assert.equal(readerHeaderOcclusion(63, 63, true, 0), 0);

const { useReaderHeader, useReaderHeaderScroll } = await load("features/bible-reader/use-reader-header.ts");
let renderer;
let options = { enabled: true, focused: true, reducedMotion: false, pageKey: "John:1" };
const callbacks = [];
let header;
function Harness(props) {
  header = useReaderHeader(props);
  useReaderHeaderScroll(header.motion, props.active !== false, props.eventPageKey ?? props.pageKey, {
    onScroll: event => callbacks.push(["scroll", event.nativeEvent.contentOffset.y]),
    onBeginDrag: () => callbacks.push(["begin"]),
    onMomentumEnd: () => callbacks.push(["end"]),
  });
  return null;
}
const event = (y, content = 2000, viewport = 800) => ({ contentOffset: { x: 0, y }, contentSize: { width: 390, height: content }, layoutMeasurement: { width: 390, height: viewport } });
async function send(kind, y, content, viewport) { await act(async () => { test.handlers[kind](event(y, content, viewport)); }); }
async function finishAnimations() {
  await act(async () => {
    for (const animation of [...test.animations]) if (!animation.done) {
      animation.done = true; animation.apply();
      for (const reaction of [...test.reactions]) reaction();
      animation.callback?.(true);
    }
  });
}
async function update(changes) {
  options = { ...options, ...changes };
  await act(async () => { renderer.update(React.createElement(Harness, options)); });
}
try {
  await act(async () => { renderer = create(React.createElement(Harness, options)); });
  assert.equal(header.topOcclusion(), 63);
  await send("onScroll", 200);
  assert.equal(header.motion.hidden.value, 0, "programmatic scroll events never start tracking");
  await send("onMomentumBegin", 200);
  await send("onScroll", 300);
  await send("onMomentumEnd", 300);
  assert.equal(header.motion.hidden.value, 0);
  await send("onBeginDrag", 100);
  await send("onScroll", 140);
  assert.equal(header.motion.hidden.value, 28);
  assert.equal(header.topOcclusion(), 35);
  await send("onEndDrag", 140);
  assert.equal(test.animations.at(-1).delay, 48, "wait for a possible native momentum handoff");
  await send("onMomentumBegin", 140);
  await send("onScroll", 210);
  await send("onMomentumEnd", 210);
  assert.equal(test.animations.at(-1).config.duration, 160);
  await finishAnimations();
  assert.equal(header.hidden, true);
  assert.equal(header.topOcclusion(), 0);
  await send("onBeginDrag", 210);
  await send("onScroll", 190);
  await send("onEndDrag", 190);
  await finishAnimations();
  assert.equal(header.hidden, false);
  assert.equal(header.topOcclusion(), 63);
  assert.ok(callbacks.some(([kind, y]) => kind === "scroll" && y === 140), "legacy scroll callbacks keep receiving native coordinates");
  assert.ok(callbacks.some(([kind]) => kind === "begin"));
  assert.ok(callbacks.some(([kind]) => kind === "end"));

  await send("onBeginDrag", 200);
  await send("onScroll", 500);
  await act(async () => { header.stopTracking(); });
  await send("onScroll", 300);
  assert.equal(header.motion.hidden.value, 63, "an explicit automatic scroll cancels user tracking");
  await update({ pageKey: "John:2" });
  await send("onScroll", 0);
  assert.equal(header.hidden, true, "audio chapter handoffs preserve the hidden header");
  await update({ eventPageKey: "John:1" });
  const before = callbacks.length;
  await send("onBeginDrag", 100);
  await send("onScroll", 0);
  assert.equal(callbacks.length, before, "late events from the outgoing chapter are ignored");
  await update({ eventPageKey: "John:2", active: false });
  await send("onBeginDrag", 100);
  await send("onScroll", 0);
  assert.equal(header.hidden, true, "preview chapters cannot change header state");
  await update({ active: true });
  await act(async () => { header.reveal(); header.suspend(true); });
  await send("onBeginDrag", 100);
  await send("onScroll", 300);
  assert.equal(header.motion.hidden.value, 0, "horizontal gestures suspend vertical header tracking");
  await act(async () => { header.suspend(false); });
  await update({ enabled: false });
  await send("onBeginDrag", 100);
  await send("onScroll", 300);
  assert.equal(header.motion.hidden.value, 0, "sheets and verse actions suspend header tracking");
  await update({ enabled: true });
  await send("onBeginDrag", 100);
  await send("onScroll", 300);
  await update({ focused: false });
  await update({ focused: true });
  assert.equal(header.motion.hidden.value, 0, "returning to the Bible reveals its controls");

  await update({ reducedMotion: true });
  await send("onBeginDrag", 100);
  await send("onScroll", 120);
  assert.equal(header.style.transform[0].translateY, 0, "reduced motion never translates controls");
  assert.equal(test.animations.at(-1).config.duration, 120);
  await finishAnimations();
  assert.equal(header.hidden, true);
  assert.equal(header.topOcclusion(), 0);
  await act(async () => { for (const listener of test.accessibility) listener(true); });
  assert.equal(header.hidden, false, "enabling the screen reader reveals the header immediately");
  await send("onBeginDrag", 100);
  await send("onScroll", 300);
  assert.equal(header.motion.hidden.value, 0, "screen-reader users retain access to the header");

  await act(async () => { for (const listener of test.accessibility) listener(false); });
  await update({ reducedMotion: false });
  await act(async () => { header.onLayout({ nativeEvent: { layout: { height: 78 } } }); });
  assert.equal(header.height, 78);
  await send("onBeginDrag", 100);
  await send("onScroll", 300);
  assert.equal(header.motion.hidden.value, 78, "larger text and measured layouts use the actual header height");
  await act(async () => { header.onLayout({ nativeEvent: { layout: { height: 90 } } }); });
  assert.equal(header.motion.hidden.value, 90, "remeasurement preserves a completely hidden header");
  assert.equal(header.topOcclusion(), 0);
  await act(async () => { header.onLayout({ nativeEvent: { layout: { height: 90.25 } } }); });
  assert.equal(header.height, 90.25, "native fractional-pixel measurements are retained");
  assert.equal(header.motion.hidden.value, 90.25);
  assert.equal(header.hidden, true);

  const { ChapterPageScrollView } = await load("features/bible-reader/chapter-page.tsx");
  const scrollRef = React.createRef();
  const origins = [], scrolls = [];
  const nativeScroll = { scrollTo: value => scrolls.push(value) };
  function PageHarness(props) {
    const current = useReaderHeader({ ...options, ...props });
    return React.createElement(ChapterPageScrollView, {
      active: props.active, pageKey: options.pageKey, headerMotion: current.motion, activeScrollRef: scrollRef,
      onOrigin: y => origins.push(y), contentStyle: {}, onScroll: event => callbacks.push(["page", event.nativeEvent.contentOffset.y]),
    });
  }
  await act(async () => { renderer.unmount(); renderer = create(React.createElement(PageHarness, { active: true }), {
    createNodeMock: element => element.type === "ScrollView" ? nativeScroll : null,
  }); });
  assert.equal(scrollRef.current, nativeScroll, "the animated chapter retains its native scrollTo ref");
  await act(async () => {
    renderer.root.findByProps({ testID: "bible-reader-content" }).props.onLayout({ nativeEvent: { layout: { y: 81 } } });
    renderer.root.findByType("ScrollView").props.onScroll({ nativeEvent: event(100) });
  });
  assert.equal(origins.at(-1), 81);
  assert.deepEqual(callbacks.at(-1), ["page", 100], "the actual chapter forwards animated scroll events to the reader");
  await act(async () => { renderer.update(React.createElement(PageHarness, { active: false })); });
  assert.equal(scrollRef.current, null);
  assert.deepEqual(scrolls.at(-1), { y: 0, animated: false }, "inactive preview chapters reset without moving the active reader");
  assert.equal(renderer.root.findByType("ScrollView").props.scrollEnabled, false);
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  assert.equal(test.accessibility.size, 0);
  assert.equal(test.reactions.size, 0);
  delete globalThis.__readerHeaderTest;
}
console.log("Bible header validation passed: gesture thresholds, reversals, overscroll, settling, audio/programmatic isolation, chapter handoffs, callbacks, measured geometry, reduced motion, and screen-reader access.");
