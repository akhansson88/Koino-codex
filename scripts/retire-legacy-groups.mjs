import { createRequire } from 'node:module';
import { planCleanup, cutoverId, generation } from './encrypted-only-cleanup.mjs';

const project = process.argv.find(v => v.startsWith('--project='))?.slice(10);
const execute = process.argv.includes('--execute');
const phase = process.argv.find(v => v.startsWith('--phase='))?.slice(8) ?? 'inventory';
if (project !== 'koino-codex' || !['inventory','freeze','clean','reopen'].includes(phase) || phase !== 'inventory' && !execute) throw new Error('Use --project=koino-codex; mutations also require --execute and --phase=freeze|clean|reopen.');
const require = createRequire(import.meta.url);
const cliAuth = require('../.npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/auth.js');
const account = cliAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI sign-in is required.');
const token = account.tokens.access_token && account.tokens.expires_at > Date.now() + 60000
  ? account.tokens.access_token
  : (await cliAuth.getAccessToken(account.tokens.refresh_token, account.tokens.scopes)).access_token;
const endpoint = 'https://koino-codex-default-rtdb.europe-west1.firebasedatabase.app/.json';
const headers = { authorization: `Bearer ${token}`, 'content-type':'application/json', 'X-Firebase-ETag':'true' };
async function read() {
  const response = await fetch(endpoint, {headers, signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Database inventory failed: ${response.status}`);
  return { root: await response.json(), etag: response.headers.get('etag') };
}
async function mutate(action) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const {root, etag} = await read();
    if (!etag) throw new Error('Missing database comparison token.');
    const next = action(root);
    const response = await fetch(endpoint, {method:'PUT', headers:{...headers,'if-match':etag}, body:JSON.stringify(next), signal:AbortSignal.timeout(30000)});
    await response.body?.cancel();
    if (response.ok) return next;
    if (response.status !== 412) throw new Error(`Conditional cleanup failed: ${response.status}`);
  }
  throw new Error('Database remained busy; no overwrite was forced.');
}
const {root: initial} = await read();
const report = planCleanup(initial);
console.log(JSON.stringify({phase,encryptedGroupIds:report.ids,legacyGroups:Object.keys(initial.groups ?? {}).length,changes:report.changes,preservedHash:report.preservedHash},null,2));
if (phase === 'freeze') {
  await mutate(root => {
    if (root.e2eePolicy?.cutoverId === cutoverId && root.e2eePolicy.cutoverComplete) throw new Error('Cutover is already complete.');
    if (root.e2eePolicy?.historyGeneration && root.e2eePolicy.historyGeneration !== generation) throw new Error('Unexpected existing history generation.');
    root.e2eePolicy = {...root.e2eePolicy,encryptedGroupsOnly:true,historyGeneration:generation,sharedWritesFrozen:true,cutoverId,freezeStartedAt:root.e2eePolicy?.freezeStartedAt ?? Date.now()}; return root;
  });
  console.log('Shared history frozen; legacy community access closed.');
}
// Storage authorization stays in memory and is never printed or written to disk.
async function storage() {
  const secretResponse = await fetch('https://secretmanager.googleapis.com/v1/projects/181081151239/secrets/KOINO_SUPABASE_SERVICE_KEY/versions/latest:access',{headers:{authorization:`Bearer ${token}`}});
  if (!secretResponse.ok) throw new Error(`Storage credential access failed: ${secretResponse.status}`);
  const secret = Buffer.from((await secretResponse.json()).payload.data,'base64').toString('utf8').trim();
  const {storageHeadersFor} = require('../functions/lib/storage-auth.js');
  return {'content-type':'application/json',...storageHeadersFor(secret)};
}
if (phase === 'inventory' || phase === 'clean') {
  const storageHeaders = await storage();
  const url = 'https://prumjueusdyqnwwovpen.supabase.co/storage/v1/object';
  const objects = [];
  async function list(prefix) {
    for (let offset=0;;offset+=100) {
      const response = await fetch(`${url}/list/room-images`,{method:'POST',headers:storageHeaders,body:JSON.stringify({prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}})});
      if (!response.ok) throw new Error(`Storage inventory failed: ${response.status}`);
      const items = await response.json();
      for (const item of items) { const path = prefix ? `${prefix}/${item.name}` : item.name; if (item.id) objects.push(path); else await list(path); }
      if (items.length<100) break;
    }
  }
  await list('');
  const protectedPaths = new Set(report.ids.flatMap(id => Object.values(initial.e2eeImageObjects?.['room-images']?.[id] ?? {})));
  const deletes = objects.filter(path => !protectedPaths.has(path));
  console.log(JSON.stringify({roomImages:objects.length,preservedImages:objects.length-deletes.length,deleteObjects:deletes},null,2));
  if (phase === 'clean') {
    await mutate(root => {
      if (root.e2eePolicy?.cutoverId !== cutoverId || !root.e2eePolicy.sharedWritesFrozen) throw new Error('Freeze the cutover first.');
      if (Date.now() - root.e2eePolicy.freezeStartedAt < 120000) throw new Error('Allow 120 seconds for in-flight notification handlers to finish before cleaning.');
      const result = planCleanup(root);
      if (JSON.stringify(result.ids) !== JSON.stringify(report.ids) || result.preservedHash !== report.preservedHash) throw new Error('Protected data changed since inventory. Retry with a fresh inventory.');
      result.root.e2eePolicy.cleanupComplete = true;
      return result.root;
    });
    for (let index=0;index<deletes.length;index+=100) {
      const response = await fetch(`${url}/room-images`,{method:'DELETE',headers:storageHeaders,body:JSON.stringify({prefixes:deletes.slice(index,index+100)})});
      if (!response.ok) throw new Error(`Legacy image removal failed: ${response.status}; keep maintenance frozen and retry clean.`);
    }
    objects.length=0;
    await list('');
    if (objects.some(path => !protectedPaths.has(path))) throw new Error('Unprotected room images remain; maintenance was not reopened.');
    const {root: verified} = await read();
    if (planCleanup({...verified,e2eePolicy:{...verified.e2eePolicy,cleanupComplete:false}}).changes.length) throw new Error('Shared history remains; maintenance was not reopened.');
    console.log('Database cleanup verified; protected data unchanged. Legacy image deletions completed.');
  }
}
if (phase === 'reopen') {
  await mutate(root => {
    if (root.e2eePolicy?.cutoverId !== cutoverId || !root.e2eePolicy.cleanupComplete) throw new Error('Complete verified cleanup first.');
    if (root.e2eePolicy.sharedWritesFrozen && planCleanup({...root,e2eePolicy:{...root.e2eePolicy,cleanupComplete:false}}).changes.length) throw new Error('Shared history remains.');
    root.e2eePolicy.sharedWritesFrozen=false; root.e2eePolicy.cutoverComplete=true; return root;
  });
  console.log('Encrypted communities reopened with the new history generation.');
}
