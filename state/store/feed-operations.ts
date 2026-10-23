import { get, ref, update } from "@/state/encryption/database";
import { Id, PostReaction, PrayerReaction, Reply } from "@/state/types";
import { database } from "@/state/store/firebase";
import { asArray } from "@/state/store/helpers";

export async function deleteFeedItemWithChildren(groupId: Id, targetType: "post" | "check_in", targetId: Id, _ownerId: Id) {
  const [replySnapshot, reactionSnapshot, postReactionSnapshot] = await Promise.all([
    get(ref(database, `replies/${groupId}`)),
    get(ref(database, `prayerReactions/${groupId}`)),
    get(ref(database, `postReactions/${groupId}`)),
  ]);
  const childDeletes: Record<string, null> = {};
  const childReplyIds = new Set<string>();

  asArray<Reply>(replySnapshot.val())
    .filter((reply) => reply.targetType === targetType && reply.targetId === targetId)
    .forEach((reply) => {
      childReplyIds.add(reply.id);
      childDeletes[`replies/${groupId}/${reply.id}`] = null;
    });

  asArray<PrayerReaction>(reactionSnapshot.val())
    .filter((reaction) => reaction.targetType === "reply" && childReplyIds.has(reaction.targetId))
    .forEach((reaction) => {
      childDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
    });

  asArray<PrayerReaction>(reactionSnapshot.val())
    .filter((reaction) => reaction.targetType === targetType && reaction.targetId === targetId)
    .forEach((reaction) => {
      childDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
    });

  asArray<PostReaction>(postReactionSnapshot.val())
    .filter((reaction) => reaction.targetType === targetType && reaction.targetId === targetId)
    .forEach((reaction) => {
      childDeletes[`postReactions/${groupId}/${reaction.id}`] = null;
    });

  // Preserve author self-delete, including other members' children, in one
  // rules-authorized cascade. No owner moderation privilege is used here.
  await update(ref(database), {
    ...childDeletes,
    [`${targetType === "post" ? "posts" : "checkIns"}/${groupId}/${targetId}`]: null,
  });
}
