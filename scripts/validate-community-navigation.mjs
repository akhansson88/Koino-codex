import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import ts from "typescript";
import React from "react";
import { act, create } from "react-test-renderer";

// Exercise the actual screen handlers and route components. Native primitives,
// overlays, and external services are mocked; this is not a native rendering test.
const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-community-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const harness = globalThis.__communityNavigation = { os: "android", route: "index", backs: 0 };
const baseState = {
  authReady: true, currentUserId: "reader", currentGroupId: "room",
  groups: [{ id: "room", name: "Test community", ownerId: "reader" }],
  users: [{ id: "reader", name: "Reader" }], groupMemberCounts: { room: 1 },
  profileReady: true, userGroupsReady: true, communityFeedGroupId: "room", communityFeedReady: true, theme: "light",
  privateCheckInsReady: true, checkInDailyClaimsReady: true, checkInDailyClaims: [],
  memberships: [], checkIns: [], privateCheckIns: [], posts: [],
  journalEntries: [], prayerReactions: [], postReactions: [], replies: [],
};
const populatedState = {
  ...baseState,
  posts: [{ id: "prayer", groupId: "room", userId: "reader", kind: "prayer_request", body: "Prayer regression content", createdAt: "2020-01-01T12:00:00Z" }],
  checkIns: [{ id: "checkin", groupId: "room", userId: "reader", visibility: "group", mood: 3, readToday: true, reflectionText: "Check-in regression content", createdAt: "2020-01-01T12:00:00Z" }],
};
const mocks = {
  "react-native": `
    import React from "react";
    export const Platform = { get OS() { return globalThis.__communityNavigation.os; } };
    export const AccessibilityInfo = { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) };
    export const BackHandler = { addEventListener: () => ({ remove() {} }) };
    export const useWindowDimensions = () => ({ width: 390, height: 800 });
    export const AppState = { addEventListener: () => ({ remove() {} }) };
    export const ActivityIndicator = "ActivityIndicator", Pressable = "Pressable", ScrollView = "ScrollView", Text = "Text", View = "View", Share = {};
    export function FlatList(props) { return React.createElement("FlatList", props,
      props.ListHeaderComponent, ...(props.data ?? []).map((item, index) => props.renderItem({ item, index })));
    }
    export const StyleSheet = { absoluteFillObject: {} };
  `,
  "expo-router": `
    import React from "react";
    const h = globalThis.__communityNavigation;
    export const router = { navigate: route => { h.route = route.split('/').pop(); }, push: route => { h.pushed = route; }, back: () => { h.backs++; }, replace() {}, dismissTo() {} };
    export const useNavigation = () => ({ canGoBack: () => true, setOptions() {} });
    export const useLocalSearchParams = () => (h.params ?? {});
    export const useFocusEffect = callback => React.useEffect(callback, [callback]);
    export const Tabs = Object.assign(props => React.createElement("Tabs", props), { Screen: () => null });
  `,
  "@/state/koino-store": `
    export const useKoino = () => ({ state: globalThis.__communityNavigation.state, dispatch: async action => { globalThis.__communityNavigation.actions.push(action); } });
    export const useKoinoSelector = selector => selector(globalThis.__communityNavigation.state);
    export const useKoinoFields = keys => Object.fromEntries(keys.map(key => [key, globalThis.__communityNavigation.state[key]]));
    export const useKoinoActions = () => ({ dispatch: async action => { globalThis.__communityNavigation.actions.push(action); } });
  `,
  "@/ui/app-language": `export const useAppTranslation = () => ({ language: "en", t: (key, values) => values?.name ? key + ":" + values.name : key });`,
  "@/ui/theme": `export const colors = {}, typography = {}, radius = {}; export const platformShadow = () => ({});`,
  "react-native-safe-area-context": `export const useSafeAreaInsets = () => ({ top: 24, bottom: 24 });`,
  "@expo/vector-icons": `export const Feather = "Feather", MaterialCommunityIcons = "MaterialCommunityIcons", Ionicons = "Ionicons";`,
  "expo-blur": `export const BlurView = "BlurView";`,
  "@/features/check-in-modal": `export const CheckInModal = () => null; export const moodNumber = value => value;`,
  "@/features/onboarding-screen": `export const OnboardingScreen = "OnboardingScreen";`,
};

// Keep screen logic and selectors real while replacing leaf UI dependencies.
const communityModules = (await readdir("features/community"))
  .filter(file => /\.tsx?$/.test(file))
  .map(file => `features/community/${file}`);
