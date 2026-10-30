import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import vm from "node:vm";

// Exercise real Identity handlers, language state and palette values. Native
// sheets, navigation, photo picking and persistence boundaries are mocked;
// these checks do not establish native gesture or presentation correctness.
const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(tmpdir(), "koino-identity-interactions-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = globalThis.__identityInteractions = {
  os: "ios", state: {}, listeners: new Set(), navigationListeners: new Set(),
  storage: new Map(), storageWrites: [], actions: [], route: "identity", history: ["identity"],
  identityMounts: 0, identityUnmounts: 0, identityDismissals: 0,
  permissionCalls: 0, pickerCalls: 0, permissionGranted: true,
  pickerResult: { canceled: true, assets: [] }, resetFailure: false, activeRawListeners: new Set(), themeWrites: [],
};
const freshState = () => ({
  currentUserId: "member", currentGroupId: "room", authEmail: "member@example.test", theme: "light",
  users: [{ id: "member", name: "Member" }], groups: [{ id: "room", name: "Test community", ownerId: "member" }],
  groupMemberCounts: { room: 1 }, memberships: [], notificationPreferences: { pushEnabled: true },
});
const notify = () => h.listeners.forEach(listener => listener());
const mocks = {
  "react-native": `
    export const Platform = { get OS() { return globalThis.__identityInteractions.os; }, select: values => values[globalThis.__identityInteractions.os] ?? values.default };
    export const View="View",Text="Text",Pressable="Pressable",ScrollView="ScrollView",TextInput="TextInput",ActivityIndicator="ActivityIndicator";
    export const StyleSheet={create:values=>values};
    export const useWindowDimensions=()=>({height:844,width:390});
  `,
  "@expo/vector-icons": 'export const Feather="Feather";',
  "expo-router": `
    import {useSyncExternalStore} from "react";
    const h=globalThis.__identityInteractions;
    const subscribe=listener=>{h.navigationListeners.add(listener);return()=>h.navigationListeners.delete(listener);};
    const changed=()=>h.navigationListeners.forEach(listener=>listener());
    export const usePathname=()=>useSyncExternalStore(subscribe,()=>h.route);
    export const router={push(path){h.history=[...h.history,path];h.route=path;changed();},back(){if(h.history.length>1){h.history=h.history.slice(0,-1);h.route=h.history.at(-1);changed();}}};
  `,
  "expo-image-picker": `
    export const requestMediaLibraryPermissionsAsync=async()=>{const h=globalThis.__identityInteractions;h.permissionCalls++;return{granted:h.permissionGranted};};
    export const launchImageLibraryAsync=async()=>{const h=globalThis.__identityInteractions;h.pickerCalls++;return h.pickerResult;};
  `,
  "@/state/store/firebase": 'export const auth={currentUser:{uid:"member"}};export let emulatorMode=false;export const setEmulatorMode=value=>{emulatorMode=value;};',
  "@/state/koino-store": `
    import {useSyncExternalStore} from "react";
    const h=globalThis.__identityInteractions;
    const subscribe=listener=>{h.listeners.add(listener);return()=>h.listeners.delete(listener);};
    const useSnapshot=()=>useSyncExternalStore(subscribe,()=>h.state,()=>h.state);
    const dispatch=async action=>{h.actions.push(action);if(action.type==="setTheme")return h.runActualTheme(action);if(action.type==="requestPasswordReset"&&h.resetFailure)throw Error("Reset fixture failed");};
    export const useKoino=()=>({state:useSnapshot(),dispatch});
    export const useKoinoFields=keys=>{const state=useSnapshot();return Object.fromEntries(keys.map(key=>[key,state[key]]));};
  `,
  "firebase/auth": 'export const onAuthStateChanged=()=>()=>{},signOut=async()=>{};',
  "@/state/encryption/database": 'export const encodeAt=(_path,value)=>value;',
  "@/state/encryption/session": `
    const h=globalThis.__identityInteractions;
    export const crypto={fingerprint:()=>"fixture fingerprint",randomKey:()=>"fixture"};
    export const session=()=>({vault:{identity:{signingPublicKey:"fixture-public-key"}},device:{id:"fixture-device"}});
    export const listenRaw=(path,listener)=>{h.activeRawListeners.add(path);listener(null);return()=>h.activeRawListeners.delete(path);};
    export const sessionGeneration=()=>1,identityRotationInProgress=()=>false,lockSession=()=>{};
    export const unlockExisting=async()=>"setup",draftAccount=async()=>({}),confirmAccount=async()=>{},recoverAccount=async()=>{},requestDeviceApproval=async()=>{},approveDevice=async()=>{},approveGroupMember=async()=>{},rotateGroup=async()=>{},draftRevocation=async()=>({}),revokeDevice=async()=>{};
  `,
  "@/state/encryption/migration": 'export const personalMigrationComplete=async()=>true,migratePersonal=async()=>{},migrateOwnedGroups=async()=>{};',
  "@/state/supabase-storage": 'export const clearEncryptedImages=()=>{};',
  "@/ui/app-components/avatars": 'export const Avatar="Avatar",RoomImage="RoomImage";',
  "@/ui/app-components/controls": 'export const IconButton="IconButton";',
  "@/state/encryption/local-storage": `
    const h=globalThis.__identityInteractions;
    export default {getItem:async key=>h.storage.get(key)??null,setItem:async(key,value)=>{h.storageWrites.push([key,value]);h.storage.set(key,value);}};
  `,
  "@/ui/app-sheet": `
    import React,{forwardRef,useImperativeHandle} from "react";
    export const AppSheet=forwardRef(function MockAppSheet(props,ref){useImperativeHandle(ref,()=>({dismiss(after){globalThis.__identityInteractions.identityDismissals++;props.onClose();after?.();}}));return props.visible?React.createElement("IdentitySheet",props,props.children):null;});
  `,
  "@/ui/app-components": `
    import React from "react";
    export const AppHeader="AppHeader",AppScreen="AppScreen",Avatar="Avatar",BodyText="BodyText",PrimaryButton="PrimaryButton",SecondaryButton="SecondaryButton";
    export const Card=props=>React.createElement("Card",props,props.children);
    export const BottomSheet=props=>props.visible?React.createElement("SettingsSheet",props,props.children):null;
  `,
  "@/ui/confirm": 'export const confirmAction=()=>{};',
  "@/ui/room-image-cropper": 'export const RoomImageCropper=props=>props.visible?"Cropper":null;',
  "@/features/donation-flow-screen": 'export const SupportKoinoCard="SupportKoinoCard";',
  "@/features/identity/room-helpers": 'export const roomMemberCount=()=>1,selectedImageSize=async asset=>({width:asset.width,height:asset.height});',
  "@/features/identity/room-cards": 'export const RoomSummaryCard="RoomSummaryCard";',
  "@/features/identity/room-switcher": `import React from "react";export const RoomSwitcherSheet=props=>props.visible?React.createElement("RoomSwitcherSheet",props):null;`,
  "@/features/identity/room-details-screen": 'export const RoomDetailsScreen=()=>null;',
};
let tree;
try {
  const outfile = path.join(directory, "identity.cjs");
  await build({
    stdin: {
      contents: `export {IdentitySupportScreen} from "./features/identity-support-screen";export {SettingsRow} from "./features/identity/settings-components";export {AppLanguageProvider,useAppTranslation} from "./ui/app-language";export {colors,applyTheme} from "./ui/theme";export {setEmulatorMode} from "@/state/store/firebase";export {EncryptionSettings} from "./ui/encryption";export {AvatarButton} from "./ui/app-components/headers";`,
      resolveDir: projectRoot, loader: "tsx",
    },
    outfile, bundle: true, format: "cjs", platform: "node", jsx: "automatic",
    tsconfig: path.join(projectRoot, "tsconfig.json"),
    plugins: [{ name: "identity-native-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (name in mocks) return { path: name, namespace: "mock" };
        if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx", resolveDir: projectRoot }));
    } }],
  });
  const { IdentitySupportScreen, SettingsRow, AppLanguageProvider, useAppTranslation, colors, applyTheme, setEmulatorMode, EncryptionSettings, AvatarButton } = require(outfile);
  // Execute the actual setTheme case instead of mirroring its implementation
  // in the state mock. Only state refs and database boundaries are injected.
  const storeSource = await readFile(path.join(projectRoot, "state/koino-store.tsx"), "utf8");
  const storeAst = ts.createSourceFile("store.tsx", storeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const themeCases = [];
  function findThemeCase(node) {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && node.expression.text === "setTheme") themeCases.push(node);
    ts.forEachChild(node, findThemeCase);
  }
  findThemeCase(storeAst);
  assert.equal(themeCases.length, 1);
  const themeBody = themeCases[0].statements.map(statement => statement.getText(storeAst)).join("\n");
  const themeJavascript = ts.transpileModule(`(async function runThemeCase(){${themeBody}})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const freshThemeRefs = () => ({ hasStoredThemeRef: { current: false }, isThemeSyncPendingRef: { current: false }, themeRef: { current: "light" } });
  const runActualTheme = (action, write = async () => {}, firebaseUser = { uid: "member" }) => {
    h.themeRefs ??= freshThemeRefs();
    return vm.runInNewContext(themeJavascript, {
      action, firebaseUser, ...h.themeRefs, applyTheme, database: {},
      setTheme: theme => { h.state = { ...h.state, theme }; notify(); },
      ref: (_database, path) => ({ path }),
      update: (reference, patch) => { h.themeWrites.push({ reference, patch }); return write(reference, patch); },
    })();
  };
  h.runActualTheme = action => runActualTheme(action);
  h.state = freshState(); h.themeRefs = freshThemeRefs(); applyTheme("light");
  const originalBackground = colors.cream;
  let resolveThemeWrite;
  const delayedWrite = new Promise(resolve => { resolveThemeWrite = resolve; });
  const pendingTheme = runActualTheme({ type: "setTheme", theme: "dark" }, () => delayedWrite);
  assert.equal(h.state.theme, "dark", "The real theme action sets state before the database acknowledges");
  assert.notEqual(colors.cream, originalBackground, "The real theme action applies the palette before the database acknowledges");
  assert.equal(h.themeRefs.hasStoredThemeRef.current, true);
  assert.equal(h.themeRefs.isThemeSyncPendingRef.current, true);
  assert.equal(h.themeRefs.themeRef.current, "dark");
  assert.equal(h.themeWrites[0].reference.path, "profiles/member");
  assert.equal(h.themeWrites[0].patch.theme, "dark");
  assert.deepEqual(Object.keys(h.themeWrites[0].patch), ["theme"]);
  let themeSettled = false; pendingTheme.then(() => { themeSettled = true; });
  await Promise.resolve(); assert.equal(themeSettled, false);
  resolveThemeWrite(); await pendingTheme;
  h.state = freshState(); h.themeRefs = freshThemeRefs(); applyTheme("light");
  const rejectedTheme = runActualTheme({ type: "setTheme", theme: "dark" }, async () => { throw Error("Fixture database rejection"); });
  assert.equal(h.state.theme, "dark"); assert.notEqual(colors.cream, originalBackground);
  await rejectedTheme;
  assert.equal(h.state.theme, "dark", "A rejected write must not roll back the real action's local theme");
  assert.equal(h.themeRefs.isThemeSyncPendingRef.current, false);

  function LanguageProbe() { h.translation = useAppTranslation(); return null; }
  function MountedIdentity() {
    React.useEffect(() => { h.identityMounts++; return () => { h.identityUnmounts++; }; }, []);
    return React.createElement(IdentitySupportScreen, { presentation: "sheet" });
  }
  function RootFixture() {
    const route = React.useSyncExternalStore(listener => { h.navigationListeners.add(listener); return () => h.navigationListeners.delete(listener); }, () => h.route);
    // A JS history model of native-stack retention: pushed screens stay mounted,
    // popped screens unmount. Actual Expo/native presentation remains untested.
    return React.createElement(React.Fragment, null,
      React.createElement("HomeFixture", { visible: route === "/home" }, React.createElement(AvatarButton)),
      h.history.includes("/identity") ? React.createElement(MountedIdentity, { key: "identity" }) : null,
      h.history.includes("/encryption") ? React.createElement(EncryptionSettings, { key: "encryption" }) : null);
  }
  const t = key => h.translation.t(key);
  const row = key => {
    const rows = tree.root.findAllByType(SettingsRow).filter(node => node.props.title === t(key));
    assert.equal(rows.length, 1, `Expected one settings row for ${key}`);
    return rows[0];
  };
  const pressRow = async key => { await act(async () => { await row(key).findByType("Pressable").props.onPress(); }); };
  const sheet = key => tree.root.findAllByType("SettingsSheet").find(node => node.props.title === t(key));
  const text = () => JSON.stringify(tree.toJSON());
  const closeSheet = async key => { const current = sheet(key); assert.ok(current, `Expected open sheet ${key}`); await act(() => current.props.onClose()); assert.equal(sheet(key), undefined); };
  async function unmount() { if (tree) { await act(() => tree.unmount()); tree = undefined; } }
  async function mount(os, emulator = false, storedLanguage = "en") {
    await unmount();
    h.os = os; h.state = freshState(); h.storage.set("koino.language", storedLanguage);
    h.storageWrites = []; h.actions = []; h.route = "/identity"; h.history = ["/home", "/identity"];
    h.identityMounts = 0; h.identityUnmounts = 0; h.identityDismissals = 0;
    h.themeRefs = freshThemeRefs(); h.themeWrites = []; h.activeRawListeners.clear();
    h.permissionCalls = 0; h.pickerCalls = 0; h.permissionGranted = true; h.pickerResult = { canceled: true, assets: [] }; h.resetFailure = false;
    setEmulatorMode(emulator); applyTheme("light");
    await act(async () => { tree = create(React.createElement(AppLanguageProvider, null, React.createElement(LanguageProbe), React.createElement(RootFixture))); });
    assert.equal(h.translation.language, storedLanguage);
    assert.equal(tree.root.findByType("IdentitySheet").props.modal, false, "The transparent native Identity route must be the sole modal host");
  }

  for (const os of ["ios", "android"]) {
    await mount(os);
    for (let repeat = 0; repeat < 3; repeat++) {
      await pressRow("settings.language.title"); assert.ok(sheet("settings.language.sheetTitle")); await closeSheet("settings.language.sheetTitle");
      await pressRow("identity.security.title"); assert.ok(sheet("identity.security.title")); await closeSheet("identity.security.title");
      await pressRow("community.rooms.joinOrCreate");
      assert.equal(tree.root.findAllByType("RoomSwitcherSheet").length, 1);
      await act(() => tree.root.findByType("RoomSwitcherSheet").props.onClose());
      assert.equal(tree.root.findAllByType("RoomSwitcherSheet").length, 0);
    }
    const lightBackground = colors.cream;
    await pressRow("identity.appearance.title");
    assert.equal(h.state.theme, "dark");
    assert.equal(row("identity.appearance.title").props.value, t("identity.appearance.night"));
    assert.notEqual(colors.cream, lightBackground, "The handler must apply actual palette values in this fixture");
    await pressRow("identity.appearance.title"); assert.equal(h.state.theme, "light"); assert.equal(colors.cream, lightBackground);

    await pressRow("settings.language.title");
    await pressRow("settings.language.option.swedish");
    assert.equal(h.translation.language, "sv");
    assert.equal(h.storage.get("koino.language"), "sv");
    assert.ok(h.storageWrites.some(([key, value]) => key === "koino.language" && value === "sv"));
    assert.ok(text().includes("Appspråk"));
    await closeSheet("settings.language.sheetTitle");
    await pressRow("settings.language.title");
    assert.equal(row("settings.language.option.swedish").props.value, t("settings.language.selected"));
    await pressRow("settings.language.option.english"); assert.equal(h.translation.language, "en"); await closeSheet("settings.language.sheetTitle");

    for (let cycle = 0; cycle < 3; cycle++) {
      const beforeMounts = h.identityMounts, beforeUnmounts = h.identityUnmounts;
      await pressRow("common.encryption");
      assert.equal(h.history.at(-1), "/encryption");
      assert.equal(h.identityDismissals, 0, "Encryption must push without dismissing Identity first");
      assert.equal(h.identityUnmounts, beforeUnmounts);
      const encryption = tree.root.findByType(EncryptionSettings);
      assert.ok(h.activeRawListeners.size > 0, "The real encryption settings subscribes to mocked account/group state");
      const backLabel = h.translation.language === "sv" ? "Tillbaka" : "Back";
      const back = encryption.findAllByType("Pressable").find(button => button.findAllByType("Text").some(label => label.props.children === backLabel));
      assert.ok(back, "Use the real EncryptionSettings Back control");
      await act(() => back.props.onPress());
      assert.equal(h.route, "/identity");
      assert.equal(tree.root.findAllByType(EncryptionSettings).length, 0);
      assert.equal(h.activeRawListeners.size, 0, "Popping Encryption must dispose its actual effect subscriptions");
      assert.equal(h.identityMounts, beforeMounts);
      assert.equal(h.identityUnmounts, beforeUnmounts);
      await pressRow("identity.security.title"); await closeSheet("identity.security.title");
      await act(() => tree.root.findByType("IdentitySheet").props.onClose());
      assert.equal(h.route, "/home");
      assert.equal(tree.root.findAllByType("IdentitySheet").length, 0);
      assert.equal(h.identityUnmounts, beforeUnmounts + 1, "Completed Identity close must unmount the popped route");
      const avatar = tree.root.findByType("HomeFixture").findAllByType("Pressable").find(button => button.props.accessibilityLabel === t("shared.app.openIdentitySupport"));
      assert.ok(avatar, "Use the real Home AvatarButton to reopen Identity");
      await act(() => avatar.props.onPress());
      assert.equal(h.route, "/identity");
      assert.equal(h.identityMounts, beforeMounts + 1);
      assert.equal(tree.root.findByType("IdentitySheet").props.modal, false);
      assert.equal(tree.root.findAllByType("SettingsSheet").length, 0, "A reopened Identity route starts without stale child sheets");
    }
    await pressRow("identity.security.title"); assert.ok(sheet("identity.security.title"));
    const resetButton = () => tree.root.findAllByType("PrimaryButton").find(node => node.props.children === t("identity.security.sendReset"));
    assert.equal(Boolean(resetButton().props.disabled), false);
    await act(async () => resetButton().props.onPress());
    assert.deepEqual(h.actions.at(-1), { type: "requestPasswordReset", email: "member@example.test" });
    assert.ok(text().includes(t("identity.security.resetSent")));
    h.resetFailure = true;
    await act(async () => resetButton().props.onPress()); assert.ok(text().includes(t("identity.security.error")));
    const beforeMissingEmail = h.actions.length;
    await act(() => { h.state = { ...h.state, authEmail: undefined }; notify(); });
    await act(async () => resetButton().props.onPress());
    assert.equal(h.actions.length, beforeMissingEmail); assert.ok(text().includes(t("identity.security.noEmail")));
    await closeSheet("identity.security.title");

    await pressRow("identity.profile.title");
    const chooseButton = () => tree.root.findAllByType("SecondaryButton").find(node => node.props.children === t("identity.profile.chooseImage"));
    assert.equal(Boolean(chooseButton().props.disabled), false);
    await act(async () => chooseButton().props.onPress());
    assert.equal(h.permissionCalls, 1); assert.equal(h.pickerCalls, 1, "Production photo selection remains available");
    assert.equal(tree.root.findAllByType("Cropper").length, 0, "Canceled selection must not create a cropper or upload");
    h.permissionGranted = false;
    await act(async () => chooseButton().props.onPress());
    assert.equal(h.pickerCalls, 1); assert.ok(text().includes(t("identity.avatar.permission")));
    await closeSheet("identity.profile.title");

    await mount(os, true);
    for (let repeat = 0; repeat < 3; repeat++) {
      await pressRow("settings.language.title"); await closeSheet("settings.language.sheetTitle");
      await pressRow("identity.security.title"); await closeSheet("identity.security.title");
      await pressRow("community.rooms.joinOrCreate");
      await act(() => tree.root.findByType("RoomSwitcherSheet").props.onClose());
      assert.equal(tree.root.findAllByType("RoomSwitcherSheet").length, 0);
    }
    for (const language of ["en", "sv"]) {
      await act(() => h.translation.setLanguage(language));
      await pressRow("identity.profile.title");
      const choose = tree.root.findAllByType("SecondaryButton").find(node => node.props.children === t("identity.profile.chooseImage"));
      assert.equal(choose.props.disabled, true); assert.ok(text().includes(t("identity.avatar.emulatorUnavailable")));
      await act(async () => choose.props.onPress());
      assert.equal(h.permissionCalls, 0); assert.equal(h.pickerCalls, 0);
      await closeSheet("identity.profile.title");
      await pressRow("identity.security.title");
      const reset = tree.root.findAllByType("PrimaryButton").find(node => node.props.children === t("identity.security.sendReset"));
      assert.equal(reset.props.disabled, true); assert.ok(text().includes(t("identity.security.emulatorUnavailable")));
      await act(async () => reset.props.onPress());
      assert.equal(h.actions.length, 0, "Even direct handler calls must not dispatch disabled emulator actions");
      await closeSheet("identity.security.title");
    }
  }

  // Real language provider restores its successfully stored choice on remount.
  await mount("ios", false, "en");
  await act(() => h.translation.setLanguage("sv"));
  await unmount();
  await act(async () => { tree = create(React.createElement(AppLanguageProvider, null, React.createElement(LanguageProbe))); });
  assert.equal(h.translation.language, "sv");

  const layoutSource = await readFile(path.join(projectRoot, "app/_layout.tsx"), "utf8");
  const layoutAst = ts.createSourceFile("_layout.tsx", layoutSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let identityOptions;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(layoutAst) === "Stack.Screen") {
      const name = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(layoutAst) === "name");
      if (name?.initializer && ts.isStringLiteral(name.initializer) && name.initializer.text === "identity") {
        const options = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(layoutAst) === "options");
        identityOptions = options?.initializer && ts.isJsxExpression(options.initializer) ? options.initializer.expression : undefined;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(layoutAst);
  assert.ok(identityOptions && ts.isObjectLiteralExpression(identityOptions));
  const option = name => identityOptions.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(layoutAst) === name)?.initializer;
  assert.equal(option("presentation")?.text, "transparentModal");
  assert.equal(option("gestureEnabled")?.kind, ts.SyntaxKind.FalseKeyword);
  assert.equal(option("animation")?.text, "none");
  console.log("Identity handler regressions passed on iOS/Android fixtures: repeated language/security/join sheets, real setTheme action before pending/rejected writes, language persistence, three complete JS history cycles through real Encryption Back and Avatar reopen, emulator restrictions and production reset/photo controls. Native Expo navigation, gestures, picker presentation and platform touch delivery still require device testing.");
} finally {
  if (tree) await act(() => tree.unmount());
  delete globalThis.__identityInteractions;
  await rm(directory, { recursive: true, force: true });
}
