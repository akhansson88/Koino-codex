import "./firebase-emulator-guard.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, set, get, goOffline, goOnline } from "firebase/database";
import { crypto } from "./encryption-test-helpers.mjs";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9001";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: adminInit, deleteApp: adminDelete } = require("firebase-admin/app");
const { getDatabase: adminDatabase } = require("firebase-admin/database");
const { encryptedAccount } = require("../functions/lib/encryption.js");
const projectId = "demo-koino", databaseURL = "https://demo-koino-default-rtdb.firebaseio.com";
const admin = adminInit({ projectId, databaseURL }, "moderation");
const db = adminDatabase(admin), apps = [], key = crypto.randomKey();
async function client(name) {
  const app = initializeApp({ apiKey: "fake", projectId, databaseURL }, name); apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const database = getDatabase(app); connectDatabaseEmulator(database, "127.0.0.1", 9001);
  const { user } = await createUserWithEmailAndPassword(auth, `${name}@example.test`, "test-password-123");
  return { uid: user.uid, database, identity: crypto.identity() };
}
const denied = action => assert.rejects(action, /permission.denied|authorized|community owner/i);
const request = (user, targetType, targetId) => {
  const payload = { operation: "removeCommunityContent", data: { groupId: "room", targetType, targetId }, deviceId: "phone", requestId: crypto.randomKey(), timestamp: Date.now() };
  return { auth: { uid: user.uid }, data: { ...payload, signature: crypto.signature(payload, user.identity.signingPrivateKey) } };
};
try {
  const A = await client("moderation-owner"), B = await client("moderation-member"), C = await client("moderation-outsider");
  await db.ref().set({
    e2eeAccounts: Object.fromEntries([A,B,C].map(u => [u.uid, { personalEpoch: 1, devices: { phone: { active: true, signingPublicKey: u.identity.signingPublicKey } } }])),
    e2eeSigners: Object.fromEntries([A,B,C].map(u => [u.identity.signingPublicKey, { uid: u.uid, active: true }])),
    e2eeGroups: {
      room: { ownerId: A.uid, epoch: 1, members: { [A.uid]: true, [B.uid]: true } },
      unrelated: { ownerId: C.uid, epoch: 1, members: { [C.uid]: true } },
    },
    encryptedData: { posts: { unrelated: { keep: { userId: C.uid, body: crypto.encrypt("Unrelated secret", "posts/unrelated/keep/body", "group:unrelated:1", crypto.randomKey(), C.identity) } } } },
  });
  const cipher = (value, path, scope = "group:room:1") => crypto.encrypt(value, path, scope, key, B.identity);
  const privateEntry = { userId: B.uid, body: cipher("Private journal", `journalEntries/${B.uid}/private/body`, `user:${B.uid}:1`) };
  await set(ref(B.database, `encryptedData/journalEntries/${B.uid}/private`), privateEntry);
  await denied(() => get(ref(A.database, `encryptedData/journalEntries/${B.uid}`)));
  await db.ref(`encryptedData/privateCheckIns/${B.uid}/private`).set({ userId: B.uid, reflectionText: cipher("Private check-in", `privateCheckIns/${B.uid}/private/reflectionText`, `user:${B.uid}:1`) });
  await db.ref(`encryptedData/prayerSessions/${B.uid}/dwell`).set({ userId: B.uid, body: cipher("Prayer Dwell", `prayerSessions/${B.uid}/dwell/body`, `user:${B.uid}:1`) });
  const preservedPrivate = (await db.ref(`encryptedData/privateCheckIns/${B.uid}`).get()).val();
  const preservedDwell = (await db.ref(`encryptedData/prayerSessions/${B.uid}`).get()).val();
  const preservedOtherGroup = (await db.ref("encryptedData/posts/unrelated").get()).val();
  const preservedIdentities = (await db.ref("e2eeAccounts").get()).val();
  await denied(() => get(ref(A.database, `encryptedData/privateCheckIns/${B.uid}`)));
  await denied(() => get(ref(A.database, "encryptedData/posts/unrelated")));
  for (const [targetType, kind] of [["post","reflection"],["post","prayer_request"],["post","praise"],["check_in","checkin"],["reply","reply"]]) {
    const targetId = kind, collection = targetType === "post" ? "posts" : targetType === "check_in" ? "checkIns" : "replies";
    const logical = `${collection}/room/${targetId}`, path = `encryptedData/${logical}`;
    if (targetType === "reply") await set(ref(B.database, "encryptedData/posts/room/parent"), { userId: B.uid, body: cipher("Parent", "posts/room/parent/body") });
    const record = { ...(targetType === "post" ? { kind: cipher(kind, `${logical}/kind`) } : {}), userId: B.uid, groupId: "room", createdAt: "2026-10-22", body: cipher("Shared secret", `${logical}/body`),
      ...(targetType === "check_in" ? { dayKey: "2026-10-22", visibility: "group" } : {}),
      ...(targetType === "reply" ? { targetType: "post", targetId: "parent" } : {}) };
    await set(ref(B.database, path), record);
    if (targetType === "check_in") await set(ref(B.database, `encryptedData/checkInDailyClaims/${B.uid}/room/2026-10-22`), { dayKey: "2026-10-22", checkInId: targetId, visibility: "group", status: "committed", createdAt: 1 });
    await denied(() => set(ref(A.database, path), null));
    await denied(() => set(ref(A.database, `${path}/body`), cipher("Forged", `${logical}/body`)));
    await denied(() => encryptedAccount.run(request(B,targetType,targetId)));
    await denied(() => encryptedAccount.run(request(C,targetType,targetId)));
    const childId = targetType === "reply" ? targetId : `${targetId}-child`;
    if (targetType !== "reply") await set(ref(B.database, `encryptedData/replies/room/${childId}`), { userId: B.uid, targetType, targetId, body: cipher("Related reply", `replies/room/${childId}/body`) });
    const prayerId = `${targetId}-prayer`;
    await set(ref(B.database, `encryptedData/prayerReactions/room/${prayerId}`), { userId: B.uid, targetType: "reply", targetId: childId, durationSeconds: cipher(12, `prayerReactions/room/${prayerId}/durationSeconds`) });
    if (targetType !== "reply") {
      const reactionId = `${targetId}-reaction`;
      await set(ref(B.database, `encryptedData/postReactions/room/${reactionId}`), { userId: B.uid, targetType, targetId, kind: cipher("heart", `postReactions/room/${reactionId}/kind`) });
      await db.ref(`encryptedData/discussionFollowers/room/${targetType}/${targetId}/${B.uid}`).set({ userId: B.uid, targetType, targetId });
      await db.ref(`encryptedData/userDiscussionFollows/${B.uid}/room/${targetId}`).set({ userId: B.uid, targetType, targetId });
    }
    await db.ref(`encryptedData/activityNotifications/${B.uid}/${targetId}`).set({ groupId: "room", targetType: targetType === "reply" ? "post" : targetType, targetId: targetType === "reply" ? "parent" : targetId, replyId: childId });
    const removal = request(A,targetType,targetId);
    if (kind === "reflection") {
      const beforeFailure = (await db.ref().get()).val();
      const transport = globalThis.fetch;
      globalThis.fetch = (url, options) => options?.method === "PUT" ? Promise.resolve(new Response("injected failure", { status: 503 })) : transport(url, options);
      try { await assert.rejects(encryptedAccount.run(removal), /could not be committed/); } finally { globalThis.fetch = transport; }
      assert.deepEqual((await db.ref().get()).val(), beforeFailure, "A failed commit cannot leave partial cleanup or audit data");
    }
    const queued = [];
    if (kind === "reflection") {
      goOffline(B.database);
      const queue = promise => queued.push(promise.then(() => { throw Error("Offline write unexpectedly accepted"); }, error => assert.match(String(error), /permission.denied/i)));
      queue(set(ref(B.database, path), record));
      queue(set(ref(B.database, "encryptedData/replies/room/offline-reply"), { userId: B.uid, targetType, targetId, body: cipher("Queued", "replies/room/offline-reply/body") }));
      queue(set(ref(B.database, "encryptedData/postReactions/room/offline-reaction"), { userId: B.uid, targetType, targetId, kind: cipher("heart", "postReactions/room/offline-reaction/kind") }));
      await Promise.resolve();
    }
    // Force a concurrent child into the ETag window. Removal must re-read it.
    const originalFetch = globalThis.fetch; let conflicted = false;
    globalThis.fetch = async (url, options) => {
      if (!conflicted && options?.method === "PUT" && targetType !== "reply") {
        conflicted = true;
        await db.ref("encryptedData/replies/room/concurrent").set({ userId: B.uid, targetType, targetId });
      }
      return originalFetch(url,options);
    };
    try { await encryptedAccount.run(removal); } finally { globalThis.fetch = originalFetch; }
    goOnline(B.database);
    await Promise.all(queued);
    await encryptedAccount.run(removal); // same signed request: semantic retry succeeds
    const auditBefore = (await db.ref("moderationActions").get()).val();
    await encryptedAccount.run(request(A,targetType,targetId));
    assert.deepEqual((await db.ref("moderationActions").get()).val(),auditBefore);
    for (const user of [A,B]) assert.equal((await get(ref(user.database,path))).exists(),false);
    assert.equal((await db.ref("encryptedData/replies/room/concurrent").get()).exists(),false);
    assert.equal((await db.ref(`encryptedData/replies/room/${childId}`).get()).exists(), false);
    assert.equal((await db.ref(`encryptedData/prayerReactions/room/${prayerId}`).get()).exists(), false);
    assert.equal((await db.ref(`encryptedData/activityNotifications/${B.uid}/${targetId}`).get()).exists(), false);
    if (targetType !== "reply") {
      assert.equal((await db.ref(`encryptedData/postReactions/room/${targetId}-reaction`).get()).exists(), false);
      assert.equal((await db.ref(`encryptedData/discussionFollowers/room/${targetType}/${targetId}`).get()).exists(), false);
      assert.equal((await db.ref(`encryptedData/userDiscussionFollows/${B.uid}/room/${targetId}`).get()).exists(), false);
    }
    await denied(() => set(ref(A.database, `moderationTombstones/room/${targetType}/${targetId}`), null));
    await denied(() => get(ref(B.database, `moderationActions/room/${targetType}/${targetId}`)));
    await denied(() => get(ref(C.database, `moderationTombstones/room/${targetType}/${targetId}`)));
    const audit = (await get(ref(A.database, `moderationActions/room/${targetType}/${targetId}`))).val();
    assert.deepEqual(Object.keys(audit).sort(), ["action", "actorUserId", "authorUserId", "createdAt", "targetId", "targetType"]);
    await denied(() => set(ref(B.database,path),record));
    if (targetType !== "reply") await denied(() => set(ref(B.database,"encryptedData/replies/room/stale"), { userId:B.uid,targetType,targetId,body:cipher("Stale","replies/room/stale/body") }));
    if (targetType === "check_in") {
      await denied(() => set(ref(B.database,`encryptedData/checkInDailyClaims/${B.uid}/room/2026-10-22`),null));
      await denied(() => set(ref(B.database,"encryptedData/checkIns/room/another"),record));
      await denied(() => set(ref(B.database,`encryptedData/privateCheckIns/${B.uid}/another`), { userId:B.uid,groupId:"room",dayKey:"2026-10-22",visibility:"private",reflectionText:cipher("Private",`privateCheckIns/${B.uid}/another/reflectionText`,`user:${B.uid}:1`) }));
    }
    goOffline(B.database); goOnline(B.database);
    assert.equal((await get(ref(B.database,path))).exists(),false);
  }
  assert.deepEqual((await db.ref(`encryptedData/journalEntries/${B.uid}/private`).get()).val(),privateEntry);
  assert.deepEqual((await db.ref(`encryptedData/privateCheckIns/${B.uid}`).get()).val(), preservedPrivate);
  assert.deepEqual((await db.ref(`encryptedData/prayerSessions/${B.uid}`).get()).val(), preservedDwell);
  assert.deepEqual((await db.ref("encryptedData/posts/unrelated").get()).val(), preservedOtherGroup);
  assert.deepEqual((await db.ref("e2eeAccounts").get()).val(), preservedIdentities);
  const persisted = JSON.stringify((await db.ref().get()).val());
  for (const secret of [key, "Private journal", "Private check-in", "Prayer Dwell", "Shared secret", "Unrelated secret"]) assert.ok(!persisted.includes(secret), "Sensitive plaintext/key material must not be persisted");
  for (const specialId of ["__proto__", "constructor", "prototype"]) {
    const specialPath = `encryptedData/posts/room/${specialId}`;
    const specialRecord = { userId: B.uid, body: cipher("Special ID", `posts/room/${specialId}/body`) };
    await set(ref(B.database, specialPath), specialRecord);
    await encryptedAccount.run(request(A, "post", specialId));
    assert.ok((await db.ref(`moderationTombstones/room/post/${specialId}`).get()).exists());
    assert.ok((await db.ref(`moderationActions/room/post/${specialId}`).get()).exists());
    await denied(() => set(ref(B.database, specialPath), specialRecord));
  }
  const self = { userId:B.uid,body:cipher("Self","posts/room/self/body") };
  await set(ref(B.database,"encryptedData/posts/room/self"),self);
  await set(ref(B.database,"encryptedData/posts/room/self"),null);
  assert.equal((await get(ref(A.database,"encryptedData/posts/room/self"))).exists(),false);
  // Author self-delete keeps the existing ability to remove children while
  // direct individual owner deletion of someone else's reply remains denied.
  const authored = { userId:A.uid,body:crypto.encrypt("Own parent","posts/room/own-parent/body","group:room:1",key,A.identity) };
  await set(ref(A.database,"encryptedData/posts/room/own-parent"),authored);
  await set(ref(B.database,"encryptedData/replies/room/child"),{userId:B.uid,targetType:"post",targetId:"own-parent",body:cipher("Child","replies/room/child/body")});
  await denied(() => set(ref(A.database,"encryptedData/replies/room/child"),null));
  const { update } = await import("firebase/database");
  await update(ref(A.database),{"encryptedData/posts/room/own-parent":null,"encryptedData/replies/room/child":null});
  assert.equal((await get(ref(B.database,"encryptedData/replies/room/child"))).exists(),false);
  console.log("Community moderation emulator passed: A/B/C authorization, encrypted content, cleanup/concurrency, idempotency, tombstones, daily retention, reconnect and self-delete.");
} finally { for (const app of apps) goOffline(getDatabase(app)); await Promise.all(apps.map(deleteApp)); await adminDelete(admin); }
process.exit(0);
