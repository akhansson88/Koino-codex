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
  storeListeners: new Set(),
  state: { authReady: true, theme: "light" },
  storage: new Map(),
  readGates: new Map(),
  writeGates: new Map(),
  encryption: new Map(),
  createdCommunities: new Map(),
  migrated: new Set(),
  migrations: [],
  writes: [],
  generation: 0,
  stackRouter: StackRouter({ initialRouteName: "index" }),
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function publish(uid) {
  auth.currentUser = uid ? { uid } : null;
  fixture.state = { authReady: true, currentUserId: uid, theme: "light" };
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
    export const Platform = { OS: "ios", select: values => values.ios ?? values.default };
    export const View = "View", Text = "Text", Pressable = "Pressable", ScrollView = "ScrollView";
    export const TextInput = "TextInput", ActivityIndicator = "ActivityIndicator";
    export const StyleSheet = { create: styles => styles };
  `,
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
    export const hasOnboardingCommunity = async (uid, groupId) => globalThis.__onboardingRouting.createdCommunities.get(uid) === groupId;
  `,
  "@firebase/auth": `
    export const beforeAuthStateChanged = () => () => {};
    export const createUserWithEmailAndPassword = async () => {};
    export const signInWithEmailAndPassword = async () => {};
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
    export const KoinoProvider = ({ children }) => children;
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
    export const draftAccount = async uid => ({ uid, recoveryKey: "fixture-recovery-123456" });
    export async function confirmAccount({ uid }) { h.encryption.set(uid, "ready"); await unlockExisting(uid); }
    export async function recoverAccount(uid) { await h.recover?.(uid); }
    export function listenRaw(_path, listener) {
      listener({ signingPublicKey: identity.signingPublicKey, devices: { "fixture-device": { active: true } } });
      return () => {};
    }
    export const identityRotationInProgress = () => false;
    export const crypto = {}, requestDeviceApproval = async () => "fixture", approveDevice = async () => {};
    export const approveGroupMember = async () => {}, rotateGroup = async () => {}, draftRevocation = async () => {}, revokeDevice = async () => {};
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
    stdin: { contents: 'export { default as RootLayout } from "./app/_layout"; export { default as Index } from "./app/index";', resolveDir: projectRoot, loader: "tsx" },
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
  const { RootLayout, Index } = require(outfile);
  fixture.renderRoute = (name) => name === "index" ? React.createElement(Index) : React.createElement("Screen", { name, uid: auth.currentUser?.uid });
  const mount = async (initialRoute) => {
    fixture.initialRoute = initialRoute;
    await act(async () => { tree = create(React.createElement(RootLayout)); });
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
  await changeAccount("new");
  assert.ok(!shown("Route"), "Encryption confirmation precedes onboarding routing");
  assert.ok(!shown("Notifications"));
  const code = tree.root.findAllByType("TextInput").find((input) => input.props.accessibilityLabel === "Recovery code confirmation");
  await act(() => code.props.onChangeText("123456"));
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
  console.log("Onboarding routing passed: existing deep link, encryption setup, pending route protection, password reset, write failure and retry, restart, completion, and stale sessions.");
} finally {
  if (tree) await act(() => tree.unmount());
  delete globalThis.__onboardingRouting;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  await rm(directory, { recursive: true, force: true });
}
