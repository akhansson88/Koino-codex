import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = globalThis.__scriptureSearchUI = { calls: [], prepares: 0, language: "en", refreshes: 0, selections: [] };
const frames = new Map();
let frameId = 0;
const originalRequestFrame = globalThis.requestAnimationFrame;
const originalCancelFrame = globalThis.cancelAnimationFrame;
globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
const flushFrames = () => act(async () => {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback());
});
const verses = [{ verse: 16, text: "A long passage that must remain fully readable. ".repeat(20).trim() }, { verse: 17, text: "The complete final verse, including its ending." }];
const verse = { book: "John", chapter: 3, startVerse: 16, endVerse: 17, reference: "John 3:16-17", text: verses.map(({text})=>text).join(" "), translation: "Reformationsbibeln 2026" };
const result = { id: "reformationsbibeln2026:John 3:16-17", kind: "passage", matchType: "semantic", verse, verses, sources: ["semantic"] };
const response = (results = [result]) => ({ results, mode: "hybrid", semanticState: "ready" });

async function bundle(file, mocks = {}) {
  const built = await build({ entryPoints: [file], bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent", plugins: [{ name: "search-ui-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => {
      if (path in mocks) return { path, namespace: "mock" };
      if (path === "react" || path.startsWith("react/")) return { path: require.resolve(path), external: true };
    });
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], loader: "tsx", resolveDir: process.cwd() }));
  } }] });
  const module = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

