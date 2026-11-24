import { emulatorEndpoints } from "./firebase-emulator-guard.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase, get, ref, set, update } from "firebase/database";

const projectId = "demo-koino", namespace = "demo-koino-default-rtdb";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: initializeAdmin } = require("firebase-admin/app");
const { getDatabase: adminDatabase } = require("firebase-admin/database");
const admin = initializeAdmin({ projectId, databaseURL: `https://${namespace}.firebaseio.com` }, "plaintext-rules-tests");
const adminDb = adminDatabase(admin);
const denied = (action) => assert.rejects(action, /permission_denied|Permission denied/i);
const apps = [];

async function client(label) {
  const app = initializeApp({ apiKey: "fake-api-key", projectId, databaseURL: `https://${namespace}.firebaseio.com` }, label);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, emulatorEndpoints.authURL, { disableWarnings: true });
  const database = getDatabase(app);
  connectDatabaseEmulator(database, emulatorEndpoints.host, emulatorEndpoints.databasePort);
  const { user } = await createUserWithEmailAndPassword(auth, `${label}@example.test`, "test-password-123");
  return { uid: user.uid, database };
}

try {
  const owner = await client("plain-owner"), member = await client("plain-member"), outsider = await client("plain-outsider"), second = await client("plain-second");
  await adminDb.ref("e2eePolicy").set({ encryptedGroupsOnly: true, sharedWritesFrozen: false });
  await adminDb.ref("e2eeGroups/community").set({
    id: "community", ownerId: owner.uid, revision: 1, epoch: 1, status: "ready",
    members: { [owner.uid]: { role: "owner" }, [member.uid]: { role: "member" } },
  });
  await adminDb.ref(`encryptedData/groupMembers/community`).update({
    [owner.uid]: { id: owner.uid, userId: owner.uid, groupId: "community", role: "owner", userName: "Owner", createdAt: "2026-01-01" },
    [member.uid]: { id: member.uid, userId: member.uid, groupId: "community", role: "member", userName: "Member", createdAt: "2026-01-01" },
  });
  await adminDb.ref("encryptedData/inviteCodes/INVITE").set({ groupId: "community", createdAt: "2026-01-01" });
  await adminDb.ref("encryptedData/groups/community").set({ id: "community", name: "Community", inviteCode: "INVITE", ownerId: owner.uid, createdAt: "2026-01-01", updatedAt: "2026-01-01" });

  // Personal content: readable and writable only by its account, nested plaintext allowed.
  const journal = `encryptedData/journalEntries/${owner.uid}/entry_1`;
  await set(ref(owner.database, journal), {
    id: "entry_1", userId: owner.uid, body: "A plain journal entry", source: "manual",
    verse: { reference: "John 3:16", text: "For God so loved the world" },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal((await get(ref(owner.database, journal))).child("body").val(), "A plain journal entry");
  await denied(() => get(ref(second.database, journal)));
  await denied(() => set(ref(second.database, `${journal}/body`), "tampered"));
  await denied(() => get(ref(second.database, `encryptedData/journalEntries/${owner.uid}`)));

  // A second account can write its own records and cannot see anyone else's.
  await set(ref(second.database, `encryptedData/journalEntries/${second.uid}/own`), { id: "own", userId: second.uid, body: "second", source: "manual", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal((await get(ref(second.database, `encryptedData/journalEntries/${second.uid}/own`))).exists(), true);

  // Community content: members read and write, non-members cannot.
  await set(ref(member.database, "encryptedData/posts/community/post_1"), {
    id: "post_1", userId: member.uid, groupId: "community", kind: "prayer_request",
    body: "Please pray", createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal((await get(ref(owner.database, "encryptedData/posts/community/post_1"))).child("body").val(), "Please pray");
  await denied(() => get(ref(outsider.database, "encryptedData/posts/community")));
  await denied(() => set(ref(outsider.database, "encryptedData/posts/community/post_2"), { id: "post_2", userId: outsider.uid, groupId: "community", kind: "post", body: "nope", createdAt: "2026-01-01" }));
  await denied(() => set(ref(member.database, "encryptedData/posts/community/post_3"), { id: "post_3", userId: owner.uid, groupId: "community", kind: "post", body: "spoofed author", createdAt: "2026-01-01" }));
  await set(ref(owner.database, "encryptedData/groups/community"), { id: "community", name: "Community", inviteCode: "INVITE", ownerId: owner.uid, createdAt: "2026-01-01", updatedAt: "2026-01-02" });
  await denied(() => set(ref(member.database, "encryptedData/groups/community"), { id: "community", name: "Hijacked", inviteCode: "INVITE", ownerId: owner.uid, createdAt: "2026-01-01", updatedAt: "2026-01-02" }));

  // Membership index and invites gate reads.
  assert.equal((await get(ref(member.database, "e2eeGroups/community"))).exists(), true);
  await denied(() => get(ref(outsider.database, "e2eeGroups/community")));
  assert.equal((await get(ref(outsider.database, "encryptedData/inviteCodes/INVITE"))).exists(), true);
  await denied(() => set(ref(outsider.database, "e2eeGroups/community/members/" + outsider.uid), { role: "member" }));
  await denied(() => get(ref(member.database, `encryptedData/userGroups/${owner.uid}/community`)));

  // Leaving is enforced by e2eeDepartures.
  await adminDb.ref(`e2eeDepartures/community/${member.uid}`).set(true);
  await denied(() => get(ref(member.database, "encryptedData/posts/community/post_1")));
  await denied(() => set(ref(member.database, "encryptedData/posts/community/post_4"), { id: "post_4", userId: member.uid, groupId: "community", kind: "post", body: "after leaving", createdAt: "2026-01-02" }));
  console.log("Plaintext rules validation passed.");
} finally {
  await adminDb.ref().set(null);
  await Promise.all(apps.map((app) => deleteApp(app).catch(() => undefined)));
  process.exit(0);
}
