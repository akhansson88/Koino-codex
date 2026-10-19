import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

import { build } from "esbuild";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const metroConfig = readFileSync(path.join(projectRoot, "metro.config.js"), "utf8");
const powershellLauncher = readFileSync(path.join(projectRoot, "script", "build_and_run.ps1"), "utf8");
const shellLauncher = readFileSync(path.join(projectRoot, "script", "build_and_run.sh"), "utf8");

assert.equal(packageJson.scripts.start, "expo start", "npm start must preserve Metro's cache and use the normal LAN transport");
assert.equal(packageJson.scripts["start:tunnel"], "expo start --tunnel", "tunnel mode must not implicitly clear Metro's cache");
assert.equal(packageJson.scripts["start:clear"], "expo start --clear", "cache clearing should remain an explicit command");
for (const lifecycleScript of ["prestart", "prestart:lan", "prestart:tunnel", "prestart:clear", "preandroid", "preios"]) {
  assert.equal(packageJson.scripts[lifecycleScript], undefined, `${lifecycleScript} must not regenerate Bible data`);
}
assert.doesNotMatch(metroConfig, /child_process|execFile|generate-bible-data/, "Metro must never synchronously regenerate Bible data");
assert.match(metroConfig, /npm run bible:build/, "Metro's missing-asset error should name the explicit rebuild command");
assert.doesNotMatch(powershellLauncher, /generate-bible-data|--tunnel"\s*,\s*"--clear/, "PowerShell development starts must stay cache-preserving");
assert.doesNotMatch(shellLauncher, /generate-bible-data|start --tunnel --clear/, "Shell development starts must stay cache-preserving");

const result = await build({
  bundle: true,
  entryPoints: [path.join(projectRoot, "features", "home-screen.tsx")],
  format: "esm",
  loader: { ".db": "file", ".onnx": "file", ".tokenizer": "file" },
  logLevel: "silent",
  metafile: true,
  outdir: "out",
  packages: "external",
  platform: "neutral",
  splitting: true,
  tsconfig: path.join(projectRoot, "tsconfig.json"),
  write: false,
});

const homeOutput = Object.values(result.metafile.outputs).find((output) => output.entryPoint?.replaceAll("\\", "/").endsWith("features/home-screen.tsx"));
assert.ok(homeOutput, "Home entry output was not generated");

const forbiddenHomeInputs = Object.keys(homeOutput.inputs).filter((input) =>
  /(^|\/)features\/bible-(database|database-provider|kjv|screen|search)\.[jt]sx?$/.test(input.replaceAll("\\", "/")) ||
  /(^|\/)features\/bible-(reader|search)\//.test(input.replaceAll("\\", "/")) ||
  /(^|\/)ui\/bible-verse-picker\.tsx$/.test(input.replaceAll("\\", "/")),
);
assert.deepEqual(
  forbiddenHomeInputs,
  [],
  "Home's eager dependency graph must not include the Bible database, reader, picker, or search engine",
);

const pickerChunk = Object.values(result.metafile.outputs).find((output) =>
  Object.keys(output.inputs).some((input) => input.replaceAll("\\", "/").endsWith("ui/bible-verse-picker.tsx")),
);
assert.ok(pickerChunk, "The Bible picker should remain available as a lazy chunk");

