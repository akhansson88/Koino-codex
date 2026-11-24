import test from "node:test";
import assert from "node:assert/strict";
import { canViewGroupStatistics, communityRole, leaderRoleUpdate } from "./community-roles";

const group = {
  ownerId: "a",
  members: {
    a: { role: "owner" },
    b: { role: "leader" },
    c: { role: "member" },
    stale: { role: "owner" },
  },
};

test("community roles come from ownerId and the authoritative member record", () => {
  assert.equal(communityRole(group, "a"), "owner");
  assert.equal(communityRole(group, "b"), "leader");
  assert.equal(communityRole(group, "c"), "member");
  assert.equal(communityRole(group, "stale"), "member");
  assert.equal(communityRole(group, "outsider"), undefined);
  assert.equal(communityRole(null, "a"), undefined);
});

test("only hosts and group leaders can see statistics", () => {
  assert.equal(canViewGroupStatistics("owner"), true);
  assert.equal(canViewGroupStatistics("leader"), true);
  assert.equal(canViewGroupStatistics("member"), false);
  assert.equal(canViewGroupStatistics(undefined), false);
});

test("leader updates write authority and both client mirrors while preserving profile fields", () => {
  const updates = leaderRoleUpdate({
    createdAt: "2026-11-20T10:00:00.000Z",
    groupId: "g",
    mirror: {
      id: "membership_b_g",
      userId: "b",
      groupId: "g",
      role: "member",
      userName: "Bo",
      image: { url: "avatar" },
      createdAt: "2026-11-20T10:00:00.000Z",
    },
    role: "leader",
    targetUserId: "b",
    updatedAt: "2026-11-24T10:00:00.000Z",
    userName: "ignored",
  });

  assert.deepEqual(Object.keys(updates).sort(), [
    "e2eeGroups/g/members/b/role",
    "encryptedData/groupMembers/g/b",
    "encryptedData/groups/g/updatedAt",
    "encryptedData/userGroups/b/g",
  ]);
  assert.equal((updates as any)["e2eeGroups/g/members/b/role"], "leader");
  assert.deepEqual((updates as any)["encryptedData/groupMembers/g/b"], {
    id: "membership_b_g",
    userId: "b",
    groupId: "g",
    role: "leader",
    userName: "Bo",
    image: { url: "avatar" },
    createdAt: "2026-11-20T10:00:00.000Z",
  });
  assert.deepEqual((updates as any)["encryptedData/userGroups/b/g"], (updates as any)["encryptedData/groupMembers/g/b"]);
});

test("a missing mirror is rebuilt with stable membership fields", () => {
  const updates = leaderRoleUpdate({
    createdAt: "2026-11-20T10:00:00.000Z",
    groupId: "g",
    mirror: null,
    role: "member",
    targetUserId: "b",
    updatedAt: "2026-11-24T10:00:00.000Z",
    userName: "Bo",
  });

  assert.deepEqual((updates as any)["encryptedData/groupMembers/g/b"], {
    id: "membership_b_g",
    userId: "b",
    groupId: "g",
    role: "member",
    userName: "Bo",
    createdAt: "2026-11-20T10:00:00.000Z",
  });
});
