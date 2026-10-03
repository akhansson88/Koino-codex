import * as FirebaseAuth from "@firebase/auth";
import type { User as FirebaseUser } from "@firebase/auth";
import { get, ref, update } from "@/state/encryption/database";
import { normalizeTheme } from "@/ui/theme";
import { Group, Membership } from "@/state/types";
import { now, id, inviteCode } from "@/state/store/helpers";
import { database } from "@/state/store/firebase";
import { type Profile } from "@/state/store/types";
import { createEncryptedGroup, groupJoinRequest } from "@/state/encryption/session";
import { encodeAt } from "@/state/encryption/database";

export async function ensureProfile(user: FirebaseUser, name?: string) {
  const timestamp = now();
  const profileRef = ref(database, `profiles/${user.uid}`);
  const snapshot = await get(profileRef);
  const existing = snapshot.val() as Profile | null;
  const resolvedName = name?.trim() || existing?.name || user.displayName || user.email?.split("@")[0] || "KOINO member";

  await update(profileRef, {
    id: user.uid,
    name: resolvedName,
    createdAt: existing?.createdAt ?? timestamp,
    theme: normalizeTheme(existing?.theme),
  });

  if (user.displayName) {
    await FirebaseAuth.updateProfile(user, { displayName: null });
  }

  return {
    ...existing,
    id: user.uid,
    name: resolvedName,
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
    userName: userProfile.name,
    ...(userProfile.image ? { image: userProfile.image } : {}),
    createdAt: timestamp,
  };

  // Generate keys before encoding the creation records; the callback runs only
  // after the new group's keys are available locally.
  await createEncryptedGroup(groupId, () => ({
    group: encodeAt(`groups/${groupId}`, group),
    membership: encodeAt(`groupMembers/${groupId}/${user.uid}`, membership),
    userMembership: encodeAt(`userGroups/${user.uid}/${groupId}`, membership),
  }));
}

export async function joinGroupByInvite(user: FirebaseUser, code: string, userName?: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) throw new Error("Enter a community invite code.");

  const userProfile = await ensureProfile(user, userName);
  await groupJoinRequest(normalizedCode, userProfile.name);
}
