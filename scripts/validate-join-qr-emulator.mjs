import assert from "node:assert/strict";
import path from "node:path";
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

const projectId = "demo-koino";
const databaseURL = "https://demo-koino-default-rtdb.firebaseio.com";
const emulatorEndpoints = {
  host: "127.0.0.1",
  databasePort: 9001,
  authPort: 9099,
  authURL: "http://127.0.0.1:9099",
};
// Same fixture assertions as the shared guard, without its socket patch: this
// suite needs the Admin SDK's own HTTP client for the signup guard's Auth read.
assert.equal(process.env.GCLOUD_PROJECT, "demo-koino", "Use emulators:exec --project demo-koino");
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, "127.0.0.1:9001");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const compiledFunctionsDirectory = path.resolve("functions/lib");
// emulators:exec advertises the bare project namespace; the emulator loads the
// rules on the -default-rtdb namespace, so both the Admin SDK and the clients
// must address that one.
process.env.FIREBASE_CONFIG = JSON.stringify({
  ...JSON.parse(process.env.FIREBASE_CONFIG ?? "{}"),
  projectId,
  databaseURL,
});
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin, getApps } = require("firebase-admin/app");
const { getDatabase: getAdminDatabase } = require("firebase-admin/database");
const { koinoAccount } = require(`${compiledFunctionsDirectory}/account.js`);

const admin = getApps().find((app) => app.name === "[DEFAULT]")
  ?? initializeAdmin({ projectId, databaseURL });
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
  // The RTDB client attaches the Auth token asynchronously; wait until an
  // authenticated read is accepted so later rule assertions test the rules.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await get(ref(database, "e2eePolicy"));
      return { database, uid: user.uid };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`The ${name} client never authenticated against the database emulator.`);
}

// The callable reads token.email_verified; this token models a verified account,
// which the join itself requires in production.
const call = (user, operation, data = {}) => koinoAccount.run({
  auth: { uid: user.uid, token: { email_verified: true } },
  data: { operation, data },
});
const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const membership = (userId, groupId, role, userName) => ({
  id: `membership_${userId}_${groupId}`,
  userId,
  groupId,
  role,
  userName,
  createdAt: iso(2),
});

