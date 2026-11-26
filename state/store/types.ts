import type { JoinRequestReceipt } from "@/state/community-join-requests";
import type { EventDraft } from "@/state/events";
import type { AudioClip, BibleHighlightColor, CheckIn, BibleVerse, BiblePlanDay, BiblePlanRange, CommunityInvitePreview, EntryKind, EventRsvpStatus, GroupJoinApprovers, GroupJoinPolicy, Id, JournalEntryType, KoinoState, NotificationPreferences, Post, PostReaction, PostReactionKind, PrayerReaction, PrayerSession, User, HeartMood } from "@/state/types";

export type Profile = User & {
  email?: string | null;
  currentGroupId?: Id | null;
  theme?: string;
};

export type CreatePostKind = EntryKind;
type AccountGroupScope = { userId: Id; groupId: Id };
type JournalScope = { userId: Id; groupId?: Id };

export type CommunitySubmissionOutcome = {
  status: "success" | "failure" | "unknown";
  reason?: "precondition" | "conflict" | "rejected" | "transport" | "session";
};

// Opt-in only: ordinary dispatch callers retain their existing Promise<void>
// and error behavior. An attempt's identity and payload stay fixed on retry.
export type CommunitySubmissionRequest = {
  attemptId: string;
  userId: string;
  groupId: string;
  createdAt: string;
  baseline?: Post;
  previouslyUnknown: boolean;
  report: (outcome: CommunitySubmissionOutcome) => void;
};

