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
const admin = initializeAdminApp({ projectId, databaseURL: `https://${namespace}.firebaseio.com` }, "events-fixtures");
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

function event(userId, overrides = {}) {
  return {
    id: "event-1",
    groupId: "group1",
    userId,
    kind: "prayer_meeting",
    title: "Thursday prayer",
    startAt: "2026-11-26T18:00:00.000Z",
    endAt: "2026-11-26T19:30:00.000Z",
    reminderMinutes: [1440, 60],
    createdAt: "2026-11-24T10:00:00.000Z",
    updatedAt: "2026-11-24T10:00:00.000Z",
    ...overrides,
  };
}

function rsvp(userId, overrides = {}) {
  return {
    id: userId,
    userId,
    groupId: "group1",
    eventId: "event-1",
    status: "going",
    createdAt: "2026-11-24T10:00:00.000Z",
    updatedAt: "2026-11-24T10:00:00.000Z",
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
    encryptedData: {
      groupMembers: {
        group1: {
          [owner.uid]: { userId: owner.uid },
          [member.uid]: { userId: member.uid },
        },
      },
    },
  });

  await assert.rejects(
    () => get(ref(outsider.database, "encryptedData/groupEvents/group1")),
    denied,
    "An outsider cannot read community events",
  );
  await assert.rejects(
    () => set(ref(outsider.database, "encryptedData/groupEvents/group1/event-1"), event(outsider.uid)),
    denied,
    "An outsider cannot create a community event",
  );

  const memberEvent = event(member.uid);
  await set(ref(member.database, "encryptedData/groupEvents/group1/event-1"), memberEvent);
  const readBack = (await get(ref(owner.database, "encryptedData/groupEvents/group1/event-1"))).val();
  assert.equal(readBack.title, "Thursday prayer", "A member can create an event the community can read");

  await assert.rejects(
    () => set(ref(member.database, "encryptedData/groupEvents/group1/event-1"), event(owner.uid)),
    denied,
    "A member cannot rewrite an event as somebody else",
  );
  await assert.rejects(
    () => set(ref(member.database, "encryptedData/groupEvents/group1/event-1"), event(member.uid, { groupId: "group2" })),
    denied,
    "An event must keep its community id",
  );

  await set(ref(member.database, "encryptedData/eventRsvps/group1/event-1/" + member.uid), rsvp(member.uid, { status: "maybe" }));
  assert.equal((await get(ref(owner.database, "encryptedData/eventRsvps/group1/event-1"))).val()[member.uid].status, "maybe");
  await set(ref(member.database, "encryptedData/eventRsvps/group1/event-1/" + member.uid), rsvp(member.uid, { status: "going" }));
  await assert.rejects(
    () => set(ref(member.database, "encryptedData/eventRsvps/group1/event-1/" + owner.uid), rsvp(owner.uid)),
    denied,
    "A member cannot answer for another member",
  );
  await assert.rejects(
    () => set(ref(member.database, "encryptedData/eventRsvps/group1/missing-event/" + member.uid), rsvp(member.uid, { eventId: "missing-event" })),
    denied,
    "An RSVP must point at an existing event",
  );
  await assert.rejects(
    () => get(ref(outsider.database, "encryptedData/eventRsvps/group1/event-1")),
    denied,
    "An outsider cannot read RSVPs",
  );

  await getAdminDatabase(admin).ref("encryptedData/groupEvents/group1/event-2").set(event(owner.uid, { id: "event-2" }));
  await assert.rejects(
    () => remove(ref(member.database, "encryptedData/groupEvents/group1/event-2")),
    denied,
    "A member cannot delete somebody else's event",
  );
  await remove(ref(member.database, "encryptedData/groupEvents/group1/event-1"));
  assert.equal((await get(ref(member.database, "encryptedData/groupEvents/group1/event-1"))).exists(), false);

  await assert.rejects(
    () => remove(ref(member.database, "encryptedData/groupEvents/group1/event-2")),
    denied,
    "The owner's event stays under the owner's control",
  );
  await remove(ref(member.database, "encryptedData/eventRsvps/group1/event-1/" + member.uid));
  await remove(ref(owner.database, "encryptedData/groupEvents/group1/event-2"));

  console.log("Event database rules validated.");
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

