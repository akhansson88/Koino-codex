import type { ThemeName } from "@/ui/theme";

export type Id = string;

export type User = {
  id: Id;
  name: string;
  image?: ProfileImage;
  createdAt: string;
};

export type GroupImage = {
  url: string;
  path: string;
  width: 512;
  height: 512;
  contentType: "image/webp";
  updatedAt: string;
};

export type ProfileImage = GroupImage;

export type Group = {
  id: Id;
  name: string;
  inviteCode: string;
  ownerId: Id;
  image?: GroupImage;
  createdAt: string;
  updatedAt: string;
};

export type Membership = {
  id: Id;
  userId: Id;
  groupId: Id;
  role: "owner" | "member";
  userName: string;
  image?: ProfileImage;
  createdAt: string;
};

export type ScriptureReference = {
  id?: Id;
  book?: string;
  chapter?: number;
  startVerse?: number;
  endVerse?: number;
  referenceText?: string;
  reference: string;
  text: string;
  translation?: string;
  contextBefore?: string;
  contextAfter?: string;
};

export type BibleVerse = ScriptureReference;

export type SavedVerse = ScriptureReference & {
  id: Id;
  savedAt: string;
};

export type BiblePassageReference = {
  id?: Id;
  book?: string;
  chapter?: number;
  startVerse?: number;
  endVerse?: number;
  reference: string;
  translation?: string;
};

export type BibleHighlightColor = string;

export type BibleHighlightPaletteColor = {
  id: Id;
  hex: BibleHighlightColor;
  label: string;
  createdAt: string;
  updatedAt: string;
};

export type BibleHighlight = {
  id: Id;
  colorId?: Id;
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  reference: string;
  translation?: string;
  color: BibleHighlightColor;
  createdAt: string;
  updatedAt: string;
};

export type BiblePlanPosition = {
  book: string;
  chapter: number;
  verse: number;
};

export type BiblePlanRange = {
  id: Id;
  displayReference: string;
  start: BiblePlanPosition;
  end: BiblePlanPosition;
};

export type BiblePlanDay = {
  dayNumber: number;
  ranges: BiblePlanRange[];
  scheduledDate?: string;
  completedAt?: string;
};

export type BiblePlanStatus = "saved" | "active" | "completed";
export type BiblePlanSource = "personal" | "group";

