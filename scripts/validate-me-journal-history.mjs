import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-me-history-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__journalHistoryLanguage = "en";

const mocks = {
  "react-native": `
    export const Pressable = "Pressable", ScrollView = "ScrollView", Text = "Text", View = "View";
    export function Modal({ visible, ...props }) { return visible ? <NativeModal {...props} /> : null; }
    const NativeModal = "Modal";
  `,
  "@expo/vector-icons": 'export const Feather = "Feather";',
  "react-native-gesture-handler": 'export const GestureHandlerRootView = "GestureHandlerRootView";',
  "react-native-safe-area-context": "export const useSafeAreaInsets = () => ({ top: 24, bottom: 24 });",
  "@/features/journal-entry-preview": 'export const JournalEntryPreview = props => <EntryPreview {...props} />; const EntryPreview = "EntryPreview";',
  "@/ui/app-components": `
    export const AppScreen = "AppScreen", BodyText = "BodyText", Card = "Card", IconButton = "IconButton";
    export const PrimaryButton = "PrimaryButton", SecondaryButton = "SecondaryButton";
    export { FullScreenModal } from "@/ui/app-components/layout";
  `,
  "@/ui/app-components/avatars": 'export const Avatar = "Avatar";',
  "@/ui/app-sheet": 'export const AppSheet = "AppSheet", OutsideSheet = ({ children }) => children;',
  "@/ui/app-language": `
    import { translateMessage } from "@/ui/localization";
    export const useAppTranslation = () => ({ t: key => translateMessage(globalThis.__journalHistoryLanguage, key) });
  `,
  "@/ui/theme": "export const colors = {}, radius = {}, typography = {}; export const platformShadow = () => ({});",
  "@/ui/use-reduced-motion": "export const useReducedMotion = () => false;",
};

