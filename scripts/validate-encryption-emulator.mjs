import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, goOffline, getDatabase, ref, set, get, update, query, orderByChild, limitToLast } from "firebase/database";
import { crypto } from "./encryption-test-helpers.mjs";
const projectId = "demo-koino", namespace = "demo-koino-default-rtdb";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9001";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require("firebase-admin/app");
const { getDatabase: adminDatabase } = require("firebase-admin/database");
const admin = initializeAdmin({ projectId, databaseURL: `https://${namespace}.firebaseio.com` }, "encryption-tests");
const apps = [];
async function client(label) {
  const app = initializeApp({ apiKey: "fake-api-key", projectId, databaseURL: `https://${namespace}.firebaseio.com` }, label); apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const database = getDatabase(app); connectDatabaseEmulator(database, "127.0.0.1", 9001);
  const { user } = await createUserWithEmailAndPassword(auth, `${label}@example.test`, "test-password-123");
  return { uid: user.uid, database, identity: crypto.identity() };
}
const denied = (action) => assert.rejects(action, /permission_denied|Permission denied/i);
try {
  const owner = await client("encrypted-owner"), member = await client("encrypted-member"), outsider = await client("encrypted-outsider");
  const key = crypto.randomKey();
  await adminDatabase(admin).ref().set({
    e2eeAccounts: Object.fromEntries([owner, member, outsider].map((user) => [user.uid, { personalEpoch: 1 }])),
    e2eeSigners: Object.fromEntries([owner, member, outsider].map((user) => [user.identity.signingPublicKey, { uid: user.uid, active: true }])),
    e2eeGroups: { community: { ownerId: owner.uid, epoch: 1, members: { [owner.uid]: true, [member.uid]: true } } },
    encryptedData: { groups: { community: { id: "community", ownerId: owner.uid, inviteCode: "INVITE" } } },
  });
  const encryptPreferences = (value, path) => value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, encryptPreferences(child, `${path}/${name}`)]))
    : crypto.encrypt(value, path, `user:${owner.uid}:1`, key, owner.identity);
  const preferences = { bibleVersionId: 'kjv', fontId: 'serif', fontSize: 20, readerTheme: 'light', showVerseNumbers: true, position: { book: 'John', chapter: 3, verse: 16 }, history: { entries: [{ book: 'John', chapter: 3, verse: 16 }], index: 0 } };
  await set(ref(owner.database, `encryptedData/bibleReaderPreferences/${owner.uid}`), { ...encryptPreferences(preferences, `bibleReaderPreferences/${owner.uid}`), updatedAt: 1 });
  const legacyTokens = `pushTokens/${owner.uid}`;
  await adminDatabase(admin).ref(legacyTokens).set({ device: { token: 'synthetic-token', platform: 'android' } });
  await denied(() => get(ref(owner.database, legacyTokens)));
  const followPath = `encryptedData/userDiscussionFollows/${owner.uid}/community/post_fixture`;
  await set(ref(owner.database, followPath), { id: 'post_fixture', userId: owner.uid, targetType: 'post', targetId: 'fixture', createdAt: '2026-01-01' });
  await denied(() => set(ref(owner.database, `${followPath}/privateContent`), 'plaintext'));
  await denied(() => get(ref(outsider.database, followPath)));
  const migrationGroup = 'not-yet-created';
  const otherMembership = `userGroups/${member.uid}/${migrationGroup}`;
  await adminDatabase(admin).ref(otherMembership).set({ userId: member.uid, groupId: migrationGroup });
  await denied(() => get(ref(owner.database, otherMembership)));
  await denied(() => get(ref(owner.database, `e2eeGroups/${migrationGroup}`)));
  await adminDatabase(admin).ref(`e2eeMigrations/group/${migrationGroup}`).set({ ownerId: owner.uid, status: 'copying' });
  assert.equal((await get(ref(owner.database, `e2eeGroups/${migrationGroup}`))).exists(), false);
  assert.equal((await get(ref(owner.database, otherMembership))).child('userId').val(), member.uid);
  for (const collection of ['groups', 'groupMembers', 'posts', 'checkIns', 'replies', 'prayerReactions', 'postReactions', 'groupBiblePlanAnnouncements', 'groupBiblePlanParticipation', 'discussionFollowers']) {
    assert.equal((await get(ref(owner.database, `${collection}/${migrationGroup}`))).exists(), false);
    await denied(() => get(ref(outsider.database, `${collection}/${migrationGroup}`)));
  }
  await denied(() => get(ref(outsider.database, otherMembership)));
  await adminDatabase(admin).ref(`e2eeMigrations/group/${migrationGroup}/status`).set('complete');
  await denied(() => get(ref(owner.database, otherMembership)));
  await denied(() => get(ref(owner.database, `groups/${migrationGroup}`)));
  await adminDatabase(admin).ref(`e2eeMigrations/user/${owner.uid}`).set({ status: 'copying' });
  assert.equal((await get(ref(owner.database, legacyTokens))).child('device/token').val(), 'synthetic-token');
  await denied(() => get(ref(outsider.database, legacyTokens)));
  for (const collection of ['biblePlans', 'notificationPreferences', 'pushTokens', 'checkInDailyClaims', 'userDiscussionFollows', 'groupBiblePlanParticipantIds', 'supportIntents']) {
    try { await get(ref(owner.database, `${collection}/${owner.uid}`)); }
    catch (error) { throw new Error(`Legacy migration read denied for ${collection}`, { cause: error }); }
  }
  await adminDatabase(admin).ref(`e2eeMigrations/user/${owner.uid}/status`).set('complete');
  await denied(() => get(ref(owner.database, legacyTokens)));
  const journalPath = `encryptedData/journalEntries/${owner.uid}/entry1`;
  const body = crypto.encrypt("Secret journal", `journalEntries/${owner.uid}/entry1/body`, `user:${owner.uid}:1`, key, owner.identity);
  await set(ref(owner.database, journalPath), { id: "entry1", userId: owner.uid, createdAt: "2026-01-01T00:00:00Z", body });
  await denied(() => get(ref(outsider.database, journalPath)));
  await denied(() => set(ref(owner.database, `${journalPath}/body`), "Unencrypted journal"));
  await denied(() => set(ref(owner.database, `${journalPath}/unknownFutureContent`), { content: "Unencrypted nested content" }));
  assert.equal((await get(ref(owner.database, journalPath))).child("body/ciphertext").val(), body.ciphertext);
  await denied(() => set(ref(owner.database, `journalEntries/${owner.uid}/plaintext`), { body: "Old client plaintext" }));
  await denied(() => set(ref(owner.database, `e2eeAccounts/${owner.uid}/devices/fake`), { active: true }));
  const notificationPath = `encryptedData/activityNotifications/${owner.uid}/legacy-notice`;
  const notice = { id: "legacy-notice", recipientUserId: owner.uid, actorUserId: member.uid, groupId: "community", targetId: "post1", targetType: "post", createdAt: "2026-01-01T00:00:00Z" };
  await denied(() => set(ref(owner.database, notificationPath), notice));
  await adminDatabase(admin).ref(`e2eeMigrations/user/${owner.uid}`).set({ status: "copying" });
  await set(ref(owner.database, notificationPath), notice);
  await denied(() => set(ref(outsider.database, notificationPath), notice));
  await adminDatabase(admin).ref(`e2eeMigrations/user/${owner.uid}/status`).set("complete");
  await denied(() => update(ref(owner.database, notificationPath), { targetId: "forged" }));
  await update(ref(owner.database, notificationPath), { readAt: "2026-01-02T00:00:00Z" });
  const followerPath = `encryptedData/discussionFollowers/community/post/post1/${member.uid}`;
  // Use the complete DiscussionFollow record written by both legacy and current
  // clients. A reduced fixture misses routing fields rejected during migration.
  const follower = { id: "post_post1", userId: member.uid, targetType: "post", targetId: "post1", createdAt: "2026-01-01T00:00:00Z" };
  await denied(() => set(ref(owner.database, followerPath), follower));
  await adminDatabase(admin).ref("e2eeMigrations/group/community").set({ ownerId: owner.uid, status: "copying" });
  await set(ref(owner.database, followerPath), follower);
  await denied(() => set(ref(outsider.database, followerPath), follower));
  await adminDatabase(admin).ref("e2eeMigrations/group/community/status").set("complete");
  await denied(() => update(ref(owner.database, followerPath), { createdAt: "2026-01-02T00:00:00Z" }));
  await set(ref(member.database, followerPath), follower);
  assert.deepEqual((await get(ref(member.database, followerPath))).val(), follower);
  await denied(() => set(ref(member.database, `${followerPath}/body`), "plaintext"));
  await denied(() => get(ref(outsider.database, followerPath)));
  const postPath = "encryptedData/posts/community/post1";
  const postBody = crypto.encrypt("Group prayer", "posts/community/post1/body", "group:community:1", key, member.identity);
  await set(ref(member.database, postPath), { id: "post1", groupId: "community", userId: member.uid, createdAt: "2026-01-02T00:00:00Z", body: postBody });
  await denied(() => get(ref(outsider.database, postPath)));
  await denied(() => set(ref(outsider.database, "encryptedData/posts/community/outsider"), { userId: outsider.uid, body: postBody }));
  await denied(() => update(ref(owner.database, postPath), { userId: owner.uid }));
  assert.equal((await get(query(ref(member.database, "encryptedData/posts/community"), orderByChild("createdAt"), limitToLast(50)))).size, 1);
  await adminDatabase(admin).ref("e2eeGroupLocks/community").set(true);
  await denied(() => update(ref(member.database, postPath), { body: postBody }));
  await adminDatabase(admin).ref().update({ "e2eeGroupLocks/community": null, "e2eeGroups/community/epoch": 2 });
  await denied(() => update(ref(member.database, postPath), { body: postBody }));
  const nextBody = crypto.encrypt("After rotation", "posts/community/post1/body", "group:community:2", crypto.randomKey(), member.identity);
  await update(ref(member.database, postPath), { body: nextBody });
  await adminDatabase(admin).ref(`e2eeDepartures/community/${member.uid}`).set(true);
  await denied(() => get(ref(member.database, postPath)));
  await denied(() => update(ref(member.database, postPath), { body: nextBody }));
  await adminDatabase(admin).ref(`e2eeSigners/${owner.identity.signingPublicKey}/active`).set(false);
  await denied(() => update(ref(owner.database, journalPath), { body }));
  console.log("Encryption emulator checks passed: private/group access, plaintext rejection, authorized migration, metadata ownership, pagination, key versions, departure locks, and revocation.");
} finally { apps.forEach((app) => goOffline(getDatabase(app))); await Promise.all(apps.map(deleteApp)); await deleteAdmin(admin); }
process.exit(0);
