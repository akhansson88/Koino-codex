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
const admin = initializeAdminApp({ projectId, databaseURL: `https://${namespace}.firebaseio.com` }, "reading-fixtures");
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

const denied = /permission_denied|Permission denied/i;
let failure;

try {
  const owner = await client("owner");
  const member = await client("member");
  const outsider = await client("outsider");

  await getAdminDatabase(admin).ref("/").set({
    e2eeGroups: {
      group1: {
        ownerId: owner.uid,
        members: {
          [owner.uid]: { userId: owner.uid },
          [member.uid]: { userId: member.uid },
        },
      },
    },
  });

  // Outsiders see nothing and write nothing.
  await assert.rejects(() => get(ref(outsider.database, "groupReading/group1")), denied, "An outsider cannot read reading positions");
  await assert.rejects(
    () => set(ref(outsider.database, `groupReading/group1/${outsider.uid}`), reading()),
    denied,
    "An outsider cannot publish a reading position",
  );

  // A member publishes their own position and the community can read it.
  await set(ref(member.database, `groupReading/group1/${member.uid}`), reading());
  const readBack = (await get(ref(owner.database, `groupReading/group1/${member.uid}`))).val();
  assert.equal(readBack.book, "Philippians");
  assert.equal(readBack.chapter, 4);
  assert.equal(readBack.verse, 13);
  assert.equal(readBack.scope, "verse");

  // Chapter-level sharing must not carry a verse at all.
  await set(ref(member.database, `groupReading/group1/${member.uid}`), reading({ scope: "chapter", verse: null }));
  const chapterOnly = (await get(ref(owner.database, `groupReading/group1/${member.uid}`))).val();
  assert.equal(chapterOnly.scope, "chapter");
  assert.equal(chapterOnly.verse, undefined, "A chapter-level record carries no verse");

  // Nobody can publish under another member's id.
  await assert.rejects(
    () => set(ref(member.database, `groupReading/group1/${owner.uid}`), reading()),
    denied,
    "A member cannot publish a position for somebody else",
  );

  // Malformed records are rejected by validation.
  await assert.rejects(
    () => set(ref(member.database, `groupReading/group1/${member.uid}`), reading({ scope: "all" })),
    denied,
    "An unknown scope is rejected",
  );
  await assert.rejects(
    () => set(ref(member.database, `groupReading/group1/${member.uid}`), reading({ verse: null })),
    denied,
    "A verse-level record without a verse is rejected",
  );
  await assert.rejects(
    () => set(ref(member.database, `groupReading/group1/${member.uid}`), reading({ chapter: 0 })),
    denied,
    "A chapter below one is rejected",
  );
  await assert.rejects(
    () => set(ref(member.database, `groupReading/group1/${member.uid}`), reading({ at: "now" })),
    denied,
    "A non-numeric timestamp is rejected",
  );

  // A server timestamp is what the app writes and must validate as a number.
  const serverTime = set(ref(member.database, `groupReading/group1/${member.uid}`), {
    ...reading(),
    at: serverTimestamp(),
  });
  await serverTime;
  const stamped = (await get(ref(owner.database, `groupReading/group1/${member.uid}`))).val();
  assert.equal(typeof stamped.at, "number", "The server timestamp resolves to a number");

  // Turning sharing off deletes the record.
  await remove(ref(member.database, `groupReading/group1/${member.uid}`));
  assert.equal((await get(ref(owner.database, `groupReading/group1/${member.uid}`))).exists(), false);

  // A frozen community blocks new publishes but still lets a member stop sharing.
  await set(ref(member.database, `groupReading/group1/${member.uid}`), reading());
  await getAdminDatabase(admin).ref("e2eeGroupLocks/group1").set(true);
  await assert.rejects(
    () => set(ref(member.database, `groupReading/group1/${member.uid}`), reading({ verse: 14 })),
    denied,
    "A locked community rejects new positions",
  );
  await remove(ref(member.database, `groupReading/group1/${member.uid}`));
  assert.equal((await get(ref(owner.database, `groupReading/group1/${member.uid}`))).exists(), false, "A member can still stop sharing in a locked community");
  await getAdminDatabase(admin).ref("e2eeGroupLocks/group1").remove();

  // A member who left loses both read and write access immediately.
  await set(ref(member.database, `groupReading/group1/${member.uid}`), reading());
  await getAdminDatabase(admin).ref(`e2eeDepartures/group1/${member.uid}`).set(true);
  await assert.rejects(() => get(ref(member.database, "groupReading/group1")), denied, "A departed member cannot read positions");
  await assert.rejects(
    () => set(ref(member.database, `groupReading/group1/${member.uid}`), reading({ verse: 15 })),
    denied,
    "A departed member cannot publish a position",
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
console.log("reading rules: all checks passed");
process.exit(0);
