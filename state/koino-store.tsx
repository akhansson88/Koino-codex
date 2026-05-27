import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirebaseError, initializeApp, getApp, getApps } from "firebase/app";
import * as FirebaseAuth from "@firebase/auth";
import type { Auth, User as FirebaseUser } from "@firebase/auth";
import { get, getDatabase, onValue, ref, remove, set, update } from "firebase/database";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { activePrivateCheckIns } from "@/state/check-ins";
import { deleteRoomImage, deleteUserAvatar, roomImagePublicUrl, uploadRoomImage, uploadUserAvatar, userAvatarPublicUrl } from "@/state/supabase-storage";
import { applyTheme, normalizeTheme, StoredThemeName, ThemeName } from "@/ui/theme";
import {
  BibleHighlight,
  BibleHighlightColor,
  CheckIn,
  CommentReaction,
  CommentReactionKind,
  BibleVerse,
  EntryKind,
  Group,
  Id,
  JournalEntry,
  JournalEntryType,
  KoinoState,
  Membership,
  Post,
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
  | { type: "markPrayerAnswered"; id: Id }
  | { type: "unmarkPrayerAnswered"; id: Id }
  | { type: "finishPrayer"; targetType: PrayerSession["targetType"]; targetId: Id; status: PrayerSession["status"]; startedAt: string }
  | { type: "unpray"; targetType: PrayerReaction["targetType"]; targetId: Id }
  | { type: "createReply"; targetType: "post" | "check_in"; targetId: Id; body: string }
  | { type: "deleteReply"; id: Id }
  | { type: "toggleCommentReaction"; replyId: Id; kind: CommentReactionKind }
  | { type: "createJournalEntry"; body: string; entryKind?: EntryKind; journalType?: JournalEntryType; heartMood?: HeartMood; verse?: BibleVerse; verses?: BibleVerse[]; shareWithGroup?: boolean; title?: string }
  | { type: "updateJournalEntry"; id: Id; body: string; entryKind?: EntryKind; journalType?: JournalEntryType; heartMood?: HeartMood; verse?: BibleVerse; verses?: BibleVerse[]; sharedPostId?: Id; title?: string }
  | { type: "deleteJournalEntry"; id: Id }
  | { type: "saveVerse"; verse: BibleVerse }
  | { type: "removeSavedVerse"; id: Id }
  | { type: "highlightVerses"; color: BibleHighlightColor; verses: BibleVerse[] }
  | { type: "removeBibleHighlight"; id: Id }
  | { type: "createSupportIntent"; amount: number }
  | { type: "setTheme"; theme: ThemeName };


type KoinoContextValue = {
  state: KoinoState;
  dispatch: (action: Action) => Promise<void>;
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

function savedVerseId(verse: Pick<BibleVerse, "reference" | "translation">) {
  return `${verse.reference}_${verse.translation ?? "default"}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const bibleHighlightColors: BibleHighlightColor[] = ["#FFF200", "#4DF06A", "#09C6DF", "#FFC166"];

function isBibleHighlightColor(value: unknown): value is BibleHighlightColor {
  return typeof value === "string" && bibleHighlightColors.includes(value as BibleHighlightColor);
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
}

async function createGroupForUser(user: FirebaseUser, name: string, userName?: string) {
  if (!name.trim()) return;

  await ensureProfile(user, userName);

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
  if (!normalizedCode) throw new Error("Enter a group invite code.");

  await ensureProfile(user, userName);

  const inviteSnapshot = await get(ref(database, `inviteCodes/${normalizedCode}`));
  const invite = inviteSnapshot.val() as { groupId?: string } | null;
  if (!invite?.groupId) throw new Error("No group exists for that invite code.");

  const timestamp = now();
  const membership: Membership = {
    id: id("membership"),
    userId: user.uid,
    groupId: invite.groupId,
    role: "member",
    userName: userName?.trim() || user.displayName || user.email?.split("@")[0] || "KOINO member",
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
    // Storage cleanup should never undo the room metadata update.
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

async function deleteFeedItemWithChildren(groupId: Id, targetType: "post" | "check_in", targetId: Id, ownerId: Id) {
  const [replySnapshot, reactionSnapshot, commentReactionSnapshot] = await Promise.all([
    get(ref(database, `replies/${groupId}`)),
    get(ref(database, `prayerReactions/${groupId}`)),
    get(ref(database, `commentReactions/${groupId}`)),
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

  asArray<CommentReaction>(commentReactionSnapshot.val())
    .filter((reaction) => childReplyIds.has(reaction.replyId))
    .forEach((reaction) => {
      childDeletes[`commentReactions/${groupId}/${reaction.id}`] = null;
      if (reaction.userId === ownerId) {
        ownedChildDeletes[`commentReactions/${groupId}/${reaction.id}`] = null;
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
  const [prayerReactions, setPrayerReactions] = useState<PrayerReaction[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [commentReactions, setCommentReactions] = useState<CommentReaction[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>([]);
  const [bibleHighlights, setBibleHighlights] = useState<BibleHighlight[]>([]);
  const [supportIntents, setSupportIntents] = useState<SupportIntent[]>([]);
  const [authError, setAuthError] = useState<string>();
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
    setPrayerReactions([]);
    setReplies([]);
    setCommentReactions([]);
    setJournalEntries([]);
    setSavedVerses([]);
    setBibleHighlights([]);
    setSupportIntents([]);
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
    if (!firebaseUser) return;

    const journalRef = ref(database, `journalEntries/${firebaseUser.uid}`);
    const privateCheckInsRef = ref(database, `privateCheckIns/${firebaseUser.uid}`);
    const sessionsRef = ref(database, `prayerSessions/${firebaseUser.uid}`);
    const savedVersesRef = ref(database, `savedVerses/${firebaseUser.uid}`);
    const bibleHighlightsRef = ref(database, `bibleHighlights/${firebaseUser.uid}`);
    const supportRef = ref(database, `supportIntents/${firebaseUser.uid}`);

    const unsubs = [
      onValue(journalRef, (snapshot) => setJournalEntries(asArray<JournalEntry>(snapshot.val()))),
      onValue(privateCheckInsRef, (snapshot) => setPrivateCheckIns(asArray<CheckIn>(snapshot.val()))),
      onValue(sessionsRef, (snapshot) => setPrayerSessions(asArray<PrayerSession>(snapshot.val()))),
      onValue(savedVersesRef, (snapshot) => setSavedVerses(asArray<SavedVerse>(snapshot.val()).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)))),
      onValue(bibleHighlightsRef, (snapshot) =>
        setBibleHighlights(
          asArray<BibleHighlight>(snapshot.val()).sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)),
        ),
      ),
      onValue(supportRef, (snapshot) => setSupportIntents(asArray<SupportIntent>(snapshot.val()))),
    ];

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !profile?.currentGroupId) {
      setMemberships([]);
      setCheckIns([]);
      setPosts([]);
      setReplies([]);
      setPrayerReactions([]);
      setCommentReactions([]);
      return;
    }

    const groupId = profile.currentGroupId;
    const membersRef = ref(database, `groupMembers/${groupId}`);
    const checkInsRef = ref(database, `checkIns/${groupId}`);
    const postsRef = ref(database, `posts/${groupId}`);
    const repliesRef = ref(database, `replies/${groupId}`);
    const reactionsRef = ref(database, `prayerReactions/${groupId}`);
    const commentReactionsRef = ref(database, `commentReactions/${groupId}`);

    const unsubs = [
      onValue(membersRef, (snapshot) => setMemberships(asArray<Membership>(snapshot.val()))),
      onValue(checkInsRef, (snapshot) => setCheckIns(asArray<CheckIn>(snapshot.val()))),
      onValue(postsRef, (snapshot) => setPosts(asArray<KoinoState["posts"][number]>(snapshot.val()))),
      onValue(repliesRef, (snapshot) => setReplies(asArray<Reply>(snapshot.val()))),
      onValue(reactionsRef, (snapshot) => setPrayerReactions(asArray<PrayerReaction>(snapshot.val()))),
      onValue(commentReactionsRef, (snapshot) => setCommentReactions(asArray<CommentReaction>(snapshot.val()))),
    ];

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [firebaseUser, profile?.currentGroupId]);

  const state = useMemo<KoinoState>(() => {
    const memberUsers = memberships.map<User>((membership) => ({
      id: membership.userId,
      name: membership.userName || (membership.userId === profile?.id ? profile.name : "Someone"),
      image: membership.userId === profile?.id ? profile.image : undefined,
      createdAt: membership.createdAt,
    }));
    const users = memberUsers.length > 0 ? memberUsers : profile ? [profile] : [];

    return {
      ready: themeReady && authReady && (!firebaseUser || (profileReady && userGroupsReady)),
      currentUserId: firebaseUser?.uid,
      currentGroupId: profile?.currentGroupId ?? undefined,
      authEmail: firebaseUser?.email ?? profile?.email ?? undefined,
      authError,
      theme,
      users,
      groups,
      groupMemberCounts,
      memberships,
      checkIns,
      privateCheckIns,
      posts,
      prayerSessions,
      prayerReactions,
      replies,
      commentReactions,
      journalEntries,
      savedVerses,
      bibleHighlights,
      supportIntents,
    };
  }, [
    authError,
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
    privateCheckIns,
    prayerReactions,
    commentReactions,
    prayerSessions,
    profile,
    profileReady,
    replies,
    savedVerses,
    bibleHighlights,
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
            case "updateGroup":
              await update(ref(database, `groups/${action.id}`), { name: action.name.trim(), updatedAt: now() });
              return;
            case "uploadGroupImage": {
              if (!firebaseUser) return;
              const groupSnapshot = await get(ref(database, `groups/${action.id}`));
              const groupToUpdate = groupSnapshot.val() as Group | null;
              if (!groupToUpdate || groupToUpdate.ownerId !== firebaseUser.uid) {
                throw new Error("Only the room owner can change the room image.");
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
                throw new Error("Only the room owner can delete the room image.");
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
                await update(ref(database, `profiles/${firebaseUser.uid}`), {
                  image: {
                    url,
                    path,
                    width: 512,
                    height: 512,
                    contentType: "image/webp",
                    updatedAt: timestamp,
                  },
                });
              } catch (error) {
                await deleteUserAvatarStoragePath(path);
                throw error;
              }

              await deleteUserAvatarStoragePath(profileToUpdate?.image?.path);
              return;
            }
            case "deleteUserAvatar": {
              if (!firebaseUser) return;
              const profileSnapshot = await get(ref(database, `profiles/${firebaseUser.uid}`));
              const profileToUpdate = profileSnapshot.val() as Profile | null;

              await update(ref(database, `profiles/${firebaseUser.uid}`), { image: null });
              await deleteUserAvatarStoragePath(profileToUpdate?.image?.path);
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
                [`commentReactions/${action.id}`]: null,
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
               if (!firebaseUser || !profile?.currentGroupId || !action.body.trim()) return;
               const verses = actionVerses(action);
               const post: Post = {
                 id: id("post"),
                 userId: firebaseUser.uid,
                 groupId: profile.currentGroupId,
                 kind: action.kind,
                 ...(action.title?.trim() ? { title: action.title.trim() } : {}),
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
               if (!action.body.trim()) return;
               await update(ref(database, `posts/${profile.currentGroupId}/${action.id}`), {
                 body: action.body.trim(),
                 kind: action.kind,
                 title: action.title?.trim() || null,
                 verse: actionVerses(action)[0] ?? null,
                 verses: actionVerses(action).length ? actionVerses(action) : null,
                 // Note: We don't update createdAt to preserve the original timestamp
                 // We also don't update answeredAt or answeredMarkedAt for prayer requests
               });
               return;
             }
             case "markPrayerAnswered": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const post = posts.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!post || post.userId !== firebaseUser.uid || post.kind !== "prayer_request") return;
              await update(ref(database, `posts/${profile.currentGroupId}/${action.id}`), {
                answeredAt: now(),
                answeredMarkedAt: now(),
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
              } else {
                if (!journalEntries.some((item) => item.id === action.targetId && item.userId === firebaseUser.uid)) return;
              }
              const completedAt = now();
              const session: PrayerSession = {
                id: id("prayersession"),
                userId: firebaseUser.uid,
                targetType: action.targetType,
                targetId: action.targetId,
                startedAt: action.startedAt,
                completedAt,
                status: action.status,
              };

              await set(ref(database, `prayerSessions/${firebaseUser.uid}/${session.id}`), session);

              if (action.status === "completed" && action.targetType !== "journal_entry" && profile?.currentGroupId) {
                const reactionId = `${firebaseUser.uid}_${action.targetType}_${action.targetId}`;
                const reaction: PrayerReaction = {
                  id: reactionId,
                  userId: firebaseUser.uid,
                  targetType: action.targetType,
                  targetId: action.targetId,
                  createdAt: completedAt,
                };
                await set(ref(database, `prayerReactions/${profile.currentGroupId}/${reactionId}`), reaction);
              }
              return;
            }
            case "unpray": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const reactionId = `${firebaseUser.uid}_${action.targetType}_${action.targetId}`;
              await remove(ref(database, `prayerReactions/${profile.currentGroupId}/${reactionId}`));
              return;
            }
            case "createReply": {
              if (!firebaseUser || !profile?.currentGroupId || !action.body.trim()) return;
              const reply: Reply = {
                id: id("reply"),
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
                ...commentReactions
                  .filter((reaction) => reaction.replyId === action.id)
                  .reduce<Record<string, null>>((deletes, reaction) => {
                    deletes[`commentReactions/${profile.currentGroupId}/${reaction.id}`] = null;
                    return deletes;
                  }, {}),
                [`replies/${profile.currentGroupId}/${action.id}`]: null,
              });
              return;
            }
            case "toggleCommentReaction": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              if (!replies.some((reply) => reply.id === action.replyId)) return;
              const reactionId = `${firebaseUser.uid}_${action.replyId}_${action.kind}`;
              const existing = commentReactions.some((reaction) => reaction.id === reactionId && reaction.userId === firebaseUser.uid);
              if (existing) {
                await remove(ref(database, `commentReactions/${profile.currentGroupId}/${reactionId}`));
                return;
              }
              const userReplyReactions = commentReactions.filter(
                (reaction) => reaction.userId === firebaseUser.uid && reaction.replyId === action.replyId,
              );
              const reaction: CommentReaction = {
                id: reactionId,
                userId: firebaseUser.uid,
                replyId: action.replyId,
                kind: action.kind,
                createdAt: now(),
              };
              await update(ref(database), {
                ...userReplyReactions.reduce<Record<string, null>>((deletes, currentReaction) => {
                  deletes[`commentReactions/${profile.currentGroupId}/${currentReaction.id}`] = null;
                  return deletes;
                }, {}),
                [`commentReactions/${profile.currentGroupId}/${reactionId}`]: reaction,
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
                journalType: action.journalType ?? (action.entryKind === "prayer_request" ? "prayer" : action.entryKind === "praise" ? "answered_prayer" : action.entryKind === "scripture" ? "scripture_note" : "reflection"),
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
                const post: Post = {
                  id: postId,
                  userId: firebaseUser.uid,
                  groupId: profile.currentGroupId,
                  kind: action.entryKind ?? "reflection",
                  ...(action.title?.trim() ? { title: action.title.trim() } : {}),
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
              const key = savedVerseId(action.verse);
              if (!key) return;
              const savedVerse: SavedVerse = {
                ...action.verse,
                id: key,
                referenceText: action.verse.referenceText ?? action.verse.reference,
                savedAt: now(),
              };
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
              const highlights = action.verses
                .map((verse): BibleHighlight | undefined => {
                  const key = savedVerseId(verse);
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
                    color: action.color,
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
          action.type === "requestPasswordReset" ||
          action.type === "confirmPasswordReset" ||
          action.type === "changePassword" ||
          action.type === "createGroup" ||
          action.type === "joinGroup" ||
          action.type === "uploadGroupImage" ||
          action.type === "deleteGroupImage" ||
          action.type === "uploadUserAvatar" ||
          action.type === "deleteUserAvatar"
        ) {
          throw error;
        }
      }
    },
    [
      bibleHighlights,
      checkIns,
      clearUserSession,
      commentReactions,
      firebaseUser,
      groups,
      journalEntries,
      posts,
      prayerReactions,
      privateCheckIns,
      profile?.currentGroupId,
      profile?.name,
      replies,
      userMemberships,
    ],
  );

  return <KoinoContext.Provider value={{ state, dispatch }}>{children}</KoinoContext.Provider>;
}

export function useKoino() {
  const context = useContext(KoinoContext);
  if (!context) {
    throw new Error("useKoino must be used inside KoinoProvider");
  }
  return context;
}
