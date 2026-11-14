import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-onboarding-create-"));
const user = { uid: "owner", email: "owner@example.test" };
const identity = { publicKey: "public", signingPublicKey: "signer", signingPrivateKey: "private" };
const device = { id: "device", identity };
const vault = { v: 1, uid: user.uid, identity, personalEpoch: 1, personalKeys: { 1: "personal" }, recoveryKey: "recovery", groups: {} };
const account = { ...identity, devices: { [device.id]: { ...identity, active: true, certificate: "certificate", grant: vault } } };
const harness = globalThis.__onboardingCreate = {
  user, auth: { currentUser: user }, device, account,
  memberships: new Map(), reads: [], writes: [], calls: [], sequence: 0,
};

const mocks = {
  "@firebase/auth": "export const updateProfile = async () => {};",
  "react-native-libsodium": "export default {};",
  "./crypto": `
    export const createCrypto = () => ({
      randomKey: () => String(++globalThis.__onboardingCreate.sequence),
      verify: () => true,
      unseal: value => structuredClone(value),
      seal: value => value,
      signature: () => "signature",
      encrypt: value => value,
    });
  `,
  "./local-storage": `
    const harness = globalThis.__onboardingCreate;
    export default {
      getItem: async key => key.startsWith("e2ee.device.") ? JSON.stringify(harness.device) : null,
      setItem: async (key, value) => { harness.writes.push({ key, value }); },
    };
  `,
  "firebase/database": `
    export const ref = (_database, path) => path;
    export const get = async path => ({ val: () => path.startsWith("e2eeAccounts/") ? globalThis.__onboardingCreate.account : null });
    export const onValue = () => () => {};
  `,
  "firebase/functions": `
    const harness = globalThis.__onboardingCreate;
    export const httpsCallable = () => async payload => {
      harness.calls.push(payload);
      if (payload.operation === "createGroup") await harness.onCreate(payload.data);
      if (payload.operation === "backup") await harness.onBackup?.();
      return { data: {} };
    };
  `,
  "@/state/store/firebase": "export const { auth } = globalThis.__onboardingCreate; export const database = {}, functions = {}, developmentMode = false;",
  "@/state/store/helpers": `
    export const now = () => "2026-11-06T09:00:00Z";
    export const inviteCode = () => "INVITE";
    export const id = prefix => prefix + "_generated";
  `,
  "@/ui/theme": 'export const normalizeTheme = () => "light";',
  "@/state/encryption/database": `
    const harness = globalThis.__onboardingCreate;
    export const ref = (_database, path) => path;
    export const get = async path => {
      harness.reads.push(path);
      if (path.startsWith("profiles/")) return { val: () => ({ name: "Anna" }) };
      const membership = harness.onMembershipRead ? await harness.onMembershipRead(path) : harness.memberships.get(path);
      return { val: () => membership ?? null };
    };
    export const update = async path => { harness.writes.push({ key: path }); };
    export const encodeAt = (path, record) => {
      harness.assertStagedKeys(record.groupId ?? record.id);
      return record;
    };
  `,
};

