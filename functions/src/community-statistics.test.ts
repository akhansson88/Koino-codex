import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupStatistics, statisticsRangeStart } from "./community-statistics";

const now = new Date("2026-11-24T12:00:00.000Z");

const source = {
  group: {
    ownerId: "a",
    members: {
      a: { role: "owner", joinedAt: "2026-10-01T10:00:00.000Z" },
      b: { role: "leader", joinedAt: "2026-11-20T10:00:00.000Z" },
      c: { role: "member", joinedAt: "2026-11-22T10:00:00.000Z" },
      e: { role: "member", joinedAt: "2026-11-10T10:00:00.000Z" },
    },
  },
  members: {
    a: { userId: "a", userName: "Anna", role: "owner" },
    b: { userId: "b", userName: "Bo", role: "leader" },
    c: { userId: "c", userName: "Cia", role: "member" },
    e: { userId: "e", userName: "Eva", role: "member" },
  },
  checkIns: {
    one: { userId: "a", visibility: "group", mood: 4, readToday: true, createdAt: "2026-11-20T10:00:00.000Z" },
    two: { userId: "c", visibility: "group", mood: 2, readToday: false, createdAt: "2026-11-23T10:00:00.000Z" },
    private: { userId: "e", visibility: "private", mood: 1, readToday: false, createdAt: "2026-11-22T10:00:00.000Z" },
    old: { userId: "b", visibility: "group", mood: 5, readToday: true, createdAt: "2026-11-10T10:00:00.000Z" },
  },
  posts: {
    request: { userId: "b", kind: "prayer_request", createdAt: "2026-11-21T10:00:00.000Z", answeredAt: "2026-11-23T10:00:00.000Z" },
    reflection: { userId: "c", kind: "reflection", createdAt: "2026-11-22T10:00:00.000Z" },
    outsider: { userId: "d", kind: "reflection", createdAt: "2026-11-22T10:00:00.000Z" },
    old: { userId: "a", kind: "update", createdAt: "2026-10-01T10:00:00.000Z" },
  },
  replies: {
    one: { userId: "a", targetType: "post", targetId: "request", createdAt: "2026-11-21T11:00:00.000Z" },
    two: { userId: "b", targetType: "post", targetId: "request", createdAt: "2026-11-21T12:00:00.000Z" },
  },
  prayerReactions: {
    one: { userId: "a", targetType: "post", targetId: "request", createdAt: "2026-11-21T13:00:00.000Z" },
    two: { userId: "b", targetType: "check_in", targetId: "one", createdAt: "2026-11-21T14:00:00.000Z" },
    three: { userId: "c", targetType: "post", targetId: "request", createdAt: "2026-11-22T14:00:00.000Z" },
  },
  announcements: {
    plan: { id: "plan", title: "John in 7 days", startDate: "2026-11-20", dayCount: 7 },
  },
  participations: {
    plan: {
      b: { userId: "b", totalDays: 7, completedDayNumbers: { "1": true, "2": true, "3": true } },
      c: { userId: "c", totalDays: 7, completedDayNumbers: { "1": true } },
      d: { userId: "d", totalDays: 7, completedDayNumbers: { "1": true } },
    },
  },
  now,
  days: 7 as const,
};

test("statistics range starts at local midnight in Stockholm", () => {
  assert.equal(statisticsRangeStart(now.getTime(), 7), Date.parse("2026-11-17T23:00:00.000Z"));
});

test("builds member, activity, prayer and Bible plan statistics from shared activity only", () => {
  const result = buildGroupStatistics(source);

  assert.deepEqual(result.members, { total: 4, leaders: 1, active: 3, joinedInRange: 2 });
  assert.equal(result.checkIns.total, 2);
  assert.equal(result.checkIns.uniqueMembers, 2);
  assert.equal(result.checkIns.rate, 50);
  assert.equal(result.checkIns.readTodayRate, 50);
  assert.equal(result.checkIns.mood.average, 3);
  assert.deepEqual(result.checkIns.mood.distribution, [
    { mood: 1, count: 0 },
    { mood: 2, count: 1 },
    { mood: 3, count: 0 },
    { mood: 4, count: 1 },
    { mood: 5, count: 0 },
  ]);

  assert.equal(result.posts.total, 2);
  assert.equal(result.posts.byKind.prayer_request, 1);
  assert.equal(result.posts.byKind.reflection, 1);
  assert.equal(result.replies.total, 2);
  assert.deepEqual(result.prayers, {
    requests: 1,
    answered: 1,
    answeredRate: 100,
    offered: 3,
    uniqueMembers: 3,
  });

  assert.equal(result.biblePlans.active, 1);
  assert.equal(result.biblePlans.participants, 2);
  assert.equal(result.biblePlans.completionRate, 28.6);
  assert.equal(result.biblePlans.plans[0].title, "John in 7 days");

  assert.equal(result.trend.bucket, "day");
  assert.equal(result.trend.points.length, 7);
  assert.equal(result.trend.points.reduce((total, point) => total + point.checkIns, 0), 2);
  assert.equal(result.trend.points.reduce((total, point) => total + point.posts, 0), 2);

  assert.deepEqual(
    result.memberActivity.map((member) => [member.name, member.role, member.checkIns, member.posts, member.prayers]),
    [
      ["Anna", "owner", 1, 0, 1],
      ["Bo", "leader", 0, 1, 1],
      ["Cia", "member", 1, 1, 1],
      ["Eva", "member", 0, 0, 0],
    ],
  );
  assert.equal(result.memberActivity.find((member) => member.userId === "e")?.lastActiveAt, null);
  assert.equal(result.truncated, false);
});

test("returns an empty but complete payload for a community without activity", () => {
  const result = buildGroupStatistics({
    group: { ownerId: "a", members: { a: { role: "owner" } } },
    members: { a: { userId: "a", userName: "Anna", role: "owner" } },
    checkIns: {},
    posts: {},
    replies: {},
    prayerReactions: {},
    announcements: {},
    participations: {},
    now,
    days: 30,
  });

  assert.equal(result.members.total, 1);
  assert.equal(result.members.active, 0);
  assert.equal(result.checkIns.rate, 0);
  assert.equal(result.checkIns.mood.average, null);
  assert.equal(result.biblePlans.active, 0);
  assert.equal(result.trend.bucket, "week");
  assert.ok(result.trend.points.length > 0);
  assert.equal(result.memberActivity.length, 1);
});

test("passes the truncation flag through", () => {
  const result = buildGroupStatistics({ ...source, truncated: true });
  assert.equal(result.truncated, true);
});
