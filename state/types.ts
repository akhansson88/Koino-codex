export type Id = string;

export type User = {
  id: Id;
  name: string;
  createdAt: string;
};

export type Group = {
  id: Id;
  name: string;
  inviteCode: string;
  ownerId: Id;
  createdAt: string;
  updatedAt: string;
};

export type Membership = {
  id: Id;
  userId: Id;
  groupId: Id;
  role: "owner" | "member";
  userName: string;
  createdAt: string;
};

export type CheckIn = {
  id: Id;
  userId: Id;
  groupId: Id;
  mood: number;
  readToday: boolean;
  reflectionText: string;
  visibility: "private" | "group";
  createdAt: string;
};

export type Post = {
  id: Id;
  userId: Id;
  groupId: Id;
  body: string;
  createdAt: string;
};

export type TargetType = "post" | "check_in";

export type PrayerSession = {
  id: Id;
  userId: Id;
  targetType: TargetType;
  targetId: Id;
  startedAt: string;
  completedAt?: string;
  status: "completed" | "skipped";
};

export type PrayerReaction = {
  id: Id;
  userId: Id;
  targetType: TargetType;
  targetId: Id;
  createdAt: string;
};

export type Reply = {
  id: Id;
  userId: Id;
  targetType: TargetType;
  targetId: Id;
  body: string;
  createdAt: string;
};

export type JournalEntry = {
  id: Id;
  userId: Id;
  body: string;
  source: "manual" | "private_check_in";
  mood?: number;
  createdAt: string;
  updatedAt: string;
};

export type SupportIntent = {
  id: Id;
  userId: Id;
  amount: number;
  currency: "SEK";
  provider: "external_demo";
  providerReference: string;
  status: "created" | "confirmed";
  createdAt: string;
};

export type KoinoState = {
  ready: boolean;
  currentUserId?: Id;
  currentGroupId?: Id;
  authEmail?: string;
  authError?: string;
  users: User[];
  groups: Group[];
  memberships: Membership[];
  checkIns: CheckIn[];
  posts: Post[];
  prayerSessions: PrayerSession[];
  prayerReactions: PrayerReaction[];
  replies: Reply[];
  journalEntries: JournalEntry[];
  supportIntents: SupportIntent[];
};

export type FeedItem =
  | { type: "post"; id: Id; userId: Id; groupId: Id; body: string; createdAt: string }
  | {
      type: "check_in";
      id: Id;
      userId: Id;
      groupId: Id;
      body: string;
      mood: number;
      readToday: boolean;
      createdAt: string;
    };
