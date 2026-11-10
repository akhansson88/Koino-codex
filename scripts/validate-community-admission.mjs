import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import sodium from "libsodium-wrappers";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, goOffline } from "firebase/database";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

// Full client admission against a separately launched, loopback-only fixture.
// No Admin SDK, root reset, physical-device relay, or production configuration.
// Native sodium/storage/image boundaries are replaced; session, crypto,
// encrypted database adapter, and profile operations remain real.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const projectId = "demo-koino";
const databaseURL = "https://demo-koino-default-rtdb.firebaseio.com";
const endpoints = { auth: "127.0.0.1:19099", database: "127.0.0.1:19001", functions: "127.0.0.1:15001" };
assert.equal(process.env.KOINO_ADMISSION_TEST_MODE, "1", "Use the isolated admission launcher");
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, endpoints.auth);
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, endpoints.database);
assert.equal(process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST, endpoints.functions);
for (const name of ["GOOGLE_CLOUD_PROJECT", "GCP_PROJECT"]) if (process.env[name]) assert.equal(process.env[name], projectId);
for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "KOINO_SUPABASE_SERVICE_KEY", "STRIPE_SECRET_KEY"]) assert.ok(!process.env[name], `${name} must be absent`);
const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG ?? "{}");
assert.equal(firebaseConfig.projectId, projectId);
assert.equal(firebaseConfig.databaseURL?.replace(/\/$/, ""), databaseURL);
const stage = process.env.KOINO_ADMISSION_TEST_STAGE;
assert.ok(["initial", "restart"].includes(stage), "KOINO_ADMISSION_TEST_STAGE must be initial or restart");
const suppliedDirectory = process.env.KOINO_ADMISSION_TEST_STATE_DIR;
assert.ok(suppliedDirectory && path.isAbsolute(suppliedDirectory), "Supply an absolute private test-state directory");
const stateDirectory = path.resolve(suppliedDirectory);
const privateRoot = path.join(projectRoot, ".codex", "koino-admission-validation");
const relativeDirectory = path.relative(privateRoot, stateDirectory);
assert.ok(relativeDirectory && relativeDirectory !== ".." && !relativeDirectory.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeDirectory), "State must be inside .codex/koino-admission-validation/<run>");
// Refuse to write test credentials/device keys into a tracked or unignored tree.
execFileSync("git", ["check-ignore", "--quiet", "--no-index", path.join(stateDirectory, "private-state.json")], { cwd: projectRoot, stdio: "pipe" });
mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
const resolvedPrivateRoot = realpathSync(privateRoot), resolvedStateDirectory = realpathSync(stateDirectory);
const resolvedRelative = path.relative(resolvedPrivateRoot, resolvedStateDirectory);
assert.ok(resolvedRelative && resolvedRelative !== ".." && !resolvedRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(resolvedRelative), "Private-state symlinks must remain inside the ignored fixture root");
const writePrivate = (filename, value) => {
  const destination = path.join(stateDirectory, filename), temporary = `${destination}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, destination);
};

// Exact destination guard, including RTDB's Node WebSocket/TCP transport.
const allowedPorts = new Set([19099, 19001, 15001]);
const checkUrl = input => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assert.ok(url.protocol === "http:" && url.hostname === "127.0.0.1" && allowedPorts.has(Number(url.port)) && !url.username && !url.password, "Admission test blocked a non-fixture network destination");
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  checkUrl(input);
  const response = await originalFetch(input, { ...options, redirect: "error" });
  assert.ok(!response.redirected && !(response.status >= 300 && response.status < 400), "Admission test blocked a redirect");
  if (response.url) checkUrl(response.url);
  return response;
};
const originalConnect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) {
  const connection = Array.isArray(args[0]) ? args[0] : args;
  const options = connection[0];
  if (options && typeof options === "object") {
    assert.ok(options.path === undefined && options.host === "127.0.0.1" && allowedPorts.has(Number(options.port)), "Admission test blocked a non-fixture socket");
  } else {
    assert.ok(allowedPorts.has(Number(options)) && connection[1] === "127.0.0.1", "Admission test blocked a non-fixture socket");
  }
  return Reflect.apply(originalConnect, this, args);
};
await sodium.ready;
const clients = new Map();
globalThis.__koinoAdmissionClients = clients;
const apps = [];
let operation = "preflight";
const safeError = error => ({
  code: String(error?.code ?? "error").replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 100),
  message: String(error?.message ?? error).replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]").slice(0, 500),
});
async function step(label, action) {
  operation = label;
  console.log(`[admission:${stage}] ${label}`);
  return action();
}
const denied = action => assert.rejects(action, error => /permission.denied|unauthenticated/i.test(String(error?.code ?? error)), "The real Auth/Rules/Functions boundary must deny this action");
function storageFor(label) {
  const file = `${label}-native-storage.json`, filename = path.join(stateDirectory, file);
  const values = existsSync(filename) ? JSON.parse(readFileSync(filename, "utf8")) : {};
  return {
    async getItem(key) { return Object.hasOwn(values, key) ? values[key] : null; },
    async setItem(key, value) { values[key] = value; writePrivate(file, values); },
    async removeItem(key) { delete values[key]; writePrivate(file, values); },
  };
}
async function client(label, credentials, createAccount, withClientModules = true) {
  const app = initializeApp({ apiKey: "admission-emulator-only", appId: "admission-emulator-only", projectId, databaseURL }, `admission-${stage}-${label}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, `http://${endpoints.auth}`, { disableWarnings: true });
  const database = getDatabase(app); connectDatabaseEmulator(database, "127.0.0.1", 19001);
  const functions = getFunctions(app, "europe-west1"); connectFunctionsEmulator(functions, "127.0.0.1", 15001);
  const result = { label, auth, database, functions, sodium, storage: storageFor(label) };
  clients.set(label, result);
  const credential = await (createAccount ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(auth, credentials.email, credentials.password);
  result.user = credential.user;
  if (!withClientModules) return result;
  const outfile = path.join(stateDirectory, `${label}-client.cjs`);
  const boundary = `const fixture=globalThis.__koinoAdmissionClients.get(${JSON.stringify(label)});`;
  const mocks = {
    "react-native-libsodium": `${boundary}export default fixture.sodium;`,
    "@/state/store/firebase": `${boundary}export const auth=fixture.auth,database=fixture.database,functions=fixture.functions;`,
    "./local-storage": `${boundary}export default fixture.storage;`,
    "@/state/supabase-storage": "export const resolveEncryptedImages=async value=>value;",
    "react-native": 'export const Platform={OS:"ios",select:values=>values.ios??values.default};',
  };
  await build({
    stdin: { contents: 'export * as session from "./state/encryption/session";export * as adapter from "./state/encryption/database";export * as profiles from "./state/store/profile-operations";', loader: "ts", resolveDir: projectRoot },
    outfile, bundle: true, packages: "external", platform: "node", format: "cjs", tsconfig: path.join(projectRoot, "tsconfig.json"),
    plugins: [{ name: `admission-native-boundaries-${label}`, setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: requested }) => Object.hasOwn(mocks, requested) ? { path: requested, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: requested }) => ({ contents: mocks[requested], loader: "js", resolveDir: projectRoot }));
    } }],
  });
  delete require.cache[require.resolve(outfile)];
  result.api = require(outfile);
  return result;
}
const membershipRecords = (owner, member, groupId, name) => {
  const record = { id: `membership_${member.label}_${groupId}`, userId: member.user.uid, groupId, role: "member", userName: name, createdAt: new Date().toISOString() };
  return {
    membership: owner.api.adapter.encodeAt(`groupMembers/${groupId}/${member.user.uid}`, record),
    userMembership: owner.api.adapter.encodeAt(`userGroups/${member.user.uid}/${groupId}`, record),
  };
};
const logicalGet = async (client, logicalPath) => (await client.api.adapter.get(client.api.adapter.ref(client.database, logicalPath))).val();
const logicalSet = (client, logicalPath, value) => client.api.adapter.set(client.api.adapter.ref(client.database, logicalPath), value);
const logicalUpdate = (client, values, canCommit) => client.api.adapter.update(client.api.adapter.ref(client.database), values, canCommit);
const invoke = (client, operation, data) => client.api.session.encryptedOperation(operation, data);
async function submitInvite(member, owner, group, overrides = {}) {
  const applicant = member.api.session.session().vault.identity;
  const recipient = owner.api.session.session().vault.identity;
  return invoke(member, "requestJoin", {
    code: group.inviteCode,
    identity: { publicKey: applicant.publicKey, signingPublicKey: applicant.signingPublicKey },
    name: member.api.session.crypto.seal({ name: `Dummy applicant ${member.label}` }, recipient.publicKey),
    expectedGroupId: group.id,
    expectedOwnerSigningPublicKey: recipient.signingPublicKey,
    ...overrides,
  });
}
async function verifyReceipt(client, group, status) {
  const requests = await client.api.session.listCommunityJoinRequests(client.user.uid);
  const receipts = requests.filter((item) => item.groupId === group.id);
  assert.equal(receipts.length, 1, "Admission has one receipt per caller and community");
  const [receipt] = receipts;
  const inviteHint = group.inviteCode.length >= 5 ? group.inviteCode.slice(-2) : undefined;
  assert.ok(Number.isFinite(receipt.updatedAt));
  assert.deepEqual(receipt, { groupId: group.id, status, ...(inviteHint ? { inviteHint } : {}), updatedAt: receipt.updatedAt });
  return receipt;
}
async function createStatusGroup(owner, name) {
  await owner.api.profiles.createGroupForUser(owner.user, name);
  const { currentGroupId } = await logicalGet(owner, `profiles/${owner.user.uid}`);
  const { id, inviteCode } = await logicalGet(owner, `groups/${currentGroupId}`);
  return { id, inviteCode };
}
async function verifyPrivate(owner, other, fixture) {
  const journalPath = `journalEntries/${owner.user.uid}/${fixture.journalId}`;
  const journal = await logicalGet(owner, journalPath);
  assert.equal(journal.body, fixture.privateBody);
  assert.equal(journal.source, "manual");
  assert.equal(journal.isPrivate, true);
  assert.equal(journal.sharedPostId, undefined, "A private journal needs no community or shared copy");
  const ciphertext = (await get(ref(owner.database, `encryptedData/${journalPath}`))).val();
  assert.ok(!JSON.stringify(ciphertext).includes(fixture.privateBody), "Journal plaintext must not reach RTDB");
  assert.ok(ciphertext.body.keyId.startsWith(`user:${owner.user.uid}:`));
  await denied(() => get(ref(other.database, `encryptedData/${journalPath}`)));
  await denied(() => set(ref(other.database, `encryptedData/${journalPath}/body`), "forbidden"));
}
function journalShare(writer, group, suffix) {
  const uid = writer.user.uid, createdAt = new Date().toISOString();
  const body = `Dummy journal share ${suffix}`;
  const post = { id: `journal_post_${suffix}`, userId: uid, groupId: group.id, kind: "reflection", body, createdAt };
  const entry = {
    id: `journal_${suffix}`, userId: uid, journalType: "reflection", body, source: "manual", entryKind: "reflection",
    isPrivate: false, sharedPostId: post.id, createdAt, updatedAt: createdAt,
  };
  return { journalPath: `journalEntries/${uid}/${entry.id}`, postPath: `posts/${group.id}/${post.id}`, entry, post };
}
const shareValues = ({ journalPath, postPath, entry, post }) => ({ [journalPath]: entry, [postPath]: post });
function encryptedShare(writer, keyHolder, share) {
  const { crypto } = writer.api.session;
  const signer = writer.api.session.session().device.identity;
  const { key, keyId } = keyHolder.api.session.keyForScope(`group:${share.post.groupId}`);
  const context = crypto.canonical({ subject: writer.user.uid });
  const { body, kind, ...metadata } = share.post;
  const encrypt = (field, value) => crypto.encrypt(value, `${share.postPath}/${field}`, keyId, key, signer, undefined, context);
  return {
    [share.journalPath]: writer.api.adapter.encodeAt(share.journalPath, share.entry),
    [share.postPath]: { ...metadata, historyGeneration: 1, body: encrypt("body", body), kind: encrypt("kind", kind) },
  };
}
async function verifyShareAbsent(writer, owner, share) {
  assert.equal((await get(ref(writer.database, `encryptedData/${share.journalPath}`))).exists(), false, "No partial journal write survives a denied share");
  assert.equal((await get(ref(owner.database, `encryptedData/${share.postPath}`))).exists(), false, "No unauthorized shared copy was written");
}
async function verifySharedJournal(writer, owner, share) {
  const journal = await logicalGet(writer, share.journalPath);
  const post = await logicalGet(owner, share.postPath);
  assert.equal(journal.body, share.entry.body);
  assert.equal(journal.isPrivate, false);
  assert.equal(journal.sharedPostId, post.id);
  assert.equal(post.body, share.post.body);
  assert.equal(post.userId, writer.user.uid);
  assert.equal(post.groupId, share.post.groupId);
  await denied(() => get(ref(owner.database, `encryptedData/${share.journalPath}`)));
  const journalWire = (await get(ref(writer.database, `encryptedData/${share.journalPath}`))).val();
  const postWire = (await get(ref(owner.database, `encryptedData/${share.postPath}`))).val();
  assert.ok(journalWire.body.keyId.startsWith(`user:${writer.user.uid}:`));
  assert.ok(postWire.body.keyId.startsWith(`group:${share.post.groupId}:`));
  assert.ok(!JSON.stringify(journalWire).includes(share.entry.body) && !JSON.stringify(postWire).includes(share.post.body));
}
async function verifyGroup(owner, member, groupFixture) {
  const groupId = groupFixture.id;
  const decodedGroup = await logicalGet(member, `groups/${groupId}`);
  assert.equal(decodedGroup.name, groupFixture.name);
  assert.equal(decodedGroup.ownerId, owner.user.uid);
  const membership = await logicalGet(member, `userGroups/${member.user.uid}/${groupId}`);
  assert.equal(membership.userId, member.user.uid); assert.equal(membership.groupId, groupId); assert.equal(membership.role, "member");
  assert.equal((await logicalGet(owner, `groupMembers/${groupId}/${member.user.uid}`)).userName, groupFixture.memberName);
  for (const record of groupFixture.posts) {
    assert.equal((await logicalGet(member, `posts/${groupId}/${record.id}`)).body, record.body);
    assert.equal((await logicalGet(owner, `posts/${groupId}/${record.id}`)).body, record.body);
  }
}
const manifestPath = path.join(stateDirectory, "private-state.json");
try {
  if (stage === "initial") {
    assert.ok(!existsSync(manifestPath), "Initial stage requires a fresh run directory");
    const run = `${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
    const credentials = label => ({ email: `admission-${label.toLowerCase()}-${run}@example.test`, password: `admission-test-${randomBytes(12).toString("hex")}` });
    const manifest = { version: 1, run, initialComplete: false, accounts: { A: credentials("A"), B: credentials("B"), outsider: credentials("outsider") }, people: {}, groups: {} };
    writePrivate("private-state.json", manifest);
    await step("initialize isolated encrypted test policy", async () => {
      const url = new URL("http://127.0.0.1:19001/e2eePolicy.json?ns=demo-koino-default-rtdb");
      const response = await fetch(url, { method: "PUT", headers: { authorization: "Bearer owner", "content-type": "application/json" }, body: JSON.stringify({ encryptedGroupsOnly: true, historyGeneration: 1, sharedWritesFrozen: false }) });
      assert.equal(response.ok, true, "Only the isolated fixture policy can be initialized");
    });
    const A = await step("A authenticate", () => client("A", manifest.accounts.A, true));
    const B = await step("B authenticate", () => client("B", manifest.accounts.B, true));
    const outsider = await step("outsider authenticate without encryption", () => client("outsider", manifest.accounts.outsider, true, false));
    const policy = (await get(ref(A.database, "e2eePolicy"))).val();
    assert.equal(policy?.encryptedGroupsOnly, true, "Launcher must initialize only its isolated encrypted test policy");
    assert.equal(policy?.historyGeneration, 1); assert.notEqual(policy?.sharedWritesFrozen, true);
    for (const person of [A, B]) {
      const name = `Admission member ${person.label}`;
      const draft = await step(`${person.label} draftAccount`, () => person.api.session.draftAccount(person.user.uid));
      await step(`${person.label} confirmAccount`, () => person.api.session.confirmAccount(draft));
      await step(`${person.label} ensureProfile`, () => person.api.profiles.ensureProfile(person.user, name));
      const privateFixture = { uid: person.user.uid, name, journalId: `private_${run}_${person.label}`, privateBody: `Dummy private journal ${run} ${person.label}` };
      manifest.people[person.label] = privateFixture;
      await step(`${person.label} creates a private journal as a solo account`, async () => {
        assert.equal((await logicalGet(person, `profiles/${person.user.uid}`)).currentGroupId, undefined);
        assert.equal((await get(ref(person.database, `encryptedData/userGroups/${person.user.uid}`))).exists(), false);
        await logicalSet(person, `journalEntries/${person.user.uid}/${privateFixture.journalId}`, {
          id: privateFixture.journalId, userId: person.user.uid, body: privateFixture.privateBody, source: "manual", isPrivate: true, createdAt: new Date().toISOString(),
        });
        await verifyPrivate(person, outsider, privateFixture);
      });
      writePrivate("private-state.json", manifest);
    }
    for (const owner of [A, B]) {
      const name = `Admission community ${owner.label} ${run}`;
      await step(`${owner.label} createGroupForUser`, () => owner.api.profiles.createGroupForUser(owner.user, name, manifest.people[owner.label].name));
      const profile = await logicalGet(owner, `profiles/${owner.user.uid}`);
      assert.equal(typeof profile.currentGroupId, "string");
      const group = await logicalGet(owner, `groups/${profile.currentGroupId}`);
      assert.equal(group.name, name); assert.equal(group.inviteCode, group.inviteCode.toUpperCase());
      const post = { id: `before_${run}_${owner.label}`, userId: owner.user.uid, groupId: group.id, kind: "reflection", title: "Dummy historical reflection", body: `Dummy historical community content ${run} ${owner.label}`, createdAt: new Date().toISOString() };
      await logicalSet(owner, `posts/${group.id}/${post.id}`, post);
      manifest.groups[owner.label] = { id: group.id, name, inviteCode: group.inviteCode, posts: [post] };
      writePrivate("private-state.json", manifest);
    }
    await step("invalid code rejects through real client pipeline", () => assert.rejects(A.api.profiles.joinGroupByInvite(A.user, ` invalid_${run} `), error => error?.code === "functions/not-found"));
    await step("unencrypted identity cannot request admission", () => denied(() => httpsCallable(outsider.functions, "encryptedAccount")({ operation: "requestJoin", data: { code: manifest.groups.A.inviteCode }, deviceId: "unregistered", requestId: `no_identity_${run}`, timestamp: Date.now(), signature: "invalid" })));
    for (const [owner, member] of [[A, B], [B, A]]) {
      const group = manifest.groups[owner.label], memberName = manifest.people[member.label].name;
      group.memberName = memberName;
      await step(`${member.label} denied access before request`, async () => {
        await denied(() => get(ref(member.database, `e2eeGroups/${group.id}`)));
        await denied(() => get(ref(member.database, `encryptedData/posts/${group.id}`)));
      });
      await step(`${member.label} joinGroupByInvite (trim/lowercase)`, () => member.api.profiles.joinGroupByInvite(member.user, ` \t${group.inviteCode.toLowerCase()}\n `, memberName));
      await step(`${member.label} request does not grant membership`, async () => {
        const authority = (await get(ref(owner.database, `e2eeGroups/${group.id}`))).val();
        assert.equal(Object.hasOwn(authority.members, member.user.uid), false);
        assert.equal((await get(ref(member.database, `encryptedData/userGroups/${member.user.uid}/${group.id}`))).exists(), false);
        await denied(() => get(ref(member.database, `e2eeGroups/${group.id}`)));
        const request = (await get(ref(owner.database, `e2eeJoinRequests/${group.id}/${member.user.uid}`))).val();
        assert.equal(request.publicKey, member.api.session.session().vault.identity.publicKey);
        assert.equal(typeof request.name, "string"); assert.ok(!request.name.includes(memberName));
      });
      await step(`${member.label} reads only their own pending receipt`, async () => {
        const initial = await verifyReceipt(member, group, "pending");
        const requestPath = `e2eeJoinRequests/${group.id}/${member.user.uid}`;
        const pending = (await get(ref(member.database, requestPath))).val();
        assert.ok(pending, "The applicant may read the existing own request leaf");
        assert.deepEqual(await submitInvite(member, owner, group), { groupId: group.id, status: "pending" });
        assert.deepEqual(await verifyReceipt(member, group, "pending"), initial, "A pending retry does not refresh or duplicate its receipt");
        assert.deepEqual((await get(ref(owner.database, requestPath))).val(), pending, "A pending retry does not replace its encrypted request");
        const { requests } = await invoke(owner, "listJoinRequests", { userId: member.user.uid });
        assert.ok(!requests.some((request) => request.groupId === group.id), "A valid caller cannot request someone else's receipt");
        await denied(() => get(ref(outsider.database, requestPath)));
        await denied(() => get(ref(member.database, `e2eeJoinRequests/${group.id}`)));
        await denied(() => get(ref(member.database, `e2eeJoinRequestStatuses/${member.user.uid}/${group.id}`)));
        await denied(() => set(ref(member.database, `e2eeJoinRequestStatuses/${member.user.uid}/${group.id}`), { status: "approved", updatedAt: Date.now() }));
      });
      const fingerprint = member.api.session.crypto.fingerprint(member.api.session.session().vault.identity.signingPublicKey);
      await step(`${owner.label} rejects an unverified fingerprint`, () => assert.rejects(owner.api.session.approveGroupMember(group.id, member.user.uid, "wrong fingerprint", name => membershipRecords(owner, member, group.id, name)), /Member fingerprint does not match/));
      await step(`${owner.label} approveGroupMember and encrypted membership fanout`, () => owner.api.session.approveGroupMember(group.id, member.user.uid, ` ${fingerprint} `, name => membershipRecords(owner, member, group.id, name)));
      await step(`${member.label} approved receipt corresponds to membership`, async () => {
        const approved = await verifyReceipt(member, group, "approved");
        assert.equal((await get(ref(member.database, `e2eeJoinRequests/${group.id}/${member.user.uid}`))).exists(), false);
        assert.deepEqual(await submitInvite(member, owner, group), { groupId: group.id, status: "approved" });
        assert.deepEqual(await verifyReceipt(member, group, "approved"), approved);
      });
      await step(`${member.label} decrypts historical group content`, () => verifyGroup(owner, member, group));
      const post = { id: `after_${run}_${member.label}`, userId: member.user.uid, groupId: group.id, kind: "reflection", body: `Dummy admitted member content ${run} ${member.label}`, createdAt: new Date().toISOString() };
      await step(`${member.label} writes encrypted shared content`, () => logicalSet(member, `posts/${group.id}/${post.id}`, post));
      group.posts.push(post);
      await step(`${member.label} cannot approve as a non-owner`, () => assert.rejects(member.api.session.approveGroupMember(group.id, owner.user.uid, fingerprint, () => ({})), /Only the community owner can approve members/));
      await step(`${member.label} cannot bypass owner authorization at callable`, () => denied(() => member.api.session.encryptedOperation("groupChange", { group: owner.api.session.session().groups[group.id], records: {} })));
      writePrivate("private-state.json", manifest);
    }
    await step("pending and terminal receipts preserve admission boundaries", async () => {
      const rejected = await createStatusGroup(A, `Rejected admission ${run}`);
      const pending = await createStatusGroup(A, `Pending admission ${run}`);
      const closed = await createStatusGroup(A, `Closed admission ${run}`);
      manifest.statusGroups = { rejected, pending, closed };

      await assert.rejects(submitInvite(B, A, pending, { expectedGroupId: rejected.id }), (error) => error?.code === "functions/aborted");
      const applicantKey = B.api.session.session().vault.identity.signingPublicKey;
      await assert.rejects(submitInvite(B, A, pending, { expectedOwnerSigningPublicKey: applicantKey }), (error) => error?.code === "functions/aborted");
      assert.equal((await get(ref(B.database, `e2eeJoinRequests/${pending.id}/${B.user.uid}`))).exists(), false, "A stale invite binding cannot create a request");

      assert.deepEqual(await submitInvite(B, A, pending), { groupId: pending.id, status: "pending" });
      const oldRequestPath = `e2eeJoinRequests/${pending.id}/${B.user.uid}`;
      const oldRequest = (await get(ref(A.database, oldRequestPath))).val();
      // Remove metadata from this dummy request to model the older backend.
      const legacyReceipt = new URL(`http://127.0.0.1:19001/e2eeJoinRequestStatuses/${encodeURIComponent(B.user.uid)}/${encodeURIComponent(pending.id)}.json?ns=demo-koino-default-rtdb`);
      const legacyBinding = new URL(`http://127.0.0.1:19001/${oldRequestPath}/ownerSigningPublicKey.json?ns=demo-koino-default-rtdb`);
      for (const url of [legacyReceipt, legacyBinding]) {
        assert.ok((await fetch(url, { method: "DELETE", headers: { authorization: "Bearer owner" } })).ok);
      }
      assert.deepEqual(await submitInvite(B, A, pending), { groupId: pending.id, status: "pending" });
      const rebound = (await get(ref(A.database, oldRequestPath))).val();
      assert.equal(rebound.publicKey, oldRequest.publicKey);
      assert.equal(rebound.ownerSigningPublicKey, oldRequest.ownerSigningPublicKey);
      assert.notEqual(rebound.name, oldRequest.name, "Re-entering an older invite seals the request to the current owner");
      await verifyReceipt(B, pending, "pending");

      assert.deepEqual(await submitInvite(B, A, rejected), { groupId: rejected.id, status: "pending" });
      const rejection = { groupId: rejected.id, userId: B.user.uid };
      await denied(() => invoke(B, "rejectJoin", rejection));
      const result = { groupId: rejected.id, status: "rejected" };
      assert.deepEqual(await invoke(A, "rejectJoin", rejection), result);
      assert.deepEqual(await invoke(A, "rejectJoin", rejection), result, "An owner can safely retry a lost rejection response");
      assert.deepEqual(await submitInvite(B, A, rejected), result, "A rejected applicant cannot reapply through the same invite");
      await verifyReceipt(B, rejected, "rejected");
      assert.equal((await get(ref(A.database, `e2eeJoinRequests/${rejected.id}/${B.user.uid}`))).exists(), false);
      assert.equal((await get(ref(B.database, `encryptedData/userGroups/${B.user.uid}/${rejected.id}`))).exists(), false);
      await denied(() => get(ref(B.database, `e2eeGroups/${rejected.id}`)));
      const fingerprint = B.api.session.crypto.fingerprint(applicantKey);
      await assert.rejects(A.api.session.approveGroupMember(rejected.id, B.user.uid, fingerprint, () => assert.fail("A rejected request cannot generate membership")), /Member fingerprint does not match/);

      assert.deepEqual(await submitInvite(B, A, closed), { groupId: closed.id, status: "pending" });
      await A.api.session.deleteEncryptedGroup(closed.id);
      await verifyReceipt(B, closed, "closed");
      assert.equal((await get(ref(B.database, `encryptedData/userGroups/${B.user.uid}/${closed.id}`))).exists(), false);

      const { device } = B.api.session.session();
      const unsigned = { operation: "listJoinRequests", data: {}, deviceId: device.id, timestamp: Date.now(), requestId: `receipt_list_${run}` };
      const signed = { ...unsigned, signature: B.api.session.crypto.signature(unsigned, device.identity.signingPrivateKey) };
      const callable = httpsCallable(B.functions, "encryptedAccount");
      assert.deepEqual((await callable(signed)).data, (await callable(signed)).data, "A read can repeat without a replay-ledger mutation");
      await denied(() => httpsCallable(outsider.functions, "encryptedAccount")({ ...signed, requestId: `outsider_list_${run}` }));
    });
    await step("concurrent approval and decline settle one membership outcome", async () => {
      const group = await createStatusGroup(A, `Concurrent admission ${run}`);
      await submitInvite(B, A, group);
      const fingerprint = B.api.session.crypto.fingerprint(B.api.session.session().vault.identity.signingPublicKey);
      const [approval, decline] = await Promise.allSettled([
        A.api.session.approveGroupMember(group.id, B.user.uid, fingerprint, name => membershipRecords(A, B, group.id, name)),
        A.api.session.rejectGroupJoinRequest(group.id, B.user.uid),
      ]);
      assert.notEqual(approval.status, decline.status, "Only one decision can commit");
      const approved = approval.status === "fulfilled";
      await verifyReceipt(B, group, approved ? "approved" : "rejected");
      assert.equal((await get(ref(B.database, `encryptedData/userGroups/${B.user.uid}/${group.id}`))).exists(), approved);
      if (!approved) await denied(() => get(ref(B.database, `e2eeGroups/${group.id}`)));
    });
    await step("shared Journal preserves private and group access boundaries atomically", async () => {
      const group = await createStatusGroup(A, `Journal share ${run}`);
      const profileField = `profiles/${B.user.uid}/currentGroupId`;
      const rawRoot = (person) => ref(person.database, "encryptedData");
      const pending = journalShare(B, group, `pending_${run}`);
      await submitInvite(B, A, group);
      await verifyReceipt(B, group, "pending");
      // The owner-controlled authority and the user's editable selection are
      // independent. A forged or stale profile selection grants zero access.
      await logicalUpdate(B, { [profileField]: group.id });
      assert.equal((await logicalGet(B, `profiles/${B.user.uid}`)).currentGroupId, group.id);
      await denied(() => logicalUpdate(B, shareValues(pending)));
      // Encode an active-device-signed payload using the owner's dummy group
      // key. This exercises server rules independently of client key gating.
      await denied(() => update(rawRoot(B), encryptedShare(B, A, pending)));
      await verifyShareAbsent(B, A, pending);
      await denied(() => get(ref(B.database, `encryptedData/${pending.postPath}`)));

      const applicantKey = B.api.session.session().vault.identity.signingPublicKey;
      const fingerprint = B.api.session.crypto.fingerprint(applicantKey);
      await A.api.session.approveGroupMember(group.id, B.user.uid, fingerprint, (name) => membershipRecords(A, B, group.id, name));
      await verifyReceipt(B, group, "approved");
      const shared = journalShare(B, group, `member_${run}`);
      const wire = encryptedShare(B, A, shared);
      await denied(() => update(rawRoot(B), { ...wire, [shared.postPath]: { ...wire[shared.postPath], userId: A.user.uid } }));
      await verifyShareAbsent(B, A, shared);
      await assert.rejects(logicalUpdate(B, shareValues(shared), () => false), /audience changed/);
      await verifyShareAbsent(B, A, shared);
      await logicalUpdate(B, shareValues(shared));
      await verifySharedJournal(B, A, shared);
      assert.equal((await logicalGet(B, shared.postPath)).body, shared.post.body);
      await denied(() => get(ref(outsider.database, `encryptedData/${shared.journalPath}`)));
      await denied(() => get(ref(outsider.database, `encryptedData/${shared.postPath}`)));

      const stale = journalShare(B, group, `stale_${run}`);
      const delayedWire = encryptedShare(B, B, stale);
      await denied(() => update(rawRoot(A), delayedWire));
      await verifyShareAbsent(B, A, stale);
      await B.api.session.leaveEncryptedGroup(group.id);
      assert.equal((await get(ref(B.database, `encryptedData/userGroups/${B.user.uid}/${group.id}`))).exists(), false);
      assert.equal((await logicalGet(B, `profiles/${B.user.uid}`)).currentGroupId, group.id, "Retain the stale selection for the rules check");
      await denied(() => update(rawRoot(B), delayedWire));
      await verifyShareAbsent(B, A, stale);
      await denied(() => get(ref(B.database, `encryptedData/${shared.postPath}`)));
      await verifySharedJournal(B, A, shared);
      await logicalUpdate(B, { [profileField]: manifest.groups.B.id });
      await logicalUpdate(A, { [`profiles/${A.user.uid}/currentGroupId`]: manifest.groups.A.id });
      manifest.journalShare = shared;
    });
    await step("outsider rules enforce group and journal boundaries", async () => {
      for (const group of Object.values(manifest.groups)) {
        await denied(() => get(ref(outsider.database, `e2eeGroups/${group.id}`)));
        await denied(() => get(ref(outsider.database, `encryptedData/posts/${group.id}`)));
        await denied(() => set(ref(outsider.database, `encryptedData/posts/${group.id}/forbidden_${run}`), { userId: outsider.user.uid, groupId: group.id }));
      }
      for (const person of [A, B]) {
        const privatePath = `encryptedData/journalEntries/${person.user.uid}/${manifest.people[person.label].journalId}`;
        await denied(() => get(ref(outsider.database, privatePath)));
        await denied(() => set(ref(outsider.database, `${privatePath}/body`), "forbidden"));
      }
    });
    await step("cross-account journal privacy", async () => { await verifyPrivate(A, B, manifest.people.A); await verifyPrivate(B, A, manifest.people.B); });
    await step("both memberships and shared posts decrypt", async () => { await verifyGroup(A, B, manifest.groups.A); await verifyGroup(B, A, manifest.groups.B); });
    manifest.initialComplete = true;
    writePrivate("private-state.json", manifest);
    console.log("Admission initial PASS: real encrypted setup, admission and approval, applicant-only status, duplicate and stale requests, rejection and closed communities, owner authorization, and journal privacy. Restart verification is still required.");
  } else {
    assert.ok(existsSync(manifestPath), "Restart requires an initial-stage fixture");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.version, 1); assert.equal(manifest.initialComplete, true);
    const A = await step("A sign in after emulator restart", () => client("A", manifest.accounts.A, false));
    const B = await step("B sign in after emulator restart", () => client("B", manifest.accounts.B, false));
    for (const person of [A, B]) {
      assert.equal(person.user.uid, manifest.people[person.label].uid);
      await step(`${person.label} unlockExisting from persisted native-storage fixture`, async () => { assert.equal(await person.api.session.unlockExisting(person.user.uid), "ready"); });
      await step(`${person.label} ensureProfile after restart`, () => person.api.profiles.ensureProfile(person.user, manifest.people[person.label].name));
    }
    await step("restart decrypts both memberships and historical/new shared content", async () => { await verifyGroup(A, B, manifest.groups.A); await verifyGroup(B, A, manifest.groups.B); });
    await step("restart preserves applicant-only admission outcomes", async () => {
      await verifyReceipt(A, manifest.groups.B, "approved");
      await verifyReceipt(B, manifest.groups.A, "approved");
      for (const status of ["pending", "rejected", "closed"]) await verifyReceipt(B, manifest.statusGroups[status], status);
    });
    await step("restart preserves private journals and access boundaries", async () => { await verifyPrivate(A, B, manifest.people.A); await verifyPrivate(B, A, manifest.people.B); });
    await step("restart preserves the personal Journal and authorized shared copy after departure", async () => {
      await verifySharedJournal(B, A, manifest.journalShare);
      await denied(() => get(ref(B.database, `encryptedData/${manifest.journalShare.postPath}`)));
    });
    console.log("Admission restart PASS: real clients unlock persisted device grants, decrypt memberships and shared histories, and retain private journals and applicant-only admission receipts.");
  }
} catch (error) {
  console.error(JSON.stringify({ suite: "community-admission", stage, operation, ...safeError(error) }));
  process.exitCode = 1;
} finally {
  for (const app of apps) goOffline(getDatabase(app));
  await Promise.all(apps.map(deleteApp));
  Socket.prototype.connect = originalConnect;
  globalThis.fetch = originalFetch;
  delete globalThis.__koinoAdmissionClients;
}
// Standalone suite: Firebase SDK workers retain timers after all apps close.
process.exit(process.exitCode ?? 0);
