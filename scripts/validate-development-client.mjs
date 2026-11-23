import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

// These digests were computed from the pre-isolation revision (3bf2c05).
// Canonicalize object keys so reordering or formatting cannot change the baseline.
const productionBaseline = {
  expo: "19c888650c3539f3fd6f945cf1ba1abc008183a2ba66369d4d994b1400025169",
  firebase: "5fceeacfcef9fb426e90e84a30845b5320709bea4e814148b9aa00217a1ff012",
  androidFirebase: "48417c420a792fa1bcfe483e2e69b0310be6ca241615ed12cca3e2b9ef932aa5",
  eas: "a0f60b833180373a3eba4d9bb6762768ca318c1a1dab237c788e8e8af767e426",
};
function assertProductionBaseline(label, value) {
  const canonical = JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item);
  const actual = createHash("sha256").update(canonical).digest("hex");
  assert.equal(actual, productionBaseline[label], "Production baseline changed: " + label);
}

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
}
const developmentConfigSource = readFileSync(new URL("../state/store/firebase-development-config.cjs", import.meta.url), "utf8");
const productionFirebase = require("../state/store/firebase-production.json");
const productionAndroidFirebase = require("../google-services.json");
const stagingFixture = require("../state/store/firebase-staging.json");
const { functionsRegion, ...stagingOptions } = stagingFixture;
function loadDevelopmentConfig(staging) {
  const module = { exports: {} };
  vm.runInNewContext(developmentConfigSource, { module, URL, require: name => {
    if (name === "./firebase-staging.json") return staging;
    throw new Error(name);
  } });
  return module.exports;
}
const configuredDevelopment = loadDevelopmentConfig(stagingFixture);
const unconfiguredDevelopment = loadDevelopmentConfig(null);

const projectRoot = path.resolve(import.meta.dirname, "..");
const configSource = readFileSync(path.join(projectRoot, "app.config.js"), "utf8");
function appConfig(variant, developmentConfig = unconfiguredDevelopment, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(configSource, { module, __dirname: projectRoot, process: { env: { ...env, APP_VARIANT: variant } }, require: name => {
    if (name === "./state/store/firebase-development-config.cjs") return developmentConfig;
    throw new Error(name);
  } });
  return module.exports;
}
const production = appConfig();
assertProductionBaseline("expo", production);
assertProductionBaseline("expo", appConfig("production"));
assertProductionBaseline("androidFirebase", productionAndroidFirebase);
const development = appConfig("development", configuredDevelopment);
assert.throws(() => appConfig("development"), /staging/i);
assert.throws(() => appConfig("development", loadDevelopmentConfig(productionFirebase)), /staging|production/i);

