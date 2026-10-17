import assert from 'node:assert/strict';
import {planCleanup,cutoverId} from './encrypted-only-cleanup.mjs';
const source = {
  groups:{old:{ownerId:'owner'}},groupMembers:{old:{owner:{}}},userGroups:{owner:{old:{}}},inviteCodes:{OLD:{groupId:'old'}},
  e2eeAccounts:{owner:{recovery:'protected'}},e2eeSigners:{device:{active:true}},
  e2eeGroups:{keep:{id:'keep',ownerId:'owner',members:{owner:{}},grants:{owner:'protected'}}},
  e2eePendingGroups:{owner:{old:{},keep:{inviteCode:'KEEP'}}},e2eeMigrationGroups:{owner:{old:true}},
  e2eeMigrations:{group:{old:{status:'copying'},keep:{status:'complete',importedEventIds:{reply:true}}}},
  encryptedData:{groups:{keep:{id:'keep',ownerId:'owner',name:{ciphertext:'protected'}}},groupMembers:{keep:{owner:{role:'owner'}}},userGroups:{owner:{keep:{role:'owner'},old:{role:'member'}}},inviteCodes:{KEEP:{groupId:'keep'}},
    profiles:{owner:{name:{ciphertext:'private'},currentGroupId:'old'}},journalEntries:{owner:{j:{body:'private'}}},privateCheckIns:{owner:{private:{body:'private'}}},
    posts:{keep:{post:{body:{ciphertext:'old'}}}},replies:{keep:{reply:{}}},legacyGroupArchives:{keep:{archive:{}}},
    biblePlans:{owner:{personal:{title:'private'},shared:{announcementId:'announcement',title:'shared'}}},
    checkInDailyClaims:{owner:{keep:{private:{visibility:'private'},shared:{visibility:'group'}}}},
    activityNotifications:{owner:{notice:{groupId:'keep'}}},legacyUserArchives:{owner:{privateBiblePlans:{content:'private'},pendingNotificationBundles:{content:'shared'}}}}
};
const original=structuredClone(source), result=planCleanup(source);
assert.deepEqual(source,original,'dry run must not mutate its input');
assert.deepEqual(result.ids,['keep']);
assert.equal(result.root.groups,undefined);
assert.equal(result.root.encryptedData.posts,undefined);
assert.equal(result.root.encryptedData.legacyGroupArchives,undefined);
assert.deepEqual(result.root.e2eeAccounts,source.e2eeAccounts);
assert.deepEqual(result.root.encryptedData.groups,source.encryptedData.groups);
assert.deepEqual(result.root.encryptedData.groupMembers,source.encryptedData.groupMembers);
assert.deepEqual(result.root.encryptedData.journalEntries,source.encryptedData.journalEntries);
assert.deepEqual(result.root.encryptedData.biblePlans.owner,{personal:source.encryptedData.biblePlans.owner.personal});
assert.deepEqual(result.root.encryptedData.checkInDailyClaims.owner.keep,{private:{visibility:'private'}});
assert.equal(result.root.encryptedData.profiles.owner.currentGroupId,undefined);
assert.deepEqual(result.root.e2eePendingGroups.owner,{keep:{inviteCode:'KEEP'}});
assert.deepEqual(planCleanup(result.root).changes,[],'interrupted cleanup resumes without additional deletions');
result.root.e2eePolicy={cutoverId,cleanupComplete:true};
result.root.encryptedData.posts={keep:{fresh:{body:'new'}}};
assert.deepEqual(planCleanup(result.root).changes,[],'completed cleanup must never delete new conversations on retry');
const broken=structuredClone(source); delete broken.e2eeGroups.keep;
assert.throws(()=>planCleanup(broken),/missing authority/);
broken.e2eeGroups=source.e2eeGroups; broken.encryptedData.groups.keep.ownerId='intruder';
assert.throws(()=>planCleanup(broken),/Inconsistent/);
console.log('Encrypted-only cleanup checks passed: legacy removal, shared reset, protected keys and personal data, mixed plans/claims, authority checks, and idempotence.');