const leafUiImports = new Map();
for (const file of ["features/settings-screen.tsx", "features/home-screen.tsx", "features/journal-detail-screen.tsx", "ui/shared-composer.tsx", ...communityModules, "app/(tabs)/_layout.tsx"]) {
  const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
    const module = statement.moduleSpecifier.text;
    if (!module.startsWith("@/ui/") || mocks[module] || ["@/ui/community-copy", "@/ui/relative-time", "@/ui/navigation-layout", "@/ui/journal-presentation"].includes(module)) continue;
    const imports = statement.importClause?.namedBindings;
    if (!imports || !ts.isNamedImports(imports)) continue;
    const names = leafUiImports.get(module) ?? new Set();
    for (const item of imports.elements.filter(item => !item.isTypeOnly)) names.add((item.propertyName ?? item.name).text);
    leafUiImports.set(module, names);
  }
}
for (const [module, names] of leafUiImports) {
  mocks[module] = [...names].map(name => {
    if (name === "PrayerMoment" || name === "DirectPrayerResultSheet") return `export const ${name} = () => null;`;
    if (/^[A-Z]/.test(name)) return `export function ${name}(props) { return props.visible === false ? null : React.createElement("${name}", props); }`;
    return `export const ${name} = () => undefined;`;
  }).join("\n");
  mocks[module] = 'import React from "react";\n' + mocks[module];
}

