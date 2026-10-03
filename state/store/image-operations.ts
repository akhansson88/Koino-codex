import { get, ref, update } from "@/state/encryption/database";
import { deleteRoomImage, deleteUserAvatar } from "@/state/supabase-storage";
import { Id, Membership } from "@/state/types";
import { type Profile } from "@/state/store/types";
import { database } from "@/state/store/firebase";
import { asArray } from "@/state/store/helpers";

export async function localUriToArrayBuffer(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error("Could not read the selected image.");
  }
  return response.arrayBuffer();
}

export async function deleteRoomStoragePath(path?: string) {
  if (!path) return;
  try {
    await deleteRoomImage(path);
  } catch {
    // Storage cleanup should never undo the community image metadata update.
  }
}

export async function deleteUserAvatarStoragePath(path?: string) {
  if (!path) return;
  try {
    await deleteUserAvatar(path);
  } catch {
    // Storage cleanup should never undo the profile metadata update.
  }
}

async function userMembershipImageUpdates(userId: Id, image: Profile["image"] | null) {
  const userGroupsSnapshot = await get(ref(database, `userGroups/${userId}`));
  return asArray<Membership>(userGroupsSnapshot.val()).reduce<Record<string, Profile["image"] | null>>((updates, membership) => {
    if (membership.image?.url === image?.url) return updates;

    updates[`groupMembers/${membership.groupId}/${userId}/image`] = image;
    updates[`userGroups/${userId}/${membership.groupId}/image`] = image;
    return updates;
  }, {});
}

export async function syncUserMembershipImage(userId: Id, image: Profile["image"] | null) {
  const updates = await userMembershipImageUpdates(userId, image);
  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }
}

export async function profileAndMembershipImageUpdates(userId: Id, image: Profile["image"] | null) {
  return {
    [`profiles/${userId}/image`]: image,
    ...(await userMembershipImageUpdates(userId, image)),
  };
}
