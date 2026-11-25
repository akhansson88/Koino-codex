import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, get, getDatabase, ref, remove, serverTimestamp, set } from "firebase/database";

const projectId = "demo-koino";
const namespace = "demo-koino-default-rtdb";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9101";
const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { deleteApp: deleteAdminApp, initializeApp: initializeAdminApp } = requireFromFunctions("firebase-admin/app");
const { getDatabase: getAdminDatabase } = requireFromFunctions("firebase-admin/database");
const admin = initializeAdminApp({ projectId, databaseURL: `https://${namespace}.firebaseio.com` }, "mirror-fixtures");
const apps = [];

async function client(label) {
  const app = initializeApp({
    apiKey: "fake-api-key",
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    databaseURL: `https://${namespace}.firebaseio.com`,
  }, label);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9199", { disableWarnings: true });
  const database = getDatabase(app);
  connectDatabaseEmulator(database, "127.0.0.1", 9101);
  const credential = await createUserWithEmailAndPassword(auth, `${label}@example.test`, "test-password-123");
  return { database, uid: credential.user.uid };
}

function reading(overrides = {}) {
  return {
    book: "Philippians",
    chapter: 4,
    verse: 13,
    scope: "verse",
    versionId: "reformationsbibeln2026",
    platform: "android",
    at: Date.now(),
    ...overrides,
  };
}

function live(overrides = {}) {
  return {
    anchorOffset: 0.3,
    anchorVerse: 13,
    at: Date.now(),
    book: "Philippians",
    chapter: 4,
    highlights: { 13: "#f2c94c" },
    selection: { start: 13, end: 14 },
    verse: 13,
    versionId: "reformationsbibeln2026",
    ...overrides,
  };
}

const denied = /permission_denied|Permission denied/i;
let failure;

