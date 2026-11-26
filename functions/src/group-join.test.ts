import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_JOIN_POLICY,
  MAX_GROUP_MEMBERS,
  communityMemberCount,
  decideJoin,
  joinPolicyOrDefault,
  normalizeInviteCode,
  parseJoinPolicy,
  requestStatusOf,
} from "./group-join";

test("an absent or unknown policy means approval", () => {
  assert.equal(DEFAULT_JOIN_POLICY, "approval");
  assert.equal(joinPolicyOrDefault(undefined), "approval");
  assert.equal(joinPolicyOrDefault(null), "approval");
  assert.equal(joinPolicyOrDefault("everyone"), "approval");
  assert.equal(joinPolicyOrDefault(1), "approval");
  assert.equal(joinPolicyOrDefault("open"), "open");
  assert.equal(joinPolicyOrDefault("approval"), "approval");
});

test("only approval and open parse as a policy value", () => {
  assert.equal(parseJoinPolicy("approval"), "approval");
  assert.equal(parseJoinPolicy("open"), "open");
  assert.equal(parseJoinPolicy("OPEN"), undefined);
  assert.equal(parseJoinPolicy(""), undefined);
  assert.equal(parseJoinPolicy({ open: true }), undefined);
});

test("the member ceiling counts the authoritative member map", () => {
  assert.equal(communityMemberCount(null), 0);
  assert.equal(communityMemberCount({}), 0);
  assert.equal(communityMemberCount({ members: { a: {}, b: {} } }), 2);
  assert.equal(MAX_GROUP_MEMBERS, 200);
});

test("an existing member joins idempotently whatever the policy", () => {
  assert.equal(decideJoin({ isMember: true, joinPolicy: "open", hasDeparted: false, memberCount: 3 }), "already-member");
  assert.equal(decideJoin({ isMember: true, previousStatus: "rejected", joinPolicy: "approval", hasDeparted: false, memberCount: 3 }), "already-member");
});

test("a rejected person cannot get back in by scanning", () => {
  assert.equal(decideJoin({ isMember: false, previousStatus: "rejected", joinPolicy: "open", hasDeparted: false, memberCount: 3 }), "rejected");
  assert.equal(decideJoin({ isMember: false, previousStatus: "rejected", joinPolicy: "approval", hasDeparted: false, memberCount: 3 }), "rejected");
});

test("an open community adds a first-time visitor directly", () => {
  assert.equal(decideJoin({ isMember: false, joinPolicy: "open", hasDeparted: false, memberCount: 0 }), "open-join");
  assert.equal(decideJoin({ isMember: false, previousStatus: "closed", joinPolicy: "open", hasDeparted: false, memberCount: 199 }), "open-join");
});

test("a removed or departed person never auto-joins, even in an open community", () => {
  assert.equal(decideJoin({ isMember: false, joinPolicy: "open", hasDeparted: true, memberCount: 5 }), "pending");
  assert.equal(decideJoin({ isMember: false, previousStatus: "closed", joinPolicy: "open", hasDeparted: true, memberCount: 5 }), "pending");
});

test("an approval community always leaves a request", () => {
  assert.equal(decideJoin({ isMember: false, joinPolicy: "approval", hasDeparted: false, memberCount: 5 }), "pending");
  assert.equal(decideJoin({ isMember: false, joinPolicy: undefined, hasDeparted: false, memberCount: 5 }), "pending");
});

test("an open community at the ceiling reports full instead of admitting", () => {
  assert.equal(decideJoin({ isMember: false, joinPolicy: "open", hasDeparted: false, memberCount: 200 }), "full");
  assert.equal(decideJoin({ isMember: false, joinPolicy: "open", hasDeparted: false, memberCount: 240 }), "full");
});

test("only a real request status is echoed back to the caller", () => {
  assert.equal(requestStatusOf({ status: "pending" }), "pending");
  assert.equal(requestStatusOf({ status: "approved" }), "approved");
  assert.equal(requestStatusOf({ status: "rejected" }), "rejected");
  assert.equal(requestStatusOf({ status: "closed" }), "closed");
  assert.equal(requestStatusOf({ status: "owner" }), undefined);
  assert.equal(requestStatusOf({ status: 7 }), undefined);
  assert.equal(requestStatusOf(null), undefined);
  assert.equal(requestStatusOf("pending"), undefined);
});

test("invite codes normalise the way the QR payload is read", () => {
  assert.equal(normalizeInviteCode("  abc123 "), "ABC123");
  assert.equal(normalizeInviteCode(undefined), "");
  assert.equal(normalizeInviteCode("koino"), "KOINO");
});
