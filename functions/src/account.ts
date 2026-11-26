import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { adminApp } from "./firebase-admin";
import { canViewGroupStatistics, communityRole, leaderRoleUpdate } from "./community-roles";
import { loadGroupStatistics } from "./community-statistics-data";
import type { GroupStatisticsDays } from "./community-statistics";
import {
  canApproveJoinRequests,
  communityMemberCount,
  decideJoin,
  joinApproversOrDefault,
  joinPolicyOrDefault,
  normalizeInviteCode,
  parseJoinApprovers,
  parseJoinPolicy,
  requestStatusOf,
} from "./group-join";
import { ActionLimitError, assertActionAllowed } from "./signup-guard/store";

// Plaintext account and community operations. Content itself is written by the
// app and guarded by database rules; this callable exists for the writes that
// need server authority: creating a community, join requests, approvals,
// membership changes and moderation.
const db = () => getDatabase(adminApp);
type Obj = Record<string, any>;
const invalid = (message = "Invalid request."): never => { throw new HttpsError("invalid-argument", message); };
const denied = (message = "This operation is not allowed."): never => { throw new HttpsError("permission-denied", message); };
const missing = (message = "This community is no longer available."): never => { throw new HttpsError("not-found", message); };
const id = (value: unknown): string => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value) ? value : invalid();
const timestamp = () => new Date().toISOString();
const statisticsDays = (value: unknown): GroupStatisticsDays => {
  if (value === 7 || value === 30 || value === 90) return value;
  return invalid("Choose 7, 30 or 90 days.");
};
async function group(groupId: string) {
  return (await db().ref(`e2eeGroups/${groupId}`).get()).val() as Obj | null;
}
async function requireGroup(groupId: string, uid: string, owner = false) {
  const value = await group(groupId);
  if (!value || !value.members?.[uid]) missing();
  if (owner && value!.ownerId !== uid) denied("Only the community host can do that.");
  return value!;
}
// The host always decides; a group leader only while the host has granted it.
async function requireJoinApprover(groupId: string, uid: string) {
  const value = await group(groupId);
  if (!value || !value.members?.[uid]) missing();
  if (!canApproveJoinRequests(communityRole(value, uid), value!.joinApprovers)) {
    denied("Only the community host and its group leaders can do that.");
  }
  return value!;
}
function membership(groupId: string, userId: string, role: "owner" | "member", name: string, createdAt: string) {
  return { id: `membership_${userId}_${groupId}`, userId, groupId, role, userName: name, createdAt };
}

