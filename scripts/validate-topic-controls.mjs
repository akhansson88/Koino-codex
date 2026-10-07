import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const calls = [];
const methods = {
  startTopicPlaylist: async (...args) => { calls.push(["start", ...args]); },
  setTopicPause: async seconds => { calls.push(["pause", seconds]); },
  setTopicLoop: async loop => { calls.push(["loop", loop]); },
  toggle: async () => { calls.push(["toggle"]); },
  retry: async () => { calls.push(["retry"]); },
  refresh: async () => { calls.push(["refresh"]); },
  seek: async seconds => { calls.push(["seek", seconds]); },
  moveTopicPassage: async direction => { calls.push(["move", direction]); },
  setSpeed: async speed => { calls.push(["speed", speed]); },
  setSleep: async sleep => { calls.push(["sleep", sleep]); },
  stop: async () => { calls.push(["stop"]); },
};
const entry = { bookId: 43, book: "John", bookName: "Johannesevangeliet", chapter: 1, manifestUrl: "john-1" };
const initialAudio = { ...methods, catalog: { chapters: { "43:1": entry } }, catalogState: "ready", topicPauseSeconds: 3, loading: false, commandPending: false, playing: false, playWhenReady: false, problem: null, speed: 1, sleep: 0, continuous: true, position: 0 };
const state = globalThis.__topicControls = { audio: initialAudio, language: "en", verses: {} };
const palette = { surface: "white", line: "gray", input: "cream", text: "black", muted: "gray", accent: "olive" };
const references = [
  { reference: "John 1:2-3", verse: { book: "John", chapter: 1, startVerse: 2, endVerse: 3, reference: "John 1:2-3", translation: "Reformationsbibeln 2026", text: "Every word of this complete topic passage remains visible, including the words at the end." } },
  { reference: "John 1:5", verse: { book: "John", chapter: 1, startVerse: 5, endVerse: 5, reference: "John 1:5", translation: "Reformationsbibeln 2026", text: "The second passage has independent playback controls." } },
];
state.verses = Object.fromEntries(references.map(value => [value.reference, value.verse]));
const mocked = {
  "react-native": `export const ActivityIndicator='ActivityIndicator',Pressable='Pressable',Text='Text',View='View',Switch='Switch',ScrollView='ScrollView'; export const Platform={OS:'android'};`,
  "react-native-gesture-handler": `export const NativeViewGestureHandler='NativeViewGestureHandler';`,
  "expo-haptics": `export const selectionAsync=async()=>{};`,
  "@react-native-community/slider": `export default 'Slider';`,
  "@expo/vector-icons": `export const Feather='Feather';`,
  "./provider": `export const useBibleAudio=()=>globalThis.__topicControls.audio;`,
  "@/features/bible-audio/provider": `export const useBibleAudio=()=>globalThis.__topicControls.audio;`,
  "@/ui/app-language": `import {translateMessage} from '@/ui/localization'; export const useAppTranslation=()=>({language:globalThis.__topicControls.language,t:(key,values)=>translateMessage(globalThis.__topicControls.language,key,values)});`,
  "@/features/use-bible-book-language": `export const useBibleBookLanguage=()=>'en';`,
  "@/features/bible-kjv": `export {kjvBooks} from '@/features/bible-canon'; export const searchBibleText=async()=>[],bibleVerseFromReference=reference=>globalThis.__topicControls.verses[reference];`,
  "@/features/bible-search": `export {displayBibleBookName} from '@/features/bible-book-names'; export const displayBibleReference=reference=>reference;`,
  "@/features/bible-reader/header": `export const ReaderCircleButton='ReaderCircleButton';`,
  "react-native-safe-area-context": `export const useSafeAreaInsets=()=>({top:0,bottom:0});`,
  "@/ui/app-sheet": `export const SheetTextInput='SheetTextInput',AppSheet='AppSheet';`,
  "@/ui/theme": `export const colors={},radius={lg:16,md:12},brandPalette={warmPersika:'peach',deepNavy:'navy'}; export const platformShadow=()=>({});`,
};
async function bundle(file) {
  const result = await build({ entryPoints: [file], bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent", plugins: [{ name: "topic-controls-mocks", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => {
      if (mocked[path]) return { path, namespace: "mock" };
      if (path === "react" || path.startsWith("react/")) return { path: require.resolve(path), external: true };
    });
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocked[path], loader: "tsx", resolveDir: process.cwd() }));
  } }] });
  const module = { exports: {} }; new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports); return module.exports;
}
const { topicDefinition, topicReferenceItemIds } = await bundle("features/bible-audio/topic-definition.ts");
const { TopicPlaybackPanel, TopicPassageAudioControl } = await bundle("features/bible-audio/topic-controls.tsx");
const { DrawerVerseRow } = await bundle("features/bible-reader/drawer-components.tsx");
const { BibleAudioPlayer } = await bundle("features/bible-audio/player.tsx");
const { BibleTopicDetailPane } = await bundle("features/bible-reader/topic-detail.tsx");
const { translateMessage } = await bundle("ui/localization.ts");
const definition = topicDefinition({ topic: "Hope", title: "Hope", translation: "reformationsbibeln2026", references });
assert.equal(definition.items.length, 2);
assert.deepEqual(definition.items.map(({ book, chapter, startVerse, endVerse }) => ({ book, chapter, startVerse, endVerse })), [{ book: "John", chapter: 1, startVerse: 2, endVerse: 3 }, { book: "John", chapter: 1, startVerse: 5, endVerse: 5 }]);
assert.deepEqual(topicReferenceItemIds(references), definition.items.map(item => item.id));
const duplicateReferences = [references[0], references[0], references[1]];
const duplicates = topicDefinition({ topic: "Hope", title: "Hope", translation: "reformationsbibeln2026", references: duplicateReferences });
assert.equal(new Set(duplicates.items.map(item => item.id)).size, 3, "Identical displayed references retain distinct occurrence identities");
assert.deepEqual(duplicates.items.map(item => item.id), topicReferenceItemIds(duplicateReferences), "The row-to-playlist identity mapping preserves displayed order");
const withoutText = topicDefinition({ topic: "Hope", title: "Hope", translation: "reformationsbibeln2026", references: [{ reference: "Johannesevangeliet 1:2–3" }, { reference: "not a passage" }] });
assert.equal(withoutText.items.length, 0, "Unresolved topic references do not play an unverified fragment");
assert.equal(withoutText.unavailableCount, 2, "Unresolved references contribute to the visible skipped count");

