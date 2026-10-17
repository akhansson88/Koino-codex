import * as Raw from "firebase/database";
import { auth, database } from "@/state/store/firebase";
import type { Group, Membership } from "@/state/types";
import storage from "./local-storage";

export type LegacyCommunitySnapshot = { ready: boolean; memberships: Membership[]; groups: Group[] };

// Only pending admissions to encrypted communities remain. No legacy group or
// membership collection is read, and cached legacy identities are discarded.
export function listenLegacyCommunities(uid: string, listener: (snapshot: LegacyCommunitySnapshot) => void, onError?: (error: Error) => void) {
  let active = true;
  void storage.clearLegacyCommunities().catch((error: Error) => { if (active) onError?.(error); });
  const stop = Raw.onValue(Raw.ref(database, `e2eePendingGroups/${uid}`), (snapshot) => {
    if (!active || auth.currentUser?.uid !== uid) return;
    const groups: Group[] = [], memberships: Membership[] = [];
    for (const [groupId, entry] of Object.entries(snapshot.val() ?? {}) as [string, { inviteCode: string }][]) {
      groups.push({ id: groupId, name: "Your community", ownerId: "", inviteCode: entry.inviteCode, createdAt: "", updatedAt: "", migrationPending: true, migrationAwaitingApproval: true });
      memberships.push({ id: `member_${uid}_${groupId}`, userId: uid, groupId, role: "member", userName: "KOINO member", createdAt: "" });
    }
    listener({ ready: true, groups, memberships });
  }, onError);
  return () => { active = false; stop(); };
}
