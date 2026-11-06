import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";
import { CommonActions, StackActions, StackRouter } from "@react-navigation/routers";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-me-history-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = globalThis.__journalHistory = { language: "en", actions: [] };

const mocks = {
  "react-native": `
    import { useState } from "react";
    export const AppState = { addEventListener() { return { remove() {} }; } };
    export const Platform = { OS: "ios" };
    export const Text = "Text", View = "View", Modal = "Modal";
    const NativeScrollView = "ScrollView", NativePressable = "Pressable";
    export function Pressable({ children, ...props }) {
      return <NativePressable {...props}>{typeof children === "function" ? children({ pressed: false }) : children}</NativePressable>;
    }
    export function ScrollView({ children, ...props }) {
      const [offset, setOffset] = useState(0);
      return <NativeScrollView {...props} offset={offset} simulateScroll={setOffset}>{children}</NativeScrollView>;
    }
  `,
  "expo-router": `
    import { createContext, useContext, useEffect } from "react";
    const RouteContext = createContext({ focused: false, params: {} });
    export const RouteProvider = RouteContext.Provider;
    export const useLocalSearchParams = () => useContext(RouteContext).params;
    export function useFocusEffect(callback) {
      const { focused } = useContext(RouteContext);
      useEffect(() => focused ? callback() : undefined, [callback, focused]);
    }
    export const router = globalThis.__journalHistory.router;
  `,
  "@expo/vector-icons": 'export const Feather = "Feather";',
  "react-native-gesture-handler": 'export const GestureHandlerRootView = "GestureHandlerRootView";',
  "react-native-safe-area-context": "export const useSafeAreaInsets = () => ({ top: 24, bottom: 24 });",
  "@/features/journal-entry-preview": 'export const JournalEntryPreview = props => <EntryPreview {...props} />; const EntryPreview = "EntryPreview";',
  "@/features/me-bible-plans": 'export const MeBiblePlans = "MeBiblePlans";',
  "@/features/use-bible-book-language": 'export const useBibleBookLanguage = () => "en";',
  "@/state/koino-store": `
    const fixture = globalThis.__journalHistory;
    const dispatch = async action => fixture.dispatch(action);
    export const useKoinoFields = () => fixture.state;
    export const useKoino = () => ({ state: fixture.state, dispatch });
    export const useKoinoActions = () => ({ dispatch });
  `,
  "@/ui/app-components": `
    export const BodyText = "BodyText", BottomSheet = "BottomSheet", IconButton = "IconButton",
      PrimaryButton = "PrimaryButton", RoomImage = "RoomImage", SecondaryButton = "SecondaryButton",
      SectionHeading = "SectionHeading", VerseList = "VerseList";
    export { AppScreen, Card } from "@/ui/app-components/layout";
  `,
  "@/ui/app-components/avatars": 'export const Avatar = "Avatar";',
  "@/ui/app-sheet": 'export const AppSheet = "AppSheet", OutsideSheet = ({ children }) => children;',
  "@/ui/app-language": `
    import { translateMessage } from "@/ui/localization";
    export const useAppTranslation = () => {
      const { language } = globalThis.__journalHistory;
      return { language, t: (key, values) => translateMessage(language, key, values) };
    };
  `,
  "@/ui/brand-wave-motif": 'export const BrandWaveMotif = "BrandWaveMotif";',
  "@/ui/link-preview": 'export const LinkPreview = "LinkPreview";',
  "@/ui/shared-composer": 'export const SharedComposer = "SharedComposer";',
  "@/ui/theme": "export const colors = {}, radius = {}, typography = {}; export const platformShadow = () => ({});",
  "@/ui/use-reduced-motion": "export const useReducedMotion = () => false;",
};