export type BiblePlan = {
  pausedAt?: string;
  id: Id;
  userId: Id;
  title: string;
  source: BiblePlanSource;
  status: BiblePlanStatus;
  startDate: string;
  dayCount: number;
  ranges: BiblePlanRange[];
  days: BiblePlanDay[];
  groupId?: Id;
  announcementId?: Id;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type GroupBiblePlanAnnouncement = {
  id: Id;
  groupId: Id;
  ownerId: Id;
  title: string;
  startDate: string;
  dayCount: number;
  ranges: BiblePlanRange[];
  days: BiblePlanDay[];
  createdAt: string;
  updatedAt: string;
};

export type GroupBiblePlanParticipation = {
  id: Id;
  announcementId: Id;
  completedDayNumbers: Record<string, true>;
  totalDays: number;
  joinedAt: string;
  updatedAt: string;
};

export type EntryKind = "reflection" | "prayer_request" | "prayer_moment" | "praise" | "update" | "scripture";
export type JournalEntryType = "reflection" | "prayer" | "answered_prayer" | "heart_checkin" | "scripture_note";
export type HeartMood = "peaceful" | "grateful" | "heavy" | "anxious" | "hopeful" | "tired";

export type CheckIn = {
  id: Id;
  userId: Id;
  groupId: Id;
  dayKey?: string;
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
  answeredUpdate?: string;
  createdAt: string;
};

export type PrayerSessionTargetType = "post" | "check_in" | "journal_entry" | "reply" | "user";
export type PrayerReactionTargetType = "post" | "check_in" | "reply";
export type PostReactionTargetType = "post" | "check_in";
export type PostReactionKind = Exclude<EntryKind, "prayer_request" | "prayer_moment">;
export type ReplyTargetType = "post" | "check_in";
export type PrayerSession = {
  id: Id;
  userId: Id;
  targetType: PrayerSessionTargetType;
  targetId: Id;
  recipientUserId?: Id;
  startedAt: string;
  completedAt?: string;
  status: "completed" | "skipped";
};

export type PrayerNotification = {
  id: Id;
  userId: Id;
  recipientUserId: Id;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  createdAt: string;
};

export type ActivityNotification = {
  id: Id;
  type: "comment" | "mention" | "discussion_activity";
  reason: "owner" | "participant" | "mention";
  priority: "normal" | "high";
  bundleKey: string;
  actorUserId: Id;
  actorName: string;
  actorImage?: GroupImage;
  targetOwnerName: string;
  recipientUserId: Id;
  groupId: Id;
  targetType: ReplyTargetType;
  targetId: Id;
  replyId: Id;
  contentLabel: "post" | "reflection" | "prayer request" | "prayer" | "praise" | "check-in" | "update" | "scripture reflection";
  preview: string;
  createdAt: string;
  readAt?: string;
};

export type NotificationPreferences = {
  pushEnabled: boolean;
  ownContent: boolean;
  mentions: boolean;
  followedDiscussions: boolean;
  prayerActivity: boolean;
};

export type PrayerReaction = {
  id: Id;
  userId: Id;
  targetType: PrayerReactionTargetType;
  targetId: Id;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  createdAt: string;
};

export type PostReaction = {
  id: Id;
  userId: Id;
  targetType: PostReactionTargetType;
  targetId: Id;
  kind: PostReactionKind;
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

export type DiscussionFollow = {
  id: Id;
  userId: Id;
  targetType: ReplyTargetType;
  targetId: Id;
  createdAt: string;
};

export type JournalEntry = {
  id: Id;
  userId: Id;
  journalType?: JournalEntryType;
  title?: string;
  body: string;
  images?: string[];
  source: "manual" | "private_check_in";
  entryKind?: EntryKind;
  mood?: number;
  heartMood?: HeartMood;
  verse?: BibleVerse;
  verses?: BibleVerse[];
  passage?: BiblePassageReference;
  sharedPostId?: Id;
  linkedPrayerRequestId?: Id;
  isPrivate?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CheckInDailyClaim = {
  dayKey: string;
  checkInId: Id;
  visibility: CheckIn["visibility"];
  status: "pending" | "committed";
  createdAt: number;
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
  authReady: boolean;
  profileReady: boolean;
  userGroupsReady: boolean;
  currentUserId?: Id;
  currentGroupId?: Id;
  authEmail?: string;
  authError?: string;
  communityFeedError?: string;
  communityFeedGroupId?: Id;
  communityFeedOffline?: boolean;
  communityFeedReady: boolean;
  communityContentHasMore: boolean;
  communityContentLoadingMore: boolean;
  journalEntriesHasMore: boolean;
  journalEntriesLoadingMore: boolean;
  privateCheckInsReady: boolean;
  checkInDailyClaims: CheckInDailyClaim[];
  checkInDailyClaimsReady: boolean;
  prayerNotificationsHasMore: boolean;
  prayerNotificationsLoadingMore: boolean;
  theme: ThemeName;
  users: User[];
  groups: Group[];
  groupMemberCounts: Record<Id, number>;
  memberships: Membership[];
  checkIns: CheckIn[];
  privateCheckIns: CheckIn[];
  posts: Post[];
  prayerSessions: PrayerSession[];
  prayerNotifications: PrayerNotification[];
  activityNotifications: ActivityNotification[];
  notificationPreferences: NotificationPreferences;
  prayerReactions: PrayerReaction[];
  postReactions: PostReaction[];
  replies: Reply[];
  discussionFollows: DiscussionFollow[];
  journalEntries: JournalEntry[];
  savedVerses: SavedVerse[];
  bibleHighlights: BibleHighlight[];
  bibleHighlightColors: BibleHighlightPaletteColor[];
  biblePlans: BiblePlan[];
  groupBiblePlanAnnouncements: GroupBiblePlanAnnouncement[];
  groupBiblePlanParticipations: GroupBiblePlanParticipation[];
  groupBiblePlanParticipantIds: Record<Id, Id>;
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
      answeredUpdate?: string;
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
