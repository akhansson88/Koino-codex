import type { ThemeName } from "@/ui/theme";

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

export type BibleVerse = {
  reference: string;
  text: string;
  translation?: string;
};

export type EntryKind = "reflection" | "prayer_request" | "praise" | "update";

export type CheckIn = {
  id: Id;
  userId: Id;
  groupId: Id;
  mood: number;
  readToday: boolean;
  reflectionText: string;
  visibility: "private" | "group";
  verse?: BibleVerse;
  verses?: BibleVerse[];
  createdAt: string;
};

export type Post = {
  id: Id;
  userId: Id;
  groupId: Id;
  kind: EntryKind | "post";
  title?: string;
  body: string;
  verse?: BibleVerse;
  verses?: BibleVerse[];
  images?: string[];
  answeredAt?: string;
  answeredMarkedAt?: string;
  createdAt: string;
};

export type PrayerSessionTargetType = "post" | "check_in" | "journal_entry" | "reply";
export type PrayerReactionTargetType = "post" | "check_in" | "reply";
export type ReplyTargetType = "post" | "check_in";
export type CommentReactionKind = "amen" | "with_you" | "encouraged";

export type PrayerSession = {
  id: Id;
  userId: Id;
  targetType: PrayerSessionTargetType;
  targetId: Id;
  startedAt: string;
  completedAt?: string;
  status: "completed" | "skipped";
};

export type PrayerReaction = {
  id: Id;
  userId: Id;
  targetType: PrayerReactionTargetType;
  targetId: Id;
  createdAt: string;
};

export type Reply = {
  id: Id;
  userId: Id;
  targetType: ReplyTargetType;
  targetId: Id;
  body: string;
  createdAt: string;
};

export type CommentReaction = {
  id: Id;
  userId: Id;
  replyId: Id;
  kind: CommentReactionKind;
  createdAt: string;
};

export type JournalEntry = {
  id: Id;
  userId: Id;
  body: string;
  images?: string[];
  source: "manual" | "private_check_in";
  entryKind?: EntryKind;
  mood?: number;
  verse?: BibleVerse;
  verses?: BibleVerse[];
  sharedPostId?: Id;
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
  theme: ThemeName;
  users: User[];
  groups: Group[];
  groupMemberCounts: Record<Id, number>;
  memberships: Membership[];
  checkIns: CheckIn[];
  privateCheckIns: CheckIn[];
  posts: Post[];
  prayerSessions: PrayerSession[];
  prayerReactions: PrayerReaction[];
  replies: Reply[];
  commentReactions: CommentReaction[];
  journalEntries: JournalEntry[];
  supportIntents: SupportIntent[];
};

export type FeedItem =
  | {
      type: "post";
      id: Id;
      userId: Id;
      groupId: Id;
      kind: EntryKind | "post";
      title?: string;
      body: string;
      verse?: BibleVerse;
      verses?: BibleVerse[];
      images?: string[];
      answeredAt?: string;
      answeredMarkedAt?: string;
      createdAt: string;
    }
  | {
      type: "check_in";
      id: Id;
      userId: Id;
      groupId: Id;
      body: string;
      mood: number;
      readToday: boolean;
      verse?: BibleVerse;
      verses?: BibleVerse[];
      createdAt: string;
    };
