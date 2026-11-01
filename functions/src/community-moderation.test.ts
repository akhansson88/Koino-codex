import test from "node:test";
import assert from "node:assert/strict";
import { moderationReference, removeCommunityContent } from "./community-moderation";
const fixture = (): any => ({
  e2eeGroups: { room: { ownerId: "A", members: { A: true, B: true } } },
  e2eeAccounts: { A: { devices: { phone: { active: true, signingPublicKey: "signer" } } } },
  encryptedData: {
    posts: { room: { post: { userId: "B", kind: "prayer_request", body: { ciphertext: "opaque" } }, keep: { userId: "B" } } },
    checkIns: { room: { checkin: { userId: "B", visibility: "group", dayKey: "2026-10-22", createdAt: "2026-10-22" } } },
    replies: { room: { reply: { userId: "B", targetType: "post", targetId: "post" }, other: { userId: "B", targetType: "post", targetId: "keep" } } },
    prayerReactions: { room: { prayer: { targetType: "reply", targetId: "reply" } } },
    postReactions: { room: { reaction: { targetType: "post", targetId: "post" } } },
    activityNotifications: { B: { n: { groupId: "room", targetType: "post", targetId: "post", replyId: "reply" } } },
    discussionFollowers: { room: { post: { post: { B: true } } } },
    userDiscussionFollows: { B: { room: { follow: { targetType: "post", targetId: "post" } } } },
    checkInDailyClaims: { B: { room: { "2026-10-22": { checkInId: "checkin", visibility: "group", status: "committed" } } } },
    journalEntries: { B: { private: { body: { ciphertext: "private-journal" } } } },
    privateCheckIns: { B: { private: { reflectionText: { ciphertext: "private-checkin" } } } },
    prayerSessions: { B: { private: { ciphertext: "private-prayer" } } },
  },
});
const remove = (root: object, targetType = "post", targetId = "post", uid = "A") => removeCommunityContent(root, uid, "phone", "signer", { groupId: "room", targetType, targetId }, "2026-10-22");
test("post removal atomically plans children, tombstones, references and metadata audit", () => {
  const root = fixture(); const privateBefore = JSON.stringify([root.encryptedData.journalEntries, root.encryptedData.privateCheckIns, root.encryptedData.prayerSessions]);
  remove(root);
  assert.equal(root.encryptedData.posts.room.post, undefined);
  assert.equal(root.encryptedData.replies.room.reply, undefined);
  assert.ok(root.encryptedData.replies.room.other);
  assert.deepEqual(root.encryptedData.prayerReactions.room, {});
  assert.deepEqual(root.encryptedData.postReactions.room, {});
  assert.deepEqual(root.encryptedData.activityNotifications.B, {});
  assert.deepEqual(root.encryptedData.userDiscussionFollows.B.room, {});
  assert.equal(privateBefore, JSON.stringify([root.encryptedData.journalEntries, root.encryptedData.privateCheckIns, root.encryptedData.prayerSessions]));
  assert.ok(!JSON.stringify((root as any).moderationActions).includes("ciphertext"));
  const completed = JSON.stringify(root); remove(root); assert.equal(JSON.stringify(root), completed);
});
test("individual reply removal keeps its parent and other replies", () => {
  const root = fixture(); remove(root, "reply", "reply");
  assert.ok(root.encryptedData.posts.room.post); assert.ok(root.encryptedData.replies.room.other);
  assert.equal(root.encryptedData.replies.room.reply, undefined);
});
test("shared check-in retains the daily claim and every private record", () => {
  const root = fixture(); const privateBefore = JSON.stringify(root.encryptedData.journalEntries);
  remove(root, "check_in", "checkin");
  assert.equal(root.encryptedData.checkIns.room.checkin, undefined);
  assert.equal((root as any).encryptedData.checkInDailyClaims.B.room["2026-10-22"].moderated, true);
  assert.equal((root as any).moderatedCheckInDays.B.room["2026-10-22"], true);
  assert.equal(JSON.stringify(root.encryptedData.journalEntries), privateBefore);
});
test("authorization and target validation reject members, outsiders, private targets and own content", () => {
  for (const uid of ["B", "C"]) assert.throws(() => remove(fixture(), "post", "post", uid), /current community owner/);
  for (const targetType of ["journalEntries", "privateCheckIns", "__proto__"]) assert.throws(() => moderationReference({ groupId: "room", targetType, targetId: "post" }), /Invalid/);
  assert.throws(() => moderationReference({ groupId: "room/other", targetType: "post", targetId: "post" }), /Invalid/);
  const own = fixture(); own.encryptedData.posts.room.post.userId = "A"; assert.throws(() => remove(own), /author deletion/);
});
test("lost ownership, departures, locks and revoked devices cannot moderate", () => {
  const root = fixture(); remove(root);
  root.e2eeGroups.room.ownerId = "B"; assert.throws(() => remove(root), /current community owner/);
  const revoked = fixture(); revoked.e2eeAccounts.A.devices.phone.active = false; assert.throws(() => remove(revoked), /current community owner/);
  const locked = fixture() as any; locked.e2eeGroupLocks = { room: true }; assert.throws(() => remove(locked), /locked/);
});