try {
  const sharer = await client("sharer");
  const follower = await client("follower");
  const other = await client("other");
  const outsider = await client("outsider");

  await getAdminDatabase(admin).ref("/").set({
    e2eeGroups: {
      group1: {
        ownerId: sharer.uid,
        members: {
          [sharer.uid]: { userId: sharer.uid },
          [follower.uid]: { userId: follower.uid },
          [other.uid]: { userId: other.uid },
        },
      },
    },
  });

  const followerEntry = `groupReadingFollowers/group1/${sharer.uid}/${follower.uid}`;
  const livePath = `groupReadingLive/group1/${sharer.uid}`;

  // Someone outside the community can neither watch nor follow.
  await assert.rejects(() => get(ref(outsider.database, livePath)), denied, "An outsider cannot read the mirror stream");
  await assert.rejects(
    () => set(ref(outsider.database, followerEntry), { at: Date.now(), userId: outsider.uid }),
    denied,
    "An outsider cannot follow a member",
  );

  // Following requires the other member to be sharing verse level.
  await set(ref(sharer.database, `groupReading/group1/${sharer.uid}`), reading({ scope: "chapter", verse: null }));
  await assert.rejects(
    () => set(ref(follower.database, followerEntry), { at: Date.now(), userId: follower.uid }),
    denied,
    "Chapter-only sharing cannot be followed",
  );

  await set(ref(sharer.database, `groupReading/group1/${sharer.uid}`), reading());

  // A member may follow, but only as themselves.
  await set(ref(follower.database, followerEntry), { at: Date.now(), userId: follower.uid });
  assert.equal((await get(ref(sharer.database, `groupReadingFollowers/group1/${sharer.uid}`))).exists(), true, "The sharer sees who follows");
  assert.equal((await get(ref(follower.database, followerEntry))).exists(), true, "A follower can read their own declaration");
  await assert.rejects(
    () => set(ref(other.database, followerEntry), { at: Date.now(), userId: other.uid }),
    denied,
    "A member cannot write another member's follower entry",
  );
  await assert.rejects(
    () => get(ref(other.database, `groupReadingFollowers/group1/${sharer.uid}`)),
    denied,
    "Only the sharer sees the follower list",
  );

  // The stream may be written only by the sharer, while followed.
  await assert.rejects(
    () => set(ref(follower.database, livePath), live()),
    denied,
    "A follower has no write path to the mirrored reading",
  );

  await set(ref(sharer.database, livePath), live());
  const seen = (await get(ref(follower.database, livePath))).val();
  assert.equal(seen.anchorVerse, 13);
  assert.equal(seen.highlights["13"], "#f2c94c");
  await assert.rejects(() => get(ref(other.database, livePath)), denied, "A non-follower cannot read the stream");
  await assert.rejects(() => get(ref(outsider.database, livePath)), denied, "An outsider cannot read the stream");

  // No follower means no stream: the sharer cannot keep publishing.
  await remove(ref(follower.database, followerEntry));
  await assert.rejects(() => set(ref(sharer.database, livePath), live({ verse: 14 })), denied, "A stream needs a follower");

  // A follower can still leave after the share stopped.
  await set(ref(sharer.database, `groupReading/group1/${sharer.uid}`), reading({ scope: "chapter", verse: null }));
  await set(ref(follower.database, followerEntry), { userId: follower.uid, at: Date.now() }).catch(() => undefined);
  await remove(ref(follower.database, followerEntry));

  // Validation: bad anchors, colours and selections are rejected.
  await set(ref(sharer.database, `groupReading/group1/${sharer.uid}`), reading());
  await set(ref(follower.database, followerEntry), { at: Date.now(), userId: follower.uid });
  for (const [label, payload] of [
    ["anchor offset above one", live({ anchorOffset: 2 })],
    ["missing anchor verse", live({ anchorVerse: null })],
    ["a colour that is not hex", live({ highlights: { 13: "red" } })],
    ["a selection above the verse cap", live({ selection: { start: 1, end: 500 } })],
    ["a non-numeric timestamp", live({ at: "now" })],
  ]) {
    await assert.rejects(() => set(ref(sharer.database, livePath), payload), denied, `${label} is rejected`);
  }

  // A server timestamp resolves and validates.
  await set(ref(sharer.database, livePath), live({ at: serverTimestamp() }));
  const stamped = (await get(ref(follower.database, livePath))).val();
  assert.equal(typeof stamped.at, "number", "The server timestamp resolves to a number");

  // Turning verse sharing off must remove the stream immediately, not leave it
  // behind until the daily sweep.
  await set(ref(sharer.database, `groupReading/group1/${sharer.uid}`), reading({ scope: "chapter", verse: null }));
  await remove(ref(sharer.database, livePath));
  assert.equal((await get(ref(sharer.database, livePath))).exists(), false, "A stopped share can remove its stream");
  await assert.rejects(() => set(ref(sharer.database, livePath), live()), denied, "A chapter-only share cannot republish a stream");
  await set(ref(sharer.database, `groupReading/group1/${sharer.uid}`), reading());

  // A frozen community stops new mirror writes but lets the sharer stop.
  await getAdminDatabase(admin).ref("e2eeGroupLocks/group1").set(true);
  await assert.rejects(() => set(ref(sharer.database, livePath), live({ verse: 14 })), denied, "A locked community rejects new streams");
  await remove(ref(sharer.database, livePath));
  await getAdminDatabase(admin).ref("e2eeGroupLocks/group1").remove();

  // A follower who leaves the community loses access and can no longer follow.
  await getAdminDatabase(admin).ref(`e2eeDepartures/group1/${follower.uid}`).set(true);
  await assert.rejects(() => get(ref(follower.database, livePath)), denied, "A departed follower cannot read the stream");
  await assert.rejects(
    () => set(ref(follower.database, followerEntry), { at: Date.now(), userId: follower.uid }),
    denied,
    "A departed member cannot follow",
  );
} catch (error) {
  failure = error;
} finally {
  for (const app of apps) await deleteApp(app).catch(() => undefined);
  await deleteAdminApp(admin).catch(() => undefined);
}

if (failure) {
  console.error(failure);
  process.exit(1);
}
console.log("reading mirror rules: all checks passed");
process.exit(0);
