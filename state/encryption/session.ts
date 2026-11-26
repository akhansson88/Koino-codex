import { onValue, ref as rawRef } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { auth, database, functions } from "@/state/store/firebase";
import type { CommunityJoinRequest, JoinRequestReceipt } from "@/state/community-join-requests";
import type { CommunityInvitePreview, GroupJoinApprovers, GroupJoinPolicy, GroupStatistics, GroupStatisticsDays } from "@/state/types";

// KOINO accounts are ordinary Firebase accounts. There is no vault, recovery
// key, device approval or escrow: signing in on any device shows the account's
// own content, and community content is protected by database rules.
let generation = 0;
export const sessionGeneration = () => generation;
export function lockSession() { generation++; }
export const session = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to continue.");
  return { uid };
};
const noSubscribers = new Set<() => void>();
export const subscribeEncryption = (listener: () => void) => { noSubscribers.add(listener); return () => { noSubscribers.delete(listener); }; };

type CallOptions = { operation: string; data?: Record<string, unknown> };
async function call<T>(operation: string, data: Record<string, unknown> = {}): Promise<T> {
  const response = await httpsCallable<CallOptions, T>(functions, "koinoAccount")({ operation, data });
  return response.data;
}
export const encryptedOperation = <T = unknown>(operation: string, data: Record<string, unknown> = {}) =>
  call<T>(operation, data);

export function listenRaw(path: string, listener: (value: unknown) => void) {
  return onValue(rawRef(database, path), (snapshot) => listener(snapshot.val()));
}

// Community membership. The server keeps e2eeGroups/<groupId>/members/<uid> as
// the source of truth used by database rules; the client never handles keys.
export async function createEncryptedGroup(groupId: string, records: () => unknown) {
  const payload = records() as { group: unknown; membership: unknown; userMembership: unknown };
  await call("createGroup", { groupId, ...payload });
}

export async function groupJoinRequest(code: string, name: string): Promise<JoinRequestReceipt> {
  const result = await call<JoinRequestReceipt>("joinGroup", { code, name });
  if (!result?.groupId || !["pending", "approved", "rejected"].includes(result.status)) {
    throw new Error("The community access request could not be confirmed.");
  }
  return result;
}

// A scanner may read the same code several times per second. The preview is
// cached briefly so re-reading frames does not spend the join rate limit, but
// a host's policy change must reach the next scan almost at once.
const inviteCache = new Map<string, { value: CommunityInvitePreview; at: number }>();
const inviteCacheMs = 3_000;

export async function resolveCommunityInvite(code: string): Promise<CommunityInvitePreview> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new Error("Scan a KOINO invite code first.");
  const cached = inviteCache.get(normalized);
  if (cached && Date.now() - cached.at < inviteCacheMs) return cached.value;
  const result = await call<CommunityInvitePreview>("resolveInvite", { code: normalized });
  if (!result?.groupId || (result.joinPolicy !== "approval" && result.joinPolicy !== "open")) {
    throw new Error("The community invite could not be read.");
  }
  const value: CommunityInvitePreview = {
    ...result,
    joinApprovers: result.joinApprovers === "owner_and_leaders" ? "owner_and_leaders" : "owner",
  };
  inviteCache.set(normalized, { value, at: Date.now() });
  return value;
}

export function forgetResolvedInvite(code?: string) {
  if (code) inviteCache.delete(code.trim().toUpperCase());
  else inviteCache.clear();
}

export async function setGroupJoinPolicy(groupId: string, joinPolicy: GroupJoinPolicy, joinApprovers: GroupJoinApprovers) {
  await call("setJoinPolicy", { groupId, joinPolicy, joinApprovers });
  inviteCache.clear();
}


export async function listCommunityJoinRequests(userId: string) {
  if (session().uid !== userId) throw new Error("The account changed while opening community requests.");
  const result = await call<{ requests?: CommunityJoinRequest[] }>("listJoinRequests");
  if (!Array.isArray(result?.requests)) throw new Error("Community requests could not be read.");
  return result.requests;
}

export function communityJoinFingerprint(_userId: string) {
  // Plain accounts have no device identity to compare.
  return undefined;
}

export async function rejectGroupJoinRequest(groupId: string, userId: string) {
  await call("rejectJoin", { groupId, userId });
}

export async function listGroupJoinRequests(groupId: string) {
  const result = await call<{ requests?: { userId: string; name: string; requestedAt: number }[] }>("listGroupRequests", { groupId });
  return result?.requests ?? [];
}

export async function approveGroupMember(groupId: string, userId: string, name: string) {
  await call("approveJoin", { groupId, userId, name });
}

export async function rotateGroup(groupId: string, removedUid?: string, newOwnerId?: string) {
  if (removedUid) await call("removeMember", { groupId, userId: removedUid });
  else if (newOwnerId) await call("transferOwnership", { groupId, userId: newOwnerId });
}

export async function leaveEncryptedGroup(groupId: string) { await call("leaveGroup", { groupId }); }
export async function deleteEncryptedGroup(groupId: string) { await call("deleteGroup", { groupId }); }

export async function appointGroupLeader(groupId: string, userId: string) {
  await call("appointGroupLeader", { groupId, userId });
}

export async function removeGroupLeader(groupId: string, userId: string) {
  await call("removeGroupLeader", { groupId, userId });
}

export async function loadGroupStatistics(groupId: string, days: GroupStatisticsDays): Promise<GroupStatistics> {
  return call<GroupStatistics>("groupStatistics", { groupId, days });
}
