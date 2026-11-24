import { communityRole, type CommunityRole } from "./community-roles";

export type GroupStatisticsDays = 7 | 30 | 90;

type RawRecord = Record<string, any>;

type StatisticsGroup = {
  ownerId?: unknown;
  members?: Record<string, { role?: unknown; joinedAt?: unknown }>;
};

type StatisticsMember = {
  userId?: unknown;
  userName?: unknown;
  role?: unknown;
  createdAt?: unknown;
};

type StatisticsSource = {
  group: StatisticsGroup;
  members: Record<string, StatisticsMember>;
  checkIns: Record<string, RawRecord>;
  posts: Record<string, RawRecord>;
  replies: Record<string, RawRecord>;
  prayerReactions: Record<string, RawRecord>;
  announcements: Record<string, RawRecord>;
  participations: Record<string, Record<string, RawRecord>>;
  now?: Date;
  days: GroupStatisticsDays;
  truncated?: boolean;
};

export type GroupStatisticsPayload = {
  version: number;
  generatedAt: string;
  range: { days: GroupStatisticsDays; from: string; to: string; timeZone: string };
  members: { total: number; leaders: number; active: number; joinedInRange: number };
  checkIns: {
    total: number;
    uniqueMembers: number;
    rate: number;
    readTodayRate: number;
    mood: { average: number | null; distribution: { mood: number; count: number }[] };
  };
  posts: { total: number; uniqueAuthors: number; byKind: Record<string, number> };
  replies: { total: number; uniqueAuthors: number };
  prayers: { requests: number; answered: number; answeredRate: number; offered: number; uniqueMembers: number };
  biblePlans: {
    active: number;
    participants: number;
    completionRate: number;
    plans: { id: string; title: string; participants: number; completionRate: number }[];
  };
  trend: {
    bucket: "day" | "week";
    points: { start: string; checkIns: number; posts: number; replies: number; prayers: number }[];
  };
  memberActivity: {
    userId: string;
    name: string;
    role: CommunityRole;
    lastActiveAt: string | null;
    checkIns: number;
    posts: number;
    replies: number;
    prayers: number;
  }[];
  truncated: boolean;
};

const timeZone = "Europe/Stockholm";
const dayMilliseconds = 86400000;
const dayPartsFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone,
  year: "numeric",
});
const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone,
  timeZoneName: "longOffset",
});

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateParts(milliseconds: number) {
  const parts = dayPartsFormatter.formatToParts(new Date(milliseconds));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { day: part("day"), month: part("month"), year: part("year") };
}

function localOffsetMinutes(milliseconds: number) {
  const name = offsetFormatter
    .formatToParts(new Date(milliseconds))
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

function startOfLocalDay(milliseconds: number) {
  const { day, month, year } = localDateParts(milliseconds);
  const utc = Date.UTC(year, month - 1, day);
  return utc - localOffsetMinutes(utc) * 60000;
}

function addLocalDays(milliseconds: number, amount: number) {
  const { day, month, year } = localDateParts(milliseconds);
  const utc = Date.UTC(year, month - 1, day + amount);
  return utc - localOffsetMinutes(utc) * 60000;
}

function startOfLocalWeek(milliseconds: number) {
  const start = startOfLocalDay(milliseconds);
  const { day, month, year } = localDateParts(start);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addLocalDays(start, weekday === 0 ? -6 : 1 - weekday);
}

function localDayKey(milliseconds: number) {
  const { day, month, year } = localDateParts(milliseconds);
  return `${year}-${pad(month)}-${pad(day)}`;
}

function timestampValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === "object") {
    const seconds = (value as { seconds?: unknown }).seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return seconds * 1000;
    const milliseconds = (value as { milliseconds?: unknown }).milliseconds;
    if (typeof milliseconds === "number" && Number.isFinite(milliseconds)) return milliseconds;
  }
  return undefined;
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function kindOf(record: RawRecord) {
  return typeof record.kind === "string" && record.kind ? record.kind : "post";
}

export function statisticsRangeStart(now: number, days: GroupStatisticsDays) {
  return addLocalDays(startOfLocalDay(now), -(days - 1));
}

