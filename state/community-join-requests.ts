export type JoinRequestReceipt = {
  groupId: string;
  status: "pending" | "approved" | "rejected";
};

export type CommunityJoinRequest = Omit<JoinRequestReceipt, "status"> & {
  status: JoinRequestReceipt["status"] | "closed";
  inviteHint?: string;
  updatedAt: number;
};

const listeners = new Set<(userId: string) => void>();

export function subscribeJoinRequestChanges(listener: (userId: string) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function announceJoinRequestChange(userId: string) {
  listeners.forEach((listener) => listener(userId));
}
