import type { FeatherName } from "@/ui/app-components/types";
import type { TranslationKey } from "@/ui/translations/types";
import type { Group, GroupRole, Id, Membership } from "@/state/types";

export function groupRoleFor(
  group: Group | undefined,
  membership: Membership | undefined,
  userId: Id | undefined,
): GroupRole | undefined {
  if (!group || !userId) return undefined;
  if (group.ownerId === userId) return "owner";
  if (membership?.role === "leader" || membership?.role === "member") {
    return membership.role;
  }
  if (membership?.role === "owner") return "member";
  return undefined;
}

export function canManageGroupLeaders(role: GroupRole | undefined) {
  return role === "owner";
}

export function canViewGroupStatistics(role: GroupRole | undefined) {
  return role === "owner" || role === "leader";
}

/** The host always decides; a group leader only while the host grants it. */
export function canApproveJoinRequests(role: GroupRole | undefined, group: Group | undefined) {
  if (!group) return false;
  if (role === "owner") return true;
  return role === "leader" && group.joinApprovers === "owner_and_leaders";
}

export function groupRoleLabelKey(role: GroupRole): TranslationKey {
  if (role === "owner") return "community.members.role.host";
  if (role === "leader") return "community.members.role.leader";
  return "community.members.role.member";
}

export function groupRoleIcon(role: GroupRole): FeatherName | undefined {
  if (role === "owner") return "home";
  if (role === "leader") return "award";
  return undefined;
}

export function groupRoleTone(role: GroupRole): "orange" | "green" | "pink" | "blue" {
  if (role === "owner") return "orange";
  if (role === "leader") return "pink";
  return "green";
}
