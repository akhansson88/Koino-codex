import type { StoredThemeName, ThemeName } from "@/ui/theme";
import type { BibleHighlightColor, CheckIn, BibleVerse, BiblePlanRange, EntryKind, Id, JournalEntryType, KoinoState, NotificationPreferences, PostReaction, PostReactionKind, PrayerReaction, PrayerSession, User, HeartMood } from "@/state/types";

export type Profile = User & {
  email?: string | null;
  currentGroupId?: Id | null;
  theme?: StoredThemeName;
};

export type CreatePostKind = EntryKind;

export type Action =
  | { type: "signIn"; email: string; password: string }
  | { type: "signUp"; email: string; password: string; name: string }
  | { type: "signOut" }
  | { type: "requestPasswordReset"; email: string }
  | { type: "confirmPasswordReset"; oobCode: string; newPassword: string }
  | { type: "changePassword"; currentPassword: string; newPassword: string }
  | { type: "createSession"; name: string; groupName?: string; inviteCode?: string }
  | { type: "createGroup"; name: string }
  | { type: "joinGroup"; inviteCode: string }
  | { type: "switchGroup"; id: Id }
  | { type: "leaveGroup"; id: Id }
  | { type: "removeGroupMember"; groupId: Id; userId: Id }
  | { type: "transferGroupOwnership"; groupId: Id; userId: Id }
  | { type: "updateGroup"; id: Id; name: string }
  | { type: "uploadGroupImage"; id: Id; localUri: string }
  | { type: "deleteGroupImage"; id: Id }
  | { type: "uploadUserAvatar"; localUri: string }
  | { type: "deleteUserAvatar" }
  | { type: "deleteGroup"; id: Id }
  | { type: "submitCheckIn"; mood: number; readToday: boolean; reflectionText: string; visibility: CheckIn["visibility"]; heartMood?: HeartMood; verse?: BibleVerse; verses?: BibleVerse[] }
  | { type: "updateCheckIn"; id: Id; mood: number; readToday: boolean; reflectionText: string; visibility: CheckIn["visibility"]; verse?: BibleVerse; verses?: BibleVerse[] }
  | { type: "deleteCheckIn"; id: Id }
  | { type: "createPost"; body: string; kind: CreatePostKind; title?: string; verse?: BibleVerse; verses?: BibleVerse[] }
  | { type: "editPost"; id: Id; body: string; kind: CreatePostKind; title?: string; verse?: BibleVerse; verses?: BibleVerse[] }
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
    }
  | { type: "unpray"; targetType: PrayerReaction["targetType"]; targetId: Id }
  | { type: "togglePostReaction"; targetType: PostReaction["targetType"]; targetId: Id; kind: PostReactionKind; mode?: "ensure" | "toggle" }
  | { type: "createReply"; targetType: "post" | "check_in"; targetId: Id; body: string; replyId?: Id }
  | { type: "deleteReply"; id: Id }

  | { type: "createJournalEntry"; body: string; entryKind?: EntryKind; journalType?: JournalEntryType; heartMood?: HeartMood; verse?: BibleVerse; verses?: BibleVerse[]; shareWithGroup?: boolean; title?: string }
  | { type: "updateJournalEntry"; id: Id; body: string; entryKind?: EntryKind; journalType?: JournalEntryType; heartMood?: HeartMood; verse?: BibleVerse; verses?: BibleVerse[]; sharedPostId?: Id; title?: string }
  | { type: "deleteJournalEntry"; id: Id }
  | { type: "saveVerse"; verse: BibleVerse }
  | { type: "removeSavedVerse"; id: Id }
  | { type: "highlightVerses"; color: BibleHighlightColor; colorId?: Id; verses: BibleVerse[] }
  | { type: "removeBibleHighlight"; id: Id }
  | { type: "removeBibleHighlights"; ids: Id[] }
  | { type: "saveBibleHighlightColor"; hex: BibleHighlightColor; id?: Id; label?: string }
  | { type: "deleteBibleHighlightColor"; id: Id }
  | { type: "createBiblePlan"; title: string; ranges: BiblePlanRange[]; dayCount: number; startDate: string }
  | { type: "updateBiblePlan"; id: Id; title: string; ranges: BiblePlanRange[]; dayCount: number; startDate: string }
  | { type: "deleteBiblePlan"; id: Id }
  | { type: "markBiblePlanDay"; planId: Id; dayNumber: number; read: boolean }
  | { type: "pauseBiblePlan"; planId: Id }
  | { type: "rescheduleBiblePlan"; planId: Id; startDate: string }
  | { type: "announceBiblePlan"; planId: Id }
  | { type: "unannounceBiblePlan"; announcementId: Id }
  | { type: "joinGroupBiblePlan"; announcementId: Id }
  | { type: "createSupportIntent"; amount: number }
  | { type: "loadOlderCommunityContent" }
  | { type: "loadOlderJournalEntries" }
  | { type: "loadOlderPrayerNotifications" }
  | { type: "markActivityNotificationRead"; id: Id }
  | { type: "markActivityDiscussionRead"; groupId: Id; targetType: "post" | "check_in"; targetId: Id }
  | { type: "markAllActivityNotificationsRead" }
  | { type: "registerPushToken"; token: string; platform: "android" | "ios" }
  | { type: "setDiscussionFollow"; targetType: "post" | "check_in"; targetId: Id; following: boolean }
  | { type: "setNotificationPreference"; key: keyof NotificationPreferences; value: boolean }
  | { type: "setTheme"; theme: ThemeName };

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
