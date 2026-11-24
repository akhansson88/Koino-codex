import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  ref,
  set,
} from "firebase/database";
import { compiledFunctionsDirectory, emulatorEndpoints } from "./firebase-emulator-guard.mjs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin, getApps } = require("firebase-admin/app");
const { getDatabase: getAdminDatabase } = require("firebase-admin/database");
const { koinoAccount } = require(`${compiledFunctionsDirectory}/account.js`);

const projectId = "demo-koino";
const databaseURL = "https://demo-koino-default-rtdb.firebaseio.com";
const admin = getApps().find((app) => app.name === "[DEFAULT]")
  ?? initializeAdmin({ projectId, databaseURL }, "community-leaders");
const db = getAdminDatabase(admin);
const apps = [];

async function client(name) {
  const app = initializeApp({ apiKey: "fake-api-key", databaseURL, projectId }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, emulatorEndpoints.authURL, { disableWarnings: true });
  const database = getDatabase(app);
  connectDatabaseEmulator(database, emulatorEndpoints.host, emulatorEndpoints.databasePort);
  const { user } = await createUserWithEmailAndPassword(auth, `${name}@example.test`, "test-password-123");
  return { database, uid: user.uid };
}

const call = (uid, operation, data = {}) => koinoAccount.run({ auth: { uid }, data: { operation, data } });
const now = new Date();
const iso = (daysAgo) => new Date(now.getTime() - daysAgo * 86400000).toISOString();

try {
  const owner = await client("leaders-owner");
  const leader = await client("leaders-leader");
  const member = await client("leaders-member");
  const outsider = await client("leaders-outsider");
  const groupId = "leaders-room";

  const membership = (userId, role, userName) => ({
    id: `membership_${userId}_${groupId}`,
    userId,
    groupId,
    role,
    userName,
    createdAt: iso(20),
  });
  const group = {
    id: groupId,
    ownerId: owner.uid,
    inviteCode: "LEADER",
    name: "Leader test",
    createdAt: iso(20),
    updatedAt: iso(1),
  };

  await db.ref().set({
    e2eeGroups: {
      [groupId]: {
        id: groupId,
        ownerId: owner.uid,
        revision: 1,
        epoch: 1,
        status: "ready",
        members: {
          [owner.uid]: { id: owner.uid, userId: owner.uid, role: "owner", joinedAt: iso(20) },
          [leader.uid]: { id: leader.uid, userId: leader.uid, role: "leader", joinedAt: iso(10) },
          [member.uid]: { id: member.uid, userId: member.uid, role: "member", joinedAt: iso(5) },
        },
      },
    },
    encryptedData: {
      groups: { [groupId]: group },
      groupMembers: {
        [groupId]: {
          [owner.uid]: membership(owner.uid, "owner", "Owner"),
          [leader.uid]: membership(leader.uid, "leader", "Leader"),
          [member.uid]: membership(member.uid, "member", "Member"),
        },
      },
      userGroups: {
        [owner.uid]: { [groupId]: membership(owner.uid, "owner", "Owner") },
        [leader.uid]: { [groupId]: membership(leader.uid, "leader", "Leader") },
        [member.uid]: { [groupId]: membership(member.uid, "member", "Member") },
      },
      checkIns: {
        [groupId]: {
          checkin1: { id: "checkin1", userId: leader.uid, groupId, visibility: "group", mood: 4, readToday: true, reflectionText: "Shared", createdAt: iso(2) },
          checkin2: { id: "checkin2", userId: member.uid, groupId, visibility: "private", mood: 1, readToday: false, reflectionText: "Private", createdAt: iso(1) },
        },
      },
      posts: {
        [groupId]: {
          post1: { id: "post1", userId: member.uid, groupId, kind: "prayer_request", body: "Pray", createdAt: iso(1) },
        },
      },
      replies: {
        [groupId]: {
          reply1: { id: "reply1", userId: leader.uid, groupId, targetType: "post", targetId: "post1", body: "Amen", createdAt: iso(1) },
        },
      },
      prayerReactions: {
        [groupId]: {
          prayer1: { id: "prayer1", userId: owner.uid, groupId, targetType: "post", targetId: "post1", createdAt: iso(1) },
        },
      },
      groupBiblePlanAnnouncements: {
        [groupId]: {
          plan1: { id: "plan1", groupId, title: "John", startDate: new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10), dayCount: 7, createdAt: iso(2) },
        },
      },
      groupBiblePlanParticipation: {
        [groupId]: {
          plan1: {
            [leader.uid]: { id: `participation_${leader.uid}`, userId: leader.uid, announcementId: "plan1", totalDays: 7, completedDayNumbers: { "1": true, "2": true }, joinedAt: iso(2), updatedAt: iso(1) },
          },
        },
      },
    },
  });

  // The owner and a group leader can read statistics; a regular member and an
  // outsider cannot.
  const ownerStats = await call(owner.uid, "groupStatistics", { groupId, days: 7 });
  assert.equal(ownerStats.checkIns.total, 1, "private check-ins are excluded");
  assert.equal(ownerStats.checkIns.rate, 33.3);
  assert.equal(ownerStats.members.leaders, 1);
  assert.equal(ownerStats.prayers.requests, 1);
  const leaderStats = await call(leader.uid, "groupStatistics", { groupId, days: 7 });
  assert.equal(leaderStats.members.total, 3);
  await assert.rejects(call(member.uid, "groupStatistics", { groupId, days: 7 }), /permission-denied|group leaders/i);
  await assert.rejects(call(outsider.uid, "groupStatistics", { groupId, days: 7 }), /permission-denied|not found|no longer available/i);

  // A leader cannot appoint another leader; only the host can.
  await assert.rejects(call(leader.uid, "appointGroupLeader", { groupId, userId: member.uid }), /permission-denied|community host/i);

  // The host appoints a member and every mirror reflects it.
  await call(owner.uid, "appointGroupLeader", { groupId, userId: member.uid });
  assert.equal((await db.ref(`e2eeGroups/${groupId}/members/${member.uid}/role`).get()).val(), "leader");
  assert.equal((await db.ref(`encryptedData/groupMembers/${groupId}/${member.uid}/role`).get()).val(), "leader");
  assert.equal((await db.ref(`encryptedData/userGroups/${member.uid}/${groupId}/role`).get()).val(), "leader");
  assert.equal((await call(member.uid, "groupStatistics", { groupId, days: 7 })).members.leaders, 2);

  // Removing the leader revokes statistics access immediately.
  await call(owner.uid, "removeGroupLeader", { groupId, userId: member.uid });
  assert.equal((await db.ref(`e2eeGroups/${groupId}/members/${member.uid}/role`).get()).val(), "member");
  await assert.rejects(call(member.uid, "groupStatistics", { groupId, days: 7 }), /permission-denied|group leaders/i);

  // The host cannot remove themselves as a group leader.
  await assert.rejects(call(owner.uid, "removeGroupLeader", { groupId, userId: owner.uid }), /permission-denied|community host|leader/i);

  // Client writes cannot promote a member directly; roles are server-owned.
  await assert.rejects(
    set(ref(member.database, `encryptedData/groupMembers/${groupId}/${member.uid}/role`), "leader"),
    /permission_denied|Permission denied/i,
  );

  console.log("Community leader and statistics emulator validation passed.");
  process.exit(0);
} finally {
  for (const app of apps) await deleteApp(app).catch(() => undefined);
  await deleteAdmin(admin).catch(() => undefined);
}
