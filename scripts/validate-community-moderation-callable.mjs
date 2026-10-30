import "./firebase-emulator-guard.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, set, get, update, goOffline, goOnline } from "firebase/database";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { crypto } from "./encryption-test-helpers.mjs";

// This suite deliberately exercises the HTTP callable protocol and emulator ID
// tokens. It never imports a Functions handler or calls its local run method.
assert.equal(process.env.KOINO_EMULATOR_TEST_MODE, "1", "Use the isolated physical-device emulator launcher");
assert.equal(process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST, "127.0.0.1:5001", "Functions must be local");
// The launcher binds this loopback alias to its device TCP relay, proving
// Auth, RTDB WebSockets and callable HTTP traverse the same byte forwarder.
// Admin verification remains connected directly to 127.0.0.1 via emulator env.
const clientHost = "127.0.0.2";
const projectId = "demo-koino";
const databaseURL = "https://demo-koino-default-rtdb.firebaseio.com";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp: adminInitialize, deleteApp: adminDelete } = require("firebase-admin/app");
const { getDatabase: adminDatabase } = require("firebase-admin/database");
const admin = adminInitialize({ projectId, databaseURL }, `callable-smoke-${Date.now()}`);
const database = adminDatabase(admin), apps = [];
const suffix = Date.now().toString(36), groupId = `smoke_${suffix}`, inviteCode = `SMOKE_${suffix}`;
const canonicalProofValue = value => Array.isArray(value) ? value.map(canonicalProofValue) : value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalProofValue(value[key])])) : value;
const metadataHash = value => createHash("sha256").update(JSON.stringify(canonicalProofValue(value))).digest("hex");
const publicIdentity = identity => ({ publicKey: identity.publicKey, signingPublicKey: identity.signingPublicKey });
const signGroup = (value, identity) => {
  const { signature, ...payload } = value;
  return { ...payload, signature: crypto.signature({ ...payload, previous: payload.previous ?? null }, identity.signingPrivateKey) };
};
const denied = action => assert.rejects(action, error => /permission.denied|unauthenticated/i.test(String(error.code ?? error)), "Operation must be denied by Auth/Rules/Functions");
const signed = (user, operation, data) => {
  const payload = { operation, data, deviceId: user.device.id, requestId: crypto.randomKey(), timestamp: Date.now() };
  return { ...payload, signature: crypto.signature(payload, user.device.identity.signingPrivateKey) };
};
const call = async (user, operation, data) => (await user.endpoint(signed(user, operation, data))).data;
const moderation = (user, targetType, targetId) => call(user, "removeCommunityContent", { groupId, targetType, targetId });
const absent = async path => assert.equal((await database.ref(path).get()).exists(), false, `${path} must be absent`);
const eventually = async (check, message) => {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(message);
};
async function client(label, authenticate = true) {
  const app = initializeApp({ apiKey: "emulator-only", appId: "emulator-only", projectId, databaseURL }, `callable-${label}-${suffix}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${clientHost}:9099`, { disableWarnings: true });
  const db = getDatabase(app); connectDatabaseEmulator(db, clientHost, 9001);
  const functions = getFunctions(app, "europe-west1"); connectFunctionsEmulator(functions, clientHost, 5001);
  const user = { database: db, endpoint: httpsCallable(functions, "encryptedAccount", { timeout: 90_000 }) };
  if (!authenticate) return user;
  const credential = await createUserWithEmailAndPassword(auth, `${label}-${suffix}@example.test`, "emulator-test-password-123");
  const token = await credential.user.getIdToken();
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(claims.aud, projectId, "The callable must receive a demo-project Auth emulator ID token");
  user.uid = credential.user.uid; user.email = credential.user.email;
  user.root = crypto.identity(); user.personalKey = crypto.randomKey();
  user.device = { id: "phone", identity: crypto.identity() };
  user.vault = { uid: user.uid, identity: user.root };
  const registration = {
    id: user.device.id, ...publicIdentity(user.device.identity),
    certificate: crypto.signature({ uid: user.uid, id: user.device.id, ...publicIdentity(user.device.identity) }, user.root.signingPrivateKey),
    grant: crypto.seal(user.vault, user.device.identity.publicKey),
  };
  const initial = {
    ...publicIdentity(user.root), device: registration,
    recovery: crypto.encrypt(user.vault, `recovery/${user.uid}`, "recovery:1", crypto.randomKey(), user.root),
  };
  await call(user, "setup", { ...initial, proof: crypto.signature(initial, user.root.signingPrivateKey) });
  return user;
}
try {
  // Unique users/groups permit repeat runs without wiping anyone's physical-device
  // test state. Refuse a frozen/incompatible policy rather than changing it.
  const policy = (await database.ref("e2eePolicy").get()).val();
  if (!policy) await database.ref("e2eePolicy").set({ encryptedGroupsOnly: true, historyGeneration: 1, sharedWritesFrozen: false });
  else {
    assert.equal(policy.encryptedGroupsOnly, true, "Expected the isolated encrypted-only test policy");
    assert.equal(policy.historyGeneration, 1, "Expected test history generation 1");
    assert.notEqual(policy.sharedWritesFrozen, true, "Unfreeze only the isolated emulator before smoke testing");
  }
  const A = await client("owner"), B = await client("member"), C = await client("outsider"), anonymous = await client("anonymous", false);
  const initialKey = crypto.randomKey(), groupKey = crypto.randomKey();
  const first = signGroup({ id: groupId, ownerId: A.uid, epoch: 1, revision: 1, status: "ready", members: { [A.uid]: publicIdentity(A.root) }, grants: { [A.uid]: crypto.seal({ keys: { 1: initialKey } }, A.root.publicKey) }, signer: A.root.signingPublicKey, signers: [A.root.signingPublicKey, A.device.identity.signingPublicKey] }, A.root);
  const ownerMembership = { id: `owner_${suffix}`, userId: A.uid, groupId, role: "owner", createdAt: new Date().toISOString() };
  await call(A, "createGroup", { group: first, records: {
    group: { id: groupId, ownerId: A.uid, inviteCode, createdAt: new Date().toISOString(), name: crypto.encrypt("Emulator smoke community", `groups/${groupId}/name`, `group:${groupId}:1`, initialKey, A.device.identity) },
    membership: ownerMembership, userMembership: ownerMembership,
  } });
  const resolved = await call(B, "resolveInvite", { code: inviteCode });
  assert.equal(resolved.groupId, groupId);
  await call(B, "requestJoin", { code: inviteCode, identity: publicIdentity(B.root), name: crypto.seal({ name: "Emulated member" }, A.root.publicKey) });
  const joined = signGroup({ ...first, previous: first, epoch: 2, revision: 2,
    members: { [A.uid]: publicIdentity(A.root), [B.uid]: publicIdentity(B.root) },
    grants: { [A.uid]: crypto.seal({ keys: { 1: initialKey, 2: groupKey } }, A.root.publicKey), [B.uid]: crypto.seal({ keys: { 1: initialKey, 2: groupKey } }, B.root.publicKey) },
    signers: [...first.signers, B.root.signingPublicKey, B.device.identity.signingPublicKey],
  }, A.root);
  const memberMembership = { id: `member_${suffix}`, userId: B.uid, groupId, role: "member", createdAt: new Date().toISOString() };
  await denied(() => call(B, "groupChange", { group: joined, records: { membership: memberMembership, userMembership: memberMembership } }));
  await call(A, "groupChange", { group: joined, records: { membership: memberMembership, userMembership: memberMembership } });
  const granted = crypto.unseal((await get(ref(B.database, `e2eeGroups/${groupId}/grants/${B.uid}`))).val(), B.root);
  assert.equal(granted.keys[2], groupKey, "Normal owner admission must deliver the encrypted community key");
  const cipher = (value, path, user = B) => crypto.encrypt(value, path, `group:${groupId}:2`, groupKey, user.device.identity);
  const personal = (value, path) => crypto.encrypt(value, path, `user:${B.uid}:1`, B.personalKey, B.device.identity);
  const privatePath = `journalEntries/${B.uid}/private_${suffix}`;
  const privateEntry = { userId: B.uid, body: personal("Private journal survives moderation", `${privatePath}/body`) };
  await set(ref(B.database, `encryptedData/${privatePath}`), privateEntry);
  const privateCheckPath = `privateCheckIns/${B.uid}/private_${suffix}`;
  const privateCheck = { userId: B.uid, groupId, dayKey: "2026-01-01", visibility: "private", reflectionText: personal("Private check-in", `${privateCheckPath}/reflectionText`) };
  await set(ref(B.database, `encryptedData/${privateCheckPath}`), privateCheck);
  await denied(() => get(ref(A.database, `encryptedData/${privatePath}`)));
  await denied(() => get(ref(A.database, `encryptedData/${privateCheckPath}`)));
  for (const operation of ["imageUpload", "imageDownload", "imageDelete", "legacyImage"]) {
    await assert.rejects(call(A, operation, { bucket: "user-avatars", path: `${A.uid}/not-uploaded` }), error => error.code === "functions/failed-precondition" && /disabled.*emulator|emulator.*disabled/i.test(error.message));
  }
  for (const [targetType, kind] of [["post", "reflection"], ["post", "prayer_request"], ["post", "praise"], ["check_in", "checkin"], ["reply", "individual"]]) {
    const targetId = `${kind}_${suffix}`, collection = { post: "posts", check_in: "checkIns", reply: "replies" }[targetType];
    const logical = `${collection}/${groupId}/${targetId}`, path = `encryptedData/${logical}`;
    const parentId = `parent_${suffix}`;
    if (targetType === "reply") await set(ref(B.database, `encryptedData/posts/${groupId}/${parentId}`), { userId: B.uid, historyGeneration: 1, body: cipher("Retained parent", `posts/${groupId}/${parentId}/body`) });
    const record = { id: targetId, userId: B.uid, groupId, historyGeneration: 1, createdAt: "2026-01-02", body: cipher("Shared content", `${logical}/body`),
      ...(targetType === "post" ? { kind: cipher(kind, `${logical}/kind`) } : {}),
      ...(targetType === "check_in" ? { dayKey: "2026-01-02", visibility: "group" } : {}),
      ...(targetType === "reply" ? { targetType: "post", targetId: parentId } : {}),
    };
    await set(ref(B.database, path), record);
    if (targetType === "check_in") await set(ref(B.database, `encryptedData/checkInDailyClaims/${B.uid}/${groupId}/2026-01-02`), { dayKey: "2026-01-02", checkInId: targetId, visibility: "group", status: "committed", createdAt: 1, historyGeneration: 1 });
    assert.equal(crypto.decrypt((await get(ref(A.database, path))).val().body, `${logical}/body`, groupKey, new Set([B.device.identity.signingPublicKey])), "Shared content");
    await denied(() => set(ref(A.database, path), null));
    await denied(() => set(ref(A.database, `${path}/body`), cipher("Unauthorized edit", `${logical}/body`, A)));
    await denied(() => moderation(B, targetType, targetId));
    await denied(() => moderation(C, targetType, targetId));
    const removal = signed(A, "removeCommunityContent", { groupId, targetType, targetId });
    await denied(() => anonymous.endpoint(removal));
    await denied(() => B.endpoint(removal)); // Authentic member token plus owner's signature must not impersonate A.
    const childId = `child_${targetId}`;
    const noticePath = `encryptedData/activityNotifications/${B.uid}/${childId}`;
    if (targetType !== "reply") await set(ref(A.database, `encryptedData/replies/${groupId}/${childId}`), { id: childId, userId: A.uid, historyGeneration: 1, createdAt: new Date().toISOString(), targetType, targetId, body: cipher("Removed child", `replies/${groupId}/${childId}/body`, A) });
    if (kind === "reflection") {
      // Prove this is the real registered RTDB trigger, not only the callable:
      // A replies to B's post and B receives the automatically generated notice.
      await eventually(async () => (await get(ref(B.database, noticePath))).exists(), "The real Functions RTDB trigger did not create a reply notification");
      const notice = (await get(ref(B.database, noticePath))).val();
      assert.equal(notice.actorUserId, A.uid);
      assert.equal(notice.recipientUserId, B.uid);
      assert.equal(notice.groupId, groupId);
      assert.equal(notice.targetType, targetType);
      assert.equal(notice.targetId, targetId);
      assert.equal(notice.replyId, childId);
      assert.equal(notice.historyGeneration, 1);
    }
    const queued = [];
    if (kind === "reflection") {
      goOffline(B.database);
      const queue = promise => queued.push(promise.then(() => assert.fail("Queued stale write was accepted"), error => assert.match(String(error), /permission.denied/i)));
      queue(set(ref(B.database, path), record));
      queue(set(ref(B.database, `encryptedData/replies/${groupId}/offline_${suffix}`), { id: `offline_${suffix}`, userId: B.uid, historyGeneration: 1, createdAt: new Date().toISOString(), targetType, targetId, body: cipher("Queued reply", `replies/${groupId}/offline_${suffix}/body`) }));
      await Promise.resolve();
    }
    assert.deepEqual((await A.endpoint(removal)).data, { removed: true });
    goOnline(B.database); await Promise.all(queued);
    const auditPath = `moderationActions/${groupId}/${targetType}/${targetId}`;
    const audit = (await database.ref(auditPath).get()).val();
    assert.deepEqual(Object.keys(audit).sort(), ["action", "actorUserId", "authorUserId", "createdAt", "targetId", "targetType"]);
    assert.deepEqual((await A.endpoint(removal)).data, { removed: true });
    await moderation(A, targetType, targetId);
    assert.deepEqual((await database.ref(auditPath).get()).val(), audit, "HTTP retries must preserve one audit event");
    for (const user of [A, B]) assert.equal((await get(ref(user.database, path))).exists(), false);
    await absent(`encryptedData/replies/${groupId}/${targetType === "reply" ? targetId : childId}`);
    await absent(noticePath);
    await denied(() => set(ref(B.database, path), record));
    await denied(() => set(ref(A.database, `moderationTombstones/${groupId}/${targetType}/${targetId}`), null));
    if (targetType === "reply") assert.equal((await get(ref(B.database, `encryptedData/posts/${groupId}/${parentId}`))).exists(), true);
    else await denied(() => set(ref(B.database, `encryptedData/replies/${groupId}/stale_${suffix}`), { id: `stale_${suffix}`, userId: B.uid, historyGeneration: 1, createdAt: new Date().toISOString(), targetType, targetId, body: cipher("Stale", `replies/${groupId}/stale_${suffix}/body`) }));
    if (targetType === "check_in") {
      const claimPath = `encryptedData/checkInDailyClaims/${B.uid}/${groupId}/2026-01-02`;
      assert.equal((await get(ref(B.database, claimPath))).val().moderated, true);
      await denied(() => set(ref(B.database, claimPath), null));
      await denied(() => set(ref(B.database, `encryptedData/checkIns/${groupId}/duplicate_${suffix}`), record));
      await denied(() => set(ref(B.database, `encryptedData/privateCheckIns/${B.uid}/duplicate_${suffix}`), { ...privateCheck, dayKey: "2026-01-02" }));
    }
  }
  // Exercise actual HTTP removal racing live RTDB client writes. Each reply is
  // either committed before the atomic removal and cleaned, or rejected by rules.
  const raceId = `race_${suffix}`, racePath = `encryptedData/posts/${groupId}/${raceId}`;
  await set(ref(B.database, racePath), { userId: B.uid, historyGeneration: 1, body: cipher("Concurrent parent", `posts/${groupId}/${raceId}/body`) });
  const removalInFlight = moderation(A, "post", raceId);
  const competing = Array.from({ length: 5 }, (_, index) => {
    const replyId = `race_${index}_${suffix}`;
    return set(ref(B.database, `encryptedData/replies/${groupId}/${replyId}`), { id: replyId, userId: B.uid, historyGeneration: 1, createdAt: new Date().toISOString(), targetType: "post", targetId: raceId, body: cipher("Concurrent child", `replies/${groupId}/${replyId}/body`) }).catch(error => assert.match(String(error), /permission.denied/i));
  });
  await Promise.all([removalInFlight, ...competing]);
  await absent(racePath);
  for (let index = 0; index < 5; index++) await absent(`encryptedData/replies/${groupId}/race_${index}_${suffix}`);
  const ownId = `self_${suffix}`, ownPath = `encryptedData/posts/${groupId}/${ownId}`;
  await set(ref(B.database, ownPath), { userId: B.uid, historyGeneration: 1, body: cipher("Self-delete", `posts/${groupId}/${ownId}/body`) });
  await set(ref(B.database, ownPath), null); await absent(ownPath);
  const ownParent = `author_parent_${suffix}`, otherReply = `author_child_${suffix}`;
  await set(ref(A.database, `encryptedData/posts/${groupId}/${ownParent}`), { userId: A.uid, historyGeneration: 1, body: cipher("Author parent", `posts/${groupId}/${ownParent}/body`, A) });
  await set(ref(B.database, `encryptedData/replies/${groupId}/${otherReply}`), { id: otherReply, userId: B.uid, historyGeneration: 1, createdAt: new Date().toISOString(), targetType: "post", targetId: ownParent, body: cipher("Member child", `replies/${groupId}/${otherReply}/body`) });
  await denied(() => set(ref(A.database, `encryptedData/replies/${groupId}/${otherReply}`), null));
  await update(ref(A.database), { [`encryptedData/posts/${groupId}/${ownParent}`]: null, [`encryptedData/replies/${groupId}/${otherReply}`]: null });
  await absent(`encryptedData/replies/${groupId}/${otherReply}`);
  assert.deepEqual((await get(ref(B.database, `encryptedData/${privatePath}`))).val(), privateEntry);
  assert.deepEqual((await get(ref(B.database, `encryptedData/${privateCheckPath}`))).val(), privateCheck);
  assert.equal(crypto.decrypt(privateEntry.body, `${privatePath}/body`, B.personalKey, new Set([B.device.identity.signingPublicKey])), "Private journal survives moderation");
  await eventually(async () => !(await database.ref(`encryptedData/replies/${groupId}/offline_${suffix}`).get()).exists(), "An offline reply must remain removed after reconnect");
  const serialized = JSON.stringify((await database.ref().get()).val());
  for (const secret of [groupKey, B.personalKey, "Shared content", "Private journal survives moderation", "Private check-in"]) assert.ok(!serialized.includes(secret), "Plaintext/key must remain outside persisted emulator records");
  // Persist only identifiers and ciphertext/metadata hashes for the launcher's
  // fresh-process export/import check. Never persist test decryption keys,
  // plaintext journal content, recovery material or signed Auth tokens here.
  const proofRecord = async path => ({ path, sha256: metadataHash((await database.ref(path).get()).val()) });
  const proof = {
    projectId, groupId,
    owner: { uid: A.uid, email: A.email }, member: { uid: B.uid, email: B.email },
    privateJournal: await proofRecord(`encryptedData/${privatePath}`),
    moderatedCheckIn: {
      tombstone: await proofRecord(`moderationTombstones/${groupId}/check_in/checkin_${suffix}`),
      dailyClaim: await proofRecord(`encryptedData/checkInDailyClaims/${B.uid}/${groupId}/2026-01-02`),
    },
    reflectionTombstone: await proofRecord(`moderationTombstones/${groupId}/post/reflection_${suffix}`),
  };
  const proofDirectory = new URL("../.codex/koino-emulator-device/", import.meta.url);
  mkdirSync(proofDirectory, { recursive: true });
  writeFileSync(new URL("restart-proof.json", proofDirectory), `${JSON.stringify(proof, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log("Real HTTP callable emulator passed: Auth IDs/signatures, setup, encrypted group creation/admission, A/B/C authorization, post/prayer/praise/check-in/reply removal, private preservation, automatic reply notification/cleanup, offline rejection, concurrent replies, tombstones, daily claims, retries, atomic author self-delete and disabled image storage. Metadata-only restart proof saved.");
} finally {
  for (const app of apps) goOffline(getDatabase(app));
  await Promise.all(apps.map(deleteApp));
  await adminDelete(admin);
}
