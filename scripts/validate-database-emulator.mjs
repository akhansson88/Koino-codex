import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { connectDatabaseEmulator, equalTo, get, getDatabase, goOffline, goOnline, limitToLast, onValue, orderByChild, query, ref, remove, runTransaction, set } from "firebase/database";

const projectId = "demo-koino";
const namespace = "demo-koino-default-rtdb";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9001";
const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions("firebase-admin/app");
const { getDatabase: getAdminDatabase } = requireFromFunctions("firebase-admin/database");
const admin = initializeAdminApp({ projectId, databaseURL: `https://${namespace}.firebaseio.com` }, "query-fixtures");
const apps = [];

async function client(label, existingAccount) {
  const app = initializeApp({ apiKey: "fake-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId,
    databaseURL: `https://${namespace}.firebaseio.com` }, label);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const database = getDatabase(app);
  connectDatabaseEmulator(database, "127.0.0.1", 9001);
  const email = existingAccount?.email ?? `${label}@example.test`;
  const password = existingAccount?.password ?? "test-password-123";
  const credential = existingAccount
    ? await signInWithEmailAndPassword(auth, email, password)
    : await createUserWithEmailAndPassword(auth, email, password);
  return { auth, database, uid: credential.user.uid, email, password };
}

try {
  const member = await client("member");
  const outsider = await client("outsider");
  const memberDevice = await client("member-device", member);
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

  const checkInDay = "2026-02-10";
  const checkIn = (uid, id, dayKey, visibility = "group") => ({
    id, userId: uid, groupId: "group1", dayKey, mood: 3, readToday: true,
    reflectionText: "A test check-in", visibility, createdAt: "2026-02-10T09:00:00.000Z",
  });
  const dailyClaim = (dayKey, checkInId, visibility = "group") => ({
    dayKey, checkInId, visibility, status: "pending", createdAt: Date.now(),
  });
  const firstCheckIn = checkIn(member.uid, "daily-first", checkInDay);
  await assert.rejects(
    () => set(ref(member.database, `checkIns/group1/${firstCheckIn.id}`), firstCheckIn),
    /permission_denied|Permission denied/i,
    "A shared check-in must have a matching daily claim",
  );
  await assert.rejects(
    () => set(ref(outsider.database, `checkInDailyClaims/${outsider.uid}/group1/${checkInDay}`), dailyClaim(checkInDay, "outsider-checkin")),
    /permission_denied|Permission denied/i,
    "A non-member cannot reserve a community check-in day",
  );

  const firstClaimRef = ref(member.database, `checkInDailyClaims/${member.uid}/group1/${checkInDay}`);
  const reservedFirstDay = await runTransaction(firstClaimRef, (current) => current ? undefined : dailyClaim(checkInDay, firstCheckIn.id));
  assert.equal(reservedFirstDay.committed, true);
  const competingClaim = await runTransaction(
    ref(memberDevice.database, `checkInDailyClaims/${member.uid}/group1/${checkInDay}`),
    (current) => current ? undefined : dailyClaim(checkInDay, "daily-second"),
  );
  assert.equal(competingClaim.committed, false, "The second device must not claim the same community day");
  await set(ref(member.database, `checkIns/group1/${firstCheckIn.id}`), firstCheckIn);
  const firstClaim = (await get(firstClaimRef)).val();
  assert.equal(firstClaim.status, "pending");
  await set(firstClaimRef, { ...firstClaim, status: "committed" });
  await assert.rejects(
    () => set(ref(member.database, `checkInDailyClaims/${member.uid}/group1/${checkInDay}`), dailyClaim(checkInDay, "daily-private", "private")),
    /permission_denied|Permission denied/i,
    "Shared and private check-ins share one daily slot",
  );
  await assert.rejects(
    () => remove(firstClaimRef),
    /permission_denied|Permission denied/i,
    "A committed daily claim cannot be cleared while its check-in remains",
  );
  await remove(ref(member.database, `checkIns/group1/${firstCheckIn.id}`));
  await remove(firstClaimRef);
  const afterDeleteClaim = await runTransaction(firstClaimRef, (current) => current ? undefined : dailyClaim(checkInDay, "daily-after-delete"));
  assert.equal(afterDeleteClaim.committed, true, "Deleting a check-in releases its daily slot");
  const afterDeleteCheckIn = checkIn(member.uid, "daily-after-delete", checkInDay);
  await set(ref(member.database, `checkIns/group1/${afterDeleteCheckIn.id}`), afterDeleteCheckIn);
  const replacementClaim = (await get(firstClaimRef)).val();
  await set(firstClaimRef, { ...replacementClaim, status: "committed" });

  const privateDay = "2026-02-11";
  const privateRecord = checkIn(member.uid, "private-first", privateDay, "private");
  const privateClaimRef = ref(member.database, `checkInDailyClaims/${member.uid}/group1/${privateDay}`);
  const reservedPrivateDay = await runTransaction(privateClaimRef, (current) => current ? undefined : dailyClaim(privateDay, privateRecord.id, "private"));
  assert.equal(reservedPrivateDay.committed, true);
  await set(ref(member.database, `privateCheckIns/${member.uid}/${privateRecord.id}`), privateRecord);
  const privateClaim = (await get(privateClaimRef)).val();
  await set(privateClaimRef, { ...privateClaim, status: "committed" });
  await assert.rejects(
    () => set(ref(member.database, "privateCheckIns/" + member.uid + "/private-second"), checkIn(member.uid, "private-second", privateDay, "private")),
    /permission_denied|Permission denied/i,
    "A private check-in cannot be added without its own daily claim",
  );
  await assert.rejects(
    () => remove(privateClaimRef),
    /permission_denied|Permission denied/i,
    "A committed private claim cannot be cleared while its check-in remains",
  );
  await remove(ref(member.database, `privateCheckIns/${member.uid}/${privateRecord.id}`));
  await remove(privateClaimRef);
  const privateRetryClaim = await runTransaction(privateClaimRef, (current) => current ? undefined : dailyClaim(privateDay, "private-retry", "private"));
  assert.equal(privateRetryClaim.committed, true, "Deleting a private check-in releases its daily slot");

  const concurrentDay = "2026-02-12";
  const concurrentClaims = await Promise.all([
    runTransaction(ref(member.database, `checkInDailyClaims/${member.uid}/group1/${concurrentDay}`),
      (current) => current ? undefined : dailyClaim(concurrentDay, "race-a")),
    runTransaction(ref(memberDevice.database, `checkInDailyClaims/${member.uid}/group1/${concurrentDay}`),
      (current) => current ? undefined : dailyClaim(concurrentDay, "race-b")),
  ]);
  assert.equal(concurrentClaims.filter((result) => result.committed).length, 1, "Only one device can claim a given user/community/day");

  const recoverableDay = "2026-02-13";
  const recoverableClaimRef = ref(member.database, `checkInDailyClaims/${member.uid}/group1/${recoverableDay}`);
  const reservedRecoverableDay = await runTransaction(recoverableClaimRef, (current) => current ? undefined : dailyClaim(recoverableDay, "interrupted-checkin"));
  assert.equal(reservedRecoverableDay.committed, true);
  await remove(recoverableClaimRef);
  const retriedClaim = await runTransaction(recoverableClaimRef, (current) => current ? undefined : dailyClaim(recoverableDay, "retried-checkin"));
  assert.equal(retriedClaim.committed, true, "An unpersisted pending claim can be rolled back and retried");

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

  const readerPreferences = {
    bibleVersionId: "kjv",
    fontId: "serif",
    fontSize: 22,
    position: { book: "John", chapter: 3, verse: 16 },
    history: { entries: [{ book: "Philippians", chapter: 4, verse: 4 }, { book: "John", chapter: 3, verse: 16 }], index: 1 },
    readerTheme: "sepia",
    showVerseNumbers: false,
    updatedAt: Date.now(),
  };
  const readerPreferencesRef = ref(member.database, `bibleReaderPreferences/${member.uid}`);
  await set(readerPreferencesRef, readerPreferences);
  assert.deepEqual((await get(readerPreferencesRef)).val(), readerPreferences);
  const readerPreferenceUpdates = [];
  const stopReaderPreferenceListener = onValue(
    ref(memberDevice.database, `bibleReaderPreferences/${member.uid}`),
    (snapshot) => readerPreferenceUpdates.push(snapshot.val()?.fontSize),
  );
  try {
    await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (readerPreferenceUpdates.length) { clearInterval(timer); resolve(); }
      }, 20);
      setTimeout(() => { clearInterval(timer); reject(new Error("Reader preferences listener timed out")); }, 5000);
    });
    await set(readerPreferencesRef, { ...readerPreferences, fontSize: 24, updatedAt: readerPreferences.updatedAt + 1 });
    await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (readerPreferenceUpdates.at(-1) === 24) { clearInterval(timer); resolve(); }
      }, 20);
      setTimeout(() => { clearInterval(timer); reject(new Error("Reader preferences did not sync to the second device")); }, 5000);
    });
  } finally {
    stopReaderPreferenceListener();
  }
  await assert.rejects(
    () => get(ref(outsider.database, `bibleReaderPreferences/${member.uid}`)),
    /permission_denied|Permission denied/i,
  );
  await assert.rejects(
    () => set(ref(outsider.database, `bibleReaderPreferences/${member.uid}`), readerPreferences),
    /permission_denied|Permission denied/i,
  );
  await assert.rejects(
    () => set(readerPreferencesRef, { ...readerPreferences, fontSize: 15 }),
    /permission_denied|Permission denied/i,
  );

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
  console.log("Database emulator passed: daily check-in claims, cross-device deduplication, private/shared slot enforcement, reader preference sync, private access, indexed queries, pagination, and reconnect.");
  await signOut(member.auth);
  await signOut(outsider.auth);
  await signOut(memberDevice.auth);
} finally {
  await Promise.all(apps.map(deleteApp));
  await deleteAdminApp(admin);
}
