// Only these fields are service-readable. Everything else, including unknown
// future content fields, must be encrypted. Rules use the same allowlist.
export type CollectionPolicy = { depth: number; scope: "user" | "group" | "membership" | "routing"; metadata: readonly string[]; ownerIndex?: number };
const routing = ["id", "userId", "groupId", "ownerId", "recipientUserId", "targetId", "targetType", "createdAt", "updatedAt", "historyGeneration"];
export const policies: Record<string, CollectionPolicy> = {
  profiles: { depth: 2, scope: "user", metadata: ["id", "createdAt", "currentGroupId"] },
  groups: { depth: 2, scope: "group", metadata: ["id", "ownerId", "createdAt", "updatedAt", "inviteCode"] },
  groupMembers: { depth: 3, scope: "group", metadata: ["id", "userId", "groupId", "role", "createdAt"] },
  userGroups: { depth: 3, scope: "membership", metadata: ["id", "userId", "groupId", "role", "createdAt"] },
  inviteCodes: { depth: 2, scope: "routing", metadata: ["groupId", "createdAt"] },
  checkIns: { depth: 3, scope: "group", metadata: [...routing, "dayKey", "visibility"] },
  posts: { depth: 3, scope: "group", metadata: routing },
  replies: { depth: 3, scope: "group", metadata: [...routing, "mentionUserIds"] },
  prayerReactions: { depth: 3, scope: "group", metadata: routing },
  postReactions: { depth: 3, scope: "group", metadata: routing },
  groupBiblePlanAnnouncements: { depth: 3, scope: "group", metadata: routing },
  groupBiblePlanParticipation: { depth: 4, scope: "group", metadata: [...routing, "announcementId", "joinedAt"] },
  journalEntries: { depth: 3, scope: "user", metadata: routing },
  privateCheckIns: { depth: 3, scope: "user", metadata: [...routing, "dayKey", "visibility"] },
  prayerSessions: { depth: 3, scope: "user", metadata: routing },
  prayerNotifications: { depth: 3, scope: "user", metadata: routing },
  activityNotifications: { depth: 3, scope: "routing", metadata: [...routing, "actorUserId", "replyId", "reason", "type", "priority", "bundleKey", "readAt"] },
  savedVerses: { depth: 3, scope: "user", metadata: ["savedAt"] },
  bibleHighlights: { depth: 3, scope: "user", metadata: ["createdAt", "updatedAt"] },
  bibleHighlightColors: { depth: 3, scope: "user", metadata: ["id", "createdAt", "updatedAt"] },
  bibleHighlightColorSettings: { depth: 2, scope: "user", metadata: [] },
  bibleReaderPreferences: { depth: 2, scope: "user", metadata: ["updatedAt"] },
  biblePlans: { depth: 3, scope: "user", metadata: [...routing, "announcementId"] },
  notificationPreferences: { depth: 2, scope: "routing", metadata: ["pushEnabled", "ownContent", "mentions", "followedDiscussions", "prayerActivity"] },
  pushTokens: { depth: 3, scope: "routing", metadata: ["token", "platform", "createdAt", "updatedAt"] },
  checkInDailyClaims: { depth: 4, scope: "routing", metadata: ["dayKey", "checkInId", "visibility", "status", "createdAt", "historyGeneration"] },
  discussionFollowers: { depth: 5, scope: "routing", metadata: ["id", "userId", "targetType", "targetId", "createdAt", "historyGeneration"] },
  userDiscussionFollows: { depth: 4, scope: "routing", metadata: [...routing, "following"] },
  groupBiblePlanParticipantIds: { depth: 3, scope: "routing", metadata: [] },
  supportIntents: { depth: 3, scope: "routing", metadata: [...routing, "amount", "currency", "provider", "providerReference", "status"] },
  legacyUserArchives: { depth: 3, scope: "user", metadata: ["sourceCollection", "createdAt"] },
  legacyGroupArchives: { depth: 3, scope: "group", metadata: ["sourceCollection", "createdAt", "userId"] },
  pushDeliveryDiagnostics: { depth: 3, scope: "routing", metadata: ["stage", "message", "code", "tokenHash", "sourceId", "occurredAt"] },
};
export function policy(path: string) {
  const parts = path.split("/").filter(Boolean);
  const definition = policies[parts[0]];
  if (!definition) throw new Error(`Unsupported encrypted collection: ${parts[0]}`);
  const field = parts[definition.depth];
  const sensitive = parts.length > definition.depth && !definition.metadata.includes(field);
  const scope = definition.scope === "group" ? `group:${parts[1]}` : definition.scope === "membership" ? `group:${parts[2]}` : `user:${parts[1]}`;
  return { definition, parts, sensitive, scope };
}
export function isEnvelope(value: unknown): value is import("./crypto").EncryptedRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) && (value as { v?: unknown }).v === 1 && typeof (value as { ciphertext?: unknown }).ciphertext === "string";
}