const { useScriptureSearch, useScriptureSearchSession } = await bundle("features/bible-search/use-search.ts", {
  "./semantic-runtime": `export const prepareSemanticRuntime=async()=>{globalThis.__scriptureSearchUI.prepares++;};`,
  "@/features/bible-search": `export const normalizeScriptureQuery=value=>value.trim(); export function searchScripture(options) {return new Promise((resolve,reject)=>{globalThis.__scriptureSearchUI.calls.push({options,resolve,reject});});}`,
});
let tree;
function Harness(props) { fixture.latest = useScriptureSearch(props); return null; }
const hookProps = { query: "worry", language: "en", versionId: "reformationsbibeln2026", limit: 20, visible: true };
const settleDebounce = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 210)); });
try {
  await act(async () => { tree = create(React.createElement(Harness, hookProps)); });
  assert.equal(fixture.prepares, 1, "Search opens prepare the local model without waiting for typing");
  await settleDebounce();
  const first = fixture.calls[0];
  assert.ok(first);
  await act(async () => { first.options.onPartialResults({ results: [result], mode: "lexical", semanticState: "loading" }); });
  assert.equal(fixture.latest.response.results.length, 1, "Word matches display while semantic results are pending");
  assert.equal(fixture.latest.loading, true);
  await act(async () => { tree.update(React.createElement(Harness, { ...hookProps, query: "hope" })); });
  assert.equal(first.options.signal.aborted, true, "Typing another query aborts the previous request");
  await act(async () => { first.resolve(response()); });
  assert.equal(fixture.latest.response.results.length, 0, "An obsolete response cannot replace the new query");
  await settleDebounce();
  const second = fixture.calls[1];
  await act(async () => { second.resolve(response()); });
  assert.equal(fixture.latest.loading, false);
  assert.equal(fixture.latest.response.results[0].verse.endVerse, 17);
  await act(async () => { tree.unmount(); });
  assert.equal(second.options.signal.aborted, true, "Closing search cancels outstanding work");
  tree = undefined;

  const callsBeforeStrictMount = fixture.calls.length;
  await act(async () => { tree = create(React.createElement(React.StrictMode, null,
    React.createElement(Harness, { ...hookProps, retainOnHide: true }))); });
  await settleDebounce();
  assert.equal(fixture.calls.length, callsBeforeStrictMount + 1, "Strict Mode effect replay does not leave a retained search aborted");
  await act(async () => { fixture.calls.at(-1).resolve(response()); });
  assert.equal(fixture.latest.loading, false);
  await act(async () => { tree.unmount(); });
  tree = undefined;

  fixture.response = response();
  fixture.audio = { refresh: async () => { fixture.refreshes++; }, session: undefined, pendingTopic: undefined };
  const { ScriptureSearchContent } = await bundle("features/bible-search/search-content.tsx", {
    "react-native": `export const ActivityIndicator="ActivityIndicator",Pressable="Pressable",ScrollView="ScrollView",Text="Text",TextInput="TextInput",View="View";`,
    "react-native-safe-area-context": `export const useSafeAreaInsets=()=>({bottom:0,top:0});`,
    "@expo/vector-icons": `export const Feather="Feather";`,
    "@/features/bible-search": `export {displayBibleReference} from "@/features/bible-book-names";`,
    "./use-search": `export const useScriptureSearch=()=>({response:globalThis.__scriptureSearchUI.response,loading:false,error:false,eligible:true,retry:()=>{}});`,
    "@/features/bible-audio/provider": `export const useBibleAudio=()=>globalThis.__scriptureSearchUI.audio;`,
    "@/features/bible-audio/topic-controls": `export const TopicPassageAudioControl="TopicPassageAudioControl",TopicPlaybackPanel="TopicPlaybackPanel";`,
    "@/ui/app-language": `import {translateMessage} from "@/ui/localization"; export const useAppTranslation=()=>({language:globalThis.__scriptureSearchUI.language,t:(key,values)=>translateMessage(globalThis.__scriptureSearchUI.language,key,values)});`,
    "@/ui/theme": `export const colors={},radius={lg:16};`,
    "@/ui/app-sheet": `export const SheetTextInput="TextInput";`,
  });
  const palette = { background: "white", surface: "white", text: "black", muted: "gray", accent: "#273247", buttonText: "black", line: "gray" };
  const uiProps = { bibleVersionId: "reformationsbibeln2026", visible: true, query: "hope", palette, onSelect: (selection) => fixture.selections.push(selection) };
  await act(async () => { tree = create(React.createElement(ScriptureSearchContent, uiProps)); });
  const sources = () => tree.root.findAllByType("Pressable").find((node) => ["Search sources", "Sökkällor"].includes(node.props.accessibilityLabel));
  assert.equal(sources().props.accessibilityState.expanded, false, "Legal notices stay collapsed in the main search flow");
  assert.equal(tree.root.findAllByType("Text").some((node) => node.props.children === "Multilingual E5-small"), false);
  await act(async () => { sources().props.onPress(); });
  assert.equal(sources().props.accessibilityState.expanded, true);
  const provider = (title) => tree.root.findAllByType("Pressable").find((node) => node.findAllByType("Text").some((text) => text.props.children === title));
  await act(async () => { provider("Multilingual E5-small").props.onPress(); });
  assert.ok(tree.root.findAllByType("Text").some((node) => typeof node.props.children === "string" && node.props.children.includes("Copyright (c) Microsoft Corporation") && node.props.children.includes("THE SOFTWARE IS PROVIDED")), "The complete model MIT notice can be read offline");
  await act(async () => { provider("Swedish Snowball stemmer").props.onPress(); });
  assert.ok(tree.root.findAllByType("Text").some((node) => typeof node.props.children === "string" && node.props.children.includes("Redistributions in binary form") && node.props.children.includes("Richard Boulton")), "The shipped Snowball credit includes its full binary-distribution notice");
  await act(async () => { sources().props.onPress(); });
  assert.equal(tree.root.findAllByType("Text").some((node) => node.props.children === "Multilingual E5-small"), false);
  const firstDefinition = tree.root.findByType("TopicPlaybackPanel").props.definition;
  assert.equal(firstDefinition.items[0].endVerse, 17, "Audio preserves the entire returned passage");
  const open = tree.root.findAllByType("Pressable").find((node) => node.props.accessibilityLabel?.includes("John 3:16-17") || node.props.accessibilityLabel?.includes("Johannesevangeliet 3:16-17"));
  await act(async () => { open.props.onPress(); });
  assert.equal(fixture.selections[0].endVerse, 17);
  const passage = open.findAllByType("Text").find((node) => node.props.selectable);
  const renderedText = (node) => typeof node === "string" ? node : node.children.map(renderedText).join("");
  assert.equal(renderedText(passage), `¹⁶ ${verses[0].text} ¹⁷ ${verses[1].text}`, "All Scripture text and superscript verse numbers remain in reading order");
  assert.equal(passage.props.accessibilityLabel, `16 ${verses[0].text} 17 ${verses[1].text}`, "Assistive text reads ordinary verse numbers in reading order");
  assert.equal(passage.props.numberOfLines, undefined, "Long passages have no line limit");
  const verseNumbers = (passage) => passage.findAllByType("Text").filter((node) => typeof node.props.children === "string" && /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/u.test(node.props.children));
  assert.deepEqual(verseNumbers(passage).map((node) => node.props.children), ["¹⁶", "¹⁷"]);
  assert.equal(passage.findAllByType("View").length, 0, "Numbers flow as native text without inline badge views");
  for (const number of verseNumbers(passage)) {
    assert.equal(number.props.style.color, palette.muted);
    assert.equal(number.props.style.fontWeight, "600");
    assert.notEqual(number.props.allowFontScaling, false, "Verse numbers retain native system text scaling");
  }
  assert.notEqual(passage.props.allowFontScaling, false, "The passage scales with its verse numbers");
  const tripleDigit = { ...result, id: "reformationsbibeln2026:Psalms 119:100", kind: "verse", verses: [{ verse: 100, text: "A verse with a three-digit number." }], verse: { ...verse, book: "Psalms", chapter: 119, startVerse: 100, endVerse: 100, reference: "Psalms 119:100", text: "A verse with a three-digit number." } };
  fixture.response = response([tripleDigit]);
  await act(async () => { tree.update(React.createElement(ScriptureSearchContent, uiProps)); });
  const tripleDigitPassage = tree.root.findAllByType("Text").find((node) => node.props.selectable);
  assert.deepEqual(verseNumbers(tripleDigitPassage).map((node) => node.props.children), ["¹⁰⁰"]);
  assert.equal(renderedText(tripleDigitPassage), "¹⁰⁰ A verse with a three-digit number.");
  assert.equal(tripleDigitPassage.props.accessibilityLabel, "100 A verse with a three-digit number.");
  const darkPalette = { ...palette, surface: "#172237", accent: "#FFC79A", text: "#F3F2EC", muted: "#A7B0C0" };
  await act(async () => { tree.update(React.createElement(ScriptureSearchContent, { ...uiProps, palette: darkPalette })); });
  const darkPassage = tree.root.findAllByType("Text").find((node) => node.props.selectable);
  assert.equal(verseNumbers(darkPassage)[0].props.style.color, darkPalette.muted, "Numbers use the dark theme's readable muted text color");
  fixture.response = response([result, { ...result, id: "reformationsbibeln2026:Psalms 3:9", verses: [{ verse: 9, text: "The ninth verse." }], verse: { ...verse, book: "Psalms", chapter: 3, startVerse: 9, endVerse: 9, reference: "Psalms 3:9", text: "The ninth verse." } }]);
  await act(async () => { tree.update(React.createElement(ScriptureSearchContent, uiProps)); });
  const changedDefinition = tree.root.findByType("TopicPlaybackPanel").props.definition;
  assert.notEqual(changedDefinition.id, firstDefinition.id, "A changed result list cannot masquerade as an older audio session");
  fixture.audio.session = { topic: { definition: changedDefinition, itemIndex: 0 } };
  fixture.audio.pendingRequest = { passage: { startVerse: 5, endVerse: 5 } };
  await act(async () => { tree.update(React.createElement(ScriptureSearchContent, uiProps)); });
  const firstCard = tree.root.findAllByType("View").find((node) => node.props.onLayout && node.props.style?.borderWidth);
  assert.equal(firstCard.props.style.borderWidth, 1, "A replacement passage request suppresses the stale active-row highlight");
  fixture.audio.session = undefined;
  fixture.audio.pendingRequest = undefined;
  fixture.language = "sv";
  await act(async () => { tree.update(React.createElement(ScriptureSearchContent, uiProps)); });
  assert.equal(sources().props.accessibilityLabel, "Sökkällor", "Search attribution is accessible through a Swedish entry label");
  assert.ok(tree.root.findAllByType("Text").some((node) => node.props.children === "Johannesevangeliet 3:16-17"));
  await act(async () => { tree.update(React.createElement(ScriptureSearchContent, { ...uiProps, bibleVersionId: "kjv" })); });
  assert.equal(tree.root.findAllByType("TopicPlaybackPanel").length, 0, "English Bible text does not offer unavailable recordings");
  assert.equal(tree.root.findAllByType("TopicPassageAudioControl").length, 0);
  fixture.language = "en";
  fixture.response = { results: [], mode: "lexical", semanticState: "unavailable" };
  await act(async () => { tree.update(React.createElement(ScriptureSearchContent, { ...uiProps, bibleVersionId: "kjv" })); });
  assert.ok(tree.root.findAllByType("Text").some((node) => typeof node.props.children === "string" && node.props.children.includes("Search by meaning is unavailable")), "Unavailable semantic search is explained even when word search has no matches");
  await act(async () => { tree.unmount(); });
  tree = undefined;

  // Keep the real session above content that genuinely unmounts, as native Modal does.
  const laterResult = { ...result, id: "reformationsbibeln2026:Romans 8:28", verse: { ...verse, book: "Romans", chapter: 8, startVerse: 28, endVerse: 28, reference: "Romans 8:28" } };
  const sessionProps = { language: "en", versionId: "reformationsbibeln2026", scopeKey: "reader-one" };
  const scrolls = [];
  function SessionHarness(props) {
    const [visible, setVisible] = React.useState(true);
    const session = useScriptureSearchSession({ ...props, visible });
    fixture.owner = session;
    fixture.hide = () => { session.suspend(); setVisible(false); };
    fixture.show = () => setVisible(true);
    return visible ? React.createElement(ScriptureSearchContent, {
      bibleVersionId: props.versionId, visible, session, palette,
      onSelect: (selection) => { fixture.selections.push(selection); fixture.hide(); },
    }) : null;
  }
  const scrollProps = () => tree.root.findByType("ScrollView").props;
  const cards = () => tree.root.findAllByType("View").filter((node) => node.props.onLayout && node.props.style?.borderWidth);
  const openResult = () => tree.root.findAllByType("Pressable").find((node) => node.props.accessibilityLabel?.includes("3:16-17"));
  const retryButton = () => tree.root.findAllByType("Pressable").find((node) => node.findAllByType("Text").some((text) => text.props.children === "Try again"));
  const measureSearch = async () => {
    await act(async () => {
      scrollProps().onLayout({ nativeEvent: { layout: { height: 400 } } });
      // Rows can lay out before the final content-size event reaches JS.
      cards().forEach((card, index) => card.props.onLayout({ nativeEvent: { layout: { y: 100 + 1500 * index } } }));
      scrollProps().onContentSizeChange(400, 2400);
    });
    await flushFrames();
  };
  fixture.language = "en";
  fixture.audio = { refresh: async () => {}, session: undefined, pendingTopic: undefined };
  await act(async () => { tree = create(React.createElement(SessionHarness, sessionProps), {
    createNodeMock: (element) => element.type === "ScrollView" ? { scrollTo: (value) => scrolls.push(value) } : null,
  }); });
  await act(async () => { fixture.owner.setQuery("hope"); });
  await settleDebounce();
  const retainedRequest = fixture.calls.at(-1);
  const retainedResponse = response([result, laterResult]);
  await act(async () => { retainedRequest.resolve(retainedResponse); });
  await measureSearch();
  const playlist = tree.root.findByType("TopicPlaybackPanel").props.definition;

  for (const playback of ["none", "paused", "playing", "pending"]) {
    await act(async () => {
      scrollProps().onScrollBeginDrag();
      scrollProps().onScroll({ nativeEvent: { contentOffset: { y: 720 } } });
      openResult().props.onPress();
    });
    assert.equal(tree.root.findAllByType("ScrollView").length, 0, "Opening a result unmounts the search content");
    assert.equal(fixture.owner.query, "hope");
    assert.equal(fixture.owner.search.response, retainedResponse);
    assert.equal(retainedRequest.options.signal.aborted, true);
    fixture.audio.session = playback === "paused" || playback === "playing" ? { topic: { definition: playlist, itemIndex: 1 } } : undefined;
    fixture.audio.playWhenReady = playback === "playing";
    fixture.audio.pendingTopic = playback === "pending" ? { definition: playlist, options: { initialItemId: laterResult.id } } : undefined;
    const callCount = fixture.calls.length;
    scrolls.length = 0;
    await act(async () => { fixture.show(); });
    assert.equal(scrolls.length, 0, `${playback}: restoration waits for native layout`);
    assert.equal(tree.root.findByType("TextInput").props.value, "hope");
    assert.equal(tree.root.findByType("TopicPlaybackPanel").props.definition.id, playlist.id, "Restored results preserve playlist identity");
    await act(async () => {
      scrollProps().onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
      scrollProps().onLayout({ nativeEvent: { layout: { height: 400 } } });
      scrollProps().onContentSizeChange(400, 450);
    });
    assert.equal(fixture.owner.scroll.offset, 720, "An initial native scroll event cannot erase the saved position");
    await flushFrames();
    assert.equal(scrolls.length, 0, "An incomplete content layout does not consume restoration");
    await measureSearch();
    assert.deepEqual(scrolls, [{ y: 720, animated: false }], `${playback}: restore once without following the current audio`);
    await measureSearch();
    await settleDebounce();
    assert.equal(scrolls.length, 1, "Later native layout events do not repeat restoration");
    assert.equal(fixture.calls.length, callCount, "Reopening search does not rerun the query");
    if (playback !== "none") {
      const sync = tree.root.findAllByType("Pressable").find((node) => node.findAllByType("Text").some((text) => text.props.children === "Sync with audio"));
      assert.ok(sync, "Returning while playing, paused, or pending offers explicit Sync");
      await act(async () => { sync.props.onPress(); });
      assert.deepEqual(scrolls.at(-1), { y: 1588, animated: true }, "Sync explicitly resumes following the current passage");
    }
  }

  fixture.audio.session = undefined;
  fixture.audio.pendingTopic = undefined;
  await act(async () => {
    scrollProps().onScrollBeginDrag();
    scrollProps().onScroll({ nativeEvent: { contentOffset: { y: 1900 } } });
    fixture.hide();
  });
  scrolls.length = 0;
  await act(async () => { fixture.show(); });
  await act(async () => {
    scrollProps().onLayout({ nativeEvent: { layout: { height: 650 } } });
    cards().forEach((card, index) => card.props.onLayout({ nativeEvent: { layout: { y: 100 + 1500 * index } } }));
    scrollProps().onContentSizeChange(400, 2400);
  });
  await flushFrames();
  assert.deepEqual(scrolls, [{ y: 1750, animated: false }], "A larger returned viewport clamps restoration to the available content");
  await act(async () => { fixture.owner.setQuery("peace"); });
  await settleDebounce();
  const interruptedRequest = fixture.calls.at(-1);
  const partial = { results: [result], mode: "lexical", semanticState: "loading" };
  await act(async () => { interruptedRequest.options.onPartialResults(partial); });
  await act(async () => { openResult().props.onPress(); });
  assert.equal(interruptedRequest.options.signal.aborted, true);
  await act(async () => { interruptedRequest.options.onPartialResults(response([laterResult])); interruptedRequest.resolve(response([laterResult])); });
  assert.equal(fixture.owner.search.response, partial, "Late completions cannot replace the list saved on selection");
  await act(async () => { fixture.show(); });
  assert.equal(fixture.owner.search.loading, false);
  assert.equal(fixture.owner.search.interrupted, true);
  assert.ok(retryButton(), "An interrupted partial search offers Retry");
  const callsBeforeRetry = fixture.calls.length;
  await act(async () => { retryButton().props.onPress(); });
  await settleDebounce();
  assert.equal(fixture.calls.length, callsBeforeRetry + 1);
  await act(async () => { fixture.calls.at(-1).resolve(retainedResponse); });
  assert.equal(fixture.owner.search.interrupted, false);
  await act(async () => { fixture.owner.setQuery(""); });
  assert.equal(fixture.owner.search.response.results.length, 0);
  await act(async () => { fixture.owner.setQuery("peace"); });
  await settleDebounce();
  assert.equal(fixture.calls.length, callsBeforeRetry + 2, "Re-entering a cleared query starts a new search");
  await act(async () => { fixture.calls.at(-1).resolve(retainedResponse); });
  await act(async () => { fixture.hide(); });
  await act(async () => { tree.update(React.createElement(SessionHarness, { ...sessionProps, versionId: "kjv" })); });
  assert.equal(fixture.owner.query, "peace", "Translation changes retain the query");
  assert.equal(fixture.owner.search.response.results.length, 0, "A hidden search cannot expose results from another translation");
  assert.equal(fixture.owner.scroll.offset, 0);
  await act(async () => { fixture.show(); });
  await settleDebounce();
  assert.equal(fixture.calls.at(-1).options.versionId, "kjv");
  await act(async () => { tree.update(React.createElement(SessionHarness, { ...sessionProps, language: "sv" })); });
  assert.equal(fixture.owner.query, "peace");
  assert.equal(fixture.owner.search.response.results.length, 0, "Language changes invalidate results");
  await act(async () => { tree.update(React.createElement(SessionHarness, { ...sessionProps, scopeKey: "reader-two" })); });
  assert.equal(fixture.owner.query, "", "Changing accounts discards the previous search session");
  assert.equal(fixture.owner.scroll.offset, 0);
  await act(async () => { tree.unmount(); });
  tree = undefined;

  const { normalizeBiblePosition, verseCountForChapter } = await bundle("features/bible-canon.ts");
  assert.equal(verseCountForChapter("Psalms", 3, "reformationsbibeln2026"), 9);
  assert.equal(verseCountForChapter("Psalms", 3, "kjv"), 8);
  assert.equal(normalizeBiblePosition({ book: "Psalms", chapter: 3, verse: 9 }, "reformationsbibeln2026").verse, 9);
  assert.equal(normalizeBiblePosition({ book: "Psalms", chapter: 3, verse: 9 }, "kjv").verse, 1);
  assert.equal(verseCountForChapter("Numbers", 12, "reformationsbibeln2026"), 15);
  console.log("Shared Scripture search passed: retained sessions, native remount/scroll restoration, audio Sync, interrupted search/retry, account/translation isolation, partial results, ranges, and bilingual references.");
} finally {
  if (tree) await act(async () => { tree.unmount(); });
  globalThis.requestAnimationFrame = originalRequestFrame;
  globalThis.cancelAnimationFrame = originalCancelFrame;
  delete globalThis.__scriptureSearchUI;
}
