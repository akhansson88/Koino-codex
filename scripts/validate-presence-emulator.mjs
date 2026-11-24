import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, get, getDatabase, ref, remove, set } from "firebase/database";

const projectId = "demo-koino";
const namespace = "demo-koino-default-rtdb";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9001";
const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions("firebase-admin/app");
const { getDatabase: getAdminDatabase } = requireFromFunctions("firebase-admin/database");
const admin = initializeAdminApp({ projectId, databaseURL: `https://${namespace}.firebaseio.com` }, "presence-fixtures");
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
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const database = getDatabase(app);
  connectDatabaseEmulator(database, "127.0.0.1", 9001);
  const credential = await createUserWithEmailAndPassword(auth, `${label}@example.test`, "test-password-123");
  return { database, uid: credential.user.uid };
}

async function denied(run) {
  try {
    await run();
  } catch (error) {
    assert.match(String(error?.message ?? error), /permission[ _]denied/i);
    return;
  }
  assert.fail("Expected the database rules to deny this operation.");
}

async function main() {
  const member = await client("presence-member");
  const peer = await client("presence-peer");
  const outsider = await client("presence-outsider");
  const groupId = "group-presence";
  const session = (state, at = Date.now()) => ({ state, at, platform: "android" });

  await getAdminDatabase(admin).ref("/").set({
    e2eeGroups: {
      [groupId]: {
        ownerId: member.uid,
        members: {
          [member.uid]: { role: "owner", userId: member.uid },
          [peer.uid]: { role: "member", userId: peer.uid },
        },
      },
    },
  });

  const ownPath = `presence/${groupId}/${member.uid}/sessions/device-a`;
  const peerPath = `presence/${groupId}/${peer.uid}/sessions/device-b`;

  await set(ref(member.database, ownPath), session("online"));
  await set(ref(peer.database, peerPath), session("away"));
  assert.equal((await get(ref(member.database, `presence/${groupId}`))).val()[peer.uid].sessions["device-b"].state, "away");

  // Members can read the community's presence; outsiders cannot.
  await denied(() => get(ref(outsider.database, `presence/${groupId}`)));
  await denied(() => get(ref(outsider.database, `presence/${groupId}/${member.uid}`)));

  // Only the member's own uid may be written.
  await denied(() => set(ref(member.database, peerPath), session("online")));
  await denied(() => set(ref(peer.database, ownPath), session("offline")));

  // Invalid states and missing server timestamps are rejected.
  await denied(() => set(ref(member.database, ownPath), { state: "busy", at: Date.now() }));
  await denied(() => set(ref(member.database, ownPath), { state: "online", at: "now" }));
  await denied(() => set(ref(member.database, ownPath), { state: "online" }));

  // Hidden and away are valid states.
  await set(ref(member.database, ownPath), session("hidden"));
  await set(ref(member.database, ownPath), session("away"));

  // A member can clear their own session (leaving the screen or signing out).
  await remove(ref(member.database, ownPath));
  assert.equal((await get(ref(peer.database, `presence/${groupId}/${member.uid}`))).exists(), false);
}

main()
  .then(async () => {
    await Promise.allSettled(apps.map((app) => deleteApp(app)));
    await deleteAdminApp(admin).catch(() => undefined);
    console.log("Presence database rules validated.");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await Promise.allSettled(apps.map((app) => deleteApp(app)));
    await deleteAdminApp(admin).catch(() => undefined);
    process.exit(1);
  });