let tree;
try {
  const outfile = path.join(directory, "history.cjs");
  await build({
    stdin: {
      contents: `
        export { default as MeHistoryRoute } from "./app/me/history";
        export { filterJournalHistory } from "./features/journal-history-screen";
        export { JournalScreen } from "./features/journal-screen";
        export { JournalDetailScreen } from "./features/journal-detail-screen";
        export { RouteProvider } from "expo-router";
      `,
      resolveDir: process.cwd(),
    },
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

  const stack = StackRouter({ initialRouteName: "(tabs)" });
  const options = {
    routeNames: ["(tabs)", "me/history", "me/[id]", "notifications"],
    routeParamList: {},
    routeGetIdList: {},
  };
  let navigation = stack.getInitialState(options);
  const current = () => navigation.routes[navigation.index];
  function navigate(action) {
    const result = stack.getStateForAction(navigation, action, options);
    assert.ok(result, `The stack must handle ${action.type}`);
    navigation = result;
    tree.update(render());
  }
  function routeTarget(target) {
    const { pathname, params } = typeof target === "string" ? { pathname: target } : target;
    if (pathname === "/(tabs)/me") return ["(tabs)", { screen: "me", params }];
    return [pathname.slice(1), params];
  }
  fixture.router = {
    back: () => navigate(CommonActions.goBack()),
    canGoBack: () => navigation.index > 0,
    dismissTo: (target) => navigate(StackActions.popTo(...routeTarget(target))),
    navigate: (target) => navigate(CommonActions.navigate(...routeTarget(target))),
    push: (target) => navigate(StackActions.push(...routeTarget(target))),
    replace: (target) => navigate(StackActions.replace(...routeTarget(target))),
  };
  const { JournalScreen, MeHistoryRoute, JournalDetailScreen, RouteProvider, filterJournalHistory } = require(outfile);
  const layout = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<Stack\.Screen name="me\/history"/);
  assert.match(layout, /const enableNativeBackGesture = Platform\.OS === "ios"/);
  assert.match(layout, /gestureEnabled: enableNativeBackGesture/);

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

  const memberState = {
    authReady: true, currentUserId: "member", journalEntries: [reflection], journalEntriesHasMore: true,
    journalEntriesLoadingMore: false, groups: [], biblePlans: [], checkIns: [], privateCheckIns: [],
  };
  fixture.state = memberState;
  fixture.dispatch = (action) => {
    fixture.actions.push(action);
    if (action.type === "updateJournalEntry") {
      fixture.state = {
        ...fixture.state,
        journalEntries: fixture.state.journalEntries.map((item) => item.id === action.id ? { ...item, body: action.body } : item),
      };
    }
    if (action.type === "deleteJournalEntry") {
      fixture.state = { ...fixture.state, journalEntries: fixture.state.journalEntries.filter((item) => item.id !== action.id) };
    }
    tree.update(render());
  };
  const screens = { "(tabs)": JournalScreen, "me/history": MeHistoryRoute, "me/[id]": JournalDetailScreen };
  const render = () => navigation.routes.map((route) => React.createElement(
    "Scene",
    { key: route.key, focused: route.key === current().key },
    React.createElement(RouteProvider, {
      value: { focused: route.key === current().key, params: route.name === "(tabs)" ? route.params?.params ?? {} : route.params ?? {} },
    }, React.createElement(screens[route.name] ?? "Notifications")),
  ));
  const update = (fields) => act(() => {
    fixture.state = { ...fixture.state, ...fields };
    tree.update(render());
  });
  const active = () => tree.root.findAllByType("Scene").find((scene) => scene.props.focused);
  const presses = () => active().findAllByType("Pressable");
  const chips = () => presses().filter(node => node.props.accessibilityState?.selected !== undefined);
  const chip = label => chips().find(node => node.props.accessibilityLabel === label);
  const previews = () => active().findAllByType("EntryPreview");
  const displayedEntries = () => previews().map(node => node.props.entry.id);
  const earlier = () => active().findByType("SecondaryButton");
  const emptyMessage = () => active().findByType("BodyText").props.children;
  const button = label => presses().find(node => node.props.accessibilityLabel === label);
  const seeAll = () => button("See all");
  const newEntry = () => presses().find(node => node.findAllByType("Text").some(text => text.props.children === "New entry"));
  const openEntry = (id) => act(() => previews().find((item) => item.props.entry.id === id).props.onOpen());
  const back = () => act(() => active().findAllByType("IconButton").find((node) => node.props.accessibilityLabel === "Back").props.onPress());
  const pageRequests = () => fixture.actions.filter(({ type }) => type === "loadOlderJournalEntries").length;

  await act(() => { tree = create(render()); });
  const openHistory = seeAll().props.onPress;
  await act(() => { openHistory(); openHistory(); });
  assert.deepEqual(navigation.routes.map(({ name }) => name), ["(tabs)", "me/history"]);
  const historyKey = current().key;

  assert.deepEqual(chips().map(node => node.props.accessibilityLabel), ["All", "Reflections", "Prayers", "Check-ins", "Scripture"]);
  assert.ok(chips().every(node => node.props.accessibilityRole === "button" && node.props.style.minHeight >= 44));
  assert.equal(chip("All").props.accessibilityState.selected, true);
  assert.deepEqual(displayedEntries(), [reflection.id]);
  assert.equal(newEntry().props.accessibilityRole, "button");
  await act(() => chip("Prayers").props.onPress());
  assert.equal(chip("Prayers").props.accessibilityState.selected, true);
  assert.equal(chip("All").props.accessibilityState.selected, false);
  assert.deepEqual(displayedEntries(), []);
  assert.equal(emptyMessage(), "No matches yet. Try loading earlier entries.");

  await act(() => earlier().props.onPress());
  assert.equal(pageRequests(), 1);
  await update({ journalEntriesLoadingMore: true });
  assert.equal(earlier().props.disabled, true);
  assert.equal(earlier().props.children, "Loading earlier entries…");
  await update({ journalEntries: [reflection, oldCheckIn], journalEntriesLoadingMore: false });
  assert.equal(earlier().props.disabled, false);
  assert.deepEqual(displayedEntries(), []);
  await act(() => earlier().props.onPress());
  assert.equal(pageRequests(), 2, "An earlier page with no matches keeps the next page available");

  const loaded = { journalEntries: [reflection, oldCheckIn, praise, prayer], journalEntriesHasMore: false };
  await update(loaded);
  assert.deepEqual(displayedEntries(), [praise.id, prayer.id], "Matches from older pages retain chronological order");
  const scroll = () => active().findByType("ScrollView");
  await act(() => scroll().props.simulateScroll(320));
  const assertHistoryRestored = () => {
    assert.equal(current().key, historyKey, "Back reveals the original history stack scene");
    assert.equal(chip("Prayers").props.accessibilityState.selected, true);
    assert.deepEqual(displayedEntries(), [praise.id, prayer.id]);
    assert.equal(scroll().props.offset, 320);
  };
  await openEntry(praise.id);
  assert.equal(current().params.id, praise.id);
  await back();
  assertHistoryRestored();

  await openEntry(praise.id);
  // NativeStackView uses POP with source and target for a completed iOS swipe.
  await act(() => navigate({ ...StackActions.pop(1), source: current().key, target: navigation.key }));
  assertHistoryRestored();

  await openEntry(prayer.id);
  const edit = active().findAllByType("SecondaryButton").find((node) => node.props.children === "Edit");
  await act(() => edit.props.onPress());
  const composer = () => active().findByType("SharedComposer").props;
  await act(() => composer().onBody("A revised prayer"));
  await act(() => composer().onSubmit());
  assert.equal(fixture.actions.at(-1).id, prayer.id);
  assert.equal(fixture.actions.at(-1).type, "updateJournalEntry");
  // Android's system Back dispatches GO_BACK through React Navigation.
  await act(() => navigate(CommonActions.goBack()));
  assertHistoryRestored();
  assert.equal(previews().at(-1).props.entry.body, "A revised prayer");

  await openEntry(prayer.id);
  await act(() => button("Entry options").props.onPress());
  await act(() => button("Open delete confirmation").props.onPress());
  await act(() => active().findAllByType("SecondaryButton").find((node) => node.props.accessibilityLabel === "Confirm delete entry").props.onPress());
  assert.equal(fixture.actions.at(-1).type, "deleteJournalEntry");
  assert.equal(fixture.actions.at(-1).id, prayer.id);
  assert.equal(current().key, historyKey);
  assert.equal(chip("Prayers").props.accessibilityState.selected, true);
  assert.deepEqual(displayedEntries(), [praise.id]);

  await act(() => chip("Scripture").props.onPress());
  assert.equal(emptyMessage(), "No entries match this filter.");
  assert.equal(active().findAllByType("SecondaryButton").length, 0);

  await act(() => chip("Prayers").props.onPress());
  await openEntry(praise.id);
  const other = entry("other", 6, { userId: "other" });
  await update({ currentUserId: "other", journalEntries: [praise, other] });
  assert.match(active().findByType("BodyText").props.children, /no longer available/);
  await back();
  assert.equal(current().name, "(tabs)", "An account switch must not restore an older account's history");
  assert.deepEqual(displayedEntries(), [other.id]);

  await openEntry(other.id);
  await back();
  assert.equal(current().name, "(tabs)", "A detail opened from Me still returns to Me");
  await act(() => navigate(CommonActions.navigate("notifications")));
  await act(() => navigate(CommonActions.navigate("me/[id]", { id: other.id })));
  await back();
  assert.equal(current().name, "notifications", "A direct detail link returns to its own prior screen");
  await act(() => navigate(CommonActions.goBack()));

  await act(() => seeAll().props.onPress());
  assert.equal(chip("All").props.accessibilityState.selected, true);
  assert.deepEqual(displayedEntries(), [other.id], "Only the active account's entries are displayed");
  const meKey = navigation.routes[0].key;
  await act(() => newEntry().props.onPress());
  assert.equal(current().key, meKey, "New entry returns to the existing Me tab");
  assert.equal(composer().visible, true);
  assert.equal(composer().entryVisibility, "private");
  assert.equal(composer().kind, "reflection");
  await act(() => composer().onClose());

  fixture.language = "sv";
  const swedishSeeAll = () => button("Visa alla");
  await update({ journalEntries: [other] });
  await act(() => swedishSeeAll().props.onPress());
  assert.deepEqual(chips().map(node => node.props.accessibilityLabel), ["Alla", "Reflektioner", "Böner", "Incheckningar", "Bibelord"]);
  assert.equal(chip("Alla").props.accessibilityState.selected, true, "Reopening history starts with All");
  assert.deepEqual(displayedEntries(), [other.id]);

  await update({ journalEntries: [], journalEntriesHasMore: false });
  const firstEntry = active().findByType("PrimaryButton");
  assert.equal(firstEntry.props.children, "Skriv din första anteckning");
  await act(() => firstEntry.props.onPress());
  assert.equal(current().key, meKey);
  assert.equal(composer().visible, true);
  console.log("Me journal history passed: iOS button/swipe and Android Back actions, retained filter/paging/scroll, editing/deleting, account changes, direct links, private new entry, localized filters and empty states.");
} finally {
  if (tree) await act(() => tree.unmount());
  await rm(directory, { recursive: true, force: true });
}
