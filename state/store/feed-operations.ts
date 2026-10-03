import { get, ref, remove, update } from "@/state/encryption/database";
import { Id, PostReaction, PrayerReaction, Reply } from "@/state/types";
import { database } from "@/state/store/firebase";
import { asArray } from "@/state/store/helpers";

export async function deleteFeedItemWithChildren(groupId: Id, targetType: "post" | "check_in", targetId: Id, ownerId: Id) {
  const [replySnapshot, reactionSnapshot, postReactionSnapshot] = await Promise.all([
    get(ref(database, `replies/${groupId}`)),
    get(ref(database, `prayerReactions/${groupId}`)),
    get(ref(database, `postReactions/${groupId}`)),
  ]);
  const childDeletes: Record<string, null> = {};
  const ownedChildDeletes: Record<string, null> = {};
  const childReplyIds = new Set<string>();

  asArray<Reply>(replySnapshot.val())
    .filter((reply) => reply.targetType === targetType && reply.targetId === targetId)
    .forEach((reply) => {
      childReplyIds.add(reply.id);
      childDeletes[`replies/${groupId}/${reply.id}`] = null;
      if (reply.userId === ownerId) {
        ownedChildDeletes[`replies/${groupId}/${reply.id}`] = null;
      }
    });

  asArray<PrayerReaction>(reactionSnapshot.val())
    .filter((reaction) => reaction.targetType === "reply" && childReplyIds.has(reaction.targetId))
    .forEach((reaction) => {
      childDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
      if (reaction.userId === ownerId) {
        ownedChildDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
      }
    });

  asArray<PrayerReaction>(reactionSnapshot.val())
    .filter((reaction) => reaction.targetType === targetType && reaction.targetId === targetId)
    .forEach((reaction) => {
      childDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
      if (reaction.userId === ownerId) {
        ownedChildDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
      }
    });

  asArray<PostReaction>(postReactionSnapshot.val())
    .filter((reaction) => reaction.targetType === targetType && reaction.targetId === targetId)
    .forEach((reaction) => {
      childDeletes[`postReactions/${groupId}/${reaction.id}`] = null;
      if (reaction.userId === ownerId) {
        ownedChildDeletes[`postReactions/${groupId}/${reaction.id}`] = null;
      }
    });

  if (Object.keys(childDeletes).length > 0) {
    try {
      await update(ref(database), childDeletes);
    } catch (error) {
      if (Object.keys(ownedChildDeletes).length === 0) {
        throw error;
      }
      await update(ref(database), ownedChildDeletes);
    }
  }

  await remove(ref(database, `${targetType === "post" ? "posts" : "checkIns"}/${groupId}/${targetId}`));
}