const productionAndroidKey = productionAndroidFirebase.client[0].api_key[0].current_key;
for (const [label, invalid] of Object.entries({
  missingProject: { ...stagingFixture, projectId: undefined },
  missingKey: { ...stagingFixture, apiKey: undefined },
  malformedKey: { ...stagingFixture, apiKey: "bad" },
  unapprovedKey: { ...stagingFixture, apiKey: "AIza" + "S".repeat(35) },
  unapprovedWebApp: { ...stagingFixture, appId: "1:449587720664:web:0123456789abcdef012345" },
  otherProject: {
    ...stagingFixture,
    projectId: "koino-staging-fixture",
    appId: "1:123456789012:web:0123456789abcdef012345",
    apiKey: "AIza" + "S".repeat(35),
    authDomain: "koino-staging-fixture.firebaseapp.com",
    databaseURL: "https://koino-staging-fixture-default-rtdb.europe-west1.firebasedatabase.app",
  },
  productionProject: { ...stagingFixture, projectId: productionFirebase.projectId },
  productionWebKey: { ...stagingFixture, apiKey: productionFirebase.apiKey },
  productionAndroidKey: { ...stagingFixture, apiKey: productionAndroidKey },
  productionApp: { ...stagingFixture, appId: productionFirebase.appId },
  productionAuth: { ...stagingFixture, authDomain: productionFirebase.authDomain },
  productionDatabase: { ...stagingFixture, databaseURL: productionFirebase.databaseURL },
  wrongRegion: { ...stagingFixture, functionsRegion: "us-central1" },
  wrongDatabase: { ...stagingFixture, databaseURL: stagingFixture.databaseURL + ".example.test" },
  databaseQuery: { ...stagingFixture, databaseURL: stagingFixture.databaseURL + "?ns=koino-codex" },
  bucketOverride: { ...stagingFixture, storageBucket: productionFirebase.storageBucket },
})) {
  assert.throws(() => appConfig("development", loadDevelopmentConfig(invalid)), /staging|production/i, label);
}
assert.equal(production.ios.bundleIdentifier, "com.akhansson.koino");
assert.equal(production.android.package, "com.akhansson.koinomvp");
assert.equal(production.name, "KOINO");
assert.equal(production.scheme, "koino");
assert.equal(production.android.googleServicesFile, "./google-services.json");
assert.equal(production.ios.googleServicesFile, undefined);
assert.equal(production.runtimeVersion, "2.1.0");
assert.ok(production.updates.url.startsWith("https://u.expo.dev/"));
assert.equal(development.ios.bundleIdentifier, "com.akhansson.koino.dev");
assert.equal(development.android.package, "com.akhansson.koinomvp.dev");
assert.equal(development.name, "KOINO Dev");
assert.equal(development.plugins.filter(plugin => plugin === "./plugins/with-ios-app-switcher-privacy.cjs").length, 1);
assert.equal(development.scheme, "koino-dev");
assert.equal(development.runtimeVersion, configuredDevelopment.developmentRuntimeVersion);
assert.notEqual(development.runtimeVersion, production.runtimeVersion);
assert.equal(development.updates.enabled, false);
assert.equal(development.updates.url, undefined);
assert.equal(development.android.googleServicesFile, undefined);
assert.equal(development.ios.googleServicesFile, undefined);
assert.equal(development.ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
assert.equal(development.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads, undefined);
assert.match(development.ios.infoPlist.NSLocalNetworkUsageDescription, /Metro/);
assert.deepEqual({ ...development.extra.koinoFirebase }, stagingFixture);
for (const env of [{}, { EXPO_PUBLIC_KOINO_EMULATOR_HOST: "100.90.1.2" }]) {
  assert.throws(() => appConfig("emulator", configuredDevelopment, env), /KOINO Emulator.*retired/i);
}
assert.throws(() => appConfig("emulator-typo"), /Unknown KOINO app variant/);

const retiredIosId = "com.akhansson.koino.emulator";
const retiredAndroidId = "com.akhansson.koinomvp.emulator";
const retiredMetadata = { host: "100.90.1.2", authPort: 9099, databasePort: 9001, functionsPort: 5001 };
const retiredManifest = {
  ...production,
  name: "KOINO Emulator",
  scheme: "koino-emulator",
  ios: { bundleIdentifier: retiredIosId },
  android: { package: retiredAndroidId },
  runtimeVersion: "2.1.0-emulator",
  updates: { enabled: false },
  extra: { koinoVariant: "emulator", koinoEmulator: retiredMetadata },
};

const firebaseCode = compile("state/store/firebase.ts");
const firebaseBootstrapCode = compile("state/store/firebase-bootstrap.ts");
function firebaseClient(config, {
  existingApps = [],
  applicationId = config?.android?.package,
  developmentConfig = configuredDevelopment,
  firebaseDefaults,
  env = {},
  events = [],
  sdkAccess = [],
  sdkImports = [],
  transport = [],
} = {}) {
  const module = { exports: {} };
  const bootstrap = { exports: {} };
  let initialized;
  const auth = {}, database = {}, functions = {};
  const assertServiceApp = app => {
    const defaultApp = existingApps.find(candidate => candidate.name === "[DEFAULT]") ?? initialized;
    assert.ok(defaultApp);
    assert.equal(app, defaultApp);
  };
  const rejectTransport = name => () => {
    transport.push(name);
    throw new Error("Unexpected transport");
  };
  const runtime = {
    fetch: rejectTransport("fetch"),
    WebSocket: rejectTransport("WebSocket"),
    XMLHttpRequest: rejectTransport("XMLHttpRequest"),
    ...(firebaseDefaults === undefined ? {} : { __FIREBASE_DEFAULTS__: firebaseDefaults }),
    process: { env },
  };
  const mocks = {
    "expo-application": { applicationId },
    "expo-constants": { expoConfig: config },
    "@/state/encryption/local-storage": {},
    "./firebase-development-config.cjs": developmentConfig,
    "./firebase-production.json": productionFirebase,
    "firebase/app": {
      getApps: () => { sdkAccess.push("getApps"); return existingApps; },
      getApp: () => { sdkAccess.push("getApp"); return existingApps.find(app => app.name === "[DEFAULT]"); },
      initializeApp: options => {
        events.push("app");
        initialized = { name: "[DEFAULT]", options };
        return initialized;
      },
    },
    "@firebase/auth": {
      getReactNativePersistence: () => ({}),
      initializeAuth: app => { assertServiceApp(app); events.push("auth"); return auth; },
      getAuth: () => { events.push("getAuth"); throw new Error("Unexpected auth fallback"); },
    },
    "firebase/database": {
      getDatabase: app => { assertServiceApp(app); events.push("database"); return database; },
    },
    "firebase/functions": {
      getFunctions: (app, region) => {
        assertServiceApp(app);
        assert.equal(region, functionsRegion);
        events.push("functions");
        return functions;
      },
    },
  };
  function requireMock(name) {
    if (name === "./firebase-bootstrap") {
      vm.runInNewContext(firebaseBootstrapCode, { ...runtime, module: bootstrap, exports: bootstrap.exports, require: requireMock });
      return bootstrap.exports;
    }
    assert.ok(name in mocks, name);
    if (/^(?:@firebase|firebase)\//.test(name)) sdkImports.push(name);
    return mocks[name];
  }
  vm.runInNewContext(firebaseCode, { ...runtime, module, exports: module.exports, require: requireMock });
  return { exports: module.exports, events, initialized: initialized?.options };
}
const live = firebaseClient(production);
assert.deepEqual(live.events, ["app", "auth", "database", "functions"]);
assertProductionBaseline("firebase", live.initialized);
assert.equal(live.exports.developmentMode, false);

function assertClientRejected(config, options, label, error = /KOINO|staging|Firebase/i) {
  const events = [], sdkAccess = [], sdkImports = [], transport = [];
  assert.throws(() => firebaseClient(config, { ...options, events, sdkAccess, sdkImports, transport }), error, label);
  assert.deepEqual(events, [], label);
  assert.deepEqual(sdkAccess, options.existingApps ? ["getApps"] : [], label);
  if (!options.existingApps) assert.deepEqual(sdkImports, [], label);
  assert.deepEqual(transport, [], label);
}

const stagedManifest = extra => ({ ...development, extra: { ...development.extra, ...extra } });
for (const applicationId of [development.ios.bundleIdentifier, development.android.package]) {
  const staging = firebaseClient(development, { applicationId });
  assert.deepEqual(staging.events, ["app", "auth", "database", "functions"]);
  assert.deepEqual({ ...staging.initialized }, stagingOptions);
  assert.equal(staging.exports.developmentMode, true);
  const defaultApp = { name: "[DEFAULT]", options: stagingOptions };
  const stagingNamedApp = { name: "fixture", options: stagingOptions };
  const reused = firebaseClient(development, { applicationId, existingApps: [defaultApp, stagingNamedApp] });
  assert.deepEqual(reused.events, ["auth", "database", "functions"]);
  const sdkAccess = [];
  const namedApp = firebaseClient(development, { applicationId, sdkAccess, existingApps: [stagingNamedApp] });
  assert.deepEqual(namedApp.events, ["app", "auth", "database", "functions"]);
  assert.deepEqual(sdkAccess, ["getApps"]);
  for (const [label, config] of Object.entries({
    noManifest: undefined,
    productionMetro: production,
    retiredMetro: retiredManifest,
    noVariant: stagedManifest({ koinoVariant: undefined }),
    badVariant: stagedManifest({ koinoVariant: "dev" }),
    noStaging: stagedManifest({ koinoFirebase: undefined }),
    productionFirebase: stagedManifest({ koinoFirebase: productionFirebase }),
    mixedAuthKey: stagedManifest({ koinoFirebase: { ...stagingFixture, apiKey: productionFirebase.apiKey } }),
    mixedAndroidKey: stagedManifest({ koinoFirebase: { ...stagingFixture, apiKey: productionAndroidKey } }),
    mixedDatabase: stagedManifest({ koinoFirebase: { ...stagingFixture, databaseURL: productionFirebase.databaseURL } }),
    wrongRegion: stagedManifest({ koinoFirebase: { ...stagingFixture, functionsRegion: "us-central1" } }),
    unexpectedKey: stagedManifest({ koinoFirebase: { ...stagingFixture, apiKey: "AIza" + "T".repeat(35) } }),
    unknownField: stagedManifest({ koinoFirebase: { ...stagingFixture, storageBucket: productionFirebase.storageBucket } }),
    otaEnabled: { ...development, updates: production.updates },
    otaUrl: { ...development, updates: { enabled: false, url: production.updates.url } },
    wrongScheme: { ...development, scheme: production.scheme },
    wrongIosId: { ...development, ios: production.ios },
    wrongAndroidId: { ...development, android: production.android },
    nativeAndroidFirebase: { ...development, android: { ...development.android, googleServicesFile: production.android.googleServicesFile } },
    nativeIosFirebase: { ...development, ios: { ...development.ios, googleServicesFile: "./GoogleService-Info.plist" } },
    retiredMetadata: stagedManifest({ koinoEmulator: retiredMetadata }),
    wrongRuntime: { ...development, runtimeVersion: production.runtimeVersion },
  })) {
    assertClientRejected(config, { applicationId }, label);
  }
  assertClientRejected(development, { applicationId, developmentConfig: unconfiguredDevelopment }, "missing staging pin in bundle");
  assertClientRejected(development, {
    applicationId,
    developmentConfig: loadDevelopmentConfig({ ...stagingFixture, apiKey: productionAndroidKey }),
  }, "production Android API key in staging pin");
  assertClientRejected(development, { applicationId, firebaseDefaults: { emulatorHosts: { auth: "127.0.0.1:9099" } } }, "global Firebase defaults");
  assertClientRejected(development, { applicationId, env: { __FIREBASE_DEFAULTS__: "{}" } }, "environment Firebase defaults");
  for (const [label, options] of Object.entries({
    preinitializedProduction: productionFirebase,
    preinitializedIncomplete: { projectId: stagingOptions.projectId },
    preinitializedMixedAuthKey: { ...stagingOptions, apiKey: productionFirebase.apiKey },
    preinitializedMixedAppId: { ...stagingOptions, appId: productionFirebase.appId },
    preinitializedMixedDatabase: { ...stagingOptions, databaseURL: productionFirebase.databaseURL },
    preinitializedMixedAuthDomain: { ...stagingOptions, authDomain: productionFirebase.authDomain },
    preinitializedMixedBucket: { ...stagingOptions, storageBucket: productionFirebase.storageBucket },
  })) {
    const unsafeNamedApp = { name: "unsafe-fixture", options };
    for (const existingApps of [
      [{ name: "[DEFAULT]", options }],
      [unsafeNamedApp],
      [defaultApp, unsafeNamedApp],
      [stagingNamedApp, unsafeNamedApp, defaultApp],
    ]) {
      assertClientRejected(development, { applicationId, existingApps }, label + " (" + existingApps.map(app => app.name).join(", ") + ")");
    }
  }
}
for (const applicationId of [null, "host.exp.Exponent", production.ios.bundleIdentifier, production.android.package]) {
  assertClientRejected(development, { applicationId }, "Dev manifest on the wrong native app");
}
console.log("Dev Firebase passed: staging pin, native identity and OTA checks, exact Firebase options for every initialized app, and zero service/transport calls for rejected configurations.");

const retired = /KOINO Emulator.*retired/i;
for (const [label, config] of Object.entries({
  retiredManifest,
  retiredVariant: { ...production, extra: { ...production.extra, koinoVariant: "emulator" } },
  retiredMetadata: { ...production, extra: { ...production.extra, koinoEmulator: retiredMetadata } },
  nullRetiredMetadata: { ...production, extra: { ...production.extra, koinoEmulator: null } },
  retiredName: { ...production, name: retiredManifest.name },
  retiredScheme: { ...production, scheme: retiredManifest.scheme },
  retiredSchemeArray: { ...production, scheme: [production.scheme, retiredManifest.scheme] },
  retiredRuntime: { ...production, runtimeVersion: retiredManifest.runtimeVersion },
  retiredIosBundle: { ...production, ios: retiredManifest.ios },
  retiredAndroidBundle: { ...production, android: retiredManifest.android },
})) {
  assertClientRejected(config, { applicationId: production.android.package }, label, retired);
}
for (const applicationId of [retiredIosId, retiredAndroidId]) {
  for (const config of [undefined, production, development, retiredManifest]) {
    assertClientRejected(config, { applicationId }, "retired native application", retired);
  }
}
assertClientRejected(
  { ...production, extra: { ...production.extra, koinoVariant: "emulator-typo" } },
  { applicationId: production.android.package },
  "unknown runtime variant",
  /Unknown KOINO app variant/,
);

const eas = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8"));
const productionBuilds = Object.fromEntries(["preview", "store-internal", "production"].map(name => [name, eas.build[name]]));
assertProductionBaseline("eas", { build: productionBuilds, submit: eas.submit, cli: eas.cli });
for (const name of ["emulator-ios", "emulator-android"]) assert.equal(eas.build[name], undefined);
for (const profile of Object.values(eas.build)) assert.notEqual(profile.env?.APP_VARIANT, "emulator");

const sessionSource = readFileSync(new URL("../state/encryption/session.ts", import.meta.url), "utf8");
assert.match(sessionSource, /httpsCallable<unknown, T>\(functions, "encryptedAccount"\)/);
assert.doesNotMatch(sessionSource, /getFunctions\(getApp/);
assert.match(readFileSync(new URL("../index.js", import.meta.url), "utf8"), /^import ['"]\.\/state\/store\/firebase-bootstrap['"]/);
console.log("Production baselines, retired app rejection before Firebase access, and shared encryption callable routing passed.");
