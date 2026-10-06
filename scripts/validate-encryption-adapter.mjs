import assert from 'node:assert/strict';
process.on('uncaughtException', (error) => { console.error(error.message); process.exit(1); });
import { build } from 'esbuild';
import { crypto } from './encryption-test-helpers.mjs';
const identity = crypto.identity(), device = crypto.identity(), privateKey = crypto.randomKey(), groupKey = crypto.randomKey();
const recipient = crypto.identity();
const state = { uid: 'owner', vault: { identity, personalKeys: { 1: privateKey }, groups: {} }, device: { identity: device }, accounts: { owner: { devices: { initial: { signingPublicKey: device.signingPublicKey } } }, recipient: { ...recipient, devices: {} } } };
const records = new Map(), listeners = new Map();
const snapshot = (reference, value) => ({ ref: reference, key: reference.path.split('/').at(-1), val: () => value, exists: () => value != null });
const fixture = globalThis.encryptionFixture = {
  crypto, state, generation: 1,
  selected(scope, keyId) { const group = scope.startsWith('group:'); return { key: group ? groupKey : privateKey, keyId: keyId ?? `${scope}:1`, trusted: new Set([device.signingPublicKey]) }; },
  prepareScope: async () => {}, ensureGroupDeviceSigners: async () => {}, account: async () => {}, resolveEncryptedImages: async (value) => value,
  get: async (reference) => snapshot(reference, records.get(reference.path) ?? null),
  onValue(reference, callback) {
    const callbacks = listeners.get(reference.path) ?? new Set();
    callbacks.add(callback); listeners.set(reference.path, callbacks);
    return () => callbacks.delete(callback);
  },
  emit(reference, value) { for (const callback of listeners.get(reference.path) ?? []) callback(snapshot(reference, value)); },
};
const bundled = await build({ entryPoints: ['state/encryption/database.ts'], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'native-boundaries', setup(builder) {
  builder.onResolve({ filter: /^firebase\/database$|^@\/state\/store\/firebase$|^@\/state\/supabase-storage$|^\.\/session$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: path === './session' ? 'const fixture=globalThis.encryptionFixture; export const crypto=fixture.crypto, session=()=>fixture.state, keyForScope=fixture.selected, prepareScope=(...args)=>fixture.prepareScope(...args), ensureGroupDeviceSigners=(...args)=>fixture.ensureGroupDeviceSigners(...args), account=(...args)=>fixture.account(...args), sessionGeneration=()=>fixture.generation;' : path.includes('supabase') ? 'export const resolveEncryptedImages=(...args)=>globalThis.encryptionFixture.resolveEncryptedImages(...args);' : path.includes('store/firebase') ? 'export const database={};' : 'const fixture=globalThis.encryptionFixture; export const ref=(_db,path)=>({path}), query=(r)=>r, equalTo=()=>{}, orderByChild=()=>{}, endBefore=()=>{}, limitToLast=()=>{}, get=(r)=>fixture.get(r), set=()=>{}, update=()=>{}, onValue=(...args)=>fixture.onValue(...args), runTransaction=()=>{};' }));
} }] });
const adapter = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const record = { id: 'post', userId: 'owner', groupId: 'group', createdAt: '2026-01-01', body: 'Private prayer', verses: [{ book: 'John', chapter: 3, text: 'Secret verse' }], futureContent: { nested: 'Private future data' } };
const encrypted = adapter.encodeAt('posts/group/post', record);
const follow = { id: 'post_fixture', userId: 'owner', targetType: 'post', targetId: 'fixture', createdAt: '2026-01-01' };
assert.deepEqual(adapter.encodeAt('userDiscussionFollows/owner/group/post_fixture', follow), follow);
assert.equal(adapter.encodeAt('userDiscussionFollows/owner/group/post_fixture/targetId', 'fixture'), 'fixture');
assert.throws(() => adapter.encodeAt('userDiscussionFollows/owner/group/post_fixture/body', 'plaintext'), /Unexpected routing field/);
assert.equal(encrypted.userId, 'owner');
assert.ok(!JSON.stringify(encrypted).includes('Secret verse'));
assert.deepEqual(adapter.decodeAt('posts/group/post', encrypted), record);
assert.throws(() => adapter.decodeAt('posts/group/copied', encrypted));
assert.throws(() => adapter.decodeAt('posts/group/post', { ...encrypted, userId: 'intruder' }));
const archive = { sourceCollection: 'privateBiblePlanProgress', createdAt: '2026-01-01', content: JSON.stringify({ secret_plan_name: { '2026-05-28': { passage: 'Private old passage', complete: true } } }) };
const archiveCipher = adapter.encodeAt('legacyUserArchives/owner/privateBiblePlanProgress', archive);
assert.ok(!JSON.stringify(archiveCipher).includes('secret_plan_name'));
assert.ok(!JSON.stringify(archiveCipher).includes('Private old passage'));
assert.deepEqual(adapter.decodeAt('legacyUserArchives/owner/privateBiblePlanProgress', archiveCipher), archive);
const membership = { id: 'membership', userId: 'owner', groupId: 'group', role: 'member', userName: 'Private name' };
const memberCipher = adapter.encodeAt('groupMembers/group/owner', membership);
const indexCipher = adapter.encodeAt('userGroups/owner/group', membership);
assert.deepEqual(adapter.decodeAt('userGroups/owner/group', indexCipher), membership);
assert.throws(() => adapter.decodeAt('userGroups/owner/group', memberCipher));
const verse = { id: 'John-3-16', savedAt: '2026-01-01', reference: 'John 3:16', text: 'Secret verse' };
const verseCipher = adapter.encodeAt('savedVerses/owner/John-3-16', verse);
const physicalId = adapter.physicalPath('savedVerses/owner/John-3-16').split('/').at(-1);
assert.ok(!physicalId.includes('John'));
assert.deepEqual(adapter.decodeAt('savedVerses/owner', { [physicalId]: verseCipher }), { 'John-3-16': verse });
const prayer = { userId: 'owner', recipientUserId: 'recipient', message: 'Prayed for you' };
const prayerCipher = adapter.encodeAt('prayerNotifications/recipient/prayer', prayer);
state.uid = 'recipient'; state.vault.identity = recipient;
assert.deepEqual(adapter.decodeAt('prayerNotifications/recipient/prayer', prayerCipher), prayer);
state.vault.previousIdentities = [recipient]; state.vault.identity = crypto.identity();
assert.deepEqual(adapter.decodeAt('prayerNotifications/recipient/prayer', prayerCipher), prayer, 'historical recipient identity survives rotation');
state.uid = 'owner'; state.vault.identity = identity;
const prepared = [], signers = [];
fixture.prepareScope = async (scope) => { prepared.push(scope); };
fixture.ensureGroupDeviceSigners = async (groupId) => { signers.push(groupId); };
state.vault.groups = { historical: { keys: {} } };
const membershipRef = adapter.ref({}, 'userGroups/owner');
assert.equal((await adapter.get(membershipRef)).val(), null);
assert.deepEqual(prepared, [], 'an empty membership index must not reload historical groups');
assert.deepEqual(signers, []);

