import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { StackRouter } from "@react-navigation/routers";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(tmpdir(), "koino-onboarding-routing-"));
const auth = { app: { options: { projectId: "demo-koino" } }, currentUser: null };
const markerKey = (uid) => `e2ee.onboarding.v1.demo-koino.${uid}`;
const fixture = globalThis.__onboardingRouting = {
  auth,
  authListeners: new Set(),
  beforeAuthListeners: new Set(),
  accounts: new Map(),
  legacyProfiles: new Set(),
  legacyProfileGates: new Map(),
  storeListeners: new Set(),
  dimensionListeners: new Set(),
  os: "ios",
  windowDimensions: { width: 320, height: 568, fontScale: 1, scale: 3 },
  recoveryKey: `aB0-_${"x".repeat(32)}Ab-_9Z`,
  state: { authReady: true },
  storage: new Map(),
  readGates: new Map(),
  writeGates: new Map(),
  encryption: new Map(),
  confirmationGates: new Map(),
  confirmationErrors: new Map(),
  createdCommunities: new Map(),
  migrated: new Set(),
  migrations: [],
  writes: [],
  generation: 0,
  stackRouter: StackRouter({ initialRouteName: "index" }),
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function publish(uid, email) {
  auth.currentUser = uid ? { uid, email } : null;
  fixture.state = { authReady: true, currentUserId: uid };
  fixture.authListeners.forEach((listener) => listener(auth.currentUser));
  fixture.storeListeners.forEach((listener) => listener());
}
fixture.publish = publish;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const mocks = {
  "react-native": `
    import { useSyncExternalStore } from "react";
    const h = globalThis.__onboardingRouting;
    function subscribe(listener) {
      h.dimensionListeners.add(listener);
      return () => h.dimensionListeners.delete(listener);
    }
    export const useWindowDimensions = () => useSyncExternalStore(subscribe, () => h.windowDimensions);
    export const Platform = { get OS() { return h.os; }, select: values => values[h.os] ?? values.default };
    export const View = "View", Text = "Text", Pressable = "Pressable", ScrollView = "ScrollView";
    export const TextInput = "TextInput", ActivityIndicator = "ActivityIndicator";
    export const StyleSheet = { create: styles => styles };
  `,
  "react-native-safe-area-context": "export const useSafeAreaInsets = () => ({ top: 44, bottom: 34, left: 0, right: 0 });",
  "expo-router": `
    import React, { useEffect, useLayoutEffect, useReducer, useRef } from "react";
    const h = globalThis.__onboardingRouting;
    const Screen = () => null, Protected = () => null;
    const Route = "Route";
    const routeName = href => href === "/" ? "index" : href.slice(1);
    export function Redirect({ href }) {
      useEffect(() => { h.navigate("REPLACE", routeName(href)); }, [href]);
      return null;
    }
    export const router = { back: () => h.navigate("GO_BACK") };
    export const Stack = Object.assign(function StackFixture({ children, screenLayout }) {
      const routeNames = [];
      function collect(elements, allowed = true) {
        React.Children.forEach(elements, element => {
          if (element?.type === Screen && allowed) routeNames.push(element.props.name);
          if (element?.type === Protected) collect(element.props.children, allowed && element.props.guard);
        });
      }
      collect(children);
      const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
      const previous = useRef(null);
      const [, refresh] = useReducer(count => count + 1, 0);
      let state = previous.current;
      if (!state) {
        state = h.stackRouter.getInitialState(options);
        if (h.initialRoute) {
          state = h.stackRouter.getStateForAction(state, { type: "PUSH", payload: { name: h.initialRoute } }, options) ?? state;
        }
      } else if (state.routeNames.join() !== routeNames.join()) {
        state = h.stackRouter.getStateForRouteNamesChange(state, { ...options, routeKeyChanges: [] });
      }
      useLayoutEffect(() => {
        previous.current = state;
        h.initialRoute = undefined;
        h.routeNames = routeNames;
        h.history = state.routes.map(route => route.name);
        h.navigate = (type, name) => {
          const next = h.stackRouter.getStateForAction(previous.current, { type, payload: { name } }, options);
          if (!next) return false;
          previous.current = next;
          refresh();
          return true;
        };
        return () => { delete h.navigate; delete h.routeNames; delete h.history; };
      });
      const current = state.routes[state.index];
      const content = h.renderRoute(current.name);
      return <Route key={current.key} name={current.name}>{screenLayout ? screenLayout({ children: content }) : content}</Route>;
    }, { Screen, Protected });
  `,
  "expo-font": "export const useFonts = () => [true];",
  "expo-status-bar": "export const StatusBar = () => null;",
  "react-native-gesture-handler": "export const GestureHandlerRootView = ({ children }) => children;",
  "@/features/bible-audio/provider": "export const BibleAudioProvider = ({ children }) => children;",
  "@/features/bible-database-provider": "export const BibleDatabaseProvider = ({ children }) => children;",
  "@/features/startup-performance": "",
  "@/ui/notification-runtime": "export const NotificationRuntime = 'Notifications';",
  "@/ui/emulator-badge": "export const EmulatorBadge = () => null;",
  "@/ui/use-reduced-motion": "export const useReducedMotion = () => false;",
  "@/features/onboarding-screen": "export const OnboardingScreen = 'Login';",
  "@/features/onboarding-journey": `
    import { useOnboardingProgress } from "@/ui/onboarding-progress";
    const Journey = "Journey";
    export function OnboardingJourney({ userId }) {
      const { chooseJourney } = useOnboardingProgress();
      return <Journey userId={userId} choose={journey => chooseJourney(userId, journey)} />;
    }
  `,
  "@/features/onboarding-guide": `
    import { useOnboardingProgress } from "@/ui/onboarding-progress";
    const Guide = "Guide";
    export function OnboardingGuide({ userId, journey }) {
      const { complete } = useOnboardingProgress();
      return <Guide userId={userId} journey={journey} complete={() => complete(userId)} />;
    }
  `,
  "@/state/store/firebase": "export const auth = globalThis.__onboardingRouting.auth;",
  "@/state/store/profile-operations": `
    const h = globalThis.__onboardingRouting;
    export const hasOnboardingCommunity = async (uid, groupId) => h.createdCommunities.get(uid) === groupId;
    export async function hasLegacyOnboardingProfile(uid) {
      await h.legacyProfileGates.get(uid)?.promise;
      return h.legacyProfiles.has(uid);
    }
  `,
  "@firebase/auth": `
    const h = globalThis.__onboardingRouting;
    export function beforeAuthStateChanged(auth, listener) {
      if (auth !== h.auth) throw new Error("Unexpected auth instance");
      h.beforeAuthListeners.add(listener);
      return () => h.beforeAuthListeners.delete(listener);
    }
    async function publishUser(user) {
      for (const listener of h.beforeAuthListeners) await listener(user);
      h.persistedUser = user;
      h.publish(user.uid, user.email);
      return { user };
    }
    export async function createUserWithEmailAndPassword(_auth, email, password) {
      if (h.accounts.has(email)) throw new Error("Duplicate fixture account");
      const user = { uid: "interrupted-registration", email };
      h.accounts.set(email, { user, password });
      if (h.interruptSignup) throw new Error("Auth interrupted after server commit");
      return publishUser(user);
    }
    export async function signInWithEmailAndPassword(_auth, email, password) {
      const account = h.accounts.get(email);
      if (!account || account.password !== password) throw new Error("Unknown fixture account");
      return publishUser(account.user);
    }
  `,
  "firebase/auth": `
    const h = globalThis.__onboardingRouting;
    export function onAuthStateChanged(_auth, listener) {
      h.authListeners.add(listener);
      queueMicrotask(() => { if (h.authListeners.has(listener)) listener(h.auth.currentUser); });
      return () => h.authListeners.delete(listener);
    }
    export const signOut = async () => h.publish();
  `,
  "@/state/koino-store": `
    import { useSyncExternalStore } from "react";
    const h = globalThis.__onboardingRouting;
    const subscribe = listener => { h.storeListeners.add(listener); return () => h.storeListeners.delete(listener); };
    const snapshot = () => h.state;
    const dispatch = async ({ type }) => { if (type === "signOut") h.publish(); };
    const StoreProvider = "StoreProvider";
    export const KoinoProvider = ({ children }) => <StoreProvider>{children}</StoreProvider>;
    export const useKoinoFields = () => useSyncExternalStore(subscribe, snapshot, snapshot);
    export const useKoinoActions = () => ({ dispatch });
    export const useKoino = () => ({ state: useKoinoFields(), dispatch });
  `,
  "@/state/encryption/database": "export const encodeAt = (_path, value) => value;",
  "@/state/supabase-storage": "export const clearEncryptedImages = () => {};",
  "@/state/encryption/session": `
    const h = globalThis.__onboardingRouting;
    const identity = { signingPublicKey: "fixture-public-key" };
    export function session() {
      if (!h.sessionUid || h.sessionUid !== h.auth.currentUser?.uid) throw new Error("Account not unlocked");
      return { uid: h.sessionUid, vault: { identity }, device: { id: "fixture-device" } };
    }
    export const sessionGeneration = () => h.generation;
    export function lockSession() { h.generation++; h.sessionUid = undefined; }
    export async function unlockExisting(uid) {
      lockSession();
      const phase = h.encryption.get(uid) ?? "setup";
      if (phase === "ready") h.sessionUid = uid;
      return phase;
    }
    export async function draftAccount(uid) {
      const key = "e2ee.draft." + uid;
      if (!h.storage.has(key)) h.storage.set(key, JSON.stringify({ uid, recoveryKey: h.recoveryKey }));
      return JSON.parse(h.storage.get(key));
    }
    export async function confirmAccount({ uid }) {
      if (h.confirmationErrors.has(uid)) throw h.confirmationErrors.get(uid);
      const generation = h.generation;
      h.encryption.set(uid, "ready");
      await h.confirmationGates.get(uid)?.promise;
      if (h.generation !== generation || h.auth.currentUser?.uid !== uid) return;
      await unlockExisting(uid);
      h.storage.delete("e2ee.draft." + uid);
    }
    export async function recoverAccount(uid) { await h.recover?.(uid); }
    export function listenRaw(_path, listener) {
      listener({ signingPublicKey: identity.signingPublicKey, devices: { "fixture-device": { active: true } } });
      return () => {};
    }
    export const identityRotationInProgress = () => false;
    export const crypto = {}, requestDeviceApproval = async () => "fixture", approveDevice = async () => {};
    export const approveGroupMember = async () => {}, rejectGroupJoinRequest = async () => {}, rotateGroup = async () => {}, draftRevocation = async () => {}, revokeDevice = async () => {};
  `,
  "@/state/encryption/migration": `
    const h = globalThis.__onboardingRouting;
    export const personalMigrationComplete = async () => h.migrated.has(h.sessionUid);
    export async function migratePersonal(_progress, signupName) {
      h.migrations.push({ uid: h.sessionUid, signupName });
      h.migrated.add(h.sessionUid);
    }
    export const migrateOwnedGroups = async () => {};
  `,
  "@/state/encryption/local-storage": `
    const h = globalThis.__onboardingRouting;
    export default {
      async getItem(key) { await h.readGates.get(key)?.promise; return h.storage.get(key) ?? null; },
      async setItem(key, value) {
        await h.writeGates.get(key)?.promise;
        h.writes.push({ key, value });
        h.storage.set(key, value);
      },
    };
  `,
  "@/ui/app-components": "export const AppScreen = 'AppScreen', BodyText = 'BodyText', PrimaryButton = 'PrimaryButton';",
  "@/ui/confirm": "export const confirmAction = () => {};",
};
for (const [family, weight] of [
  ["inter", "400Regular"], ["inter", "500Medium"], ["montserrat", "300Light"], ["montserrat", "400Regular"],
  ["montserrat", "500Medium"], ["montserrat", "600SemiBold"],
]) {
  const name = family[0].toUpperCase() + family.slice(1);
  mocks[`@expo-google-fonts/${family}/${weight}`] = `export const ${name}_${weight} = null;`;
}

let tree;
try {
  const outfile = path.join(directory, "routing.cjs");
  await build({
    stdin: { contents: 'export { default as RootLayout } from "./app/_layout"; export { default as Index } from "./app/index"; export { registerForOnboarding, signInToKoino } from "./state/onboarding-progress";', resolveDir: projectRoot, loader: "tsx" },
    outfile, bundle: true, format: "cjs", platform: "node", jsx: "automatic",
    tsconfig: path.join(projectRoot, "tsconfig.json"),
    plugins: [{ name: "onboarding-route-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (Object.hasOwn(mocks, name)) return { path: name, namespace: "mock" };
        if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx", resolveDir: projectRoot }));
    } }],
  });
  let app = require(outfile);
  fixture.renderRoute = (name) => name === "index" ? React.createElement(app.Index) : React.createElement("Screen", { name, uid: auth.currentUser?.uid });
  const mount = async (initialRoute) => {
    fixture.initialRoute = initialRoute;
    await act(async () => { tree = create(React.createElement(app.RootLayout)); });
  };
  const unmount = async () => {
    await act(() => tree.unmount());
    tree = undefined;
  };
  const shown = (type) => tree.root.findAllByType(type).length > 0;
  const route = () => tree.root.findByType("Route").props.name;
  const press = (label) => tree.root.findAllByType("Pressable").find((button) => button.props.children?.props.children === label);
  const save = (uid, marker) => fixture.storage.set(markerKey(uid), JSON.stringify(marker));
  const stored = (uid) => JSON.parse(fixture.storage.get(markerKey(uid)));
  const changeAccount = (uid) => act(async () => publish(uid));
  const navigate = (type, name) => act(() => { fixture.navigate(type, name); });
  const restart = async (initialRoute) => {
    await unmount();
    delete require.cache[outfile];
    app = require(outfile);
    publish(fixture.persistedUser?.uid, fixture.persistedUser?.email);
    await mount(initialRoute);
  };
  const confirmEncryption = async () => {
    const input = tree.root.findAllByType("TextInput").find(node => node.props.accessibilityLabel === "Recovery code confirmation");
    await act(() => input.props.onChangeText(fixture.recoveryKey.slice(-6)));
    await act(async () => press("Enable encryption").props.onPress());
  };

  const setFontScale = fontScale => act(() => {
    fixture.windowDimensions = { ...fixture.windowDimensions, fontScale };
    fixture.dimensionListeners.forEach(listener => listener());
  });
  const flattenStyle = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  for (const [os, language, title, confirmationLabel, action] of [
    ["ios", "en", "Protect your KOINO account", "Recovery code confirmation", "Enable encryption"],
    ["ios", "sv", "Skydda ditt KOINO-konto", "Bekräftelse av återställningskod", "Aktivera kryptering"],
    ["android", "en", "Protect your KOINO account", "Recovery code confirmation", "Enable encryption"],
  ]) {
    fixture.os = os;
    fixture.storage.set("koino.language", language);
    const uid = `recovery-layout-${os}-${language}`;
    publish(uid);
    await mount();
    const scroll = tree.root.findByType("ScrollView");
    assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, os === "ios", "Native keyboard insets apply only on iOS");
    assert.equal(scroll.props.contentInsetAdjustmentBehavior, "never");
    assert.equal(scroll.props.keyboardShouldPersistTaps, "handled");
    const insets = flattenStyle(scroll.props.contentContainerStyle);
    assert.equal(insets.paddingTop, 44 + 24);
    assert.equal(insets.paddingBottom, 34 + 24);
    const column = scroll.findAllByType("View").find(node => flattenStyle(node.props.style).maxWidth === 430);
    assert.ok(column, "The layout needs a bounded content column");

    const content = () => {
      const headings = column.findAllByType("Text").filter(node => node.props.accessibilityRole === "header");
      assert.equal(headings.length, 1);
      assert.equal(headings[0].props.children, title);
      const selectable = column.findAllByType("Text").filter(node => node.props.selectable);
      assert.ok(selectable.length === 1 && selectable[0].props.children === fixture.recoveryKey, "Copy exposes exactly the full unchanged synthetic recovery key");
      const key = selectable[0];
      for (let node = key; node && node !== scroll; node = node.parent) {
        const style = flattenStyle(node.props.style);
        assert.ok(style.height === undefined && style.maxHeight === undefined && style.overflow !== "hidden", "The recovery key can grow vertically at large text sizes");
      }
      const input = column.findByType("TextInput");
      assert.equal(input.props.accessibilityLabel, confirmationLabel);
      assert.equal(input.props.autoCapitalize, "none");
      assert.equal(input.props.autoCorrect, false);
      assert.ok(!["number-pad", "numeric", "decimal-pad", "phone-pad"].includes(input.props.keyboardType));
      const texts = [...column.findAllByType("Text"), input];
      for (const node of texts) {
        assert.equal(node.props.allowFontScaling, os !== "ios", "Only iOS overrides native font scaling in this screen");
        assert.ok(node.props.maxFontSizeMultiplier === undefined || node.props.maxFontSizeMultiplier === 0);
        assert.ok(!node.props.adjustsFontSizeToFit && !node.props.numberOfLines, "Labels and key remain untruncated");
      }
      return texts.map(node => flattenStyle(node.props.style));
    };
    const baseline = content();
    const largeScale = 3.571;
    await setFontScale(largeScale);
    assert.equal(tree.root.findByType("ScrollView"), scroll, "A scale update keeps the mounted recovery form");
    const scaled = content();
    assert.equal(scaled.length, baseline.length);
    const expectedScale = os === "ios" ? largeScale : 1;
    for (const [index, style] of baseline.entries()) {
      for (const property of ["fontSize", "lineHeight"]) {
        assert.ok(style[property] > 0 && Math.abs(scaled[index][property] - style[property] * expectedScale) <= 1,
          `Recovery text applies the expected ${os} ${property} scaling`);
      }
    }
    const input = column.findByType("TextInput");
    const suffix = fixture.recoveryKey.slice(-6);
    assert.equal(press(action).props.disabled, true);
    await act(() => input.props.onChangeText(suffix.toLowerCase()));
    assert.equal(press(action).props.disabled, true, "Confirmation is case sensitive");
    await act(() => input.props.onChangeText(suffix));
    assert.equal(press(action).props.disabled, false, "Exactly the final six characters enable confirmation");
    if (os === "ios" && language === "en") {
      fixture.confirmationErrors.set(uid, new Error("Confirmation fixture failed"));
      await act(async () => press(action).props.onPress());
      const alert = column.findAllByType("Text").find(node => node.props.accessibilityRole === "alert");
      assert.equal(alert?.props.children, "Confirmation fixture failed");
      assert.equal(alert.props.allowFontScaling, false);
      assert.equal(press(action).props.disabled, false, "A failed confirmation can retry with the same suffix");
    }
    assert.ok(!shown("StoreProvider") && !shown("Route"));
    await setFontScale(1);
    await unmount();
  }
  fixture.os = "ios";
  fixture.storage.delete("koino.language");

  for (const uid of ["existing", "other"]) {
    fixture.encryption.set(uid, "ready");
    fixture.migrated.add(uid);
  }
  publish("existing");
  await mount("me/history");
  assert.equal(route(), "me/history", "An existing account keeps its cold authenticated deep link");
  assert.equal(tree.root.findByType("Screen").props.uid, "existing");
  assert.ok(shown("Notifications"));

  save("new", { phase: "journey", signupName: "New Member" });
  fixture.legacyProfiles.add("new");
  await changeAccount("new");
  assert.ok(!shown("Route"), "Encryption confirmation precedes onboarding routing");
  assert.ok(!shown("Notifications"));
  const code = tree.root.findAllByType("TextInput").find((input) => input.props.accessibilityLabel === "Recovery code confirmation");
  await act(() => code.props.onChangeText(fixture.recoveryKey.slice(-6)));
  await act(async () => press("Enable encryption").props.onPress());
  assert.deepEqual(fixture.migrations, [{ uid: "new", signupName: "New Member" }]);
  assert.equal(route(), "index");
  assert.deepEqual(fixture.history, ["index"], "The previous account's route history is gone");
  assert.ok(shown("Journey") && !shown("Notifications"));
  for (const privateRoute of ["(tabs)", "identity", "me/history", "notifications"]) {
    assert.ok(!fixture.routeNames.includes(privateRoute));
    await navigate("PUSH", privateRoute);
    assert.equal(route(), "index");
  }
  await navigate("PUSH", "reset-password");
  assert.equal(route(), "reset-password", "The public reset route remains accessible during onboarding");
  await navigate("GO_BACK");

  const choose = tree.root.findByType("Journey").props.choose;
  const failedWrite = deferred();
  fixture.writeGates.set(markerKey("new"), failedWrite);
  await act(async () => {
    const choice = choose("private");
    failedWrite.reject(new Error("Storage unavailable"));
    await assert.rejects(choice, /Storage unavailable/);
  });
  fixture.writeGates.delete(markerKey("new"));
  assert.equal(stored("new").phase, "journey");
  assert.ok(shown("Journey") && !shown("Notifications"));

  await act(() => choose("join"));
  assert.deepEqual(stored("new"), { phase: "guide", journey: "join" });
  const writes = fixture.writes.length;
  await act(() => assert.rejects(choose("create"), /no longer available/));
  assert.equal(fixture.writes.length, writes, "A captured journey callback cannot overwrite the guide for the same UID");

  await unmount();
  await mount("me/history");
  assert.equal(route(), "index", "A cold deep link cannot bypass a persisted guide");
  assert.equal(tree.root.findByType("Guide").props.journey, "join");
  assert.ok(!shown("Notifications"));
  const complete = tree.root.findByType("Guide").props.complete;
  const delayedWrite = deferred();
  fixture.writeGates.set(markerKey("new"), delayedWrite);
  let completion;
  await act(async () => { completion = complete(); });
  assert.equal(stored("new").phase, "guide");
  assert.ok(shown("Guide") && !shown("Notifications"), "Keep the guide until completion is durable");
  await act(() => assert.rejects(complete(), /no longer available/, "Reject a second transition while the first write is pending"));
  await act(async () => { delayedWrite.resolve(); await completion; });
  fixture.writeGates.delete(markerKey("new"));
  assert.deepEqual(stored("new"), { phase: "complete" });
  assert.equal(route(), "(tabs)");
  assert.deepEqual(fixture.history, ["(tabs)"], "Completion replaces the onboarding route");
  assert.ok(shown("Notifications"));
  await act(() => assert.rejects(complete(), /no longer available/));

  await unmount();
  await mount();
  assert.equal(route(), "(tabs)", "A completed account goes directly home after restart");
  await changeAccount();
  assert.ok(shown("Login"));
  await navigate("PUSH", "reset-password");
  assert.equal(route(), "reset-password");
  await changeAccount("new");
  assert.equal(route(), "(tabs)", "A later sign-in to the same completed account goes directly home");

  fixture.encryption.set("delayed", "ready");
  fixture.migrated.add("delayed");
  save("delayed", { phase: "guide", journey: "private" });
  const delayedRead = deferred();
  fixture.readGates.set(markerKey("delayed"), delayedRead);
  await changeAccount("delayed");
  assert.ok(!shown("Route") && !shown("Notifications"), "Read progress before mounting any signed-in routes");
  await changeAccount("other");
  assert.equal(route(), "(tabs)");
  await act(async () => delayedRead.resolve());
  fixture.readGates.delete(markerKey("delayed"));
  assert.equal(tree.root.findByType("Screen").props.uid, "other", "A stale read cannot adopt a previous account's guide");

  await changeAccount("delayed");
  const staleComplete = tree.root.findByType("Guide").props.complete;
  const oldWrite = deferred();
  fixture.writeGates.set(markerKey("delayed"), oldWrite);
  let oldCompletion;
  await act(async () => { oldCompletion = staleComplete().catch(() => undefined); });
  await changeAccount("other");
  await act(async () => { oldWrite.resolve(); await oldCompletion; });
  fixture.writeGates.delete(markerKey("delayed"));
  assert.equal(route(), "(tabs)");
  assert.equal(tree.root.findByType("Screen").props.uid, "other");
  assert.ok(!fixture.storage.has(markerKey("other")), "An old account write never completes onboarding for the replacement UID");

  fixture.encryption.set("creator", "ready");
  fixture.migrated.add("creator");
  fixture.createdCommunities.set("creator", "group_a_b");
  save("creator", { phase: "journey", creationGroupId: "group_a_b" });
  await changeAccount("creator");
  assert.equal(tree.root.findByType("Guide").props.journey, "create", "Resume the guide when the saved creation already committed");
  assert.deepEqual(stored("creator"), { phase: "guide", journey: "create" });

  await act(() => {
    // Firebase can clear the in-memory user and reject before notifying its observers.
    auth.currentUser = null;
    fixture.state = { ...fixture.state, currentUserId: undefined, signOutIncomplete: true };
    fixture.storeListeners.forEach((listener) => listener());
  });
  assert.equal(tree.root.findByType("BodyText").props.accessibilityRole, "alert", "Incomplete sign-out takes priority over a stale onboarding gate");
  await act(async () => tree.root.findByType("PrimaryButton").props.onPress());
  assert.ok(shown("Login"), "Retry returns to welcome once the SDK confirms sign-out");

  fixture.encryption.set("recovering", "recovery");
  fixture.encryption.set("replacement-recovery", "recovery");
  const recovery = deferred();
  fixture.recover = () => recovery.promise;
  await changeAccount("recovering");
  const recoverCode = tree.root.findAllByType("TextInput").find((input) => input.props.accessibilityLabel === "Recovery code");
  await act(() => recoverCode.props.onChangeText("fixture-code"));
  await act(async () => press("Recover content").props.onPress());
  await changeAccount("replacement-recovery");
  await act(async () => recovery.reject(new Error("Stale recovery error")));
  assert.ok(!shown("Route") && press("Recover content"));
  assert.ok(!tree.root.findAllByType("Text").some((node) => node.props.children === "Stale recovery error"));

  const signupEmail = "interrupted-registration@example.test";
  const password = "fixture-passphrase";
  await changeAccount();
  fixture.interruptSignup = true;
  await act(async () => assert.rejects(app.registerForOnboarding(signupEmail, password, "New Member"), /Auth interrupted after server commit/));
  const { uid } = fixture.accounts.get(signupEmail).user;
  assert.equal(auth.currentUser, null);
  assert.equal(fixture.persistedUser, undefined);
  assert.equal(fixture.beforeAuthListeners.size, 0);
  assert.ok(!fixture.storage.has(markerKey(uid)), "The server can commit before the app receives a UID to mark");

  await restart();
  assert.ok(shown("Login"), "The interrupted signup did not leave a persisted Auth user");
  const failedMarkerWrite = deferred();
  fixture.writeGates.set(markerKey(uid), failedMarkerWrite);
  await act(async () => app.signInToKoino(signupEmail, password));
  assert.ok(!press("Enable encryption") && !shown("StoreProvider") && !shown("Route"));
  await act(async () => failedMarkerWrite.reject(new Error("Progress write failed")));
  assert.ok(!fixture.storage.has(markerKey(uid)) && !fixture.storage.has(`e2ee.draft.${uid}`));
  assert.ok(!shown("StoreProvider") && !shown("Route"), "A failed marker repair must keep content and routes locked");
  fixture.writeGates.delete(markerKey(uid));
  await act(async () => press("Retry").props.onPress());
  assert.ok(press("Enable encryption") && !shown("StoreProvider") && !shown("Route"));
  const recoveredMarker = fixture.storage.get(markerKey(uid));
  const savedDraft = fixture.storage.get(`e2ee.draft.${uid}`);
  assert.ok(savedDraft, "The encryption draft is persisted before confirmation");
  await restart("me/history");
  assert.ok(press("Enable encryption") && !shown("StoreProvider") && !shown("Route"));
  assert.equal(fixture.storage.get(markerKey(uid)), recoveredMarker);
  assert.equal(fixture.storage.get(`e2ee.draft.${uid}`), savedDraft, "Restart resumes the same encryption draft");
  const confirmation = deferred();
  fixture.confirmationGates.set(uid, confirmation);
  await confirmEncryption();
  assert.equal(fixture.encryption.get(uid), "ready", "The remote encrypted account already committed");
  assert.ok(!shown("StoreProvider") && !shown("Route"), "The app is still waiting for local encryption readiness");
  await restart("me/history");
  await act(async () => confirmation.resolve());
  fixture.confirmationGates.delete(uid);
  assert.equal(route(), "index", "Completing encryption after an interrupted new registration must open Journey before Home");
  assert.ok(shown("Journey") && !shown("Notifications"));
  assert.deepEqual(JSON.parse(recoveredMarker), { phase: "journey" }, "Recovery must persist progress before encryption confirmation");
  await restart("me/history");
  assert.equal(route(), "index");
  assert.ok(shown("Journey") && !shown("Notifications"));
  await act(async () => tree.root.findByType("Journey").props.choose("private"));
  assert.equal(route(), "index");
  assert.ok(shown("Guide") && !shown("Notifications"));
  await act(async () => tree.root.findByType("Guide").props.complete());
  assert.equal(route(), "(tabs)");
  assert.deepEqual(stored(uid), { phase: "complete" });

  const legacy = { uid: "legacy-before-encryption", email: "legacy@example.test" };
  fixture.legacyProfiles.add(legacy.uid);
  fixture.accounts.set(legacy.email, { user: legacy, password });
  const legacyLookup = deferred();
  fixture.legacyProfileGates.set(legacy.uid, legacyLookup);
  await changeAccount();
  await act(async () => app.signInToKoino(legacy.email, password));
  assert.ok(!press("Enable encryption") && !shown("StoreProvider") && !shown("Route"));
  await act(async () => legacyLookup.reject(new Error("Profile lookup failed")));
  assert.ok(tree.root.findAllByType("Text").some(node => node.props.accessibilityRole === "alert" && node.props.children === "Profile lookup failed"));
  assert.ok(!fixture.storage.has(markerKey(legacy.uid)), "A failed profile lookup must not classify a user as new");
  fixture.legacyProfileGates.delete(legacy.uid);
  await act(async () => press("Retry").props.onPress());
  assert.ok(press("Enable encryption") && !shown("StoreProvider") && !shown("Route"));
  await confirmEncryption();
  assert.equal(route(), "(tabs)", "A returning account with a pre-encryption profile skips first-use Journey");
  assert.ok(!shown("Journey") && !fixture.storage.has(markerKey(legacy.uid)));
  const staleLookup = deferred();
  fixture.legacyProfileGates.set("pending-profile-lookup", staleLookup);
  await changeAccount("pending-profile-lookup");
  assert.ok(!shown("StoreProvider") && !shown("Route"));
  await changeAccount("other");
  await act(async () => staleLookup.resolve());
  assert.equal(tree.root.findByType("Screen").props.uid, "other");
  assert.ok(!fixture.storage.has(markerKey("pending-profile-lookup")) && !fixture.storage.has(markerKey("other")), "A stale lookup cannot write onboarding progress after account replacement");
  console.log("Onboarding routing passed: interrupted remote registration, encryption gates, cold restart, legacy exclusion, completion, and stale sessions.");
} finally {
  if (tree) await act(() => tree.unmount());
  delete globalThis.__onboardingRouting;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  await rm(directory, { recursive: true, force: true });
}
