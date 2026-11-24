export type CommunityRole = "owner" | "leader" | "member";

type GroupRecord = {
  ownerId?: unknown;
  members?: Record<string, { role?: unknown; joinedAt?: unknown }>;
};

export function communityRole(group: GroupRecord | null | undefined, userId: string | undefined): CommunityRole | undefined {
  if (!group || typeof userId !== "string" || !userId) return undefined;
  if (group.ownerId === userId) return "owner";
  const member = group.members?.[userId];
  if (!member) return undefined;
  if (member.role === "leader" || member.role === "member") return member.role;
  // The ownerId is the only authority for ownership. A stale "owner" role on
  // another member record never grants owner access.
  return "member";
}

export function canViewGroupStatistics(role: CommunityRole | undefined) {
  return role === "owner" || role === "leader";
}

export function leaderRoleUpdate({
  createdAt,
  groupId,
  mirror,
  role,
  targetUserId,
  updatedAt,
  userName,
}: {
  createdAt: string;
  groupId: string;
  mirror: Record<string, any> | null | undefined;
  role: "leader" | "member";
  targetUserId: string;
  updatedAt: string;
  userName: string;
}): Record<string, unknown> {
  const existing = mirror && typeof mirror === "object" ? mirror : {};
  const record = {
    ...existing,
    id: typeof existing.id === "string" ? existing.id : `membership_${targetUserId}_${groupId}`,
    userId: targetUserId,
    groupId,
    role,
    userName: typeof existing.userName === "string" && existing.userName.trim()
      ? existing.userName
      : userName,
    createdAt: typeof existing.createdAt === "string" ? existing.createdAt : createdAt,
  };
  return {
    [`e2eeGroups/${groupId}/members/${targetUserId}/role`]: role,
    [`encryptedData/groupMembers/${groupId}/${targetUserId}`]: record,
    [`encryptedData/userGroups/${targetUserId}/${groupId}`]: record,
    [`encryptedData/groups/${groupId}/updatedAt`]: updatedAt,
  };
}