try {
  const owner = await client("qr-owner");
  const guest = await client("qr-guest");
  const second = await client("qr-second");
  const rejected = await client("qr-rejected");
  const removed = await client("qr-removed");
  // Rules identity probe: each client must only pass its own uid's rule.
  for (const [label, user, other] of [["owner", owner, guest], ["guest", guest, owner], ["second", second, owner]]) {
    try {
      await get(ref(user.database, `e2eeJoinRequestStatuses/${other.uid}`));
      throw new Error(`The ${label} client can read another account's status`);
    } catch (problem) {
      if (String(problem?.message).includes("can read another account")) throw problem;
    }
    await get(ref(user.database, `e2eeJoinRequestStatuses/${user.uid}`));
  }
  console.log("rules identity probe passed");
  const groupId = "qr-room";
  const code = "QRCODE";

  // 1. createGroup defaults to approval and writes both locations.
  await call(owner, "createGroup", {
    groupId,
    group: {
      id: groupId,
      name: "QR Room",
      inviteCode: code,
      ownerId: owner.uid,
      createdAt: iso(2),
      updatedAt: iso(2),
    },
    membership: membership(owner.uid, groupId, "owner", "Owner"),
    userMembership: membership(owner.uid, groupId, "owner", "Owner"),
  });
  assert.equal((await db.ref(`e2eeGroups/${groupId}/joinPolicy`).get()).val(), "approval", "default policy is approval");
  assert.equal((await db.ref(`encryptedData/groups/${groupId}/joinPolicy`).get()).val(), "approval", "mirror policy is approval");
  assert.equal((await db.ref(`e2eeGroups/${groupId}/joinApprovers`).get()).val(), "owner", "default approver is the host");
  assert.equal((await db.ref(`encryptedData/groups/${groupId}/joinApprovers`).get()).val(), "owner", "mirror approver is the host");

  // 2. resolveInvite returns only the preview fields.
  const preview = await call(guest, "resolveInvite", { code: " qrcode " });
  assert.deepEqual(Object.keys(preview).sort(), ["alreadyMember", "groupId", "joinApprovers", "joinPolicy", "memberCount", "name"]);
  assert.equal(preview.groupId, groupId);
  assert.equal(preview.name, "QR Room");
  assert.equal(preview.joinPolicy, "approval");
  assert.equal(preview.memberCount, 1);
  assert.equal(preview.alreadyMember, false);

  // Unknown codes and the deleted group fail cleanly.
  await assert.rejects(call(guest, "resolveInvite", { code: "NOPE99" }), /not-found|No community/i);
  await assert.rejects(call(guest, "joinGroup", { code: "NOPE99", name: "Guest" }), /not-found|No community/i);
  await assert.rejects(
    koinoAccount.run({ data: { operation: "resolveInvite", data: { code } } }),
    /unauthenticated|Sign in/i,
  );

  // 3. Only the host can change the policy, and only to a real value.
  await assert.rejects(
    call(guest, "setJoinPolicy", { groupId, joinPolicy: "open" }),
    (error) => error.code === "not-found" || error.code === "permission-denied",
  );
  await assert.rejects(call(owner, "setJoinPolicy", { groupId, joinPolicy: "everyone" }), /invalid-argument|valid join policy/i);
  await assert.rejects(call(owner, "setJoinPolicy", { groupId, joinApprovers: "leaders" }), /invalid-argument|valid join approver/i);
  assert.deepEqual(await call(owner, "setJoinPolicy", { groupId, joinPolicy: "open" }), { joinPolicy: "open", joinApprovers: "owner" });
  assert.equal((await db.ref(`e2eeGroups/${groupId}/joinPolicy`).get()).val(), "open");
  assert.equal((await db.ref(`encryptedData/groups/${groupId}/joinPolicy`).get()).val(), "open");
  // Idempotent.
  assert.deepEqual(await call(owner, "setJoinPolicy", { groupId, joinPolicy: "open" }), {});

  // 4. Open community: one scan, a member with every mirror, and real read access.
  const openJoin = await call(guest, "joinGroup", { code, name: "Guest" });
  assert.equal(openJoin.status, "approved");
  assert.equal(openJoin.joined, true);
  assert.equal((await db.ref(`e2eeGroups/${groupId}/members/${guest.uid}/role`).get()).val(), "member");
  const guestMirror = (await db.ref(`encryptedData/groupMembers/${groupId}/${guest.uid}`).get()).val();
  const guestUserMirror = (await db.ref(`encryptedData/userGroups/${guest.uid}/${groupId}`).get()).val();
  assert.deepEqual(guestMirror, guestUserMirror);
  assert.equal(guestMirror.userId, guest.uid);
  assert.equal(guestMirror.groupId, groupId);
  assert.ok(await get(ref(guest.database, `e2eeGroups/${groupId}`)), "a new member can read the authoritative group");
  assert.equal((await get(ref(guest.database, `encryptedData/groups/${groupId}/name`))).val(), "QR Room");
  assert.equal((await call(guest, "resolveInvite", { code })).alreadyMember, true);
  // Scanning again is an idempotent no-op.
  const again = await call(guest, "joinGroup", { code, name: "Guest" });
  assert.equal(again.status, "approved");
  assert.equal(again.joined, true);

  // 5. Private community: a request the host can see and approve.
  await call(owner, "setJoinPolicy", { groupId, joinPolicy: "approval" });
  assert.equal((await call(second, "resolveInvite", { code })).joinPolicy, "approval");
  const pending = await call(second, "joinGroup", { code, name: "Second" });
  assert.equal(pending.status, "pending");
  assert.equal(pending.joined, undefined);
  assert.equal((await db.ref(`e2eeGroups/${groupId}/members/${second.uid}`).get()).val(), null);
  assert.equal((await call(second, "resolveInvite", { code })).requestStatus, "pending");
  await assert.rejects(
    get(ref(second.database, `encryptedData/groups/${groupId}`)),
    /permission_denied|Permission denied/i,
    "a pending applicant cannot read community content",
  );
  const requests = await call(owner, "listGroupRequests", { groupId });
  assert.equal(requests.requests.some((item) => item.userId === second.uid), true);
  await call(owner, "approveJoin", { groupId, userId: second.uid, name: "Second" });
  assert.equal((await call(second, "resolveInvite", { code })).alreadyMember, true);
  assert.equal((await db.ref(`encryptedData/userGroups/${second.uid}/${groupId}/role`).get()).val(), "member");

  // 6. Rejection is sticky under both policies.
  await call(rejected, "joinGroup", { code, name: "Rejected" });
  await call(owner, "rejectJoin", { groupId, userId: rejected.uid });
  assert.equal((await call(rejected, "joinGroup", { code, name: "Rejected" })).status, "rejected");
  await call(owner, "setJoinPolicy", { groupId, joinPolicy: "open" });
  assert.equal((await call(rejected, "joinGroup", { code, name: "Rejected" })).status, "rejected");
  assert.equal((await db.ref(`e2eeGroups/${groupId}/members/${rejected.uid}`).get()).val(), null);

  // 7. Removal beats the QR: an old screenshot lands in the host's queue.
  const removedJoin = await call(removed, "joinGroup", { code, name: "Removed" });
  assert.equal(removedJoin.joined, true);
  await call(owner, "removeMember", { groupId, userId: removed.uid });
  assert.equal((await db.ref(`e2eeGroups/${groupId}/members/${removed.uid}`).get()).val(), null);
  const comeback = await call(removed, "joinGroup", { code, name: "Removed" });
  assert.equal(comeback.status, "pending", "a removed member never auto-joins");
  assert.equal(comeback.joined, undefined);
  assert.equal((await db.ref(`e2eeGroups/${groupId}/members/${removed.uid}`).get()).val(), null);

  // 7b. A group leader may decide requests only while the host grants it.
  await call(owner, "appointGroupLeader", { groupId, userId: second.uid });
  assert.equal((await db.ref(`e2eeGroups/${groupId}/members/${second.uid}/role`).get()).val(), "leader");
  await call(owner, "setJoinPolicy", { groupId, joinPolicy: "approval", joinApprovers: "owner_and_leaders" });
  assert.equal((await db.ref(`e2eeGroups/${groupId}/joinApprovers`).get()).val(), "owner_and_leaders");
  assert.equal((await db.ref(`encryptedData/groups/${groupId}/joinApprovers`).get()).val(), "owner_and_leaders");
  const approverPreview = await call(guest, "resolveInvite", { code });
  assert.equal(approverPreview.joinPolicy, "approval");
  assert.equal(approverPreview.joinApprovers, "owner_and_leaders");

  const third = await client("qr-third");
  assert.equal((await call(third, "joinGroup", { code, name: "Third" })).status, "pending");
  const leaderQueue = await call(second, "listGroupRequests", { groupId });
  assert.equal(leaderQueue.requests.some((item) => item.userId === third.uid), true);
  // The rules let the leader open the request list while the host allows it.
  assert.ok((await get(ref(second.database, `e2eeJoinRequests/${groupId}`))).exists());
  await call(second, "approveJoin", { groupId, userId: third.uid, name: "Third" });
  assert.equal((await db.ref(`e2eeGroups/${groupId}/members/${third.uid}/role`).get()).val(), "member");

  // A plain member can neither list, read nor decide.
  await assert.rejects(call(guest, "listGroupRequests", { groupId }), (error) => error.code === "permission-denied");
  await assert.rejects(
    call(guest, "approveJoin", { groupId, userId: removed.uid, name: "Nope" }),
    (error) => error.code === "permission-denied",
  );
  await assert.rejects(
    get(ref(guest.database, `e2eeJoinRequests/${groupId}`)),
    /permission_denied|Permission denied/i,
    "a plain member cannot read the request list",
  );
  // A leader can never change the policy itself.
  await assert.rejects(
    call(second, "setJoinPolicy", { groupId, joinPolicy: "open" }),
    (error) => error.code === "permission-denied",
  );

  // Switching back to the host alone revokes the leader at once.
  await call(owner, "setJoinPolicy", { groupId, joinPolicy: "approval", joinApprovers: "owner" });
  await assert.rejects(call(second, "listGroupRequests", { groupId }), (error) => error.code === "permission-denied");
  await assert.rejects(
    get(ref(second.database, `e2eeJoinRequests/${groupId}`)),
    /permission_denied|Permission denied/i,
    "the request list closes again for the leader",
  );

  // 8. The 200-member ceiling stops an open join.
  await call(owner, "setJoinPolicy", { groupId, joinPolicy: "open" });
  const members = {};
  for (let index = 0; index < 200; index++) members[`filler-${index}`] = { id: `filler-${index}`, role: "member" };
  await db.ref(`e2eeGroups/${groupId}/members`).update(members);
  const full = await client("qr-full");
  await assert.rejects(
    call(full, "joinGroup", { code, name: "Full" }),
    (error) => error.code === "failed-precondition" && /GROUP_FULL/.test(error.message),
  );

  // 9. Rules: membership and requests stay server-only, and the policy value is enforced.
  await assert.rejects(
    set(ref(full.database, `e2eeGroups/${groupId}/members/${full.uid}`), { id: full.uid, role: "member" }),
    /permission_denied|Permission denied/i,
    "clients cannot write membership",
  );
  await assert.rejects(
    set(ref(full.database, `e2eeJoinRequests/${groupId}/${full.uid}`), { userId: full.uid }),
    /permission_denied|Permission denied/i,
    "clients cannot write join requests",
  );
  await assert.rejects(
    set(ref(owner.database, `encryptedData/groups/${groupId}/joinPolicy`), "everyone"),
    /permission_denied|Permission denied/i,
    "rules reject a policy value outside the enum",
  );

  // 10. A deleted community is not resolvable.
  await call(owner, "deleteGroup", { groupId });
  await assert.rejects(call(guest, "resolveInvite", { code }), /not-found|No community/i);

  console.log("Join QR emulator validation passed.");
  process.exit(0);
} finally {
  for (const app of apps) await deleteApp(app).catch(() => undefined);
  await deleteAdmin(admin).catch(() => undefined);
}

