import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const calls = [];
const entry = { bookId: 43, book: "John", bookName: "Johannesevangeliet", chapter: 1, manifestUrl: "test-john-1" };
const verse = { id: "saved-john", book: "John", chapter: 1, startVerse: 3, endVerse: 4, reference: "John 1:3-4", text: "A complete saved passage, with every final word retained.", translation: "Reformationsbibeln 2026", savedAt: "2026-10-07T10:00:00Z" };
const secondVerse = { ...verse, id: "saved-john-second", startVerse: 5, endVerse: 5, reference: "John 1:5" };
const methods = { startPassage: async (...args) => { calls.push(["start", ...args]); }, toggle: async () => { calls.push(["toggle"]); }, retry: () => { calls.push(["retry"]); }, refresh: async () => { calls.push(["refresh"]); } };
const initialAudio = { ...methods, catalog: { chapters: { "43:1": entry } }, catalogState: "ready", loading: false, commandPending: false, problem: null, playWhenReady: false };
const state = globalThis.__savedAudio = { audio: initialAudio, language: "en" };
const mocks = {
  "react-native": `export const ActivityIndicator="ActivityIndicator",Pressable="Pressable",Text="Text",View="View";`,
  "@expo/vector-icons": `export const Feather="Feather";`,
  "@/features/bible-audio/provider": `export const useBibleAudio=()=>globalThis.__savedAudio.audio;`,
  "./provider": `export const useBibleAudio=()=>globalThis.__savedAudio.audio;`,
  "@/ui/app-language": `import {translateMessage} from "@/ui/localization"; export const useAppTranslation=()=>({language:globalThis.__savedAudio.language,t:(key,values)=>translateMessage(globalThis.__savedAudio.language,key,values)});`,
  "@/features/use-bible-book-language": `export const useBibleBookLanguage=()=>"en";`,
  "@/features/bible-kjv": `export {kjvBooks} from "@/features/bible-canon";`,
  "@/features/bible-search": `export {displayBibleBookName} from "@/features/bible-book-names";`,
  "@/ui/app-sheet": `export const SheetTextInput="SheetTextInput";`,
  "@/ui/theme": `export const colors={},radius={lg:16};`,
};
async function bundle(file) {
  const result = await build({ entryPoints: [file], bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent",
    plugins: [{ name: "saved-audio-mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        if (mocks[path]) return { path, namespace: "mock" };
        if (path === "react" || path.startsWith("react/")) return { path: require.resolve(path), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const { savedAudioPassage, hasSavedAudioTranslation } = await bundle("features/bible-audio/saved-passage.ts");
const { SavedVerseAudioControl } = await bundle("features/bible-audio/saved-verse-audio.tsx");
const { DrawerVerseRow } = await bundle("features/bible-reader/drawer-components.tsx");
const range = { book: "John", chapter: 1, startVerse: 3, endVerse: 4, savedVerseId: verse.id };
assert.deepEqual(savedAudioPassage(verse), range);
for (const translation of ["reformationsbibeln2026", " Reformationsbibeln 2026 ", "REFORMATIONSBIBELN 2026"]) assert.equal(hasSavedAudioTranslation(translation), true);
for (const translation of [undefined, "", "KJV", "unknown", "Reformationsbibeln 2016"]) assert.equal(hasSavedAudioTranslation(translation), false);
const legacy = { id: verse.id, reference: "Johannesevangeliet 1:3 – 4", translation: "reformationsbibeln2026", text: verse.text, savedAt: verse.savedAt };
assert.deepEqual(savedAudioPassage(legacy), range, "Reference-only saved passages preserve the full legacy range");
assert.deepEqual(savedAudioPassage({ ...legacy, reference: "john 1:3—4" }), range, "Canonical book aliases and Unicode range dashes resolve");
assert.deepEqual(savedAudioPassage({ ...verse, endVerse: undefined }), range, "Missing legacy end metadata comes from the reference");
assert.equal(savedAudioPassage({ ...legacy, reference: "3 John 1:15" }).endVerse, 15, "Use the audio manifest rather than KJV verse counts for translation-specific verses");
for (const invalid of [
  { translation: "KJV" }, { translation: undefined }, { book: "Unknown" }, { chapter: 0 }, { chapter: 99 }, { chapter: null },
  { startVerse: 0 }, { startVerse: 3.5 }, { endVerse: 2 }, { endVerse: Number.MAX_SAFE_INTEGER + 1 },
  { book: "Genesis" }, { reference: "John 1:3,5" }, { reference: "John 1:3-2:4" },
]) assert.equal(savedAudioPassage({ ...verse, ...invalid }), undefined, `Reject ambiguous or invalid saved audio: ${JSON.stringify(invalid)}`);

let renderer;
let navigations = 0, menus = 0;
const palette = { surface: "white", line: "gray", input: "cream", text: "black", muted: "gray", accent: "olive" };
function Rows({ fullText = true }) {
  return React.createElement(React.Fragment, null, ...[verse, secondVerse].map(saved => React.createElement(DrawerVerseRow, {
    key: saved.id, fullText, text: saved.text, reference: saved.reference, palette,
    onPress: () => { navigations++; },
    action: React.createElement("Pressable", { accessibilityLabel: `More: ${saved.reference}`, onPress: () => { menus++; } }),
    footer: React.createElement(SavedVerseAudioControl, { verse: saved, reference: saved.reference, palette }),
  })));
}
const rerender = async (audio = initialAudio, fullText = true) => {
  state.audio = audio;
  await act(async () => { renderer.update(React.createElement(Rows, { fullText })); });
};
const buttons = () => renderer.root.findAllByType("Pressable");
const button = (label, reference = verse.reference) => buttons().find(node => node.props.accessibilityLabel === `${label}: ${reference}`);
const texts = () => renderer.root.findAllByType("Text");
const textIncludes = value => texts().some(node => typeof node.props.children === "string" && node.props.children.includes(value));
const press = async node => { assert.ok(node); await act(async () => { node.props.onPress(); }); };
try {
  await act(async () => { renderer = create(React.createElement(Rows)); });
  assert.equal(texts().find(node => node.props.children === verse.text).props.numberOfLines, undefined);
  assert.ok(buttons().some(node => node.props.accessibilityLabel.includes(verse.text)), "Screen readers receive the complete stored text");
  const play = button("Play saved passage");
  assert.equal(play.props.disabled, false);
  assert.ok(play.props.style.minHeight >= 44 && play.props.style.minWidth >= 44);
  for (let parent = play.parent; parent; parent = parent.parent) assert.notEqual(parent.type, "Pressable", "Play must be a sibling of passage navigation");
  await press(play);
  assert.deepEqual(calls.at(-1), ["start", entry, range]);
  assert.equal(navigations, 0, "Playing audio does not open the reader");
  await press(buttons().find(node => node.props.accessibilityLabel === `More: ${verse.reference}`));
  assert.equal(menus, 1);
  assert.equal(navigations, 0, "More actions remain independent from navigation");
  await rerender(initialAudio, false);
  assert.equal(texts().find(node => node.props.children === verse.text).props.numberOfLines, 2, "Other drawer previews retain their compact text");

  const session = { entry, passage: range, chapter: { book: "John", chapter: 1 }, index: 2 };
  await rerender({ ...initialAudio, session, playWhenReady: true, buffering: true });
  assert.ok(button("Pause saved passage"));
  assert.ok(button("Play saved passage", secondVerse.reference), "Only the active saved row shows Pause");
  await press(button("Pause saved passage"));
  assert.equal(calls.at(-1)[0], "toggle", "Buffering playback can still pause");
  await rerender({ ...initialAudio, session, playWhenReady: false });
  assert.ok(button("Play saved passage"), "Paused or completed passage returns to Play");

  const pendingRequest = { entry, passage: range, offset: 0, autoplay: true };
  await rerender({ ...initialAudio, loading: true, pendingRequest });
  assert.equal(button("Loading saved audio…").props.disabled, true);
  assert.equal(button("Loading saved audio…").props.accessibilityState.busy, true);
  assert.equal(renderer.root.findAllByType("ActivityIndicator").length, 1, "Only the requested row loads");
  assert.equal(button("Play saved passage", secondVerse.reference).props.disabled, false, "A newer saved passage can replace a pending request");
  await rerender({ ...initialAudio, pendingRequest, problem: "network" });
  assert.equal(button("Retry saved audio").props.disabled, false);
  await press(button("Retry saved audio"));
  assert.equal(calls.at(-1)[0], "retry");
  assert.ok(button("Play saved passage", secondVerse.reference), "Network failures belong only to the requested row");
  const secondPassage = savedAudioPassage(secondVerse);
  await rerender({ ...initialAudio, session, pendingRequest: { ...pendingRequest, passage: secondPassage }, problem: "network" });
  assert.equal(button("Retry saved audio"), undefined, "A previous session must not claim the new request's error");
  assert.ok(button("Retry saved audio", secondVerse.reference));
  await press(button("Play saved passage"));
  assert.deepEqual(calls.at(-1), ["start", entry, range], "Playing the previous row replaces a failed pending request instead of toggling its stale session");
  await rerender({ ...initialAudio, session, pendingTopic: { definition: { id: "hope" }, options: { mode: "all" } }, problem: "network" });
  assert.ok(button("Play saved passage"));
  assert.equal(button("Retry saved audio"), undefined, "A saved row must not claim a pending topic's failure");
  await press(button("Play saved passage"));
  assert.deepEqual(calls.at(-1), ["start", entry, range], "Saved playback replaces a pending topic instead of toggling the previous saved queue");
  await rerender({ ...initialAudio, pendingRequest, problem: "unavailable" });
  assert.equal(button("Play saved passage").props.disabled, true);
  assert.ok(textIncludes("Audio is unavailable for this saved passage."));
  assert.equal(button("Retry saved audio"), undefined, "Missing narration is not presented as a network failure");

  await rerender({ ...initialAudio, catalog: { chapters: {} } });
  assert.equal(button("Play saved passage").props.disabled, true);
  assert.ok(textIncludes("Narration is not available"));
  await rerender({ ...initialAudio, catalog: undefined, catalogState: "loading" });
  assert.ok(textIncludes("Loading audio…"));
  await rerender({ ...initialAudio, catalog: undefined, catalogState: "error" });
  assert.equal(button("Play saved passage").props.disabled, true);
  await press(button("Retry loading audio list"));
  assert.equal(calls.at(-1)[0], "refresh", "Catalog retry does not retry an unrelated playback request");

  state.language = "sv";
  await rerender();
  assert.ok(button("Spela sparat bibelord"), "Saved playback labels are localized");
  await act(async () => { renderer.update(React.createElement(SavedVerseAudioControl, { verse: { ...verse, translation: "KJV" }, reference: verse.reference, palette })); });
  assert.equal(button("Spela sparat bibelord").props.disabled, true);
  assert.ok(textIncludes("Uppläsning finns just nu bara"), "Unsupported translations have a visible explanation");
  console.log("Saved passage parsing, full text, independent controls, playback states, retries and localized availability passed.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  delete globalThis.__savedAudio;
}
