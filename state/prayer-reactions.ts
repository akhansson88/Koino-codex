import type { Id, PrayerReaction } from "@/state/types";

function reactionTimestamp(reaction: PrayerReaction) {
  const timestamp = Date.parse(reaction.createdAt);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function canonicalReactionId(reaction: PrayerReaction) {
  return `${reaction.userId}_${reaction.targetType}_${reaction.targetId}`;
}

function preferredReaction(current: PrayerReaction, candidate: PrayerReaction) {
  const currentIsCanonical = current.id === canonicalReactionId(current);
  const candidateIsCanonical = candidate.id === canonicalReactionId(candidate);

  if (candidateIsCanonical !== currentIsCanonical) return candidateIsCanonical ? candidate : current;
  return reactionTimestamp(candidate) < reactionTimestamp(current) ? candidate : current;
}

export function prayerReactionsForTarget(
  reactions: readonly PrayerReaction[],
  targetType: PrayerReaction["targetType"],
  targetId: Id,
) {
  const reactionByUserId = new Map<Id, PrayerReaction>();

  reactions.forEach((reaction) => {
    if (reaction.targetType !== targetType || reaction.targetId !== targetId) return;

    const current = reactionByUserId.get(reaction.userId);
    reactionByUserId.set(reaction.userId, current ? preferredReaction(current, reaction) : reaction);
  });

  return [...reactionByUserId.values()];
}
