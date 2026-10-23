import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "koino-startup-memberships-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const harness = globalThis.__membershipStartup = { listeners: new Map(), writes: [], avatarSyncs: 0, rawMembershipExists: false };
const source = await readFile(path.join(projectRoot, "state/koino-store.tsx"), "utf8");
const imports = new Map();
for (const node of ts.createSourceFile("store.tsx", source, ts.ScriptTarget.Latest, true).statements) {
  if (!ts.isImportDeclaration(node)) continue;
  const name = node.moduleSpecifier.text;
  const bindings = node.importClause?.namedBindings;
  const names = bindings && ts.isNamedImports(bindings) ? bindings.elements.map(item => item.propertyName?.text ?? item.name.text) : [];
  imports.set(name, [...new Set([...(imports.get(name) ?? []), ...names])]);
}
const mocks = {
  "@firebase/auth": `
    export const onAuthStateChanged = (_, listener) => { listener({ uid: "alex", email: "alex@example.test" }); return () => {}; };
    export const signInWithEmailAndPassword = async () => {}, createUserWithEmailAndPassword = async () => {}, signOut = async () => {},
      sendPasswordResetEmail = async () => {}, confirmPasswordReset = async () => {}, reauthenticateWithCredential = async () => {}, updatePassword = async () => {};
    export const EmailAuthProvider = { credential: () => ({}) };
  `,
  "@/state/store/firebase": `export const auth = { currentUser: { uid: "alex" } }, database = {};`,
  "firebase/database": `
    export const onValue = (reference, listener, onError) => {
      globalThis.__membershipStartup.listeners.set(reference.path, { listener, onError });
      return () => globalThis.__membershipStartup.listeners.delete(reference.path);
    };
    export const ref = (_, path) => ({ path });
    export const get = async () => {
      const harness = globalThis.__membershipStartup;
      if (harness.deferPresence) return new Promise(resolve => { harness.resolvePresence = exists => resolve({ exists: () => exists }); });
      const exists = harness.rawMembershipExists;
      return { exists: () => exists };
    };
  `,
  "@/state/encryption/local-storage": `export default { getItem: async () => null, setItem: async () => {}, clearContent: async () => {} };`,
  "@/state/encryption/migration": `
    export const listenLegacyCommunities = (_, listener, onError) => {
      globalThis.__membershipStartup.legacy = listener;
      globalThis.__membershipStartup.legacyError = onError;
      return () => {};
    };
  `,
  "@/state/encryption/database": `
    export const ref = (_, path = "") => ({ path });
    export const onValue = (reference, listener, onError) => {
      globalThis.__membershipStartup.listeners.set(reference.path, { listener, onError });
      return () => globalThis.__membershipStartup.listeners.delete(reference.path);
    };
    export const update = async (reference, values) => { globalThis.__membershipStartup.writes.push({ path: reference.path, values }); };
    export const get = async () => ({ val: () => null, exists: () => false });
    export const set = async (reference, value) => { globalThis.__membershipStartup.writes.push({ path: reference.path, value }); };
    export const equalTo = () => {}, query = value => value, orderByChild = () => {}, remove = async () => {}, runTransaction = async () => {};
  `,
  "@/ui/theme": `export const normalizeTheme = value => value === "dark" ? "dark" : "light", applyTheme = () => {};`,
  "@/state/store/helpers": (imports.get("@/state/store/helpers") ?? []).map(name =>
    name === "asArray" ? "export const asArray = value => Object.values(value ?? {});"
      : name === "authMessage" ? "export const authMessage = error => error.message;"
        : `export const ${name} = () => {};`).join("\n"),
  "@/state/firebase-pagination": `
    export const FIREBASE_PAGE_SIZE = 50, recentFirebaseQuery = value => value,
      firebaseRecords = value => Object.values(value ?? {}), mergeFirebaseRecords = (...values) => values.flat(), fetchOlderFirebasePage = async () => ({});
  `,
  "@/state/store/image-operations": (imports.get("@/state/store/image-operations") ?? []).map(name =>
    name === "syncUserMembershipImage" ? "export const syncUserMembershipImage = async () => { globalThis.__membershipStartup.avatarSyncs++; };"
      : `export const ${name} = async () => {};`).join("\n"),
};
let renderer;
try {
  const bundlePath = path.join(temporaryDirectory, "store.cjs");
  await build({
    entryPoints: [path.join(projectRoot, "state/koino-store.tsx")], bundle: true,
    format: "cjs", platform: "node", outfile: bundlePath, jsx: "automatic",
    tsconfig: path.join(projectRoot, "tsconfig.json"),
    plugins: [{ name: "native-test-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
        if (["@/state/selective-store", "@/state/store/bible-highlights"].includes(name)) return;
        if (name in mocks || imports.has(name)) return { path: name, namespace: "mock" };
        if (name === "@/features/bible-audio/engine") return { path: name, namespace: "mock" };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({
        contents: mocks[name] ?? (imports.get(name) ?? ["stop"]).map(identifier => `export const ${identifier} = () => {};`).join("\n"), loader: "js",
      }));
    } }],
  });
  const { KoinoProvider, useKoino } = require(bundlePath);
  function Observer() { harness.current = useKoino(); return React.createElement("Screen"); }
  const mount = async () => {
    harness.writes.length = 0;
    await act(async () => { renderer = create(React.createElement(KoinoProvider, null, React.createElement(Observer))); });
  };
  const emit = async (name, value) => {
    const subscription = harness.listeners.get(name);
    assert.ok(subscription, `Missing subscription: ${name}`);
    await act(async () => { subscription.listener({ val: () => value, exists: () => value !== null }); });
  };
  const profile = { id: "alex", name: "Alex", currentGroupId: "old-community", createdAt: "2026-01-01" };
  const member = { id: "membership", userId: "alex", userName: "Alex", groupId: "old-community", role: "member", createdAt: "2026-01-01" };
  const pendingGroup = { id: "old-community", name: "Alex and Joel", ownerId: "joel", migrationPending: true, createdAt: "2026-01-01" };

  await mount();
  assert.ok(harness.listeners.has("privateCheckIns/alex"), "Home check-in status must subscribe immediately");
  assert.ok(!harness.listeners.has("bibleHighlights/alex"), "Large history must wait for authenticated profile and membership");
  await emit("profiles/alex", profile);
  await act(async () => { harness.legacy({ memberships: [], groups: [], ready: true }); harness.listeners.get("userGroups/alex").onError(new Error("Group key unavailable")); });
  assert.equal(harness.current.state.userGroupsReady, true, "An error must let loading UI finish");
  assert.equal(harness.writes.length, 0, "A failed membership decrypt must never clear currentGroupId");
  assert.equal(harness.avatarSyncs, 0, "A failed membership snapshot must not fan out profile mutations");
  await act(async () => { renderer.unmount(); });

  await mount();
  await emit("profiles/alex", profile);
  await emit("userGroups/alex", null);
  assert.equal(harness.current.state.profileReady, true);
  assert.equal(harness.current.state.userGroupsReady, true);
  assert.ok(!harness.listeners.has("bibleHighlights/alex"), "Profile and membership must commit before large history starts");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 65)); });
  assert.ok(harness.listeners.has("bibleHighlights/alex"), "Large history must start after the initial screen commit");
  assert.equal(harness.writes.length, 0, "Encrypted-only empty membership must wait for legacy routing");
  await act(async () => { harness.legacy({ memberships: [member], groups: [], ready: false }); });
  assert.equal(harness.writes.length, 0, "Delayed legacy metadata must not clear the selected group");
  await act(async () => { harness.legacy({ memberships: [member], groups: [pendingGroup], ready: true }); });
  assert.equal(harness.current.state.currentGroupId, "old-community");
  assert.equal(harness.current.state.groups[0].migrationPending, true);
  assert.equal(harness.current.state.memberships[0].groupId, "old-community");
  assert.ok(!harness.listeners.has("groups/old-community"), "Pending groups must not open encrypted metadata listeners");
  assert.ok(!harness.listeners.has("posts/old-community"), "Pending groups must not open encrypted content listeners");
  await act(async () => { await harness.current.dispatch({ type: "createPost", body: "Draft", kind: "thought" }); });
  assert.equal(harness.writes.length, 0, "Pending groups must reject group content mutations");
  assert.match(harness.current.state.authError, /waiting for its host/);

  harness.rawMembershipExists = true;
  await act(async () => { harness.legacy({ memberships: [], groups: [], ready: true }); });
  assert.equal(harness.writes.length, 0, "Removing the pending marker before decoded admission must preserve a membership already present on the server");
  assert.equal(harness.current.state.currentGroupId, "old-community");
  await emit("userGroups/alex", { "old-community": member });
  assert.ok(harness.listeners.has("groups/old-community"), "Restored encrypted membership should start metadata listeners");
  assert.ok(harness.listeners.has("posts/old-community"), "Restored encrypted membership should start content listeners");
  await emit("groups/old-community", { ...pendingGroup, migrationPending: undefined });
  assert.equal(harness.current.state.groups[0].migrationPending, undefined, "Encrypted metadata must replace transitional legacy identity");
  assert.equal(harness.writes.length, 0, "A restored membership must preserve the selected group");

  const oldPost = { id: "moderated", groupId: "old-community", userId: "joel", body: "Removed content", createdAt: "2026-01-01" };
  const specialPosts = Object.fromEntries(["__proto__", "constructor", "prototype"].map(id => [id, { ...oldPost, id }]));
  await emit("posts/old-community", { moderated: oldPost, ...specialPosts });
  assert.equal(harness.current.state.posts.length, 4);
  await emit("moderationTombstones/old-community", { post: { moderated: { removedAt: "2026-10-22" } } });
  assert.deepEqual(harness.current.state.posts.map(item => item.id).sort(), Object.keys(specialPosts).sort(), "Only real own tombstones may hide content; inherited keys are not tombstones");
  await emit("posts/old-community", { moderated: oldPost, ...specialPosts });
  assert.deepEqual(harness.current.state.posts.map(item => item.id).sort(), Object.keys(specialPosts).sort(), "Stale snapshots must not resurrect removed content");
  await emit("replies/old-community", { late: { id: "late", userId: "alex", targetType: "post", targetId: "moderated" } });
  assert.equal(harness.current.state.replies.length, 0, "Replies to moderated parents must stay hidden");
  harness.deferPresence = true;
  await emit("userGroups/alex", null);
  assert.equal(typeof harness.resolvePresence, "function");
  await emit("userGroups/alex", { "old-community": member });
  await act(async () => { harness.resolvePresence(false); });
  assert.equal(harness.writes.length, 0, "A stale absence check must not overwrite a newly decoded admission");
  harness.deferPresence = false;

  harness.rawMembershipExists = false;
  await emit("userGroups/alex", null);
  await act(async () => { harness.legacy({ memberships: [], groups: [], ready: true }); });
  assert.deepEqual(harness.writes.at(-1), { path: "profiles/alex", values: { currentGroupId: null } }, "Authoritative absence from both sources should still clear a departed group");
  console.log("Startup memberships passed: prioritized Home subscriptions, deferred history, decryption failure, delayed legacy identity, pending write protection, encrypted admission, and authoritative departure.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  delete globalThis.__membershipStartup;
  const resolved = path.resolve(temporaryDirectory);
  assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(resolved, { recursive: true, force: true });
}
