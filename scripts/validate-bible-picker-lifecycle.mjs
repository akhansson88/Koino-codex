import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "koino-picker-lifecycle-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const lifecycle = globalThis.__pickerLifecycle = { mounts: 0, unmounts: 0, ready: false };
const mocks = {
  "react-native": `
    import React from "react";
    export const Platform = { OS: "android", select: values => values.android ?? values.default };
    export const ActivityIndicator = "ActivityIndicator", Pressable = "Pressable",
      ScrollView = "ScrollView", Text = "Text", View = "View";
    export function FlatList({ data, renderItem, ListHeaderComponent }) {
      return <View>{ListHeaderComponent}{data.map(item => <View key={item.verse}>{renderItem({ item })}</View>)}</View>;
    }
  `,
  "@expo/vector-icons": `export const Feather = "Feather";`,
  "react-native-safe-area-context": `export const useSafeAreaInsets = () => ({ top: 0, bottom: 0 });`,
  "@/features/bible-preferences": `export const usePreferredBibleVersion = () => "kjv";`,
  "@/features/use-bible-book-language": `
    import { createContext } from "react";
    export const BibleBookVersionContext = createContext("kjv");
    export const useBibleBookLanguage = () => "en";
  `,
  "@/state/koino-store": `export const useKoinoSelector = selector => selector({ currentUserId: "test" });`,
  "@/ui/app-language": `export const useAppTranslation = () => ({ language: "en", t: key => key });`,
  "@/ui/app-components": `
    import React, { useEffect } from "react";
    export const AppScreen = "AppScreen", IconButton = "IconButton", PrimaryButton = "PrimaryButton",
      SecondaryButton = "SecondaryButton", SectionHeading = "SectionHeading",
      TextInputField = "TextInputField", VersePreviewCard = "VersePreviewCard";
    export function FullScreenModal({ children, ...props }) {
      useEffect(() => {
        globalThis.__pickerLifecycle.mounts++;
        return () => { globalThis.__pickerLifecycle.unmounts++; };
      }, []);
      return <Modal {...props}>{children}</Modal>;
    }
    const Modal = "Modal";
  `,
  "@/features/bible-database-provider": `
    import { useEffect, useState } from "react";
    export function BibleDatabaseBoundary({ children }) {
      const [ready, setReady] = useState(globalThis.__pickerLifecycle.ready);
      useEffect(() => {
        globalThis.__pickerLifecycle.finishLoading = () => setReady(true);
      }, []);
      return ready ? children : null;
    }
  `,
  "@/features/bible-kjv": `
    export const kjvBooks = [{ name: "Genesis", chapters: [1] }];
    export const bibleVersionFor = () => ({ label: "KJV" });
    export const bibleChapterVerses = () => [{ verse: 1, text: "In the beginning", footnotes: [] }, { verse: 2, text: "And the earth", footnotes: [] }];
    export const buildBibleVerse = (book, chapter, startVerse, endVerse) => ({ book, chapter, startVerse, endVerse, reference: "Genesis " + chapter + ":" + startVerse + (endVerse > startVerse ? "-" + endVerse : ""), text: endVerse > startVerse ? "In the beginning And the earth" : "In the beginning", translation: "kjv" });
  `,
  "@/features/bible-search/search-content": `export const ScriptureSearchContent = "ScriptureSearchContent";`,
  "@/features/bible-search": `
    export const displayBibleBookName = value => value, displayBibleReference = value => value;
    export const normalizeScriptureQuery = value => value.trim();
    export const resolveBibleReference = () => undefined;
    export const searchScripture = async () => [];
  `,
};

let renderer;
try {
  const bundlePath = path.join(temporaryDirectory, "picker.cjs");
  await build({
    entryPoints: [path.join(projectRoot, "ui/bible-verse-field.tsx")],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile: bundlePath,
    jsx: "automatic",
    tsconfig: path.join(projectRoot, "tsconfig.json"),
    plugins: [{
      name: "native-test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
          if (name in mocks) return { path: name, namespace: "mock" };
          if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
        });
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "jsx" }));
      },
    }],
  });
  const { BibleVerseField } = require(bundlePath);
  const selections = [];
  function Composer() {
    const [verses, setVerses] = React.useState([]);
    return React.createElement(BibleVerseField, { verses, onChange: next => { selections.push(next); setVerses(next); } });
  }
  await act(async () => { renderer = create(React.createElement(Composer)); });
  const press = async (type, predicate = () => true) => {
    const target = renderer.root.findAllByType(type).find(predicate);
    assert.ok(target, `Missing ${type}`);
    await act(async () => { target.props.onPress(); });
  };

  // Cold code load followed by a delayed database must preserve the same modal.
  await press("SecondaryButton");
  assert.equal(renderer.root.findAllByType("Modal").length, 1, "Modal must remain open during database initialization");
  assert.equal(lifecycle.mounts, 1, "Loading must not present a replacement modal");
  assert.equal(lifecycle.unmounts, 0);
  await act(async () => { lifecycle.finishLoading(); });
  assert.equal(lifecycle.mounts, 1);
  await press("Pressable", node => node.findAllByType("Text").some(text => text.props.children === "Genesis"));
  await press("Pressable", node => node.props.accessibilityLabel === "shared.scripturePicker.chapterNumber");
  await press("Pressable", node => node.props.accessibilityLabel === "1. In the beginning");
  await press("PrimaryButton");
  assert.equal(selections[0][0].reference, "Genesis 1:1");
  assert.equal(renderer.root.findAllByType("Modal").length, 0);
  assert.equal(lifecycle.unmounts, 1);

  // Warm reopen and cancellation preserve the draft and only present once.
  lifecycle.ready = true;
  await press("SecondaryButton");
  assert.equal(lifecycle.mounts, 2);
  await press("IconButton");
  assert.equal(lifecycle.unmounts, 2);
  assert.equal(selections.length, 1);
  assert.equal(renderer.root.findAllByType("VersePreviewCard").length, 1);

  // Android back can cancel while the database is still initializing.
  lifecycle.ready = false;
  await press("SecondaryButton");
  await act(async () => { renderer.root.findByType("Modal").props.onRequestClose(); });
  assert.equal(lifecycle.mounts, 3);
  assert.equal(lifecycle.unmounts, 3);
  assert.equal(selections.length, 1);
  // Shared search returns complete ranges; opening a result must keep both boundaries.
  lifecycle.ready = true;
  await press("SecondaryButton");
  await act(async () => { renderer.root.findAllByType("TextInputField").find(node => node.props.accessibilityLabel === "shared.scripturePicker.searchAccessibility").props.onChangeText("creation"); });
  await act(async () => { renderer.root.findByType("ScriptureSearchContent").props.onSelect({ book: "Genesis", chapter: 1, startVerse: 1, endVerse: 2, reference: "Genesis 1:1-2", text: "In the beginning And the earth", translation: "kjv" }); });
  await press("PrimaryButton");
  assert.equal(selections.at(-1).at(-1).reference, "Genesis 1:1-2");
  assert.equal(selections.at(-1).at(-1).endVerse, 2);
  assert.equal(selections.at(-1).at(-1).text, "In the beginning And the earth");
  console.log("Bible picker lifecycle validation passed: cold load, selection, reopen, loading cancellation, and full search ranges.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  delete globalThis.__pickerLifecycle;
  await rm(temporaryDirectory, { recursive: true, force: true });
}
