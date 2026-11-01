import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, deleteApp, setLogLevel } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, goOffline, goOnline, onValue } from "firebase/database";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { crypto } from "./encryption-test-helpers.mjs";

// Real Auth, callable HTTP, RTDB SDK/rules, signed key grants, sodium ciphertext
// and Functions triggers. No handler.run, mocked authorization or live phone data.
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectId = "demo-koino", databaseURL = "https://demo-koino-default-rtdb.firebaseio.com";
const host = "127.0.0.1", ports = { auth: 19099, database: 19001, functions: 15001 };
assert.equal(process.env.KOINO_ADMISSION_TEST_MODE, "1", "Use the isolated acceptance launcher");
assert.equal(process.env.KOINO_EMULATOR_TEST_MODE, "1");
assert.equal(process.env.KOINO_ACCEPTANCE_SUITE, "Moderation");
for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "GCP_PROJECT"]) if (process.env[name]) assert.equal(process.env[name], projectId);
assert.equal(process.env.GCLOUD_PROJECT, projectId);
for (const [name, expected] of Object.entries({ FIREBASE_AUTH_EMULATOR_HOST: `${host}:${ports.auth}`, FIREBASE_DATABASE_EMULATOR_HOST: `${host}:${ports.database}`, FIREBASE_FUNCTIONS_EMULATOR_HOST: `${host}:${ports.functions}` })) assert.equal(process.env[name], expected, "Refusing non-fixture endpoint");
for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "KOINO_SUPABASE_SERVICE_KEY", "STRIPE_SECRET_KEY"]) assert.ok(!process.env[name], "External credentials must be absent");
const configuration = JSON.parse(process.env.FIREBASE_CONFIG ?? "{}");
assert.equal(configuration.projectId, projectId); assert.equal(configuration.databaseURL?.replace(/\/$/, ""), databaseURL);
const stage = process.env.KOINO_ADMISSION_TEST_STAGE;
assert.ok(["initial", "restart"].includes(stage));
const supplied = process.env.KOINO_ADMISSION_TEST_STATE_DIR;
assert.ok(supplied && path.isAbsolute(supplied));
const directory = path.resolve(supplied), privateRoot = path.join(repository, ".codex", "koino-admission-validation");
const relative = path.relative(privateRoot, directory);
assert.ok(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "State must stay in ignored fixture tree");
execFileSync("git", ["check-ignore", "--quiet", "--no-index", path.join(directory, "moderation-private-state.json")], { cwd: repository, stdio: "pipe" });
mkdirSync(directory, { recursive: true, mode: 0o700 });
const realRelative = path.relative(realpathSync(privateRoot), realpathSync(directory));
assert.ok(realRelative && realRelative !== ".." && !realRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(realRelative));
const manifestFile = path.join(directory, "moderation-private-state.json");
const save = value => { const temporary = `${manifestFile}.tmp`; writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); renameSync(temporary, manifestFile); };
const allowedPorts = new Set(Object.values(ports));
const allowedUrl = input => { const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url); assert.ok(url.protocol === "http:" && url.hostname === host && allowedPorts.has(Number(url.port)) && !url.username && !url.password, "Acceptance blocked external/non-fixture destination"); };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => { allowedUrl(input); const response = await originalFetch(input, { ...init, redirect: "error" }); assert.ok(!response.redirected && !(response.status >= 300 && response.status < 400), "Acceptance blocked redirect"); if (response.url) allowedUrl(response.url); return response; };
const originalConnect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) { const connection = Array.isArray(args[0]) ? args[0] : args, options = connection[0]; if (options && typeof options === "object") assert.ok(options.path === undefined && options.host === host && allowedPorts.has(Number(options.port)), "Acceptance blocked non-fixture socket"); else assert.ok(allowedPorts.has(Number(options)) && connection[1] === host, "Acceptance blocked non-fixture socket"); return Reflect.apply(originalConnect, this, args); };
setLogLevel("silent");
const originalWarn = console.warn;
let suppressedExpectedWarnings = 0;
console.warn = (...items) => { if (items.some(item => String(item).includes("FIREBASE WARNING"))) { suppressedExpectedWarnings++; return; } originalWarn("Acceptance warning: details suppressed"); };
const publicIdentity = identity => ({ publicKey: identity.publicKey, signingPublicKey: identity.signingPublicKey });
const signedGroup = (group, identity) => { const { signature, ...payload } = group; return { ...payload, signature: crypto.signature({ ...payload, previous: payload.previous ?? null }, identity.signingPrivateKey) }; };
const signed = (person, operation, data) => { const payload = { operation, data, deviceId: person.device.id, requestId: crypto.randomKey(), timestamp: Date.now() }; return { ...payload, signature: crypto.signature(payload, person.device.identity.signingPrivateKey) }; };
const call = async (person, operation, data) => (await person.endpoint(signed(person, operation, data))).data;
const readFixture = async logical => { const response = await fetch(`http://${host}:${ports.database}/${logical}.json?ns=demo-koino-default-rtdb`, { headers: { authorization: "Bearer owner" }, signal: AbortSignal.timeout(10_000) }); assert.ok(response.ok, "Fixture verification read failed"); return response.json(); };
const initializePolicy = async () => { assert.equal(stage, "initial"); assert.equal(await readFixture("e2eePolicy"), null, "Initial fixture must be empty"); const response = await fetch(`http://${host}:${ports.database}/e2eePolicy.json?ns=demo-koino-default-rtdb`, { method: "PUT", headers: { authorization: "Bearer owner", "content-type": "application/json" }, body: JSON.stringify({ encryptedGroupsOnly: true, historyGeneration: 1, sharedWritesFrozen: false }) }); assert.ok(response.ok, "Only isolated policy initialization may use fixture write"); };
const bound = (promise, label, ms = 30_000) => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })]).finally(() => clearTimeout(timer)); };
const denied = async action => { try { await bound(action(), "Expected denial timed out"); } catch (error) { assert.match(String(error?.code ?? error?.message ?? ""), /permission.denied|unauthenticated/i, "Real authorization boundary must reject operation"); return; } assert.fail("Unauthorized operation accepted"); };
const rejectCode = (action, code) => assert.rejects(action, error => error?.code === `functions/${code}`, "Callable must preserve expected error category");
const eventually = async (predicate, label) => { const until = Date.now() + 30_000; while (Date.now() < until) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 80)); } assert.fail(label); };
const apps = [];
let currentStep = "preflight", passed = 0;
async function step(label, action) { currentStep = label; await action(); passed++; console.log(`[moderation:${stage}] PASS ${label}`); }
async function client(label, saved, initial, authenticated = true) {
  const app = initializeApp({ apiKey: "emulator-only", appId: "emulator-only", projectId, databaseURL }, `acceptance-${label}-${Date.now()}-${apps.length}`); apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, `http://${host}:${ports.auth}`, { disableWarnings: true });
  const database = getDatabase(app); connectDatabaseEmulator(database, host, ports.database);
  const functions = getFunctions(app, "europe-west1"); connectFunctionsEmulator(functions, host, ports.functions);
  const person = { label, database, endpoint: httpsCallable(functions, "encryptedAccount", { timeout: 90_000 }) };
  if (!authenticated) return person;
  const credential = initial ? await createUserWithEmailAndPassword(auth, saved.email, saved.password) : await signInWithEmailAndPassword(auth, saved.email, saved.password);
  person.uid = credential.user.uid;
  const token = await credential.user.getIdToken(), claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); assert.equal(claims.aud, projectId);
  if (initial) {
    person.root = crypto.identity(); person.personalKey = crypto.randomKey(); person.device = { id: "acceptance-device", identity: crypto.identity() };
    const vault = { v: 1, uid: person.uid, identity: person.root };
    const registration = { id: person.device.id, ...publicIdentity(person.device.identity), grant: crypto.seal(vault, person.device.identity.publicKey), certificate: crypto.signature({ uid: person.uid, id: person.device.id, ...publicIdentity(person.device.identity) }, person.root.signingPrivateKey) };
    const data = { ...publicIdentity(person.root), device: registration, recovery: crypto.encrypt(vault, `recovery/${person.uid}`, "recovery:1", crypto.randomKey(), person.root) };
    await call(person, "setup", { ...data, proof: crypto.signature(data, person.root.signingPrivateKey) }); Object.assign(saved, { uid: person.uid, root: person.root, personalKey: person.personalKey, device: person.device });
  } else { assert.equal(person.uid, saved.uid, "Imported Auth identity must persist"); Object.assign(person, { root: saved.root, personalKey: saved.personalKey, device: saved.device }); }
  return person;
}
async function createGroup(person, id, invite, initialKey) {
  const group = signedGroup({ id, ownerId: person.uid, epoch: 1, revision: 1, status: "ready", members: { [person.uid]: publicIdentity(person.root) }, grants: { [person.uid]: crypto.seal({ id, keys: { 1: initialKey } }, person.root.publicKey) }, signer: person.root.signingPublicKey, signers: [person.root.signingPublicKey, person.device.identity.signingPublicKey] }, person.root);
  const membership = { id: `owner_${id}`, userId: person.uid, groupId: id, role: "owner", createdAt: "2026-01-01T12:00:00Z" };
  await call(person, "createGroup", { group, records: { group: { id, ownerId: person.uid, inviteCode: invite, createdAt: "2026-01-01T12:00:00Z", name: crypto.encrypt("Synthetic encrypted community", `groups/${id}/name`, `group:${id}:1`, initialKey, person.device.identity) }, membership, userMembership: membership } }); return group;
}
let manifest, A, B, C, anonymous;
const cipher = (value, logical, person = B) => crypto.encrypt(value, logical, `group:${manifest.groupId}:2`, manifest.groupKey, person.device.identity);
const personal = (value, logical, person = B) => crypto.encrypt(value, logical, `user:${person.uid}:1`, person.personalKey, person.device.identity);
const put = (person, logical, value) => set(ref(person.database, `encryptedData/${logical}`), value);
const read = (person, logical) => get(ref(person.database, `encryptedData/${logical}`)).then(snapshot => snapshot.val());
const moderate = (person, type, id, groupId = manifest.groupId) => call(person, "removeCommunityContent", { groupId, targetType: type, targetId: id });
const post = (id, person = B, kind = "reflection") => ({ id, userId: person.uid, groupId: manifest.groupId, historyGeneration: 1, createdAt: "2026-01-02T12:00:00Z", kind: cipher(kind, `posts/${manifest.groupId}/${id}/kind`, person), body: cipher("Synthetic shared content", `posts/${manifest.groupId}/${id}/body`, person) });
const reply = (id, targetType, targetId, person = B) => ({ id, userId: person.uid, groupId: manifest.groupId, targetType, targetId, historyGeneration: 1, createdAt: "2026-01-02T12:00:00Z", body: cipher("Synthetic reply", `replies/${manifest.groupId}/${id}/body`, person) });
const absent = async logical => assert.equal(await readFixture(logical), null, "Removed data must stay absent");
const subscriptions = [];
function observePresence(person, logical) {
  const state = { present: undefined, failed: false };
  const stop = onValue(ref(person.database, `encryptedData/${logical}`), snapshot => { state.present = snapshot.exists(); }, () => { state.failed = true; });
  subscriptions.push(stop); return state;
}

