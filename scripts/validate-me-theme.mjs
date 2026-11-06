import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const entry = {
  id: "entry", userId: "member", source: "manual", entryKind: "prayer_request",
  title: "A prayer from my journal", body: "A saved prayer",
  createdAt: "2026-11-01T12:00:00Z", updatedAt: "2026-11-01T12:00:00Z",
};
const state = {
  theme: "light", currentUserId: "member", groups: [], biblePlans: [], checkIns: [],
  privateCheckIns: [], journalEntries: [entry], journalEntriesHasMore: true,
};
const fixture = globalThis.__meTheme = { state, params: {} };
const storeSource = readFileSync(new URL("../state/koino-store.tsx", import.meta.url), "utf8");
const fieldsStart = storeSource.indexOf("export function useKoinoFields<");
const fieldsEnd = storeSource.indexOf("export function KoinoProvider", fieldsStart);
assert.ok(fieldsStart >= 0 && fieldsEnd > fieldsStart, "Load the real fields selector");

const mocks = {
  "react-native": `
    export const Platform = { OS: "ios" }, AppState = { addEventListener: () => ({ remove() {} }) };
    export const View = "View", Text = "Text", ScrollView = "ScrollView", ActivityIndicator = "ActivityIndicator";
    export const AccessibilityInfo = { announceForAccessibility() {} };
    export const useWindowDimensions = () => ({ width: 390, fontScale: 1 });
    export function Pressable({children, ...props}) {
      return <NativePressable {...props}>{typeof children === "function" ? children({ pressed: false }) : children}</NativePressable>;
    }
    export function Modal({ visible, children, ...props }) { return visible ? <NativeModal {...props}>{children}</NativeModal> : null; }
    const NativePressable = "Pressable", NativeModal = "Modal";
  `,
  "expo-router": `
    import { useEffect } from "react";
    export const useFocusEffect = useEffect;
    export const useLocalSearchParams = () => globalThis.__meTheme.params;
    export const router = { push() {}, back() {}, dismissTo() {}, canGoBack: () => true };
  `,
  "@expo/vector-icons": 'export const Feather = "Feather";',
  "react-native-safe-area-context": "export const useSafeAreaInsets = () => ({ top: 24, bottom: 24 });",
  "react-native-gesture-handler": 'export const GestureHandlerRootView = "GestureRoot";',
  "@/features/use-bible-book-language": 'export const useBibleBookLanguage = () => "en";',
  "@/state/koino-store": `
    import { useCallback, useRef } from "react";
    import { createSnapshotStore, useSelectedSnapshot } from "@/state/selective-store";
    const store = createSnapshotStore(globalThis.__meTheme.state);
    export const publish = store.publish;
    export const useKoinoSelector = selector => useSelectedSnapshot(store, selector);
    export const useKoinoActions = () => ({ dispatch: async () => {} });
    export const useKoino = () => ({ state: useKoinoSelector(state => state), ...useKoinoActions() });
    ${storeSource.slice(fieldsStart, fieldsEnd)}
  `,
  "@/ui/app-language": `
    import { translateMessage } from "@/ui/localization";
    const t = (key, values) => translateMessage("en", key, values);
    export const useAppTranslation = () => ({ language: "en", t });
  `,
  "@/ui/app-components": `
    export { AppScreen, Card, FullScreenModal } from "@/ui/app-components/layout";
    export const BodyText = "BodyText", BottomSheet = "BottomSheet", FilterChips = "FilterChips",
      IconButton = "IconButton", PrimaryButton = "PrimaryButton", RoomImage = "RoomImage",
      SecondaryButton = "SecondaryButton", SectionHeading = "SectionHeading", TextInputField = "TextInputField", VerseList = "VerseList";
  `,
  "@/ui/app-components/avatars": 'export const Avatar = "Avatar";',
  "@/ui/app-sheet": 'export const AppSheet = "AppSheet", OutsideSheet = ({ children }) => children;',
  "@/ui/bible-verse-field": 'export const BibleVerseField = "BibleVerseField";',
  "@/ui/brand-wave-motif": 'export const BrandWaveMotif = "BrandWaveMotif";',
  "@/ui/link-preview": 'export const LinkPreview = "LinkPreview";',
  "@/ui/use-reduced-motion": "export const useReducedMotion = () => false;",
};