test("prototype-sensitive Firebase IDs remain removable and create serializable own audit/tombstone entries", () => {
  const beforePrototype = Object.getOwnPropertyDescriptors(Object.prototype);
  const names = ["__proto__", "constructor", "prototype"];
  for (const [index, specialId] of names.entries()) {
    for (const targetType of ["post", "check_in", "reply"] as const) {
      const collection = { post: "posts", check_in: "checkIns", reply: "replies" }[targetType];
      const childId = names[(index + 1) % names.length];
      const target = { userId: specialId, groupId: specialId, visibility: "group", dayKey: "2026-10-22", createdAt: "2026-10-22", body: { ciphertext: "opaque" }, ...(targetType === "reply" ? { targetType: "post", targetId: "parent" } : {}) };
      // Round-trip the fixture like the REST transaction so every special ID
      // starts as an actual own JSON property rather than a prototype setter.
      const root = JSON.parse(JSON.stringify({
        e2eeGroups: { [specialId]: { ownerId: "A", members: { A: true, [specialId]: true } } },
        e2eeAccounts: { A: { devices: { [specialId]: { active: true, signingPublicKey: "signer" } } } },
        encryptedData: {
          posts: { [specialId]: { parent: { userId: "A" } } },
          replies: { [specialId]: {} },
          [collection]: { [specialId]: { [specialId]: target, ...(targetType === "reply" ? {} : { keep: { userId: "A" } }) } },
          prayerReactions: { [specialId]: { [childId]: { targetType, targetId: specialId } } },
          postReactions: { [specialId]: { [childId]: { targetType, targetId: specialId } } },
          discussionFollowers: { [specialId]: { [targetType]: { [specialId]: { A: true } } } },
          userDiscussionFollows: { [specialId]: { [specialId]: { [childId]: { targetType, targetId: specialId } } } },
          activityNotifications: { [specialId]: { [childId]: { groupId: specialId, targetType, targetId: specialId } } },
          journalEntries: { [specialId]: { private: { body: { ciphertext: "private" } } } },
          privateCheckIns: { [specialId]: { private: { reflectionText: { ciphertext: "private-checkin" } } } },
        },
        moderationTombstones: { [specialId]: { [targetType]: {} } },
        moderationActions: { [specialId]: {} },
      }));
      if (targetType !== "reply") root.encryptedData.replies[specialId][childId] = { userId: specialId, targetType, targetId: specialId };
      const privateBefore = JSON.stringify([root.encryptedData.journalEntries, root.encryptedData.privateCheckIns]);
      const apply = () => removeCommunityContent(root, "A", specialId, "signer", { groupId: specialId, targetType, targetId: specialId }, "2026-10-22");
      apply();
      assert.equal(Object.hasOwn(root.encryptedData[collection][specialId], specialId), false);
      assert.equal(Object.keys(root.encryptedData.prayerReactions[specialId]).length, 0);
      assert.equal(Object.keys(root.encryptedData.postReactions[specialId]).length, 0);
      assert.equal(Object.keys(root.encryptedData.activityNotifications[specialId]).length, 0);
      assert.equal(Object.keys(root.encryptedData.userDiscussionFollows[specialId][specialId]).length, 0);
      if (targetType !== "reply") assert.equal(Object.hasOwn(root.encryptedData.replies[specialId], childId), false);
      const saved = JSON.parse(JSON.stringify(root));
      assert.ok(Object.hasOwn(saved.moderationTombstones, specialId));
      assert.ok(Object.hasOwn(saved.moderationTombstones[specialId][targetType], specialId));
      assert.deepEqual(saved.moderationTombstones[specialId][targetType][specialId], { removedAt: "2026-10-22" });
      assert.ok(Object.hasOwn(saved.moderationActions, specialId));
      assert.ok(Object.hasOwn(saved.moderationActions[specialId][targetType], specialId));
      assert.equal(saved.moderationActions[specialId][targetType][specialId].authorUserId, specialId);
      if (targetType === "check_in") {
        assert.ok(Object.hasOwn(saved.moderatedCheckInDays, specialId));
        assert.equal(saved.moderatedCheckInDays[specialId][specialId]["2026-10-22"], true);
        assert.equal(saved.encryptedData.checkInDailyClaims[specialId][specialId]["2026-10-22"].moderated, true);
      }
      assert.equal(JSON.stringify([root.encryptedData.journalEntries, root.encryptedData.privateCheckIns]), privateBefore);
      const completed = JSON.stringify(root); apply(); assert.equal(JSON.stringify(root), completed);
      assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), beforePrototype);
    }
  }
});

test("inherited targets, owner memberships and tombstones cannot impersonate database entries", () => {
  for (const specialId of ["__proto__", "constructor", "prototype"]) {
    const missing = fixture();
    assert.throws(() => remove(missing, "post", specialId), /no longer available/);
    const inherited = fixture();
    inherited.encryptedData.posts.room = Object.create({ post: inherited.encryptedData.posts.room.post });
    assert.throws(() => remove(inherited), /no longer available/);
    const membership = fixture(); membership.e2eeGroups.room.members = Object.create({ A: true });
    assert.throws(() => remove(membership), /current community owner/);
    const retry = fixture();
    retry.moderationTombstones = { room: { post: Object.create({ post: { removedAt: "old" } }) } };
    remove(retry);
    assert.equal(retry.encryptedData.posts.room.post, undefined);
    assert.ok(Object.hasOwn(retry.moderationTombstones.room.post, "post"));
  }
});
