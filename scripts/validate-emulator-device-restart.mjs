import "./firebase-emulator-guard.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, get, goOffline } from "firebase/database";

// Run only after exporting, stopping and importing the same isolated emulator
// dataset. Every RTDB operation below is an authenticated read. Test login uses
// the public dummy password used by the smoke fixture, never a real credential.
assert.equal(process.env.KOINO_EMULATOR_TEST_MODE, "1", "Use the isolated emulator persistence launcher");
const projectId = "demo-koino", databaseURL = "https://demo-koino-default-rtdb.firebaseio.com";
const proof = JSON.parse(readFileSync(new URL("../.codex/koino-emulator-device/restart-proof.json", import.meta.url), "utf8"));
assert.equal(proof.projectId, projectId, "Restart proof must belong to the demo project");
assert.match(proof.groupId, /^smoke_[a-z0-9]+$/, "Unexpected test group ID");
const suffix = proof.groupId.slice("smoke_".length);
for (const [role, user] of [["owner", proof.owner], ["member", proof.member]]) {
  assert.match(user.uid, /^[A-Za-z0-9_-]{1,160}$/);
  assert.equal(user.email, `${role}-${suffix}@example.test`, "Only smoke fixture accounts may be used");
  assert.deepEqual(Object.keys(user).sort(), ["email", "uid"]);
}
assert.equal(proof.privateJournal.path, `encryptedData/journalEntries/${proof.member.uid}/private_${suffix}`);
assert.equal(proof.moderatedCheckIn.tombstone.path, `moderationTombstones/${proof.groupId}/check_in/checkin_${suffix}`);
assert.equal(proof.moderatedCheckIn.dailyClaim.path, `encryptedData/checkInDailyClaims/${proof.member.uid}/${proof.groupId}/2026-01-02`);
assert.equal(proof.reflectionTombstone.path, `moderationTombstones/${proof.groupId}/post/reflection_${suffix}`);
const canonicalProofValue = value => Array.isArray(value) ? value.map(canonicalProofValue) : value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalProofValue(value[key])])) : value;
const metadataHash = value => createHash("sha256").update(JSON.stringify(canonicalProofValue(value))).digest("hex");
const apps = [];
async function login(role, expected) {
  const app = initializeApp({ apiKey: "emulator-only", appId: "emulator-only", projectId, databaseURL }, `restart-${role}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const database = getDatabase(app); connectDatabaseEmulator(database, "127.0.0.1", 9001);
  const { user } = await signInWithEmailAndPassword(auth, expected.email, "emulator-test-password-123");
  assert.equal(user.uid, expected.uid, "Auth account must survive export/import with the same UID");
  const claims = JSON.parse(Buffer.from((await user.getIdToken()).split(".")[1], "base64url").toString("utf8"));
  assert.equal(claims.aud, projectId, "Never accept a production Auth identity");
  return database;
}
async function verifyRecord(database, record) {
  assert.match(record.sha256, /^[a-f0-9]{64}$/);
  const snapshot = await get(ref(database, record.path));
  assert.equal(snapshot.exists(), true, `${record.path} must survive restart`);
  assert.equal(metadataHash(snapshot.val()), record.sha256, `${record.path} changed during export/import`);
  return snapshot.val();
}
try {
  const A = await login("owner", proof.owner), B = await login("member", proof.member);
  const journal = await verifyRecord(B, proof.privateJournal);
  assert.equal(journal.userId, proof.member.uid);
  assert.equal(journal.body.v, 1);
  assert.equal(typeof journal.body.ciphertext, "string", "Journal must remain encrypted");
  await assert.rejects(() => get(ref(A, proof.privateJournal.path)), error => /permission.denied/i.test(String(error.code ?? error)), "Owner must still be denied the member's private journal after restart");
  const claim = await verifyRecord(B, proof.moderatedCheckIn.dailyClaim);
  assert.equal(claim.moderated, true);
  assert.equal(claim.status, "committed");
  assert.equal(claim.visibility, "group");
  assert.equal(claim.checkInId, `checkin_${suffix}`);
  for (const database of [A, B]) {
    await verifyRecord(database, proof.moderatedCheckIn.tombstone);
    await verifyRecord(database, proof.reflectionTombstone);
    const group = (await get(ref(database, `e2eeGroups/${proof.groupId}`))).val();
    assert.equal(group.ownerId, proof.owner.uid);
    assert.ok(Object.hasOwn(group.members, proof.owner.uid));
    assert.ok(Object.hasOwn(group.members, proof.member.uid));
    for (const [collection, id] of [["checkIns", `checkin_${suffix}`], ["posts", `reflection_${suffix}`]]) {
      assert.equal((await get(ref(database, `encryptedData/${collection}/${proof.groupId}/${id}`))).exists(), false, "Removed shared content must not return after emulator restart");
    }
  }
  console.log("Emulator export/import restart passed: persisted Auth UIDs, encrypted private journal/hash, owner privacy denial, moderated daily claim, tombstones, community authority and absent removed content.");
} finally {
  for (const app of apps) goOffline(getDatabase(app));
  await Promise.all(apps.map(deleteApp));
}

// Standalone verification process; SDK cleanup completed above.
process.exit(0);