try {
  const outfile = path.join(directory, "history.cjs");
  await build({
    entryPoints: ["features/journal-history-modal.tsx"],
    outfile,
    jsx: "automatic",
    bundle: true,
    format: "cjs",
    platform: "node",
    plugins: [{ name: "journal-history-mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "mock" };
        if (args.path === "react" || args.path.startsWith("react/")) return { path: require.resolve(args.path), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });

  const { JournalHistoryModal, filterJournalHistory } = require(outfile);
  const entry = (id, day, fields) => ({
    id,
    userId: "member",
    source: "manual",
    body: `${id} body`,
    createdAt: `2026-11-0${day}T12:00:00.000Z`,
    updatedAt: "2026-11-07T12:00:00.000Z",
    ...fields,
  });
  const reflection = entry("reflection", 6, { journalType: "reflection", verse: { reference: "John 3:16", text: "Attached verse" } });
  const oldCheckIn = entry("old-check-in", 5, { entryKind: "update" });
  const editedPrivateCheckIn = entry("edited-check-in", 4, { source: "private_check_in", journalType: "reflection" });
  const praise = entry("praise", 3, { entryKind: "praise" });
  const prayer = entry("prayer", 2, { entryKind: "prayer_moment" });
  const scripture = entry("scripture", 1, { entryKind: "scripture" });
  const entries = [reflection, oldCheckIn, editedPrivateCheckIn, praise, prayer, scripture];

  assert.deepEqual(filterJournalHistory(entries, "all"), entries);
  assert.deepEqual(filterJournalHistory(entries, "reflections"), [reflection]);
  assert.deepEqual(filterJournalHistory(entries, "prayers"), [praise, prayer]);
  assert.deepEqual(filterJournalHistory(entries, "checkIns"), [oldCheckIn, editedPrivateCheckIn]);
  assert.deepEqual(filterJournalHistory(entries, "scripture"), [scripture]);

  let tree;
  let pageRequests = 0;
  let dismissals = 0;
  let writeRequests = 0;
  let openedEntry;
  const props = {
    entries: [reflection],
    hasMore: true,
    loadingMore: false,
    onClose() {},
    onDismiss() { dismissals++; },
    async onLoadMore() { pageRequests++; },
    onOpen(entry) { openedEntry = entry; },
    onWriteEntry() { writeRequests++; },
    visible: true,
  };
  const render = overrides => React.createElement(JournalHistoryModal, { ...props, ...overrides });
  const update = overrides => act(() => tree.update(render(overrides)));
  const presses = () => tree.root.findAllByType("Pressable");
  const chips = () => presses().filter(node => node.props.accessibilityState?.selected !== undefined);
  const chip = label => chips().find(node => node.props.accessibilityLabel === label);
  const displayedEntries = () => tree.root.findAllByType("EntryPreview").map(node => node.props.entry.id);
  const earlier = () => tree.root.findByType("SecondaryButton");
  const emptyMessage = () => tree.root.findByType("BodyText").props.children;

  await act(() => { tree = create(render()); });
  await act(() => tree.root.findByType("Modal").props.onDismiss());
  assert.equal(dismissals, 1, "History forwards native dismissal completion");
  assert.deepEqual(chips().map(node => node.props.accessibilityLabel), ["All", "Reflections", "Prayers", "Check-ins", "Scripture"]);
  assert.ok(chips().every(node => node.props.accessibilityRole === "button" && node.props.style.minHeight >= 44));
  assert.equal(chip("All").props.accessibilityState.selected, true);
  assert.deepEqual(displayedEntries(), [reflection.id]);
  const newEntry = presses().find(node => node.findAllByType("Text").some(text => text.props.children === "New entry"));
  assert.equal(newEntry.props.accessibilityRole, "button");
  await act(() => newEntry.props.onPress());
  assert.equal(writeRequests, 1);
  await act(() => chip("Prayers").props.onPress());
  assert.equal(chip("Prayers").props.accessibilityState.selected, true);
  assert.equal(chip("All").props.accessibilityState.selected, false);
  assert.deepEqual(displayedEntries(), []);
  assert.equal(emptyMessage(), "No matches yet. Try loading earlier entries.");

  await act(() => earlier().props.onPress());
  assert.equal(pageRequests, 1);
  await update({ loadingMore: true });
  assert.equal(earlier().props.disabled, true);
  assert.equal(earlier().props.children, "Loading earlier entries…");
  await update({ entries: [reflection, oldCheckIn] });
  assert.equal(earlier().props.disabled, false);
  assert.deepEqual(displayedEntries(), []);
  await act(() => earlier().props.onPress());
  assert.equal(pageRequests, 2, "An earlier page with no matches keeps the next page available");

  const loaded = { entries: [reflection, oldCheckIn, praise, prayer], hasMore: false };
  await update(loaded);
  assert.deepEqual(displayedEntries(), [praise.id, prayer.id], "Matches from older pages retain chronological order");
  await act(() => tree.root.findAllByType("EntryPreview")[0].props.onOpen());
  assert.equal(openedEntry, praise);
  await act(() => chip("Scripture").props.onPress());
  assert.equal(emptyMessage(), "No entries match this filter.");
  assert.equal(tree.root.findAllByType("SecondaryButton").length, 0);

  await update({ ...loaded, visible: false });
  globalThis.__journalHistoryLanguage = "sv";
  await update(loaded);
  assert.deepEqual(chips().map(node => node.props.accessibilityLabel), ["Alla", "Reflektioner", "Böner", "Incheckningar", "Bibelord"]);
  assert.equal(chip("Alla").props.accessibilityState.selected, true, "Reopening history starts with All");
  assert.deepEqual(displayedEntries(), loaded.entries.map(entry => entry.id));

  await update({ entries: [], hasMore: false });
  assert.equal(tree.root.findByType("PrimaryButton").props.children, "Skriv din första anteckning");
  await act(() => tree.root.findByType("PrimaryButton").props.onPress());
  assert.equal(writeRequests, 2);
  await act(() => tree.unmount());
  console.log("Me journal history filters, pagination, accessibility semantics and empty states passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