let renderer; let navigations = 0; let votes = 0;
function Topic({ currentDefinition = definition }) {
  return React.createElement(React.Fragment, null,
    React.createElement(TopicPlaybackPanel, { definition: currentDefinition, palette }),
    ...references.map((value, index) => React.createElement(DrawerVerseRow, { key: index, fullText: true, reference: value.reference, text: value.verse.text, palette,
      onPress: () => { navigations++; },
      action: React.createElement("Pressable", { accessibilityLabel: `Vote: ${value.reference}`, onPress: () => { votes++; } }),
      footer: React.createElement(TopicPassageAudioControl, { definition: currentDefinition, itemId: currentDefinition.items[index]?.id ?? "missing", reference: value.reference, palette }),
    })));
}
const root = () => renderer.root;
const buttons = () => root().findAllByType("Pressable");
const texts = () => root().findAllByType("Text").flatMap(node => typeof node.props.children === "string" ? [node.props.children] : []);
const t = (key, values) => translateMessage(state.language, key, values);
const named = label => buttons().find(node => node.props.accessibilityLabel === label);
const press = async node => { assert.ok(node, "Expected control to be present"); assert.notEqual(node.props.disabled, true, "Expected control to be enabled"); await act(async () => { await node.props.onPress(); }); };
const update = async (audio = initialAudio, currentDefinition = definition) => { state.audio = audio; await act(async () => { renderer.update(React.createElement(Topic, { currentDefinition })); }); };
const chapter = { book: "John", bookName: "Johannesevangeliet", chapter: 1, verses: [{ verse: 1, duration: 7 }, { verse: 2, duration: 8 }, { verse: 3, duration: 9 }, { verse: 5, duration: 11 }] };
const session = (overrides = {}) => ({ entry, chapter, index: 1, topic: { definition, mode: "all", loop: "off", pauseSeconds: 3, itemIndex: 0, phase: "verse", unavailableItemIds: [], ...overrides } });

