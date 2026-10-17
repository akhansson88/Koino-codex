import { createHash } from 'node:crypto';

export const cutoverId = 'encrypted-only-2026-10-17';
export const generation = 1;
export const legacyGroupRoots = ['groups','groupMembers','userGroups','inviteCodes','posts','replies','checkIns','prayerReactions','postReactions','groupBiblePlanAnnouncements','groupBiblePlanParticipation','discussionFollowers','groupBiblePlans','groupBiblePlanProgress','commentReactions'];
export const sharedRoots = ['posts','replies','checkIns','prayerReactions','postReactions','groupBiblePlanAnnouncements','groupBiblePlanParticipation','discussionFollowers','userDiscussionFollows','prayerNotifications','activityNotifications','groupBiblePlanParticipantIds'];
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const entries = value => Object.entries(value ?? {});
function keptState(root, ids) {
  const data = root.encryptedData ?? {};
  return {
    accounts: root.e2eeAccounts ?? null, signers: root.e2eeSigners ?? null,
    authority: Object.fromEntries(ids.map(id => [id, root.e2eeGroups[id]])),
    groups: Object.fromEntries(ids.map(id => [id, data.groups?.[id] ?? null])),
    members: Object.fromEntries(ids.map(id => [id, data.groupMembers?.[id] ?? null])),
    memberships: Object.fromEntries(entries(data.userGroups).map(([uid, groups]) => [uid, Object.fromEntries(entries(groups).filter(([id]) => ids.includes(id)))]).filter(([,groups]) => Object.keys(groups).length)),
    invites: Object.fromEntries(entries(data.inviteCodes).filter(([,v]) => ids.includes(v.groupId))),
    profiles: [root,data].map(store => Object.fromEntries(entries(store.profiles).map(([uid,profile]) => [uid,Object.fromEntries(entries(profile).filter(([field]) => field !== 'currentGroupId'))]).filter(([,profile]) => Object.keys(profile).length))),
    plans: [root,data].map(store => Object.fromEntries(entries(store.biblePlans).map(([uid,plans]) => [uid,Object.fromEntries(entries(plans).filter(([,plan]) => !plan.announcementId && !plan.groupId))]).filter(([,plans]) => Object.keys(plans).length))),
    personal: Object.fromEntries(['journalEntries','privateCheckIns','prayerSessions','savedVerses','bibleHighlights','bibleHighlightColors','bibleHighlightColorSettings','bibleReaderPreferences','notificationPreferences','pushTokens','supportIntents','privateBiblePlans','privateBiblePlanProgress'].map(name => [name, { legacy: root[name] ?? null, encrypted: data[name] ?? null }])),
  };
}
export function planCleanup(source) {
  const root = structuredClone(source ?? {}), data = root.encryptedData ??= {};
  const ids = Object.keys(root.e2eeGroups ?? {}).sort();
  for (const id of ids) {
    const authority = root.e2eeGroups[id], group = data.groups?.[id];
    if (authority.id !== id || !authority.members?.[authority.ownerId] || !group || group.id !== id || group.ownerId !== authority.ownerId) throw new Error(`Inconsistent encrypted group authority: ${id}`);
  }
  for (const id of Object.keys(data.groups ?? {})) if (!ids.includes(id)) throw new Error(`Encrypted group missing authority: ${id}`);
  const before = hash(keptState(root, ids));
  const changes = [];
  const remove = (path) => {
    const p = path.split('/'); let node = root;
    for (const segment of p.slice(0,-1)) { node = node?.[segment]; if (!node) return; }
    if (node[p.at(-1)] !== undefined) { changes.push({ path, children: typeof node[p.at(-1)] === 'object' && node[p.at(-1)] ? Object.keys(node[p.at(-1)]).length : 1 }); delete node[p.at(-1)]; }
  };
  if (root.e2eePolicy?.cutoverId === cutoverId && root.e2eePolicy.cleanupComplete) return { root, ids, changes, preservedHash: before };
  for (const collection of legacyGroupRoots) remove(collection);
  for (const collection of sharedRoots) { remove(collection); remove(`encryptedData/${collection}`); }
  remove('encryptedData/legacyGroupArchives');
  remove('pendingNotificationBundles'); remove('pendingExpoPushReceipts');
  for (const [uid, archives] of entries(data.legacyUserArchives)) if (archives.pendingNotificationBundles) remove(`encryptedData/legacyUserArchives/${uid}/pendingNotificationBundles`);
  for (const prefix of ['', 'encryptedData/']) {
    const store = prefix ? data : root;
    for (const [uid, groups] of entries(store.checkInDailyClaims)) for (const [id, days] of entries(groups)) for (const [day, claim] of entries(days)) if (claim.visibility !== 'private') remove(`${prefix}checkInDailyClaims/${uid}/${id}/${day}`);
    for (const [uid, plans] of entries(store.biblePlans)) for (const [id, plan] of entries(plans)) if (plan.groupId || plan.announcementId) remove(`${prefix}biblePlans/${uid}/${id}`);
    for (const [uid, profile] of entries(store.profiles)) if (profile.currentGroupId && !ids.includes(profile.currentGroupId)) remove(`${prefix}profiles/${uid}/currentGroupId`);
  }
  for (const [uid, groups] of entries(data.userGroups)) for (const [id] of entries(groups)) if (!ids.includes(id)) remove(`encryptedData/userGroups/${uid}/${id}`);
  for (const [id] of entries(data.groupMembers)) if (!ids.includes(id)) remove(`encryptedData/groupMembers/${id}`);
  for (const [code, invite] of entries(data.inviteCodes)) if (!ids.includes(invite.groupId)) remove(`encryptedData/inviteCodes/${code}`);
  // This collection was written only by legacy member migration, even when
  // the destination group has since become encrypted. New joins use requests.
  remove('e2eePendingGroups');
  for (const [id] of entries(root.e2eeJoinRequests)) if (!ids.includes(id)) remove(`e2eeJoinRequests/${id}`);
  remove('e2eeMigrationGroups');
  for (const [id] of entries(root.e2eeMigrations?.group)) { if (!ids.includes(id)) remove(`e2eeMigrations/group/${id}`); else remove(`e2eeMigrations/group/${id}/importedEventIds`); }
  for (const [id] of entries(root.e2eeImageObjects?.['room-images'])) if (!ids.includes(id)) remove(`e2eeImageObjects/room-images/${id}`);
  if (hash(keptState(root, ids)) !== before) throw new Error('Cleanup changed protected account, group or personal data.');
  return { root, ids, changes, preservedHash: before };
}
