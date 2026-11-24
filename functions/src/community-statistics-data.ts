import { getDatabase, type DataSnapshot } from "firebase-admin/database";
import { adminApp } from "./firebase-admin";
import {
  buildGroupStatistics,
  type GroupStatisticsDays,
  type GroupStatisticsPayload,
} from "./community-statistics";

function values(snapshot: DataSnapshot) {
  return (snapshot.val() ?? {}) as Record<string, any>;
}

export async function loadGroupStatistics(
  group: Record<string, any>,
  groupId: string,
  days: GroupStatisticsDays,
): Promise<GroupStatisticsPayload> {
  const database = getDatabase(adminApp);
  const [
    members,
    checkIns,
    posts,
    replies,
    prayerReactions,
    announcements,
    participations,
  ] = await Promise.all([
    database.ref(`encryptedData/groupMembers/${groupId}`).get(),
    database.ref(`encryptedData/checkIns/${groupId}`).get(),
    database.ref(`encryptedData/posts/${groupId}`).get(),
    database.ref(`encryptedData/replies/${groupId}`).get(),
    database.ref(`encryptedData/prayerReactions/${groupId}`).get(),
    database.ref(`encryptedData/groupBiblePlanAnnouncements/${groupId}`).get(),
    database.ref(`encryptedData/groupBiblePlanParticipation/${groupId}`).get(),
  ]);

  return buildGroupStatistics({
    group,
    members: values(members),
    checkIns: values(checkIns),
    posts: values(posts),
    replies: values(replies),
    prayerReactions: values(prayerReactions),
    announcements: values(announcements),
    participations: values(participations),
    days,
  });
}
