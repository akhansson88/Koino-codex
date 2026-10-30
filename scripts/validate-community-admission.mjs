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
import { getDatabase, connectDatabaseEmulator, ref, get, set, goOffline } from "firebase/database";
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
async function verifyPrivate(owner, other, fixture) {
  const journalPath = `journalEntries/${owner.user.uid}/${fixture.journalId}`;
  assert.equal((await logicalGet(owner, journalPath)).body, fixture.privateBody);
  const ciphertext = (await get(ref(owner.database, `encryptedData/${journalPath}`))).val();
  assert.ok(!JSON.stringify(ciphertext).includes(fixture.privateBody), "Journal plaintext must not reach RTDB");
  await denied(() => get(ref(other.database, `encryptedData/${journalPath}`)));
  await denied(() => set(ref(other.database, `encryptedData/${journalPath}/body`), "forbidden"));
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
      await step(`${person.label} private journal persistence`, () => logicalSet(person, `journalEntries/${person.user.uid}/${privateFixture.journalId}`, { id: privateFixture.journalId, userId: person.user.uid, body: privateFixture.privateBody, source: "journal", isPrivate: true, createdAt: new Date().toISOString() }));
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
      const fingerprint = member.api.session.crypto.fingerprint(member.api.session.session().vault.identity.signingPublicKey);
      await step(`${owner.label} rejects an unverified fingerprint`, () => assert.rejects(owner.api.session.approveGroupMember(group.id, member.user.uid, "wrong fingerprint", name => membershipRecords(owner, member, group.id, name)), /Member fingerprint does not match/));
      await step(`${owner.label} approveGroupMember and encrypted membership fanout`, () => owner.api.session.approveGroupMember(group.id, member.user.uid, ` ${fingerprint} `, name => membershipRecords(owner, member, group.id, name)));
      await step(`${member.label} decrypts historical group content`, () => verifyGroup(owner, member, group));
      const post = { id: `after_${run}_${member.label}`, userId: member.user.uid, groupId: group.id, kind: "reflection", body: `Dummy admitted member content ${run} ${member.label}`, createdAt: new Date().toISOString() };
      await step(`${member.label} writes encrypted shared content`, () => logicalSet(member, `posts/${group.id}/${post.id}`, post));
      group.posts.push(post);
      await step(`${member.label} cannot approve as a non-owner`, () => assert.rejects(member.api.session.approveGroupMember(group.id, owner.user.uid, fingerprint, () => ({})), /Only the community owner can approve members/));
      await step(`${member.label} cannot bypass owner authorization at callable`, () => denied(() => member.api.session.encryptedOperation("groupChange", { group: owner.api.session.session().groups[group.id], records: {} })));
      writePrivate("private-state.json", manifest);
    }
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
    console.log("Admission initial PASS: actual setup/profile/create/join/approval/adapter pipelines, reciprocal normalized invites, pending membership, fingerprint checks, encrypted group access, owner authorization and private journal rules. Restart verification is still required.");
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
    await step("restart preserves private journals and access boundaries", async () => { await verifyPrivate(A, B, manifest.people.A); await verifyPrivate(B, A, manifest.people.B); });
    console.log("Admission restart PASS: both real clients unlock persisted device grants, decrypt both memberships/shared histories and preserve journal privacy after a fresh emulator process.");
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
