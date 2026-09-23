import * as FirebaseAuth from "@firebase/auth";
import type { User as FirebaseUser } from "@firebase/auth";
import { get, ref, set, update } from "firebase/database";
import { normalizeTheme } from "@/ui/theme";
import { Group, Membership } from "@/state/types";
import { now, id, inviteCode } from "@/state/store/helpers";
import { database } from "@/state/store/firebase";
import { type Profile } from "@/state/store/types";

export async function ensureProfile(user: FirebaseUser, name?: string) {
  const timestamp = now();
  const profileRef = ref(database, `profiles/${user.uid}`);
  const snapshot = await get(profileRef);
  const existing = snapshot.val() as Profile | null;
  const resolvedName = name?.trim() || existing?.name || user.displayName || user.email?.split("@")[0] || "KOINO member";

  await update(profileRef, {
    id: user.uid,
    name: resolvedName,
    email: user.email ?? null,
    createdAt: existing?.createdAt ?? timestamp,
    theme: normalizeTheme(existing?.theme),
  });

  if (name?.trim() && user.displayName !== resolvedName) {
    await FirebaseAuth.updateProfile(user, { displayName: resolvedName });
  }

  return {
    ...existing,
    id: user.uid,
    name: resolvedName,
    email: user.email ?? null,
    createdAt: existing?.createdAt ?? timestamp,
    theme: normalizeTheme(existing?.theme),
  } satisfies Profile;
}

export async function createGroupForUser(user: FirebaseUser, name: string, userName?: string) {
  if (!name.trim()) return;

  const userProfile = await ensureProfile(user, userName);

  const timestamp = now();
  const groupId = id("group");
  const code = inviteCode();
  const group: Group = {
    id: groupId,
    name: name.trim(),
    inviteCode: code,
    ownerId: user.uid,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const membership: Membership = {
    id: id("membership"),
    userId: user.uid,
    groupId,
    role: "owner",
    userName: userName?.trim() || user.displayName || user.email?.split("@")[0] || "KOINO member",
    ...(userProfile.image ? { image: userProfile.image } : {}),
    createdAt: timestamp,
  };

  await set(ref(database, `groups/${groupId}`), group);
  await set(ref(database, `inviteCodes/${code}`), { groupId, createdAt: timestamp });
  await update(ref(database), {
    [`groupMembers/${groupId}/${user.uid}`]: membership,
    [`userGroups/${user.uid}/${groupId}`]: membership,
    [`profiles/${user.uid}/currentGroupId`]: groupId,
  });
}

export async function joinGroupByInvite(user: FirebaseUser, code: string, userName?: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) throw new Error("Enter a community invite code.");

  const userProfile = await ensureProfile(user, userName);

  const inviteSnapshot = await get(ref(database, `inviteCodes/${normalizedCode}`));
  const invite = inviteSnapshot.val() as { groupId?: string } | null;
  if (!invite?.groupId) throw new Error("No community exists for that invite code.");

  const timestamp = now();
  const membership: Membership = {
    id: id("membership"),
    userId: user.uid,
    groupId: invite.groupId,
    role: "member",
    userName: userName?.trim() || user.displayName || user.email?.split("@")[0] || "KOINO member",
    ...(userProfile.image ? { image: userProfile.image } : {}),
    createdAt: timestamp,
  };

  await update(ref(database), {
    [`groupMembers/${invite.groupId}/${user.uid}`]: membership,
    [`userGroups/${user.uid}/${invite.groupId}`]: membership,
    [`profiles/${user.uid}/currentGroupId`]: invite.groupId,
  });
}