export type Action =
  | { type: "signIn"; email: string; password: string }
  | { type: "signUp"; email: string; password: string; name: string }
  | { type: "signOut"; expectedUserId?: Id }
  | { type: "accountDeleted" }
  | { type: "requestPasswordReset"; email: string }
  | { type: "sendEmailVerification" }
  | { type: "refreshEmailVerification"; report?: (verified: boolean) => void }
  | { type: "confirmPasswordReset"; oobCode: string; newPassword: string }
  | { type: "changePassword"; currentPassword: string; newPassword: string }
  | { type: "createGroup"; name: string; expectedUserId?: Id }
  | { type: "joinGroup"; inviteCode: string; expectedUserId?: Id; report?: (receipt: JoinRequestReceipt) => void }
  | { type: "resolveInvite"; code: string; report?: (invite: CommunityInvitePreview) => void }
  | { type: "setJoinPolicy"; id: Id; joinPolicy: GroupJoinPolicy; joinApprovers: GroupJoinApprovers }
  | { type: "switchGroup"; id: Id }
  | { type: "leaveGroup"; id: Id }
  | { type: "removeGroupMember"; groupId: Id; userId: Id }
  | { type: "appointGroupLeader"; groupId: Id; userId: Id }
  | { type: "removeGroupLeader"; groupId: Id; userId: Id }
  | { type: "transferGroupOwnership"; groupId: Id; userId: Id }
  | { type: "updateGroup"; id: Id; name: string }
  | { type: "uploadGroupImage"; id: Id; localUri: string }
  | { type: "deleteGroupImage"; id: Id }
  | { type: "uploadUserAvatar"; localUri: string }
  | { type: "deleteUserAvatar" }
  | { type: "deleteGroup"; id: Id }
  | { type: "submitCheckIn"; mood: number; readToday: boolean; reflectionText: string; visibility: CheckIn["visibility"]; heartMood?: HeartMood; verse?: BibleVerse; verses?: BibleVerse[]; expectedScope?: AccountGroupScope }
  | { type: "updateCheckIn"; id: Id; mood: number; readToday: boolean; reflectionText: string; visibility: CheckIn["visibility"]; verse?: BibleVerse; verses?: BibleVerse[] }
  | { type: "deleteCheckIn"; id: Id }
  | { type: "createPost"; body: string; kind: CreatePostKind; title?: string; verse?: BibleVerse; verses?: BibleVerse[]; audio?: AudioClip; communitySubmission?: CommunitySubmissionRequest; expectedScope?: AccountGroupScope }
  | { type: "editPost"; id: Id; body: string; kind: CreatePostKind; title?: string; verse?: BibleVerse; verses?: BibleVerse[]; audio?: AudioClip | null; communitySubmission?: CommunitySubmissionRequest }
  | { type: "deletePost"; id: Id }
  | { type: "markPrayerAnswered"; id: Id; answeredUpdate?: string }
  | { type: "updatePrayerAnswer"; id: Id; answeredUpdate?: string }
  | { type: "unmarkPrayerAnswered"; id: Id }
  | {
      type: "finishPrayer";
      targetType: PrayerSession["targetType"];
      targetId: Id;
      status: PrayerSession["status"];
      startedAt: string;
      recipientUserId?: Id;
      throwOnError?: boolean;
      expectedScope?: AccountGroupScope;
    }
  | { type: "unpray"; targetType: PrayerReaction["targetType"]; targetId: Id }
  | { type: "togglePostReaction"; targetType: PostReaction["targetType"]; targetId: Id; kind: PostReactionKind; mode?: "ensure" | "toggle" }
  | { type: "createReply"; targetType: "post" | "check_in"; targetId: Id; body: string; audio?: AudioClip; replyId?: Id }
  | { type: "deleteReply"; id: Id }

  | { type: "createJournalEntry"; body: string; entryKind?: EntryKind; journalType?: JournalEntryType; heartMood?: HeartMood; verse?: BibleVerse; verses?: BibleVerse[]; audio?: AudioClip; shareWithGroup?: boolean; title?: string; journalScope?: JournalScope }
  | { type: "updateJournalEntry"; id: Id; body: string; entryKind?: EntryKind; journalType?: JournalEntryType; heartMood?: HeartMood; verse?: BibleVerse; verses?: BibleVerse[]; audio?: AudioClip | null; sharedPostId?: Id; title?: string; journalScope?: JournalScope }
  | { type: "deleteJournalEntry"; id: Id }
  | { type: "startFast"; startDate: string; durationDays: number; timeZone: string; alertEnabled: boolean }
  | { type: "updateFast"; id: Id; startDate: string; durationDays: number; timeZone: string; alertEnabled: boolean }
  | { type: "endFast"; id: Id }
  | { type: "acknowledgeFast"; id: Id }
  | { type: "saveVerse"; verse: BibleVerse }
  | { type: "removeSavedVerse"; id: Id }
  | { type: "highlightVerses"; color: BibleHighlightColor; colorId?: Id; verses: BibleVerse[] }
  | { type: "removeBibleHighlight"; id: Id }
  | { type: "removeBibleHighlights"; ids: Id[] }
  | { type: "saveBibleHighlightColor"; hex: BibleHighlightColor; id?: Id; label?: string }
  | { type: "deleteBibleHighlightColor"; id: Id }
  | { type: "createBiblePlan"; title: string; ranges: BiblePlanRange[]; dayCount: number; startDate: string; days?: BiblePlanDay[]; coverKey?: string; templateId?: string }
  | { type: "updateBiblePlan"; id: Id; title: string; ranges: BiblePlanRange[]; dayCount: number; startDate: string }
  | { type: "deleteBiblePlan"; id: Id }
  | { type: "markBiblePlanDay"; planId: Id; dayNumber: number; read: boolean }
  | { type: "pauseBiblePlan"; planId: Id }
  | { type: "rescheduleBiblePlan"; planId: Id; startDate: string }
  | { type: "restartBiblePlan"; planId: Id; startDate?: string }
  | { type: "announceBiblePlan"; planId: Id }
  | { type: "unannounceBiblePlan"; announcementId: Id }
  | { type: "joinGroupBiblePlan"; announcementId: Id }
  | { type: "createSupportIntent"; amount: number }
  | { type: "loadOlderCommunityContent" }
  | { type: "loadOlderJournalEntries" }
  | { type: "loadOlderPrayerNotifications" }
  | { type: "createEvent"; groupId: Id; draft: EventDraft }
  | { type: "updateEvent"; groupId: Id; id: Id; draft: EventDraft }
  | { type: "deleteEvent"; groupId: Id; id: Id }
  | { type: "setEventRsvp"; groupId: Id; eventId: Id; status: EventRsvpStatus }
  | { type: "markActivityNotificationRead"; id: Id }
  | { type: "markPrayerNotificationRead"; id: Id }
  | { type: "markAllPrayerNotificationsRead" }
  | { type: "markActivityDiscussionRead"; groupId: Id; targetType: "post" | "check_in"; targetId: Id }
  | { type: "markAllActivityNotificationsRead" }
  | { type: "registerPushToken"; token: string; platform: "android" | "ios" }
  | { type: "setDiscussionFollow"; targetType: "post" | "check_in"; targetId: Id; following: boolean }
  | { type: "setNotificationPreference"; key: keyof NotificationPreferences; value: boolean };

export type KoinoContextValue = {
  state: KoinoState;
  dispatch: (action: Action) => Promise<void>;
  getAuthToken: () => Promise<string | null>;
};

export type CommunityPageAvailability = {
  checkIns: boolean;
  posts: boolean;
  replies: boolean;
  prayerReactions: boolean;
  postReactions: boolean;
};