// Exercise the real provider's subscription lifecycle with deterministic
// Firebase and timers. Personal history must start after the usable Home commit,
// while today's private check-in query remains immediate.
const providerSource = readFileSync(path.join(projectRoot, "state/koino-store.tsx"), "utf8");
const providerAst = ts.createSourceFile("koino-store.tsx", providerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const imports = new Map();
for (const statement of providerAst.statements) if (ts.isImportDeclaration(statement)) {
  const specifier = statement.moduleSpecifier.text;
  const bindings = statement.importClause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) imports.set(specifier, [...new Set([...(imports.get(specifier) ?? []), ...bindings.elements.map((element) => (element.propertyName ?? element.name).text)])]);
}
const subscriptions = new Map(), timers = new Map(), commits = [];
const fixture = globalThis.startupProviderFixture = {
  auth: { currentUser: null }, modules: {}, authCallback: null,
};
const snapshot = (value) => ({ val: () => value, exists: () => value !== null, child: (key) => snapshot(value?.[key] ?? null) });
fixture.modules["@firebase/auth"] = { onAuthStateChanged: (_auth, callback) => { fixture.authCallback = callback; return () => { fixture.authCallback = null; }; } };
const databaseFixture = {
  ref: (_database, path = "") => ({ path }), query: (reference) => reference,
  onValue: (reference, callback) => {
    subscriptions.set(reference.path, callback);
    return () => { if (subscriptions.get(reference.path) === callback) subscriptions.delete(reference.path); };
  },
  get: async () => snapshot(null), update: async () => {},
};
fixture.modules["@/state/encryption/database"] = databaseFixture;
fixture.modules["firebase/database"] = databaseFixture;
fixture.modules["@/state/store/firebase"] = { auth: fixture.auth, database: {} };
fixture.modules["@/state/encryption/local-storage"] = { default: { getItem: async () => null, setItem: async () => {} } };
fixture.modules["@/ui/theme"] = { normalizeTheme: () => "light", applyTheme: () => {} };
fixture.modules["@/state/store/helpers"] = { asArray: (value) => Object.values(value ?? {}), defaultBibleHighlightColors: [], now: () => "2026-10-06", localDayKey: () => "2026-10-06" };
fixture.modules["@/state/firebase-pagination"] = { FIREBASE_PAGE_SIZE: 50, recentFirebaseQuery: (reference) => reference, firebaseRecords: (value) => Object.values(value ?? {}), mergeFirebaseRecords: (older, recent) => [...older, ...recent] };
fixture.modules["@/state/encryption/migration"] = { listenLegacyCommunities: (_uid, callback) => { callback({ memberships: [], groups: [], ready: true }); return () => {}; } };
fixture.modules["@/state/store/image-operations"] = { syncUserMembershipImage: async () => {} };
fixture.modules["@/state/saved-verses"] = { normalizeSavedVerseRecords: () => ({ verses: [], duplicateStorageKeys: [] }) };
const nativeSetTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
globalThis.setTimeout = (callback, delay, ...args) => {
  if (delay !== 50) return nativeSetTimeout(callback, delay, ...args);
  const timer = { callback: () => callback(...args) }; timers.set(timer, timer.callback); return timer;
};
globalThis.clearTimeout = (timer) => { if (timers.has(timer)) timers.delete(timer); else nativeClearTimeout(timer); };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const temporary = await mkdtemp(path.join(projectRoot, "node_modules", "koino-startup-provider-"));
let tree;
try {
  const outfile = path.join(temporary, "provider.cjs");
  await build({ jsx: "automatic", entryPoints: [path.join(projectRoot, "state/koino-store.tsx")], bundle: true, platform: "node", format: "cjs", packages: "external", outfile, plugins: [{ name: "provider-native-boundaries", setup(builder) {
    builder.onResolve({ filter: /^@\/|^@firebase\/auth$|^firebase\/database$/ }, ({ path: specifier }) => specifier === "@/state/selective-store" ? undefined : { path: specifier, namespace: "fixture" });
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: specifier }) => {
      const names = new Set([...(imports.get(specifier) ?? []), ...Object.keys(fixture.modules[specifier] ?? {}).filter((name) => name !== "default")]);
      return { loader: "js", contents: `const m=globalThis.startupProviderFixture.modules[${JSON.stringify(specifier)}]??{}; const noop=()=>{}; ${[...names].map((name) => `export const ${name}=m.${name}??noop;`).join(" ")} export default m.default??noop;` };
    });
  } }] });
  const require = createRequire(import.meta.url);
  const { KoinoProvider, useKoinoFields } = require(outfile);
  function HomeReadiness() {
    const state = useKoinoFields(["profileReady", "userGroupsReady", "privateCheckInsReady"]);
    React.useEffect(() => { commits.push(state); }, [state]);
    return React.createElement("Home", state);
  }
  const authenticate = (uid) => { fixture.auth.currentUser = uid ? { uid } : null; fixture.authCallback(fixture.auth.currentUser); };
  const deliver = (recordPath, value) => { assert.ok(subscriptions.has(recordPath), `Missing subscription: ${recordPath}`); subscriptions.get(recordPath)(snapshot(value)); };
  await act(async () => { tree = create(React.createElement(KoinoProvider, null, React.createElement(HomeReadiness))); });
  await act(async () => authenticate("alex"));
  assert.ok(subscriptions.has("privateCheckIns/alex"), "private check-ins must start immediately for Home readiness");
  assert.equal(subscriptions.has("savedVerses/alex"), false);
  await act(async () => { deliver("profiles/alex", { id: "alex", name: "Alex", createdAt: "2026-10-06" }); deliver("userGroups/alex", null); deliver("privateCheckIns/alex", null); });
  assert.ok(commits.some((state) => state.profileReady && state.userGroupsReady && state.privateCheckInsReady), "Home readiness must commit before personal history work begins");
  assert.equal(subscriptions.has("prayerSessions/alex"), false);
  assert.equal(subscriptions.has("bibleHighlights/alex"), false);
  assert.equal(timers.size, 1);
  await act(async () => { const scheduled = [...timers.values()]; timers.clear(); scheduled.forEach((callback) => callback()); });
  for (const collection of ["journalEntries", "prayerSessions", "savedVerses", "bibleHighlights", "biblePlans"]) assert.ok(subscriptions.has(`${collection}/alex`), `${collection} remains live after Home commits`);
  await act(async () => authenticate("joel"));
  assert.equal([...subscriptions.keys()].some((key) => key.endsWith("/alex")), false, "account changes must stop the previous account's histories");
  await act(async () => { deliver("profiles/joel", { id: "joel", name: "Joel", createdAt: "2026-10-06" }); deliver("userGroups/joel", null); });
  const cancelledTimer = [...timers.values()][0];
  await act(async () => authenticate(null));
  assert.equal(timers.size, 0, "sign-out cancels pending personal history activation");
  await act(async () => cancelledTimer());
  assert.equal(subscriptions.size, 0, "a late cancelled timer cannot restart account subscriptions");
  await act(async () => tree.unmount()); tree = null;
} finally {
  globalThis.setTimeout = nativeSetTimeout; globalThis.clearTimeout = nativeClearTimeout;
  if (tree) await act(async () => tree.unmount());
  delete globalThis.startupProviderFixture;
  await rm(temporary, { recursive: true, force: true });
}

console.log(`Startup validation passed: Home has ${Object.keys(homeOutput.inputs).length} eager modules; Bible stays lazy, Home commits before history subscriptions, and account changes cancel delayed work.`);
