import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirebaseError, initializeApp, getApp, getApps } from "firebase/app";
import * as FirebaseAuth from "@firebase/auth";
import type { Auth, User as FirebaseUser } from "@firebase/auth";
import { get, getDatabase, onValue, ref, remove, runTransaction, set, update } from "firebase/database";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { activePrivateCheckIns } from "@/state/check-ins";
import { biblePlanProgressUpdates, preserveBiblePlanProgress } from "@/state/bible-plan-progress";
import { isPlanDate, rescheduleBiblePlan } from "@/state/bible-plan-schedule";
import { buildBiblePlanDays, completedDayNumbers, planCompletionStatus } from "@/features/bible-plans";
import { normalizeSavedVerseRecords, savedVerseIdentity, savedVerseStorageId } from "@/state/saved-verses";
import { deleteRoomImage, deleteUserAvatar, roomImagePublicUrl, uploadRoomImage, uploadUserAvatar, userAvatarPublicUrl } from "@/state/supabase-storage";
import { applyTheme, normalizeTheme, StoredThemeName, ThemeName } from "@/ui/theme";
import {
  BibleHighlight,
  BibleHighlightColor,
  BibleHighlightPaletteColor,
  CheckIn,
  BibleVerse,
  BiblePlan,
  BiblePlanRange,
  EntryKind,
  GroupBiblePlanAnnouncement,
  GroupBiblePlanParticipation,
  Group,
  Id,
  JournalEntry,
  JournalEntryType,
  KoinoState,
  Membership,
  Post,
  PostReaction,
  PostReactionKind,
  PrayerNotification,
  PrayerReaction,
  PrayerSession,
  Reply,
  SavedVerse,
  SupportIntent,
  User,
  HeartMood,
} from "@/state/types";


