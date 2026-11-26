// Join policy and the join decision. Pure so both the callable and the unit
// tests share one rule: an old QR screenshot must never re-add someone the host
// removed, and an open community never grows past the community ceiling.
export type JoinPolicy = "approval" | "open";

export const DEFAULT_JOIN_POLICY: JoinPolicy = "approval";
export const MAX_GROUP_MEMBERS = 200;

export function parseJoinPolicy(value: unknown): JoinPolicy | undefined {
  return value === "approval" || value === "open" ? value : undefined;
}

/** Absent or unknown values keep the safe default: every existing group stays private. */
export function joinPolicyOrDefault(value: unknown): JoinPolicy {
  return parseJoinPolicy(value) ?? DEFAULT_JOIN_POLICY;
}

export function communityMemberCount(group: { members?: Record<string, unknown> } | null | undefined): number {
  return Object.keys(group?.members ?? {}).length;
}

export type JoinDecision = "already-member" | "rejected" | "open-join" | "full" | "pending";

export function decideJoin(input: {
  isMember: boolean;
  previousStatus?: string;
  joinPolicy: unknown;
  hasDeparted: boolean;
  memberCount: number;
}): JoinDecision {
  if (input.isMember) return "already-member";
  // A rejection is sticky: neither policy lets the same person back in by scanning.
  if (input.previousStatus === "rejected") return "rejected";
  if (joinPolicyOrDefault(input.joinPolicy) === "open" && !input.hasDeparted) {
    return input.memberCount >= MAX_GROUP_MEMBERS ? "full" : "open-join";
  }
  // A removed or departed member, an approval community, and a full open
  // community all go to the host as a fresh request.
  return "pending";
}

export type ResolvedJoinRequestStatus = "pending" | "approved" | "rejected" | "closed";

export function requestStatusOf(value: unknown): ResolvedJoinRequestStatus | undefined {
  const status = value && typeof value === "object" ? (value as { status?: unknown }).status : undefined;
  return status === "pending" || status === "approved" || status === "rejected" || status === "closed" ? status : undefined;
}

export function normalizeInviteCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}
