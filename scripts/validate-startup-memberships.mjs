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
const harness = globalThis.__membershipStartup = { listeners: new Map(), writes: [], commits: [], signOutEvents: [], avatarSyncs: 0, rawMembershipExists: false, encryptionGeneration: 0 };
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
    export const onAuthStateChanged = (auth, listener) => {
      const h = globalThis.__membershipStartup;
      h.replaceUser = uid => {
        auth.currentUser = uid ? { uid, email: uid + "@example.test" } : null;
        listener(auth.currentUser);
      };
      h.replaceUser("alex");
      return () => { delete h.replaceUser; };
    };
    export async function signOut(auth) {
      const h = globalThis.__membershipStartup;
      h.signOutEvents.push("firebase");
      if (h.firebaseSignOut) await h.firebaseSignOut(auth);
      else h.replaceUser(null);
    }
    export const signInWithEmailAndPassword = async () => { globalThis.__membershipStartup.signOutEvents.push("sign-in"); },
      createUserWithEmailAndPassword = async () => { globalThis.__membershipStartup.signOutEvents.push("sign-up"); },
      sendPasswordResetEmail = async () => {}, confirmPasswordReset = async () => {}, reauthenticateWithCredential = async () => {}, updatePassword = async () => {};
    export const EmailAuthProvider = { credential: () => ({}) };
  `,
  "@/state/store/firebase": `export const auth = { currentUser: { uid: "alex" } }, database = {}, emulatorMode = false, developmentMode = false;`,
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
  "@/state/encryption/local-storage": `
    export default {
      getItem: async () => null, setItem: async () => {},
      clearContent: async () => {
        const h = globalThis.__membershipStartup;
        h.signOutEvents.push("content");
        await h.clearContent?.();
      },
    };
  `,
  "@/features/bible-audio/engine": `export const stop = async () => { globalThis.__membershipStartup.signOutEvents.push("audio"); };`,
  "@/state/supabase-storage": (imports.get("@/state/supabase-storage") ?? []).map(name =>
    name === "clearEncryptedImages" ? `export const ${name} = () => { globalThis.__membershipStartup.signOutEvents.push("images"); };`
      : `export const ${name} = () => {};`).join("\n"),
  "@/state/encryption/session": `
    export const leaveEncryptedGroup = () => {}, rotateGroup = () => {}, deleteEncryptedGroup = () => {};
    export const sessionGeneration = () => globalThis.__membershipStartup.encryptionGeneration;
    export function lockSession() {
      const h = globalThis.__membershipStartup;
      h.signOutEvents.push("lock");
      h.encryptionGeneration++;
    }
  `,
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
    export const update = async (reference, values, canCommit) => {
      const h = globalThis.__membershipStartup;
      if (canCommit) {
        await h.prepareJournalWrite?.();
        if (!canCommit()) throw new Error("The write audience changed.");
        if (h.journalDenied) throw Object.assign(new Error("Denied"), { code: "permission-denied" });
      }
      h.writes.push({ path: reference.path, values });
    };
    export const get = async () => ({ val: () => null, exists: () => false });
    export const set = async (reference, value, canCommit) => {
      const h = globalThis.__membershipStartup;
      if (canCommit && !canCommit()) throw new Error("The write audience changed.");
      if (canCommit && h.journalDenied) throw Object.assign(new Error("Denied"), { code: "permission-denied" });
      h.writes.push({ path: reference.path, value });
    };
    export const equalTo = () => {}, query = value => value, orderByChild = () => {}, remove = async () => {}, runTransaction = async () => {};
  `,
  "@/ui/theme": `export const normalizeTheme = value => value === "dark" ? "dark" : "light", applyTheme = () => {};`,
  "@/state/store/helpers": (imports.get("@/state/store/helpers") ?? []).map(name =>
    name === "asArray" ? "export const asArray = value => Object.values(value ?? {});"
      : name === "authMessage" ? "export const authMessage = error => error.message;"
        : name === "actionVerses" ? "export const actionVerses = () => [];"
        : name === "id" ? "export const id = prefix => prefix + '-fixture';"
        : name === "validPostContent" ? "export const validPostContent = () => true;"
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
        if (["@/state/check-ins", "@/state/selective-store", "@/state/store/bible-highlights"].includes(name)) return;
        if (name in mocks || imports.has(name)) return { path: name, namespace: "mock" };
        if (name === "@/features/bible-audio/engine") return { path: name, namespace: "mock" };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({
        contents: mocks[name] ?? (imports.get(name) ?? ["stop"]).map(identifier => `export const ${identifier} = () => {};`).join("\n"), loader: "js",
      }));
    } }],
  });
  const { KoinoProvider, useKoino } = require(bundlePath);
  function Observer() {
    harness.current = useKoino();
    const { state } = harness.current;
    React.useLayoutEffect(() => { harness.commits.push(state); }, [state]);
    return React.createElement("Screen");
  }
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
  const shareJournal = { type: "createJournalEntry", body: "Synthetic prayer", entryKind: "prayer_request", shareWithGroup: true, journalScope: { userId: "alex", groupId: "old-community" } };
  const saveJournal = { ...shareJournal, shareWithGroup: false, journalScope: { userId: "alex" } };
  const shareBiblePrayer = { type: "createPost", body: "Synthetic Bible prayer", kind: "prayer_request", expectedScope: shareJournal.journalScope };
  async function expectShareDenied(action = shareJournal, reason = /no longer available/) {
    const count = harness.writes.length;
    await act(async () => { await assert.rejects(harness.current.dispatch(action), reason); });
    assert.equal(harness.writes.length, count, "A denied share must not fall back to a private write");
  }

  await mount();
  assert.ok(harness.listeners.has("privateCheckIns/alex"), "Home check-in status must subscribe immediately");
  assert.ok(!harness.listeners.has("bibleHighlights/alex"), "Large history must wait for authenticated profile and membership");
  await emit("profiles/alex", profile);
  await act(async () => { harness.legacy({ memberships: [], groups: [], ready: true }); harness.listeners.get("userGroups/alex").onError(new Error("Group key unavailable")); });
  assert.equal(harness.current.state.userGroupsReady, true, "An error must let loading UI finish");
  assert.equal(harness.current.state.journalShareGroupId, undefined, "Membership read failure cannot allow Journal sharing");
  await expectShareDenied();
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
  assert.equal(harness.current.state.journalShareGroupId, undefined, "A cached profile selection cannot make a solo user eligible");
  await expectShareDenied();
  await expectShareDenied(shareBiblePrayer);
  await act(async () => { await harness.current.dispatch(saveJournal); });
  const privateWrite = harness.writes.pop();
  assert.equal(privateWrite.path, "journalEntries/alex/journal-fixture");
  assert.equal(privateWrite.value.isPrivate, true);
  assert.equal(privateWrite.value.sharedPostId, undefined);
  assert.equal(privateWrite.value.journalType, "prayer");
  await act(async () => { harness.legacy({ memberships: [member], groups: [], ready: false }); });
  assert.equal(harness.writes.length, 0, "Delayed legacy metadata must not clear the selected group");
  await act(async () => { harness.legacy({ memberships: [member], groups: [pendingGroup], ready: true }); });
  assert.equal(harness.current.state.currentGroupId, "old-community");
  assert.equal(harness.current.state.groups[0].migrationPending, true);
  assert.equal(harness.current.state.memberships[0].groupId, "old-community");
  assert.equal(harness.current.state.journalShareGroupId, undefined);
  await expectShareDenied(shareJournal, /waiting for its host/);
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
  assert.equal(harness.current.state.journalShareGroupId, "old-community");
  await expectShareDenied({ ...shareJournal, journalScope: undefined });
  harness.journalDenied = true;
  await expectShareDenied(shareJournal, { code: "permission-denied" });
  await expectShareDenied(shareBiblePrayer, { code: "permission-denied" });
  await expectShareDenied(saveJournal, { code: "permission-denied" });
  harness.journalDenied = false;
  await act(async () => { await harness.current.dispatch(shareJournal); });
  const sharedWrite = harness.writes.pop();
  assert.equal(sharedWrite.path, "");
  const privateCopy = sharedWrite.values["journalEntries/alex/journal-fixture"];
  assert.equal(privateCopy.isPrivate, false);
  assert.equal(privateCopy.sharedPostId, "post-fixture");
  assert.equal(sharedWrite.values["posts/old-community/post-fixture"].body, privateCopy.body);
  assert.equal(Object.keys(sharedWrite.values).length, 2);
  await act(async () => { await harness.current.dispatch(shareBiblePrayer); });
  const postOnly = harness.writes.pop();
  assert.equal(postOnly.path, "posts/old-community/post-fixture");
  assert.equal(postOnly.value.kind, "prayer_request", "The Bible Journal's existing direct share remains post-only");

  await emit("userGroups/alex", { "old-community": member, "next-community": { ...member, id: "second", groupId: "next-community" } });
  let releaseJournalWrite;
  harness.prepareJournalWrite = () => new Promise(resolve => { releaseJournalWrite = resolve; });
  let queuedShare;
  await act(async () => { queuedShare = harness.current.dispatch(shareJournal); queuedShare.catch(() => undefined); });
  await emit("profiles/alex", { ...profile, currentGroupId: "next-community" });
  assert.equal(harness.current.state.journalShareGroupId, "next-community");
  await act(async () => { releaseJournalWrite(); await assert.rejects(queuedShare, /audience changed/); });
  delete harness.prepareJournalWrite;
  assert.equal(harness.writes.length, 0, "Switching between two approved rooms during preparation cannot send to either room");
  await expectShareDenied();
  await emit("profiles/alex", profile);
  await emit("userGroups/alex", { "old-community": member });

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
  assert.equal(harness.current.state.journalShareGroupId, undefined);
  await expectShareDenied();

  // Exercise auth providers that replace the UID without emitting a signed-out event.
  harness.rawMembershipExists = true;
  const joel = { ...member, id: "joel-membership", userId: "joel", userName: "Joel" };
  await emit("userGroups/alex", { "old-community": member });
  await emit("groupMembers/old-community", { alex: member, joel });
  const oldClaims = { "2026-11-06": { checkInId: "alex-removed", status: "committed", visibility: "group", moderated: true } };
  const oldClaimPath = "checkInDailyClaims/alex/old-community";
  await emit(oldClaimPath, oldClaims);
  assert.equal(harness.current.state.checkInDailyClaims[0].checkInId, "alex-removed");
  const lateOldClaim = harness.listeners.get(oldClaimPath).listener;
  const oldDispatch = harness.current.dispatch;
  const assertScopedMutationsRejected = async (dispatch, expectedScope) => {
    const writesBefore = harness.writes.length;
    await assert.rejects(dispatch({
      type: "submitCheckIn", expectedScope, mood: 3, readToday: true,
      reflectionText: "A stale private draft", visibility: "private",
    }), { code: "unavailable" });
    await assert.rejects(dispatch({
      type: "finishPrayer", expectedScope, targetType: "user", targetId: "member",
      recipientUserId: "member", status: "completed", startedAt: "2026-11-06T12:00:00Z", throwOnError: true,
    }), Error);
    await assert.rejects(dispatch({ ...shareJournal, journalScope: expectedScope }), Error);
    if (expectedScope.userId !== harness.current.state.currentUserId) {
      await assert.rejects(dispatch({ ...saveJournal, journalScope: { userId: expectedScope.userId } }), /account changed/);
    }
    assert.equal(harness.writes.length, writesBefore, "A stale scope cannot attempt any database writes");
  };
  const oldScope = { userId: "alex", groupId: "old-community" };
  const accountSwitchStart = harness.commits.length;
  await act(async () => {
    harness.replaceUser("joel");
    await assertScopedMutationsRejected(oldDispatch, oldScope);
  });
  await act(async () => { lateOldClaim({ val: () => oldClaims }); });
  await emit("profiles/joel", { ...profile, id: "joel", name: "Joel" });
  await emit("userGroups/joel", { "old-community": joel });
  const joelClaimPath = "checkInDailyClaims/joel/old-community";
  assert.ok(harness.listeners.has(joelClaimPath) && !harness.listeners.has(oldClaimPath));
  assert.equal(harness.current.state.checkInDailyClaimsReady, false, "A same-group replacement account waits for its own claims");
  await emit(joelClaimPath, null);
  assert.equal(harness.current.state.checkInDailyClaimsReady, true);
  const joelCommits = harness.commits.slice(accountSwitchStart).filter(state => state.currentUserId === "joel");
  assert.ok(joelCommits.length > 0 && joelCommits.some(state => state.currentGroupId === "old-community"));
  assert.ok(joelCommits.every(state => state.checkInDailyClaims.length === 0), "No committed state exposes the previous account's claim, even in the same group");
  await act(async () => {
    await assertScopedMutationsRejected(oldDispatch, oldScope);
    await assertScopedMutationsRejected(harness.current.dispatch, { userId: "joel", groupId: "another-community" });
  });

  const signOut = () => harness.current.dispatch({ type: "signOut" });
  const activeUser = () => harness.current.state.currentUserId;
  const assertCleared = () => {
    const state = harness.current.state;
    assert.equal(state.currentUserId, undefined);
    assert.equal(state.currentGroupId, undefined);
    for (const field of ["users", "groups", "privateCheckIns", "checkInDailyClaims", "journalEntries", "posts"]) {
      assert.deepEqual(state[field], [], `The old account's ${field} must be cleared`);
    }
  };
  const joelCheckIn = { id: "private-joel", userId: "joel", groupId: "old-community", reflectionText: "Private Joel reflection" };
  await emit("privateCheckIns/joel", { [joelCheckIn.id]: joelCheckIn });

  harness.signOutEvents.length = 0;
  harness.clearContent = () => Promise.reject(new Error("Content storage unavailable"));
  await act(async () => { await assert.rejects(signOut(), /Content storage unavailable/); });
  assert.deepEqual(harness.signOutEvents, ["audio", "images", "content"], "Cleanup failure must stop before Firebase sign-out");
  assert.equal(activeUser(), "joel", "Cleanup failure must retain the signed-in account");
  assert.deepEqual(harness.current.state.privateCheckIns, [joelCheckIn]);

  delete harness.clearContent;
  harness.signOutEvents.length = 0;
  harness.firebaseSignOut = () => Promise.reject(new Error("Firebase sign-out rejected"));
  await act(async () => { await assert.rejects(signOut(), /Firebase sign-out rejected/); });
  assert.deepEqual(harness.signOutEvents, ["audio", "images", "content", "firebase"]);
  assert.equal(activeUser(), "joel", "Ordinary Firebase failure must retain the signed-in account");
  assert.equal(harness.current.state.signOutIncomplete, false);
  assert.deepEqual(harness.current.state.privateCheckIns, [joelCheckIn]);

  harness.signOutEvents.length = 0;
  let finishCleanup, finishFirebase, logout;
  harness.clearContent = () => new Promise(resolve => { finishCleanup = resolve; });
  harness.firebaseSignOut = () => new Promise(resolve => { finishFirebase = resolve; });
  await act(async () => { logout = signOut(); });
  assert.deepEqual(harness.signOutEvents, ["audio", "images", "content"], "Await encrypted cleanup before the SDK request");
  assert.equal(activeUser(), "joel", "Pending encrypted cleanup must retain the signed-in account");
  await act(async () => { await signOut(); });
  assert.deepEqual(harness.signOutEvents, ["audio", "images", "content"], "A second press must not start a competing sign-out");
  await act(async () => { finishCleanup(); });
  assert.equal(harness.signOutEvents.at(-1), "firebase");
  assert.equal(activeUser(), "joel", "Pending Firebase sign-out must retain the signed-in account");
  await act(async () => { harness.replaceUser(null); finishFirebase(); await logout; });
  assertCleared();
  assert.equal(harness.current.state.signOutIncomplete, false);
  assert.ok(!harness.listeners.has("privateCheckIns/joel"), "Signed-out accounts unsubscribe private data");

  delete harness.clearContent;
  await act(async () => { harness.replaceUser("joel"); });
  assert.equal(activeUser(), "joel", "The same account can sign in again");
  assert.deepEqual(harness.current.state.privateCheckIns, [], "A fresh same-account session must load its own snapshot");
  await emit("privateCheckIns/joel", { [joelCheckIn.id]: joelCheckIn });
  harness.signOutEvents.length = 0;
  harness.firebaseSignOut = async auth => {
    // Firebase's React Native implementation updates currentUser before
    // removing persisted credentials. Rejection bypasses the observer.
    auth.currentUser = null;
    throw new Error("Firebase persistence removal rejected");
  };
  await act(async () => { await assert.rejects(signOut(), /Firebase persistence removal rejected/); });
  assertCleared();
  assert.equal(harness.current.state.signOutIncomplete, true, "Incomplete logout requires retry before presenting sign-in");
  assert.deepEqual(harness.signOutEvents, ["audio", "images", "content", "firebase", "lock", "images"], "Partial failure must lock the old encrypted session and invalidate its image cache");
  assert.ok(!harness.listeners.has("privateCheckIns/joel"));
  await act(async () => {
    await harness.current.dispatch({ type: "signIn", email: "other@example.test", password: "example" });
    await harness.current.dispatch({ type: "signUp", email: "other@example.test", password: "example", name: "Other" });
  });
  assert.ok(!harness.signOutEvents.includes("sign-in") && !harness.signOutEvents.includes("sign-up"), "An incomplete logout blocks replacement credentials");

  harness.firebaseSignOut = () => Promise.reject(new Error("Persistence still unavailable"));
  await act(async () => { await assert.rejects(signOut(), /Persistence still unavailable/); });
  assertCleared();
  assert.equal(harness.current.state.signOutIncomplete, true, "Retry rejection must keep login unavailable");

  delete harness.firebaseSignOut;
  await act(async () => { await signOut(); });
  assertCleared();
  assert.equal(harness.current.state.signOutIncomplete, false, "SDK acknowledgement permits sign-in after retry");
  await act(async () => { harness.replaceUser("alex"); });
  assert.equal(activeUser(), "alex");
  assert.deepEqual(harness.current.state.privateCheckIns, [], "A replacement account cannot inherit Joel's private Check-in");
  harness.signOutEvents.length = 0;
  await act(async () => { await harness.current.dispatch({ type: "signOut", expectedUserId: "joel" }); });
  assert.deepEqual(harness.signOutEvents, [], "A stale Account settings callback must not log out a replacement user");
  assert.equal(activeUser(), "alex");
  await act(async () => { await signOut(); });
  assertCleared();

  await act(async () => { harness.replaceUser("joel"); });
  harness.signOutEvents.length = 0;
  harness.clearContent = () => new Promise(resolve => { finishCleanup = resolve; });
  await act(async () => { logout = signOut(); });
  await act(async () => { harness.replaceUser("alex"); });
  await act(async () => { finishCleanup(); await logout; });
  assert.deepEqual(harness.signOutEvents, ["audio", "images", "content"], "A logout in flight must never reach Firebase after the UID changes");
  assert.equal(activeUser(), "alex");
  console.log("Startup memberships passed: prioritized Home subscriptions, deferred history, decryption failure, delayed legacy identity, pending write protection, encrypted admission, authoritative departure, same-group account isolation, and stale mutation rejection.");
  console.log("Auth logout passed: pending cleanup and Firebase acknowledgement, ordinary failure, incomplete Firebase persistence, retry, private data and listener cleanup, and repeated account sessions.");
  console.log("Journal write scope passed: private prayer, pending and departed denial, acknowledged linked share, permission errors, room changes during preparation, and account isolation.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  delete globalThis.__membershipStartup;
  const resolved = path.resolve(temporaryDirectory);
  assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(resolved, { recursive: true, force: true });
}