let tree;
try {
  const outfile = path.join(directory, "screens.cjs");
  await build({
    stdin: { contents: `export { JournalDetailScreen as JournalDetail } from "./features/journal-detail-screen"; export { SharedComposer as RealComposer } from "./ui/shared-composer"; export { HomeScreen as Home } from "./features/home-screen"; export { default as Tabs } from "./app/(tabs)/_layout";
      export { default as Overview } from "./app/(tabs)/community/index";
      export { default as Prayer } from "./app/(tabs)/community/prayer";
      export { default as CheckIns } from "./app/(tabs)/community/checkins";`, resolveDir: process.cwd(), loader: "tsx" },
    outfile, bundle: true, platform: "node", format: "cjs", jsx: "automatic",
    plugins: [{ name: "community-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (mocks[args.path]) return { path: args.path, namespace: "mock" };
        if (args.path === "react" || args.path.startsWith("react/")) return { path: require.resolve(args.path), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "tsx" }));
    } }],
  });
  const screens = require(outfile);
  harness.state = baseState;
  for (const os of ["android", "ios"]) {
    harness.os = os;
    await act(async () => { tree = create(React.createElement(screens.Tabs)); });
    assert.equal(tree.root.findByType("Tabs").props.detachInactiveScreens, os !== "android",
      "Android must not detach the tab hosting the nested Community stack");
    await act(() => tree.unmount());
  }
  harness.os = "android";
  for (const [filter, label, component, title, empty] of [
    ["checkins", "community.feed.openCheckIns", screens.CheckIns, "community.page.checkIns", "community.checkIns.empty"],
    ["prayer", "community.feed.openPrayer", screens.Prayer, "community.page.prayer", "community.prayer.empty"],
  ]) {
    harness.state = baseState;
    harness.route = "index";
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    const chips = tree.root.find(node => node.type?.name === "CommunityFilterChips");
    await act(() => chips.props.onChange(filter));
    const button = tree.root.findAllByType("PrimaryButton").find(node => node.props.children === label);
    assert.ok(button, `${label} must be reachable from the overview`);
    await act(() => button.props.onPress());
    const inlineView = JSON.stringify(tree.toJSON(), (key, value) => key === "_owner" ? undefined : value);
    assert.ok(inlineView.includes(title), `${label} must render ${title} in the mounted Community screen`);
    assert.equal(harness.route, "index", `${label} must not push Android's nested native stack`);
    await act(() => tree.unmount());
    for (const status of ["ready", "loading", "error", "populated"]) {
      harness.state = { ...(status === "populated" ? populatedState : baseState), communityFeedReady: status !== "loading", communityFeedError: status === "error" ? "test error" : undefined };
      await act(async () => { tree = create(React.createElement(component)); });
      const rendered = JSON.stringify(tree.toJSON(), (key, value) => key === "_owner" ? undefined : value);
      assert.ok(rendered.includes(title), `${filter} must show its title on first mount (${status})`);
      const expected = status === "populated" ? (filter === "prayer" ? "Prayer regression content" : "Check-in regression content")
        : status === "loading" ? "community.feed.loading" : status === "error" ? "community.feed.loadError" : empty;
      assert.ok(rendered.includes(expected),
        `${filter} must render its ${status} state without a tab switch`);
      const before = harness.backs;
      await act(() => tree.root.findAllByType("IconButton").find(node => node.props.accessibilityLabel === "common.back").props.onPress());
      assert.equal(harness.backs, before + 1);
      await act(() => tree.unmount());
    }
  }
  for (const component of [screens.Overview, screens.Prayer, screens.CheckIns]) {
    harness.state = { ...populatedState, groups: [{ ...baseState.groups[0], migrationPending: true }] };
    await act(async () => { tree = create(React.createElement(component)); });
    const rendered = JSON.stringify(tree.toJSON(), (key, value) => key === "_owner" ? undefined : value);
    assert.ok(rendered.includes("Test community"), "A pending community must retain its identity");
    assert.ok(rendered.includes("community.encryption.setupTitle"), "A pending community must explain its encryption status");
    assert.ok(!rendered.includes("Prayer regression content") && !rendered.includes("Check-in regression content"),
      "Pending community surfaces must withhold group content and its actions");
    await act(() => tree.unmount());
  }
  // The real screen state and submission handlers must require a fresh opt-in.
  for (const component of [screens.Home, screens.CheckIns]) {
    harness.state = baseState;
    harness.actions = [];
    await act(async () => { tree = create(React.createElement(component)); });
    const modal = () => tree.root.find(node => node.type?.name === "CheckInModal");
    const open = async () => {
      if (component === screens.Home) {
        await act(() => tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === "community.checkIn.promptTitle").props.onPress());
      } else {
        await act(() => tree.root.findAllByType("PrimaryButton").find(node => node.props.children === "community.checkIns.action").props.onPress());
      }
    };
    assert.equal(modal().props.share, false, "Initial audience must be private");
    await open();
    assert.equal(modal().props.share, false, "Opening must default to private");
    await act(() => modal().props.onShare(true));
    await act(() => modal().props.onBack());
    assert.equal(modal().props.share, true, "Back within a draft preserves explicit choice");
    await act(() => modal().props.onClose());
    await open();
    assert.equal(modal().props.share, false, "Reopening discards previous sharing consent");
    await act(() => modal().props.onNote("  Private reflection  "));
    await act(() => modal().props.onSubmit());
    assert.equal(harness.actions.at(-1).visibility, "private");
    assert.equal(harness.actions.at(-1).reflectionText, "Private reflection");
    await act(() => modal().props.onDone());
    assert.equal(modal().props.share, false, "Completion resets audience");
    await act(() => tree.unmount());
    await act(async () => { tree = create(React.createElement(component)); });
    await open();
    await act(() => modal().props.onShare(true));
    await act(() => modal().props.onSubmit());
    assert.equal(harness.actions.at(-1).visibility, "group", "Explicit opt-in shares with community");
    await act(() => modal().props.onDone());
    assert.equal(modal().props.share, false, "Shared completion resets audience");
    await act(() => tree.unmount());
  }
  const savedAt = new Date().toISOString();
  for (const visibility of ["private", "group"]) {
    const checkIn = { id: "saved-checkin", userId: "reader", groupId: "room", visibility, mood: 4, readToday: true, createdAt: savedAt, reflectionText: "Saved check-in" };
    const journal = { id: "saved-journal", userId: "reader", source: "private_check_in", journalType: "heart_checkin", body: "Saved check-in", isPrivate: true, heartMood: "hopeful", createdAt: savedAt, updatedAt: savedAt };
    harness.state = { ...baseState, [visibility === "private" ? "privateCheckIns" : "checkIns"]: [checkIn], journalEntries: visibility === "private" ? [journal] : [] };
    await act(async () => { tree = create(React.createElement(screens.Home)); });
    const rendered = JSON.stringify(tree.toJSON());
    assert.ok(rendered.includes("home.checkIn.completed"));
    assert.ok(rendered.includes(visibility === "private" ? "home.checkIn.private" : "community.checkIn.sharedWithCommunity:Test community"));
    assert.ok(!tree.root.findAllByType("Pressable").some(node => node.props.accessibilityLabel === "community.checkIn.promptTitle"), "Completed state must not offer another check-in");
    await act(() => tree.root.findAllByType("Pressable").find(node => node.findAllByType("Text").some(text => text.props.children === "home.checkIn.view")).props.onPress());
    assert.deepEqual(harness.pushed, { pathname: "/me/[id]", params: { id: checkIn.id } });
    // Simulate the store update after deletion from Me, without remounting Home.
    harness.state = baseState;
    await act(() => tree.update(React.createElement(screens.Home)));
    assert.ok(!JSON.stringify(tree.toJSON()).includes("home.checkIn.completed"));
    assert.ok(tree.root.findAllByType("Pressable").some(node => node.props.accessibilityLabel === "community.checkIn.promptTitle"));
    await act(() => tree.unmount());

    harness.state = { ...baseState, [visibility === "private" ? "privateCheckIns" : "checkIns"]: [checkIn], journalEntries: visibility === "private" ? [journal] : [] };
    harness.params = { id: checkIn.id };
    await act(async () => { tree = create(React.createElement(screens.JournalDetail)); });
    assert.ok(JSON.stringify(tree.toJSON()).includes("Saved check-in"), "Home route resolves the actual saved entry");
    if (visibility === "private") {
      await act(() => tree.root.findAllByType("SecondaryButton").find(node => node.props.children === "common.edit").props.onPress());
      const editor = () => tree.root.findByType("SharedComposer");
      assert.equal(editor().props.audienceLocked, true);
      assert.equal(editor().props.entryVisibility, "private");
      await act(() => editor().props.onVisibility("room"));
      await act(() => editor().props.onSubmit());
      assert.equal(harness.actions.at(-1).id, journal.id);
      assert.equal(harness.actions.at(-1).heartMood, "hopeful", "Editing preserves the exact heart mood");
      assert.equal(harness.actions.at(-1).sharedPostId, undefined, "An edit cannot invent a sharing reference");
    } else {
      assert.ok(!tree.root.findAllByType("SecondaryButton").some(node => node.props.children === "common.edit"), "Shared check-ins must not expose an unsupported reverse transition");
    }
    await act(() => tree.unmount());
  }
  // Legacy/shared journal check-ins keep their existing post reference even
  // if an obsolete caller attempts to change the editor's audience state.
  const linkedEntry = { id: "linked-journal", userId: "reader", journalType: "heart_checkin", source: "manual", body: "Previously shared", sharedPostId: "existing-post", isPrivate: false, createdAt: savedAt, updatedAt: savedAt };
  harness.state = { ...baseState, journalEntries: [linkedEntry] };
  harness.params = { id: linkedEntry.id };
  await act(async () => { tree = create(React.createElement(screens.JournalDetail)); });
  assert.ok(!JSON.stringify(tree.toJSON()).includes("me.journey.detail.privateOnly"), "Linked shared check-ins must not claim to be private");
  await act(() => tree.root.findAllByType("SecondaryButton").find(node => node.props.children === "common.edit").props.onPress());
  assert.equal(tree.root.findByType("SharedComposer").props.audienceLocked, true);
  await act(() => tree.root.findByType("SharedComposer").props.onVisibility("private"));
  await act(() => tree.root.findByType("SharedComposer").props.onSubmit());
  assert.equal(harness.actions.at(-1).sharedPostId, "existing-post");
  await act(() => tree.unmount());
  harness.params = {};
  for (const entryVisibility of ["private", "room"]) {
    let audienceChanges = 0;
    await act(async () => { tree = create(React.createElement(screens.RealComposer, {
      visible: true, context: "journal", editing: true, audienceLocked: true, kind: "reflection", entryVisibility,
      body: "Saved check-in", title: "", verses: [], roomName: "Test community",
      onVisibility: () => audienceChanges++, onBody() {}, onTitle() {}, onKind() {}, onVerses() {}, onClose() {}, onSubmit() {},
    })); });
    assert.ok(!tree.root.findAllByType("FilterChips").some(node => node.props.value === entryVisibility), "Locked audience has no selector");
    assert.ok(JSON.stringify(tree.toJSON()).includes("community.composer.checkInAudienceFixed"));
    const audienceCards = tree.root.findAllByType("Pressable").filter(node => node.props.disabled === true && node.props.onPress);
    for (const card of audienceCards) assert.equal(card.props.disabled, true);
    assert.equal(audienceChanges, 0);
    if (entryVisibility === "room") assert.ok(JSON.stringify(tree.toJSON()).includes("community.composer.sharedWithCommunity"));
    await act(() => tree.unmount());
  }
  console.log("Saved check-ins passed: completed Home audience/link, delete/reset, private edit lock and shared reverse-transition lock.");
  console.log("Check-in privacy passed: Home and Community initial/reset/private/group submission handlers.");
  console.log("Community navigation passed: Android attachment, inline Prayer/Check-ins opening, initial page/content/empty/loading/error rendering, and back navigation.");
} finally {
  if (tree) await act(() => tree.unmount());
  await rm(directory, { recursive: true, force: true });
  delete globalThis.__communityNavigation;
}
