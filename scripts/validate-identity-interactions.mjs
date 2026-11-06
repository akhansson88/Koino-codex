import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { StackRouter } from "@react-navigation/routers";
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
  sdkUid: "member",
  storage: new Map(), storageWrites: [], actions: [], route: "identity", history: ["identity"],
  identityMounts: 0, identityUnmounts: 0, identityDismissals: 0,
  permissionCalls: 0, pickerCalls: 0, permissionGranted: true,
  pickerResult: { canceled: true, assets: [] }, resetFailure: false, activeRawListeners: new Set(), themeWrites: [],
};
const freshState = () => ({
  authReady: true, currentUserId: "member", signOutIncomplete: false, currentGroupId: "room", authEmail: "member@example.test", theme: "light",
  users: [{ id: "member", name: "Member" }], groups: [{ id: "room", name: "Test community", ownerId: "member" }],
  groupMemberCounts: { room: 1 }, memberships: [], notificationPreferences: { pushEnabled: true },
});
const notify = () => h.listeners.forEach(listener => listener());
const rootNames = ["index", "reset-password", "(tabs)", "identity", "room-details", "bible-plans", "donation-amount",
  "donation-confirm", "donation-thank-you", "home/[groupId]/prayer", "community/[groupId]/prayers/[prayerRequestId]",
  "feed/[targetType]/[id]", "notifications", "notification-settings", "encryption", "me/history", "me/[id]",
  "native-search-check", "native-encryption-check", "_sitemap", "+not-found"];