export const koinoAccount = onCall({ region: "europe-west1", timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const requireVerifiedEmail = () => {
    if (request.auth?.token.email_verified !== true) {
      throw new HttpsError("failed-precondition", "EMAIL_NOT_VERIFIED");
    }
  };
  const enforceActionLimit = async (action: "createGroup" | "joinGroup") => {
    try {
      await assertActionAllowed(uid, action);
    } catch (error) {
      if (error instanceof ActionLimitError) {
        throw new HttpsError("resource-exhausted", "ACTION_RATE_LIMITED");
      }
      throw error;
    }
  };
  const payload = request.data as { operation?: unknown; data?: Obj };
  const operation = typeof payload?.operation === "string" ? payload.operation : invalid();
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  switch (operation) {
    case "createGroup": {
      requireVerifiedEmail();
      await enforceActionLimit("createGroup");
      const groupId = id(data.groupId);
      const record = data.group as Obj;
      const ownerMembership = data.membership as Obj;
      const userMembership = data.userMembership as Obj;
      if (!record || record.id !== groupId || record.ownerId !== uid) invalid();
      const code = id(record.inviteCode);
      if (!ownerMembership || ownerMembership.userId !== uid || ownerMembership.groupId !== groupId || ownerMembership.role !== "owner") invalid();
      if (!userMembership || userMembership.userId !== uid || userMembership.groupId !== groupId || userMembership.role !== "owner") invalid();
      const inviteOwner = (await db().ref(`encryptedData/inviteCodes/${code}/groupId`).get()).val();
      if (inviteOwner && inviteOwner !== groupId) invalid("That invite code is already in use.");
      if (record.joinPolicy !== undefined && !parseJoinPolicy(record.joinPolicy)) {
        invalid("Choose a valid join policy.");
      }
      if (record.joinApprovers !== undefined && !parseJoinApprovers(record.joinApprovers)) {
        invalid("Choose a valid join approver.");
      }
      const joinPolicy = joinPolicyOrDefault(record.joinPolicy);
      const joinApprovers = joinApproversOrDefault(record.joinApprovers);
      const created = await db().ref(`e2eeGroups/${groupId}`).transaction((value) => value ? undefined : {
        id: groupId, ownerId: uid, revision: 1, epoch: 1, status: "ready", joinPolicy, joinApprovers,
        members: { [uid]: { id: uid, userId: uid, role: "owner", joinedAt: record.createdAt ?? timestamp() } },
        createdAt: record.createdAt ?? timestamp(),
      });
      if (!created.committed) throw new HttpsError("already-exists", "That community already exists.");
      await db().ref().update({
        [`encryptedData/groups/${groupId}`]: { ...record, joinPolicy, joinApprovers },
        [`encryptedData/groupMembers/${groupId}/${uid}`]: ownerMembership,
        [`encryptedData/userGroups/${uid}/${groupId}`]: userMembership,
        [`encryptedData/inviteCodes/${code}`]: { groupId, createdAt: record.createdAt ?? timestamp() },
      });
      return {};
    }
    case "joinGroup": {
      requireVerifiedEmail();
      await enforceActionLimit("joinGroup");
      const code = id(normalizeInviteCode(data.code));
      const invite = (await db().ref(`encryptedData/inviteCodes/${code}`).get()).val() as Obj | null;
      if (!invite?.groupId) missing("No community uses that invite code.");
      const groupId = id(invite!.groupId);
      const current = await group(groupId);
      if (!current) missing("No community uses that invite code.");
      const statusPath = `e2eeJoinRequestStatuses/${uid}/${groupId}`;
      const [previousSnapshot, departedSnapshot] = await Promise.all([
        db().ref(statusPath).get(),
        db().ref(`e2eeDepartures/${groupId}/${uid}`).get(),
      ]);
      const previous = previousSnapshot.val() as Obj | null;
      const decision = decideJoin({
        isMember: Boolean(current!.members?.[uid]),
        previousStatus: typeof previous?.status === "string" ? previous.status : undefined,
        joinPolicy: current!.joinPolicy,
        hasDeparted: Boolean(departedSnapshot.val()),
        memberCount: communityMemberCount(current),
      });
      if (decision === "already-member") {
        // Scanning a code for a community you are already in is a no-op join.
        await db().ref().update({
          [statusPath]: { status: "approved", inviteHint: code.slice(-2), updatedAt: Date.now() },
          [`e2eeJoinRequests/${groupId}/${uid}`]: null,
        });
        return { groupId, status: "approved", joined: true };
      }
      if (decision === "rejected") return { groupId, status: "rejected" };
      if (decision === "full") {
        throw new HttpsError("failed-precondition", "GROUP_FULL");
      }
      const name = typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 120) : "KOINO member";
      const createdAt = timestamp();
      if (decision === "open-join") {
        const record = membership(groupId, uid, "member", name, createdAt);
        // One atomic update after a fresh read: a policy flip or a removal can
        // never leave membership and its mirrors out of step.
        await db().ref().update({
          [`e2eeGroups/${groupId}/members/${uid}`]: { id: uid, userId: uid, role: "member", joinedAt: createdAt },
          [`encryptedData/groupMembers/${groupId}/${uid}`]: record,
          [`encryptedData/userGroups/${uid}/${groupId}`]: record,
          [`e2eeJoinRequests/${groupId}/${uid}`]: null,
          [`e2eeDepartures/${groupId}/${uid}`]: null,
          [statusPath]: { status: "approved", inviteHint: code.slice(-2), updatedAt: Date.now() },
        });
        return { groupId, status: "approved", joined: true };
      }
      await db().ref(`e2eeJoinRequests/${groupId}/${uid}`).set({ userId: uid, name, requestedAt: Date.now() });
      await db().ref(statusPath).set({ status: "pending", inviteHint: code.slice(-2), updatedAt: Date.now() });
      return { groupId, status: "pending" };
    }
    case "resolveInvite": {
      // The code is the credential: return only what the join preview shows.
      const code = id(normalizeInviteCode(data.code));
      const invite = (await db().ref(`encryptedData/inviteCodes/${code}`).get()).val() as Obj | null;
      if (!invite?.groupId) missing("No community uses that invite code.");
      const groupId = id(invite!.groupId);
      const current = await group(groupId);
      if (!current) missing("No community uses that invite code.");
      const [infoSnapshot, statusSnapshot] = await Promise.all([
        db().ref(`encryptedData/groups/${groupId}`).get(),
        db().ref(`e2eeJoinRequestStatuses/${uid}/${groupId}`).get(),
      ]);
      const info = infoSnapshot.val() as Obj | null;
      const requestStatus = requestStatusOf(statusSnapshot.val());
      return {
        groupId,
        name: typeof info?.name === "string" ? info.name.slice(0, 120) : "",
        joinPolicy: joinPolicyOrDefault(current!.joinPolicy),
        joinApprovers: joinApproversOrDefault(current!.joinApprovers ?? info?.joinApprovers),
        memberCount: communityMemberCount(current),
        alreadyMember: Boolean(current!.members?.[uid]),
        ...(requestStatus ? { requestStatus } : {}),
      };
    }
    case "setJoinPolicy": {
      requireVerifiedEmail();
      const groupId = id(data.groupId);
      const requestedPolicy = data.joinPolicy === undefined ? undefined : parseJoinPolicy(data.joinPolicy);
      if (data.joinPolicy !== undefined && !requestedPolicy) invalid("Choose a valid join policy.");
      const requestedApprovers = data.joinApprovers === undefined ? undefined : parseJoinApprovers(data.joinApprovers);
      if (data.joinApprovers !== undefined && !requestedApprovers) invalid("Choose a valid join approver.");
      const current = await requireGroup(groupId, uid, true);
      const info = (await db().ref(`encryptedData/groups/${groupId}`).get()).val() as Obj | null;
      const joinPolicy = requestedPolicy ?? joinPolicyOrDefault(current.joinPolicy);
      const joinApprovers = requestedApprovers ?? joinApproversOrDefault(current.joinApprovers ?? info?.joinApprovers);
      const unchanged =
        joinPolicyOrDefault(current.joinPolicy) === joinPolicy &&
        joinApproversOrDefault(current.joinApprovers) === joinApprovers &&
        joinPolicyOrDefault(info?.joinPolicy) === joinPolicy &&
        joinApproversOrDefault(info?.joinApprovers) === joinApprovers;
      if (unchanged) return {};
      const createdAt = timestamp();
      await db().ref().update({
        [`e2eeGroups/${groupId}/joinPolicy`]: joinPolicy,
        [`e2eeGroups/${groupId}/joinApprovers`]: joinApprovers,
        [`encryptedData/groups/${groupId}/joinPolicy`]: joinPolicy,
        [`encryptedData/groups/${groupId}/joinApprovers`]: joinApprovers,
        [`encryptedData/groups/${groupId}/updatedAt`]: createdAt,
      });
      return { joinPolicy, joinApprovers };
    }
    case "listJoinRequests": {
      const index = (await db().ref(`e2eeJoinRequestStatuses/${uid}`).get()).val() as Obj | null;
      const requests = Object.entries(index ?? {}).map(([groupId, record]) => ({
        groupId,
        status: record?.status === "approved" || record?.status === "rejected" ? record.status : "pending",
        ...(typeof record?.inviteHint === "string" ? { inviteHint: record.inviteHint } : {}),
        updatedAt: typeof record?.updatedAt === "number" ? record.updatedAt : 0,
      }));
      return { requests: requests.sort((left, right) => right.updatedAt - left.updatedAt || left.groupId.localeCompare(right.groupId)) };
    }
    case "listGroupRequests": {
      const groupId = id(data.groupId);
      await requireJoinApprover(groupId, uid);
      const requests = (await db().ref(`e2eeJoinRequests/${groupId}`).get()).val() as Obj | null;
      return { requests: Object.entries(requests ?? {}).map(([userId, value]) => ({ userId, name: typeof value?.name === "string" ? value.name : "KOINO member", requestedAt: typeof value?.requestedAt === "number" ? value.requestedAt : 0 })) };
    }
    case "approveJoin": {
      requireVerifiedEmail();
      const groupId = id(data.groupId), userId = id(data.userId);
      await requireJoinApprover(groupId, uid);
      const request = (await db().ref(`e2eeJoinRequests/${groupId}/${userId}`).get()).val() as Obj | null;
      const existing = (await db().ref(`e2eeGroups/${groupId}/members/${userId}`).get()).val();
      if (!request && !existing) missing("This access request is no longer available.");
      const name = typeof request?.name === "string" ? request.name : (typeof data.name === "string" ? data.name : "KOINO member");
      const createdAt = timestamp();
      const record = membership(groupId, userId, "member", name, createdAt);
      await db().ref().update({
        [`e2eeGroups/${groupId}/members/${userId}`]: { id: userId, userId, role: "member", joinedAt: createdAt },
        [`encryptedData/groupMembers/${groupId}/${userId}`]: record,
        [`encryptedData/userGroups/${userId}/${groupId}`]: record,
        [`e2eeJoinRequests/${groupId}/${userId}`]: null,
        [`e2eeDepartures/${groupId}/${userId}`]: null,
        [`e2eeJoinRequestStatuses/${userId}/${groupId}`]: { status: "approved", updatedAt: Date.now() },
      });
      return {};
    }
    case "discardVault": {
      // The account no longer uses a vault. Remove the retired key material.
      const account = (await db().ref(`e2eeAccounts/${uid}`).get()).val() as Obj | null;
      const updates: Obj = {
        [`e2eeAccounts/${uid}`]: null,
        [`e2eeEscrow/${uid}`]: null,
        [`e2eeDeviceRequests/${uid}`]: null,
        [`e2eeRequests/${uid}`]: null,
      };
      for (const device of Object.values(account?.devices ?? {}) as Obj[]) {
        if (device?.signingPublicKey) updates[`e2eeSigners/${device.signingPublicKey}`] = null;
      }
      if (account?.signingPublicKey) updates[`e2eeSigners/${account.signingPublicKey}`] = null;
      await db().ref().update(updates);
      return {};
    }
    case "rejectJoin": {
      requireVerifiedEmail();
      const groupId = id(data.groupId), userId = id(data.userId);
      await requireJoinApprover(groupId, uid);
      await db().ref().update({
        [`e2eeJoinRequests/${groupId}/${userId}`]: null,
        [`e2eeJoinRequestStatuses/${userId}/${groupId}`]: { status: "rejected", updatedAt: Date.now() },
      });
      return {};
    }
    case "appointGroupLeader": {
      requireVerifiedEmail();
      const groupId = id(data.groupId);
      const targetUserId = id(data.userId);
      const current = await requireGroup(groupId, uid, true);
      if (targetUserId === uid || targetUserId === current.ownerId) invalid("Choose another member.");
      const target = current.members?.[targetUserId];
      if (!target) invalid("Choose a current member of this community.");
      if (target.role === "owner") invalid("The community host already has full access.");
      if (target.role === "leader") return {};
      const mirror = (await db().ref(`encryptedData/groupMembers/${groupId}/${targetUserId}`).get()).val() as Obj | null;
      const profile = mirror?.userName
        ? null
        : (await db().ref(`encryptedData/profiles/${targetUserId}`).get()).val() as Obj | null;
      const updatedAt = timestamp();
      await db().ref().update(leaderRoleUpdate({
        createdAt: typeof target.joinedAt === "string" ? target.joinedAt : updatedAt,
        groupId,
        mirror,
        role: "leader",
        targetUserId,
        updatedAt,
        userName: typeof profile?.name === "string" && profile.name.trim() ? profile.name : "KOINO member",
      }));
      return {};
    }
    case "removeGroupLeader": {
      requireVerifiedEmail();
      const groupId = id(data.groupId);
      const targetUserId = id(data.userId);
      const current = await requireGroup(groupId, uid, true);
      if (targetUserId === current.ownerId) invalid("The community host cannot be removed as a group leader.");
      const target = current.members?.[targetUserId];
      if (!target) invalid("Choose a current member of this community.");
      if (target.role !== "leader") return {};
      const mirror = (await db().ref(`encryptedData/groupMembers/${groupId}/${targetUserId}`).get()).val() as Obj | null;
      const updatedAt = timestamp();
      await db().ref().update(leaderRoleUpdate({
        createdAt: typeof target.joinedAt === "string" ? target.joinedAt : updatedAt,
        groupId,
        mirror,
        role: "member",
        targetUserId,
        updatedAt,
        userName: typeof mirror?.userName === "string" && mirror.userName.trim() ? mirror.userName : "KOINO member",
      }));
      return {};
    }
    case "groupStatistics": {
      const groupId = id(data.groupId);
      const days = statisticsDays(data.days);
      const current = await requireGroup(groupId, uid);
      if (!canViewGroupStatistics(communityRole(current, uid))) {
        denied("Only the community host and group leaders can see statistics.");
      }
      return loadGroupStatistics(current, groupId, days);
    }
    case "leaveGroup":
    case "removeMember": {
      if (operation === "removeMember") requireVerifiedEmail();
      const groupId = id(data.groupId);
      const target = operation === "leaveGroup" ? uid : id(data.userId);
      const current = await requireGroup(groupId, uid, target !== uid);
      if (current.ownerId === target) denied("Transfer ownership before leaving.");
      await db().ref().update({
        [`e2eeGroups/${groupId}/members/${target}`]: null,
        [`e2eeDepartures/${groupId}/${target}`]: true,
        [`encryptedData/groupMembers/${groupId}/${target}`]: null,
        [`encryptedData/userGroups/${target}/${groupId}`]: null,
        [`presence/${groupId}/${target}`]: null,
        [`e2eeJoinRequestStatuses/${target}/${groupId}`]: { status: "closed", updatedAt: Date.now() },
      });
      return {};
    }
    case "transferOwnership": {
      requireVerifiedEmail();
      const groupId = id(data.groupId), next = id(data.userId);
      const current = await requireGroup(groupId, uid, true);
      if (!current.members?.[next] || next === uid) invalid("Choose another current member.");
      const createdAt = timestamp();
      await db().ref().update({
        [`e2eeGroups/${groupId}/ownerId`]: next,
        [`e2eeGroups/${groupId}/members/${uid}/role`]: "member",
        [`e2eeGroups/${groupId}/members/${next}/role`]: "owner",
        [`encryptedData/groups/${groupId}/ownerId`]: next,
        [`encryptedData/groups/${groupId}/updatedAt`]: createdAt,
        [`encryptedData/groupMembers/${groupId}/${uid}/role`]: "member",
        [`encryptedData/groupMembers/${groupId}/${next}/role`]: "owner",
        [`encryptedData/userGroups/${uid}/${groupId}/role`]: "member",
        [`encryptedData/userGroups/${next}/${groupId}/role`]: "owner",
      });
      return {};
    }
    case "deleteGroup": {
      requireVerifiedEmail();
      const groupId = id(data.groupId);
      const current = await requireGroup(groupId, uid, true);
      const info = (await db().ref(`encryptedData/groups/${groupId}`).get()).val() as Obj | null;
      const updates: Obj = {
        [`e2eeGroups/${groupId}`]: null,
        [`e2eeJoinRequests/${groupId}`]: null,
        [`e2eeDepartures/${groupId}`]: null,
        [`e2eeGroupLocks/${groupId}`]: null,
        [`presence/${groupId}`]: null,
      };
      for (const member of Object.keys(current.members ?? {})) {
        updates[`encryptedData/userGroups/${member}/${groupId}`] = null;
        updates[`e2eeJoinRequestStatuses/${member}/${groupId}`] = null;
      }
      for (const collection of ["groups", "groupMembers", "checkIns", "posts", "replies", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupBiblePlanParticipation", "groupEvents", "eventRsvps", "discussionFollowers", "legacyGroupArchives"]) updates[`encryptedData/${collection}/${groupId}`] = null;
      if (info?.inviteCode) updates[`encryptedData/inviteCodes/${info.inviteCode}`] = null;
      await db().ref().update(updates);
      return {};
    }
    case "removeCommunityContent": {
      requireVerifiedEmail();
      const groupId = id(data.groupId);
      const targetType = data.targetType;
      const targetId = id(data.targetId);
      if (!["post", "check_in", "reply"].includes(targetType)) invalid();
      await requireGroup(groupId, uid, true);
      const collection = targetType === "post" ? "posts" : targetType === "check_in" ? "checkIns" : "replies";
      const updates: Obj = { [`encryptedData/${collection}/${groupId}/${targetId}`]: null };
      if (targetType !== "reply") {
        const replies = (await db().ref(`encryptedData/replies/${groupId}`).get()).val() as Obj | null;
        for (const [replyId, reply] of Object.entries(replies ?? {})) {
          if (reply?.targetType === targetType && reply?.targetId === targetId) updates[`encryptedData/replies/${groupId}/${replyId}`] = null;
        }
      }
      const reactions = (await db().ref(`encryptedData/prayerReactions/${groupId}`).get()).val() as Obj | null;
      for (const [reactionId, reaction] of Object.entries(reactions ?? {})) {
        if (reaction?.targetType === targetType && reaction?.targetId === targetId) updates[`encryptedData/prayerReactions/${groupId}/${reactionId}`] = null;
      }
      const postReactions = (await db().ref(`encryptedData/postReactions/${groupId}`).get()).val() as Obj | null;
      for (const [reactionId, reaction] of Object.entries(postReactions ?? {})) {
        if (reaction?.targetType === targetType && reaction?.targetId === targetId) updates[`encryptedData/postReactions/${groupId}/${reactionId}`] = null;
      }
      await db().ref().update(updates);
      return { removed: true };
    }
    default: return invalid("Unsupported operation.");
  }
});