try {
  const outfile = path.join(directory, "create.cjs");
  await build({
    stdin: {
      contents: `
        export { createGroupForUser, hasOnboardingCommunity } from "./state/store/profile-operations";
        export { createEncryptedGroup, lockSession, session, unlockExisting } from "./state/encryption/session";
      `,
      resolveDir: process.cwd(), loader: "ts",
    },
    outfile, bundle: true, format: "cjs", platform: "node",
    plugins: [{ name: "create-mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: name }) => Object.hasOwn(mocks, name) ? { path: name, namespace: "mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "js" }));
    } }],
  });

  const { createGroupForUser, hasOnboardingCommunity, createEncryptedGroup, lockSession, session, unlockExisting } = require(outfile);
  const stableId = "group_onboarding_once";
  const membershipPath = `userGroups/${user.uid}/${stableId}`;
  const createdCalls = () => harness.calls.filter(call => call.operation === "createGroup");
  const commit = ({ group, records }) => harness.memberships.set(`userGroups/${user.uid}/${group.id}`, records.userMembership);
  const interruption = new Error("Interrupted create response");
  harness.assertStagedKeys = groupId => assert.ok(session().vault.groups[groupId]?.keys[1]);
  assert.equal(await unlockExisting(user.uid), "ready");

  harness.onCreate = async () => {
    assert.equal(session().vault.groups[stableId], undefined, "Unconfirmed keys must not be published in the active vault");
    throw interruption;
  };
  await assert.rejects(createGroupForUser(user, "Our community", undefined, stableId), interruption);
  assert.equal(await hasOnboardingCommunity(user.uid, stableId), false);
  assert.equal(session().groups[stableId], undefined);

  harness.onCreate = async data => { commit(data); throw interruption; };
  await createGroupForUser(user, "Our community", undefined, stableId);
  assert.equal(await hasOnboardingCommunity(user.uid, stableId), true);
  assert.deepEqual(createdCalls().map(call => call.data.group.id), [stableId, stableId], "An interrupted retry keeps the same ID");

  // Restart with no in-memory group key. The durable owner receipt bypasses creation.
  assert.equal(await unlockExisting(user.uid), "ready");
  await createGroupForUser(user, "Another name", undefined, stableId);
  assert.equal(createdCalls().length, 2);
  harness.memberships.set(membershipPath, { userId: user.uid, groupId: stableId, role: "member" });
  await assert.rejects(createGroupForUser(user, "Our community", undefined, stableId), /ownership could not be confirmed/);
  assert.equal(createdCalls().length, 2, "Unverified ownership does not create or complete a community");
  harness.onMembershipRead = async () => { throw new Error("Encrypted record could not be read"); };
  await assert.rejects(createGroupForUser(user, "Our community", undefined, stableId), /could not be read/);
  assert.equal(createdCalls().length, 2, "An unreadable receipt is distinct from an absent receipt");
  let finishRead;
  harness.onMembershipRead = () => new Promise(resolve => { finishRead = resolve; });
  const staleRead = hasOnboardingCommunity(user.uid, stableId);
  lockSession();
  finishRead({ userId: user.uid, groupId: stableId, role: "owner" });
  await assert.rejects(staleRead, /account changed/);
  harness.onMembershipRead = undefined;
  assert.equal(await unlockExisting(user.uid), "ready");

  const backupId = "group_backup_failure";
  harness.onCreate = async data => { commit(data); };
  harness.onBackup = async () => { throw new Error("Could not back up keys"); };
  await createGroupForUser(user, "Another community", undefined, backupId);
  assert.equal(await hasOnboardingCommunity(user.uid, backupId), true);
  assert.ok(session().vault.groups[backupId]?.keys[1]);

  const existing = session().groups[backupId];
  const existingKeys = session().vault.groups[backupId];
  await assert.rejects(createEncryptedGroup(backupId, () => {
    assert.notEqual(session().vault.groups[backupId], existingKeys);
    throw new Error("Encoding failed");
  }), /Encoding failed/);
  assert.equal(session().groups[backupId], existing);
  assert.equal(session().vault.groups[backupId], existingKeys);

  const loaded = { ...existing, revision: 2 };
  const loadedKeys = { ...existingKeys, revision: 2 };
  harness.onBackup = undefined;
  harness.onCreate = async () => {
    assert.equal(session().vault.groups[backupId], existingKeys, "Prior keys stay live while the callable is pending");
    session().groups[backupId] = loaded;
    session().vault.groups[backupId] = loadedKeys;
  };
  await createEncryptedGroup(backupId, () => ({}));
  assert.equal(session().groups[backupId], loaded);
  assert.equal(session().vault.groups[backupId], loadedKeys, "A newer revision loaded during creation is kept");

  harness.onCreate = async data => { commit(data); };
  harness.reads.length = 0;
  await createGroupForUser(user, "Created later");
  assert.equal(createdCalls().at(-1).data.group.id, "group_generated");
  assert.ok(harness.reads.every(path => !path.startsWith("userGroups/")), "Ordinary creation keeps its existing flow");
  console.log("Onboarding creation regression passed: stable retries, verified owner receipts, session isolation, transient keys, and ordinary creation.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
