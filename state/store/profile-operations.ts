import * as FirebaseAuth from "@firebase/auth";
import type { User as FirebaseUser } from "@firebase/auth";
import { get as getRaw, ref as rawRef } from "firebase/database";
import { get, ref, update } from "@/state/encryption/database";
import { normalizeTheme } from "@/ui/theme";
import { Group, Membership } from "@/state/types";
import { now, id, inviteCode } from "@/state/store/helpers";
import { auth, database } from "@/state/store/firebase";
import { type Profile } from "@/state/store/types";
import { createEncryptedGroup, groupJoinRequest, sessionGeneration } from "@/state/encryption/session";
import { encodeAt } from "@/state/encryption/database";

export async function hasLegacyOnboardingProfile(userId: string): Promise<boolean> {
  return (await getRaw(rawRef(database, `profiles/${userId}/id`))).val() === userId;
}

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

function assertCommunityCreationSession(userId: string, generation: number) {
  if (auth.currentUser?.uid !== userId || sessionGeneration() !== generation) {
    throw new Error("The account changed while creating a community.");
  }
}

export async function hasOnboardingCommunity(userId: string, groupId: string): Promise<boolean> {
  const generation = sessionGeneration();
  assertCommunityCreationSession(userId, generation);
  const membership = (await get(ref(database, `userGroups/${userId}/${groupId}`))).val() as Membership | null;
  assertCommunityCreationSession(userId, generation);
  if (!membership) return false;
  if (membership.userId !== userId || membership.groupId !== groupId || membership.role !== "owner") {
    throw new Error("Community ownership could not be confirmed.");
  }
  return true;
}

export async function createGroupForUser(user: FirebaseUser, name: string, userName?: string, onboardingGroupId?: string) {
  const groupName = name.trim();
  if (!groupName) return;

  const generation = sessionGeneration();
  assertCommunityCreationSession(user.uid, generation);
  if (onboardingGroupId && await hasOnboardingCommunity(user.uid, onboardingGroupId)) return;
  assertCommunityCreationSession(user.uid, generation);
  const userProfile = await ensureProfile(user, userName);
  assertCommunityCreationSession(user.uid, generation);

  const timestamp = now();
  const groupId = onboardingGroupId ?? id("group");
  const code = inviteCode();
  const group: Group = {
    id: groupId,
    name: groupName,
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

  try {
    await createEncryptedGroup(groupId, () => ({
      group: encodeAt(`groups/${groupId}`, group),
      membership: encodeAt(`groupMembers/${groupId}/${user.uid}`, membership),
      userMembership: encodeAt(`userGroups/${user.uid}/${groupId}`, membership),
    }));
  } catch (error) {
    // The callable may have committed before a lost response or backup failure.
    // Only this onboarding attempt's verified owner membership is a receipt.
    assertCommunityCreationSession(user.uid, generation);
    if (!onboardingGroupId || !await hasOnboardingCommunity(user.uid, onboardingGroupId)) throw error;
  }
  assertCommunityCreationSession(user.uid, generation);
}

export async function joinGroupByInvite(user: FirebaseUser, code: string, userName?: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) throw new Error("Enter a community invite code.");

  const generation = sessionGeneration();
  const userProfile = await ensureProfile(user, userName);
  if (auth.currentUser?.uid !== user.uid || sessionGeneration() !== generation) throw new Error("The account changed while joining a community.");
  return groupJoinRequest(normalizedCode, userProfile.name);
}