try {
  await act(async () => { renderer = create(React.createElement(Topic)); });
  // Assertions are added against the actual localized labels below, so translated UI is
  // checked alongside request identity rather than relying on component implementation.
  for (const value of references) {
    assert.equal(root().findAllByType("Text").find(node => node.props.children === value.verse.text).props.numberOfLines, undefined, "Topic passages display their complete text");
  }
  // The named button checks below also verify keyboard/screen-reader labels include each reference.
  const firstPlay = () => named(`${t("bible.topics.audio.playPassage")}: ${references[0].reference}`);
  const secondPlay = () => named(`${t("bible.topics.audio.playPassage")}: ${references[1].reference}`);
  const playAll = () => buttons().find(node => node.props.accessibilityLabel?.startsWith(`${t("bible.topics.audio.playAll")}: `));
  assert.ok(firstPlay()); assert.ok(secondPlay()); assert.ok(playAll());
  for (const control of [firstPlay(), secondPlay(), playAll()]) {
    const style = Object.assign({}, ...[control.props.style].flat().filter(Boolean));
    assert.ok(style.minHeight >= 44 && style.minWidth >= 44, "Topic playback touch targets are at least 44 points");
  }
  for (let parent = firstPlay().parent; parent; parent = parent.parent) assert.notEqual(parent.type, "Pressable", "Playback is outside the tappable passage");
  await press(firstPlay());
  assert.equal(calls.at(-1)[0], "start"); assert.equal(calls.at(-1)[1], definition); assert.deepEqual(calls.at(-1)[2], { mode: "single", initialItemId: definition.items[0].id });
  assert.equal(navigations, 0, "Playing an individual passage keeps the topic open");
  await press(playAll());
  assert.equal(calls.at(-1)[0], "start"); assert.equal(calls.at(-1)[1], definition); assert.equal(calls.at(-1)[2].mode, "all");
  await press(named(`Vote: ${references[0].reference}`));
  assert.equal(votes, 1); assert.equal(navigations, 0, "Voting and playback remain independent");
  await update({ ...initialAudio, session: session(), playWhenReady: true });
  const pauseFirst = named(`${t("bible.topics.audio.pausePassage")}: ${references[0].reference}`);
  assert.ok(pauseFirst); assert.ok(secondPlay());
  await press(pauseFirst); assert.equal(calls.at(-1)[0], "toggle");
  const loopButton = () => buttons().find(node => /loop|repeat|upprepa/i.test(node.props.accessibilityLabel ?? ""));
  assert.ok(loopButton()); await press(loopButton()); assert.deepEqual(calls.at(-1), ["loop", "passage"]);
  await update({ ...initialAudio, session: session({ loop: "passage" }) });
  assert.equal(loopButton().props.accessibilityState.selected, true);
  await press(loopButton()); assert.deepEqual(calls.at(-1), ["loop", "topic"]);
  await update({ ...initialAudio, session: session({ loop: "topic" }) });
  await press(loopButton()); assert.deepEqual(calls.at(-1), ["loop", "off"]);
  const speechSlider = () => root().findAllByType("Slider").find(node => node.props.accessibilityLabel?.startsWith(t("audio.passageProgress")));
  assert.equal(speechSlider().props.maximumValue, 17, "Topic panel speech progress excludes prior chapter verses and pauses");
  assert.equal(speechSlider().props.value, 0);
  await act(async () => { speechSlider().props.onSlidingComplete(12); });
  assert.deepEqual(calls.at(-1), ["seek", 8], "Topic panel scrubbing snaps to the beginning of the selected numbered verse");
  assert.equal(named(t("bible.topics.audio.previousPassage")).props.disabled, true);
  await press(named(t("bible.topics.audio.nextPassage"))); assert.deepEqual(calls.at(-1), ["move", 1]);
  const slider = root().findAllByType("Slider").find(node => node.props.accessibilityLabel === t("bible.topics.audio.pauseLabel"));
  assert.equal(slider.props.minimumValue, 0); assert.equal(slider.props.maximumValue, 60); assert.equal(slider.props.step, 1);
  await act(async () => { await slider.props.onSlidingComplete(60); });
  assert.deepEqual(calls.at(-1), ["pause", 60]);
  await update({ ...initialAudio, position: 8, session: session({ phase: "gap", gapRemainingSeconds: 2 }) });
  assert.equal(speechSlider().props.value, 8, "Speech progress stays at the preceding verse's end during a pause");
  assert.ok(texts().some(value => /2/.test(value)), "Current silent pause has a visible remaining-time indicator");
  const staleScrub = speechSlider().props.onSlidingComplete;
  const secondSession = { ...session({ itemIndex: 1 }), index: 3 };
  await update({ ...initialAudio, session: secondSession });
  const beforeStaleSeek = calls.filter(call => call[0] === "seek").length;
  await act(async () => { staleScrub(12); });
  assert.equal(calls.filter(call => call[0] === "seek").length, beforeStaleSeek, "A scrub callback from a previous topic passage cannot seek the new passage");
  assert.equal(speechSlider().props.maximumValue, 11); assert.equal(named(t("bible.topics.audio.nextPassage")).props.disabled, true);
  await update({ ...initialAudio, session: secondSession, position: 11 });
  await press(secondPlay());
  assert.equal(calls.at(-1)[0], "start"); assert.deepEqual(calls.at(-1)[2], { mode: "single", initialItemId: definition.items[1].id }, "Replaying a completed topic item starts only that complete passage");
  const pending = { definition, options: { mode: "single", initialItemId: definition.items[1].id } };
  await update({ ...initialAudio, session: session(), pendingTopic: pending, loading: true });
  const loadingSecond = buttons().find(node => node.props.accessibilityLabel?.includes(references[1].reference) && node.props.accessibilityState?.busy);
  assert.ok(loadingSecond); assert.equal(loadingSecond.props.disabled, true); assert.ok(firstPlay(), "Only the requested topic item is loading");
  await update({ ...initialAudio, session: session(), pendingTopic: pending, problem: "network" });
  const retrySecond = buttons().find(node => node.props.accessibilityLabel?.includes(references[1].reference) && /retry|försök/i.test(node.props.accessibilityLabel));
  assert.ok(retrySecond); assert.ok(firstPlay(), "A stale session cannot claim a new item's network failure");
  await press(retrySecond); assert.equal(calls.at(-1)[0], "retry");
  await update({ ...initialAudio, pendingTopic: pending, problem: "unavailable" });
  assert.equal(secondPlay().props.disabled, true, "Missing recordings stay visible without an inappropriate network retry");
  const unsupported = { ...definition, translation: "kjv" };
  await update(initialAudio, unsupported);
  assert.equal(firstPlay().props.disabled, true); assert.equal(playAll().props.disabled, true);
  assert.ok(texts().some(value => /Reformationsbibeln/.test(value)), "Unsupported translations explain the available narration");
  await update({ ...initialAudio, catalog: undefined, catalogState: "loading" });
  assert.equal(firstPlay().props.disabled, true);
  await update({ ...initialAudio, catalog: undefined, catalogState: "error" });
  const refresh = buttons().find(node => /retry.*list|loading audio list|försök.*lista/i.test(node.props.accessibilityLabel ?? ""));
  await press(refresh); assert.equal(calls.at(-1)[0], "refresh", "Catalog failure retry does not retry another passage");
  await update({ ...initialAudio, session: session({ unavailableItemIds: [definition.items[1].id] }) });
  assert.ok(texts().some(value => /1/.test(value)), "The topic panel displays the skipped recording count");
  const other = { ...definition, id: "topic:other", topic: "Peace", title: "Peace" };
  await update({ ...initialAudio, session: session(), playWhenReady: true }, other);
  assert.ok(playAll(), "Browsing another topic does not retarget the active queue");
  await press(playAll()); assert.equal(calls.at(-1)[1], other);
  state.language = "sv"; await update();
  assert.ok(firstPlay()?.props.accessibilityLabel.startsWith("Spela")); assert.ok(playAll());

  // The shared expanded/compact player uses the same speech boundaries and topic settings.
  state.language = "en";
  let followed = 0, dismissed = 0;
  const playerProps = { visible: true, onClose: () => { dismissed++; }, onOpen() {}, palette, book: "Genesis", chapter: 1, version: "kjv", bottom: 0, follow: false, onFollow: () => { followed++; }, onChooseTranslation() {} };
  const renderPlayer = async (audio, props = playerProps) => { state.audio = audio; await act(async () => { renderer.update(React.createElement(BibleAudioPlayer, props)); }); };
  await renderPlayer({ ...initialAudio, session: session(), position: 4 });
  assert.equal(root().findByProps({ accessibilityRole: "header" }).props.children, definition.title);
  const playerProgress = () => root().findAllByType("Slider").find(node => node.props.accessibilityLabel === t("audio.passageProgress"));
  assert.equal(playerProgress().props.maximumValue, 17); assert.equal(playerProgress().props.value, 4);
  assert.equal(root().findAllByType("Switch").length, 0, "Chapter continuous-play controls are hidden for topic queues");
  assert.ok(!texts().includes(t("audio.endChapter")), "End-of-chapter sleep is hidden for topic queues");
  assert.ok(texts().includes(t("audio.minutes", { minutes: 15 })), "Time-based sleep controls remain available");
  assert.equal(named(t("bible.topics.audio.previousPassage")).props.disabled, true);
  assert.equal(named(t("bible.topics.audio.nextPassage")).props.disabled, false);
  await press(named(t("bible.topics.audio.nextPassage"))); assert.deepEqual(calls.at(-1), ["move", 1]);
  await renderPlayer({ ...initialAudio, session: session({ phase: "gap", gapRemainingSeconds: 2 }), position: 8 });
  assert.equal(playerProgress().props.value, 8);
  assert.ok(texts().includes(t("bible.topics.audio.gap", { seconds: 2 })));
  await act(async () => { root().findByType("AppSheet").props.onClose(); });
  assert.equal(followed, 0, "Closing topic playback does not enable reader following"); assert.equal(dismissed, 1);
  const followControl = buttons().find(node => node.findAllByType("Text").some(child => child.props.children === t("audio.follow")));
  await press(followControl); assert.equal(followed, 1, "Explicit topic Follow remains available");
  await renderPlayer({ ...initialAudio, session: session({ phase: "gap", gapRemainingSeconds: 2 }), position: 8 }, { ...playerProps, visible: false });
  assert.equal(playerProgress().props.maximumValue, 17); assert.equal(playerProgress().props.value, 8);
  assert.ok(texts().some(text => text.includes(references[0].reference)), "The compact player identifies its current topic reference");
  await renderPlayer({ ...initialAudio, session: session(), pendingTopic: { definition, options: { mode: "all" } }, loading: true });
  assert.equal(root().findAllByType("Slider").length, 0, "Pending topic playback hides a stale session's speech timeline");
  assert.equal(root().findByProps({ accessibilityRole: "header" }).props.children, definition.title);

  // Real topic detail wiring preserves card navigation, votes and its active playback list.
  let detailNavigations = 0, detailVotes = 0;
  const detailReferences = references.map((value, index) => ({ reference: value.reference, votes: 8 - index, voteId: `vote-${index}` }));
  const detailProps = { bibleVersionId: "reformationsbibeln2026", bibleVersionLabel: "Reformationsbibeln 2026", loading: false, onBack() {}, onSelectReference: () => { detailNavigations++; }, onVote: () => { detailVotes++; }, palette, references: detailReferences, source: "openbible", topic: "Hope", userVotes: {}, votePending: "" };
  state.audio = initialAudio;
  await act(async () => { renderer.update(React.createElement(BibleTopicDetailPane, detailProps)); });
  for (const value of references) assert.equal(root().findAllByType("Text").find(node => node.props.children === value.verse.text).props.numberOfLines, undefined, "The real topic detail card displays the full translated passage");
  for (let parent = firstPlay().parent; parent; parent = parent.parent) assert.notEqual(parent.type, "Pressable");
  await press(firstPlay()); assert.equal(detailNavigations, 0); assert.equal(detailVotes, 0);
  const voteControl = buttons().find(node => node.findAllByType("Text").some(child => child.props.children === t("bible.topics.helpful")));
  await press(voteControl); assert.equal(detailVotes, 1); assert.equal(detailNavigations, 0);
  const navigate = named(t("bible.navigator.openPassage", { reference: references[0].reference }));
  await press(navigate); assert.equal(detailNavigations, 1);
  const playbackCommandsBeforeReorder = calls.filter(([kind]) => ["start", "stop", "toggle"].includes(kind)).length;
  state.audio = { ...initialAudio, session: session(), playWhenReady: true };
  await act(async () => { renderer.update(React.createElement(BibleTopicDetailPane, { ...detailProps, references: [...detailReferences].reverse(), userVotes: { "hope:vote-0": 1 } })); });
  assert.equal(calls.filter(([kind]) => ["start", "stop", "toggle"].includes(kind)).length, playbackCommandsBeforeReorder, "Voting and reordered topic results do not replace active playback");
  const stopsBeforeClosing = calls.filter(([kind]) => kind === "stop").length;
  await act(async () => { renderer.update(React.createElement("View")); });
  assert.equal(calls.filter(([kind]) => kind === "stop").length, stopsBeforeClosing, "Closing the topic detail does not stop playback");
  console.log("Topic definition identities, full text, separate playback controls, pause/loop settings, pending ownership, unavailable recordings and localization passed.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  delete globalThis.__topicControls;
}