h.rootNames = rootNames;
h.stackRouter = StackRouter({ initialRouteName: "index" });
const mocks = {
  "react-native": `
    export const Platform = { get OS() { return globalThis.__identityInteractions.os; }, select: values => values[globalThis.__identityInteractions.os] ?? values.default };
    export const View="View",Text="Text",Pressable="Pressable",ScrollView="ScrollView",TextInput="TextInput",ActivityIndicator="ActivityIndicator";
    export const StyleSheet={create:values=>values};
    export const useWindowDimensions=()=>({height:844,width:390});
  `,
  "@expo/vector-icons": 'export const Feather="Feather";',
  "expo-router": `
    import React,{useLayoutEffect,useReducer,useSyncExternalStore} from "react";
    const h=globalThis.__identityInteractions;
    const subscribe=listener=>{h.navigationListeners.add(listener);return()=>h.navigationListeners.delete(listener);};
    const changed=()=>h.navigationListeners.forEach(listener=>listener());
    export const usePathname=()=>useSyncExternalStore(subscribe,()=>h.route);
    const Screen=()=>null, Protected=()=>null;
    export const Redirect="Redirect";
    export const Stack=Object.assign(function StackFixture({children,screenLayout}){
      // Match Expo Router's protected-child registration, then let the real
      // React Navigation StackRouter remove disallowed history entries.
      const declared=new Map();
      function read(elements,allowed=true){
        React.Children.forEach(elements,element=>{
          if(element?.type===Screen)declared.set(element.props.name,{allowed,options:element.props.options});
          else if(element?.type===Protected)read(element.props.children,allowed&&element.props.guard);
        });
      }
      read(children);
      const routeNames=h.rootNames.filter(name=>declared.get(name)?.allowed!==false);
      const opts={routeNames,routeParamList:{},routeGetIdList:{}};
      const previous=h.rootNavigation;
      const state=!previous?h.stackRouter.getInitialState(opts)
        :previous.routeNames.join()!==routeNames.join()
          ?h.stackRouter.getStateForRouteNamesChange(previous,{...opts,routeKeyChanges:[]})
          :previous;
      const [,refresh]=useReducer(n=>n+1,0);
      useLayoutEffect(()=>{
        h.rootNavigation=state;
        h.rootOptions=declared;
        const name=state.routes[state.index]?.name;
        const pathname=name==="index"?"/":name==="(tabs)"?"/home":"/"+name;
        if(h.route!==pathname){h.route=pathname;changed();}
        h.rootNavigate=(type,path)=>{
          const pathname=typeof path==="string"?path:path?.pathname;
          const name=pathname==="/"?"index":pathname?.slice(1);
          const next=h.stackRouter.getStateForAction(h.rootNavigation,{type,payload:{name}},opts);
          if(next){h.rootNavigation=next;refresh();}
        };
        return()=>{delete h.rootNavigate;};
      });
      return <RootStack>{state.routes.map((route,index)=>
        <RootRoute key={route.key} name={route.name} active={state.index===index}>{
          screenLayout?screenLayout({children:h.rootViews?.[route.name]?.()??null}):h.rootViews?.[route.name]?.()??null
        }</RootRoute>
      )}</RootStack>;
    },{Screen,Protected});
    export const router={
      push(path){if(h.rootNavigate){h.rootNavigate("PUSH",path);return;}h.history=[...h.history,path];h.route=path;changed();},
      back(){if(h.rootNavigate){h.rootNavigate("GO_BACK");return;}if(h.history.length>1){h.history=h.history.slice(0,-1);h.route=h.history.at(-1);changed();}},
      replace(path){h.rootNavigate?.("REPLACE",path);},
      canGoBack(){return h.rootNavigation?h.rootNavigation.routes.length>1:h.history.length>1;},
    };
    const RootStack="RootStack",RootRoute="RootRoute";
  `,
  "expo-font": 'export const useFonts=()=>[true];',
  "expo-status-bar": 'export const StatusBar="StatusBar";',
  "react-native-gesture-handler": 'export const GestureHandlerRootView="GestureHandlerRootView";',
  "@/features/bible-audio/provider": 'export const BibleAudioProvider=({children})=>children;',
  "@/features/bible-database-provider": 'export const BibleDatabaseProvider=({children})=>children;',
  "@/features/onboarding-screen": 'export const OnboardingScreen="Login";',
  "@/features/onboarding-journey": 'export const OnboardingJourney="OnboardingJourney";',
  "@/features/onboarding-guide": 'export const OnboardingGuide="OnboardingGuide";',
  "@/features/startup-performance": '',
  "@/ui/notification-runtime": 'export const NotificationRuntime=()=>null;',
  "@/ui/emulator-badge": 'export const EmulatorBadge=()=>null;',
  "@/ui/encryption": 'export const EncryptionBoundary=({children})=>children;',
  "@/ui/use-reduced-motion": 'export const useReducedMotion=()=>false;',
  "expo-image-picker": `
    export const requestMediaLibraryPermissionsAsync=async()=>{const h=globalThis.__identityInteractions;h.permissionCalls++;return{granted:h.permissionGranted};};
    export const launchImageLibraryAsync=async()=>{const h=globalThis.__identityInteractions;h.pickerCalls++;return h.pickerResult;};
  `,
  "@/state/store/firebase": 'export const auth={get currentUser(){const uid=globalThis.__identityInteractions.sdkUid;return uid?{uid}:null;}};export let emulatorMode=false;export const setEmulatorMode=value=>{emulatorMode=value;};',
  "@/state/koino-store": `
    import {useSyncExternalStore} from "react";
    const h=globalThis.__identityInteractions;
    const subscribe=listener=>{h.listeners.add(listener);return()=>h.listeners.delete(listener);};
    const useSnapshot=()=>useSyncExternalStore(subscribe,()=>h.state,()=>h.state);
    const dispatch=async action=>{h.actions.push(action);if(action.type==="setTheme")return h.runActualTheme(action);if(action.type==="signOut")return h.signOut?.();if(action.type==="requestPasswordReset"&&h.resetFailure)throw Error("Reset fixture failed");};
    export const KoinoProvider=({children})=>children;
    export const useKoino=()=>({state:useSnapshot(),dispatch});
    export const useKoinoActions=()=>({dispatch});
    export const useKoinoSelector=selector=>selector(useSnapshot());
    export const useKoinoFields=keys=>{const state=useSnapshot();return Object.fromEntries(keys.map(key=>[key,state[key]]));};
  `,
  "firebase/auth": 'export const onAuthStateChanged=()=>()=>{},signOut=async()=>{};',
  "@/state/encryption/database": 'export const encodeAt=(_path,value)=>value;',
  "@/state/store/profile-operations": 'export const hasOnboardingCommunity=async()=>false;',
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
for (const [family, weight] of [
  ["inter", "400Regular"], ["inter", "500Medium"], ["montserrat", "300Light"],
  ["montserrat", "400Regular"], ["montserrat", "500Medium"], ["montserrat", "600SemiBold"],
]) {
  const name = family[0].toUpperCase() + family.slice(1);
  mocks[`@expo-google-fonts/${family}/${weight}`] = `export const ${name}_${weight}=null;`;
}
let tree;
try {
  const outfile = path.join(directory, "identity.cjs");
  await build({
    stdin: {
      contents: `export {IdentitySupportScreen} from "./features/identity-support-screen";export {SettingsRow} from "./features/identity/settings-components";export {AppLanguageProvider,useAppTranslation} from "./ui/app-language";export {colors,applyTheme} from "./ui/theme";export {setEmulatorMode} from "@/state/store/firebase";export {EncryptionSettings} from "./ui/encryption";export {AvatarButton} from "./ui/app-components/headers";export {default as RootLayout} from "./app/_layout";export {default as Index} from "./app/index";export {default as IdentityRoute} from "./app/identity";export {router} from "expo-router";`,
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
  const { IdentitySupportScreen, SettingsRow, AppLanguageProvider, useAppTranslation, colors, applyTheme, setEmulatorMode, EncryptionSettings, AvatarButton, RootLayout, Index, IdentityRoute, router } = require(outfile);
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
  await unmount();

  h.os = "ios";
  h.state = { ...freshState(), authReady: false, currentUserId: undefined };
  h.storage.set("koino.language", "en");
  h.actions = [];
  setEmulatorMode(true);
  h.rootViews = {
    index: () => React.createElement(Index),
    identity: () => React.createElement(React.Fragment, null, React.createElement(LanguageProbe), React.createElement(IdentityRoute)),
    "(tabs)": () => React.createElement("HomeFixture", null, React.createElement(LanguageProbe), React.createElement(AvatarButton)),
    "me/history": () => React.createElement("PrivateJournal", null, h.state.authEmail),
    "reset-password": () => React.createElement("PasswordReset"),
  };
  const publish = state => { h.state = state; h.sdkUid = state.currentUserId; notify(); };
  const activeRoute = () => tree.root.findAllByType("RootRoute").find(node => node.props.active)?.props.name;
  const history = () => h.rootNavigation.routes.map(route => route.name);
  const signedOut = () => ({ ...h.state, authReady: true, currentUserId: undefined, signOutIncomplete: false });
  const pressAvatar = async () => {
    const avatar = tree.root.findByType("HomeFixture").findAllByType("Pressable").find(button =>
      button.props.accessibilityLabel === t("shared.app.openIdentitySupport"));
    assert.ok(avatar, "Open the actual Identity route from the Avatar button");
    await act(() => avatar.props.onPress());
  };
  const logOut = key => tree.root.findAllByType("SecondaryButton").find(node => node.props.children === t(key));
  const beginLogout = async () => {
    let resolve, reject;
    h.signOut = () => new Promise((yes, no) => { resolve = yes; reject = no; });
    const press = logOut("common.logOut").props.onPress;
    await act(async () => { press(); press(); });
    return { resolve, reject };
  };
  const assertLoginOnly = () => {
    assert.deepEqual(history(), ["index"], "The logout transition removes the full authenticated history");
    assert.equal(activeRoute(), "index");
    assert.equal(tree.root.findAllByType("Login").length, 1);
    assert.equal(tree.root.findAllByType("IdentitySheet").length, 0, "The transparent Identity route must be removed");
    assert.equal(tree.root.findAllByType("SettingsSheet").length, 0, "The native account sheet must also unmount");
    assert.equal(tree.root.findAllByType("PrivateJournal").length, 0);
    assert.doesNotMatch(text(), /@example\.test/);
  };
  await act(async () => { tree = create(React.createElement(RootLayout)); });
  await act(() => router.push("/me/history"));
  assert.equal(activeRoute(), "me/history", "The pending auth check preserves a cold authenticated deep link");
  const member = freshState();
  await act(() => publish(member));
  assert.equal(activeRoute(), "me/history", "Initial authenticated resolution preserves the intended route");
  await act(() => router.back());
  await act(() => router.push("/reset-password"));
  await act(() => router.push("/_sitemap"));
  await act(() => router.push("/+not-found"));
  await act(() => router.push("/(tabs)"));
  await pressAvatar();
  assert.equal(h.rootOptions.get("identity").options.presentation, "transparentModal");
  assert.equal(h.rootOptions.get("identity").options.gestureEnabled, false);
  assert.equal(h.rootOptions.get("identity").options.animation, "none");
  await pressRow("identity.account.title");
  assert.ok(sheet("identity.account.title"), "Start logout inside the real iOS Account Settings handler");
  assert.ok(text().includes(member.authEmail));
  await act(() => publish(signedOut()));
  assertLoginOnly();

  await act(() => publish(member));
  await act(() => router.push("/(tabs)"));
  await pressAvatar();
  await pressRow("identity.account.title");
  const attempted = await beginLogout();
  assert.equal(h.actions.filter(action => action.type === "signOut").length, 1, "A double tap must start only one logout");
  assert.equal(activeRoute(), "identity");
  assert.equal(logOut("identity.account.loggingOut").props.disabled, true);
  assert.equal(tree.root.findAllByType("Login").length, 0, "Do not present sign-in while logout is pending");
  await act(async () => { attempted.reject(Error("Mock sign-out failed")); });
  assert.equal(activeRoute(), "identity", "A failed logout retains the authenticated Identity route");
  assert.equal(logOut("common.logOut").props.disabled, false);
  assert.ok(text().includes(t("identity.account.logoutError")), "The Account sheet displays localized recovery copy");
  assert.ok(text().includes(member.authEmail));
  assert.equal(tree.root.findAllByType("Login").length, 0);

  const completed = await beginLogout();
  await act(async () => { completed.resolve(); publish(signedOut()); });
  assertLoginOnly();
  await act(() => { router.back(); router.push("/identity"); router.push("/me/history"); });
  assertLoginOnly();
  await act(() => router.push("/reset-password"));
  assert.equal(activeRoute(), "reset-password", "The public password reset path remains navigable after logout");
  await act(() => router.back());

  const other = { ...member, currentUserId: "other", authEmail: "other@example.test", users: [{ id: "other", name: "Other" }] };
  await act(() => publish(other));
  await act(() => router.push("/(tabs)"));
  await pressAvatar();
  assert.equal(tree.root.findAllByType("SettingsSheet").length, 0, "Reopening Identity for a new account starts with no child sheets");
  await pressRow("identity.account.title");
  assert.ok(text().includes(other.authEmail));
  assert.ok(!text().includes(member.authEmail));
  await act(() => publish({ ...other, theme: "dark" }));
  assert.equal(activeRoute(), "identity", "A same-account preference update preserves signed-in navigation");
  assert.ok(sheet("identity.account.title"));
  const repeated = await beginLogout();
  await act(async () => { repeated.resolve(); publish(signedOut()); });
  assertLoginOnly();

  await act(() => publish(member));
  await act(() => { router.push("/(tabs)"); router.push("/me/history"); });
  assert.equal(activeRoute(), "me/history");
  await act(() => publish(signedOut()));
  assertLoginOnly();

  await act(() => publish(member));
  await act(() => router.push("/(tabs)"));
  await pressAvatar();
  await pressRow("identity.account.title");
  await act(() => publish(other));
  assert.equal(activeRoute(), "index", "Direct UID replacement removes previous account route history");
  assert.equal(tree.root.findAllByType("IdentitySheet").length, 0);
  assert.equal(tree.root.findAllByType("SettingsSheet").length, 0);
  await act(() => router.push("/(tabs)"));
  await pressAvatar();
  await pressRow("identity.account.title");
  assert.ok(text().includes(other.authEmail) && !text().includes(member.authEmail));
  await act(() => publish({ ...signedOut(), signOutIncomplete: true }));
  assert.deepEqual(history(), ["index"]);
  assert.equal(tree.root.findAllByType("IdentitySheet").length, 0);
  assert.equal(tree.root.findAllByType("SettingsSheet").length, 0);
  assert.equal(tree.root.findAllByType("Login").length, 0, "Do not allow a new login until logout persistence is repaired");
  assert.ok(text().includes(t("identity.account.logoutIncomplete")));
  const retry = tree.root.findAllByType("PrimaryButton").find(node => node.props.children === t("identity.account.retryLogout"));
  assert.ok(retry, "Logout recovery must be actionable");
  h.signOut = async () => publish(signedOut());
  await act(() => retry.props.onPress());
  assertLoginOnly();
  await unmount();
  delete h.rootNavigation;
  delete h.rootOptions;
  delete h.signOut;
  h.state = { ...signedOut(), authReady: false };
  await act(async () => { tree = create(React.createElement(RootLayout)); });
  await act(() => { router.push("/identity"); router.push("/me/history"); });
  assert.deepEqual(history(), ["index"], "Cold signed-out links must not mount authenticated overlays while the store initializes");
  await act(() => publish(signedOut()));
  assertLoginOnly();
  await unmount();
  console.log("Logout navigation passed: real Identity and root route declarations, pending/failure, iOS overlay removal, protected history, repeat login/logout and account replacement.");

  console.log("Identity handler regressions passed on iOS/Android fixtures: repeated language/security/join sheets, real setTheme action before pending/rejected writes, language persistence, three complete JS history cycles through real Encryption Back and Avatar reopen, emulator restrictions and production reset/photo controls. Native Expo navigation, gestures, picker presentation and platform touch delivery still require device testing.");
} finally {
  if (tree) await act(() => tree.unmount());
  delete globalThis.__identityInteractions;
  await rm(directory, { recursive: true, force: true });
}