const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const flush = () => new Promise((resolve) => setImmediate(resolve));
let preparation = deferred();
fixture.prepareScope = async (scope) => { prepared.push(scope); await preparation.promise; };
records.set(membershipRef.path, { group: indexCipher });
const membersRef = adapter.ref({}, 'groupMembers/group');
records.set(membersRef.path, { owner: memberCipher });
const concurrentReads = [adapter.get(membershipRef), adapter.get(membersRef)];
await flush();
assert.deepEqual(prepared, ['group:group'], 'concurrent reads share group key and signer preparation');
preparation.resolve();
await Promise.all(concurrentReads);
assert.deepEqual(signers, ['group']);
await adapter.get(membersRef);
assert.deepEqual(prepared, ['group:group', 'group:group'], 'later reads still refresh access and revocation checks');
assert.deepEqual(signers, ['group', 'group']);

prepared.length = 0;
preparation = deferred();
records.set(membershipRef.path, {
  group: indexCipher,
  second: adapter.encodeAt('userGroups/owner/second', { ...membership, groupId: 'second' }),
});
const independentGroups = adapter.get(membershipRef);
await flush();
assert.deepEqual(prepared.sort(), ['group:group', 'group:second'], 'different membership groups prepare in parallel');
preparation.resolve();
await independentGroups;

fixture.prepareScope = async () => {};
const profileRef = adapter.ref({}, 'profiles/owner');
const imageUri = 'koino-encrypted://user-avatars/owner/avatar.webp';
const profile = { id: 'owner', name: 'Verified name', image: { url: imageUri, encryption: { key: 'key', keyId: 'image:1', signer: 'signer' } } };
const encryptedProfile = adapter.encodeAt('profiles/owner', profile);
let hydration = deferred();
fixture.resolveEncryptedImages = async (value) => { await hydration.promise; return { ...value, image: { ...value.image, encryptedUri: imageUri, url: 'data:image/webp;base64,fixture' } }; };
const emitted = [], errors = [];
const unsubscribe = adapter.onValue(profileRef, (value) => emitted.push(value.val()), (error) => errors.push(error));
fixture.emit(profileRef, encryptedProfile);
await flush();
assert.equal(emitted.length, 1, 'verified profile text arrives before the image download finishes');
assert.equal(emitted[0].name, profile.name);
assert.equal(emitted[0].image.url, undefined, 'a pending encrypted URI is never given to a native image view');
assert.equal(emitted[0].image.encryptedUri, imageUri, 'pending snapshots retain the URI for later encrypted writes');
const pendingImageCopy = adapter.decodeAt('userGroups/owner/group/image', adapter.encodeAt('userGroups/owner/group/image', emitted[0].image));
assert.equal(pendingImageCopy.url, imageUri, 'membership fanout of a placeholder must persist its encrypted URI rather than an undefined URL');
hydration.resolve();
await flush();
assert.equal(emitted.length, 2, 'the listener receives a second snapshot when the avatar is ready');
assert.equal(emitted[1].image.url, 'data:image/webp;base64,fixture');

