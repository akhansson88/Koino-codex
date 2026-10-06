import assert from 'node:assert/strict';
import { build } from 'esbuild';

const stored = new Map(), subscribers = new Map();
const fixture = globalThis.migrationFixture = {
  auth: { currentUser: { uid: 'alex' } }, state: { uid: 'alex' }, generation: 1, reads: [], operations: [], writes: [], values: {},
  storage: { getItem: async (key) => stored.get(key) ?? null, setItem: async (key, value) => { stored.set(key, value); }, migrateLegacy: async () => {} },
  subscribe(path, callback, error) { const value = { callback, error }; subscribers.set(path, value); return () => { if (subscribers.get(path) === value) subscribers.delete(path); }; },
};
const snapshot = (value) => ({ val: () => value, exists: () => value !== null && value !== undefined, child: (key) => snapshot(value?.[key] ?? null) });
const deliver = (path, value) => { const handler = subscribers.get(path); assert.ok(handler, `Missing subscription: ${path}`); handler.callback(snapshot(value)); };
const plugin = { name: 'migration-fixture', setup(builder) {
  builder.onResolve({ filter: /^firebase\/(database|auth)$|^@\/state\/store\/firebase$|^@\/state\/supabase-storage$|^\.\/session$|^\.\/database$|^\.\/local-storage$|^react-native-libsodium$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents:
    path === 'firebase/database' ? `const f=globalThis.migrationFixture; export const ref=(_db,path)=>({path}); export const get=async({path})=>{f.reads.push(path); if(f.pauseReads)await f.pauseReads; const value=f.values[path]??null; return {val:()=>value,exists:()=>value!==null};}; export const onValue=({path},cb,error)=>f.subscribe(path,cb,error);` :
    path === 'firebase/auth' ? 'export const updateProfile=async()=>{};' :
    path === '@/state/store/firebase' ? 'export const auth=globalThis.migrationFixture.auth,database={};' :
    path === './local-storage' ? 'export default globalThis.migrationFixture.storage;' :
    path === './session' ? `const f=globalThis.migrationFixture; export const session=()=>f.state,sessionGeneration=()=>f.generation; export const crypto={canonical:JSON.stringify}; export const encryptedOperation=async(operation,data)=>{f.operations.push(operation); if(operation==='readLegacyArchive')return {source:null}; if(operation==='finishMigration'&&f.failFinish)throw Error('interrupted'); return {};}; export const createEncryptedGroup=async()=>{},groupJoinRequest=async()=>{},loadGroup=async()=>{};` :
    path === './database' ? 'export const encodeAt=(_p,v)=>v,decodeAt=(_p,v)=>v,physicalPath=(p)=>p,ref=(_db,path)=>({path}); export const set=async({path},value)=>{globalThis.migrationFixture.writes.push(path);};' :
    path === 'react-native-libsodium' ? 'export default {};' :
    'export const uploadRoomImage=async()=>{},uploadUserAvatar=async()=>{},deleteRoomImage=async()=>{},deleteUserAvatar=async()=>{};' }));
} };
const built = await build({ entryPoints: ['state/encryption/migration.ts'], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [plugin] });
const { personalMigrationComplete, migratePersonal, listenLegacyCommunities } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

fixture.values['e2eeMigrations/user/alex/status'] = 'complete';
assert.equal(await personalMigrationComplete(), true);
assert.equal(fixture.reads.length, 1);
await migratePersonal(() => assert.fail('Completed migration reported progress'));
assert.equal(fixture.reads.length, 1, 'verified local completion skips remote migration reads on later boots');
assert.equal(fixture.operations.length, 0);

fixture.auth.currentUser.uid = fixture.state.uid = 'joel';
assert.equal(await personalMigrationComplete(), false, 'completion cache belongs to its account');
fixture.values['encryptedData/profiles/joel'] = { id: 'joel' };
fixture.failFinish = true;
await assert.rejects(migratePersonal(() => {}), /interrupted/);
assert.equal(stored.has('e2ee.migration-complete.user.joel'), false, 'interrupted copying never records completion');
fixture.failFinish = false;
await migratePersonal(() => {});
assert.equal(stored.get('e2ee.migration-complete.user.joel'), 'true');

fixture.auth.currentUser.uid = fixture.state.uid = 'switching';
fixture.values['e2eeMigrations/user/switching/status'] = 'complete';
let releaseRead;
fixture.pauseReads = new Promise((resolve) => { releaseRead = resolve; });
const changing = personalMigrationComplete();
await Promise.resolve();
fixture.generation++;
fixture.auth.currentUser.uid = 'another-account';
releaseRead();
await assert.rejects(changing, /account changed/);
assert.equal(stored.has('e2ee.migration-complete.user.switching'), false, 'a changed account cannot adopt another session migration result');
fixture.pauseReads = null;

fixture.auth.currentUser.uid = fixture.state.uid = 'alex';
let last, errors = [];
const stop = listenLegacyCommunities('alex', (value) => { last = value; }, (error) => errors.push(error));
await Promise.resolve();
deliver('e2eePendingGroups/alex', null);
const membership = { id: 'membership', userId: 'alex', groupId: 'community', role: 'member', userName: 'Alex', createdAt: '2026-01-01', image: { url: 'legacy-image' } };
deliver('userGroups/alex', { community: membership });
assert.equal(last.ready, false);
assert.equal(last.memberships[0].groupId, 'community', 'membership survives while community identity is loading');
deliver('groupMembers/community', { joel: { userName: 'Joel' } });
deliver('groups/community', { id: 'community', name: 'Alex and Joel', ownerId: 'joel', inviteCode: 'INVITE', createdAt: '2026-01-01', updatedAt: '2026-01-01', image: { url: 'legacy-image' } });
assert.equal(last.ready, true);
assert.equal(last.groups[0].migrationOwnerName, 'Joel', 'owner identity survives reversed callback order');
assert.equal(last.groups[0].image, undefined);
assert.equal(last.memberships[0].image, undefined);
deliver('e2eePendingGroups/alex', { community: { inviteCode: 'INVITE' } });
deliver('userGroups/alex', null);
deliver('groups/community', null);
assert.equal(last.ready, true);
assert.equal(last.groups[0].name, 'Alex and Joel', 'encrypted local identity survives owner migration');
assert.equal(last.groups[0].migrationAwaitingApproval, true);
assert.equal(last.memberships[0].groupId, 'community');
deliver('e2eePendingGroups/alex', null);
assert.deepEqual(last.groups, []);
assert.deepEqual(last.memberships, []);
stop();

const stopRace = listenLegacyCommunities('alex', (value) => { last = value; }, (error) => errors.push(error));
await Promise.resolve();
deliver('userGroups/alex', { community: membership });
subscribers.get('groups/community').error(new Error('Permission denied'));
assert.equal(last.ready, false);
deliver('e2eePendingGroups/alex', { community: { inviteCode: 'INVITE' } });
assert.equal(last.ready, true, 'pending marker resolves legacy access that closed before its callback arrived');
assert.equal(last.groups[0].migrationAwaitingApproval, true);
stopRace();
assert.equal(subscribers.size, 0);
console.log('Encryption migration checks passed: account-scoped completion, interruption retry, retained community membership, pending owner approval, callback ordering, and legacy access closure.');
