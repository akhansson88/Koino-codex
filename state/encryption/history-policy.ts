// This generation prevents pre-reset queued writes from recreating shared history.
export const sharedHistoryCollections = ["posts", "replies", "checkIns", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupBiblePlanParticipation", "discussionFollowers", "userDiscussionFollows", "prayerNotifications", "activityNotifications", "checkInDailyClaims"];
export type HistoryPolicy = { encryptedGroupsOnly?: boolean; historyGeneration?: number; sharedWritesFrozen?: boolean };
export function historyRecord(path: string) {
  const p = path.split("/").filter(Boolean);
  return sharedHistoryCollections.includes(p[0]) || p[0] === "biblePlans";
}