hydration = deferred();
fixture.emit(profileRef, encryptedProfile);
await flush();
assert.equal(emitted.length, 3);
fixture.generation++;
hydration.resolve();
await flush();
assert.equal(emitted.length, 3, 'hydration from the old account session must not reach the listener');

hydration = deferred();
fixture.emit(profileRef, encryptedProfile);
await flush();
assert.equal(emitted.length, 4);
const updatedProfile = { ...profile, name: 'Newer verified name', image: undefined };
fixture.emit(profileRef, adapter.encodeAt('profiles/owner', updatedProfile));
await flush();
assert.equal(emitted.length, 5);
hydration.resolve();
await flush();
assert.equal(emitted.length, 5, 'an old image download must not overwrite a newer database snapshot');
assert.equal(emitted.at(-1).name, updatedProfile.name);

hydration = deferred();
fixture.emit(profileRef, encryptedProfile);
await flush();
fixture.generation++;
hydration.reject(new Error('The image session changed.'));
await flush();
assert.deepEqual(errors, [], 'an old account image failure must not become a new account error');
unsubscribe();
assert.deepEqual(errors, []);

// A collection containing many authenticated fields must yield so profile
// updates and native input can progress before the whole collection is ready.
fixture.resolveEncryptedImages = async value => value;
const verseRef = adapter.ref({}, 'savedVerses/owner');
const verseRecords = Object.fromEntries(Array.from({ length: 4 }, (_, index) => {
  const id = `John-3-${index + 1}`;
  const record = { ...verse, id, reference: `John 3:${index + 1}` };
  return [adapter.physicalPath(`savedVerses/owner/${id}`).split('/').at(-1), adapter.encodeAt(`savedVerses/owner/${id}`, record)];
}));
const savedPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
const savedDecrypt = crypto.decrypt;
let elapsed = 0;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => elapsed } });
crypto.decrypt = (...args) => { elapsed += 5; return savedDecrypt(...args); };
try {
  const events = [], complete = deferred();
  const stopLarge = adapter.onValue(verseRef, snapshot => { events.push('collection'); complete.resolve(snapshot.val()); }, complete.reject);
  const stopSmall = adapter.onValue(profileRef, snapshot => { events.push('profile'); assert.equal(snapshot.val().name, updatedProfile.name); });
  fixture.emit(verseRef, verseRecords);
  fixture.emit(profileRef, adapter.encodeAt('profiles/owner', updatedProfile));
  const decodedVerses = await complete.promise;
  assert.deepEqual(events, ['profile', 'collection'], 'profile updates must render while a large encrypted collection is decoding');
  assert.deepEqual(Object.keys(decodedVerses), ['John-3-1', 'John-3-2', 'John-3-3', 'John-3-4'], 'yielded decoding must reconstruct authenticated opaque verse IDs');
  stopLarge(); stopSmall();
  records.set(verseRef.path, verseRecords);
  assert.deepEqual((await adapter.get(verseRef)).val(), decodedVerses, 'one-time collection reads use the same authenticated, yielding decoder');

  const superseded = [], latest = deferred();
  const stopSuperseded = adapter.onValue(verseRef, snapshot => { superseded.push(snapshot.val()); latest.resolve(); }, latest.reject);
  fixture.emit(verseRef, verseRecords);
  await new Promise(resolve => setTimeout(resolve, 20));
  fixture.emit(verseRef, Object.fromEntries(Object.entries(verseRecords).slice(0, 1)));
  await latest.promise;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(superseded.length, 1, 'a newer snapshot must cancel a collection waiting between decode slices');
  assert.deepEqual(Object.keys(superseded[0]), ['John-3-1']);
  stopSuperseded();

  const partial = [], rejected = deferred();
  const stopCorrupt = adapter.onValue(verseRef, snapshot => partial.push(snapshot.val()), rejected.resolve);
  const lastId = Object.keys(verseRecords).at(-1);
  const corrupt = { ...verseRecords, [lastId]: { ...verseRecords[lastId], text: { ...verseRecords[lastId].text, ciphertext: 'invalid' } } };
  fixture.emit(verseRef, corrupt);
  await rejected.promise;
  assert.deepEqual(partial, [], 'a later authentication failure must never publish a partially decoded collection');
  stopCorrupt();

  const cancelled = [], cancelErrors = [];
  const stopCancelled = adapter.onValue(verseRef, snapshot => cancelled.push(snapshot.val()), error => cancelErrors.push(error));
  fixture.emit(verseRef, verseRecords);
  await new Promise(resolve => setTimeout(resolve, 20));
  fixture.generation++;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(cancelled, [], 'a session changed between decode slices must not receive content');
  assert.deepEqual(cancelErrors, [], 'cancelled collection work must not leak an error to the new session');
  stopCancelled();
} finally {
  crypto.decrypt = savedDecrypt;
  if (savedPerformance) Object.defineProperty(globalThis, 'performance', savedPerformance);
  else delete globalThis.performance;
}
console.log('Encryption adapter checks passed: content authentication, membership fanout, recipient rotation, shared group preparation, nonblocking avatars, budgeted collection decoding, opaque IDs, and stale session guards.');