const firebaseConfig = {
  apiKey: "AIzaSyCLLSGBYogHq7YqUx6an4JRTWRhU9Y950s",
  authDomain: "koino-codex.firebaseapp.com",
  databaseURL: "https://koino-codex-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "koino-codex",
  storageBucket: "koino-codex.firebasestorage.app",
  messagingSenderId: "181081151239",
  appId: "1:181081151239:web:e598ebe4e6e4493eac57a2",
  measurementId: "G-66WFNQ6Z29",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let authInstance: Auth;
try {
  authInstance = FirebaseAuth.getReactNativePersistence
    ? FirebaseAuth.initializeAuth(app, {
        persistence: FirebaseAuth.getReactNativePersistence(AsyncStorage),
      })
    : FirebaseAuth.getAuth(app);
} catch {
  authInstance = FirebaseAuth.getAuth(app);
}

const auth = authInstance;
const database = getDatabase(app);
const pendingCheckInKeys = new Set<string>();
const pendingPrayerCompletionKeys = new Set<string>();
const pendingSavedVerseDedupKeys = new Set<string>();
const passwordResetUrl = "https://koino-codex.firebaseapp.com/reset-password";
const themeStorageKey = "koino.theme";


type Profile = User & {
  email?: string | null;
  currentGroupId?: Id | null;
  theme?: StoredThemeName;
};


type CreatePostKind = EntryKind;

type Action =
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
  | { type: "setTheme"; theme: ThemeName };


type KoinoContextValue = {
  state: KoinoState;
  dispatch: (action: Action) => Promise<void>;
  getAuthToken: () => Promise<string | null>;
};

const KoinoContext = createContext<KoinoContextValue | null>(null);

function now() {
  return new Date().toISOString();
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function prayerReactionId(userId: Id, targetType: PrayerReaction["targetType"], targetId: Id) {
  return `${userId}_${targetType}_${targetId}`;
}

function isMatchingPrayerReaction(
  reaction: PrayerReaction,
  userId: Id,
  targetType: PrayerReaction["targetType"],
  targetId: Id,
) {
  return reaction.userId === userId && reaction.targetType === targetType && reaction.targetId === targetId;
}

function prayerSessionFromReaction(reaction: PrayerReaction, recipientUserId?: Id): PrayerSession {
  return {
    id: reaction.id,
    userId: reaction.userId,
    targetType: reaction.targetType,
    targetId: reaction.targetId,
    ...(recipientUserId ? { recipientUserId } : {}),
    startedAt: reaction.startedAt ?? reaction.createdAt,
    completedAt: reaction.completedAt ?? reaction.createdAt,
    status: "completed",
  };
}

function inviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function asArray<T extends { id: string }>(value: unknown): T[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, T>).map(([key, item]) => ({ ...item, id: item.id ?? key }));
}

function actionVerses(action: { verse?: BibleVerse; verses?: BibleVerse[] }) {
  if (action.verses?.length) return action.verses.slice(0, 5);
  return action.verse ? [action.verse] : [];
}

function postSupportsTitle(kind: CreatePostKind) {
  return kind === "prayer_request" || kind === "prayer_moment" || kind === "update";
}

function validPostContent(kind: CreatePostKind, body: string, verses: BibleVerse[]) {
  return kind === "scripture" ? verses.length > 0 : Boolean(body.trim());
}

function bibleReferenceStorageId(verse: Pick<BibleVerse, "reference" | "translation">) {
  return `${verse.reference}_${verse.translation ?? "default"}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const defaultBibleHighlightColors: BibleHighlightPaletteColor[] = [
  { id: "default_yellow", hex: "#FFF200", label: "Yellow", createdAt: "", updatedAt: "" },
  { id: "default_green", hex: "#4DF06A", label: "Green", createdAt: "", updatedAt: "" },
  { id: "default_cyan", hex: "#09C6DF", label: "Cyan", createdAt: "", updatedAt: "" },
  { id: "default_peach", hex: "#FFC166", label: "Peach", createdAt: "", updatedAt: "" },
];

function isBibleHighlightColor(value: unknown): value is BibleHighlightColor {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function normalizeHighlightColor(value: string) {
  return value.trim().toUpperCase();
}

function highlightColorLabel(value: string) {
  return value.trim().toUpperCase();
}

function authMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }

  switch (error.code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Try signing in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "The email or password did not match.";
    case "auth/weak-password":
      return "Use a password with at least 6 characters.";
    case "auth/expired-action-code":
      return "That reset link has expired. Request a new one from sign in.";
    case "auth/invalid-action-code":
      return "That reset link is invalid or has already been used. Request a new one from sign in.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a bit and try again.";
    case "auth/invalid-continue-uri":
    case "auth/unauthorized-continue-uri":
      return "The reset link URL needs to be authorized in Firebase.";
    case "auth/requires-recent-login":
      return "Please sign out and back in, then try changing your password again.";
    case "permission-denied":
      return "Firebase blocked that change. Check the database rules for this project.";
    default:
      return error.message;
  }
}

async function ensureProfile(user: FirebaseUser, name?: string) {
  const timestamp = now();
  const profileRef = ref(database, `profiles/${user.uid}`);
  const snapshot = await get(profileRef);
  const existing = snapshot.val() as Profile | null;
  const resolvedName = name?.trim() || existing?.name || user.displayName || user.email?.split("@")[0] || "KOINO member";

  await update(profileRef, {
    id: user.uid,
    name: resolvedName,
    email: user.email ?? null,
    createdAt: existing?.createdAt ?? timestamp,
    theme: normalizeTheme(existing?.theme),
  });

  if (name?.trim() && user.displayName !== resolvedName) {
    await FirebaseAuth.updateProfile(user, { displayName: resolvedName });
  }

  return {
    ...existing,
    id: user.uid,
    name: resolvedName,
    email: user.email ?? null,
    createdAt: existing?.createdAt ?? timestamp,
    theme: normalizeTheme(existing?.theme),
  } satisfies Profile;
}

async function createGroupForUser(user: FirebaseUser, name: string, userName?: string) {
  if (!name.trim()) return;

  const userProfile = await ensureProfile(user, userName);

  const timestamp = now();
  const groupId = id("group");
  const code = inviteCode();
  const group: Group = {
    id: groupId,
    name: name.trim(),
    inviteCode: code,
    ownerId: user.uid,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const membership: Membership = {
    id: id("membership"),
    userId: user.uid,
    groupId,
    role: "owner",
    userName: userName?.trim() || user.displayName || user.email?.split("@")[0] || "KOINO member",
    ...(userProfile.image ? { image: userProfile.image } : {}),
    createdAt: timestamp,
  };

  await set(ref(database, `groups/${groupId}`), group);
  await set(ref(database, `inviteCodes/${code}`), { groupId, createdAt: timestamp });
  await update(ref(database), {
    [`groupMembers/${groupId}/${user.uid}`]: membership,
    [`userGroups/${user.uid}/${groupId}`]: membership,
    [`profiles/${user.uid}/currentGroupId`]: groupId,
  });
}

async function joinGroupByInvite(user: FirebaseUser, code: string, userName?: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) throw new Error("Enter a community invite code.");

  const userProfile = await ensureProfile(user, userName);

  const inviteSnapshot = await get(ref(database, `inviteCodes/${normalizedCode}`));
  const invite = inviteSnapshot.val() as { groupId?: string } | null;
  if (!invite?.groupId) throw new Error("No community exists for that invite code.");

  const timestamp = now();
  const membership: Membership = {
    id: id("membership"),
    userId: user.uid,
    groupId: invite.groupId,
    role: "member",
    userName: userName?.trim() || user.displayName || user.email?.split("@")[0] || "KOINO member",
    ...(userProfile.image ? { image: userProfile.image } : {}),
    createdAt: timestamp,
  };

  await update(ref(database), {
    [`groupMembers/${invite.groupId}/${user.uid}`]: membership,
    [`userGroups/${user.uid}/${invite.groupId}`]: membership,
    [`profiles/${user.uid}/currentGroupId`]: invite.groupId,
  });
}

async function localUriToArrayBuffer(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error("Could not read the selected image.");
  }
  return response.arrayBuffer();
}

async function deleteRoomStoragePath(path?: string) {
  if (!path) return;
  try {
    await deleteRoomImage(path);
  } catch {
    // Storage cleanup should never undo the community image metadata update.
  }
}

async function deleteUserAvatarStoragePath(path?: string) {
  if (!path) return;
  try {
    await deleteUserAvatar(path);
  } catch {
    // Storage cleanup should never undo the profile metadata update.
  }
}

async function userMembershipImageUpdates(userId: Id, image: Profile["image"] | null) {
  const userGroupsSnapshot = await get(ref(database, `userGroups/${userId}`));
  return asArray<Membership>(userGroupsSnapshot.val()).reduce<Record<string, Profile["image"] | null>>((updates, membership) => {
    if (membership.image?.url === image?.url) return updates;

    updates[`groupMembers/${membership.groupId}/${userId}/image`] = image;
    updates[`userGroups/${userId}/${membership.groupId}/image`] = image;
    return updates;
  }, {});
}

async function syncUserMembershipImage(userId: Id, image: Profile["image"] | null) {
  const updates = await userMembershipImageUpdates(userId, image);
  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }
}

async function profileAndMembershipImageUpdates(userId: Id, image: Profile["image"] | null) {
  return {
    [`profiles/${userId}/image`]: image,
    ...(await userMembershipImageUpdates(userId, image)),
  };
}

async function deleteFeedItemWithChildren(groupId: Id, targetType: "post" | "check_in", targetId: Id, ownerId: Id) {
  const [replySnapshot, reactionSnapshot, postReactionSnapshot] = await Promise.all([
    get(ref(database, `replies/${groupId}`)),
    get(ref(database, `prayerReactions/${groupId}`)),
    get(ref(database, `postReactions/${groupId}`)),
  ]);
  const childDeletes: Record<string, null> = {};
  const ownedChildDeletes: Record<string, null> = {};
  const childReplyIds = new Set<string>();

  asArray<Reply>(replySnapshot.val())
    .filter((reply) => reply.targetType === targetType && reply.targetId === targetId)
    .forEach((reply) => {
      childReplyIds.add(reply.id);
      childDeletes[`replies/${groupId}/${reply.id}`] = null;
      if (reply.userId === ownerId) {
        ownedChildDeletes[`replies/${groupId}/${reply.id}`] = null;
      }
    });

  asArray<PrayerReaction>(reactionSnapshot.val())
    .filter((reaction) => reaction.targetType === "reply" && childReplyIds.has(reaction.targetId))
    .forEach((reaction) => {
      childDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
      if (reaction.userId === ownerId) {
        ownedChildDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
      }
    });

  asArray<PrayerReaction>(reactionSnapshot.val())
    .filter((reaction) => reaction.targetType === targetType && reaction.targetId === targetId)
    .forEach((reaction) => {
      childDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
      if (reaction.userId === ownerId) {
        ownedChildDeletes[`prayerReactions/${groupId}/${reaction.id}`] = null;
      }
    });

  asArray<PostReaction>(postReactionSnapshot.val())
    .filter((reaction) => reaction.targetType === targetType && reaction.targetId === targetId)
    .forEach((reaction) => {
      childDeletes[`postReactions/${groupId}/${reaction.id}`] = null;
      if (reaction.userId === ownerId) {
        ownedChildDeletes[`postReactions/${groupId}/${reaction.id}`] = null;
      }
    });

  if (Object.keys(childDeletes).length > 0) {
    try {
      await update(ref(database), childDeletes);
    } catch (error) {
      if (Object.keys(ownedChildDeletes).length === 0) {
        throw error;
      }
      await update(ref(database), ownedChildDeletes);
    }
  }

  await remove(ref(database, `${targetType === "post" ? "posts" : "checkIns"}/${groupId}/${targetId}`));
}

export function KoinoProvider({ children }: PropsWithChildren) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [userGroupsReady, setUserGroupsReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [userMemberships, setUserMemberships] = useState<Membership[]>([]);
  const [groupMemberCounts, setGroupMemberCounts] = useState<Record<Id, number>>({});
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [privateCheckIns, setPrivateCheckIns] = useState<CheckIn[]>([]);
  const [posts, setPosts] = useState<KoinoState["posts"]>([]);
  const [prayerSessions, setPrayerSessions] = useState<PrayerSession[]>([]);
  const [prayerNotifications, setPrayerNotifications] = useState<PrayerNotification[]>([]);
  const [prayerReactions, setPrayerReactions] = useState<PrayerReaction[]>([]);
  const [postReactions, setPostReactions] = useState<PostReaction[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>([]);
  const [bibleHighlights, setBibleHighlights] = useState<BibleHighlight[]>([]);
  const [bibleHighlightColors, setBibleHighlightColors] = useState<BibleHighlightPaletteColor[]>([]);
  const [biblePlans, setBiblePlans] = useState<BiblePlan[]>([]);
  const [groupBiblePlanAnnouncements, setGroupBiblePlanAnnouncements] = useState<GroupBiblePlanAnnouncement[]>([]);
  const [groupBiblePlanParticipations, setGroupBiblePlanParticipations] = useState<GroupBiblePlanParticipation[]>([]);
  const [groupBiblePlanParticipantIds, setGroupBiblePlanParticipantIds] = useState<Record<Id, Id>>({});
  const [supportIntents, setSupportIntents] = useState<SupportIntent[]>([]);
  const [authError, setAuthError] = useState<string>();
  const [communityFeedError, setCommunityFeedError] = useState<string>();
  const [communityFeedGroupId, setCommunityFeedGroupId] = useState<Id>();
  const [communityFeedOffline, setCommunityFeedOffline] = useState<boolean>();
  const [communityFeedReady, setCommunityFeedReady] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("light");
  const [themeReady, setThemeReady] = useState(false);
  const themeRef = useRef<ThemeName>("light");
  const hasStoredThemeRef = useRef(false);
  const isThemeSyncPendingRef = useRef(false);

  const clearUserSession = useCallback(() => {
    setFirebaseUser(null);
    setProfile(null);
    setProfileReady(true);
    setUserGroupsReady(true);
    setGroups([]);
    setUserMemberships([]);
    setGroupMemberCounts({});
    setMemberships([]);
    setCheckIns([]);
    setPrivateCheckIns([]);
    setPosts([]);
    setPrayerSessions([]);
    setPrayerNotifications([]);
    setPrayerReactions([]);
    setPostReactions([]);
    setReplies([]);
    setJournalEntries([]);
    setSavedVerses([]);
    setBibleHighlights([]);
    setBibleHighlightColors([]);
    setBiblePlans([]);
    setGroupBiblePlanAnnouncements([]);
    setGroupBiblePlanParticipations([]);
    setGroupBiblePlanParticipantIds({});
    setSupportIntents([]);
    setCommunityFeedError(undefined);
    setCommunityFeedGroupId(undefined);
    setCommunityFeedOffline(undefined);
    setCommunityFeedReady(true);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(themeStorageKey);
        hasStoredThemeRef.current = Boolean(storedTheme);
        const nextTheme = normalizeTheme(storedTheme);
        themeRef.current = nextTheme;
        applyTheme(nextTheme);
        setTheme(nextTheme);
      } finally {
        setThemeReady(true);
      }
    })();

    return FirebaseAuth.onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      setAuthError(undefined);

      if (!user) {
        clearUserSession();
      }

    });
  }, [clearUserSession]);

  useEffect(() => {
    themeRef.current = theme;
    applyTheme(theme);
    if (themeReady) {
      void AsyncStorage.setItem(themeStorageKey, theme);
    }
  }, [theme, themeReady]);

  useEffect(() => {
    if (!firebaseUser) return;

    setProfileReady(false);
    const profileRef = ref(database, `profiles/${firebaseUser.uid}`);
    const unsubscribe = onValue(profileRef, async (snapshot) => {
      if (!snapshot.exists()) {
        await ensureProfile(firebaseUser);
        return;
      }

      const nextProfile = snapshot.val() as Profile;
      setProfile(nextProfile);
      const nextTheme = normalizeTheme(nextProfile.theme);
      if (isThemeSyncPendingRef.current && nextTheme === themeRef.current) {
        isThemeSyncPendingRef.current = false;
      }
      if (!hasStoredThemeRef.current && !isThemeSyncPendingRef.current && nextTheme !== themeRef.current) {
        setTheme(nextTheme);
      }
      setProfileReady(true);
    });

    return unsubscribe;
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;

    setUserGroupsReady(false);
    const userGroupsRef = ref(database, `userGroups/${firebaseUser.uid}`);
    const unsubscribe = onValue(userGroupsRef, (snapshot) => {
      setUserMemberships(asArray<Membership>(snapshot.val()));
      setUserGroupsReady(true);
    });

    return unsubscribe;
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;

    if (userMemberships.length === 0) {
      setGroups([]);
      return;
    }

    const groupById = new Map<Id, Group>();
    const syncGroups = () => {
      setGroups(
        Array.from(groupById.values()).sort((a, b) => {
          const createdOrder = Date.parse(a.createdAt) - Date.parse(b.createdAt);
          return createdOrder || a.name.localeCompare(b.name);
        }),
      );
    };

    const unsubs = userMemberships.map((membership) =>
      onValue(ref(database, `groups/${membership.groupId}`), (snapshot) => {
        if (snapshot.exists()) {
          groupById.set(membership.groupId, snapshot.val() as Group);
        } else {
          groupById.delete(membership.groupId);
        }
        syncGroups();
      }),
    );

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [firebaseUser, userMemberships]);

  useEffect(() => {
    if (!firebaseUser) return;

    if (userMemberships.length === 0) {
      setGroupMemberCounts({});
      return;
    }

    const counts = Object.fromEntries(userMemberships.map((membership) => [membership.groupId, 0])) as Record<Id, number>;
    setGroupMemberCounts(counts);

    const syncCounts = () => {
      setGroupMemberCounts({ ...counts });
    };

    const unsubs = userMemberships.map((membership) =>
      onValue(ref(database, `groupMembers/${membership.groupId}`), (snapshot) => {
        counts[membership.groupId] = asArray<Membership>(snapshot.val()).length;
        syncCounts();
      }),
    );

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [firebaseUser, userMemberships]);

  useEffect(() => {
    if (!firebaseUser || !profileReady || !userGroupsReady) return;

    const joinedGroupIds = userMemberships.map((membership) => membership.groupId);
    if (joinedGroupIds.length === 0) {
      if (profile?.currentGroupId) {
        void update(ref(database, `profiles/${firebaseUser.uid}`), { currentGroupId: null });
      }
      return;
    }

    if (!profile?.currentGroupId || !joinedGroupIds.includes(profile.currentGroupId)) {
      void update(ref(database, `profiles/${firebaseUser.uid}`), { currentGroupId: joinedGroupIds[0] });
    }
  }, [firebaseUser, profile?.currentGroupId, profileReady, userGroupsReady, userMemberships]);

  useEffect(() => {
    if (!firebaseUser || !profileReady || !userGroupsReady) return;

    void syncUserMembershipImage(firebaseUser.uid, profile?.image ?? null).catch(() => {
      // Avatar fanout is best-effort; profile uploads should not be blocked by it.
    });
  }, [firebaseUser, profile?.image, profileReady, userGroupsReady]);

  useEffect(() => {
    if (!firebaseUser) return;

    const journalRef = ref(database, `journalEntries/${firebaseUser.uid}`);
    const privateCheckInsRef = ref(database, `privateCheckIns/${firebaseUser.uid}`);
    const sessionsRef = ref(database, `prayerSessions/${firebaseUser.uid}`);
    const prayerNotificationsRef = ref(database, `prayerNotifications/${firebaseUser.uid}`);
    const savedVersesRef = ref(database, `savedVerses/${firebaseUser.uid}`);
    const bibleHighlightsRef = ref(database, `bibleHighlights/${firebaseUser.uid}`);
    const bibleHighlightColorsRef = ref(database, `bibleHighlightColors/${firebaseUser.uid}`);
    const bibleHighlightColorSettingsRef = ref(database, `bibleHighlightColorSettings/${firebaseUser.uid}`);
    const biblePlansRef = ref(database, `biblePlans/${firebaseUser.uid}`);
    const participantIdsRef = ref(database, `groupBiblePlanParticipantIds/${firebaseUser.uid}`);
    const supportRef = ref(database, `supportIntents/${firebaseUser.uid}`);

    const unsubs = [
      onValue(journalRef, (snapshot) => setJournalEntries(asArray<JournalEntry>(snapshot.val()))),
      onValue(privateCheckInsRef, (snapshot) => setPrivateCheckIns(asArray<CheckIn>(snapshot.val()))),
      onValue(sessionsRef, (snapshot) => setPrayerSessions(asArray<PrayerSession>(snapshot.val()))),
      onValue(prayerNotificationsRef, (snapshot) =>
        setPrayerNotifications(asArray<PrayerNotification>(snapshot.val()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))),
      ),
      onValue(savedVersesRef, (snapshot) => {
        const normalized = normalizeSavedVerseRecords(snapshot.val());
        setSavedVerses(normalized.verses);

        const duplicateStorageKeys = normalized.duplicateStorageKeys.filter((key) => {
          const pendingKey = `${firebaseUser.uid}:${key}`;
          if (pendingSavedVerseDedupKeys.has(pendingKey)) return false;
          pendingSavedVerseDedupKeys.add(pendingKey);
          return true;
        });

        if (duplicateStorageKeys.length > 0) {
          void update(
            ref(database),
            Object.fromEntries(duplicateStorageKeys.map((key) => [`savedVerses/${firebaseUser.uid}/${key}`, null])),
          )
            .catch(() => {
              // The normalized in-memory list remains safe; a later snapshot retries persistence.
            })
            .finally(() => {
              duplicateStorageKeys.forEach((key) => pendingSavedVerseDedupKeys.delete(`${firebaseUser.uid}:${key}`));
            });
        }
      }),
      onValue(bibleHighlightsRef, (snapshot) =>
        setBibleHighlights(
          asArray<BibleHighlight>(snapshot.val()).sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)),
        ),
      ),
      onValue(bibleHighlightColorsRef, async (snapshot) => {
        if (snapshot.exists()) {
          setBibleHighlightColors(asArray<BibleHighlightPaletteColor>(snapshot.val()).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.label.localeCompare(b.label)));
          return;
        }

        const settingsSnapshot = await get(bibleHighlightColorSettingsRef);
        if (settingsSnapshot.exists()) {
          setBibleHighlightColors([]);
          return;
        }

        const timestamp = now();
        const seededColors = defaultBibleHighlightColors.map((color) => ({ ...color, createdAt: timestamp, updatedAt: timestamp }));
        setBibleHighlightColors(seededColors);
        await update(ref(database), {
          ...Object.fromEntries(seededColors.map((color) => [`bibleHighlightColors/${firebaseUser.uid}/${color.id}`, color])),
          [`bibleHighlightColorSettings/${firebaseUser.uid}/seededAt`]: timestamp,
        });
      }),
      onValue(biblePlansRef, (snapshot) =>
        setBiblePlans(
          asArray<BiblePlan>(snapshot.val()).map((plan) => ({ ...plan, days: (plan.days ?? []).map((day) => ({ ...day, ranges: day.ranges ?? [] })) })).sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)),
        ),
      ),
      onValue(participantIdsRef, (snapshot) => setGroupBiblePlanParticipantIds((snapshot.val() as Record<Id, Id> | null) ?? {})),
      onValue(supportRef, (snapshot) => setSupportIntents(asArray<SupportIntent>(snapshot.val()))),
    ];

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !profile?.currentGroupId) {
      setCommunityFeedError(undefined);
      setCommunityFeedGroupId(undefined);
      setCommunityFeedOffline(undefined);
      setCommunityFeedReady(true);
      setMemberships([]);
      setCheckIns([]);
      setPosts([]);
      setReplies([]);
      setPrayerReactions([]);
      setPostReactions([]);
      setGroupBiblePlanAnnouncements([]);
      setGroupBiblePlanParticipations([]);
      return;
    }

    const groupId = profile.currentGroupId;
    let active = true;
    let membersReady = false;
    let checkInsReady = false;
    let postsReady = false;
    let repliesReady = false;
    let prayerReactionsReady = false;
    let postReactionsReady = false;

    setCommunityFeedError(undefined);
    setCommunityFeedGroupId(groupId);
    setCommunityFeedOffline(undefined);
    setCommunityFeedReady(false);
    setMemberships([]);
    setCheckIns([]);
    setPosts([]);
    setReplies([]);
    setPrayerReactions([]);
    setPostReactions([]);
    setGroupBiblePlanAnnouncements([]);
    setGroupBiblePlanParticipations([]);

    const markCommunityFeedReady = () => {
      if (
        !active ||
        !membersReady ||
        !checkInsReady ||
        !postsReady ||
        !repliesReady ||
        !prayerReactionsReady ||
        !postReactionsReady
      ) return;
      setCommunityFeedGroupId(groupId);
      setCommunityFeedReady(true);
    };
    const handleCommunityFeedError = () => {
      if (!active) return;
      setCommunityFeedError("Community activity could not be fully loaded.");
      setCommunityFeedGroupId(groupId);
      setCommunityFeedReady(true);
    };

    const connectedRef = ref(database, ".info/connected");
    const membersRef = ref(database, `groupMembers/${groupId}`);
    const checkInsRef = ref(database, `checkIns/${groupId}`);
    const postsRef = ref(database, `posts/${groupId}`);
    const repliesRef = ref(database, `replies/${groupId}`);
    const reactionsRef = ref(database, `prayerReactions/${groupId}`);
    const postReactionsRef = ref(database, `postReactions/${groupId}`);
    const planAnnouncementsRef = ref(database, `groupBiblePlanAnnouncements/${groupId}`);
    const planParticipationsRef = ref(database, `groupBiblePlanParticipation/${groupId}`);

    const unsubs = [
      onValue(connectedRef, (snapshot) => {
        if (!active) return;
        setCommunityFeedOffline(snapshot.val() === false);
      }),
      onValue(membersRef, (snapshot) => {
        if (!active) return;
        setMemberships(asArray<Membership>(snapshot.val()));
        membersReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(checkInsRef, (snapshot) => {
        if (!active) return;
        setCheckIns(asArray<CheckIn>(snapshot.val()));
        checkInsReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(postsRef, (snapshot) => {
        if (!active) return;
        setPosts(asArray<KoinoState["posts"][number]>(snapshot.val()));
        postsReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(repliesRef, (snapshot) => {
        if (!active) return;
        setReplies(asArray<Reply>(snapshot.val()));
        repliesReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(reactionsRef, (snapshot) => {
        if (!active) return;
        setPrayerReactions(asArray<PrayerReaction>(snapshot.val()));
        prayerReactionsReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(postReactionsRef, (snapshot) => {
        if (!active) return;
        setPostReactions(asArray<PostReaction>(snapshot.val()));
        postReactionsReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(planAnnouncementsRef, (snapshot) =>
        setGroupBiblePlanAnnouncements(
          asArray<GroupBiblePlanAnnouncement>(snapshot.val()).sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)),
        ),
      ),
      onValue(planParticipationsRef, (snapshot) => {
        const value = snapshot.val();
        if (!value || typeof value !== "object") {
          setGroupBiblePlanParticipations([]);
          return;
        }
        const participations = Object.values(value as Record<string, Record<string, GroupBiblePlanParticipation>>)
          .flatMap((items) => asArray<GroupBiblePlanParticipation>(items))
          .sort((a, b) => Date.parse(b.updatedAt || b.joinedAt) - Date.parse(a.updatedAt || a.joinedAt));
        setGroupBiblePlanParticipations(participations);
      }),
    ];

    return () => {
      active = false;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [firebaseUser, profile?.currentGroupId]);

  const state = useMemo<KoinoState>(() => {
    const memberUsers = memberships.map<User>((membership) => ({
      id: membership.userId,
      name: membership.userName || (membership.userId === profile?.id ? profile.name : "Someone"),
      image: membership.image ?? (membership.userId === profile?.id ? profile.image : undefined),
      createdAt: membership.createdAt,
    }));
    const users = memberUsers.length > 0 ? memberUsers : profile ? [profile] : [];

    return {
      ready: themeReady && authReady && (!firebaseUser || (profileReady && userGroupsReady)),
      currentUserId: firebaseUser?.uid,
      currentGroupId: profile?.currentGroupId ?? undefined,
      authEmail: firebaseUser?.email ?? profile?.email ?? undefined,
      authError,
      communityFeedError,
      communityFeedGroupId,
      communityFeedOffline,
      communityFeedReady,
      theme,
      users,
      groups,
      groupMemberCounts,
      memberships,
      checkIns,
      privateCheckIns,
      posts,
      prayerSessions,
      prayerNotifications,
      prayerReactions,
      postReactions,
      replies,
      journalEntries,
      savedVerses,
      bibleHighlights,
      bibleHighlightColors,
      biblePlans,
      groupBiblePlanAnnouncements,
      groupBiblePlanParticipations,
      groupBiblePlanParticipantIds,
      supportIntents,
    };
  }, [
    authError,
    communityFeedError,
    communityFeedGroupId,
    communityFeedOffline,
    communityFeedReady,
    theme,
    themeReady,
    authReady,
    checkIns,
    firebaseUser,
    groupMemberCounts,
    groups,
    journalEntries,
    memberships,
    posts,
    postReactions,
    prayerNotifications,
    privateCheckIns,
    prayerReactions,
    prayerSessions,
    profile,
    profileReady,
    replies,
    savedVerses,
    bibleHighlights,
    bibleHighlightColors,
    biblePlans,
    groupBiblePlanAnnouncements,
    groupBiblePlanParticipations,
    groupBiblePlanParticipantIds,
    supportIntents,
    userGroupsReady,
  ]);

  const dispatch = useCallback(
    async (action: Action) => {
      setAuthError(undefined);

      try {
        switch (action.type) {
            case "signIn":
              await FirebaseAuth.signInWithEmailAndPassword(auth, action.email.trim(), action.password);
              return;
            case "signUp": {
              const credential = await FirebaseAuth.createUserWithEmailAndPassword(auth, action.email.trim(), action.password);
              await ensureProfile(credential.user, action.name);
              return;
            }
            case "signOut":
              clearUserSession();
              await FirebaseAuth.signOut(auth);
              return;
            case "requestPasswordReset": {
              const resetEmail = action.email.trim();
              if (!resetEmail.includes("@")) throw new Error("Enter the email address for your account.");

              await FirebaseAuth.sendPasswordResetEmail(auth, resetEmail, {
                url: passwordResetUrl,
                handleCodeInApp: true,
              });
              return;
            }
            case "confirmPasswordReset":
              if (!action.oobCode.trim()) throw new Error("Open the reset link from your email again.");
              if (action.newPassword.length < 6) throw new Error("Use a password with at least 6 characters.");
              await FirebaseAuth.confirmPasswordReset(auth, action.oobCode, action.newPassword);
              return;
            case "changePassword": {
              if (!firebaseUser?.email) throw new Error("Sign in again before changing your password.");
              if (action.newPassword.length < 6) throw new Error("Use a password with at least 6 characters.");

              const credential = FirebaseAuth.EmailAuthProvider.credential(firebaseUser.email, action.currentPassword);
              await FirebaseAuth.reauthenticateWithCredential(firebaseUser, credential);
              await FirebaseAuth.updatePassword(firebaseUser, action.newPassword);
              return;
            }
            case "createSession":
              if (!firebaseUser) return;
              if (action.groupName?.trim()) {
                await createGroupForUser(firebaseUser, action.groupName, action.name);
              } else if (action.inviteCode?.trim()) {
                await joinGroupByInvite(firebaseUser, action.inviteCode, action.name);
              }
              return;
            case "createGroup":
              if (!firebaseUser) return;
              await createGroupForUser(firebaseUser, action.name, profile?.name);
              return;
            case "joinGroup":
              if (!firebaseUser) return;
              await joinGroupByInvite(firebaseUser, action.inviteCode, profile?.name);
              return;
            case "switchGroup":
              if (!firebaseUser || !userMemberships.some((membership) => membership.groupId === action.id)) return;
              await update(ref(database, `profiles/${firebaseUser.uid}`), { currentGroupId: action.id });
              return;
            case "leaveGroup": {
              if (!firebaseUser) return;
              const groupToLeave = groups.find((item) => item.id === action.id);
              if (!groupToLeave || groupToLeave.ownerId === firebaseUser.uid) return;

              const remainingMembership = userMemberships.find((membership) => membership.groupId !== action.id);
              const updates: Record<string, unknown> = {
                [`groupMembers/${action.id}/${firebaseUser.uid}`]: null,
                [`userGroups/${firebaseUser.uid}/${action.id}`]: null,
              };

              if (profile?.currentGroupId === action.id) {
                updates[`profiles/${firebaseUser.uid}/currentGroupId`] = remainingMembership?.groupId ?? null;
              }

              await update(ref(database), updates);
              return;
            }
            case "removeGroupMember": {
              if (!firebaseUser || action.userId === firebaseUser.uid) return;
              const groupToUpdate = groups.find((item) => item.id === action.groupId);
              if (!groupToUpdate || groupToUpdate.ownerId !== firebaseUser.uid || groupToUpdate.ownerId === action.userId) return;

              const membership = memberships.find((item) => item.groupId === action.groupId && item.userId === action.userId);
              if (!membership || membership.role === "owner") return;

              await update(ref(database), {
                [`groupMembers/${action.groupId}/${action.userId}`]: null,
                [`userGroups/${action.userId}/${action.groupId}`]: null,
              });
              return;
            }
            case "transferGroupOwnership": {
              if (!firebaseUser || action.userId === firebaseUser.uid) return;

              const groupSnapshot = await get(ref(database, `groups/${action.groupId}`));
              const groupToUpdate = groupSnapshot.val() as Group | null;
              if (!groupToUpdate || groupToUpdate.ownerId !== firebaseUser.uid) {
                throw new Error("Only the community host can transfer ownership.");
              }

              const [currentOwnerSnapshot, nextOwnerSnapshot] = await Promise.all([
                get(ref(database, `groupMembers/${action.groupId}/${firebaseUser.uid}`)),
                get(ref(database, `groupMembers/${action.groupId}/${action.userId}`)),
              ]);
              const currentOwnerMembership = currentOwnerSnapshot.val() as Membership | null;
              const nextOwnerMembership = nextOwnerSnapshot.val() as Membership | null;
              if (!currentOwnerMembership || !nextOwnerMembership || nextOwnerMembership.userId !== action.userId || nextOwnerMembership.role === "owner") {
                throw new Error("Choose another current member of this community.");
              }

              const timestamp = now();
              const previousOwner: Membership = { ...currentOwnerMembership, role: "member" };
              const nextOwner: Membership = { ...nextOwnerMembership, role: "owner" };

              await update(ref(database), {
                [`groups/${action.groupId}/ownerId`]: action.userId,
                [`groups/${action.groupId}/updatedAt`]: timestamp,
                [`groupMembers/${action.groupId}/${firebaseUser.uid}`]: previousOwner,
                [`userGroups/${firebaseUser.uid}/${action.groupId}`]: previousOwner,
                [`groupMembers/${action.groupId}/${action.userId}`]: nextOwner,
                [`userGroups/${action.userId}/${action.groupId}`]: nextOwner,
              });
              return;
            }
            case "updateGroup":
              await update(ref(database, `groups/${action.id}`), { name: action.name.trim(), updatedAt: now() });
              return;
            case "uploadGroupImage": {
              if (!firebaseUser) return;
              const groupSnapshot = await get(ref(database, `groups/${action.id}`));
              const groupToUpdate = groupSnapshot.val() as Group | null;
              if (!groupToUpdate || groupToUpdate.ownerId !== firebaseUser.uid) {
                throw new Error("Only the community host can change the community image.");
              }

              const timestamp = now();
              const path = `${action.id}/${Date.now().toString(36)}.webp`;
              const imageBody = await localUriToArrayBuffer(action.localUri);

              await uploadRoomImage(path, imageBody);

              try {
                const url = roomImagePublicUrl(path);
                await update(ref(database, `groups/${action.id}`), {
                  image: {
                    url,
                    path,
                    width: 512,
                    height: 512,
                    contentType: "image/webp",
                    updatedAt: timestamp,
                  },
                  updatedAt: timestamp,
                });
              } catch (error) {
                await deleteRoomStoragePath(path);
                throw error;
              }

              await deleteRoomStoragePath(groupToUpdate.image?.path);
              return;
            }
            case "deleteGroupImage": {
              if (!firebaseUser) return;
              const groupSnapshot = await get(ref(database, `groups/${action.id}`));
              const groupToUpdate = groupSnapshot.val() as Group | null;
              if (!groupToUpdate || groupToUpdate.ownerId !== firebaseUser.uid) {
                throw new Error("Only the community host can delete the community image.");
              }

              await update(ref(database, `groups/${action.id}`), { image: null, updatedAt: now() });
              await deleteRoomStoragePath(groupToUpdate.image?.path);
              return;
            }
            case "uploadUserAvatar": {
              if (!firebaseUser) return;
              const profileSnapshot = await get(ref(database, `profiles/${firebaseUser.uid}`));
              const profileToUpdate = profileSnapshot.val() as Profile | null;
              const timestamp = now();
              const path = `${firebaseUser.uid}/${Date.now().toString(36)}.webp`;
              const imageBody = await localUriToArrayBuffer(action.localUri);

              await uploadUserAvatar(path, imageBody);

              try {
                const url = userAvatarPublicUrl(path);
                const image: Profile["image"] = {
                  url,
                  path,
                  width: 512,
                  height: 512,
                  contentType: "image/webp",
                  updatedAt: timestamp,
                };
                await update(ref(database), await profileAndMembershipImageUpdates(firebaseUser.uid, image));
              } catch (error) {
                await deleteUserAvatarStoragePath(path);
                throw error;
              }

              void deleteUserAvatarStoragePath(profileToUpdate?.image?.path);
              return;
            }
            case "deleteUserAvatar": {
              if (!firebaseUser) return;
              const profileSnapshot = await get(ref(database, `profiles/${firebaseUser.uid}`));
              const profileToUpdate = profileSnapshot.val() as Profile | null;

              await update(ref(database), await profileAndMembershipImageUpdates(firebaseUser.uid, null));
              void deleteUserAvatarStoragePath(profileToUpdate?.image?.path);
              return;
            }
            case "deleteGroup": {
              const groupSnapshot = await get(ref(database, `groups/${action.id}`));
              const groupToDelete = groupSnapshot.val() as Group | null;
              if (!firebaseUser || !groupToDelete || groupToDelete.ownerId !== firebaseUser.uid) return;

              const memberSnapshot = await get(ref(database, `groupMembers/${action.id}`));
              const members = asArray<Membership>(memberSnapshot.val());
              const updates: Record<string, unknown> = {
                [`groups/${action.id}`]: null,
                [`inviteCodes/${groupToDelete.inviteCode}`]: null,
                [`groupMembers/${action.id}`]: null,
                [`checkIns/${action.id}`]: null,
                [`posts/${action.id}`]: null,
                [`replies/${action.id}`]: null,
                [`prayerReactions/${action.id}`]: null,
              };

              members.forEach((member) => {
                updates[`userGroups/${member.userId}/${action.id}`] = null;
              });
              updates[`profiles/${firebaseUser.uid}/currentGroupId`] =
                userMemberships.find((membership) => membership.groupId !== action.id)?.groupId ?? null;

              await update(ref(database), updates);
              await deleteRoomStoragePath(groupToDelete.image?.path);
              return;
            }
            case "submitCheckIn": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const timestamp = now();
              const todayKey = localDayKey(timestamp);
              const pendingKey = `${firebaseUser.uid}:${profile.currentGroupId}:${todayKey}`;
              if (pendingCheckInKeys.has(pendingKey)) return;

              const hasCheckInToday = [...checkIns, ...activePrivateCheckIns(privateCheckIns, journalEntries)].some(
                (item) =>
                  item.userId === firebaseUser.uid &&
                  item.groupId === profile.currentGroupId &&
                  localDayKey(item.createdAt) === todayKey,
              );
              if (hasCheckInToday) return;
              pendingCheckInKeys.add(pendingKey);

              try {
                const verses = actionVerses(action);
                const checkIn: CheckIn = {
                  id: id("checkin"),
                  userId: firebaseUser.uid,
                  groupId: profile.currentGroupId,
                  mood: action.mood,
                  readToday: action.readToday,
                  reflectionText: action.reflectionText.trim(),
                  visibility: action.visibility,
                  ...(verses[0] ? { verse: verses[0], verses } : {}),
                  createdAt: timestamp,
                };

                if (action.visibility === "group") {
                  await set(ref(database, `checkIns/${profile.currentGroupId}/${checkIn.id}`), checkIn);
                } else {
                  const entry: JournalEntry = {
                    id: id("journal"),
                    userId: firebaseUser.uid,
                    journalType: "heart_checkin",
                    body: action.reflectionText.trim() || "Private check-in",
                    source: "private_check_in",
                    entryKind: "reflection",
                    mood: action.mood,
                    ...(action.heartMood ? { heartMood: action.heartMood } : {}),
                    isPrivate: true,
                    ...(verses[0] ? { verse: verses[0], verses } : {}),
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  };
                  await update(ref(database), {
                    [`privateCheckIns/${firebaseUser.uid}/${checkIn.id}`]: checkIn,
                    [`journalEntries/${firebaseUser.uid}/${entry.id}`]: entry,
                  });
                }
               } finally {
                 pendingCheckInKeys.delete(pendingKey);
               }
               return;
             }
             case "updateCheckIn": {
               if (!firebaseUser || !profile?.currentGroupId) return;
               if (!action.reflectionText.trim()) return;
               const existingCheckIn = checkIns.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
               if (!existingCheckIn || existingCheckIn.userId !== firebaseUser.uid) return;
               await update(ref(database, `checkIns/${profile.currentGroupId}/${action.id}`), {
                 mood: action.mood,
                 readToday: action.readToday,
                 reflectionText: action.reflectionText.trim(),
                 visibility: action.visibility,
                 verse: actionVerses(action)[0] ?? null,
                 verses: actionVerses(action).length ? actionVerses(action) : null,
               });
               return;
             }
             case "createPost": {
               const verses = actionVerses(action);
               if (!firebaseUser || !profile?.currentGroupId || !validPostContent(action.kind, action.body, verses)) return;
               const post: Post = {
                 id: id("post"),
                 userId: firebaseUser.uid,
                 groupId: profile.currentGroupId,
                 kind: action.kind,
                 ...(postSupportsTitle(action.kind) && action.title?.trim() ? { title: action.title.trim() } : {}),
                 body: action.body.trim(),
                 ...(verses[0] ? { verse: verses[0], verses } : {}),
                 createdAt: now(),
               };
               await set(ref(database, `posts/${profile.currentGroupId}/${post.id}`), post);
               return;
             }
             case "editPost": {
               if (!firebaseUser || !profile?.currentGroupId) return;
               const post = posts.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
               if (!post || post.userId !== firebaseUser.uid) return;
               const verses = actionVerses(action);
               if (!validPostContent(action.kind, action.body, verses)) return;
               await update(ref(database, `posts/${profile.currentGroupId}/${action.id}`), {
                 body: action.body.trim(),
                 kind: action.kind,
                 ...(postSupportsTitle(action.kind) && action.title !== undefined ? { title: action.title.trim() || null } : {}),
                 verse: verses[0] ?? null,
                 verses: verses.length ? verses : null,
                 // Note: We don't update createdAt to preserve the original timestamp
                 // We also don't update answeredAt or answeredMarkedAt for prayer requests
               });
               return;
             }
             case "markPrayerAnswered": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const post = posts.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!post || post.userId !== firebaseUser.uid || post.kind !== "prayer_request") return;
              const timestamp = now();
              await update(ref(database, `posts/${profile.currentGroupId}/${action.id}`), {
                answeredAt: timestamp,
                answeredMarkedAt: timestamp,
                answeredUpdate: action.answeredUpdate?.trim() || null,
              });
              return;
            }
            case "updatePrayerAnswer": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const post = posts.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!post || post.userId !== firebaseUser.uid || post.kind !== "prayer_request" || !post.answeredAt) return;
              await update(ref(database, `posts/${profile.currentGroupId}/${action.id}`), {
                answeredUpdate: action.answeredUpdate?.trim() || null,
              });
              return;
            }
            case "unmarkPrayerAnswered": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const post = posts.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!post || post.userId !== firebaseUser.uid || post.kind !== "prayer_request") return;
              await update(ref(database, `posts/${profile.currentGroupId}/${action.id}`), {
                answeredAt: null,
                answeredMarkedAt: null,
                answeredUpdate: null,
              });
              return;
            }
            case "deleteCheckIn": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const checkIn = checkIns.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!checkIn || checkIn.userId !== firebaseUser.uid) return;
              await deleteFeedItemWithChildren(profile.currentGroupId, "check_in", action.id, firebaseUser.uid);
              return;
            }
            case "deletePost": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const post = posts.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!post || post.userId !== firebaseUser.uid) return;
              await deleteFeedItemWithChildren(profile.currentGroupId, "post", action.id, firebaseUser.uid);
              return;
            }
            case "finishPrayer": {
              if (!firebaseUser) return;
              if (action.targetType === "post") {
                if (!profile?.currentGroupId || !posts.some((item) => item.id === action.targetId && item.groupId === profile.currentGroupId)) return;
              } else if (action.targetType === "check_in") {
                if (!profile?.currentGroupId || !checkIns.some((item) => item.id === action.targetId && item.groupId === profile.currentGroupId)) return;
              } else if (action.targetType === "reply") {
                if (!profile?.currentGroupId || !replies.some((item) => item.id === action.targetId)) return;
              } else if (action.targetType === "user") {
                if (!action.recipientUserId) return;
              } else {
                if (!journalEntries.some((item) => item.id === action.targetId && item.userId === firebaseUser.uid)) return;
              }

              const completedAt = now();
              const durationSeconds = Math.max(0, Math.floor((Date.parse(completedAt) - Date.parse(action.startedAt)) / 1000));
              const reactionTargetType =
                action.status === "completed" &&
                (action.targetType === "post" || action.targetType === "check_in" || action.targetType === "reply")
                  ? action.targetType
                  : undefined;

              if (reactionTargetType && profile?.currentGroupId) {
                const groupId = profile.currentGroupId;
                const reactionId = prayerReactionId(firebaseUser.uid, reactionTargetType, action.targetId);
                const completionKey = `${groupId}:${reactionId}`;
                if (pendingPrayerCompletionKeys.has(completionKey)) return;

                const existingLocalReaction = prayerReactions.find((reaction) =>
                  isMatchingPrayerReaction(reaction, firebaseUser.uid, reactionTargetType, action.targetId),
                );
                if (existingLocalReaction) {
                  if (existingLocalReaction.id === reactionId) {
                    await set(
                      ref(database, `prayerSessions/${firebaseUser.uid}/${reactionId}`),
                      prayerSessionFromReaction(existingLocalReaction, action.recipientUserId),
                    );
                  }
                  return;
                }

                const reaction: PrayerReaction = {
                  id: reactionId,
                  userId: firebaseUser.uid,
                  targetType: reactionTargetType,
                  targetId: action.targetId,
                  startedAt: action.startedAt,
                  completedAt,
                  durationSeconds,
                  createdAt: completedAt,
                };
                const session = prayerSessionFromReaction(reaction, action.recipientUserId);

                pendingPrayerCompletionKeys.add(completionKey);
                setPrayerReactions((current) =>
                  current.some((item) => isMatchingPrayerReaction(item, firebaseUser.uid, reactionTargetType, action.targetId))
                    ? current
                    : [...current, reaction],
                );

                let reactionCommitted = false;
                try {
                  const persistedSnapshot = await get(ref(database, `prayerReactions/${groupId}`));
                  const persistedReaction = asArray<PrayerReaction>(persistedSnapshot.val()).find((item) =>
                    isMatchingPrayerReaction(item, firebaseUser.uid, reactionTargetType, action.targetId),
                  );

                  if (persistedReaction) {
                    setPrayerReactions((current) => {
                      const withoutOptimisticReaction = current.filter((item) => item.id !== reactionId);
                      return withoutOptimisticReaction.some((item) =>
                        isMatchingPrayerReaction(item, firebaseUser.uid, reactionTargetType, action.targetId),
                      )
                        ? withoutOptimisticReaction
                        : [...withoutOptimisticReaction, persistedReaction];
                    });
                    if (persistedReaction.id === reactionId) {
                      await set(
                        ref(database, `prayerSessions/${firebaseUser.uid}/${reactionId}`),
                        prayerSessionFromReaction(persistedReaction, action.recipientUserId),
                      );
                    }
                    return;
                  }

                  const transaction = await runTransaction(
                    ref(database, `prayerReactions/${groupId}/${reactionId}`),
                    (current) => (current ? undefined : reaction),
                  );
                  if (!transaction.committed) {
                    const existingTransactionReaction = transaction.snapshot.val() as PrayerReaction | null;
                    if (
                      existingTransactionReaction &&
                      isMatchingPrayerReaction(existingTransactionReaction, firebaseUser.uid, reactionTargetType, action.targetId)
                    ) {
                      await set(
                        ref(database, `prayerSessions/${firebaseUser.uid}/${reactionId}`),
                        prayerSessionFromReaction(existingTransactionReaction, action.recipientUserId),
                      );
                      return;
                    }
                    setPrayerReactions((current) =>
                      current.filter(
                        (item) =>
                          !(
                            item.id === reaction.id &&
                            item.startedAt === reaction.startedAt &&
                            item.completedAt === reaction.completedAt &&
                            item.createdAt === reaction.createdAt
                          ),
                      ),
                    );
                    throw new Error("Prayer completion could not be saved.");
                  }

                  reactionCommitted = true;
                  await set(ref(database, `prayerSessions/${firebaseUser.uid}/${session.id}`), session);
                } catch (error) {
                  if (!reactionCommitted) {
                    setPrayerReactions((current) =>
                      current.filter(
                        (item) =>
                          !(
                            item.id === reaction.id &&
                            item.startedAt === reaction.startedAt &&
                            item.completedAt === reaction.completedAt &&
                            item.createdAt === reaction.createdAt
                          ),
                      ),
                    );
                  }
                  throw error;
                } finally {
                  pendingPrayerCompletionKeys.delete(completionKey);
                }
                return;
              }

              const session: PrayerSession = {
                id: id("prayersession"),
                userId: firebaseUser.uid,
                targetType: action.targetType,
                targetId: action.targetId,
                ...(action.recipientUserId ? { recipientUserId: action.recipientUserId } : {}),
                startedAt: action.startedAt,
                completedAt,
                status: action.status,
              };

              await set(ref(database, `prayerSessions/${firebaseUser.uid}/${session.id}`), session);

              if (action.status === "completed" && action.targetType === "user" && action.recipientUserId && action.recipientUserId !== firebaseUser.uid) {
                const notification: PrayerNotification = {
                  id: id("prayernotification"),
                  userId: firebaseUser.uid,
                  recipientUserId: action.recipientUserId,
                  startedAt: action.startedAt,
                  completedAt,
                  durationSeconds,
                  createdAt: completedAt,
                };
                await set(ref(database, `prayerNotifications/${action.recipientUserId}/${notification.id}`), notification);
              }

              return;
            }
            case "unpray": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const reactionId = prayerReactionId(firebaseUser.uid, action.targetType, action.targetId);
              await remove(ref(database, `prayerReactions/${profile.currentGroupId}/${reactionId}`));
              return;
            }
            case "togglePostReaction": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              if (action.targetType === "post") {
                const post = posts.find((item) => item.id === action.targetId && item.groupId === profile.currentGroupId);
                if (!post) return;
              } else if (!checkIns.some((item) => item.id === action.targetId && item.groupId === profile.currentGroupId)) {
                return;
              }

              const reactionId = `${firebaseUser.uid}_${action.targetType}_${action.targetId}_${action.kind}`;
              const reactionRef = ref(database, `postReactions/${profile.currentGroupId}/${reactionId}`);
              if (postReactions.some((reaction) => reaction.id === reactionId && reaction.userId === firebaseUser.uid)) {
                if (action.mode === "ensure") return;
                await remove(reactionRef);
                return;
              }

              const reaction: PostReaction = {
                id: reactionId,
                userId: firebaseUser.uid,
                targetType: action.targetType,
                targetId: action.targetId,
                kind: action.kind,
                createdAt: now(),
              };
              await set(reactionRef, reaction);
              return;
            }
            case "createReply": {
              if (!firebaseUser || !profile?.currentGroupId || !action.body.trim()) return;
              const reply: Reply = {
                id: action.replyId ?? id("reply"),
                userId: firebaseUser.uid,
                targetType: action.targetType,
                targetId: action.targetId,
                body: action.body.trim().slice(0, 500),
                createdAt: now(),
              };
              await set(ref(database, `replies/${profile.currentGroupId}/${reply.id}`), reply);
              return;
            }
            case "deleteReply": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const reply = replies.find((item) => item.id === action.id);
              if (!reply || reply.userId !== firebaseUser.uid) return;
              const reactionDeletes = prayerReactions
                .filter((reaction) => reaction.targetType === "reply" && reaction.targetId === action.id)
                .reduce<Record<string, null>>((deletes, reaction) => {
                  deletes[`prayerReactions/${profile.currentGroupId}/${reaction.id}`] = null;
                  return deletes;
                }, {});
              await update(ref(database), {
                ...reactionDeletes,
                [`replies/${profile.currentGroupId}/${action.id}`]: null,
              });
              return;
            }
            case "createJournalEntry": {
              if (!firebaseUser || !action.body.trim()) return;
              const timestamp = now();
              const postId = action.shareWithGroup && profile?.currentGroupId ? id("post") : undefined;
              const verses = actionVerses(action);
              const entry: JournalEntry = {
                id: id("journal"),
                userId: firebaseUser.uid,
                journalType: action.journalType ?? (action.entryKind === "prayer_request" || action.entryKind === "prayer_moment" ? "prayer" : action.entryKind === "praise" ? "answered_prayer" : action.entryKind === "scripture" ? "scripture_note" : "reflection"),
                ...(action.title?.trim() ? { title: action.title.trim() } : {}),
                body: action.body.trim(),
                source: "manual",
                entryKind: action.entryKind ?? "reflection",
                ...(action.heartMood ? { heartMood: action.heartMood } : {}),
                isPrivate: !postId,
                ...(verses[0] ? { verse: verses[0], verses } : {}),
                ...(postId ? { sharedPostId: postId } : {}),
                createdAt: timestamp,
                updatedAt: timestamp,
              };
              if (postId && profile?.currentGroupId) {
                const postKind = action.entryKind ?? "reflection";
                const post: Post = {
                  id: postId,
                  userId: firebaseUser.uid,
                  groupId: profile.currentGroupId,
                  kind: postKind,
                  ...(postSupportsTitle(postKind) && action.title?.trim() ? { title: action.title.trim() } : {}),
                  body: action.body.trim(),
                  ...(verses[0] ? { verse: verses[0], verses } : {}),
                  createdAt: timestamp,
                };
                await update(ref(database), {
                  [`journalEntries/${firebaseUser.uid}/${entry.id}`]: entry,
                  [`posts/${profile.currentGroupId}/${post.id}`]: post,
                });
                return;
              }
              await set(ref(database, `journalEntries/${firebaseUser.uid}/${entry.id}`), entry);
              return;
            }
            case "updateJournalEntry":
              if (!firebaseUser) return;
              await update(ref(database, `journalEntries/${firebaseUser.uid}/${action.id}`), {
                body: action.body.trim(),
                title: action.title?.trim() || null,
                entryKind: action.entryKind ?? null,
                journalType: action.journalType ?? null,
                heartMood: action.heartMood ?? null,
                verse: actionVerses(action)[0] ?? null,
                verses: actionVerses(action).length ? actionVerses(action) : null,
                sharedPostId: action.sharedPostId ?? null,
                images: null,
                updatedAt: now(),
              });
              return;
            case "deleteJournalEntry": {
              if (!firebaseUser) return;
              const entry = journalEntries.find((item) => item.id === action.id && item.userId === firebaseUser.uid);
              const updates: Record<string, null> = {
                [`journalEntries/${firebaseUser.uid}/${action.id}`]: null,
              };

              if (entry?.source === "private_check_in") {
                const checkInId = privateCheckIns.find(
                  (checkIn) => checkIn.userId === firebaseUser.uid && checkIn.createdAt === entry.createdAt,
                )?.id;

                if (checkInId) {
                  updates[`privateCheckIns/${firebaseUser.uid}/${checkInId}`] = null;
                }
              }

              await update(ref(database), updates);
              return;
            }
            case "saveVerse": {
              if (!firebaseUser) return;
              const identity = savedVerseIdentity(action.verse);
              const key = savedVerseStorageId(action.verse);
              if (!identity || !key) return;
              const savedVerse: SavedVerse = {
                ...action.verse,
                id: key,
                referenceText: action.verse.referenceText ?? action.verse.reference,
                savedAt: now(),
              };
              const savedVersesRef = ref(database, `savedVerses/${firebaseUser.uid}`);
              const existingSnapshot = await get(savedVersesRef);
              const alreadySaved = normalizeSavedVerseRecords(existingSnapshot.val()).verses
                .some((verse) => savedVerseIdentity(verse) === identity);
              if (alreadySaved) return;

              await set(ref(database, `savedVerses/${firebaseUser.uid}/${key}`), savedVerse);
              return;
            }
            case "removeSavedVerse": {
              if (!firebaseUser) return;
              await remove(ref(database, `savedVerses/${firebaseUser.uid}/${action.id}`));
              return;
            }
            case "highlightVerses": {
              if (!firebaseUser || !isBibleHighlightColor(action.color)) return;
              const timestamp = now();
              const color = normalizeHighlightColor(action.color);
              const highlights = action.verses
                .map((verse): BibleHighlight | undefined => {
                  const key = bibleReferenceStorageId(verse);
                  if (!key || !verse.book || typeof verse.chapter !== "number" || typeof verse.startVerse !== "number") return undefined;
                  const existing = bibleHighlights.find((highlight) => highlight.id === key);
                  return {
                    id: key,
                    book: verse.book,
                    chapter: verse.chapter,
                    startVerse: verse.startVerse,
                    endVerse: verse.endVerse ?? verse.startVerse,
                    reference: verse.reference,
                    ...(verse.translation ? { translation: verse.translation } : {}),
                    ...(action.colorId ? { colorId: action.colorId } : {}),
                    color,
                    createdAt: existing?.createdAt ?? timestamp,
                    updatedAt: timestamp,
                  };
                })
                .filter((item): item is BibleHighlight => Boolean(item));

              if (highlights.length === 0) return;

              const updates = Object.fromEntries(
                highlights.map((highlight) => [`bibleHighlights/${firebaseUser.uid}/${highlight.id}`, highlight]),
              );
              await update(ref(database), updates);
              return;
            }
            case "removeBibleHighlight": {
              if (!firebaseUser) return;
              await remove(ref(database, `bibleHighlights/${firebaseUser.uid}/${action.id}`));
              return;
            }
            case "saveBibleHighlightColor": {
              if (!firebaseUser || !isBibleHighlightColor(action.hex)) return;
              const timestamp = now();
              const key = action.id?.trim() || id("highlightcolor");
              const hex = normalizeHighlightColor(action.hex);
              const existing = bibleHighlightColors.find((color) => color.id === key);
              const legacyHex = existing?.hex ? normalizeHighlightColor(existing.hex) : undefined;
              const paletteColor: BibleHighlightPaletteColor = {
                id: key,
                hex,
                label: action.label?.trim() || existing?.label || highlightColorLabel(hex),
                createdAt: existing?.createdAt ?? timestamp,
                updatedAt: timestamp,
              };
              const highlightUpdates = bibleHighlights.reduce<Record<string, Partial<BibleHighlight>>>((updates, highlight) => {
                const matchesColorId = highlight.colorId === key;
                const matchesLegacyColor = legacyHex && !highlight.colorId && normalizeHighlightColor(highlight.color) === legacyHex;
                if (matchesColorId || matchesLegacyColor) {
                  updates[`bibleHighlights/${firebaseUser.uid}/${highlight.id}`] = {
                    ...highlight,
                    colorId: key,
                    color: hex,
                    updatedAt: timestamp,
                  };
                }
                return updates;
              }, {});

              await update(ref(database), {
                [`bibleHighlightColors/${firebaseUser.uid}/${key}`]: paletteColor,
                [`bibleHighlightColorSettings/${firebaseUser.uid}/seededAt`]: timestamp,
                ...highlightUpdates,
              });
              return;
            }
            case "deleteBibleHighlightColor": {
              if (!firebaseUser) return;
              const color = bibleHighlightColors.find((item) => item.id === action.id);
              const hex = color?.hex ? normalizeHighlightColor(color.hex) : undefined;
              const highlightDeletes = bibleHighlights.reduce<Record<string, null>>((deletes, highlight) => {
                const matchesColorId = highlight.colorId === action.id;
                const matchesLegacyColor = hex && !highlight.colorId && normalizeHighlightColor(highlight.color) === hex;
                if (matchesColorId || matchesLegacyColor) {
                  deletes[`bibleHighlights/${firebaseUser.uid}/${highlight.id}`] = null;
                }
                return deletes;
              }, {});

              await update(ref(database), {
                [`bibleHighlightColors/${firebaseUser.uid}/${action.id}`]: null,
                [`bibleHighlightColorSettings/${firebaseUser.uid}/seededAt`]: now(),
                ...highlightDeletes,
              });
              return;
            }
            case "createBiblePlan": {
              if (!firebaseUser || !action.title.trim() || action.ranges.length === 0) return;
              if (!isPlanDate(action.startDate) || !Number.isInteger(action.dayCount) || action.dayCount < 1 || action.dayCount > 3660) throw new Error("Choose a valid date and between 1 and 3660 days.");
              const timestamp = now();
              const planId = id("bibleplan");
              const dayCount = Math.max(1, Math.floor(action.dayCount));
              const days = buildBiblePlanDays(action.ranges, dayCount);
              const plan: BiblePlan = {
                id: planId,
                userId: firebaseUser.uid,
                title: action.title.trim().slice(0, 80),
                source: "personal",
                status: "active",
                startDate: action.startDate,
                dayCount,
                ranges: action.ranges,
                days,
                createdAt: timestamp,
                updatedAt: timestamp,
              };
              await set(ref(database, `biblePlans/${firebaseUser.uid}/${planId}`), plan);
              return;
            }
            case "updateBiblePlan": {
              if (!firebaseUser || !action.title.trim() || action.ranges.length === 0) return;
              const existing = biblePlans.find((plan) => plan.id === action.id && plan.userId === firebaseUser.uid);
              if (!existing) return;
              const timestamp = now();
              const dayCount = Math.max(1, Math.floor(action.dayCount));
              const rebuiltDays = preserveBiblePlanProgress(buildBiblePlanDays(action.ranges, dayCount), existing.days);
              const completedAt = rebuiltDays.every((day) => Boolean(day.completedAt)) ? (existing.completedAt ?? timestamp) : undefined;
              await update(ref(database, `biblePlans/${firebaseUser.uid}/${action.id}`), {
                title: action.title.trim().slice(0, 80),
                status: completedAt ? "completed" : planCompletionStatus(rebuiltDays),
                startDate: action.startDate,
                dayCount,
                ranges: action.ranges,
                days: rebuiltDays,
                completedAt: completedAt ?? null,
                updatedAt: timestamp,
              });
              return;
            }
            case "deleteBiblePlan": {
              if (!firebaseUser) return;
              const plan = biblePlans.find((item) => item.id === action.id && item.userId === firebaseUser.uid);
              if (!plan) return;
              const updates: Record<string, null> = {
                [`biblePlans/${firebaseUser.uid}/${action.id}`]: null,
              };
              if (plan.announcementId) {
                const participantId = groupBiblePlanParticipantIds[plan.announcementId];
                if (plan.groupId && participantId) {
                  updates[`groupBiblePlanParticipation/${plan.groupId}/${plan.announcementId}/${participantId}`] = null;
                }
                updates[`groupBiblePlanParticipantIds/${firebaseUser.uid}/${plan.announcementId}`] = null;
              }
              await update(ref(database), updates);
              return;
            }
            case "pauseBiblePlan":
            case "rescheduleBiblePlan": {
              if (!firebaseUser) return;
              const plan = biblePlans.find((item) => item.id === action.planId && item.userId === firebaseUser.uid);
              if (!plan || plan.status === "completed") return;
              const timestamp = now();
              if (action.type === "rescheduleBiblePlan" && !isPlanDate(action.startDate)) throw new Error("Use a valid date in YYYY-MM-DD format.");
              await runTransaction(ref(database, `biblePlans/${firebaseUser.uid}/${plan.id}`), (current: BiblePlan | null) => {
                if (!current || current.status === "completed") return;
                if (action.type === "pauseBiblePlan") return { ...current, pausedAt: current.pausedAt ?? timestamp, updatedAt: timestamp };
                const { pausedAt, ...resumed } = current;
                return { ...resumed, days: rescheduleBiblePlan(current, action.startDate), updatedAt: timestamp };
              });
              return;
            }
            case "markBiblePlanDay": {
              if (!firebaseUser) return;
              const plan = biblePlans.find((item) => item.id === action.planId && item.userId === firebaseUser.uid);
              if (!plan || !plan.days.some((day) => day.dayNumber === action.dayNumber)) return;
              const timestamp = now();
              const result = biblePlanProgressUpdates(plan, action.dayNumber, action.read, timestamp);
              if (!result) return;
              const { days } = result.progress;
              const updates: Record<string, unknown> = { ...result.updates };
              if (plan.groupId && plan.announcementId) {
                const participantId = groupBiblePlanParticipantIds[plan.announcementId];
                if (participantId) {
                  updates[`groupBiblePlanParticipation/${plan.groupId}/${plan.announcementId}/${participantId}`] = {
                    id: participantId,
                    announcementId: plan.announcementId,
                    completedDayNumbers: completedDayNumbers(days),
                    totalDays: plan.days.length,
                    joinedAt:
                      groupBiblePlanParticipations.find((item) => item.id === participantId && item.announcementId === plan.announcementId)?.joinedAt ??
                      plan.createdAt,
                    updatedAt: timestamp,
                  } satisfies GroupBiblePlanParticipation;
                }
              }
              await update(ref(database), updates);
              return;
            }
            case "announceBiblePlan": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const group = groups.find((item) => item.id === profile.currentGroupId);
              if (!group || group.ownerId !== firebaseUser.uid) return;
              const plan = biblePlans.find((item) => item.id === action.planId && item.userId === firebaseUser.uid);
              if (!plan) return;
              const timestamp = now();
              const announcementId = id("planannouncement");
              const announcement: GroupBiblePlanAnnouncement = {
                id: announcementId,
                groupId: group.id,
                ownerId: firebaseUser.uid,
                title: plan.title,
                startDate: plan.startDate,
                dayCount: plan.dayCount,
                ranges: plan.ranges,
                days: plan.days.map((day) => ({ dayNumber: day.dayNumber, ranges: day.ranges })),
                createdAt: timestamp,
                updatedAt: timestamp,
              };
              await update(ref(database), {
                [`groupBiblePlanAnnouncements/${group.id}/${announcementId}`]: announcement,
                [`biblePlans/${firebaseUser.uid}/${plan.id}/groupId`]: group.id,
                [`biblePlans/${firebaseUser.uid}/${plan.id}/announcementId`]: announcementId,
                [`biblePlans/${firebaseUser.uid}/${plan.id}/updatedAt`]: timestamp,
              });
              return;
            }
            case "unannounceBiblePlan": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const group = groups.find((item) => item.id === profile.currentGroupId);
              const announcement = groupBiblePlanAnnouncements.find((item) => item.id === action.announcementId && item.groupId === profile.currentGroupId);
              if (!group || group.ownerId !== firebaseUser.uid || !announcement) return;
              const updates: Record<string, null> = {
                [`groupBiblePlanAnnouncements/${group.id}/${action.announcementId}`]: null,
                [`groupBiblePlanParticipation/${group.id}/${action.announcementId}`]: null,
              };
              biblePlans
                .filter((plan) => plan.userId === firebaseUser.uid && plan.announcementId === action.announcementId)
                .forEach((plan) => {
                  updates[`biblePlans/${firebaseUser.uid}/${plan.id}/groupId`] = null;
                  updates[`biblePlans/${firebaseUser.uid}/${plan.id}/announcementId`] = null;
                });
              await update(ref(database), updates);
              return;
            }
            case "joinGroupBiblePlan": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const announcement = groupBiblePlanAnnouncements.find((item) => item.id === action.announcementId && item.groupId === profile.currentGroupId);
              if (!announcement) return;
              const existingPlan = biblePlans.find((plan) => plan.announcementId === action.announcementId && plan.userId === firebaseUser.uid);
              if (existingPlan) return;
              const timestamp = now();
              const planId = id("bibleplan");
              const participantId = groupBiblePlanParticipantIds[action.announcementId] ?? id("planparticipant");
              const plan: BiblePlan = {
                id: planId,
                userId: firebaseUser.uid,
                title: announcement.title,
                source: "group",
                status: "active",
                startDate: announcement.startDate,
                dayCount: announcement.dayCount,
                ranges: announcement.ranges,
                days: announcement.days.map((day) => ({ dayNumber: day.dayNumber, ranges: day.ranges })),
                groupId: announcement.groupId,
                announcementId: announcement.id,
                createdAt: timestamp,
                updatedAt: timestamp,
              };
              const participation: GroupBiblePlanParticipation = {
                id: participantId,
                announcementId: announcement.id,
                completedDayNumbers: {},
                totalDays: announcement.dayCount,
                joinedAt: timestamp,
                updatedAt: timestamp,
              };
              await update(ref(database), {
                [`biblePlans/${firebaseUser.uid}/${planId}`]: plan,
                [`groupBiblePlanParticipantIds/${firebaseUser.uid}/${announcement.id}`]: participantId,
                [`groupBiblePlanParticipation/${announcement.groupId}/${announcement.id}/${participantId}`]: participation,
              });
              return;
            }
            case "createSupportIntent": {
              if (!firebaseUser) return;
              const intent: SupportIntent = {
                id: id("support"),
                userId: firebaseUser.uid,
                amount: action.amount,
                currency: "SEK",
                provider: "external_demo",
                providerReference: `demo_${Date.now()}`,
                status: "confirmed",
                createdAt: now(),
              };
              await set(ref(database, `supportIntents/${firebaseUser.uid}/${intent.id}`), intent);
              return;
            }
            case "setTheme": {
              if (!firebaseUser) return;
              hasStoredThemeRef.current = true;
              isThemeSyncPendingRef.current = true;
              themeRef.current = action.theme;
              applyTheme(action.theme);
              setTheme(action.theme);
              const profileRef = ref(database, `profiles/${firebaseUser.uid}`);
              try {
                await update(profileRef, { theme: action.theme });
              } catch {
                isThemeSyncPendingRef.current = false;
              }
              return;
            }

          }
      } catch (error) {
        setAuthError(authMessage(error));
        if (
          action.type === "createBiblePlan" ||
          action.type === "pauseBiblePlan" ||
          action.type === "rescheduleBiblePlan" ||
          action.type === "requestPasswordReset" ||
          action.type === "confirmPasswordReset" ||
          action.type === "changePassword" ||
          action.type === "createGroup" ||
          action.type === "joinGroup" ||
          action.type === "removeGroupMember" ||
          action.type === "transferGroupOwnership" ||
          action.type === "uploadGroupImage" ||
          action.type === "deleteGroupImage" ||
          action.type === "uploadUserAvatar" ||
          action.type === "deleteUserAvatar" ||
          (action.type === "togglePostReaction" && action.mode === "ensure") ||
          (action.type === "createReply" && Boolean(action.replyId)) ||
          action.type === "markPrayerAnswered" ||
          action.type === "updatePrayerAnswer" ||
          action.type === "unmarkPrayerAnswered" ||
          (action.type === "finishPrayer" && action.throwOnError)
        ) {
          throw error;
        }
      }
    },
    [
      bibleHighlightColors,
      bibleHighlights,
      biblePlans,
      checkIns,
      clearUserSession,
      firebaseUser,
      groupBiblePlanAnnouncements,
      groupBiblePlanParticipantIds,
      groupBiblePlanParticipations,
      groups,
      journalEntries,
      memberships,
      posts,
      postReactions,
      prayerReactions,
      privateCheckIns,
      profile?.currentGroupId,
      profile?.name,
      replies,
      userMemberships,
    ],
  );

  const getAuthToken = useCallback(() => firebaseUser?.getIdToken(true) ?? Promise.resolve(null), [firebaseUser]);

  return <KoinoContext.Provider value={{ state, dispatch, getAuthToken }}>{children}</KoinoContext.Provider>;
}

export function useKoino() {
  const context = useContext(KoinoContext);
  if (!context) {
    throw new Error("useKoino must be used inside KoinoProvider");
  }
  return context;
}
