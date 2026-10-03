import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-drawer-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const state = globalThis.__drawer = { scrolls: [], closes: 0 };
let frameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
const mocks = {
  "react-native": `import React,{forwardRef,useImperativeHandle} from "react";
    export const ScrollView=forwardRef((props,ref)=>{useImperativeHandle(ref,()=>({scrollTo:value=>globalThis.__drawer.scrolls.push(value.y)}));return <scroll {...props}/>;});
    export const ActivityIndicator="ActivityIndicator", Pressable="Pressable", Text="Text", View="View"; export const useWindowDimensions=()=>({height:800,width:375});`,
  "react-native-safe-area-context": `export const useSafeAreaInsets=()=>({bottom:0});`,
  "@expo/vector-icons": `export const Feather="Feather";`,
  "@/features/use-bible-book-language": `export const useBibleBookLanguage=()=>"en";`,
  "@/ui/app-language": `export const useAppTranslation=()=>({language:"en",t:key=>key});`,
  "@/features/bible-kjv": `export { kjvBooks, normalizeBiblePosition } from ${JSON.stringify(path.resolve("features/bible-canon.ts"))}; export const buildBibleVerse=()=>undefined, searchBibleText=async()=>[];`,
  "@/features/bible-search": `export const biblePositionFromSearchQuery=()=>undefined, displayBibleBookName=name=>name, displayBibleReference=name=>name;`,
  "@/features/bible-reader/verse-helpers": `import { kjvBooks } from "@/features/bible-kjv"; export const testamentForBook=name=>kjvBooks.findIndex(book=>book.name===name)<39?"old":"new"; export const biblePositionFromVerse=()=>undefined, highlightTime=()=>0, chapterLabel=()=>"John 6", referenceLabel=()=>"";`,
  "@/features/bible-reader/topics-api": `export const suggestedTopics=[];`,
  "@/features/bible-reader/sheet-primitives": `export const BibleSheetTop="BibleSheetTop", bibleSheetHorizontalPadding=20;`,
  "@/features/bible-reader/header": `export const ReaderCircleButton="ReaderCircleButton";`,
  "@/features/bible-reader/verse-actions": `export const SavedVerseActionSheet="SavedVerseActionSheet";`,
  "@/features/bible-reader/drawer-components": `export const DrawerSection="DrawerSection", DrawerRow="DrawerRow", DrawerSearchBox="DrawerSearchBox", DrawerEmptyState="DrawerEmptyState", DrawerBookRow="DrawerBookRow", DrawerVerseRow="DrawerVerseRow", PickerGrid="PickerGrid";`,
  "@/ui/app-sheet": `import React,{forwardRef,useImperativeHandle} from "react";
    export const AppSheet=forwardRef((props,ref)=>{useImperativeHandle(ref,()=>({dismiss:callback=>{globalThis.__drawer.closes++; callback?.();}}));return props.visible?<sheet {...props}/>:null;});
`,
};
let renderer;
try {
  const outfile = path.join(directory, "drawer.cjs");
  await build({ entryPoints: ["features/bible-reader/drawer.tsx"], outfile, bundle: true, platform: "node", format: "cjs", jsx: "automatic",
    plugins: [{ name: "drawer-mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (mocks[args.path]) return { path: args.path, namespace: "mock" };
        if (args.path === "react" || args.path.startsWith("react/")) return { path: require.resolve(args.path), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const { BibleDrawer } = require(outfile);
  let selected;
  const props = { biblePlanCount: 0, bibleVersionId: "kjv", initialStage: "home", initialPosition: { book: "John", chapter: 6, verse: 1 }, highlights: [], journalEntries: [], savedVerses: [], palette: {}, versionLabel: "KJV", visible: true, onClose() {}, onSelect: value => { selected = value; } };
  const root = () => renderer.root;
  const books = () => root().findAllByType("DrawerBookRow");
  const scroll = () => root().findByType("scroll");
  const layout = y => ({ nativeEvent: { layout: { y } } });
  const measure = () => {
    books().forEach((row, index) => row.parent.props.onLayout(layout(index * 70)));
    scroll().props.onLayout({ nativeEvent: { layout: { height: 450 } } });
    scroll().props.onContentSizeChange(375, books().length * 70);
    flush();
  };
  await act(async () => { renderer = create(React.createElement(BibleDrawer, props)); });
  assert.equal(books().length, 66, "All books appear immediately");
  assert.equal(root().findByType("sheet").props.contentPanning, false, "Content gestures scroll instead of dragging the sheet");
  assert.equal(root().findAllByType("Pressable").length, 0, "OT/NT shortcut buttons are removed");
  assert.deepEqual(root().findAllByType("Text").filter(node => node.props.accessibilityRole === "header").map(node => node.props.children), ["bible.navigator.oldTestament", "bible.navigator.newTestament"], "Both testament headings remain");
  assert.equal(books()[0].props.book.name, "Genesis");
  assert.equal(books().at(-1).props.book.name, "Revelation");
  assert.equal(books().find(row => row.props.selected).props.book.name, "John");
  assert.equal(root().findAllByType("DrawerRow").length, 0, "No intermediate menu or Scripture search row");
  await act(async () => {
    books()[42].parent.props.onLayout(layout(42 * 70));
    scroll().props.onLayout({ nativeEvent: { layout: { height: 0 } } });
    scroll().props.onContentSizeChange(375, 4620);
    flush();
  });
  assert.equal(state.scrolls.length, 0, "Wait for content and viewport before scrolling");
  await act(async () => {
    scroll().props.onLayout({ nativeEvent: { layout: { height: 4620 } } });
    flush();
  });
  assert.equal(state.scrolls.length, 0, "Opening with an intrinsic content-sized viewport must not consume the book target");
  await act(async () => { measure(); });
  assert.equal(state.scrolls.at(-1), 42 * 70, "Open at current NT book after layout");
  await act(async () => { scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 3100 } } }); measure(); });
  assert.equal(state.scrolls.at(-1), 42 * 70, "Remeasuring does not reset user scrolling");
  await act(async () => { books().find(row => row.props.book.name === "John").props.onPress(); });
  assert.equal(root().findByType("PickerGrid").props.selected, 6);
  await act(async () => { root().findByType("sheet").props.onBack(); });
  await act(async () => { measure(); });
  assert.equal(state.scrolls.at(-1), 3100, "Back restores scroll position");
  await act(async () => { root().findByType("DrawerSearchBox").props.onChangeText("John"); });
  assert.equal(books().length, 4);
  assert.equal(root().findAllByType("Pressable").length, 0, "Filtering does not reintroduce shortcuts");
  await act(async () => { measure(); books()[0].props.onPress(); });
  await act(async () => { root().findByType("sheet").props.onBack(); });
  assert.equal(root().findByType("DrawerSearchBox").props.value, "John");
  await act(async () => { root().findByType("DrawerSearchBox").props.onChangeText("no such book"); });
  assert.equal(books().length, 0);
  assert.equal(root().findAllByType("DrawerEmptyState").length, 1);
  await act(async () => { root().findByType("DrawerSearchBox").props.onChangeText(""); });
  assert.equal(books().length, 66);
  await act(async () => { books()[0].props.onPress(); });
  await act(async () => { root().findByType("PickerGrid").props.onSelect(2); });
  assert.deepEqual(selected, { book: "Genesis", chapter: 2, verse: 1 });
  await act(async () => { renderer.update(React.createElement(BibleDrawer, { ...props, visible: false })); });
  await act(async () => { renderer.update(React.createElement(BibleDrawer, { ...props, initialPosition: { book: "Exodus", chapter: 1, verse: 1 } })); });
  await act(async () => { measure(); });
  assert.equal(state.scrolls.at(-1), 70, "Reopen at current OT book");
  const closes = state.closes;
  await act(async () => { root().findByType("sheet").props.onBack(); });
  assert.equal(state.closes, closes + 1, "Android back closes the root list");
  await act(async () => { renderer.update(React.createElement(BibleDrawer, { ...props, initialStage: "search" })); });
  assert.equal(root().findByType("DrawerSearchBox").props.placeholder, "bible.navigator.searchPlaceholder", "Header search still works");
  console.log("Bible drawer navigation, filtering, layout scrolling and reopening passed.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  await rm(directory, { recursive: true, force: true });
}
