import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = globalThis.__scriptureSearchUI = { calls: [], prepares: 0, language: "en", refreshes: 0, selections: [] };
const verse = { book: "John", chapter: 3, startVerse: 16, endVerse: 17, reference: "John 3:16-17", text: "The complete first and second verse.", translation: "Reformationsbibeln 2026" };
const result = { id: "reformationsbibeln2026:John 3:16-17", kind: "passage", matchType: "semantic", verse, sources: ["semantic"] };
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

const { useScriptureSearch } = await bundle("features/bible-search/use-search.ts", {
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
  const palette = { background: "white", surface: "white", text: "black", muted: "gray", accent: "olive", line: "gray" };
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
  assert.ok(tree.root.findAllByType("Text").some((node) => node.props.children === verse.text), "Result cards retain full Scripture text");
  fixture.response = response([result, { ...result, id: "reformationsbibeln2026:Psalms 3:9", verse: { ...verse, book: "Psalms", chapter: 3, startVerse: 9, endVerse: 9, reference: "Psalms 3:9" } }]);
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

  const { normalizeBiblePosition, verseCountForChapter } = await bundle("features/bible-canon.ts");
  assert.equal(verseCountForChapter("Psalms", 3, "reformationsbibeln2026"), 9);
  assert.equal(verseCountForChapter("Psalms", 3, "kjv"), 8);
  assert.equal(normalizeBiblePosition({ book: "Psalms", chapter: 3, verse: 9 }, "reformationsbibeln2026").verse, 9);
  assert.equal(normalizeBiblePosition({ book: "Psalms", chapter: 3, verse: 9 }, "kjv").verse, 1);
  assert.equal(verseCountForChapter("Numbers", 12, "reformationsbibeln2026"), 15);
  console.log("Shared Scripture search passed: partial results, cancellation, ranges, audio identities, bilingual references, and translation bounds.");
} finally {
  if (tree) await act(async () => { tree.unmount(); });
  delete globalThis.__scriptureSearchUI;
}
