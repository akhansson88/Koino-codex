import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { connectDatabaseEmulator, equalTo, get, getDatabase, goOffline, goOnline, limitToLast, onValue, orderByChild, query, ref } from "firebase/database";

const projectId = "demo-koino";
const namespace = "demo-koino-default-rtdb";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9001";
const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions("firebase-admin/app");
const { getDatabase: getAdminDatabase } = requireFromFunctions("firebase-admin/database");
const admin = initializeAdminApp({ projectId, databaseURL: `https://${namespace}.firebaseio.com` }, "query-fixtures");
const apps = [];

async function client(label) {
  const app = initializeApp({ apiKey: "fake-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId,
    databaseURL: `https://${namespace}.firebaseio.com` }, label);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const database = getDatabase(app);
  connectDatabaseEmulator(database, "127.0.0.1", 9001);
  const credential = await createUserWithEmailAndPassword(auth, `${label}@example.test`, "test-password-123");
  return { auth, database, uid: credential.user.uid };
}

try {
  const member = await client("member");
  const outsider = await client("outsider");
  const reactions = Object.fromEntries(Array.from({ length: 120 }, (_, index) => [
    `legacy-${index}`, { id: `legacy-${index}`, userId: index === 17 ? member.uid : `user-${index}`,
      targetType: "post", targetId: index % 3 === 0 || index === 17 ? "target-a" : "target-b",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() },
  ]));
  const posts = Object.fromEntries(Array.from({ length: 55 }, (_, index) => [
    `post-${index}`, { id: `post-${index}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() },
  ]));
  await getAdminDatabase(admin).ref("/").set({
    groupMembers: { group1: { [member.uid]: { userId: member.uid } } },
    prayerReactions: { group1: reactions },
    posts: { group1: posts },
    activityNotifications: { [member.uid]: {
      unread1: { id: "unread1", createdAt: "2026-01-01T00:00:00Z" },
      unread2: { id: "unread2", createdAt: "2026-01-01T00:01:00Z" },
      read1: { id: "read1", readAt: "2026-01-01T00:02:00Z", createdAt: "2026-01-01T00:00:00Z" },
    } },
  });
  const reactionQuery = query(ref(member.database, "prayerReactions/group1"), orderByChild("targetId"), equalTo("target-a"));
  const reactionSnapshot = await get(reactionQuery);
  const matched = Object.values(reactionSnapshot.val() ?? {});
  assert.ok(matched.length < 120 && matched.length > 30);
  assert.ok(matched.every((reaction) => reaction.targetId === "target-a"));
  assert.ok(matched.some((reaction) => reaction.id === "legacy-17" && reaction.userId === member.uid));
  const unread = await get(query(ref(member.database, `activityNotifications/${member.uid}`), orderByChild("readAt"), equalTo(null)));
  assert.deepEqual(Object.keys(unread.val()).sort(), ["unread1", "unread2"]);
  const recent = await get(query(ref(member.database, "posts/group1"), orderByChild("createdAt"), limitToLast(50)));
  assert.equal(Object.keys(recent.val()).length, 50);
  await assert.rejects(() => get(query(ref(outsider.database, "prayerReactions/group1"), orderByChild("targetId"), equalTo("target-a"))), /permission_denied|Permission denied/i);
  const updates = [];
  const unsubscribe = onValue(reactionQuery, (snapshot) => updates.push(Object.keys(snapshot.val() ?? {}).length));
  try {
    await new Promise((resolve, reject) => { const timer = setInterval(() => {
      if (updates.length) { clearInterval(timer); resolve(); }
    }, 20); setTimeout(() => { clearInterval(timer); reject(new Error("Initial listener timed out")); }, 5000); });
    goOffline(member.database);
    await getAdminDatabase(admin).ref("prayerReactions/group1/new-after-resume").set({ id: "new-after-resume", userId: member.uid,
      targetType: "post", targetId: "target-a", createdAt: "2026-01-02T00:00:00Z" });
    goOnline(member.database);
    await new Promise((resolve, reject) => { const timer = setInterval(() => {
      if (updates.at(-1) === matched.length + 1) { clearInterval(timer); resolve(); }
    }, 20); setTimeout(() => { clearInterval(timer); reject(new Error("Reconnect listener timed out")); }, 5000); });
  } finally { unsubscribe(); }
  console.log("Database emulator passed: indexed target/unread queries, legacy records, permissions, 50-record page, and reconnect.");
  await signOut(member.auth);
  await signOut(outsider.auth);
} finally {
  await Promise.all(apps.map(deleteApp));
  await deleteAdminApp(admin);
}
