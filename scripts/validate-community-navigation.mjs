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
const harness = globalThis.__communityNavigation = { os: "android", route: "index", backs: 0, scrollRestores: [] };
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
    export const AccessibilityInfo = { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }), announceForAccessibility() {} };
    export const BackHandler = { addEventListener: (_event, handler) => {
      const h = globalThis.__communityNavigation;
      h.hardwareBack = handler;
      return { remove() { if (h.hardwareBack === handler) h.hardwareBack = undefined; } };
    } };
    export const useWindowDimensions = () => ({ width: 390, height: 800 });
    export const AppState = { addEventListener: () => ({ remove() {} }) };
    export const ActivityIndicator = "ActivityIndicator", KeyboardAvoidingView = "KeyboardAvoidingView", Pressable = "Pressable", ScrollView = "ScrollView", Text = "Text", View = "View", Share = {};
    export const FlatList = React.forwardRef(function FlatList(props, ref) {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: options => globalThis.__communityNavigation.scrollRestores.push(options) }), []);
      return React.createElement("FlatList", props,
        props.ListHeaderComponent, ...(props.data ?? []).map((item, index) => props.renderItem({ item, index })));
    });
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
    const dispatch = async action => {
      const h = globalThis.__communityNavigation;
      h.actions.push(action);
      return h.dispatch?.(action);
    };
    export const useKoino = () => ({ state: globalThis.__communityNavigation.state, dispatch });
    export const useKoinoSelector = selector => selector(globalThis.__communityNavigation.state);
    export const useKoinoFields = keys => Object.fromEntries(keys.map(key => [key, globalThis.__communityNavigation.state[key]]));
    export const useKoinoActions = () => ({ dispatch });
  `,
  "@/ui/app-language": `
    import { translateMessage } from "@/ui/localization";
    export const useAppTranslation = () => {
      const h = globalThis.__communityNavigation;
      const language = h.language ?? "en";
      return { language, t: h.localized ? (key, values) => translateMessage(language, key, values) : (key, values) => values?.name ? key + ":" + values.name : key };
    };
  `,
  "@/ui/theme": `export const colors = {}, typography = {}, radius = {}; export const platformShadow = () => ({});`,
  "react-native-safe-area-context": `export const useSafeAreaInsets = () => ({ top: 24, bottom: 24 });`,
  "@expo/vector-icons": `export const Feather = "Feather", MaterialCommunityIcons = "MaterialCommunityIcons", Ionicons = "Ionicons";`,
  "expo-blur": `export const BlurView = "BlurView";`,
  "@/features/check-in-modal": `
    import React from "react";
    import { CheckInModal as RealCheckInModal, moodNumber as realMoodNumber } from "./features/check-in-modal";
    export function CheckInModal(props) { return globalThis.__communityNavigation.realCheckInModal ? React.createElement(RealCheckInModal, props) : null; }
    Object.defineProperty(CheckInModal, "name", { value: "CheckInModal" });
    export const moodNumber = value => globalThis.__communityNavigation.realCheckInModal ? realMoodNumber(value) : value;
  `,
  "@/ui/shared-composer": `
    import React from "react";
    import { SharedComposer as RealSharedComposer } from "./ui/shared-composer";
    export function SharedComposer(props) {
      return globalThis.__communityNavigation.realComposer
        ? React.createElement(RealSharedComposer, props)
        : props.visible === false ? null : React.createElement("SharedComposer", props);
    }
  `,
  "@/features/onboarding-screen": `export const OnboardingScreen = "OnboardingScreen";`,
};

// Keep screen logic and selectors real while replacing leaf UI dependencies.
const communityModules = (await readdir("features/community"))
  .filter(file => /\.tsx?$/.test(file))
  .map(file => `features/community/${file}`);
const leafUiImports = new Map();
for (const file of ["features/settings-screen.tsx", "features/home-screen.tsx", "features/check-in-modal.tsx", "features/journal-detail-screen.tsx", "ui/shared-composer.tsx", "ui/post-card.tsx", ...communityModules, "app/(tabs)/_layout.tsx"]) {
  const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
    const module = statement.moduleSpecifier.text;
    if (!module.startsWith("@/ui/") || mocks[module] || ["@/ui/community-copy", "@/ui/relative-time", "@/ui/navigation-layout", "@/ui/journal-presentation", "@/ui/post-card"].includes(module)) continue;
    const imports = statement.importClause?.namedBindings;
    if (!imports || !ts.isNamedImports(imports)) continue;
    const names = leafUiImports.get(module) ?? new Set();
    for (const item of imports.elements.filter(item => !item.isTypeOnly)) names.add((item.propertyName ?? item.name).text);
    leafUiImports.set(module, names);
  }
}
for (const [module, names] of leafUiImports) {
  mocks[module] = [...names].map(name => {
    if (name === "PrayerMoment") return `export const PrayerMoment = props => React.createElement("PrayerMoment", props);`;
    if (name === "DirectPrayerResultSheet") return `export const ${name} = () => null;`;
    if (name === "LinkPreviewContent") return `export const LinkPreviewContent = ({ children }) => children({});`;
    if (/^[A-Z]/.test(name)) return `export function ${name}(props) { return props.visible === false ? null : React.createElement("${name}", props); }`;
    return `export const ${name} = () => undefined;`;
  }).join("\n");
  mocks[module] = 'import React from "react";\n' + mocks[module];
}

// Execute the real client submission contract with an in-memory transaction boundary.
// Importing the store itself would initialize Firebase; extracting these declarations
// keeps their implementation real without loading a backend or encryption session.
async function communitySubmissionContracts() {
  const storeSource = await readFile("state/koino-store.tsx", "utf8");
  const storeAst = ts.createSourceFile("store.tsx", storeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const helperSource = await readFile("state/store/helpers.ts", "utf8");
  const helperAst = ts.createSourceFile("helpers.ts", helperSource, ts.ScriptTarget.Latest, true);
  const declaration = (ast, name) => {
    const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(node, `Expected actual ${name} declaration`);
    return node.getText(ast).replace(/^export\s+/, "");
  };
  const names = ["actionVerses", "postSupportsTitle", "validPostContent"];
  const source = [...names.map(name => declaration(helperAst, name)), declaration(storeAst, "runCommunityPostSubmission"), declaration(storeAst, "reportCommunitySubmission")].join("\n");
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const contracts = new Function(`${javascript}\nreturn { runCommunityPostSubmission, reportCommunitySubmission, ${names.join(", ")} };`)();
  let dispatchBody;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(storeAst) === "dispatch" && ts.isCallExpression(node.initializer)) {
      const callback = node.initializer.arguments[0];
      if (ts.isArrowFunction(callback) && ts.isBlock(callback.body)) dispatchBody = callback.body.statements.map(statement => statement.getText(storeAst)).join("\n");
    }
    ts.forEachChild(node, visit);
  }
  visit(storeAst);
  assert.ok(dispatchBody, "Expected actual dispatch callback for legacy compatibility checks");
  contracts.dispatch = async (action, context) => {
    const javascript = ts.transpileModule(dispatchBody, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    return new AsyncFunction(...Object.keys(context), "action", javascript)(...Object.values(context), action);
  };
  return contracts;
}

async function validateCommunitySubmissionStore() {
  const contracts = await communitySubmissionContracts();
  const createdAt = "2026-11-04T12:00:00.000Z";
  const path = "posts/room/post_share_attempt";
  const verse = { reference: "John 3:16", text: "For God so loved the world." };
  const action = {
    type: "createPost", kind: "prayer_request", title: "  Prayer title  ", body: "  Prayer body  ", verses: [verse],
    communitySubmission: { attemptId: "post_share_attempt", userId: "reader", groupId: "room", createdAt, previouslyUnknown: false, report() {} },
  };
  const clone = value => value == null ? value : structuredClone(value);
  function database(initial = [], overrides = {}) {
    const records = new Map(initial.map(([key, value]) => [key, clone(value)]));
    const calls = [], writes = [];
    const dependencies = {
      userId: "reader", groupId: "room", isCurrent: () => true,
      transact: async (key, change) => {
        calls.push(key);
        const next = change(clone(records.get(key) ?? null));
        if (next === undefined) return { committed: false };
        records.set(key, clone(next));
        writes.push({ key, value: clone(next) });
        return { committed: true };
      },
      ...overrides,
    };
    return { records, calls, writes, dependencies };
  }
  const outcome = (actual, status, reason) => {
    assert.equal(actual.status, status);
    if (reason) assert.equal(actual.reason, reason);
  };
  const first = database();
  outcome(await contracts.runCommunityPostSubmission(action, first.dependencies), "success");
  assert.deepEqual(first.calls, [path]);
  const saved = first.records.get(path);
  assert.equal(saved.id, action.communitySubmission.attemptId);
  assert.equal(saved.createdAt, createdAt);
  assert.equal(saved.userId, "reader");
  assert.equal(saved.groupId, "room");
  assert.equal(saved.title, "Prayer title");
  assert.equal(saved.body, "Prayer body");
  assert.deepEqual(saved.verses, [verse]);
  assert.equal(saved.communitySubmission, undefined, "Client outcome metadata is not persisted as post data");

  for (const [candidate, overrides] of [
    [action, { userId: undefined }],
    [action, { userId: "another-user" }],
    [action, { groupId: undefined }],
    [action, { groupId: "another-room" }],
    [{ ...action, kind: "reflection", body: " \n " }, {}],
    [{ ...action, kind: "scripture", body: "Optional words", verses: [] }, {}],
    [{ ...action, communitySubmission: { ...action.communitySubmission, attemptId: "not/a/path" } }, {}],
    [{ ...action, communitySubmission: { ...action.communitySubmission, createdAt: "invalid" } }, {}],
  ]) {
    const fixture = database([], overrides);
    outcome(await contracts.runCommunityPostSubmission(candidate, fixture.dependencies), "failure", "precondition");
    assert.equal(fixture.calls.length, 0, "Rejected preconditions must never reach persistence");
  }
  const verseOnly = database();
  outcome(await contracts.runCommunityPostSubmission({ ...action, kind: "scripture", title: "", body: "" }, verseOnly.dependencies), "success");
  assert.equal(verseOnly.records.get(path).title, undefined, "Scripture keeps its existing title-free persistence behavior");

  const conflict = database([[path, { ...saved, body: "A different record" }]]);
  outcome(await contracts.runCommunityPostSubmission(action, conflict.dependencies), "failure", "conflict");
  assert.equal(conflict.writes.length, 0, "A reused ID cannot overwrite a different existing post");
  assert.equal(conflict.records.get(path).body, "A different record");
  const duplicate = database([[path, saved]]);
  outcome(await contracts.runCommunityPostSubmission(action, duplicate.dependencies), "success");
  assert.equal(duplicate.records.size, 1, "An acknowledged repeat uses the same post path");
  const unacknowledged = database([], { transact: async (_key, change) => { change(null); return { committed: false }; } });
  outcome(await contracts.runCommunityPostSubmission(action, unacknowledged.dependencies), "failure", "conflict");

  const rejected = Object.assign(new Error("permission denied"), { code: "PERMISSION_DENIED" });
  const interrupted = Object.assign(new Error("connection lost"), { code: "NETWORK_ERROR" });
  outcome(await contracts.runCommunityPostSubmission(action, database([], { transact: async () => { throw rejected; } }).dependencies), "failure", "rejected");
  outcome(await contracts.runCommunityPostSubmission(action, database([], { transact: async () => { throw interrupted; } }).dependencies), "unknown", "transport");
  const retry = { ...action, communitySubmission: { ...action.communitySubmission, previouslyUnknown: true } };
  outcome(await contracts.runCommunityPostSubmission(retry, database([], { transact: async () => { throw rejected; } }).dependencies), "unknown");
  outcome(await contracts.runCommunityPostSubmission(retry, conflict.dependencies), "unknown", "conflict");
  outcome(await contracts.runCommunityPostSubmission(retry, database([], { userId: undefined }).dependencies), "unknown", "precondition");

  const ambiguous = database();
  const transact = ambiguous.dependencies.transact;
  ambiguous.dependencies.transact = async (...args) => { await transact(...args); throw interrupted; };
  outcome(await contracts.runCommunityPostSubmission(action, ambiguous.dependencies), "unknown", "transport");
  assert.equal(ambiguous.records.size, 1, "The write may exist even though its acknowledgement was lost");
  ambiguous.dependencies.transact = transact;
  outcome(await contracts.runCommunityPostSubmission(retry, ambiguous.dependencies), "success");
  assert.equal(ambiguous.records.size, 1, "A retry after lost acknowledgement never allocates another post");
  assert.deepEqual(ambiguous.calls, [path, path]);

  let current = true;
  const stale = database([], { isCurrent: () => current });
  current = false;
  outcome(await contracts.runCommunityPostSubmission(action, stale.dependencies), "failure", "session");
  assert.equal(stale.calls.length, 0);
  current = true;
  const beforeStaleTransact = stale.dependencies.transact;
  stale.dependencies.transact = async (...args) => { const result = await beforeStaleTransact(...args); current = false; return result; };
  outcome(await contracts.runCommunityPostSubmission(action, stale.dependencies), "unknown", "session");
  assert.equal(stale.records.size, 1, "A session change after persistence cannot be described as a confirmed failure");
  const staleBeforeWrite = database([], { isCurrent: () => current, transact: async (_key, change) => { current = false; assert.equal(change(null), undefined); return { committed: false }; } });
  current = true;
  outcome(await contracts.runCommunityPostSubmission(action, staleBeforeWrite.dependencies), "unknown", "session");

  const baseline = { ...saved, answeredAt: "2026-11-03T12:00:00Z", answeredUpdate: "Existing answer" };
  const edit = { ...action, type: "editPost", id: baseline.id, body: "  Edited body  ", communitySubmission: { ...action.communitySubmission, baseline } };
  for (const candidate of [
    { ...edit, communitySubmission: { ...edit.communitySubmission, baseline: undefined } },
    { ...edit, communitySubmission: { ...edit.communitySubmission, baseline: { ...baseline, userId: "another-user" } } },
  ]) {
    const fixture = database([[path, baseline]]);
    outcome(await contracts.runCommunityPostSubmission(candidate, fixture.dependencies), "failure", "precondition");
    assert.equal(fixture.calls.length, 0);
  }
  const editing = database([[path, baseline]]);
  outcome(await contracts.runCommunityPostSubmission(edit, editing.dependencies), "success");
  const edited = editing.records.get(path);
  assert.equal(edited.body, "Edited body");
  assert.equal(edited.createdAt, baseline.createdAt);
  assert.equal(edited.answeredAt, baseline.answeredAt, "Editing content preserves the existing prayer answer state");
  assert.equal(edited.answeredUpdate, baseline.answeredUpdate);
  for (const record of [null, { ...baseline, body: "Edited elsewhere" }, { ...baseline, userId: "someone-else" }]) {
    const fixture = database(record ? [[path, record]] : []);
    outcome(await contracts.runCommunityPostSubmission(edit, fixture.dependencies), "failure", "conflict");
    assert.equal(fixture.writes.length, 0, "Editing cannot resurrect a missing post or overwrite a conflicting/foreign record");
  }
  const retryEdit = { ...edit, communitySubmission: { ...edit.communitySubmission, previouslyUnknown: true } };
  const editedAlready = database([[path, edited]]);
  outcome(await contracts.runCommunityPostSubmission(retryEdit, editedAlready.dependencies), "success");
  assert.equal(editedAlready.records.size, 1);

  const errors = [], legacyWrites = [];
  const legacy = {
    ...contracts, firebaseUser: { uid: "reader" }, profile: { currentGroupId: "room" }, auth: { currentUser: { uid: "reader" } },
    legacyMemberships: [], encryptedUserMemberships: [], biblePlans: [], posts: [baseline],
    database: {}, ref: (_database, key) => key, now: () => createdAt, id: () => "legacy-fresh-id", sessionGeneration: () => 1,
    setAuthError: value => errors.push(value), authMessage: error => error.message,
    set: async (key, value) => legacyWrites.push({ key, value }), update: async (key, value) => legacyWrites.push({ key, value }),
    setPosts() {}, olderPostsRef: { current: [baseline] },
    communitySubmissionScopeRef: { current: { userId: "reader", groupId: "room" } },
  };
  const legacyCreate = { ...action }; delete legacyCreate.communitySubmission;
  assert.equal(await contracts.dispatch(legacyCreate, legacy), undefined);
  assert.equal(legacyWrites[0].value.id, "legacy-fresh-id", "Existing callers keep the original allocation path");
  const legacyFailure = { ...legacy, set: async () => { throw rejected; } };
  assert.equal(await contracts.dispatch(legacyCreate, legacyFailure), undefined, "An unrelated legacy caller still gets its existing swallowed-error behavior");
  assert.equal(errors.at(-1), rejected.message);
  const reports = [];
  const optedIn = { ...action, communitySubmission: { ...action.communitySubmission, report: value => reports.push(value) } };
  await contracts.dispatch(optedIn, { ...legacy, runTransaction: async (_reference, change, options) => {
    assert.equal(options.applyLocally, false, "Only acknowledgement, not an optimistic local write, confirms a submission");
    return { committed: change(null) !== undefined };
  } });
  assert.equal(reports.length, 1, "Opt-in dispatch reports exactly one outcome");
  outcome(reports[0], "success");
  reports.length = 0;
  await contracts.dispatch(optedIn, { ...legacy, firebaseUser: undefined });
  assert.equal(reports.length, 1);
  outcome(reports[0], "failure", "precondition");
  reports.length = 0;
  await contracts.dispatch(optedIn, { ...legacy, legacyMemberships: [{ groupId: "room" }] });
  assert.equal(reports.length, 1, "Existing pre-transaction guards must provide an opted-in outcome rather than silently resolve");
  outcome(reports[0], "failure", "precondition");
  await contracts.dispatch({ ...optedIn, communitySubmission: { ...optedIn.communitySubmission, report() { throw new Error("stale UI callback"); } } }, {
    ...legacy, runTransaction: async (_reference, change) => ({ committed: change(null) !== undefined }),
  });
  console.log("Community submission store passed: acknowledged CAS success, failure/preconditions, conflicts, unknown/lost acknowledgement, sticky uncertainty, stable retries, stale sessions, editing and legacy dispatch compatibility.");
}

let tree;
try {
  const outfile = path.join(directory, "screens.cjs");
  await build({
    stdin: { contents: `export { JournalDetailScreen as JournalDetail } from "./features/journal-detail-screen"; export { SharedComposer as RealComposer } from "./ui/shared-composer"; export { HomeScreen as Home } from "./features/home-screen"; export { default as Tabs } from "./app/(tabs)/_layout";
      export { translateMessage } from "./ui/localization";
      export { PrayerRequestCard } from "./features/community/prayer-screens";
      export { CheckInModal as RealCheckInModal } from "./features/check-in-modal";
      export { default as Overview } from "./app/(tabs)/community/index";
      export { default as Prayer } from "./app/(tabs)/community/prayer";
      export { default as CheckIns } from "./app/(tabs)/community/checkins";`, resolveDir: process.cwd(), loader: "tsx" },
    outfile, bundle: true, platform: "node", format: "cjs", jsx: "automatic",
    plugins: [{ name: "community-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (mocks[args.path]) return { path: args.path, namespace: "mock" };
        if (args.path === "react" || args.path.startsWith("react/")) return { path: require.resolve(args.path), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: process.cwd() }));
      // Seed only the real overview hook to simulate retained state from an older version.
      builder.onLoad({ filter: /[\\/]features[\\/]settings-screen\.tsx$/ }, async args => {
        const source = await readFile(args.path, "utf8");
        const initializer = 'useState<RoomDetailTab>("recent")';
        assert.equal(source.split(initializer).length, 2, "Expected exactly one overview filter state initializer");
        return { contents: source.replace(initializer, 'useState<RoomDetailTab>((globalThis as any).__communityNavigation.initialDetailTab ?? "recent")'), loader: "tsx" };
      });
    } }],
  });
  const screens = require(outfile);
  await validateCommunitySubmissionStore();
  harness.state = baseState;
  for (const os of ["android", "ios"]) {
    harness.os = os;
    await act(async () => { tree = create(React.createElement(screens.Tabs)); });
    assert.equal(tree.root.findByType("Tabs").props.detachInactiveScreens, os !== "android",
      "Android must not detach the tab hosting the nested Community stack");
    await act(() => tree.unmount());
  }
  const now = new Date().toISOString();
  const overviewState = {
    ...populatedState,
    posts: [...populatedState.posts, { id: "reflection", groupId: "room", userId: "reader", kind: "reflection", body: "Reflection regression content" }].map(item => ({ ...item, createdAt: now })),
    checkIns: populatedState.checkIns.map(item => ({ ...item, createdAt: now })),
  };
  const overviewChips = () => tree.root.find(node => node.type?.name === "CommunityFilterChips");
  const feedIds = () => tree.root.findByType("FlatList").props.data.filter(row => row.type === "item").map(row => row.item.id).sort();
  const pressBack = () => tree.root.findAllByType("IconButton").find(node => node.props.accessibilityLabel === "common.back").props.onPress();
  const overviewEntryLabels = {
    prayer: "community.overview.prayerRequests. community.overview.prayTogether",
    checkins: "community.page.checkIns. community.overview.shareHowYouFeel",
  };
  const overviewEntry = label => tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === label);
  const entryStyle = entry => Object.assign({}, ...[entry.props.style].flat(Infinity).filter(Boolean));
  for (const os of ["android", "ios"]) {
    harness.os = os;
    for (const overviewFilter of ["recent", "reflections"]) {
      for (const destination of ["prayer", "checkins"]) {
        harness.state = overviewState;
        harness.route = "index";
        await act(async () => { tree = create(React.createElement(screens.Overview)); });
        assert.deepEqual(overviewChips().props.options.map(option => option.value), ["recent", "reflections"], "Only overview feed filters are displayed");
        const rendered = JSON.stringify(tree.toJSON(), (key, value) => key === "_owner" ? undefined : value);
        assert.ok(!rendered.includes("community.feed.openPrayer") && !rendered.includes("community.feed.openCheckIns"), "Redundant Open buttons must not appear");
        assert.equal(tree.root.findAll(node => node.type?.name === "CommunityPrayerActions").length, 0, "Overview has two destination cards, without the old prayer action launcher");
        assert.ok(!rendered.includes("community.prayer.actions.prayForSomeone") && !rendered.includes("community.prayer.prayForSomeone"), "Pray for someone belongs inside Prayer, not on the overview");
        await act(() => overviewChips().props.onChange(overviewFilter));
        assert.deepEqual(feedIds(), overviewFilter === "recent" ? ["checkin", "prayer", "reflection"] : ["reflection"], "Recent stays mixed and Reflections stays filtered");
        const share = tree.root.findAllByType("PrimaryButton").find(node => node.props.children === "community.feed.share");
        assert.ok(share, `Share must remain available for ${overviewFilter}`);
        await act(() => share.props.onPress());
        const composer = tree.root.findByType("SharedComposer");
        assert.equal(composer.props.visible, true);
        assert.equal(composer.props.kind, "reflection");
        await act(() => composer.props.onClose());
        const offset = overviewFilter === "recent" ? 260 : 180;
        await act(() => tree.root.findByType("FlatList").props.onScroll({ nativeEvent: { contentOffset: { y: offset }, contentSize: { height: 2000 }, layoutMeasurement: { height: 700 } } }));
        harness.scrollRestores = [];
        const before = harness.backs;
        const entry = overviewEntry(overviewEntryLabels[destination]);
        assert.ok(entry, `${destination} must be reachable directly from ${overviewFilter} (${os})`);
        assert.equal(entry.props.accessibilityRole, "button", "Destination cards expose their control role");
        assert.ok(entryStyle(entry).minHeight >= 44, "Direct entries retain accessible tap targets");
        await act(() => entry.props.onPress());
        const inlineView = JSON.stringify(tree.toJSON(), (key, value) => key === "_owner" ? undefined : value);
        assert.ok(inlineView.includes(destination === "prayer" ? "community.page.prayer" : "community.page.checkIns"), `${destination} opens in one tap (${os})`);
        assert.equal(harness.route, "index", "Direct entries must retain mounted Community navigation");
        if (os === "android" && destination === "checkins") {
          assert.equal(typeof harness.hardwareBack, "function", "Android focused views register hardware Back");
          await act(() => assert.equal(harness.hardwareBack(), true));
        } else await act(pressBack);
        assert.equal(harness.backs, before, "Inline Back must return to the mounted overview");
        assert.equal(overviewChips().props.value, overviewFilter, "Back preserves the selected overview filter");
        await act(() => tree.root.findByType("FlatList").props.onContentSizeChange());
        assert.deepEqual(harness.scrollRestores.at(-1), { animated: false, offset }, "Back restores the saved feed scroll position");
        await act(() => tree.unmount());
      }
    }
  }
  harness.os = "android";
  for (const [language, prayerTitle, prayerSubtitle, checkInsTitle, checkInsSubtitle] of [
    ["en", "Prayer requests", "Pray together", "Check-ins", "Share how you feel"],
    ["sv", "Böneämnen", "Be tillsammans", "Incheckningar", "Dela hur du mår"],
  ]) {
    harness.localized = true;
    harness.language = language;
    harness.state = overviewState;
    assert.equal(screens.translateMessage(language, "community.overview.prayerRequests"), prayerTitle);
    assert.equal(screens.translateMessage(language, "community.overview.prayTogether"), prayerSubtitle);
    assert.equal(screens.translateMessage(language, "community.page.checkIns"), checkInsTitle);
    assert.equal(screens.translateMessage(language, "community.overview.shareHowYouFeel"), checkInsSubtitle);
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    const entries = [overviewEntry(`${prayerTitle}. ${prayerSubtitle}`), overviewEntry(`${checkInsTitle}. ${checkInsSubtitle}`)];
    assert.ok(entries.every(Boolean), `Both overview cards have translated accessible labels (${language})`);
    assert.equal(entries[0].parent, entries[1].parent, "Destination cards share one navigation row");
    for (const entry of entries) {
      assert.deepEqual(Object.fromEntries(["flex", "flexBasis", "minWidth"].map(key => [key, entryStyle(entry)[key]])), { flex: 1, flexBasis: 0, minWidth: 0 }, "Destination cards share available width equally");
      assert.equal(entry.props.accessibilityRole, "button");
      assert.ok(entryStyle(entry).minHeight >= 44);
      assert.ok(entry.findAllByType("Text").every(text => text.props.numberOfLines === undefined), "Card copy can wrap without truncation");
    }
    await act(() => tree.unmount());
  }
  delete harness.localized;
  delete harness.language;
  // Personal prayer remains available through the existing Prayer screen flow.
  harness.state = overviewState;
  harness.actions = [];
  await act(async () => { tree = create(React.createElement(screens.Prayer)); });
  const prayForSomeone = tree.root.findAllByType("SecondaryButton").find(node => node.props.children === "community.prayer.prayForSomeone");
  assert.ok(prayForSomeone, "Prayer retains its Pray for someone action");
  const memberModal = () => tree.root.find(node => node.type?.name === "CommunityPrayerMemberModal");
  assert.equal(memberModal().props.visible, false);
  await act(() => prayForSomeone.props.onPress());
  assert.equal(memberModal().props.visible, true, "Pray for someone opens the existing member selector");
  await act(() => memberModal().props.onClose());
  assert.equal(memberModal().props.visible, false, "The existing member selector closes normally");
  assert.deepEqual(harness.actions, [], "Opening and closing the selector performs no data writes");
  await act(() => tree.unmount());
  for (const obsoleteFilter of ["prayer", "checkins", "obsolete"]) {
    harness.state = overviewState;
    harness.initialDetailTab = obsoleteFilter;
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    assert.equal(overviewChips().props.value, "recent", "Retained removed/invalid filters fall back to Recent");
    assert.deepEqual(feedIds(), ["checkin", "prayer", "reflection"], "Fallback must use the mixed Recent feed");
    await act(() => overviewChips().props.onChange("reflections"));
    await act(() => overviewChips().props.onChange(obsoleteFilter));
    assert.equal(overviewChips().props.value, "recent", "Obsolete active callbacks also fall back to Recent");
    await act(() => tree.unmount());
  }
  delete harness.initialDetailTab;
  for (const [filter, component, title, empty] of [
    ["checkins", screens.CheckIns, "community.page.checkIns", "community.checkIns.empty"],
    ["prayer", screens.Prayer, "community.page.prayer", "community.prayer.emptyOpen"],
  ]) {
    for (const status of ["ready", "loading", "error", "populated", "offline"]) {
      harness.state = { ...(status === "populated" || status === "offline" ? populatedState : baseState), communityFeedReady: status !== "loading", communityFeedError: status === "error" ? "test error" : undefined, communityFeedOffline: status === "offline" };
      await act(async () => { tree = create(React.createElement(component)); });
      const rendered = JSON.stringify(tree.toJSON(), (key, value) => key === "_owner" ? undefined : value);
      assert.ok(rendered.includes(title), `${filter} must show its title on first mount (${status})`);
      const expected = status === "populated" || status === "offline" ? (filter === "prayer" ? "Prayer regression content" : "Check-in regression content")
        : status === "loading" ? "community.feed.loading" : status === "error" ? "community.feed.loadError" : empty;
      assert.ok(rendered.includes(expected),
        `${filter} must render its ${status} state without a tab switch`);
      if (status === "offline") assert.ok(rendered.includes("community.feed.unavailable"), "Offline pages retain cached content with an offline notice");
      const before = harness.backs;
      await act(() => tree.root.findAllByType("IconButton").find(node => node.props.accessibilityLabel === "common.back").props.onPress());
      assert.equal(harness.backs, before + 1);
      await act(() => tree.unmount());
    }
  }
  // Exercise request prayer through the real screen callbacks; Dwell itself remains mocked.
  const sarahImage = { url: "test-image", path: "profiles/sarah/image.webp", width: 512, height: 512, contentType: "image/webp", updatedAt: now };
  const prayerFixture = {
    ...baseState,
    users: [...baseState.users, { id: "sarah", name: "Sarah", image: sarahImage }],
    memberships: [{ userId: "reader", role: "owner", userName: "Reader" }, { userId: "sarah", role: "member", userName: "Sarah" }],
    posts: [
      { id: "unprayed", groupId: "room", userId: "sarah", kind: "prayer_request", title: "Tomorrow", body: "Please pray for tomorrow.", createdAt: now },
      { id: "answered", groupId: "room", userId: "sarah", kind: "prayer_request", body: "An answered request.", answeredAt: now, createdAt: now },
      { id: "prior-prayed", groupId: "room", userId: "sarah", kind: "prayer_request", body: "A request already prayed for.", createdAt: now },
    ],
    prayerReactions: [{ id: "reader_post_prior-prayed", userId: "reader", targetType: "post", targetId: "prior-prayed", createdAt: now }],
    communityContentHasMore: true, communityContentLoadingMore: false,
  };
  const cards = () => tree.root.findAll(node => node.type?.name === "CommunityFeedCard");
  const card = id => cards().find(node => node.props.item.id === id);
  const cardIds = () => cards().map(node => node.props.item.id).sort();
  const requestAction = id => {
    const action = card(id).props.actions;
    return card(id).find(node => node.type === action.type && node.props.onPress === action.props.onPress);
  };
  const moment = () => tree.root.findByType("PrayerMoment");
  const press = node => node.props.onPress({ stopPropagation() {} });
  const renderedTree = () => JSON.stringify(tree.toJSON(), (key, value) => key === "_owner" ? undefined : value);
  const updatePrayer = async state => { harness.state = state; await act(() => tree.update(React.createElement(screens.Prayer))); };
  harness.state = prayerFixture;
  harness.actions = [];
  await act(async () => { tree = create(React.createElement(screens.Prayer)); });
  assert.ok(tree.root.findAll(node => node.type?.name === "PrayerRequestCard").every(node => node.props.focused === true), "Only the dedicated Prayer screen opts into focused request actions");
  assert.ok(cards().every(node => !node.props.overview), "Focused Prayer retains its existing card shell");
  assert.equal(requestAction("unprayed").type, "Pressable");
  assert.equal(requestAction("unprayed").props.accessibilityLabel, "community.prayer.prayForRequest:Sarah");
  assert.ok(entryStyle(requestAction("unprayed")).minHeight >= 44);
  assert.equal(requestAction("unprayed").findByType("MaterialCommunityIcons").props.name, "hands-pray");
  assert.equal(card("unprayed").props.status.props.status, "open");
  await act(() => press(requestAction("unprayed")));
  const expectedTarget = { targetType: "post", targetId: "unprayed", body: prayerFixture.posts[0].body, recipientUserId: "sarah", recipientName: "Sarah", recipientImage: sarahImage };
  assert.deepEqual(moment().props.target, expectedTarget, "Pray must retain the exact request and recipient metadata");
  await act(() => moment().props.onClose());
  assert.equal(moment().props.target, undefined);
  assert.deepEqual(harness.actions, [], "Cancelling a request prayer does not persist completion");
  for (const status of ["skipped", "completed"]) {
    await act(() => press(requestAction("unprayed")));
    await act(() => moment().props.onFinish(status, now));
    assert.equal(moment().props.target, undefined);
    assert.deepEqual(harness.actions.at(-1), { type: "finishPrayer", targetType: "post", targetId: "unprayed", status, startedAt: now, recipientUserId: "sarah", throwOnError: false }, "Dwell callback retains the existing request completion contract");
  }
  const afterPrayer = { ...prayerFixture, prayerReactions: [...prayerFixture.prayerReactions, { id: "reader_post_unprayed", userId: "reader", targetType: "post", targetId: "unprayed", createdAt: now }] };
  await updatePrayer(afterPrayer);
  assert.equal(requestAction("unprayed").type.name, "CommunityCardAction");
  assert.equal(requestAction("unprayed").props.active, true);
  assert.equal(requestAction("unprayed").props.label, "community.action.prayer.completed");
  assert.equal(requestAction("unprayed").props.accessibilityLabel, "community.prayer.prayAgainForRequest:Sarah");
  assert.equal(card("unprayed").props.status.props.status, "open", "Prayed participation does not mark a request Answered");
  assert.equal(card("unprayed").find(node => node.type?.name === "CommunityCardResponseSummary").props.count, 1);
  await act(() => press(requestAction("unprayed")));
  assert.deepEqual(moment().props.target, expectedTarget, "Prayed remains an interactive repeat-prayer action");
  await act(() => moment().props.onFinish("completed", now));
  assert.equal(harness.actions.at(-1).type, "finishPrayer", "Repeat prayer must not toggle or remove participation");
  await act(() => overviewChips().props.onChange("answered"));
  assert.equal(card("answered").props.status.props.status, "answered");
  assert.equal(requestAction("answered").type, "Pressable", "Answered status does not imply that this reader has prayed");
  const sharePrayer = tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === "community.prayer.share");
  assert.ok(sharePrayer && entryStyle(sharePrayer).minHeight >= 44, "Sharing is an accessible tertiary action");
  await act(() => press(sharePrayer));
  assert.equal(tree.root.findByType("SharedComposer").props.visible, true);
  assert.equal(tree.root.findByType("SharedComposer").props.kind, "prayer_request");
  await act(() => tree.root.findByType("SharedComposer").props.onClose());
  await act(() => press(tree.root.findAllByType("SecondaryButton").find(node => node.props.children === "community.prayer.prayForSomeone")));
  await act(() => memberModal().props.onSelect(memberModal().props.members.find(member => member.id === "sarah")));
  assert.equal(memberModal().props.visible, false);
  assert.deepEqual(moment().props.target, { ...expectedTarget, targetType: "user", targetId: "sarah", body: "" }, "Personal prayer still selects a user, independently of request prayer");
  await act(() => moment().props.onClose());
  const beforePagination = harness.actions.length;
  await act(() => press(tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === "community.feed.viewMoreEarlier")));
  assert.equal(harness.actions.length, beforePagination + 1);
  assert.deepEqual(harness.actions.at(-1), { type: "loadOlderCommunityContent" });
  await updatePrayer({ ...prayerFixture, communityContentLoadingMore: true });
  const earlierAction = tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === "community.feed.viewMoreEarlier");
  assert.equal(earlierAction.props.disabled, true);
  assert.equal(earlierAction.props.accessibilityState.busy, true);
  for (const [filter, ids, emptyKey] of [
    ["open", ["prior-prayed", "unprayed"], "community.prayer.emptyOpen"],
    ["answered", ["answered"], "community.prayer.emptyAnswered"],
    ["all", ["answered", "prior-prayed", "unprayed"], "community.prayer.empty"],
  ]) {
    await act(() => overviewChips().props.onChange(filter));
    for (const status of ["populated", "loading", "error", "offline", "empty"]) {
      await updatePrayer({ ...prayerFixture, posts: status === "empty" ? [] : prayerFixture.posts, communityFeedReady: status !== "loading", communityFeedError: status === "error" ? "test error" : undefined, communityFeedOffline: status === "offline" });
      assert.deepEqual(cardIds(), ["populated", "offline"].includes(status) ? ids : [], `${filter} preserves its ${status} card state`);
      if (status !== "populated") assert.ok(renderedTree().includes(status === "loading" ? "community.feed.loading" : status === "error" ? "community.feed.loadError" : status === "offline" ? "community.feed.unavailable" : emptyKey));
      assert.equal(tree.root.findAllByType("Pressable").some(node => node.props.accessibilityLabel === "community.feed.viewMoreEarlier"), status !== "loading" && status !== "error", "Pagination preserves its loading/error guard");
    }
  }
  await updatePrayer({ ...prayerFixture, communityContentHasMore: false });
  assert.ok(!tree.root.findAllByType("Pressable").some(node => node.props.accessibilityLabel === "community.feed.viewMoreEarlier"), "No older-content action appears when history is exhausted");
  await act(() => tree.unmount());
  // Recent opts into the overview shell, independently of focused request actions.
  harness.state = prayerFixture;
  await act(async () => { tree = create(React.createElement(screens.Overview)); });
  assert.ok(tree.root.findAll(node => node.type?.name === "PrayerRequestCard").every(node => node.props.focused === undefined), "Recent does not opt into focused request styling");
  assert.equal(requestAction("unprayed").type.name, "CommunityCardAction");
  await act(() => tree.unmount());
  const earlier = { id: "earlier", groupId: "room", userId: "sarah", kind: "reflection", body: "Earlier reflection", createdAt: "2020-01-01T12:00:00Z" };
  const densityFixture = {
    ...prayerFixture,
    posts: [
      ...prayerFixture.posts,
      { ...earlier, id: "reflection", body: "A recent reflection", createdAt: now },
      { ...earlier, id: "praise", kind: "praise", body: "A recent praise", createdAt: now },
      { ...earlier, id: "scripture", kind: "scripture", body: "", verse: { reference: "Psalm 23:1", text: "The Lord is my shepherd." }, createdAt: now },
      earlier,
    ],
    checkIns: [{ ...populatedState.checkIns[0], userId: "sarah", reflectionText: "", createdAt: now }],
    postReactions: [{ id: "encouraged", userId: "reader", targetType: "post", targetId: "reflection", kind: "reflection", createdAt: now }],
  };
  harness.state = densityFixture;
  harness.actions = [];
  await act(async () => { tree = create(React.createElement(screens.Overview)); });
  assert.deepEqual(cardIds(), ["answered", "checkin", "praise", "prior-prayed", "reflection", "scripture", "unprayed"]);
  assert.ok(cards().every(node => node.props.overview === true), "All overview card types use the denser shell");
  assert.ok(cards().every(node => node.findAllByType("Avatar").length === 1 && node.findAllByType("AvatarStack").length === 0), "Only the author avatar renders on overview cards");
  for (const node of cards()) {
    const [author, meta] = node.findAllByType("Text");
    assert.equal(author.props.children, "Sarah");
    assert.match(meta.props.children, /^community\..+ · .+$/);
    assert.equal(meta.props.numberOfLines, undefined, "Metadata can wrap under the author name");
  }
  assert.ok(renderedTree().includes("community.feed.caughtUpTitle"));
  assert.equal(tree.root.findByType("FlatList").props.onEndReached, undefined, "Scrolling cannot load history");
  assert.deepEqual(harness.actions, []);
  const actionNodes = id => card(id).findAll(node => node.type?.name === "CommunityCardAction");
  for (const [id, icon, secondaryCount] of [["reflection", "heart", 1], ["scripture", "book-open", 1], ["praise", "star", 0], ["checkin", "heart", 0], ["unprayed", "pray", 0]]) {
    const [primary, ...secondary] = actionNodes(id);
    assert.equal(primary.props.icon, icon);
    assert.notEqual(primary.props.variant, "secondary");
    assert.equal(secondary.length, secondaryCount);
    if (secondary.length) {
      assert.equal(secondary[0].props.icon, "pray");
      assert.equal(secondary[0].props.variant, "secondary");
      assert.equal(secondary[0].findAllByType("MaterialCommunityIcons").length, 0, "Secondary Pray is text only");
    }
    for (const action of [primary, ...secondary]) assert.ok(entryStyle(action.findByType("Pressable")).minHeight >= 44);
  }
  assert.equal(card("answered").props.status.props.children, "shared.status.answered");
  assert.match(card("answered").props.status.props.accessibilityLabel, /community\.prayer\.status\.label.*shared\.status\.answered/);
  assert.ok(card("checkin").find(node => node.type?.name === "CommunityCheckInMood"));
  assert.equal(card("scripture").findByType("VerseList").props.verse.reference, "Psalm 23:1");
  assert.equal(card("reflection").find(node => node.type?.name === "CommunityCardResponseSummary").props.count, 1);
  assert.equal(card("unprayed").props.responseSummary, undefined, "Zero prayers add no response copy in the overview");
  for (const [id, targetType, kind] of [["reflection", "post", "reflection"], ["praise", "post", "praise"], ["checkin", "check_in", "reflection"]]) {
    await act(() => press(actionNodes(id)[0].findByType("Pressable")));
    assert.deepEqual(harness.actions.at(-1), { type: "togglePostReaction", targetType, targetId: id, kind, mode: "ensure" });
    await act(() => tree.root.findByType("WrittenEncouragementComposer").props.onDismiss());
  }
  await act(() => press(actionNodes("reflection")[1].findByType("Pressable")));
  assert.equal(moment().props.target.targetId, "reflection", "Quiet secondary Pray still opens Dwell");
  await act(() => moment().props.onClose());
  await act(() => press(actionNodes("unprayed")[0].findByType("Pressable")));
  assert.equal(moment().props.target.targetId, "unprayed");
  await act(() => moment().props.onClose());
  await act(() => press(actionNodes("scripture")[0].findByType("Pressable")));
  const scriptureComposer = tree.root.findByType("SharedComposer");
  assert.equal(scriptureComposer.props.context, "journal");
  assert.equal(scriptureComposer.props.entryVisibility, "private");
  assert.equal(scriptureComposer.props.verses[0].reference, "Psalm 23:1");
  await act(() => scriptureComposer.props.onClose());
  const openScripture = card("scripture").findAllByType("Pressable").find(node => node.findAllByType("VerseList").length === 1);
  await act(() => press(openScripture));
  assert.equal(harness.pushed, "/feed/post/scripture", "A verse-only Scripture card still opens details");
  const endpoint = tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === "community.feed.viewEarlierIn:Test community");
  assert.ok(endpoint);
  await act(() => press(endpoint));
  assert.ok(card("earlier")?.props.overview, "Manually revealed history uses the same card hierarchy");
  assert.ok(renderedTree().includes("community.feed.earlierActivity"));
  await act(() => overviewChips().props.onChange("reflections"));
  assert.deepEqual(cardIds(), ["reflection"], "Reflections stays filtered and starts with its own unrevealed history");
  assert.equal(tree.root.findByType("FlatList").props.onEndReached, undefined);
  await act(() => tree.unmount());
  for (const [language, copy, answered, count] of [
    ["en", [["reflection", "Reflection", "Encouraged"], ["unprayed", "Prayer", "Pray"], ["praise", "Praise", "Amen"], ["scripture", "Scripture", "Reflect"], ["checkin", "Check-in", "Encourage"]], "Answered", "1 encouragement"],
    ["sv", [["reflection", "Reflektion", "Uppmuntrat"], ["unprayed", "Bön", "Be"], ["praise", "Tacksägelse", "Amen"], ["scripture", "Bibelord", "Reflektera"], ["checkin", "Incheckning", "Uppmuntra"]], "Besvarad", "1 uppmuntran"],
  ]) {
    harness.localized = true;
    harness.language = language;
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    for (const [id, type, action] of copy) {
      assert.ok(card(id).findAllByType("Text")[1].props.children.startsWith(`${type} · `));
      assert.equal(actionNodes(id)[0].findByType("Pressable").props.accessibilityLabel, action);
    }
    assert.equal(card("answered").props.status.props.accessibilityLabel, `status. ${answered}`);
    const summary = card("reflection").find(node => node.type?.name === "CommunityCardResponseSummary");
    assert.equal(summary.findByType("Text").props.children.join(""), count);
    await act(() => tree.unmount());
  }
  delete harness.localized;
  delete harness.language;
  for (const [state, message, hasCards] of [
    [{ ...densityFixture, communityFeedReady: false }, "community.feed.loading", false],
    [{ ...densityFixture, communityFeedError: "test error" }, "community.feed.loadError", false],
    [{ ...densityFixture, posts: [], checkIns: [] }, "community.empty.recent", false],
    [{ ...densityFixture, communityFeedOffline: true }, "community.feed.unavailable", true],
  ]) {
    harness.state = state;
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    assert.ok(renderedTree().includes(message));
    assert.equal(cards().length > 0, hasCards);
    if (hasCards) assert.ok(cards().every(node => node.props.overview));
    await act(() => tree.unmount());
  }
  const cardProps = { item: { ...prayerFixture.posts[0], type: "post" }, authorName: "Sarah", ownsItem: false, prayerCount: 0, prayedBy: [], onOpen() {}, onPray() {} };
  for (const prayed of [false, true]) {
    await act(async () => { tree = create(React.createElement(screens.PrayerRequestCard, { ...cardProps, prayed })); });
    const defaultCard = renderedTree();
    await act(() => tree.unmount());
    await act(async () => { tree = create(React.createElement(screens.PrayerRequestCard, { ...cardProps, prayed, focused: false })); });
    assert.equal(renderedTree(), defaultCard, "Omitting focused retains the default card markup and props");
    await act(() => tree.unmount());
  }
  await act(async () => { tree = create(React.createElement(screens.PrayerRequestCard, { ...cardProps, item: { ...cardProps.item, kind: "prayer_moment" }, focused: true, prayed: false })); });
  assert.equal(tree.root.find(node => node.type?.name === "CommunityCardAction").props.onPress, undefined, "A prayer moment stays read-only even in focused mode");
  assert.equal(cards()[0].props.status, undefined);
  await act(() => tree.unmount());
  const prayerCopy = {
    en: {
      description: "Choose a request to pray for.", share: "Share a prayer request", filters: ["Open", "Answered", "All"],
      pray: "Pray", prayed: "Prayed", prayLabel: "Pray for the request from Sarah", repeatLabel: "Pray again for the request from Sarah",
      counts: { open: ["1 open request shown", "2 open requests shown"], answered: ["1 answered request shown", "2 answered requests shown"], all: ["1 request shown", "2 requests shown"] },
      empty: { open: "No open requests to show right now. You can still pray for someone.", answered: "No answered requests to show yet. Keep carrying one another in prayer.", all: "No prayer requests to show yet. You can share one with your community." },
    },
    sv: {
      description: "Välj ett böneämne att be för.", share: "Dela ett böneämne", filters: ["Öppna", "Besvarade", "Alla"],
      pray: "Be", prayed: "Bett", prayLabel: "Be för böneämnet från Sarah", repeatLabel: "Be igen för böneämnet från Sarah",
      counts: { open: ["1 öppet böneämne visas", "2 öppna böneämnen visas"], answered: ["1 besvarat böneämne visas", "2 besvarade böneämnen visas"], all: ["1 böneämne visas", "2 böneämnen visas"] },
      empty: { open: "Det finns inga öppna böneämnen att visa just nu. Du kan fortfarande be för någon.", answered: "Det finns inga besvarade böneämnen att visa ännu. Fortsätt bära varandra i bön.", all: "Det finns inga böneämnen att visa ännu. Du kan dela ett med din gemenskap." },
    },
  };
  for (const [language, copy] of Object.entries(prayerCopy)) {
    harness.localized = true;
    harness.language = language;
    for (const filter of ["open", "answered", "all"]) {
      const sample = prayerFixture.posts.find(item => filter === "answered" ? item.answeredAt : !item.answeredAt);
      for (const count of [1, 2]) {
        const localizedState = { ...prayerFixture, posts: [sample, { ...sample, id: "localized-second" }].slice(0, count), prayerReactions: [] };
        harness.state = localizedState;
        await act(async () => { tree = create(React.createElement(screens.Prayer)); });
        await act(() => overviewChips().props.onChange(filter));
        assert.deepEqual(overviewChips().props.options.map(option => option.label), copy.filters);
        assert.ok(renderedTree().includes(copy.description) && renderedTree().includes(copy.counts[filter][count - 1]), `${language} ${filter} describes only the loaded requests, with correct singular/plural copy`);
        assert.ok(tree.root.findAllByType("Pressable").some(node => node.props.accessibilityLabel === copy.share));
        assert.equal(requestAction(sample.id).props.accessibilityLabel, copy.prayLabel);
        assert.ok(requestAction(sample.id).findAllByType("Text").some(node => node.props.children === copy.pray));
        await updatePrayer({ ...localizedState, prayerReactions: [{ id: `reader_post_${sample.id}`, userId: "reader", targetType: "post", targetId: sample.id, createdAt: now }] });
        assert.equal(requestAction(sample.id).props.label, copy.prayed);
        assert.equal(requestAction(sample.id).props.accessibilityLabel, copy.repeatLabel);
        if (count === 2) {
          await updatePrayer({ ...localizedState, posts: [] });
          assert.ok(renderedTree().includes(copy.empty[filter]), `${language} ${filter} has its supportive empty state`);
        }
        await act(() => tree.unmount());
      }
    }
  }
  delete harness.localized;
  delete harness.language;
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
  // Mount the actual modal for its async confirmation contract, keeping native UI mocked.
  const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  const modalDefaults = { visible: true, step: "details", mood: "peaceful", note: "", verses: [], roomName: "Test community", share: false, onBack() {}, onClose() {}, onDone() {}, onMood() {}, onNote() {}, onShare() {}, onVerses() {} };
  let modalProps;
  const updateModal = async changes => { modalProps = { ...modalProps, ...changes }; await act(() => tree.update(React.createElement(screens.RealCheckInModal, modalProps))); };
  const saveControl = () => tree.root.findAllByType("PrimaryButton").find(node => node.props.icon === "send");
  const audienceSwitch = () => tree.root.findAllByType("Pressable").find(node => node.props.accessibilityRole === "switch");
  const hasDone = () => tree.root.findAllByType("PrimaryButton").some(node => node.props.children === (harness.localized ? screens.translateMessage(harness.language, "community.checkIn.done") : "community.checkIn.done"));
  const modalCopy = (key, values) => harness.localized ? screens.translateMessage(harness.language, key, values) : values?.name ? `${key}:${values.name}` : key;
  const assertAudienceSelection = (shared, pending = false) => {
    const control = audienceSwitch(), destinationIcon = control.findByType("Feather");
    assert.deepEqual(control.props.accessibilityState, { checked: shared, disabled: pending }, "Audience retains switch semantics without radio/selected state");
    assert.equal(control.props.accessibilityLabel, shared ? modalCopy("community.checkIn.sharedNotice", { name: "Test community" }) : `${modalCopy("community.checkIn.privateOnly")}. ${modalCopy("community.checkIn.shareOptionLabel", { name: "Test community" })}`, "The accessible audience label follows each selection");
    assert.equal(destinationIcon.props.name, shared ? "users" : "lock", "Destination icons describe the audience instead of resembling an unselected radio");
    assert.deepEqual([destinationIcon.parent.props.accessibilityElementsHidden, destinationIcon.parent.props.accessible, destinationIcon.parent.props.importantForAccessibility], [true, false, "no-hide-descendants"], "Destination icons remain decorative");
    assert.equal(control.findByType("RoomImage").props.name, shared ? "Test community" : modalCopy("community.checkIn.privateJournal"));
    assert.ok(control.findAllByType("Text").some(node => node.props.children === (shared ? "Test community" : modalCopy("community.checkIn.privateJournal"))), "The visible destination title follows each selection");
    assert.equal(saveControl().props.children, modalCopy(pending ? "community.checkIn.saving" : shared ? "community.checkIn.shareAction" : "community.checkIn.savePrivateAction"));
    const reassuranceIcon = tree.root.findAllByType("Feather").find(node => node.props.size === 13);
    assert.equal(reassuranceIcon.props.name, shared ? "users" : "lock");
    assert.ok(reassuranceIcon.parent.parent.findAllByType("Text").some(node => node.props.children === modalCopy(shared ? "community.checkIn.sharedNotice" : "community.checkIn.privateNotice", shared ? { name: "Test community" } : undefined)), "Privacy reassurance matches the displayed audience and save action");
  };
  for (const [language, privateLabel, shareLabel, sharedNotice, privateTitle, sharedTitle, noteLabel] of [
    ["en", "Only you can see this", "Share with Test community", "This will be shared with Test community", "Check-in saved privately", "Check-in shared with Test community", "Add a few words (optional)"],
    ["sv", "Bara du kan se detta", "Dela med Test community", "Detta kommer att delas med Test community", "Incheckningen har sparats privat", "Incheckningen har delats med Test community", "Skriv några ord (valfritt)"],
  ]) {
    harness.localized = true;
    harness.language = language;
    for (const share of [false, true]) {
      const pending = deferred();
      let calls = 0, submission;
      modalProps = { ...modalDefaults, share, onSubmit: () => { calls++; return pending.promise; }, onShare: nextShare => { modalProps = { ...modalProps, share: nextShare }; tree.update(React.createElement(screens.RealCheckInModal, modalProps)); } };
      await act(async () => { tree = create(React.createElement(screens.RealCheckInModal, modalProps)); });
      assert.equal(audienceSwitch().props.accessibilityState.checked, share);
      assert.equal(audienceSwitch().props.accessibilityLabel, share ? sharedNotice : `${privateLabel}. ${shareLabel}`);
      assert.ok(entryStyle(audienceSwitch()).minHeight >= 44);
      assert.deepEqual(tree.root.findAll(node => ["TextInputField", "BibleVerseField"].includes(node.type) || node.type === "Pressable" && node.props.accessibilityRole === "switch").map(node => node.type === "Pressable" ? "audience" : node.type), ["audience", "TextInputField", "BibleVerseField"], "Audience is clear before optional words and Scripture");
      assert.equal(tree.root.findByType("TextInputField").props.accessibilityLabel, noteLabel);
      assertAudienceSelection(share);
      await act(() => audienceSwitch().props.onPress());
      assertAudienceSelection(!share);
      await act(() => audienceSwitch().props.onPress());
      assertAudienceSelection(share);
      await act(() => { submission = saveControl().props.onPress(); void tree.root.findByType("TextInputField").props.onSubmitEditing(); });
      assert.equal(calls, 1, "Same-render button/keyboard submissions share one in-flight guard");
      assert.equal(saveControl().props.disabled, true);
      assert.equal(audienceSwitch().props.disabled, true);
      assertAudienceSelection(share, true);
      await updateModal({ share: !share, roomName: "Changed community", step: "thanks" });
      assert.equal(hasDone(), false, "A pending thanks step must not claim success");
      assert.ok(renderedTree().includes(screens.translateMessage(language, "community.checkIn.saving")));
      await act(async () => { pending.resolve(); await submission; });
      assert.ok(renderedTree().includes(share ? sharedTitle : privateTitle), "Confirmation uses the successfully submitted audience snapshot");
      assert.ok(!renderedTree().includes("Changed community"), "Later community changes cannot rename the submission receipt");
      assert.equal(hasDone(), true);
      await updateModal({ visible: false });
      await updateModal({ visible: true, step: "choose" });
      await updateModal({ step: "thanks" });
      assert.equal(hasDone(), true, "Idle confirmation recovery keeps a way to exit");
      assert.ok(!renderedTree().includes(privateTitle) && !renderedTree().includes(sharedTitle), "Closing or starting fresh clears the old outcome receipt");
      await act(() => tree.unmount());
    }
  }
  delete harness.localized;
  delete harness.language;
  modalProps = { ...modalDefaults, step: "thanks", onSubmit() {} };
  await act(async () => { tree = create(React.createElement(screens.RealCheckInModal, modalProps)); });
  assert.equal(hasDone(), true, "A remounted idle thanks step permits recovery");
  assert.ok(renderedTree().includes("community.checkIn.completionBody") && !renderedTree().includes("community.checkIn.completionPrivateTitle") && !renderedTree().includes("community.checkIn.completionSharedTitle"), "Recovery makes no unverified saved/private/shared claim");
  await act(() => tree.unmount());
  const oldAttempt = deferred(), newAttempt = deferred(), retryAttempt = deferred();
  const attempts = [oldAttempt, newAttempt, retryAttempt];
  let attemptIndex = 0, oldSubmission, newSubmission, retrySubmission;
  modalProps = { ...modalDefaults, share: true, onSubmit: () => attempts[attemptIndex++].promise };
  await act(async () => { tree = create(React.createElement(screens.RealCheckInModal, modalProps)); });
  await act(() => { oldSubmission = saveControl().props.onPress(); });
  await updateModal({ visible: false });
  await updateModal({ visible: true, step: "choose", share: false });
  await updateModal({ step: "details" });
  await act(() => { newSubmission = saveControl().props.onPress(); });
  await act(async () => { oldAttempt.resolve(); await oldSubmission; });
  assert.equal(saveControl().props.disabled, true, "A stale completion cannot clear a newer attempt's in-flight state");
  await act(async () => { newAttempt.reject(new Error("save failed")); await newSubmission; });
  const saveError = tree.root.findAllByType("BodyText").find(node => node.props.accessibilityRole === "alert");
  assert.equal(saveError.props.accessibilityLiveRegion, "assertive");
  assert.ok(renderedTree().includes("community.checkIn.saveFailed"));
  assert.equal(saveControl().props.disabled, false, "Failure permits an explicit retry");
  await updateModal({ step: "thanks" });
  assert.equal(hasDone(), true, "A failed attempt can still exit the neutral thanks recovery");
  assert.ok(!renderedTree().includes("community.checkIn.completionPrivateTitle") && !renderedTree().includes("community.checkIn.completionSharedTitle"), "Neither failure nor an earlier session supplies a success receipt");
  await updateModal({ step: "details" });
  await act(() => { retrySubmission = saveControl().props.onPress(); });
  await act(async () => { retryAttempt.resolve(); await retrySubmission; });
  await updateModal({ step: "thanks" });
  assert.ok(renderedTree().includes("community.checkIn.completionPrivateTitle"), "A successful retry supplies its own private confirmation");
  assert.ok(!renderedTree().includes("community.checkIn.completionSharedTitle"));
  assert.equal(attemptIndex, 3);
  await act(() => tree.unmount());
  // Run both parent entry points with the actual modal, including fresh consent and blank notes.
  harness.realCheckInModal = true;
  for (const component of [screens.Home, screens.CheckIns]) {
    for (const share of [false, true]) {
      harness.state = baseState;
      harness.actions = [];
      await act(async () => { tree = create(React.createElement(component)); });
      const actualModal = () => tree.root.findByType(screens.RealCheckInModal);
      const openActual = () => component === screens.Home
        ? tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === "community.checkIn.promptTitle").props.onPress()
        : tree.root.findAllByType("PrimaryButton").find(node => node.props.children === "community.checkIns.action").props.onPress();
      await act(openActual);
      assert.equal(actualModal().props.share, false);
      await act(() => tree.root.findAll(node => node.type?.name === "MoodOptionCard")[0].props.onPress());
      assertAudienceSelection(false);
      await act(() => audienceSwitch().props.onPress());
      assert.equal(actualModal().props.share, true);
      assertAudienceSelection(true);
      await act(() => audienceSwitch().props.onPress());
      assertAudienceSelection(false);
      await act(() => audienceSwitch().props.onPress());
      assertAudienceSelection(true);
      await act(() => tree.root.findAllByType("IconButton").find(node => node.props.accessibilityLabel === "community.checkIn.back").props.onPress());
      await act(() => tree.root.findAllByType("IconButton").find(node => node.props.accessibilityLabel === "community.checkIn.back").props.onPress());
      await act(openActual);
      assert.equal(actualModal().props.share, false, "Reopening either actual entry point requires new sharing consent");
      await act(() => tree.root.findAll(node => node.type?.name === "MoodOptionCard")[0].props.onPress());
      assertAudienceSelection(false);
      if (share) await act(() => audienceSwitch().props.onPress());
      assertAudienceSelection(share);
      await act(async () => { await saveControl().props.onPress(); });
      assert.equal(harness.actions.at(-1).visibility, share ? "group" : "private");
      assert.equal(harness.actions.at(-1).reflectionText, "", "Words remain optional in both entry points");
      assert.equal(harness.actions.at(-1).mood, 4, "Actual mood conversion is retained");
      assert.equal(actualModal().props.step, "thanks");
      assert.ok(renderedTree().includes(share ? "community.checkIn.completionSharedTitle:Test community" : "community.checkIn.completionPrivateTitle"));
      await act(() => tree.root.findAllByType("PrimaryButton").find(node => node.props.children === "community.checkIn.done").props.onPress());
      assert.equal(actualModal().props.visible, false);
      assert.equal(actualModal().props.share, false, "Done resets audience to private");
      await act(() => tree.unmount());
    }
  }
  delete harness.realCheckInModal;
  // Completion never reveals today's private check-in; this list remains shared-only.
  const sharedBlank = { ...populatedState.checkIns[0], id: "shared-blank", userId: "sarah", reflectionText: "", createdAt: now };
  const ownPrivate = { ...sharedBlank, id: "own-private", userId: "reader", visibility: "private", reflectionText: "Private note must stay hidden" };
  const checkInsFixture = { ...prayerFixture, posts: [], checkIns: [sharedBlank, ownPrivate], privateCheckIns: [ownPrivate] };
  harness.state = checkInsFixture;
  harness.actions = [];
  await act(async () => { tree = create(React.createElement(screens.CheckIns)); });
  assert.deepEqual(cardIds(), ["shared-blank"]);
  assert.ok(cards().every(node => !node.props.overview), "Focused Check-ins retains its existing card shell");
  assert.equal(card("shared-blank").props.bodyContent, undefined, "A shared check-in may contain only its mood");
  assert.ok(renderedTree().includes("community.checkIns.completedToday"));
  assert.ok(!renderedTree().includes(ownPrivate.reflectionText));
  assert.ok(!tree.root.findAllByType("PrimaryButton").some(node => node.props.children === "community.checkIns.action"));
  assert.ok(!renderedTree().includes("community.checkIn.sharedWithCommunity") && !renderedTree().includes("community.checkIn.privateOnly"), "Completed landing copy must not infer the saved audience");
  for (const reacted of [false, true]) {
    if (reacted) {
      harness.state = { ...checkInsFixture, postReactions: [{ id: "encouraged", userId: "reader", targetType: "check_in", targetId: sharedBlank.id, kind: "reflection", createdAt: now }] };
      await act(() => tree.update(React.createElement(screens.CheckIns)));
    }
    const encourage = card("shared-blank").find(node => node.type?.name === "CommunityCardAction");
    assert.equal(encourage.props.active, reacted);
    await act(() => encourage.props.onPress());
    assert.deepEqual(harness.actions.at(-1), { type: "togglePostReaction", targetType: "check_in", targetId: sharedBlank.id, kind: "reflection", mode: "ensure" }, "Repeated encouragement retains participation instead of toggling it off");
    await act(() => tree.root.findByType("WrittenEncouragementComposer").props.onDismiss());
  }
  assert.ok(harness.actions.every(action => action.type === "togglePostReaction"), "Encouraging without optional words does not create a reply");
  await act(() => press(tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === "community.feed.viewMoreEarlier")));
  assert.deepEqual(harness.actions.at(-1), { type: "loadOlderCommunityContent" });
  harness.state = { ...harness.state, communityContentLoadingMore: true };
  await act(() => tree.update(React.createElement(screens.CheckIns)));
  assert.equal(tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === "community.feed.viewMoreEarlier").props.disabled, true);
  harness.state = { ...harness.state, communityContentHasMore: false };
  await act(() => tree.update(React.createElement(screens.CheckIns)));
  assert.ok(!tree.root.findAllByType("Pressable").some(node => node.props.accessibilityLabel === "community.feed.viewMoreEarlier"));
  for (const [language, completed, sharedList] of [
    ["en", "You've checked in today. You can still encourage someone.", "Shared check-ins"],
    ["sv", "Du har checkat in i dag. Du kan fortfarande uppmuntra någon.", "Delade incheckningar"],
  ]) {
    harness.localized = true;
    harness.language = language;
    await act(() => tree.update(React.createElement(screens.CheckIns)));
    assert.ok(renderedTree().includes(completed) && renderedTree().includes(sharedList), "Completed and shared-only landing copy is localized");
  }
  delete harness.localized;
  delete harness.language;
  await act(() => tree.unmount());
  // Exercise the actual managed composer controls independently of its parent.
  // Legacy journal callers omit `submission`, retaining their existing behavior.
  for (const language of ["en", "sv"]) {
    harness.localized = true;
    harness.language = language;
    const events = [];
    let managedProps = {
      visible: true, context: "room", editing: false, kind: "prayer_request", entryVisibility: "room",
      body: "Draft body", title: "Draft title", verses: [{ reference: "Psalm 23:1", text: "The Lord is my shepherd." }], roomName: "Test community",
      submission: { status: "pending", inFlight: true },
      onBody: value => events.push(["body", value]), onTitle: value => events.push(["title", value]),
      onKind: value => events.push(["kind", value]), onVerses: value => events.push(["verses", value]),
      onVisibility: value => events.push(["visibility", value]), onOpenVerseInBible: () => events.push(["openBible"]),
      onClose: () => events.push(["close"]), onSubmit: () => events.push(["submit"]),
    };
    const updateManaged = async changes => {
      managedProps = { ...managedProps, ...changes };
      await act(() => tree.update(React.createElement(screens.RealComposer, managedProps)));
    };
    await act(async () => { tree = create(React.createElement(screens.RealComposer, managedProps)); });
    const managedSave = () => tree.root.findByType("PrimaryButton");
    const managedBody = () => tree.root.findAllByType("TextInputField").find(node => node.props.multiline);
    const managedTitle = () => tree.root.findAllByType("TextInputField").find(node => !node.props.multiline);
    const managedSelector = () => tree.root.find(node => node.type?.name === "CommunityTypeSelector");
    const managedFeedback = () => tree.root.findAllByType("View").find(node => node.props.accessibilityRole === "progressbar" || node.props.accessibilityRole === "alert");
    const assertManagedLock = () => {
      assert.equal(managedBody().props.editable, false);
      assert.equal(managedTitle().props.editable, false);
      assert.equal(managedSelector().props.disabled, true);
      assert.ok(managedSelector().findAllByType("Pressable").every(node => node.props.disabled && node.props.accessibilityState.disabled));
      const scripture = tree.root.findByType("BibleVerseField");
      let scriptureWrapper = scripture.parent;
      while (scriptureWrapper && scriptureWrapper.props.pointerEvents === undefined) scriptureWrapper = scriptureWrapper.parent;
      assert.equal(scriptureWrapper?.props.pointerEvents, "none");
      assert.equal(scriptureWrapper?.props.accessibilityElementsHidden, true);
    };
    assertManagedLock();
    assert.equal(managedSave().props.disabled, true);
    assert.equal(managedFeedback().props.accessibilityRole, "progressbar");
    assert.deepEqual(managedFeedback().props.accessibilityState, { busy: true });
    assert.equal(managedFeedback().props.accessibilityLabel, screens.translateMessage(language, "community.composer.submission.pending"));
    await act(() => {
      managedBody().props.onChangeText("Changed body");
      managedTitle().props.onChangeText("Changed title");
      managedSelector().props.onChange("praise");
      tree.root.findByType("BibleVerseField").props.onChange([]);
      tree.root.findByType("BibleVerseField").props.onOpenInBible(managedProps.verses[0]);
      tree.root.findByType("IconButton").props.onPress();
      tree.root.findByType("FullScreenModal").props.onRequestClose();
      managedBody().props.onSubmitEditing();
      managedSave().props.onPress();
    });
    assert.deepEqual(events, [], "Pending callbacks remain guarded even if invoked programmatically");
    await updateManaged({ submission: { status: "unknown", inFlight: true } });
    assertManagedLock();
    assert.equal(managedSave().props.disabled, true, "A timed-out operation still in flight cannot overlap with a retry");
    assert.equal(managedFeedback().props.accessibilityLabel, screens.translateMessage(language, "community.composer.submission.waiting"));
    await updateManaged({ submission: { status: "unknown", inFlight: false } });
    assertManagedLock();
    assert.equal(managedFeedback().props.accessibilityRole, "alert");
    assert.deepEqual(managedFeedback().props.accessibilityState, { busy: false });
    assert.equal(managedFeedback().props.accessibilityLabel, screens.translateMessage(language, "community.composer.submission.unknown"));
    assert.equal(managedSave().props.disabled, false);
    assert.equal(managedSave().props.children, screens.translateMessage(language, "community.composer.submission.retryOriginal"));
    await act(() => { tree.root.findByType("IconButton").props.onPress(); managedBody().props.onChangeText("New draft"); managedSave().props.onPress(); });
    assert.deepEqual(events, [["submit"]], "An uncertain attempt permits only explicit original-attempt retry");
    await updateManaged({ submission: { status: "failure", inFlight: false } });
    assert.equal(managedFeedback().props.accessibilityRole, "alert");
    assert.equal(managedFeedback().props.accessibilityLabel, screens.translateMessage(language, "community.composer.submission.failure"));
    assert.equal(managedBody().props.value, "Draft body");
    assert.equal(managedTitle().props.value, "Draft title");
    assert.deepEqual(tree.root.findByType("BibleVerseField").props.verses, managedProps.verses);
    assert.notEqual(managedBody().props.editable, false);
    await act(() => tree.root.findByType("IconButton").props.onPress());
    assert.deepEqual(events.at(-1), ["close"], "A confirmed failure releases cancellation");
    await act(() => tree.unmount());
  }
  delete harness.localized;
  delete harness.language;
  // Mount real parent and composer together. Dispatch acknowledgements are
  // deferred explicitly; no Firebase or emulator code is imported by this path.
  harness.realComposer = true;
  const submissionOperations = [];
  let pendingPrivateOperation;
  harness.dispatch = action => {
    if (action.type === "createJournalEntry" && pendingPrivateOperation) {
      pendingPrivateOperation.action = action;
      return pendingPrivateOperation.promise;
    }
    if (!action.communitySubmission) return;
    const pending = deferred();
    const operation = { action, ...pending };
    submissionOperations.push(operation);
    return pending.promise.then(outcome => {
      if (outcome !== undefined) action.communitySubmission.report(outcome);
    });
  };
  const actualComposer = () => tree.root.findByType(screens.RealComposer);
  const actualSave = () => actualComposer().findByType("PrimaryButton");
  const actualBody = () => actualComposer().findAllByType("TextInputField").find(node => node.props.multiline);
  const shareFromOverview = () => tree.root.findAllByType("PrimaryButton").find(node => node.props.children === "community.feed.share").props.onPress();
  const composerDraft = () => {
    const { kind, title, body, verses, entryVisibility, editing } = actualComposer().props;
    return { kind, title, body, verses, entryVisibility, editing };
  };
  const fillCommunityDraft = async (body = "Complete retained draft") => {
    await act(() => actualComposer().props.onKind("prayer_request"));
    await act(() => {
      actualComposer().props.onTitle("Retained title");
      actualComposer().props.onBody(body);
      actualComposer().props.onVerses([{ reference: "Psalm 23:1", text: "The Lord is my shepherd." }]);
    });
  };
  const nativeSetTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
  const confirmationTimers = new Set();
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay !== 15_000) return nativeSetTimeout(callback, delay, ...args);
    const timer = { callback: () => callback(...args) };
    confirmationTimers.add(timer);
    return timer;
  };
  globalThis.clearTimeout = timer => confirmationTimers.has(timer) ? confirmationTimers.delete(timer) : nativeClearTimeout(timer);
  try {
    harness.state = { ...overviewState, posts: [{ ...overviewState.posts[0], userId: "reader" }, ...overviewState.posts.slice(1)] };
    harness.actions = [];
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    await act(shareFromOverview);
    await fillCommunityDraft();
    const draft = composerDraft();
    const oldIdleHandlers = actualComposer().props;
    let submission;
    await act(() => {
      submission = actualSave().props.onPress();
      void actualBody().props.onSubmitEditing();
      void oldIdleHandlers.onSubmit();
    });
    assert.equal(submissionOperations.length, 1, "Same-render footer, keyboard and parent callback events start one operation");
    assert.deepEqual(actualComposer().props.submission, { status: "pending", inFlight: true });
    const pendingHandlers = actualComposer().props;
    await act(() => {
      pendingHandlers.onClose();
      pendingHandlers.onBody("Accidental body change");
      pendingHandlers.onTitle("Accidental title change");
      pendingHandlers.onKind("praise");
      pendingHandlers.onVerses([]);
      pendingHandlers.onVisibility("private");
      shareFromOverview();
      overviewEntry(overviewEntryLabels.prayer).props.onPress();
    });
    assert.equal(actualComposer().props.visible, true);
    assert.deepEqual(composerDraft(), draft, "Parent guards protect every draft field and conflicting launch while pending");
    assert.equal(tree.root.findAll(node => node.type?.name === "CommunityPrayerScreen").length, 0, "Pending submission blocks conflicting navigation");
    await act(async () => { submissionOperations[0].resolve({ status: "failure", reason: "rejected" }); await submission; });
    assert.equal(actualComposer().props.visible, true);
    assert.deepEqual(composerDraft(), draft, "Confirmed failure preserves all data without reopening or resetting");
    assert.deepEqual(actualComposer().props.submission, { status: "failure", inFlight: false });
    await act(() => { submission = actualSave().props.onPress(); });
    await act(async () => { submissionOperations[1].resolve({ status: "success" }); await submission; });
    assert.equal(actualComposer().props.visible, false, "Only a confirmed success closes the originating composer");
    assert.equal(actualComposer().props.body, "");
    assert.equal(actualComposer().props.title, "");
    assert.deepEqual(actualComposer().props.verses, []);
    await act(shareFromOverview);
    await fillCommunityDraft("New session draft");
    const newSessionDraft = composerDraft();
    await act(() => { oldIdleHandlers.onBody("Stale body"); oldIdleHandlers.onClose(); void oldIdleHandlers.onSubmit(); });
    assert.deepEqual(composerDraft(), newSessionDraft, "A previous session's callbacks cannot change or submit the new composer");
    assert.equal(actualComposer().props.visible, true);
    assert.equal(submissionOperations.length, 2);
    const cancelledSessionHandlers = actualComposer().props;
    await act(() => cancelledSessionHandlers.onClose());
    await act(shareFromOverview);
    await fillCommunityDraft("After cancel/reopen");
    const afterCancel = composerDraft();
    await act(() => { cancelledSessionHandlers.onBody("Stale cancellation draft"); cancelledSessionHandlers.onClose(); void cancelledSessionHandlers.onSubmit(); });
    assert.deepEqual(composerDraft(), afterCancel);
    assert.equal(actualComposer().props.visible, true, "Close/reopen invalidates the old handlers synchronously");

    await act(() => { submission = actualSave().props.onPress(); });
    const unknownOperation = submissionOperations.at(-1);
    const frozenAction = { ...unknownOperation.action, communitySubmission: { ...unknownOperation.action.communitySubmission } };
    await act(() => [...confirmationTimers].at(-1).callback());
    assert.deepEqual(actualComposer().props.submission, { status: "unknown", inFlight: true });
    const operationCount = submissionOperations.length;
    await act(() => { void actualSave().props.onPress(); void actualBody().props.onSubmitEditing(); actualComposer().props.onClose(); });
    assert.equal(submissionOperations.length, operationCount, "Loss of timely confirmation never releases an overlapping retry");
    await act(async () => { unknownOperation.resolve({ status: "unknown", reason: "transport" }); await submission; });
    assert.deepEqual(actualComposer().props.submission, { status: "unknown", inFlight: false });
    await act(() => { actualComposer().props.onBody("Changed uncertain text"); actualComposer().props.onClose(); });
    assert.deepEqual(composerDraft(), afterCancel);
    assert.equal(actualComposer().props.visible, true);
    await act(() => { submission = actualSave().props.onPress(); });
    const retryOperation = submissionOperations.at(-1);
    assert.equal(retryOperation.action.communitySubmission.attemptId, frozenAction.communitySubmission.attemptId);
    assert.equal(retryOperation.action.communitySubmission.createdAt, frozenAction.communitySubmission.createdAt);
    assert.equal(retryOperation.action.communitySubmission.previouslyUnknown, true);
    for (const field of ["type", "body", "title", "kind", "verse", "verses", "id"]) assert.deepEqual(retryOperation.action[field], frozenAction[field], `Uncertain retry preserves ${field}`);
    await act(async () => { retryOperation.resolve({ status: "success" }); await submission; });
    assert.equal(actualComposer().props.visible, false);

    // Resolving dispatch without a report is a broken/legacy boundary, not success.
    await act(shareFromOverview);
    await fillCommunityDraft("No acknowledgement draft");
    await act(() => { submission = actualSave().props.onPress(); });
    await act(async () => { submissionOperations.at(-1).resolve(undefined); await submission; });
    assert.equal(actualComposer().props.visible, true);
    assert.equal(actualComposer().props.submission.status, "unknown");
    await act(() => { submission = actualSave().props.onPress(); });
    await act(async () => { submissionOperations.at(-1).resolve({ status: "success" }); await submission; });
    await act(() => tree.unmount());

    // Scope changes hide, rather than transplant, the old account/community draft.
    for (const change of [{ currentUserId: "another-reader" }, { currentGroupId: "another-room", communityFeedGroupId: "another-room" }]) {
      harness.state = { ...overviewState, groups: [...overviewState.groups, { id: "another-room", name: "Other community", ownerId: "reader" }] };
      await act(async () => { tree = create(React.createElement(screens.Overview)); });
      await act(shareFromOverview);
      await fillCommunityDraft("Original scope retained words");
      const originalScopeDraft = composerDraft();
      const originalHandlers = actualComposer().props;
      let originalSubmission;
      await act(() => { originalSubmission = actualSave().props.onPress(); });
      const originalOperation = submissionOperations.at(-1);
      const originalState = harness.state;
      harness.state = { ...originalState, ...change };
      await act(() => tree.update(React.createElement(screens.Overview)));
      assert.equal(actualComposer().props.visible, false);
      await act(shareFromOverview);
      assert.equal(actualComposer().props.body, "", "A new account/community never receives the previous scope's draft");
      await fillCommunityDraft("New scope words");
      const changedScopeDraft = composerDraft();
      await act(() => { originalHandlers.onBody("Stale scope update"); originalHandlers.onClose(); void originalHandlers.onSubmit(); });
      assert.deepEqual(composerDraft(), changedScopeDraft);
      await act(async () => { originalOperation.resolve({ status: "unknown", reason: "session" }); await originalSubmission; });
      assert.deepEqual(composerDraft(), changedScopeDraft, "Old completion cannot clear or overwrite the currently visible scope");
      assert.equal(actualComposer().props.visible, true);
      harness.state = originalState;
      await act(() => tree.update(React.createElement(screens.Overview)));
      await act(shareFromOverview);
      assert.deepEqual(composerDraft(), originalScopeDraft, "Returning to the same scope resumes its unresolved original attempt");
      assert.deepEqual(actualComposer().props.submission, { status: "unknown", inFlight: false });
      await act(() => { submission = actualSave().props.onPress(); });
      const resumedOperation = submissionOperations.at(-1);
      assert.equal(resumedOperation.action.communitySubmission.attemptId, originalOperation.action.communitySubmission.attemptId);
      assert.equal(resumedOperation.action.body, originalOperation.action.body);
      await act(async () => { resumedOperation.resolve({ status: "success" }); await submission; });
      assert.equal(actualComposer().props.visible, false);
      await act(() => tree.unmount());
    }

    const ownPost = { ...overviewState.posts[0], id: "own-edit", userId: "reader", kind: "prayer_request", title: "Original request title", body: "Original request body" };
    harness.state = { ...overviewState, posts: [ownPost], checkIns: [] };
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    await act(() => tree.root.find(node => node.type?.name === "PrayerRequestCard" && node.props.item.id === ownPost.id).props.onEdit());
    assert.equal(actualComposer().props.editing, true);
    await act(() => { actualComposer().props.onTitle("Edited title"); actualComposer().props.onBody("Edited request body"); });
    const editDraft = composerDraft();
    await act(() => { submission = actualSave().props.onPress(); });
    const editOperation = submissionOperations.at(-1);
    assert.equal(editOperation.action.type, "editPost");
    assert.equal(editOperation.action.id, ownPost.id);
    assert.deepEqual(editOperation.action.communitySubmission.baseline, { type: "post", ...ownPost }, "Editing submits the original feed-item baseline for conflict detection");
    await act(async () => { editOperation.resolve({ status: "failure", reason: "conflict" }); await submission; });
    assert.equal(actualComposer().props.visible, true);
    assert.deepEqual(composerDraft(), editDraft, "An edit conflict keeps the complete editing draft");
    await act(() => { submission = actualSave().props.onPress(); });
    await act(async () => { submissionOperations.at(-1).resolve({ status: "success" }); await submission; });
    assert.equal(actualComposer().props.visible, false);
    await act(() => tree.unmount());

    harness.state = overviewState;
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    await act(shareFromOverview);
    await fillCommunityDraft("Unmounted operation words");
    const beforeUnmountDraft = composerDraft();
    let unmountedSubmission;
    await act(() => { unmountedSubmission = actualSave().props.onPress(); });
    const unmountedOperation = submissionOperations.at(-1);
    await act(() => tree.unmount());
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    await act(shareFromOverview);
    assert.deepEqual(composerDraft(), beforeUnmountDraft, "Remounting restores the original pending draft instead of opening a fresh-ID session");
    assert.deepEqual(actualComposer().props.submission, { status: "pending", inFlight: true });
    const beforeRemountRetryCount = submissionOperations.length;
    await act(() => { void actualSave().props.onPress(); actualComposer().props.onBody("Replacement attempt"); });
    assert.equal(submissionOperations.length, beforeRemountRetryCount, "A remounted pending attempt still rejects overlapping submission");
    await act(() => [...confirmationTimers].at(-1).callback());
    assert.deepEqual(actualComposer().props.submission, { status: "unknown", inFlight: true }, "The original timer reports uncertainty to the reattached view");
    await act(async () => { unmountedOperation.resolve({ status: "unknown", reason: "transport" }); await unmountedSubmission; });
    assert.deepEqual(actualComposer().props.submission, { status: "unknown", inFlight: false });
    await act(() => tree.unmount());
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    await act(shareFromOverview);
    assert.equal(actualComposer().props.visible, true);
    assert.deepEqual(composerDraft(), beforeUnmountDraft);
    assert.deepEqual(actualComposer().props.submission, { status: "unknown", inFlight: false });
    await act(() => { submission = actualSave().props.onPress(); });
    const remountedRetry = submissionOperations.at(-1);
    assert.equal(remountedRetry.action.communitySubmission.attemptId, unmountedOperation.action.communitySubmission.attemptId);
    assert.equal(remountedRetry.action.communitySubmission.previouslyUnknown, true);
    assert.equal(remountedRetry.action.body, unmountedOperation.action.body);
    await act(async () => { remountedRetry.resolve({ status: "success" }); await submission; });
    assert.equal(actualComposer().props.visible, false);
    await act(() => tree.unmount());

    // Private Scripture reflection keeps its legacy journal route and audience.
    harness.state = densityFixture;
    harness.actions = [];
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    await act(() => press(actionNodes("scripture")[0].findByType("Pressable")));
    assert.equal(actualComposer().props.context, "journal");
    assert.equal(actualComposer().props.entryVisibility, "private");
    assert.equal(actualComposer().props.submission, undefined);
    await act(() => actualComposer().props.onBody("Private reflection"));
    await act(async () => { await actualSave().props.onPress(); });
    assert.equal(harness.actions.at(-1).type, "createJournalEntry");
    assert.equal(harness.actions.at(-1).shareWithGroup, false);
    assert.equal(harness.actions.at(-1).communitySubmission, undefined);
    assert.equal(actualComposer().props.visible, false);
    await act(() => tree.unmount());

    harness.state = densityFixture;
    pendingPrivateOperation = deferred();
    await act(async () => { tree = create(React.createElement(screens.Overview)); });
    await act(() => press(actionNodes("scripture")[0].findByType("Pressable")));
    await act(() => actualComposer().props.onBody("Private save in the original session"));
    let privateSubmission;
    await act(() => { privateSubmission = actualSave().props.onPress(); });
    assert.equal(pendingPrivateOperation.action.type, "createJournalEntry");
    assert.equal(pendingPrivateOperation.action.shareWithGroup, false);
    await act(() => actualComposer().props.onClose());
    await act(shareFromOverview);
    await fillCommunityDraft("New Community draft while private save settles");
    const privateStaleDraft = composerDraft();
    await act(async () => { pendingPrivateOperation.resolve(); await privateSubmission; });
    assert.equal(actualComposer().props.visible, true);
    assert.deepEqual(composerDraft(), privateStaleDraft, "A late legacy private save cannot clear a different room composer session");
    pendingPrivateOperation = undefined;
    await act(() => actualComposer().props.onClose());
    await act(() => tree.unmount());
    assert.equal(confirmationTimers.size, 0, "Every completed/unmounted operation clears its confirmation timer");
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
    delete harness.realComposer;
    delete harness.dispatch;
  }
  console.log("Actual check-in modal passed: audience order/labels, optional words, deferred private/shared receipts, double-submit/failure/retry/stale-session guards, both entry points, shared-only completed landing and repeat encouragement.");
  console.log("Saved check-ins passed: completed Home audience/link, delete/reset, private edit lock and shared reverse-transition lock.");
  console.log("Check-in privacy passed: Home and Community initial/reset/private/group submission handlers.");
  console.log("Prayer hierarchy passed: focused request actions, target/cancel/skip/complete/repeat contracts, personal prayer, request composer, filters/states/pagination, overview opt-in, and EN/SV counts/empty/action copy.");
  console.log("Community navigation passed: translated balanced Prayer requests/Check-ins cards, personal prayer within Prayer, Recent/Reflections and Share, stale filter fallback, iOS/Android filter/scroll and Back, dedicated page/content/empty/loading/error/offline rendering.");
  console.log("Feed card density passed: overview opt-in, one author avatar and primary action, secondary prayer, nonzero response counts, mood and Scripture, and explicit history reveal.");
  console.log("Managed Community composer passed: EN/SV pending and unknown feedback, locked draft/close/picker controls, explicit retry-only uncertainty and preserved failure drafts.");
  console.log("Community parent submission passed: synchronous duplicate guard, failure/success drafts, timeout uncertainty, stable retry, stale callbacks, scoped draft recovery and unchanged private Scripture reflection.");
} finally {
  if (tree) await act(() => tree.unmount());
  await rm(directory, { recursive: true, force: true });
  delete globalThis.__communityNavigation;
}
