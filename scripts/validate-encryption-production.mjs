// Creates disposable test accounts in the named production project and removes
// only their own records. Never prints passwords, tokens, keys or user content.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDatabase, ref, set, get, goOffline } from 'firebase/database';
import { crypto } from './encryption-test-helpers.mjs';
if (!process.argv.includes('--project=koino-codex')) throw new Error('Explicit production project flag is required.');
const run = promisify(execFile), users = [], images = [];
const config = { apiKey: 'AIzaSyCLLSGBYogHq7YqUx6an4JRTWRhU9Y950s', projectId: 'koino-codex', authDomain: 'koino-codex.firebaseapp.com', databaseURL: 'https://koino-codex-default-rtdb.europe-west1.firebasedatabase.app' };
const groupId = `encryption_check_${randomUUID().replaceAll('-', '')}`, invite = `CHECK_${randomUUID().replaceAll('-', '')}`;
function payload(user, operation, data) {
  const request = { operation, data, deviceId: 'test', requestId: crypto.randomKey(), timestamp: Date.now() };
  return { ...request, signature: crypto.signature(request, user.device.signingPrivateKey) };
}
const call = async (user, operation, data) => {
  console.log(`Production check: ${operation}`);
  return (await user.operation(payload(user, operation, data))).data;
};
const pub = (identity) => ({ publicKey: identity.publicKey, signingPublicKey: identity.signingPublicKey });
async function client(label) {
  const app = initializeApp(config, `production-${label}-${randomUUID()}`);
  const user = { app, auth: getAuth(app), database: getDatabase(app), root: crypto.identity(), device: crypto.identity(), operation: httpsCallable(getFunctions(app, 'europe-west1'), 'encryptedAccount') };
  users.push(user);
  const credential = await createUserWithEmailAndPassword(user.auth, `codex-encryption-${randomUUID()}@example.invalid`, crypto.randomKey());
  user.uid = credential.user.uid;
  const vault = { uid: user.uid, identity: user.root }, recoveryKey = crypto.randomKey();
  const device = { id: 'test', ...pub(user.device), certificate: crypto.signature({ uid: user.uid, id: 'test', ...pub(user.device) }, user.root.signingPrivateKey), grant: crypto.seal(vault, user.device.publicKey) };
  const data = { ...pub(user.root), device, recovery: crypto.encrypt(vault, `recovery/${user.uid}`, 'recovery:1', recoveryKey, user.root) };
  await call(user, 'setup', { ...data, proof: crypto.signature(data, user.root.signingPrivateKey) });
  return user;
}
let passed = false;
try {
  const owner = await client('owner'), outsider = await client('outsider');
  const path = `journalEntries/${owner.uid}/fixture`, key = crypto.randomKey();
  const body = crypto.encrypt('Synthetic private content', `${path}/body`, `user:${owner.uid}:1`, key, owner.device);
  await set(ref(owner.database, `encryptedData/${path}`), { userId: owner.uid, body });
  assert.equal(crypto.decrypt((await get(ref(owner.database, `encryptedData/${path}/body`))).val(), `${path}/body`, key, new Set([owner.device.signingPublicKey])), 'Synthetic private content');
  await assert.rejects(get(ref(outsider.database, `encryptedData/${path}`)), /permission_denied|Permission denied/i);
  await assert.rejects(set(ref(owner.database, `encryptedData/${path}/body`), 'plaintext'), /permission_denied|Permission denied/i);
  const replay = payload(owner, 'beginMigration', { scope: `user:${owner.uid}` });
  await owner.operation(replay);
  await assert.rejects(owner.operation(replay), /already processed/i);
  await call(owner, 'finishMigration', { scope: `user:${owner.uid}` });
  const groupKey = crypto.randomKey();
  const group = { id: groupId, ownerId: owner.uid, epoch: 1, revision: 1, status: 'ready', members: { [owner.uid]: pub(owner.root) }, grants: { [owner.uid]: crypto.seal({ keys: { 1: groupKey } }, owner.root.publicKey) }, signer: owner.root.signingPublicKey, signers: [owner.root.signingPublicKey, owner.device.signingPublicKey] };
  group.signature = crypto.signature({ ...group, previous: null }, owner.root.signingPrivateKey);
  const membership = { id: 'test-membership', userId: owner.uid, groupId, role: 'owner' };
  await call(owner, 'createGroup', { group, records: { group: { id: groupId, ownerId: owner.uid, inviteCode: invite }, membership, userMembership: membership } });
  for (const bucket of ['user-avatars', 'room-images']) {
    const objectPath = `${bucket === 'user-avatars' ? owner.uid : groupId}/fixture-${randomUUID()}.kenc`, imageKey = crypto.randomKey();
    const record = crypto.encrypt('Synthetic image bytes', `images/${bucket}/${objectPath}`, 'image:test', imageKey, owner.device);
    await call(owner, 'imageUpload', { bucket, path: objectPath, record });
    images.push({ user: owner, bucket, path: objectPath });
    const downloaded = await call(owner, 'imageDownload', { bucket, path: objectPath });
    assert.equal(crypto.decrypt(downloaded.record, `images/${bucket}/${objectPath}`, imageKey, new Set([owner.device.signingPublicKey])), 'Synthetic image bytes');
    await assert.rejects(call(outsider, 'imageDownload', { bucket, path: objectPath, groupId }), /authorized/i);
    const publicRead = await fetch(`https://prumjueusdyqnwwovpen.supabase.co/storage/v1/object/public/${bucket}/${objectPath}`);
    assert.equal(publicRead.ok, false, 'public image URLs must be denied');
    await call(owner, 'imageDelete', { bucket, path: objectPath });
    images.pop();
  }
  await call(owner, 'deleteGroup', { groupId });
  passed = true;
  console.log('Production encryption checks passed: authenticated setup, private database access, plaintext denial, replay rejection, migration completion, owner-only image upload/download/deletion, membership denial, and denied public URLs.');
} catch (error) { console.error('Production encryption check failed:', error.code ?? error.name, error.message); process.exitCode = 1; }
finally {
  for (const image of images) { try { await call(image.user, 'imageDelete', { bucket: image.bucket, path: image.path }); } catch { process.exitCode = 1; console.error('Synthetic image cleanup requires retry.'); } }
  if (users[0]?.uid) { try { await call(users[0], 'deleteGroup', { groupId }); } catch { /* Group may already be removed or was never created. */ } }
  const updates = {};
  for (const user of users) if (user.uid) {
    for (const collection of ['e2eeAccounts','e2eeRequests','e2eeDeviceRequests','e2eeMigrations/user','e2eeImageObjects/user-avatars','encryptedData/journalEntries','encryptedData/userGroups']) updates[`${collection}/${user.uid}`] = null;
    updates[`e2eeSigners/${user.device.signingPublicKey}`] = null;
  }
  if (Object.keys(updates).length) {
    const file = join(tmpdir(), `koino-disposable-cleanup-${randomUUID()}.json`);
    try {
      await writeFile(file, JSON.stringify(updates));
      await run(process.execPath, ['.npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/bin/firebase.js','database:update','/',file,'--force','--project','koino-codex'], { maxBuffer: 1024 * 1024 });
    } catch { process.exitCode = 1; console.error('Disposable database cleanup failed.'); }
    finally { await unlink(file).catch(() => {}); }
  }
  for (const user of users) {
    if (user.auth.currentUser) { try { await deleteUser(user.auth.currentUser); } catch { process.exitCode = 1; console.error('Disposable auth cleanup failed.'); } }
    goOffline(user.database); await deleteApp(user.app);
  }
  if (!process.exitCode && passed) console.log('Disposable production test accounts and records removed.');
}
process.exit(process.exitCode ?? 0);
