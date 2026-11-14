import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = filename => readFileSync(new URL("../" + filename, import.meta.url), "utf8");
const devMode = { developmentMode: true, emulatorMode: false };
const calls = [];
const compile = (source, fileName) => ts.transpileModule(source, {
  fileName,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const unexpected = name => () => {
  calls.push(name);
  throw new Error("Unexpected " + name);
};

function load(filename, mocks, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(compile(read(filename), filename), {
    module, exports: module.exports, URL, fetch: unexpected("fetch"), ...globals,
    require(name) {
      if (name === "@/state/store/firebase") return devMode;
      assert.ok(Object.hasOwn(mocks, name), "Unexpected import: " + name);
      return mocks[name];
    },
  }, { filename });
  return module.exports;
}

// Exercise the real dispatch cases before they can contact Auth, read an image
// URI, update image metadata, or save a push token.
const storeSource = read("state/koino-store.tsx");
const FirebaseAuth = {
  sendPasswordResetEmail: unexpected("reset email"),
  confirmPasswordReset: unexpected("reset confirmation"),
};
const storeActions = {
  requestPasswordReset: { email: "staging@example.test" },
  confirmPasswordReset: { oobCode: "fixture", newPassword: "new-fixture-password" },
  uploadGroupImage: { id: "room", localUri: "https://production.example.test/image" },
  deleteGroupImage: { id: "room" },
  uploadUserAvatar: { localUri: "https://production.example.test/avatar" },
  deleteUserAvatar: {},
  registerPushToken: { token: "previous-token", platform: "ios" },
};
for (const [type, payload] of Object.entries(storeActions)) {
  const start = storeSource.indexOf('case "' + type + '":');
  assert.ok(start >= 0, type);
  const bodyStart = storeSource.indexOf("\n", start);
  const nextCase = storeSource.indexOf('\n            case "', bodyStart);
  assert.ok(nextCase > bodyStart, type);
  const body = storeSource.slice(bodyStart, nextCase).trim().replace(/\n {12}\}$/, "");
  const run = vm.runInNewContext(compile("(async () => {" + body + "\n})", "action.ts"), {
    ...devMode, action: { type, ...payload }, FirebaseAuth,
    firebaseUser: { uid: "tester" }, auth: {}, passwordResetUrl: "https://production.example.test/reset",
    database: {}, get: unexpected("database read"), set: unexpected("database write"),
    update: unexpected("database update"), localUriToArrayBuffer: unexpected("image URI"),
  });
  if (type === "registerPushToken") await run();
  else await assert.rejects(run(), /disabled in KOINO Dev/, type);
}

const session = load("state/encryption/session.ts", {
  "react-native-libsodium": {},
  "firebase/database": {},
  "firebase/functions": { httpsCallable: unexpected("Firebase callable") },
  "./local-storage": {},
  "./crypto": {
    createCrypto: () => ({ randomKey: () => "fixture-request" }),
  },
});
for (const operation of ["legacyImage", "imageUpload", "imageDownload", "imageDelete"]) {
  await assert.rejects(session.encryptedOperation(operation, {}), /Image storage is disabled in KOINO Dev/);
}

const react = {
  createContext: () => ({ Provider: "Provider" }),
  useCallback: value => value,
  useEffect: effect => effect(),
  useMemo: value => value(),
  useRef: value => ({ current: value }),
  useState: value => [typeof value === "function" ? value() : value, () => {}],
};
const { NotificationRuntime } = load("ui/notification-runtime.tsx", {
  "expo-constants": {},
  "expo-router": { router: {} },
  react,
  "react-native": { Platform: { OS: "ios" } },
  "@/state/koino-store": {
    useKoinoSelector: selector => selector({ currentUserId: "tester", activityNotifications: [] }),
    useKoinoActions: () => ({ dispatch: unexpected("push dispatch") }),
  },
  "@/ui/notification-registration": { useNotificationRegistrationRetryVersion: () => 0 },
  "@/ui/notification-navigation": {},
  // Loading expo-notifications itself could retry a saved token. No mock is
  // provided so the test fails if its module is loaded in Dev.
});
assert.equal(NotificationRuntime(), null);

const alerts = [];
const { openLinkInApp } = load("ui/open-link.ts", {
  "react-native": { Alert: { alert: (...args) => alerts.push(args) } },
  "@/state/store/emulator-client-network": {},
  "expo-web-browser": { openBrowserAsync: unexpected("external browser") },
});
await openLinkInApp("https://koino-codex.firebaseapp.com/reset-password");
assert.equal(alerts[0]?.[0], "KOINO Dev");

const jsx = (type, props) => ({ type, props });
const theme = { colors: {}, radius: {}, typography: {} };
const browser = load("ui/in-app-browser.tsx", {
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "react-native": { Linking: { openURL: unexpected("Linking") } },
  "react-native-safe-area-context": {},
  "react-native-webview": { WebView: "WebView" },
  "react": { ...react, useState: value => [value, unexpected("WebView session")] },
  "@expo/vector-icons": {},
  "@/ui/app-sheet": {},
  "@/ui/app-language": {},
  "@/ui/link-utils": { normalizeUrl: value => value },
  "@/ui/open-link": { openLinkInApp },
  "@/ui/theme": theme,
});
const productionUrl = "https://koino-codex.firebaseapp.com/";
browser.InAppBrowserProvider({}).props.value(productionUrl);
assert.equal(alerts.length, 2);

const { LinkPreview } = load("ui/link-preview.tsx", {
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  react, "react-native": {}, "@expo/vector-icons": {},
  "@/ui/link-utils": { firstUrl: () => productionUrl },
  "@/ui/app-language": { useAppTranslation: () => ({ t: key => key }) },
  "@/ui/in-app-browser": { useOpenExternalLink: () => unexpected("preview link") },
  "@/ui/theme": theme,
});
assert.equal(LinkPreview({ text: productionUrl }), null);

const topics = load("features/bible-reader/topics-api.ts", {
  "@/assets/bible/topics-index.json": { topics: [] },
  "@/features/bible-kjv": {},
});
await assert.rejects(topics.submitBibleTopicVote("Hope", "1", 1), /unavailable in KOINO Dev/);
assert.deepEqual(calls, []);
console.log("Dev external services passed: password reset, images, push import/registration, external links and previews, and live topic votes are blocked before side effects.");
