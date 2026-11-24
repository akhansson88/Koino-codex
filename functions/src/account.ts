import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { adminApp } from "./firebase-admin";

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

async function group(groupId: string) {
  return (await db().ref(`e2eeGroups/${groupId}`).get()).val() as Obj | null;
}
async function requireGroup(groupId: string, uid: string, owner = false) {
  const value = await group(groupId);
  if (!value || !value.members?.[uid]) missing();
  if (owner && value!.ownerId !== uid) denied("Only the community host can do that.");
  return value!;
}
function membership(groupId: string, userId: string, role: "owner" | "member", name: string, createdAt: string) {
  return { id: `membership_${userId}_${groupId}`, userId, groupId, role, userName: name, createdAt };
}

export const koinoAccount = onCall({ region: "europe-west1", timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const payload = request.data as { operation?: unknown; data?: Obj };
  const operation = typeof payload?.operation === "string" ? payload.operation : invalid();
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  switch (operation) {
    case "createGroup": {
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
      const created = await db().ref(`e2eeGroups/${groupId}`).transaction((value) => value ? undefined : {
        id: groupId, ownerId: uid, revision: 1, epoch: 1, status: "ready",
        members: { [uid]: { id: uid, userId: uid, role: "owner", joinedAt: record.createdAt ?? timestamp() } },
        createdAt: record.createdAt ?? timestamp(),
      });
      if (!created.committed) throw new HttpsError("already-exists", "That community already exists.");
      await db().ref().update({
        [`encryptedData/groups/${groupId}`]: record,
        [`encryptedData/groupMembers/${groupId}/${uid}`]: ownerMembership,
        [`encryptedData/userGroups/${uid}/${groupId}`]: userMembership,
        [`encryptedData/inviteCodes/${code}`]: { groupId, createdAt: record.createdAt ?? timestamp() },
      });
      return {};
    }
    case "joinGroup": {
      const code = id(String(data.code ?? "").trim().toUpperCase());
      const invite = (await db().ref(`encryptedData/inviteCodes/${code}`).get()).val() as Obj | null;
      if (!invite?.groupId) missing("No community uses that invite code.");
      const groupId = id(invite!.groupId);
      const current = await group(groupId);
      if (!current) missing("No community uses that invite code.");
      const statusPath = `e2eeJoinRequestStatuses/${uid}/${groupId}`;
      const previous = (await db().ref(statusPath).get()).val() as Obj | null;
      if (current!.members?.[uid]) {
        await db().ref(statusPath).set({ status: "approved", inviteHint: code.slice(-2), updatedAt: Date.now() });
        await db().ref(`e2eeJoinRequests/${groupId}/${uid}`).remove();
        return { groupId, status: "approved" };
      }
      if (previous?.status === "rejected") return { groupId, status: "rejected" };
      const name = typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 120) : "KOINO member";
      await db().ref(`e2eeJoinRequests/${groupId}/${uid}`).set({ userId: uid, name, requestedAt: Date.now() });
      await db().ref(statusPath).set({ status: "pending", inviteHint: code.slice(-2), updatedAt: Date.now() });
      return { groupId, status: "pending" };
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
      await requireGroup(groupId, uid, true);
      const requests = (await db().ref(`e2eeJoinRequests/${groupId}`).get()).val() as Obj | null;
      return { requests: Object.entries(requests ?? {}).map(([userId, value]) => ({ userId, name: typeof value?.name === "string" ? value.name : "KOINO member", requestedAt: typeof value?.requestedAt === "number" ? value.requestedAt : 0 })) };
    }
    case "approveJoin": {
      const groupId = id(data.groupId), userId = id(data.userId);
      await requireGroup(groupId, uid, true);
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
      const groupId = id(data.groupId), userId = id(data.userId);
      await requireGroup(groupId, uid, true);
      await db().ref().update({
        [`e2eeJoinRequests/${groupId}/${userId}`]: null,
        [`e2eeJoinRequestStatuses/${userId}/${groupId}`]: { status: "rejected", updatedAt: Date.now() },
      });
      return {};
    }
    case "leaveGroup":
    case "removeMember": {
      const groupId = id(data.groupId);
      const target = operation === "leaveGroup" ? uid : id(data.userId);
      const current = await requireGroup(groupId, uid, target !== uid);
      if (current.ownerId === target) denied("Transfer ownership before leaving.");
      await db().ref().update({
        [`e2eeGroups/${groupId}/members/${target}`]: null,
        [`e2eeDepartures/${groupId}/${target}`]: true,
        [`encryptedData/groupMembers/${groupId}/${target}`]: null,
        [`encryptedData/userGroups/${target}/${groupId}`]: null,
        [`e2eeJoinRequestStatuses/${target}/${groupId}`]: { status: "closed", updatedAt: Date.now() },
      });
      return {};
    }
    case "transferOwnership": {
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
      const groupId = id(data.groupId);
      const current = await requireGroup(groupId, uid, true);
      const info = (await db().ref(`encryptedData/groups/${groupId}`).get()).val() as Obj | null;
      const updates: Obj = {
        [`e2eeGroups/${groupId}`]: null,
        [`e2eeJoinRequests/${groupId}`]: null,
        [`e2eeDepartures/${groupId}`]: null,
        [`e2eeGroupLocks/${groupId}`]: null,
      };
      for (const [member, value] of Object.entries(current.members ?? {})) {
        updates[`encryptedData/userGroups/${member}/${groupId}`] = null;
        updates[`e2eeJoinRequestStatuses/${member}/${groupId}`] = null;
        if ((value as Obj)?.role === "owner") updates[`encryptedData/userGroups/${member}`] = null;
      }
      for (const collection of ["groups", "groupMembers", "checkIns", "posts", "replies", "prayerReactions", "postReactions", "groupBiblePlanAnnouncements", "groupBiblePlanParticipation", "groupEvents", "eventRsvps", "discussionFollowers", "legacyGroupArchives"]) updates[`encryptedData/${collection}/${groupId}`] = null;
      if (info?.inviteCode) updates[`encryptedData/inviteCodes/${info.inviteCode}`] = null;
      await db().ref().update(updates);
      return {};
    }
    case "removeCommunityContent": {
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