async function verifyPrivacy() {
  for (const item of manifest.privateRecords) {
    assert.deepEqual(await read(B, item.logical), item.record, "Private ciphertext must remain byte-for-byte unchanged");
    assert.equal(crypto.decrypt(item.record[item.field], `${item.logical}/${item.field}`, B.personalKey, new Set([B.device.identity.signingPublicKey])), item.plaintext);
    for (const other of [A, C]) {
      await denied(() => get(ref(other.database, `encryptedData/${item.logical}`)));
      await denied(() => set(ref(other.database, `encryptedData/${item.logical}`), null));
      await denied(() => set(ref(other.database, `encryptedData/${item.logical}/${item.field}`), personal("Forged private edit", `${item.logical}/${item.field}`, other)));
    }
  }
}
async function verifyMembership() {
  for (const person of [A, B]) {
    const authority = (await get(ref(person.database, `e2eeGroups/${manifest.groupId}`))).val();
    const grant = crypto.unseal(authority.grants[person.uid], person.root);
    assert.equal(grant.id, manifest.groupId); assert.equal(grant.keys[2], manifest.groupKey);
    const membership = await read(person, `userGroups/${person.uid}/${manifest.groupId}`);
    assert.equal(membership.userId, person.uid); assert.equal(membership.role, person === A ? "owner" : "member");
    const survivor = await read(person, `posts/${manifest.groupId}/${manifest.survivorId}`);
    assert.equal(crypto.decrypt(survivor.body, `posts/${manifest.groupId}/${manifest.survivorId}/body`, grant.keys[2], new Set([A.device.identity.signingPublicKey])), "Synthetic shared content");
  }
  for (const person of [C, anonymous]) {
    await denied(() => get(ref(person.database, `e2eeGroups/${manifest.groupId}`)));
    await denied(() => read(person, `posts/${manifest.groupId}`));
  }
}
async function verifyRemoved({ type, id, logical, record, cleanup, tombstones, audit }) {
  for (const person of [A, B]) assert.equal(await read(person, logical), null, "Both real clients must observe removal");
  for (const physical of cleanup) await absent(physical);
  for (const physical of tombstones) assert.ok(await readFixture(physical), "Every removed target needs persistent tombstone");
  const currentAudit = (await get(ref(A.database, `moderationActions/${manifest.groupId}/${type}/${id}`))).val();
  assert.deepEqual(currentAudit, audit, "Import/retry cannot alter original metadata audit");
  assert.deepEqual(Object.keys(currentAudit).sort(), ["action", "actorUserId", "authorUserId", "createdAt", "targetId", "targetType"]);
  await denied(() => put(B, logical, record));
  await denied(() => set(ref(A.database, `moderationTombstones/${manifest.groupId}/${type}/${id}`), null));
  await denied(() => set(ref(B.database, `moderationTombstones/${manifest.groupId}/${type}/${id}`), { removedAt: "forged" }));
  await denied(() => set(ref(A.database, `moderationActions/${manifest.groupId}/${type}/${id}`), null));
  await denied(() => update(ref(B.database), { [`encryptedData/${logical}`]: record, [`moderationTombstones/${manifest.groupId}/${type}/${id}`]: null }));
  assert.ok(await readFixture(`moderationTombstones/${manifest.groupId}/${type}/${id}`));
  await denied(() => get(ref(B.database, `moderationActions/${manifest.groupId}/${type}/${id}`)));
  await denied(() => get(ref(C.database, `moderationTombstones/${manifest.groupId}/${type}/${id}`)));
  const before = JSON.stringify(currentAudit);
  assert.deepEqual(await moderate(A, type, id), { removed: true });
  assert.equal(JSON.stringify(await readFixture(`moderationActions/${manifest.groupId}/${type}/${id}`)), before, "Semantic retry must keep one audit");
}
async function verifyStaleReferences({ type, id }) {
  const staleId = `stale_${type}_${id}`;
  if (type !== "reply") {
    await denied(() => put(B, `replies/${manifest.groupId}/${staleId}`, reply(staleId, type, id)));
    await denied(() => put(B, `postReactions/${manifest.groupId}/${staleId}`, { userId: B.uid, targetType: type, targetId: id, historyGeneration: 1, kind: cipher("heart", `postReactions/${manifest.groupId}/${staleId}/kind`) }));
    await denied(() => put(B, `discussionFollowers/${manifest.groupId}/${type}/${id}/${B.uid}`, { userId: B.uid, targetType: type, targetId: id, historyGeneration: 1 }));
    await denied(() => put(B, `userDiscussionFollows/${B.uid}/${manifest.groupId}/${staleId}`, { userId: B.uid, groupId: manifest.groupId, targetType: type, targetId: id, historyGeneration: 1 }));
  }
  await denied(() => put(B, `prayerReactions/${manifest.groupId}/${staleId}`, { userId: B.uid, targetType: type, targetId: id, historyGeneration: 1, durationSeconds: cipher(9, `prayerReactions/${manifest.groupId}/${staleId}/durationSeconds`) }));
}
async function verifyOfflineCheckInReplay() {
  const claim = await read(B, manifest.dailyClaimLogical), reset = { ...claim };
  delete reset.moderated;
  goOffline(B.database);
  const pending = [
    denied(() => put(B, `checkIns/${manifest.groupId}/${manifest.sharedCheckId}`, manifest.sharedCheckRecord)),
    denied(() => put(B, manifest.dailyClaimLogical, null)),
    denied(() => put(B, manifest.dailyClaimLogical, reset)),
    denied(() => put(B, `replies/${manifest.groupId}/restart_offline_check_reply`, reply("restart_offline_check_reply", "check_in", manifest.sharedCheckId))),
    denied(() => put(B, `postReactions/${manifest.groupId}/restart_offline_check_reaction`, { userId: B.uid, targetType: "check_in", targetId: manifest.sharedCheckId, historyGeneration: 1, kind: cipher("heart", `postReactions/${manifest.groupId}/restart_offline_check_reaction/kind`) })),
  ];
  goOnline(B.database); await bound(Promise.all(pending), "Post-import check-in offline replay timed out");
  await absent(`encryptedData/checkIns/${manifest.groupId}/${manifest.sharedCheckId}`);
  await absent(`encryptedData/replies/${manifest.groupId}/restart_offline_check_reply`);
  await absent(`encryptedData/postReactions/${manifest.groupId}/restart_offline_check_reaction`);
  await verifyDailyClaim(); await verifyPrivacy();
}
async function verifyDailyClaim() {
  const claim = await read(B, manifest.dailyClaimLogical);
  assert.equal(claim.checkInId, manifest.sharedCheckId); assert.equal(claim.status, "committed"); assert.equal(claim.moderated, true);
  assert.equal(await readFixture(`moderatedCheckInDays/${B.uid}/${manifest.groupId}/2026-01-02`), true);
  await denied(() => put(B, manifest.dailyClaimLogical, null));
  await denied(() => put(B, manifest.dailyClaimLogical, { ...claim, moderated: false }));
  const duplicateId = "duplicate_daily";
  await denied(() => put(B, `checkIns/${manifest.groupId}/${duplicateId}`, { ...manifest.sharedCheckRecord, id: duplicateId }));
  await denied(() => put(B, `privateCheckIns/${B.uid}/${duplicateId}`, { ...manifest.privateRecords[1].record, id: duplicateId, dayKey: "2026-01-02" }));
}
async function recordRemoval(type, id, logical, record, cleanup = [], tombstones = []) {
  const request = signed(A, "removeCommunityContent", { groupId: manifest.groupId, targetType: type, targetId: id });
  assert.deepEqual((await A.endpoint(request)).data, { removed: true });
  const audit = await readFixture(`moderationActions/${manifest.groupId}/${type}/${id}`);
  assert.deepEqual((await A.endpoint(request)).data, { removed: true }, "Same signed request must be idempotent");
  const result = { type, id, logical, record, cleanup, tombstones: [`moderationTombstones/${manifest.groupId}/${type}/${id}`, ...tombstones], audit };
  manifest.removals.push(result); await verifyRemoved(result); save(manifest);
}
try {
  if (stage === "initial") {
    assert.ok(!existsSync(manifestFile), "Initial suite requires new fixture");
    const run = `${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
    const credentials = label => ({ email: `moderation-${label}-${run}@example.test`, password: `synthetic-${randomBytes(12).toString("hex")}` });
    manifest = { version: 1, suite: "moderation-acceptance", initialComplete: false, groupId: `acceptance_${run}`, unrelatedId: `unrelated_${run}`, inviteCode: `ACCEPT_${run}`, initialKey: crypto.randomKey(), groupKey: crypto.randomKey(), unrelatedKey: crypto.randomKey(), people: { A: credentials("owner"), B: credentials("member"), C: credentials("outsider") }, removals: [], privateRecords: [], survivorId: "survivor", sharedCheckId: "shared_check" };
    await step("isolated empty fixture policy", initializePolicy);
    await step("real Auth and encrypted account setup", async () => { A = await client("owner", manifest.people.A, true); B = await client("member", manifest.people.B, true); C = await client("outsider", manifest.people.C, true); anonymous = await client("anonymous", null, true, false); save(manifest); });
    await step("signed creation and owner-controlled encrypted admission", async () => {
      const first = await createGroup(A, manifest.groupId, manifest.inviteCode, manifest.initialKey);
      await createGroup(C, manifest.unrelatedId, `OTHER_${run}`, manifest.unrelatedKey);
      await denied(() => get(ref(B.database, `e2eeGroups/${manifest.groupId}`)));
      assert.equal((await call(B, "resolveInvite", { code: manifest.inviteCode })).groupId, manifest.groupId);
      await call(B, "requestJoin", { code: manifest.inviteCode, identity: publicIdentity(B.root), name: crypto.seal({ name: "Synthetic member" }, A.root.publicKey) });
      await denied(() => get(ref(B.database, `e2eeGroups/${manifest.groupId}`)));
      const joined = signedGroup({ ...first, previous: first, epoch: 2, revision: 2, members: { [A.uid]: publicIdentity(A.root), [B.uid]: publicIdentity(B.root) }, grants: { [A.uid]: crypto.seal({ id: manifest.groupId, keys: { 1: manifest.initialKey, 2: manifest.groupKey } }, A.root.publicKey), [B.uid]: crypto.seal({ id: manifest.groupId, keys: { 1: manifest.initialKey, 2: manifest.groupKey } }, B.root.publicKey) }, signers: [...first.signers, B.root.signingPublicKey, B.device.identity.signingPublicKey] }, A.root);
      const membership = { id: "member_B", userId: B.uid, groupId: manifest.groupId, role: "member", createdAt: "2026-01-01T12:00:00Z" };
      await denied(() => call(B, "groupChange", { group: joined, records: { membership, userMembership: membership } }));
      await call(A, "groupChange", { group: joined, records: { membership, userMembership: membership } });
      manifest.authority = await readFixture(`e2eeGroups/${manifest.groupId}`); manifest.accounts = await readFixture("e2eeAccounts");
      manifest.survivor = post(manifest.survivorId, A); await put(A, `posts/${manifest.groupId}/${manifest.survivorId}`, manifest.survivor);
      manifest.unrelatedPost = { userId: C.uid, historyGeneration: 1, body: crypto.encrypt("Unrelated encrypted content", `posts/${manifest.unrelatedId}/keep/body`, `group:${manifest.unrelatedId}:1`, manifest.unrelatedKey, C.device.identity) };
      await put(C, `posts/${manifest.unrelatedId}/keep`, manifest.unrelatedPost); await verifyMembership(); save(manifest);
    });
    await step("private journal check-in and Prayer Dwell baseline isolation", async () => {
      for (const [collection, field, plaintext] of [["journalEntries", "body", "Synthetic private journal"], ["privateCheckIns", "reflectionText", "Synthetic private check-in"], ["prayerSessions", "body", "Synthetic Prayer Dwell"]]) {
        const logical = `${collection}/${B.uid}/private_baseline`;
        const record = { id: "private_baseline", userId: B.uid, groupId: manifest.groupId, createdAt: "2026-01-01T12:00:00Z", [field]: personal(plaintext, `${logical}/${field}`), ...(collection === "privateCheckIns" ? { dayKey: "2026-01-01", visibility: "private" } : {}) };
        await put(B, logical, record); manifest.privateRecords.push({ logical, field, plaintext, record });
      }
      await verifyPrivacy(); save(manifest);
    });
    await step("member outsider anonymous and forged signer denied", async () => {
      for (const person of [B, C]) await denied(() => moderate(person, "post", manifest.survivorId));
      const request = signed(A, "removeCommunityContent", { groupId: manifest.groupId, targetType: "post", targetId: manifest.survivorId });
      await denied(() => anonymous.endpoint(request)); await denied(() => B.endpoint(request));
      await denied(() => moderate(A, "post", "keep", manifest.unrelatedId));
      await denied(() => put(A, `posts/${manifest.unrelatedId}/keep`, null));
      await denied(() => read(A, `posts/${manifest.unrelatedId}/keep`));
      await rejectCode(() => moderate(A, "post", manifest.survivorId), "failed-precondition");
      await rejectCode(() => call(A, "removeCommunityContent", { groupId: manifest.groupId, targetType: "journal", targetId: "private_baseline" }), "invalid-argument");
      await rejectCode(() => moderate(A, "post", "../private"), "invalid-argument");
      await rejectCode(() => moderate(A, "post", "nonexistent"), "not-found");
      assert.deepEqual(await read(A, `posts/${manifest.groupId}/${manifest.survivorId}`), manifest.survivor);
      assert.equal(await readFixture(`moderationActions/${manifest.groupId}`), null);
    });
    for (const [type, id, kind] of [["post", "reflection", "reflection"], ["post", "prayer", "prayer_request"], ["post", "praise", "praise"], ["check_in", manifest.sharedCheckId, "checkin"]]) {
      await step(`owner removes ${kind} with atomic child reference cleanup`, async () => {
        const collection = type === "post" ? "posts" : "checkIns", logical = `${collection}/${manifest.groupId}/${id}`;
        const record = type === "post" ? post(id, B, kind) : { id, userId: B.uid, groupId: manifest.groupId, historyGeneration: 1, createdAt: "2026-01-02T12:00:00Z", dayKey: "2026-01-02", visibility: "group", reflectionText: cipher("Synthetic shared check-in", `${logical}/reflectionText`) };
        await put(B, logical, record);
        const liveObservations = [A, B].map(person => observePresence(person, logical));
        await eventually(async () => liveObservations.every(x => x.present === true && !x.failed), "Both real client listeners must initially receive the shared target");
        await denied(() => put(A, logical, null));
        for (const person of [B, C]) await denied(() => moderate(person, type, id));
        const field = type === "post" ? "body" : "reflectionText";
        const readable = await read(A, logical);
        assert.equal(crypto.decrypt(readable[field], `${logical}/${field}`, manifest.groupKey, new Set([B.device.identity.signingPublicKey])), type === "check_in" ? "Synthetic shared check-in" : "Synthetic shared content", "An authorized client must decrypt shared content before moderation");
        await denied(() => put(A, `${logical}/${field}`, cipher("Unauthorized edit", `${logical}/${field}`, A)));
        if (type === "check_in") {
          manifest.sharedCheckRecord = record; manifest.dailyClaimLogical = `checkInDailyClaims/${B.uid}/${manifest.groupId}/2026-01-02`;
          await put(B, manifest.dailyClaimLogical, { dayKey: "2026-01-02", checkInId: id, visibility: "group", status: "committed", createdAt: 1, historyGeneration: 1 });
          const linkedLogical = `journalEntries/${B.uid}/${id}`;
          const linkedPlaintext = "Synthetic journal copy of shared check-in";
          const linkedRecord = { id, userId: B.uid, groupId: manifest.groupId, createdAt: record.createdAt, body: personal(linkedPlaintext, `${linkedLogical}/body`), source: personal("private_check_in", `${linkedLogical}/source`) };
          await put(B, linkedLogical, linkedRecord);
          manifest.privateRecords.push({ logical: linkedLogical, field: "body", plaintext: linkedPlaintext, record: linkedRecord });
        }
        const childA = `${id}_A`, childB = `${id}_B`, reaction = `${id}_reaction`, prayerReaction = `${id}_prayer_reaction`;
        await put(A, `replies/${manifest.groupId}/${childA}`, reply(childA, type, id, A));
        await eventually(async () => Boolean(await read(B, `activityNotifications/${B.uid}/${childA}`)), "Real reply notification trigger did not run");
        await put(B, `replies/${manifest.groupId}/${childB}`, reply(childB, type, id, B));
        await put(A, `prayerReactions/${manifest.groupId}/${prayerReaction}`, { userId: A.uid, targetType: "reply", targetId: childB, historyGeneration: 1, durationSeconds: cipher(12, `prayerReactions/${manifest.groupId}/${prayerReaction}/durationSeconds`, A) });
        await put(B, `postReactions/${manifest.groupId}/${reaction}`, { userId: B.uid, targetType: type, targetId: id, historyGeneration: 1, kind: cipher("heart", `postReactions/${manifest.groupId}/${reaction}/kind`) });
        await put(A, `discussionFollowers/${manifest.groupId}/${type}/${id}/${A.uid}`, { userId: A.uid, targetType: type, targetId: id, historyGeneration: 1 });
        await put(A, `userDiscussionFollows/${A.uid}/${manifest.groupId}/${id}`, { userId: A.uid, groupId: manifest.groupId, targetType: type, targetId: id, historyGeneration: 1 });
        const queued = [], offlineReply = `offline_${id}_reply`, offlineReaction = `offline_${id}_reaction`;
        if (kind === "reflection" || type === "check_in") {
          if (kind === "reflection") await put(B, `posts/${manifest.groupId}/offline_author_delete`, post("offline_author_delete"));
          const originalClaim = type === "check_in" ? await read(B, manifest.dailyClaimLogical) : null;
          goOffline(B.database);
          if (kind === "reflection") queued.push(put(B, `posts/${manifest.groupId}/offline_author_delete`, null));
          const queue = promise => queued.push(promise.then(() => assert.fail("Queued resurrection accepted"), error => assert.match(String(error?.code ?? error), /permission.denied/i)));
          queue(put(B, logical, record)); queue(put(B, `replies/${manifest.groupId}/${offlineReply}`, reply(offlineReply, type, id)));
          queue(put(B, `postReactions/${manifest.groupId}/${offlineReaction}`, { userId: B.uid, targetType: type, targetId: id, historyGeneration: 1, kind: cipher("heart", `postReactions/${manifest.groupId}/${offlineReaction}/kind`) }));
          if (originalClaim) { queue(put(B, manifest.dailyClaimLogical, null)); queue(put(B, manifest.dailyClaimLogical, originalClaim)); }
        }
        const cleanup = [`encryptedData/replies/${manifest.groupId}/${childA}`, `encryptedData/replies/${manifest.groupId}/${childB}`, `encryptedData/postReactions/${manifest.groupId}/${reaction}`, `encryptedData/prayerReactions/${manifest.groupId}/${prayerReaction}`, `encryptedData/discussionFollowers/${manifest.groupId}/${type}/${id}`, `encryptedData/userDiscussionFollows/${A.uid}/${manifest.groupId}/${id}`, `encryptedData/activityNotifications/${B.uid}/${childA}`];
        if (queued.length) {
          const request = signed(A, "removeCommunityContent", { groupId: manifest.groupId, targetType: type, targetId: id });
          assert.deepEqual((await A.endpoint(request)).data, { removed: true }); goOnline(B.database); await bound(Promise.all(queued), "Offline replay acknowledgements timed out");
          manifest.offlineRejected = true;
          if (type === "check_in") manifest.checkInOfflineReplayRejected = true;
          cleanup.push(`encryptedData/replies/${manifest.groupId}/${offlineReply}`, `encryptedData/postReactions/${manifest.groupId}/${offlineReaction}`);
          if (kind === "reflection") cleanup.push(`encryptedData/posts/${manifest.groupId}/offline_author_delete`);
        }
        await recordRemoval(type, id, logical, record, cleanup, [`moderationTombstones/${manifest.groupId}/reply/${childA}`, `moderationTombstones/${manifest.groupId}/reply/${childB}`]);
        await verifyStaleReferences({ type, id });
        await eventually(async () => liveObservations.every(x => x.present === false && !x.failed), "Both real client listeners must receive removal after reconnect");
        if (type === "check_in") await verifyDailyClaim(); await verifyPrivacy();
      });
    }

    await step("selective comment deletion preserves prayer and sibling", async () => {
      const parent = "selective_parent", target = "selective_target", sibling = "selective_sibling";
      manifest.selective = { parent, target, sibling, parentRecord: post(parent, B, "prayer_request"), siblingRecord: reply(sibling, "post", parent, A) };
      await put(B, `posts/${manifest.groupId}/${parent}`, manifest.selective.parentRecord);
      const record = { ...reply(target, "post", parent, B), mentionUserIds: [A.uid] };
      await put(B, `replies/${manifest.groupId}/${target}`, record);
      await eventually(async () => Boolean(await read(A, `activityNotifications/${A.uid}/${target}`)), "Real mention notification missing");
      await put(A, `replies/${manifest.groupId}/${sibling}`, manifest.selective.siblingRecord);
      await eventually(async () => Boolean(await read(B, `activityNotifications/${B.uid}/${sibling}`)), "Sibling notification missing");
      await recordRemoval("reply", target, `replies/${manifest.groupId}/${target}`, record, [`encryptedData/activityNotifications/${A.uid}/${target}`]);
      assert.deepEqual(await read(B, `posts/${manifest.groupId}/${parent}`), manifest.selective.parentRecord);
      assert.deepEqual(await read(B, `replies/${manifest.groupId}/${sibling}`), manifest.selective.siblingRecord);
      assert.ok(await read(B, `activityNotifications/${B.uid}/${sibling}`)); save(manifest);
    });
    await step("concurrent live replies cannot escape atomic removal", async () => {
      const id = "concurrent_parent", logical = `posts/${manifest.groupId}/${id}`, record = post(id);
      await put(B, logical, record);
      const removal = moderate(A, "post", id);
      const outcomes = await Promise.all(Array.from({ length: 8 }, async (_, n) => {
        const child = `concurrent_${n}`;
        try { await put(B, `replies/${manifest.groupId}/${child}`, reply(child, "post", id)); return "before"; }
        catch (error) { assert.match(String(error?.code ?? error), /permission.denied/i); return "after"; }
      }));
      assert.deepEqual(await removal, { removed: true });
      manifest.concurrentOutcomes = { committedBeforeRemoval: outcomes.filter(x => x === "before").length, rejectedAfterRemoval: outcomes.filter(x => x === "after").length };
      const cleanup = Array.from({ length: 8 }, (_, n) => `encryptedData/replies/${manifest.groupId}/concurrent_${n}`);
      const audit = await readFixture(`moderationActions/${manifest.groupId}/post/${id}`);
      const result = { type: "post", id, logical, record, cleanup, tombstones: [`moderationTombstones/${manifest.groupId}/post/${id}`], audit };
      manifest.removals.push(result); await verifyRemoved(result); save(manifest);
    });
    await step("author self-delete and authorized atomic child cascade", async () => {
      const id = "self_delete", own = post(id), logical = `posts/${manifest.groupId}/${id}`;
      await put(B, logical, own); await put(B, logical, null); await absent(`encryptedData/${logical}`);
      assert.equal(await readFixture(`moderationActions/${manifest.groupId}/post/${id}`), null);
      const parent = "author_cascade", child = "author_other_child";
      await put(A, `posts/${manifest.groupId}/${parent}`, post(parent, A)); await put(B, `replies/${manifest.groupId}/${child}`, reply(child, "post", parent));
      await eventually(async () => Boolean(await read(A, `activityNotifications/${A.uid}/${child}`)), "Author cascade notification missing");
      await denied(() => put(A, `replies/${manifest.groupId}/${child}`, null));
      await update(ref(A.database), { [`encryptedData/posts/${manifest.groupId}/${parent}`]: null, [`encryptedData/replies/${manifest.groupId}/${child}`]: null });
      await absent(`encryptedData/posts/${manifest.groupId}/${parent}`); await absent(`encryptedData/replies/${manifest.groupId}/${child}`);
      manifest.selfDeleted = [logical, `posts/${manifest.groupId}/${parent}`, `replies/${manifest.groupId}/${child}`]; save(manifest);
    });
    await step("membership private data unrelated group and encryption unchanged", async () => {
      await verifyPrivacy(); await verifyMembership(); await verifyDailyClaim();
      assert.deepEqual(await readFixture(`e2eeGroups/${manifest.groupId}`), manifest.authority);
      assert.deepEqual(await readFixture("e2eeAccounts"), manifest.accounts);
      assert.deepEqual(await read(C, `posts/${manifest.unrelatedId}/keep`), manifest.unrelatedPost);
      const persisted = JSON.stringify(await readFixture(""));
      const privateKeys = [A, B, C].flatMap(person => [person.personalKey, ...[person.root, person.device.identity].flatMap(identity => Object.entries(identity).filter(([key, value]) => /private/i.test(key) && typeof value === "string").map(([, value]) => value))]);
      for (const secret of [manifest.groupKey, manifest.initialKey, manifest.unrelatedKey, ...privateKeys, "Synthetic shared content", ...manifest.privateRecords.map(x => x.plaintext)]) if (secret) assert.ok(!persisted.includes(secret), "Keys/sensitive plaintext must never enter database");
      manifest.initialComplete = true; save(manifest);
    });
  } else {
    manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    assert.equal(manifest.version, 1); assert.equal(manifest.suite, "moderation-acceptance"); assert.equal(manifest.initialComplete, true);
    await step("imported Auth users and encrypted memberships", async () => { A = await client("owner", manifest.people.A, false); B = await client("member", manifest.people.B, false); C = await client("outsider", manifest.people.C, false); anonymous = await client("anonymous", null, false, false); await verifyMembership(); });
    await step("removed targets tombstones references audits survive import", async () => { for (const result of manifest.removals) { await verifyRemoved(result); await verifyStaleReferences(result); } });
    await step("private journals check-ins Prayer Dwell daily claims survive import", async () => { await verifyPrivacy(); await verifyDailyClaim(); });
    await step("selective survivors and author self-deletes survive import", async () => {
      assert.deepEqual(await read(B, `posts/${manifest.groupId}/${manifest.selective.parent}`), manifest.selective.parentRecord);
      assert.deepEqual(await read(B, `replies/${manifest.groupId}/${manifest.selective.sibling}`), manifest.selective.siblingRecord);
      for (const logical of manifest.selfDeleted) await absent(`encryptedData/${logical}`);
      assert.deepEqual(await read(C, `posts/${manifest.unrelatedId}/keep`), manifest.unrelatedPost);
    });
    await step("imported rules reject unauthorized moderation and offline replay", async () => {
      await denied(() => moderate(B, "post", manifest.survivorId)); await denied(() => moderate(C, "post", manifest.survivorId));
      const result = manifest.removals.find(x => x.type === "post"); goOffline(B.database);
      const queued = put(B, result.logical, result.record).then(() => assert.fail("Offline post-import resurrection accepted"), error => assert.match(String(error?.code ?? error), /permission.denied/i));
      goOnline(B.database); await bound(queued, "Post-import offline replay timed out"); await absent(`encryptedData/${result.logical}`);
      await verifyOfflineCheckInReplay();
      assert.deepEqual(await readFixture(`e2eeGroups/${manifest.groupId}`), manifest.authority); assert.deepEqual(await readFixture("e2eeAccounts"), manifest.accounts);
    });
  }
  console.log(JSON.stringify({ suite: "community-moderation-acceptance", stage, passed, removedTargets: manifest.removals.length, offlineReplayRejected: manifest.offlineRejected === true, checkInOfflineReplayRejected: manifest.checkInOfflineReplayRejected === true, concurrentOutcomes: manifest.concurrentOutcomes, realAuth: true, realCallableHttp: true, realDatabaseRules: true, realEncryption: true, mockedHandler: false, nativeUiExercised: false, expectedWarningsSuppressed: suppressedExpectedWarnings }));
} catch (error) {
  process.exitCode = 1;
  console.error(JSON.stringify({ suite: "community-moderation-acceptance", stage, step: currentStep, failure: true, category: /^[A-Za-z0-9/_-]{1,80}$/.test(String(error?.code ?? "")) ? error.code : "assertion-or-runtime", assertionLine: Number(String(error?.stack ?? "").match(/validate-community-moderation-acceptance[.]mjs:(\d+):\d+/)?.[1] ?? 0), privateDetailsSuppressed: true }));
} finally {
  for (const stop of subscriptions) stop();
  for (const app of apps) goOffline(getDatabase(app));
  await bound(Promise.allSettled(apps.map(deleteApp)), "SDK cleanup timed out", 4000).catch(() => { process.exitCode = 1; });
  console.warn = originalWarn; globalThis.fetch = originalFetch; Socket.prototype.connect = originalConnect;
}
// Auth/RTDB timers must not keep emulators:exec waiting after bounded cleanup.
process.exit(process.exitCode ?? 0);
