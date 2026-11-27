import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectDatabaseEmulator, get, getDatabase, ref, remove, set } from "firebase/database";

const projectId = "demo-koino";
const namespace = "demo-koino-default-rtdb";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9101";
const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions("firebase-admin/app");
const { getDatabase: getAdminDatabase } = requireFromFunctions("firebase-admin/database");
const admin = initializeAdminApp({ projectId, databaseURL: `https://${namespace}.firebaseio.com` }, "fasting-fixtures");
const apps = [];

async function client(label, existingAccount) {
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
  const email = existingAccount?.email ?? `${label}@example.test`;
  const password = existingAccount?.password ?? "test-password-123";
  const credential = existingAccount
    ? await signInWithEmailAndPassword(auth, email, password)
    : await createUserWithEmailAndPassword(auth, email, password);
  return { auth, database, uid: credential.user.uid, email, password };
}

function privateFast(userId, id = "fast-1", overrides = {}) {
  return {
    id,
    userId,
    startDate: "2026-11-27",
    durationDays: 1,
    durationHours: 24,
    timeZone: "Europe/Stockholm",
    startAt: "2026-11-27T17:00:00.000Z",
    endAt: "2026-11-28T17:00:00.000Z",
    status: "active",
    alertEnabled: true,
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z",
    mode: "water",
    schedule: { kind: "continuous" },
    visibility: "private",
    ...overrides,
  };
}

function groupFast(userId, id = "fast-1", joinCutoffMs = Date.now() + 3_600_000, overrides = {}) {
  return {
    id,
    groupId: "group1",
    userId,
    mode: "water",
    schedule: { kind: "continuous" },
    startDate: "2026-11-27",
    startAt: "2026-11-27T17:00:00.000Z",
    endAt: "2026-11-28T17:00:00.000Z",
    durationDays: 1,
    durationHours: 24,
    timeZone: "Europe/Stockholm",
    joinCutoffMs,
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z",
    ...overrides,
  };
}

function participant(userId, personalFastId = "joined-fast") {
  return {
    userId,
    joinedAt: "2026-11-25T10:10:00.000Z",
    personalFastId,
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
    encryptedData: {
      groupMembers: {
        group1: {
          [owner.uid]: { userId: owner.uid },
          [member.uid]: { userId: member.uid },
        },
      },
      fasts: {
        [owner.uid]: { "fast-1": privateFast(owner.uid) },
        [member.uid]: { "fast-2": privateFast(member.uid, "fast-2") },
      },
    },
  });

  await assert.rejects(
    () => get(ref(outsider.database, "encryptedData/groupFasts/group1")),
    denied,
    "An outsider cannot read shared fasts",
  );
  await assert.rejects(
    () => get(ref(member.database, `encryptedData/fasts/${owner.uid}`)),
    denied,
    "A community member cannot read the host's private fast",
  );

  await set(ref(owner.database, "encryptedData/groupFasts/group1/fast-1"), groupFast(owner.uid));
  const readBack = (await get(ref(member.database, "encryptedData/groupFasts/group1/fast-1"))).val();
  assert.equal(readBack.mode, "water", "A member can read a shared fast");

  await assert.rejects(
    () => set(ref(outsider.database, "encryptedData/groupFasts/group1/forged"), groupFast(outsider.uid, "forged")),
    denied,
    "An outsider cannot create a shared fast",
  );
  await assert.rejects(
    () => set(ref(member.database, "encryptedData/groupFasts/group1/forged"), groupFast(owner.uid, "forged")),
    denied,
    "A member cannot publish a fast as another member",
  );
  await assert.rejects(
    () => set(ref(member.database, "encryptedData/groupFasts/group1/no-private"), groupFast(member.uid, "no-private")),
    denied,
    "A shared fast must reference the host's own fast record",
  );

  await set(ref(member.database, "encryptedData/groupFasts/group1/fast-1/participants/" + member.uid), participant(member.uid));
  assert.equal(
    (await get(ref(owner.database, "encryptedData/groupFasts/group1/fast-1/participants"))).val()[member.uid].personalFastId,
    "joined-fast",
    "A member can join before the fast starts",
  );
  await assert.rejects(
    () => set(ref(member.database, "encryptedData/groupFasts/group1/fast-1/participants/" + owner.uid), participant(owner.uid)),
    denied,
    "A member cannot join on behalf of another member",
  );

  await remove(ref(member.database, "encryptedData/groupFasts/group1/fast-1/participants/" + member.uid));
  assert.equal(
    (await get(ref(owner.database, "encryptedData/groupFasts/group1/fast-1/participants"))).val(),
    null,
    "A member can leave before the fast starts",
  );

  // A started fast cannot be joined, and its participant records are frozen.
  await getAdminDatabase(admin).ref(`encryptedData/fasts/${owner.uid}/fast-3`).set(privateFast(owner.uid, "fast-3"));
  await getAdminDatabase(admin).ref("encryptedData/groupFasts/group1/fast-3").set(groupFast(owner.uid, "fast-3", Date.now() - 3_600_000));
  await assert.rejects(
    () => set(ref(member.database, "encryptedData/groupFasts/group1/fast-3/participants/" + member.uid), participant(member.uid)),
    denied,
    "A member cannot join after the fast starts",
  );

  // The host can remove their shared fast; another member cannot.
  await assert.rejects(
    () => remove(ref(member.database, "encryptedData/groupFasts/group1/fast-1")),
    denied,
    "A member cannot delete another member's shared fast",
  );
  await remove(ref(owner.database, "encryptedData/groupFasts/group1/fast-1"));
  assert.equal((await get(ref(owner.database, "encryptedData/groupFasts/group1/fast-1"))).exists(), false);

  // The community owner may remove a fast someone else shared.
  await set(ref(member.database, "encryptedData/groupFasts/group1/fast-2"), groupFast(member.uid, "fast-2"));
  await remove(ref(owner.database, "encryptedData/groupFasts/group1/fast-2"));
  assert.equal((await get(ref(owner.database, "encryptedData/groupFasts/group1/fast-2"))).exists(), false);

  // A malformed participant record is rejected.
  await getAdminDatabase(admin).ref(`encryptedData/fasts/${owner.uid}/fast-4`).set(privateFast(owner.uid, "fast-4"));
  await set(ref(owner.database, "encryptedData/groupFasts/group1/fast-4"), groupFast(owner.uid, "fast-4"));
  await assert.rejects(
    () => set(ref(member.database, "encryptedData/groupFasts/group1/fast-4/participants/" + member.uid), { userId: member.uid }),
    /permission_denied|Permission denied|validation/i,
    "A participant record must carry joinedAt and personalFastId",
  );

  console.log("Group fasting database rules validated.");
} catch (error) {
  failure = error;
} finally {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await deleteAdminApp(admin);
}
if (failure) {
  console.error(failure);
  process.exit(1);
}
process.exit(0);
