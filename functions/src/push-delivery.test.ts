import assert from "node:assert/strict";
import test from "node:test";

import { buildCommentPushMessage, buildPrayerPushMessage } from "./notification-messages";
import { activityUnreadCount, isDeviceNotRegistered, preferenceAllows } from "./push-delivery";
import type { Database } from "firebase-admin/database";

test("badge query counts only unread notification children", async () => {
  const calls: string[] = [];
  const database = {
    ref(path: string) {
      calls.push(path);
      return {
        orderByChild(field: string) {
          calls.push(`order:${field}`);
          return {
            equalTo(value: null) {
              calls.push(`equal:${value}`);
              return { get: async () => ({ numChildren: () => 3 }) };
            },
          };
        },
      };
    },
  } as unknown as Database;
  assert.equal(await activityUnreadCount(database, "user-1"), 3);
  assert.deepEqual(calls, ["activityNotifications/user-1", "order:readAt", "equal:null"]);
});

test("global and category preferences independently gate pushes", () => {
  assert.equal(preferenceAllows({}, "ownContent"), true);
  assert.equal(preferenceAllows({ pushEnabled: false }, "mentions"), false);
  assert.equal(preferenceAllows({ mentions: false }, "mentions"), false);
  assert.equal(preferenceAllows({ mentions: false }, "prayerActivity"), true);
  assert.equal(preferenceAllows({ prayerActivity: false }, "prayerActivity"), false);
});

test("comment messages are immediate and preserve deep-link data", () => {
  const base = {
    actorName: "Alex",
    body: "A reply",
    groupId: "group-1",
    label: "post",
    notificationId: "reply-1",
    targetId: "post-1",
    targetType: "post" as const,
    badge: 2,
  };
  const owner = buildCommentPushMessage({ ...base, reason: "owner" });
  const mention = buildCommentPushMessage({ ...base, reason: "mention" });
  const participant = buildCommentPushMessage({ ...base, reason: "participant" });
  assert.equal(owner.title, "Alex commented on your post");
  assert.equal(mention.channelId, "mentions");
  assert.equal(mention.priority, "high");
  assert.equal(participant.title, "New activity on a discussion you joined");
  assert.deepEqual(owner.data, {
    notificationId: "reply-1",
    groupId: "group-1",
    targetType: "post",
    targetId: "post-1",
    bundled: false,
  });
});

test("prayer messages use the prayer channel", () => {
  const message = buildPrayerPushMessage("Sam", "prayer-1");
  assert.equal(message.title, "Sam prayed for you");
  assert.equal(message.channelId, "prayer-activity");
  assert.deepEqual(message.data, { prayerNotificationId: "prayer-1" });
});

test("only DeviceNotRegistered errors authorize token cleanup", () => {
  assert.equal(isDeviceNotRegistered({ error: "DeviceNotRegistered" }), true);
  assert.equal(isDeviceNotRegistered({ error: "InvalidCredentials" }), false);
  assert.equal(isDeviceNotRegistered(), false);
});
