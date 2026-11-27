import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

// KOINO stores plaintext records under encryptedData/. Rules keep each
// account's records private and each community's records member-only. The path
// segment is historical; no client-side keys are involved.
const bundle = buildSync({ entryPoints: ["state/encryption/schema.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { policies } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const rules = JSON.parse(readFileSync("firebase.legacy.rules.json", "utf8")).rules;
const own = "auth != null && auth.uid == $uid";
const member = "auth != null && root.child('e2eeGroups').child($groupId).child('members').child(auth.uid).exists() && !root.child('e2eeDepartures').child($groupId).child(auth.uid).exists()";
const owner = `${member} && root.child('e2eeGroups').child($groupId).child('ownerId').val() == auth.uid`;
const writableMember = `${member} && !root.child('e2eeGroupLocks').child($groupId).exists()`;

// Legacy top-level collections stay closed once a project has been cut over.
const legacyGroupCollections = ["groups", "groupMembers", "userGroups", "inviteCodes", "posts", "checkIns", "replies", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupBiblePlanParticipation", "discussionFollowers"];
function closeLegacy(node, closeReads = true) {
  for (const [key, value] of Object.entries(node)) {
    if (key === ".write" || key === ".read" && closeReads) node[key] = `(${value}) && root.child('e2eePolicy').child('encryptedGroupsOnly').val() != true`;
    else if (value && typeof value === "object") closeLegacy(value, closeReads);
  }
}
for (const collection of legacyGroupCollections) closeLegacy(rules[collection]);
for (const collection of ["prayerNotifications", "activityNotifications", "userDiscussionFollows", "groupBiblePlanParticipantIds"]) closeLegacy(rules[collection], false);
const legacyPlan = rules.biblePlans.$uid.$planId;
legacyPlan[".write"] = `(${legacyPlan[".write"]}) && (root.child('e2eePolicy').child('encryptedGroupsOnly').val() != true || (!newData.hasChild('announcementId') && !newData.hasChild('groupId')))`;

// Account and community content is ordinary JSON. Access is decided at the
// record root; nested fields only have to be plain RTDB values.
const plaintext = { ".validate": "newData.val() == null || newData.isString() || newData.isNumber() || newData.isBoolean() || newData.hasChildren()" };
const store = { ".read": false, ".write": false };
for (const [collection, p] of Object.entries(policies)) {
  const vars = collection === "groups" ? ["$groupId"] : collection === "profiles" ? ["$uid"] :
    collection === "groupMembers" ? ["$groupId", "$uid"] : collection === "userGroups" ? ["$uid", "$groupId"] :
    collection === "groupBiblePlanParticipation" ? ["$groupId", "$announcementId", "$uid"] :
    collection === "eventRsvps" ? ["$groupId", "$eventId", "$uid"] :
    collection === "discussionFollowers" ? ["$groupId", "$targetType", "$targetId", "$uid"] :
    collection === "userDiscussionFollows" ? ["$uid", "$groupId", "$id"] :
    collection === "checkInDailyClaims" ? ["$uid", "$groupId", "$dayKey"] :
    p.scope === "group" ? ["$groupId", "$id"] : collection === "inviteCodes" ? ["$code"] : p.depth === 2 ? ["$uid"] : ["$uid", "$id"];
  const shared = p.scope === "group" || p.scope === "membership" || collection === "discussionFollowers";
  const read = shared && collection !== "userGroups" ? member : collection === "inviteCodes" ? "auth != null" : own;
  let write = shared ? `${writableMember} && ((!newData.exists() && (data.child('userId').val() == auth.uid || root.child('e2eeGroups').child($groupId).child('ownerId').val() == auth.uid)) || (newData.exists() && newData.child('userId').val() == auth.uid && (!data.exists() || data.child('userId').val() == auth.uid)))` : own;
  if (["posts", "checkIns", "replies", "prayerReactions", "postReactions"].includes(collection)) {
    // Cross-author removal must go through the audited backend operation.
    write = `${writableMember} && ((!newData.exists() && data.child('userId').val() == auth.uid) || (newData.exists() && newData.child('userId').val() == auth.uid && (!data.exists() || data.child('userId').val() == auth.uid)))`;
  }
  if (collection === "groups") write = `${owner} && data.exists() && newData.exists() && newData.child('id').val() == data.child('id').val() && newData.child('ownerId').val() == data.child('ownerId').val() && newData.child('inviteCode').val() == data.child('inviteCode').val()`;
  if (["groupMembers", "userGroups"].includes(collection)) write = `${writableMember} && auth.uid == $uid && data.exists() && newData.exists() && newData.child('userId').val() == data.child('userId').val() && newData.child('groupId').val() == data.child('groupId').val() && newData.child('role').val() == data.child('role').val()`;
  if (collection === "inviteCodes") write = "false";
  if (collection === "pushDeliveryDiagnostics") write = "false";
  if (collection === "activityNotifications") write = `${own} && root.child('e2eePolicy').child('sharedWritesFrozen').val() != true`;
  if (collection === "prayerNotifications") write = `auth != null && ((!newData.exists() && auth.uid == $uid) || (newData.exists() && newData.child('userId').val() == auth.uid && root.child('e2eeGroups').child(newData.child('groupId').val()).child('members').child(auth.uid).exists() && root.child('e2eeGroups').child(newData.child('groupId').val()).child('members').child($uid).exists()))`;
  if (collection === "discussionFollowers") write = `${writableMember} && auth.uid == $uid && (!newData.exists() || newData.child('userId').val() == auth.uid)`;
  if (collection === "groupBiblePlanAnnouncements") write = owner;
  if (collection === "groupBiblePlanParticipation") write = `${writableMember} && ((!newData.exists() && data.child('userId').val() == auth.uid) || (newData.child('userId').val() == auth.uid && (!data.exists() || data.child('userId').val() == auth.uid || root.child('encryptedData').child('groupBiblePlanParticipantIds').child(auth.uid).child($announcementId).val() == $uid)))`;
  if (collection === "eventRsvps") write = `${writableMember} && auth.uid == $uid && (!newData.exists() || (newData.child('userId').val() == auth.uid && newData.child('eventId').val() == $eventId && newData.child('groupId').val() == $groupId && root.child('encryptedData').child('groupEvents').child($groupId).child($eventId).exists()))`;
  if (collection === "groupEvents") write = `${writableMember} && ((!newData.exists() && (data.child('userId').val() == auth.uid || root.child('e2eeGroups').child($groupId).child('ownerId').val() == auth.uid)) || (newData.exists() && newData.child('id').val() == $id && newData.child('userId').val() == auth.uid && newData.child('groupId').val() == $groupId && (!data.exists() || (data.child('userId').val() == auth.uid && data.child('groupId').val() == $groupId))))`;
  // Cross-author cascade removal in the same update as the author's parent.
  const newRoot = "newData.parent().parent().parent().parent()";
  const removedParent = (type, targetId) => {
    const name = { post: "posts", check_in: "checkIns", reply: "replies" }[type];
    const parent = `root.child('encryptedData').child('${name}').child($groupId).child(${targetId})`;
    const removed = `!${newRoot}.child('encryptedData').child('${name}').child($groupId).child(${targetId}).exists()`;
    return `(${parent}.child('userId').val() == auth.uid && ${removed})`;
  };
  const parentId = "data.child('targetId').val()";
  let cascade = ["post", "check_in"].map(type => `(data.child('targetType').val() == '${type}' && ${removedParent(type, parentId)})`).join(" || ");
  if (collection === "prayerReactions") {
    const reply = `root.child('encryptedData').child('replies').child($groupId).child(${parentId})`;
    const parentCascade = ["post", "check_in"].map(type => `(${reply}.child('targetType').val() == '${type}' && ${removedParent(type, `${reply}.child('targetId').val()`)})`).join(" || ");
    cascade += ` || (data.child('targetType').val() == 'reply' && (${removedParent("reply", parentId)} || (${parentCascade})))`;
  }
  if (["replies", "prayerReactions", "postReactions"].includes(collection)) {
    write = `(${write}) || (${writableMember} && !newData.exists() && (${cascade}))`;
  }
  const moderatedTypes = { posts: "post", checkIns: "check_in", replies: "reply" };
  if (moderatedTypes[collection]) {
    write = `(${write}) && (!newData.exists() || !root.child('moderationTombstones').child($groupId).child('${moderatedTypes[collection]}').child($id).exists())`;
    write = `(${write}) && (!data.exists() || !newData.exists() || data.child('userId').val() == auth.uid)`;
    write = `(${write}) && (newData.exists() || data.child('userId').val() == auth.uid${collection === "replies" ? ` || (${cascade})` : ""})`;
  }
  if (["replies", "prayerReactions", "postReactions"].includes(collection)) {
    const types = collection === "prayerReactions" ? ["post", "check_in", "reply"] : ["post", "check_in"];
    const parents = { post: "posts", check_in: "checkIns", reply: "replies" };
    const liveParent = types.map(type => `(newData.child('targetType').val() == '${type}' && root.child('encryptedData').child('${parents[type]}').child($groupId).child(newData.child('targetId').val()).exists() && !root.child('moderationTombstones').child($groupId).child('${type}').child(newData.child('targetId').val()).exists())`).join(" || ");
    write = `(${write}) && (!newData.exists() || ((${liveParent}) && (!data.exists() || (newData.child('targetType').val() == data.child('targetType').val() && newData.child('targetId').val() == data.child('targetId').val()))))`;
  }
  if (collection === "discussionFollowers") write = `(${write}) && (!newData.exists() || !root.child('moderationTombstones').child($groupId).child($targetType).child($targetId).exists())`;
  if (collection === "userDiscussionFollows") write = `(${write}) && (!newData.exists() || !root.child('moderationTombstones').child($groupId).child(newData.child('targetType').val()).child(newData.child('targetId').val()).exists())`;
  if (collection === "checkIns") write = `(${write}) && (!newData.exists() || ((data.exists() || newData.child('dayKey').isString()) && (!newData.hasChild('dayKey') || !root.child('moderatedCheckInDays').child(auth.uid).child($groupId).child(newData.child('dayKey').val()).exists())))`;
  if (collection === "privateCheckIns") write = `(${write}) && (!newData.exists() || ((data.exists() || newData.child('dayKey').isString()) && (!newData.hasChild('dayKey') || !root.child('moderatedCheckInDays').child($uid).child(newData.child('groupId').val()).child(newData.child('dayKey').val()).exists())))`;
  if (collection === "checkInDailyClaims") write = `(${write}) && !root.child('moderatedCheckInDays').child($uid).child($groupId).child($dayKey).exists() && !newData.hasChild('moderated')`;
  const target = {};
  let node = target;
  for (let index = 0; index < vars.length; index++) {
    node[vars[index]] = {}; node = node[vars[index]];
    if (index === 0 && vars[index] !== "$code") node[".read"] = collection === "userGroups" ? own : read;
  }
  node[".read"] = read; node[".write"] = write;
  if (p.depth >= 3 && !["checkInDailyClaims", "discussionFollowers", "groupBiblePlanParticipantIds", "eventRsvps"].includes(collection)) {
    let parent = target;
    for (const variable of vars.slice(0, -1)) parent = parent[variable];
    const indexes = ["createdAt", "targetId", "readAt"];
    if (["posts", "checkIns", "replies", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupEvents"].includes(collection)) indexes.push("userId");
    if (collection === "activityNotifications") indexes.push("actorUserId");
    if (collection === "prayerNotifications") indexes.push("userId");
    parent[".indexOn"] = indexes;
  }
  if (p.scope === "routing") {
    if (collection === "groupBiblePlanParticipantIds") node[".validate"] = "newData.isString() && newData.val().length <= 160";
    else {
      for (const field of p.metadata) node[field] = { ".validate": field === "mentionUserIds" ? "newData.hasChildren()" : field === "role" && ["groupMembers", "userGroups"].includes(collection) ? "newData.isString() && (newData.val() == 'owner' || newData.val() == 'leader' || newData.val() == 'member')" : "newData.isString() || newData.isNumber() || newData.isBoolean()" };
      node.$other = plaintext;
    }
  } else {
    for (const field of p.metadata) node[field] = { ".validate": field === "mentionUserIds" ? "newData.hasChildren()" : field === "role" && ["groupMembers", "userGroups"].includes(collection) ? "newData.isString() && (newData.val() == 'owner' || newData.val() == 'leader' || newData.val() == 'member')" : "newData.isString() || newData.isNumber() || newData.isBoolean()" };
    node.$field = plaintext;
  }
  if (["groupMembers", "userGroups"].includes(collection)) {
    node.role = { ".validate": "newData.isString() && (newData.val() == 'owner' || newData.val() == 'leader' || newData.val() == 'member')" };
  }
  if (collection === "activityNotifications") node.readAt = { ".write": own, ".validate": "newData.isString()" };
  if (collection === "prayerNotifications") node.readAt = { ".write": own, ".validate": "newData.isString()" };
  store[collection] = target;
}
// A shared fast is readable by the whole community, but only its host can
// publish or edit it. Each participant may add or remove only their own entry,
// and only before the fast begins (joinCutoffMs). The owner of the community may
// remove any shared fast for moderation.
const groupFastNode = store.groupFasts.$groupId.$id;
groupFastNode[".write"] = `${writableMember} && ((!newData.exists() && (data.child('userId').val() == auth.uid || root.child('e2eeGroups').child($groupId).child('ownerId').val() == auth.uid)) || (newData.exists() && newData.child('userId').val() == auth.uid && newData.child('groupId').val() == $groupId && newData.child('id').val() == $id && root.child('encryptedData').child('fasts').child(auth.uid).child($id).exists() && (!data.exists() || data.child('userId').val() == auth.uid)))`;
groupFastNode.participants = {
  "$uid": {
    ".write": `${member} && auth.uid == $uid && (!newData.exists() || (now < data.parent().parent().child('joinCutoffMs').val() && newData.child('userId').val() == $uid && newData.child('joinedAt').isString() && newData.child('personalFastId').isString()))`,
    ".validate": "newData.hasChildren(['userId','joinedAt','personalFastId']) && newData.child('userId').val() == $uid",
  },
};
store.groupFasts.$groupId[".indexOn"] = ["startAt"];
rules.encryptedData = store;
rules.legacyUndecryptable = { "$uid": { ".read": own, ".write": own, "$collection": { "$id": plaintext } } };
rules.moderationTombstones = { "$groupId": { ".read": member, ".write": false } };
rules.moderationActions = { "$groupId": { ".read": owner, ".write": false } };
rules.moderatedCheckInDays = { "$uid": { ".read": own, ".write": false } };
rules.e2eePolicy = { ".read": "auth != null", ".write": false };
// Public key material and wrapped grants only. Kept so an existing device can
// authenticate records while it converts them to plaintext.
rules.e2eeAccounts = { "$uid": { ".read": "auth != null", ".write": false } };
rules.e2eeGroups = { "$groupId": { ".read": member, ".write": false } };
rules.e2eeJoinRequests = { "$groupId": { ".read": owner, "$uid": { ".read": own }, ".write": false } };
rules.e2eeJoinRequestStatuses = { "$uid": { ".read": own, ".write": false, "$groupId": { ".read": own, ".write": false } } };
rules.e2eeDepartures = { "$groupId": { ".read": member, ".write": false } };
rules.e2eeGroupLocks = { "$groupId": { ".read": member, ".write": false } };
// Live presence is one short-lived session record per device. Members may read
// their community's presence; a device may only write its own member record.
// The server clears the online state through onDisconnect, so no client polling
// or background heartbeats are required.
rules.presence = {
  "$groupId": {
    ".read": member,
    "$uid": {
      ".write": `${member} && auth.uid == $uid`,
      "sessions": {
        "$deviceId": {
          ".validate": "newData.val() == null || (newData.child('state').isString() && (newData.child('state').val() == 'online' || newData.child('state').val() == 'away' || newData.child('state').val() == 'offline' || newData.child('state').val() == 'hidden') && newData.child('at').isNumber() && (!newData.child('platform').exists() || newData.child('platform').isString()))",
        },
      },
    },
  },
};
// Server-only deletion state. Clients never read or write these nodes.
rules.accountDeletionJobs = { "$uid": { ".read": false, ".write": false } };
rules.accountDeletionLedger = { "$hash": { ".read": false, ".write": false } };
// Admin-only push receipts. The index lets the deletion service find a
// recipient's pending receipts without scanning the whole node.
rules.pendingExpoPushReceipts = { ".read": false, ".write": false, ".indexOn": "recipientUserId" };
writeFileSync("firebase.rules.json", JSON.stringify({ rules }) + "\n");
console.log("Generated plaintext community rules from the shared collection policies.");