const bundle = await build({
  stdin: {
    contents: `
      export { JournalScreen } from "./features/journal-screen";
      export { JournalHistoryScreen } from "./features/journal-history-screen";
      export { JournalDetailScreen } from "./features/journal-detail-screen";
      export { applyTheme, themes } from "@/ui/theme";
      export { publish } from "@/state/koino-store";
    `,
    resolveDir: root,
  },
  bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false, external: ["react"],
  plugins: [{ name: "me-theme-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => Object.hasOwn(mocks, path) ? { path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], resolveDir: root, loader: "tsx" }));
  } }],
});
const module = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, module, module.exports);
const { JournalScreen, JournalHistoryScreen, JournalDetailScreen, applyTheme, themes, publish } = module.exports;

const style = (node) => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
const text = (root, label) => root.findAllByType("Text").find((node) => node.props.children === label);
const button = (root, label) => root.findAllByType("Pressable").find((node) => node.props.accessibilityLabel === label);
const canvas = (root) => root.findAllByType("View").find((node) => style(node).flex === 1 && style(node).backgroundColor);
async function setTheme(theme) {
  await act(() => {
    // The existing local preference action applies the tokens before publishing the state.
    applyTheme(theme);
    publish({ ...state, theme });
  });
}

let tree;
try {
  await act(() => { tree = create(React.createElement(JournalScreen)); });
  const me = () => tree.root;
  const overviewScroll = me().findByType("ScrollView");
  for (const theme of ["dark", "light"]) {
    await setTheme(theme);
    assert.equal(style(canvas(me())).backgroundColor, themes[theme].cream, "Me canvas recolors from a theme-only snapshot");
    assert.equal(style(text(me(), "Your journey")).color, themes[theme].ink);
    assert.equal(style(text(me(), entry.title)).color, themes[theme].ink);
    assert.equal(style(text(me(), "Bible plans")).color, themes[theme].muted);
    assert.equal(me().findByType("ScrollView"), overviewScroll, "Theme changes must retain the overview scroll view");
  }

  await act(() => tree.update(React.createElement(JournalHistoryScreen)));
  await act(() => button(tree.root, "Prayers").props.onPress());
  const historyScroll = tree.root.findByType("ScrollView");
  for (const theme of ["dark", "light"]) {
    await setTheme(theme);
    assert.equal(style(canvas(tree.root)).backgroundColor, themes[theme].cream);
    assert.equal(style(button(tree.root, "Prayers")).backgroundColor, themes[theme].accentSubtle);
    assert.equal(button(tree.root, "Prayers").props.accessibilityState.selected, true);
    assert.equal(style(text(tree.root, entry.title)).color, themes[theme].ink);
    assert.equal(tree.root.findByType("ScrollView"), historyScroll, "Theme changes must retain the history scroll view");
  }

  await act(() => tree.update(React.createElement(JournalScreen)));
  const prompt = me().findAllByType("Pressable").find((node) => node.props.accessibilityLabel?.startsWith("Take a moment to reflect"));
  await act(() => prompt.props.onPress());
  const composer = () => me().findByType("Modal");
  const body = () => composer().findAllByType("TextInputField").find((node) => node.props.multiline);
  await act(() => body().props.onChangeText("A draft to keep"));
  for (const theme of ["dark", "light"]) {
    await setTheme(theme);
    assert.equal(style(canvas(composer())).backgroundColor, themes[theme].cream);
    assert.equal(body().props.value, "A draft to keep");
  }

  fixture.params = { id: entry.id };
  await act(() => tree.update(React.createElement(JournalDetailScreen)));
  for (const theme of ["dark", "light"]) {
    await setTheme(theme);
    assert.equal(style(canvas(tree.root)).backgroundColor, themes[theme].cream);
    assert.equal(style(text(tree.root, entry.title)).color, themes[theme].ink);
  }
  console.log("Me theme passed: both directions on overview, history, composer and detail, with history filter/scroll and draft intact.");
} finally {
  if (tree) await act(() => tree.unmount());
}
