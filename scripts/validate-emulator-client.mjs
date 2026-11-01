import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { transformSync } from "esbuild";

const require = createRequire(import.meta.url);
const { emulatorConfig, emulatorConfigFromExpo } = require("../state/store/firebase-emulator-config.cjs");
const host = "100.90.1.2";
for (const address of ["10.1.2.3", "172.16.0.1", "172.31.255.254", "192.168.1.2", "100.64.0.1", "100.127.255.254"]) assert.equal(emulatorConfig({ variant: "emulator", host: address }).host, address);
for (const address of [undefined, "", "localhost", "127.0.0.1", "8.8.8.8", "172.32.0.1", "100.63.255.255", "100.128.0.0", "192.168.1.256", "010.0.0.1", "10.0.0.1:9001", "http://10.0.0.1", "10.0.0.1 "]) assert.throws(() => emulatorConfig({ variant: "emulator", host: address }), /KOINO Emulator/);
assert.equal(emulatorConfig({ variant: "development", host: "invalid" }), undefined);
assert.throws(() => emulatorConfig({ variant: "emulator-typo", host }), /Unknown KOINO app variant/);

const configSource = readFileSync(new URL("../app.config.js", import.meta.url), "utf8");
function appConfig(variant, address) {
  const module = { exports: {} };
  vm.runInNewContext(configSource, { module, process: { env: { APP_VARIANT: variant, EXPO_PUBLIC_KOINO_EMULATOR_HOST: address } }, require: name => {
    assert.equal(name, "./state/store/firebase-emulator-config.cjs");
    return { emulatorConfig };
  } });
  return module.exports;
}
const emulator = appConfig("emulator", host), production = appConfig(undefined), development = appConfig("development");
assert.equal(emulator.name, "KOINO Emulator");
assert.equal(emulator.scheme, "koino-emulator");
assert.equal(emulator.ios.bundleIdentifier, "com.akhansson.koino.emulator");
assert.equal(emulator.android.package, "com.akhansson.koinomvp.emulator");
assert.equal(emulator.android.googleServicesFile, undefined);
assert.equal(emulator.runtimeVersion, "2.1.0-emulator");
assert.equal(emulator.updates.enabled, false);
assert.equal(emulator.updates.url, undefined);
assert.equal(emulator.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads, undefined);
assert.equal(emulator.ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
assert.equal(emulator.ios.infoPlist.NSAppTransportSecurity.NSExceptionDomains[host].NSExceptionAllowsInsecureHTTPLoads, true);
assert.equal(Object.keys(emulator.ios.infoPlist.NSAppTransportSecurity.NSExceptionDomains).length, 1);
assert.ok(emulator.plugins.includes("./plugins/with-emulator-local-network.cjs"));
for (const config of [production, development]) assert.ok(!config.plugins.includes("./plugins/with-emulator-local-network.cjs"));
assert.equal(production.ios.bundleIdentifier, "com.akhansson.koino");
assert.equal(production.android.package, "com.akhansson.koinomvp");
assert.equal(production.runtimeVersion, "2.1.0");
assert.ok(production.updates.url.startsWith("https://u.expo.dev/"));
assert.equal(development.ios.bundleIdentifier, "com.akhansson.koino.dev");
assert.equal(development.android.package, "com.akhansson.koinomvp.dev");
assert.throws(() => appConfig("emulator"), /KOINO Emulator/);
assert.throws(() => appConfig("emulator-typo", host), /Unknown KOINO app variant/);
assert.throws(() => emulatorConfigFromExpo({ ...emulator, extra: { koinoVariant: "emulator" } }), /KOINO Emulator/);
assert.throws(() => emulatorConfigFromExpo({ ...emulator, extra: {} }), /explicit emulator mode/);
assert.throws(() => emulatorConfigFromExpo({ ...emulator, updates: { enabled: true } }), /remote updates disabled/);
assert.throws(() => emulatorConfigFromExpo({ ...emulator, extra: { ...emulator.extra, koinoEmulator: { ...emulator.extra.koinoEmulator, functionsPort: 443 } } }), /endpoint configuration/);

const firebaseSource = readFileSync(new URL("../state/store/firebase.ts", import.meta.url), "utf8");
const firebaseCode = transformSync(firebaseSource, { loader: "ts", format: "cjs" }).code;
function firebaseClient(config, existing) {
  const events = [], module = { exports: {} };
  let initialized;
  const auth = {}, database = {}, functions = {};
  const mocks = {
    "expo-constants": { expoConfig: config },
    "@/state/encryption/local-storage": {},
    "./firebase-emulator-bootstrap": { emulatorConfiguration: emulatorConfigFromExpo(config) },
    "./emulator-client-network": { installEmulatorClientNetworkGuard: selected => { if (selected) events.push("guard"); } },
    "firebase/app": { getApps: () => existing ? [existing] : [], getApp: () => existing, initializeApp: options => { events.push("app"); initialized = options; return { name: "[DEFAULT]", options }; } },
    "@firebase/auth": {
      getReactNativePersistence: () => ({}), initializeAuth: () => { events.push("auth"); return auth; }, getAuth: () => { throw new Error("Unexpected auth fallback"); },
      connectAuthEmulator: (instance, url) => { assert.equal(instance, auth); assert.equal(url, `http://${host}:9099`); events.push("auth-emulator"); },
    },
    "firebase/database": { getDatabase: () => { events.push("database"); return database; }, connectDatabaseEmulator: (instance, address, port) => { assert.equal(instance, database); assert.equal(address, host); assert.equal(port, 9001); events.push("database-emulator"); } },
    "firebase/functions": { getFunctions: (_app, region) => { assert.equal(region, "europe-west1"); events.push("functions"); return functions; }, connectFunctionsEmulator: (instance, address, port) => { assert.equal(instance, functions); assert.equal(address, host); assert.equal(port, 5001); events.push("functions-emulator"); } },
  };
  vm.runInNewContext(firebaseCode, { module, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return { exports: module.exports, events, initialized };
}
const connected = firebaseClient(emulator);
assert.deepEqual(connected.events, ["guard", "app", "auth", "auth-emulator", "database", "database-emulator", "functions", "functions-emulator"]);
assert.equal(connected.initialized.projectId, "demo-koino");
assert.ok(!JSON.stringify(connected.initialized).includes("koino-codex"));
assert.equal(connected.exports.emulatorMode, true);
assert.equal(connected.exports.emulatorConfiguration.host, host);
const live = firebaseClient(production);
assert.deepEqual(live.events, ["app", "auth", "database", "functions"]);
assert.equal(live.initialized.projectId, "koino-codex");
assert.equal(live.exports.emulatorMode, false);
assert.throws(() => firebaseClient(emulator, { options: { projectId: "koino-codex" } }), /mode does not match/);
assert.throws(() => firebaseClient({ ...emulator, extra: { koinoVariant: "emulator" } }), /KOINO Emulator/);

const manifest = { application: [{ $: {} }] }, pluginModule = { exports: {} };
vm.runInNewContext(readFileSync(new URL("../plugins/with-emulator-local-network.cjs", import.meta.url), "utf8"), { module: pluginModule, require: name => {
  assert.equal(name, "@expo/config-plugins");
  return { AndroidConfig: { Manifest: { getMainApplicationOrThrow: value => value.application[0] } }, withAndroidManifest: (_config, action) => action({ modResults: manifest }) };
} });
assert.throws(() => pluginModule.exports(production), /restricted to KOINO Emulator/);
pluginModule.exports(emulator);
assert.equal(manifest.application[0].$["android:usesCleartextTraffic"], "true");
const eas = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8"));
for (const name of ["emulator-ios", "emulator-android"]) {
  const profile = eas.build[name];
  assert.equal(profile.developmentClient, false);
  assert.equal(profile.distribution, "internal");
  assert.equal(profile.environment, "preview");
  assert.equal(profile.env.APP_VARIANT, "emulator");
  assert.ok(!JSON.stringify(profile).includes(host));
}
assert.equal(eas.build["emulator-ios"].ios.buildConfiguration, "Release");
assert.equal(eas.build["emulator-android"].android.buildType, "apk");

// Run the real notification component with synchronous effects. Any native
// registration, permission, token or response call in emulator mode is a failure.
const notificationCode = transformSync(readFileSync(new URL("../ui/notification-runtime.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs" }).code;
const notificationCalls = [], notificationModule = { exports: {} };
const nativeCalls = new Proxy({ setNotificationHandler() {} }, { get: (object, key) => key in object ? object[key] : () => { notificationCalls.push(key); throw new Error(`Unexpected native notification call: ${String(key)}`); } });
vm.runInNewContext(notificationCode, { module: notificationModule, console, require: name => {
  if (name === "@/state/store/firebase") return { emulatorMode: true };
  if (name === "expo-constants") return {};
  if (name === "expo-notifications") return nativeCalls;
  if (name === "expo-router") return { router: {} };
  if (name === "react") return { useEffect: effect => effect(), useRef: value => ({ current: value }) };
  if (name === "react-native") return { Platform: { OS: "android" } };
  if (name === "@/state/koino-store") return { useKoinoSelector: selector => selector({ currentUserId: "test-user", activityNotifications: [] }), useKoinoActions: () => ({ dispatch() {} }) };
  if (name === "@/ui/notification-registration") return { useNotificationRegistrationRetryVersion: () => 0, setNotificationRegistrationState() {} };
  if (name === "@/ui/notification-navigation") return {};
  throw new Error(name);
} });
notificationModule.exports.NotificationRuntime();
assert.deepEqual(notificationCalls, []);

const storeSource = readFileSync(new URL("../state/koino-store.tsx", import.meta.url), "utf8");
const resetBody = storeSource.match(/case "requestPasswordReset": \{([\s\S]*?)\n\s*\}\r?\n\s*case/)?.[1];
assert.ok(resetBody);
let emailCalls = 0;
const reset = vm.runInNewContext(`(async () => { ${resetBody} })`, { emulatorMode: true, action: { email: "member@example.test" }, FirebaseAuth: { sendPasswordResetEmail() { emailCalls++; } } });
await assert.rejects(reset(), /disabled in KOINO Emulator/);
assert.equal(emailCalls, 0);
const sessionSource = readFileSync(new URL("../state/encryption/session.ts", import.meta.url), "utf8");
assert.match(sessionSource, /httpsCallable<unknown, T>\(functions, "encryptedAccount"\)/);
assert.doesNotMatch(sessionSource, /getFunctions\(getApp/);
console.log("Emulator client passed: private host validation, fail-closed native config, demo routing/order, production preservation, standalone profiles, push suppression and reset-email guard.");

const networkCode = transformSync(readFileSync(new URL("../state/store/emulator-client-network.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const networkModule = { exports: {} };
vm.runInNewContext(networkCode, { module: networkModule, URL });
const { installEmulatorClientNetworkGuard } = networkModule.exports;
const requestCalls = [], xhrCalls = [], socketCalls = [];
class TestXHR { open(...args) { xhrCalls.push(args); } }
class TestSocket { static OPEN = 1; constructor(...args) { socketCalls.push(args); } }
let returnedResponse;
const transport = { XMLHttpRequest: TestXHR, WebSocket: TestSocket, fetch: async (input, options) => {
  requestCalls.push([input, options]);
  return returnedResponse ?? { status: 200, url: typeof input === "string" ? input : input.url, redirected: false };
} };
const untouched = { fetch() {} }, originalFetch = untouched.fetch;
installEmulatorClientNetworkGuard(undefined, untouched);
assert.equal(untouched.fetch, originalFetch);
installEmulatorClientNetworkGuard(emulator.extra.koinoEmulator, transport);
const guardedFetch = transport.fetch;
installEmulatorClientNetworkGuard(emulator.extra.koinoEmulator, transport);
assert.equal(transport.fetch, guardedFetch, "same host installation is idempotent");
assert.throws(() => installEmulatorClientNetworkGuard({ ...emulator.extra.koinoEmulator, host: "10.1.2.3" }, transport), /Restart/);
for (const port of [9099, 9001, 5001]) await transport.fetch(`http://${host}:${port}/test`, { method: "POST", redirect: "follow" });
await transport.fetch({ url: `http://${host}:9001/write`, method: "PUT" });
for (const local of ["file:///image.jpg", "content://media/photo/1", "data:text/plain,local"]) await transport.fetch(local);
assert.ok(requestCalls.every(([, options]) => options.redirect === "error"));
const allowedCalls = requestCalls.length;
for (const url of ["https://www.openbible.info/topics/tools/vote", "https://koino-codex.firebaseapp.com/", `https://${host}:9001/`, `http://${host}:8000/`, "http://10.1.2.3:9001/", `http://user:secret@${host}:9001/`, "relative/path"]) {
  await assert.rejects(transport.fetch(url, { method: "POST" }), /External services are unavailable/);
}
await assert.rejects(transport.fetch("file:///image.jpg", { method: "PUT" }), /External services are unavailable/);
assert.equal(requestCalls.length, allowedCalls, "forbidden fetch destinations never reach native transport");
returnedResponse = { status: 302, url: `http://${host}:9001/`, redirected: false };
await assert.rejects(transport.fetch(`http://${host}:9001/`), /External services are unavailable/);
returnedResponse = { status: 200, url: "https://outside.example/", redirected: true };
await assert.rejects(transport.fetch(`http://${host}:9001/`), /External services are unavailable/);
returnedResponse = undefined;
const xhr = new transport.XMLHttpRequest();
xhr.open("PATCH", `http://${host}:9001/record`, true);
assert.equal(xhrCalls.length, 1);
assert.throws(() => xhr.open("POST", "https://outside.example/"), /External services are unavailable/);
assert.equal(xhrCalls.length, 1);
const socket = new transport.WebSocket(`ws://${host}:9001/.ws`);
assert.ok(socket instanceof TestSocket);
assert.equal(transport.WebSocket.OPEN, TestSocket.OPEN);
class DerivedSocket extends transport.WebSocket {}
assert.ok(new DerivedSocket(`ws://${host}:9001/.ws`) instanceof DerivedSocket);
assert.throws(() => new transport.WebSocket("wss://outside.example/socket"), /External services are unavailable/);
assert.equal(socketCalls.length, 2);
assert.match(readFileSync(new URL("../index.js", import.meta.url), "utf8"), /^import ['"]\.\/state\/store\/firebase-emulator-bootstrap['"]/);
const bootstrapSource = readFileSync(new URL("../state/store/firebase-emulator-bootstrap.ts", import.meta.url), "utf8");
assert.match(bootstrapSource, /installEmulatorClientNetworkGuard\(emulatorConfiguration\)/);
assert.doesNotMatch(bootstrapSource, /from ["'](?:@firebase|firebase)\//);

const browserCalls = [], alerts = [], linkModule = { exports: {} };
const linkCode = transformSync(readFileSync(new URL("../ui/open-link.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
vm.runInNewContext(linkCode, { module: linkModule, require: name => {
  if (name === "@/state/store/firebase") return { emulatorMode: true };
  if (name === "@/state/store/emulator-client-network") return networkModule.exports;
  if (name === "react-native") return { Alert: { alert: (...args) => alerts.push(args) } };
  if (name === "expo-web-browser") return { openBrowserAsync: (...args) => browserCalls.push(args) };
  throw new Error(name);
} });
await linkModule.exports.openLinkInApp("https://outside.example/");
await linkModule.exports.openLinkInApp("mailto:member@example.test");
assert.equal(browserCalls.length, 0);
assert.equal(alerts.length, 2);
assert.match(alerts[0][1], /Externa tjänster/);

// Exercise provider callbacks and a stale browser session: no native browser,
// Linking handoff or WebView can escape the emulator-only restriction.
const browserModule = { exports: {} }, nativeLinks = [], setterCalls = [], unavailableLinks = [];
const node = (type, props) => ({ type, props });
const browserCode = transformSync(readFileSync(new URL("../ui/in-app-browser.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
vm.runInNewContext(browserCode, { module: browserModule, URL, require: name => {
  if (name === "@/state/store/firebase") return { emulatorMode: true };
  if (name === "react/jsx-runtime") return { jsx: node, jsxs: node };
  if (name === "react") return { createContext: () => ({ Provider: "Provider" }), useState: value => [value, value => setterCalls.push(value)], useCallback: value => value, useContext: () => undefined, useEffect: effect => effect(), useRef: value => ({ current: value }) };
  if (name === "react-native") return { Alert: { alert() {} }, Linking: { openURL: (...args) => { nativeLinks.push(args); return Promise.resolve(); } }, useWindowDimensions: () => ({ height: 800, width: 400 }), View: "View", Text: "Text", Pressable: "Pressable" };
  if (name === "react-native-safe-area-context") return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
  if (name === "react-native-webview") return { WebView: "ForbiddenWebView" };
  if (name === "@/ui/app-sheet") return { AppSheet: "AppSheet" };
  if (name === "@expo/vector-icons") return { Feather: "Feather" };
  if (name === "@/ui/app-language") return { useAppTranslation: () => ({ t: key => key }) };
  if (name === "@/ui/link-utils") return { normalizeUrl: value => value };
  if (name === "@/ui/open-link") return { openLinkInApp: value => { unavailableLinks.push(value); return Promise.resolve(); } };
  if (name === "@/ui/theme") return { colors: {}, typography: {} };
  throw new Error(name);
} });
const browserTree = browserModule.exports.InAppBrowserProvider({ children: null });
browserTree.props.value("https://outside.example/");
assert.equal(setterCalls.length, 0);
assert.equal(unavailableLinks.length, 1);
const sheetElement = browserTree.props.children[1];
const sheetTree = sheetElement.type({ ...sheetElement.props, session: { id: 1, url: "https://outside.example/" }, currentUrl: "https://outside.example/", loadUrl: "https://outside.example/" });
const hasWebView = value => value && typeof value === "object" && (value.type === "ForbiddenWebView" || Object.values(value).some(child => Array.isArray(child) ? child.some(hasWebView) : hasWebView(child)));
assert.ok(!hasWebView(sheetTree));
sheetTree.props.header.props.children[0].props.children[2].props.onPress();
assert.equal(nativeLinks.length, 0);
assert.equal(unavailableLinks.length, 2);

const topicsModule = { exports: {} };
const topicsCode = transformSync(readFileSync(new URL("../features/bible-reader/topics-api.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
let topicRequests = 0;
vm.runInNewContext(topicsCode, { module: topicsModule, fetch: () => { topicRequests++; throw Error("Unexpected fetch"); }, require: name => {
  if (name === "@/state/store/firebase") return { emulatorMode: true };
  if (name === "@/assets/bible/topics-index.json") return { topics: [] };
  if (name === "@/features/bible-kjv") return { searchBibleText: async () => [] };
  throw new Error(name);
} });
await assert.rejects(topicsModule.exports.submitBibleTopicVote("Hope", "1", 1), /unavailable in KOINO Emulator/);
assert.equal(topicRequests, 0);
console.log("Emulator outbound guards passed: early bootstrap, fetch/XHR/WebSocket source restrictions, redirect rejection requests, browser/WebView suppression and topic-vote suppression. Native internal redirects still require device/network verification.");
