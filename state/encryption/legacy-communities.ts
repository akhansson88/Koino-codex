import * as Raw from "firebase/database";
import { auth, database } from "@/state/store/firebase";
import type { Group, Membership } from "@/state/types";
import storage from "./local-storage";

export type LegacyCommunitySnapshot = { ready: boolean; memberships: Membership[]; groups: Group[] };
type Pending = { inviteCode: string };
type Cached = { group: Group; membership: Membership };

// The owner must create community keys. Personal enrollment must not make an
// existing community disappear while its owner completes that separate step.
// Only identity and membership are read here; history and writes remain behind
// the encrypted adapter. The last identity is cached in encrypted local storage
// so it also survives the transition to a pending owner approval.
export function listenLegacyCommunities(uid: string, listener: (snapshot: LegacyCommunitySnapshot) => void, onError?: (error: Error) => void) {
  const cacheKey = `e2ee.legacy-communities.${uid}`;
  let active = true, legacyReady = false, pendingReady = false, cacheReady = false;
  let memberships: Record<string, Membership> = {}, pending: Record<string, Pending> = {}, cached: Record<string, Cached> = {};
  const liveGroups = new Map<string, Group | null>();
  const groupReady = new Set<string>();
  const failedGroups = new Set<string>();
  const legacyMembers = new Map<string, Record<string, Membership>>();
  const subscriptions = new Map<string, (() => void)[]>();
  const ids = () => [...new Set([...Object.keys(memberships), ...Object.keys(pending)])];
  const report = (error: Error) => { if (active) onError?.(error); };
  const emit = () => {
    if (!active || auth.currentUser?.uid !== uid) return;
    const groups: Group[] = [], visibleMemberships: Membership[] = [];
    for (const groupId of ids()) {
      const value = liveGroups.get(groupId);
      if (value === null && !pending[groupId]) continue;
      const last = cached[groupId];
      const group = value ?? last?.group ?? {
        id: groupId, name: "Your community", ownerId: "", inviteCode: pending[groupId]?.inviteCode ?? "", createdAt: "", updatedAt: "",
      };
      const source = memberships[groupId] ?? last?.membership ?? {
        id: `member_${uid}_${groupId}`, userId: uid, groupId, role: "member" as const, userName: "KOINO member", createdAt: group.createdAt,
      };
      const { image: _membershipImage, ...membership } = source;
      visibleMemberships.push(membership);
      groups.push({ ...group, migrationPending: true, migrationAwaitingApproval: !!pending[groupId] && value === null });
    }
    listener({ ready: legacyReady && pendingReady && cacheReady && ids().every((groupId) => groupReady.has(groupId)), memberships: visibleMemberships, groups });
  };
  const save = () => { if (cacheReady) void storage.setItem(cacheKey, JSON.stringify(cached)).catch(report); };
  const sync = () => {
    const currentIds = new Set(ids());
    for (const [groupId, stops] of subscriptions) if (!currentIds.has(groupId)) {
      stops.forEach((stop) => stop()); subscriptions.delete(groupId); liveGroups.delete(groupId); groupReady.delete(groupId); failedGroups.delete(groupId); legacyMembers.delete(groupId);
    }
    for (const groupId of currentIds) {
      if (subscriptions.has(groupId)) {
        if (pending[groupId] && failedGroups.has(groupId)) { liveGroups.set(groupId, null); groupReady.add(groupId); }
        continue;
      }
      const stops: (() => void)[] = [];
      subscriptions.set(groupId, stops);
      stops.push(Raw.onValue(Raw.ref(database, `groups/${groupId}`), (snapshot) => {
        if (!active) return;
        const value = snapshot.val() as Group | null;
        if (value) {
          const { image: _legacyImage, ...group } = value;
          const previous = cached[groupId];
          const current = { ...group, migrationOwnerName: legacyMembers.get(groupId)?.[group.ownerId]?.userName ?? previous?.group.migrationOwnerName };
          liveGroups.set(groupId, current);
          if (memberships[groupId]) cached[groupId] = { group: current, membership: memberships[groupId] };
          save();
        } else liveGroups.set(groupId, null);
        failedGroups.delete(groupId); groupReady.add(groupId); emit();
      }, (error) => {
        if (!active) return;
        failedGroups.add(groupId);
        // Legacy access closes after migration. A server pending marker and the
        // local encrypted identity still describe the same community.
        if (pending[groupId]) { liveGroups.set(groupId, null); groupReady.add(groupId); emit(); }
        else report(error);
      }));
      stops.push(Raw.onValue(Raw.ref(database, `groupMembers/${groupId}`), (snapshot) => {
        if (!active) return;
        legacyMembers.set(groupId, snapshot.val() ?? {});
        const group = liveGroups.get(groupId) ?? cached[groupId]?.group;
        const ownerName = group && snapshot.child(group.ownerId).child("userName").val();
        if (!group || typeof ownerName !== "string") return;
        const next = { ...group, migrationOwnerName: ownerName };
        if (liveGroups.get(groupId)) liveGroups.set(groupId, next);
        if (cached[groupId]) cached[groupId].group = next;
        save(); emit();
      }, () => { /* Legacy membership reads close during owner migration. */ }));
    }
    emit();
  };
  void storage.getItem(cacheKey).then((value) => {
    if (!active) return;
    const saved = value ? JSON.parse(value) as Record<string, Cached> : {};
    cached = { ...saved, ...cached }; cacheReady = true; save(); emit();
  }).catch((error: Error) => { cacheReady = true; report(error); emit(); });
  const legacySubscription = Raw.onValue(Raw.ref(database, `userGroups/${uid}`), (snapshot) => {
    if (!active) return;
    memberships = snapshot.val() ?? {}; legacyReady = true; sync();
  }, report);
  const pendingSubscription = Raw.onValue(Raw.ref(database, `e2eePendingGroups/${uid}`), (snapshot) => {
    if (!active) return;
    pending = snapshot.val() ?? {}; pendingReady = true; sync();
  }, report);
  return () => { active = false; legacySubscription(); pendingSubscription(); subscriptions.forEach((stops) => stops.forEach((stop) => stop())); };
}
