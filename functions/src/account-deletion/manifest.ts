// Every top-level Realtime Database collection is classified here. The
// account-deletion coverage test fails when a new collection is added to
// firebase.rules.json without a matching entry. Keep this list in step with
// state/encryption/schema.ts.
export type DeletionRule =
  | { kind: "user"; path: string }
  | { kind: "groupAuthored"; collection: string; cascade?: boolean }
  | { kind: "membership"; path: string }
  | { kind: "recipient"; collection: string; field: string }
  | { kind: "moderation" }
  | { kind: "retained"; reason: "moderation" | "deletion" | "financial" }
  | { kind: "global" };

export const DELETION_MANIFEST: Record<string, DeletionRule> = {
  profiles: { kind: "user", path: "profiles/{uid}" },
  inviteCodes: { kind: "global" },
  groups: { kind: "global" },
  groupMembers: { kind: "membership", path: "groupMembers/{groupId}/{uid}" },
  userGroups: { kind: "membership", path: "userGroups/{uid}" },
  checkIns: { kind: "groupAuthored", collection: "checkIns", cascade: true },
  checkInDailyClaims: { kind: "user", path: "checkInDailyClaims/{uid}" },
  privateCheckIns: { kind: "user", path: "privateCheckIns/{uid}" },
  posts: { kind: "groupAuthored", collection: "posts", cascade: true },
  replies: { kind: "groupAuthored", collection: "replies", cascade: true },
  prayerReactions: { kind: "groupAuthored", collection: "prayerReactions" },
  postReactions: { kind: "groupAuthored", collection: "postReactions" },
  prayerSessions: { kind: "user", path: "prayerSessions/{uid}" },
  prayerNotifications: { kind: "user", path: "prayerNotifications/{uid}" },
  discussionFollowers: { kind: "groupAuthored", collection: "discussionFollowers" },
  userDiscussionFollows: { kind: "user", path: "userDiscussionFollows/{uid}" },
  activityNotifications: { kind: "user", path: "activityNotifications/{uid}" },
  notificationPreferences: { kind: "user", path: "notificationPreferences/{uid}" },
  bibleReaderPreferences: { kind: "user", path: "bibleReaderPreferences/{uid}" },
  pushTokens: { kind: "user", path: "pushTokens/{uid}" },
  journalEntries: { kind: "user", path: "journalEntries/{uid}" },
  fasts: { kind: "user", path: "fasts/{uid}" },
  savedVerses: { kind: "user", path: "savedVerses/{uid}" },
  bookmarkCollections: { kind: "user", path: "bookmarkCollections/{uid}" },
  bibleRibbons: { kind: "user", path: "bibleRibbons/{uid}" },
  bibleHighlights: { kind: "user", path: "bibleHighlights/{uid}" },
  bibleHighlightColors: { kind: "user", path: "bibleHighlightColors/{uid}" },
  bibleHighlightColorSettings: { kind: "user", path: "bibleHighlightColorSettings/{uid}" },
  biblePlans: { kind: "user", path: "biblePlans/{uid}" },
  groupBiblePlanAnnouncements: { kind: "groupAuthored", collection: "groupBiblePlanAnnouncements" },
  groupBiblePlanParticipantIds: { kind: "user", path: "groupBiblePlanParticipantIds/{uid}" },
  groupBiblePlanParticipation: { kind: "groupAuthored", collection: "groupBiblePlanParticipation" },
  groupEvents: { kind: "groupAuthored", collection: "groupEvents", cascade: true },
  eventRsvps: { kind: "groupAuthored", collection: "eventRsvps" },
  groupFasts: { kind: "groupAuthored", collection: "groupFasts" },
  supportIntents: { kind: "user", path: "supportIntents/{uid}" },
  // Container for the plaintext model. Every child collection above has its
  // own entry; the node itself is never deleted wholesale.
  encryptedData: { kind: "global" },
  legacyUserArchives: { kind: "user", path: "legacyUserArchives/{uid}" },
  legacyGroupArchives: { kind: "groupAuthored", collection: "legacyGroupArchives" },
  pushDeliveryDiagnostics: { kind: "user", path: "pushDeliveryDiagnostics/{uid}" },
  legacyUndecryptable: { kind: "user", path: "legacyUndecryptable/{uid}" },
  moderationTombstones: { kind: "retained", reason: "moderation" },
  moderationActions: { kind: "moderation" },
  moderatedCheckInDays: { kind: "user", path: "moderatedCheckInDays/{uid}" },
  e2eePolicy: { kind: "global" },
  e2eeAccounts: { kind: "user", path: "e2eeAccounts/{uid}" },
  // Group records stay unless the owner deletes the community. Membership
  // entries are removed by the membership step.
  e2eeGroups: { kind: "global" },
  e2eeJoinRequests: { kind: "membership", path: "e2eeJoinRequests/{groupId}/{uid}" },
  e2eeJoinRequestStatuses: { kind: "user", path: "e2eeJoinRequestStatuses/{uid}" },
  e2eeDepartures: { kind: "membership", path: "e2eeDepartures/{groupId}/{uid}" },
  presence: { kind: "membership", path: "presence/{groupId}/{uid}" },
  e2eeGroupLocks: { kind: "global" },
  accountDeletionJobs: { kind: "retained", reason: "deletion" },
  accountDeletionLedger: { kind: "retained", reason: "deletion" },
  pendingExpoPushReceipts: { kind: "recipient", collection: "pendingExpoPushReceipts", field: "recipientUserId" },
};

export const USER_COLLECTIONS = Object.entries(DELETION_MANIFEST)
  .filter(([, rule]) => rule.kind === "user")
  .map(([collection, rule]) => ({ collection, path: (rule as Extract<DeletionRule, { kind: "user" }>).path }));

export const GROUP_AUTHORED_COLLECTIONS = Object.entries(DELETION_MANIFEST)
  .filter(([, rule]) => rule.kind === "groupAuthored")
  .map(([collection, rule]) => {
    const definition = rule as Extract<DeletionRule, { kind: "groupAuthored" }>;
    return { collection, cascade: definition.cascade === true };
  });

export const MODERATION_COLLECTIONS = Object.entries(DELETION_MANIFEST)
  .filter(([, rule]) => rule.kind === "moderation")
  .map(([collection]) => collection);