export function buildGroupStatistics(source: StatisticsSource): GroupStatisticsPayload {
  const now = source.now ?? new Date();
  const nowMilliseconds = now.getTime();
  const days = source.days;
  const from = statisticsRangeStart(nowMilliseconds, days);
  const group = source.group ?? {};
  const groupMembers = group.members ?? {};
  const ownerId = typeof group.ownerId === "string" ? group.ownerId : undefined;
  const memberIds = new Set(Object.keys(groupMembers));
  if (ownerId) memberIds.add(ownerId);
  const memberIdList = [...memberIds];
  const mirror = source.members ?? {};

  const isMember = (userId: unknown): userId is string =>
    typeof userId === "string" && memberIds.has(userId);
  const inRange = (record: RawRecord | undefined) => {
    const createdAt = timestampValue(record?.createdAt);
    return createdAt !== undefined && createdAt >= from && createdAt <= nowMilliseconds;
  };

  const checkIns = Object.values(source.checkIns ?? {}).filter(
    (record) => record && isMember(record.userId) && record.visibility === "group" && inRange(record),
  );
  const posts = Object.values(source.posts ?? {}).filter(
    (record) => record && isMember(record.userId) && inRange(record),
  );
  const replies = Object.values(source.replies ?? {}).filter(
    (record) => record && isMember(record.userId) && inRange(record),
  );
  const prayerReactions = Object.values(source.prayerReactions ?? {}).filter(
    (record) => record && isMember(record.userId) && inRange(record),
  );

  const counts = new Map<string, { checkIns: number; posts: number; replies: number; prayers: number; last: number | null }>(
    memberIdList.map((userId) => [userId, { checkIns: 0, posts: 0, replies: 0, prayers: 0, last: null }]),
  );
  const bump = (userId: string, field: "checkIns" | "posts" | "replies" | "prayers", createdAt: unknown) => {
    const entry = counts.get(userId);
    if (!entry) return;
    entry[field] += 1;
    const value = timestampValue(createdAt);
    if (value !== undefined && (entry.last === null || value > entry.last)) entry.last = value;
  };
  checkIns.forEach((record) => bump(record.userId, "checkIns", record.createdAt));
  posts.forEach((record) => bump(record.userId, "posts", record.createdAt));
  replies.forEach((record) => bump(record.userId, "replies", record.createdAt));
  prayerReactions.forEach((record) => bump(record.userId, "prayers", record.createdAt));

  const memberActivity = memberIdList
    .map((userId) => {
      const entry = counts.get(userId)!;
      const role = communityRole(group, userId) ?? "member";
      const nameValue = mirror[userId]?.userName;
      return {
        userId,
        name: typeof nameValue === "string" && nameValue.trim() ? nameValue : "KOINO member",
        role,
        lastActiveAt: entry.last === null ? null : new Date(entry.last).toISOString(),
        checkIns: entry.checkIns,
        posts: entry.posts,
        replies: entry.replies,
        prayers: entry.prayers,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "sv") || left.userId.localeCompare(right.userId));

  const activeMembers = memberActivity.filter(
    (member) => member.checkIns + member.posts + member.replies + member.prayers > 0,
  ).length;
  const leaders = memberActivity.filter((member) => member.role === "leader").length;
  const joinedInRange = memberIdList.filter((userId) => {
    const joined = timestampValue(groupMembers[userId]?.joinedAt) ?? timestampValue(mirror[userId]?.createdAt);
    return joined !== undefined && joined >= from && joined <= nowMilliseconds;
  }).length;

  const checkInMembers = new Set(checkIns.map((record) => record.userId)).size;
  const readToday = checkIns.filter((record) => record.readToday === true).length;
  const moods = checkIns
    .map((record) => Number(record.mood))
    .filter((mood) => Number.isFinite(mood) && mood >= 1 && mood <= 5);
  const moodAverage = moods.length > 0
    ? roundOne(moods.reduce((total, mood) => total + mood, 0) / moods.length)
    : null;
  const moodDistribution = [1, 2, 3, 4, 5].map((mood) => ({
    mood,
    count: moods.filter((value) => Math.round(value) === mood).length,
  }));

  const byKind: Record<string, number> = {};
  posts.forEach((record) => {
    const kind = kindOf(record);
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  });
  const prayerRequests = posts.filter((record) => kindOf(record) === "prayer_request");
  const answeredPrayers = prayerRequests.filter((record) => Boolean(record.answeredAt)).length;

  const announcementEntries = Object.entries(source.announcements ?? {});
  const activeAnnouncementEntries = announcementEntries.filter(([, announcement]) => {
    const start = timestampValue(announcement?.startDate) ?? timestampValue(announcement?.createdAt);
    if (start === undefined) return true;
    const dayCount = Math.max(1, Number(announcement?.dayCount) || 1);
    return start + dayCount * dayMilliseconds >= startOfLocalDay(nowMilliseconds);
  });
  const planParticipants = new Set<string>();
  let completedDays = 0;
  let totalDays = 0;
  const plans = activeAnnouncementEntries.map(([announcementId, announcement]) => {
    const participation = source.participations?.[announcementId] ?? {};
    const participants = new Set<string>();
    let planCompleted = 0;
    let planTotal = 0;
    Object.entries(participation).forEach(([userId, record]) => {
      if (!isMember(userId)) return;
      participants.add(userId);
      planParticipants.add(userId);
      const completed = record?.completedDayNumbers && typeof record.completedDayNumbers === "object"
        ? Object.keys(record.completedDayNumbers).length
        : 0;
      const declaredTotal = Number(record?.totalDays) || Number(announcement?.dayCount) || 0;
      planCompleted += declaredTotal > 0 ? Math.min(completed, declaredTotal) : completed;
      planTotal += declaredTotal;
    });
    completedDays += planCompleted;
    totalDays += planTotal;
    return {
      id: announcementId,
      title: typeof announcement?.title === "string" && announcement.title.trim()
        ? announcement.title
        : "Bible plan",
      participants: participants.size,
      completionRate: percentage(planCompleted, planTotal),
    };
  });

  const trendBucket: "day" | "week" = days === 7 ? "day" : "week";
  const step = trendBucket === "day" ? 1 : 7;
  const trendPoints: {
    start: string;
    startMilliseconds: number;
    endMilliseconds: number;
    checkIns: number;
    posts: number;
    replies: number;
    prayers: number;
  }[] = [];
  let cursor = trendBucket === "day" ? startOfLocalDay(from) : startOfLocalWeek(from);
  while (cursor <= nowMilliseconds && trendPoints.length < 20) {
    const next = addLocalDays(cursor, step);
    trendPoints.push({
      start: localDayKey(cursor),
      startMilliseconds: cursor,
      endMilliseconds: next,
      checkIns: 0,
      posts: 0,
      replies: 0,
      prayers: 0,
    });
    cursor = next;
  }
  const addToTrend = (record: RawRecord, field: "checkIns" | "posts" | "replies" | "prayers") => {
    const createdAt = timestampValue(record.createdAt);
    if (createdAt === undefined) return;
    const point = trendPoints.find(
      (candidate) => createdAt >= candidate.startMilliseconds && createdAt < candidate.endMilliseconds,
    );
    if (point) point[field] += 1;
  };
  checkIns.forEach((record) => addToTrend(record, "checkIns"));
  posts.forEach((record) => addToTrend(record, "posts"));
  replies.forEach((record) => addToTrend(record, "replies"));
  prayerReactions.forEach((record) => addToTrend(record, "prayers"));

  return {
    version: 1,
    generatedAt: now.toISOString(),
    range: { days, from: new Date(from).toISOString(), to: now.toISOString(), timeZone },
    members: {
      total: memberIdList.length,
      leaders,
      active: activeMembers,
      joinedInRange,
    },
    checkIns: {
      total: checkIns.length,
      uniqueMembers: checkInMembers,
      rate: percentage(checkInMembers, memberIdList.length),
      readTodayRate: percentage(readToday, checkIns.length),
      mood: { average: moodAverage, distribution: moodDistribution },
    },
    posts: {
      total: posts.length,
      uniqueAuthors: new Set(posts.map((record) => record.userId)).size,
      byKind,
    },
    replies: {
      total: replies.length,
      uniqueAuthors: new Set(replies.map((record) => record.userId)).size,
    },
    prayers: {
      requests: prayerRequests.length,
      answered: answeredPrayers,
      answeredRate: percentage(answeredPrayers, prayerRequests.length),
      offered: prayerReactions.length,
      uniqueMembers: new Set(prayerReactions.map((record) => record.userId)).size,
    },
    biblePlans: {
      active: activeAnnouncementEntries.length,
      participants: planParticipants.size,
      completionRate: percentage(completedDays, totalDays),
      plans,
    },
    trend: {
      bucket: trendBucket,
      points: trendPoints.map(({ start, checkIns: pointCheckIns, posts: pointPosts, replies: pointReplies, prayers: pointPrayers }) => ({
        start,
        checkIns: pointCheckIns,
        posts: pointPosts,
        replies: pointReplies,
        prayers: pointPrayers,
      })),
    },
    memberActivity,
    truncated: Boolean(source.truncated),
  };
}
