import { auth } from "@/state/store/firebase";
import type { Group, Membership } from "@/state/types";
import storage from "./local-storage";

export type LegacyCommunitySnapshot = { ready: boolean; memberships: Membership[]; groups: Group[] };

// Migration markers are not encrypted memberships. Retire the old local cache
// without turning a pending legacy admission into a selectable community.
export function listenLegacyCommunities(uid: string, listener: (snapshot: LegacyCommunitySnapshot) => void, onError?: (error: Error) => void) {
  let active = true;
  void storage.clearLegacyCommunities().then(() => {
    if (active && auth.currentUser?.uid === uid) listener({ ready: true, groups: [], memberships: [] });
  }).catch((error: Error) => { if (active) onError?.(error); });
  return () => { active = false; };
}
