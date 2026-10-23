import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { crypto } from "./encryption-test-helpers.mjs";

// Execute the actual signed callable and root ETag transaction. Only Admin
// database reads and HTTP transport are replaced by a deterministic server.
const directory = await mkdtemp(path.resolve("functions/node_modules/koino-moderation-"));
const require = createRequire(import.meta.url), originalFetch = globalThis.fetch;
const server = globalThis.__moderationServer = { root: {}, revision: 1, conflict: null, fail: false, puts: 0, gets: 0, readBytes: 0, writeBytes: 0 };
const users = Object.fromEntries(["A","B","C"].map(uid => [uid,{ uid,identity:crypto.identity() }]));
const fixture = () => ({
  e2eeGroups: { room: { ownerId:"A",members:{ A:true,B:true } } },
  e2eeAccounts: Object.fromEntries(Object.values(users).map(u => [u.uid,{ devices:{ phone:{ active:true,signingPublicKey:u.identity.signingPublicKey } } }])),
  encryptedData: { groupMembers:{room:{A:{userId:"A"},B:{userId:"B"}}}, posts:{ room:{ post:{ userId:"B",body:{ ciphertext:"opaque" } } } },replies:{ room:{} },journalEntries:{ B:{ journal:{ ciphertext:"private" } } } },
});
const request = (uid, type="post", id="post") => {
  const payload = { operation:"removeCommunityContent", data:{ groupId:"room",targetType:type,targetId:id },deviceId:"phone",requestId:crypto.randomKey(),timestamp:Date.now() };
  return { auth:{uid}, data:{ ...payload,signature:crypto.signature(payload,users[uid].identity.signingPrivateKey) } };
};
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "local.invalid:9001";
globalThis.fetch = async (_url, options) => {
  if (options.method !== "PUT") {
    const serialized = JSON.stringify(server.root); server.gets++; server.readBytes += Buffer.byteLength(serialized);
    return new Response(serialized,{ headers:{ etag:String(server.revision) } });
  }
  if (server.fail) return new Response("failure",{ status:503 });
  if (server.conflict) { const action=server.conflict;server.conflict=null;await action(server.root);server.revision++; }
  if (options.headers["if-match"] !== String(server.revision)) return new Response("conflict",{status:412});
  server.root=JSON.parse(options.body);server.revision++;server.puts++;server.writeBytes+=Buffer.byteLength(options.body);return new Response("ok");
};
try {
  const outfile = path.join(directory,"backend.cjs");
  await build({ stdin:{contents:'export {encryptedAccount} from "./functions/src/encryption";export {createCommentNotification} from "./functions/src/activity-notifications";',resolveDir:process.cwd(),loader:"ts"},outfile,bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"admin-boundary",setup(builder){
    builder.onResolve({filter:/^firebase-admin\/database$|^\.\/firebase-admin$/},args=>({path:args.path,namespace:"fixture"}));
    builder.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({contents:path==="./firebase-admin" ? 'export const adminApp={options:{databaseURL:"https://demo-koino-default-rtdb.firebaseio.com"}};' : `export const getDatabase=()=>({ref:path=>{const r={get:async()=>{const value=path.split('/').reduce((v,k)=>v?.[k],globalThis.__moderationServer.root)??null;return{val:()=>value,exists:()=>value!==null,numChildren:()=>Object.keys(value??{}).length};},orderByChild:()=>r,equalTo:()=>r};return r;}});`,loader:"js"}));
  }}]});
  const { encryptedAccount,createCommentNotification }=require(outfile);
  const call = input=>encryptedAccount.run(input);
  for(const uid of ["B","C"]){server.root=fixture();await assert.rejects(call(request(uid)),/community owner|authorized/);assert.ok(server.root.encryptedData.posts.room.post);}
  server.root=fixture();const bad=request("A");bad.data.data.targetId="tampered";await assert.rejects(call(bad),/Unlock/);
  server.root=fixture();const input=request("A");
  server.conflict=root=>{root.encryptedData.replies.room.late={userId:"B",targetType:"post",targetId:"post"};root.unrelated="preserved";};
  await call(input);assert.equal(server.root.encryptedData.posts.room.post,undefined);assert.equal(server.root.encryptedData.replies.room.late,undefined);assert.equal(server.root.unrelated,"preserved");assert.ok(server.root.moderationTombstones.room.reply.late);
  const after=structuredClone(server.root), beforeRetryGets=server.gets, beforeRetryPuts=server.puts;
  await call(input);await call(request("A"));assert.deepEqual(server.root,after);
  assert.equal(server.gets,beforeRetryGets,"An authorized idempotent retry needs no full-root download");
  assert.equal(server.puts,beforeRetryPuts,"An idempotent retry must not upload the root");
  server.root=fixture();server.fail=true;const retry=request("A");const before=structuredClone(server.root);await assert.rejects(call(retry),/could not be committed/);assert.deepEqual(server.root,before);server.fail=false;await call(retry);assert.ok(server.root.moderationActions.room.post.post);
  server.root=fixture();server.conflict=root=>{root.e2eeGroups.room.ownerId="B";};await assert.rejects(call(request("A")),/community owner/);assert.ok(server.root.encryptedData.posts.room.post);
  server.root=fixture();server.root.encryptedData.checkIns={room:{checkin:{userId:"B",visibility:"group"}}};const untouched=structuredClone(server.root);await assert.rejects(call(request("A","check_in","checkin")),/claim is missing/);assert.deepEqual(server.root,untouched,"failed planning cannot partially commit");
  server.root=fixture();let dropped=false;
  const transport=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{const response=await transport(url,options);if(options.method==="PUT"&&!dropped&&response.ok){dropped=true;throw Error("lost response");}return response;};
  const lost=request("A");await assert.rejects(call(lost),/lost response/);const committed=structuredClone(server.root);globalThis.fetch=transport;await call(lost);assert.deepEqual(server.root,committed,"A lost acknowledgement must not duplicate a committed action");
  assert.deepEqual(server.root.encryptedData.journalEntries,{B:{journal:{ciphertext:"private"}}});
  server.root=fixture();
  const sourceReply={id:"late-notice",userId:"A",targetType:"post",targetId:"post",createdAt:"2026-10-22"};
  server.root.encryptedData.replies.room["late-notice"]=sourceReply;
  server.conflict=async()=>{await call(request("A"));};
  await createCommentNotification.run({params:{groupId:"room",replyId:"late-notice"},data:{val:()=>sourceReply}});
  assert.equal(server.root.encryptedData.activityNotifications?.B?.["late-notice"],undefined,"A delayed notification cannot recreate a reference after atomic removal");
  assert.ok(server.root.moderationActions.room.post.post);
  server.root=fixture();
  const recipients=Array.from({length:32},(_,index)=>`recipient${index}`);
  for(const uid of recipients){server.root.e2eeGroups.room.members[uid]=true;server.root.encryptedData.groupMembers.room[uid]={userId:uid};}
  server.root.encryptedData.discussionFollowers={room:{post:{post:Object.fromEntries(recipients.map(userId=>[userId,{userId}]))}}};
  server.root.encryptedData.notificationPreferences=Object.fromEntries(["B",...recipients].map(uid=>[uid,{pushEnabled:false}]));
  const fanout={...sourceReply,id:"fanout"};server.root.encryptedData.replies.room.fanout=fanout;
  const baseline={puts:server.puts,gets:server.gets,readBytes:server.readBytes,writeBytes:server.writeBytes};
  const event={params:{groupId:"room",replyId:"fanout"},data:{val:()=>fanout}};
  await createCommentNotification.run(event);
  assert.equal(server.puts-baseline.puts,1,"A reply with 33 recipients commits one root transaction");
  assert.equal(Object.keys(server.root.encryptedData.activityNotifications).length,33);
  const committedPuts=server.puts;await createCommentNotification.run(event);
  assert.equal(server.puts,committedPuts,"Duplicate notification delivery must not upload an unchanged root");
  console.log(`Fanout check: 33 recipients, one root commit; fixture read ${server.readBytes-baseline.readBytes} bytes across first+duplicate delivery, written ${server.writeBytes-baseline.writeBytes} bytes.`);
  console.log("Moderation signed backend passed: authorization/signatures, concurrent child cleanup, ETag retries, ownership races, same-request idempotency and atomic failure recovery.");
} finally {
  globalThis.fetch=originalFetch;delete globalThis.__moderationServer;delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  await rm(directory,{recursive:true,force:true});
}
