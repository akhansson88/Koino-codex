import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const bundle = buildSync({ entryPoints: ["state/encryption/schema.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { policies } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const rules = JSON.parse(readFileSync("firebase.legacy.rules.json", "utf8")).rules;
const own = "auth != null && auth.uid == $uid";
const member = "auth != null && root.child('e2eeGroups').child($groupId).child('members').child(auth.uid).exists() && !root.child('e2eeDepartures').child($groupId).child(auth.uid).exists()";
const owner = `${member} && root.child('e2eeGroups').child($groupId).child('ownerId').val() == auth.uid`;
const writableMember = `${member} && !root.child('e2eeGroupLocks').child($groupId).exists()`;
// Once enrollment starts, old clients cannot write that user's plaintext. Group
// migration freezes all members' legacy writes before any record is copied.
function freeze(node, collection) {
  for (const [key, value] of Object.entries(node)) {
    if (key === ".write" && typeof value === "string") {
      let extra = "!root.child('e2eeAccounts').child(auth.uid).exists()";
      if (["groups", "groupMembers", "posts", "checkIns", "replies", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupBiblePlanParticipation", "discussionFollowers"].includes(collection)) extra += " && !root.child('e2eeMigrations').child('group').child($groupId).exists()";
      // Legacy groups use $groupId at their record level.
      node[key] = `(${value}) && (${extra})`;
    } else if (value && typeof value === "object") freeze(value, collection);
  }
}
for (const [collection, node] of Object.entries(rules)) if (!collection.startsWith(".")) freeze(node, collection);
// Legacy push tokens were deliberately unreadable to clients. The account
// owner needs a temporary read during migration to copy and verify them.
rules.pushTokens.$uid[".read"] = `${own} && root.child('e2eeMigrations').child('user').child($uid).child('status').val() == 'copying'`;
const migratingOwner = "auth != null && root.child('e2eeMigrations').child('group').child($groupId).child('ownerId').val() == auth.uid && root.child('e2eeMigrations').child('group').child($groupId).child('status').val() == 'copying'";
// A resumable owner migration must still read its source after legacy group
// metadata or memberships have been conditionally removed.
for (const collection of ["groups", "groupMembers", "posts", "checkIns", "replies", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupBiblePlanParticipation", "discussionFollowers"]) {
  const node = rules[collection].$groupId;
  node[".read"] = `(${node[".read"]}) || (${migratingOwner})`;
}
rules.userGroups.$uid.$groupId[".read"] = migratingOwner;

function encryptedTree(expectedKey, depth = 0) {
  const valid = `newData.hasChildren(['v','keyId','nonce','ciphertext','signer','signature']) && (!newData.hasChild('wrappedKey') || newData.child('wrappedKey').isString()) && newData.child('v').val() == 1 && newData.child('keyId').val() == (${expectedKey}) && newData.child('nonce').isString() && newData.child('ciphertext').isString() && newData.child('ciphertext').val().length <= 4000000 && newData.child('signature').isString() && root.child('e2eeSigners').child(newData.child('signer').val()).child('uid').val() == auth.uid && root.child('e2eeSigners').child(newData.child('signer').val()).child('active').val() == true`;
  const allowed = depth ? ['v','keyId','nonce','ciphertext','signer','signature','wrappedKey','context'].map((key) => `$encrypted${depth - 1} == '${key}'`).join(' || ') : 'false';
  const leaf = `(${allowed}) && newData.parent().child('v').val() == 1 && newData.parent().hasChildren(['keyId','nonce','ciphertext','signer','signature'])`;
  return { ".validate": depth === 6 ? leaf : `(${leaf}) || (${valid})${depth < 5 ? " || (newData.parent().child('v').val() != 1 && !newData.hasChild('v') && newData.hasChildren())" : ""}`, ...(depth < 6 ? { [`$encrypted${depth}`]: encryptedTree(expectedKey, depth + 1) } : {}) };
}
const store = { ".read": false, ".write": false };
for (const [collection, p] of Object.entries(policies)) {
  const vars = collection === "groups" ? ["$groupId"] : collection === "profiles" ? ["$uid"] :
    collection === "groupMembers" ? ["$groupId", "$uid"] : collection === "userGroups" ? ["$uid", "$groupId"] :
    collection === "groupBiblePlanParticipation" ? ["$groupId", "$announcementId", "$uid"] :
    collection === "discussionFollowers" ? ["$groupId", "$targetType", "$targetId", "$uid"] :
    collection === "userDiscussionFollows" ? ["$uid", "$groupId", "$id"] :
    collection === "checkInDailyClaims" ? ["$uid", "$groupId", "$dayKey"] :
    p.scope === "group" ? ["$groupId", "$id"] : collection === "inviteCodes" ? ["$code"] : p.depth === 2 ? ["$uid"] : ["$uid", "$id"];
  const shared = p.scope === "group" || p.scope === "membership" || collection === "discussionFollowers";
  const read = shared && collection !== "userGroups" ? member : collection === "inviteCodes" ? "auth != null" : own;
  const migrating = "auth != null && root.child('e2eeMigrations').child('group').child($groupId).child('ownerId').val() == auth.uid && root.child('e2eeMigrations').child('group').child($groupId).child('status').val() == 'copying'";
  let write = shared ? `${writableMember} && ((!newData.exists() && (data.child('userId').val() == auth.uid || root.child('e2eeGroups').child($groupId).child('ownerId').val() == auth.uid)) || (newData.exists() && newData.child('userId').val() == auth.uid && (!data.exists() || data.child('userId').val() == auth.uid)))` : own;
  if (shared) write = `(${write}) || (${migrating})`;
  if (collection === "groups") write = `${owner} && data.exists() && newData.exists() && newData.child('id').val() == data.child('id').val() && newData.child('ownerId').val() == data.child('ownerId').val() && newData.child('inviteCode').val() == data.child('inviteCode').val()`;
  if (["groupMembers", "userGroups"].includes(collection)) write = `${writableMember} && auth.uid == $uid && data.exists() && newData.exists() && newData.child('userId').val() == data.child('userId').val() && newData.child('groupId').val() == data.child('groupId').val() && newData.child('role').val() == data.child('role').val()`;
  if (collection === "inviteCodes") write = "false";
  if (collection === "pushDeliveryDiagnostics") write = "false";
  if (collection === "activityNotifications") write = `${own} && root.child('e2eeMigrations').child('user').child($uid).child('status').val() == 'copying'`;
  if (collection === "prayerNotifications") write = `auth != null && ((!newData.exists() && auth.uid == $uid) || (newData.exists() && newData.child('userId').val() == auth.uid && newData.child('recipientUserId').val() == $uid && root.child('e2eeGroups').child(newData.child('groupId').val()).child('members').child(auth.uid).exists() && root.child('e2eeGroups').child(newData.child('groupId').val()).child('members').child($uid).exists()) || (auth.uid == $uid && root.child('e2eeMigrations').child('user').child($uid).child('status').val() == 'copying'))`;
  if (collection === "discussionFollowers") write = `(${writableMember} && auth.uid == $uid && (!newData.exists() || newData.child('userId').val() == auth.uid)) || (${migrating})`;
  if (collection === "groupBiblePlanAnnouncements") write = `(${owner}) || (${migrating})`;
  if (collection === "groupBiblePlanParticipation") write = `(${writableMember} && ((!newData.exists() && data.child('userId').val() == auth.uid) || (newData.child('userId').val() == auth.uid && (!data.exists() || data.child('userId').val() == auth.uid || root.child('encryptedData').child('groupBiblePlanParticipantIds').child(auth.uid).child($announcementId).val() == $uid)))) || (${migrating})`;
  const target = {};
  let node = target;
  for (let index = 0; index < vars.length; index++) {
    node[vars[index]] = {}; node = node[vars[index]];
    if (index === 0 && vars[index] !== "$code") node[".read"] = collection === "userGroups" ? own : read;
  }
  node[".read"] = read; node[".write"] = write;
  if (p.depth >= 3 && !["checkInDailyClaims", "discussionFollowers", "groupBiblePlanParticipantIds"].includes(collection)) {
    let parent = target;
    for (const variable of vars.slice(0, -1)) parent = parent[variable];
    parent[".indexOn"] = ["createdAt", "targetId", "readAt"];
  }
  const expectedKey = shared ? "'group:' + $groupId + ':' + root.child('e2eeGroups').child($groupId).child('epoch').val()" : collection === "prayerNotifications" ? "(auth.uid == $uid ? 'user:' + $uid + ':' + root.child('e2eeAccounts').child($uid).child('personalEpoch').val() : 'recipient:' + $uid)" : "'user:' + $uid + ':' + root.child('e2eeAccounts').child($uid).child('personalEpoch').val()";
  if (p.scope === "routing") {
    if (collection === "groupBiblePlanParticipantIds") node[".validate"] = "newData.isString() && newData.val().length <= 160";
    else {
      for (const field of p.metadata) node[field] = { ".validate": field === "mentionUserIds" ? "newData.hasChildren()" : "newData.isString() || newData.isNumber() || newData.isBoolean()" };
      node.$other = { ".validate": false };
    }
  } else {
    for (const field of p.metadata) node[field] = { ".validate": field === "mentionUserIds" ? "newData.hasChildren()" : "newData.isString() || newData.isNumber() || newData.isBoolean()" };
    node.$field = encryptedTree(expectedKey);
  }
  if (collection === "activityNotifications") node.readAt = { ".write": own, ".validate": "newData.isString()" };
  store[collection] = target;
}
rules.encryptedData = store;
rules.e2eeAccounts = { "$uid": { ".read": "auth != null", ".write": false } };
rules.e2eeSigners = { ".read": "auth != null", ".write": false };
rules.e2eeGroups = { "$groupId": { ".read": `(auth != null && root.child('e2eeGroups').child($groupId).child('members').child(auth.uid).exists()) || (${migratingOwner})`, ".write": false } };
rules.e2eeDeviceRequests = { "$uid": { ".read": own, ".write": false } };
rules.e2eeJoinRequests = { "$groupId": { ".read": owner, "$uid": { ".read": own }, ".write": false } };
rules.e2eeGroupLocks = { "$groupId": { ".read": member, ".write": false } };
rules.e2eeDepartures = { "$groupId": { ".read": "auth != null && root.child('e2eeGroups').child($groupId).child('members').child(auth.uid).exists()", ".write": false } };
rules.e2eePendingGroups = { "$uid": { ".read": own, ".write": false } };
rules.e2eeMigrationGroups = { "$uid": { ".read": own, ".write": false } };
rules.e2eeMigrations = { user: { "$uid": { ".read": own, ".write": false } }, group: { "$groupId": { ".read": "auth != null && (data.child('ownerId').val() == auth.uid || root.child('groupMembers').child($groupId).child(auth.uid).exists())", ".write": false } } };
writeFileSync("firebase.rules.json", JSON.stringify({ rules }) + "\n");
console.log("Generated encryption rules from the shared collection policies.");
