import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirebaseError, initializeApp, getApp, getApps } from "firebase/app";
import * as FirebaseAuth from "@firebase/auth";
import type { Auth, User as FirebaseUser } from "@firebase/auth";
import { get, getDatabase, onValue, ref, remove, set, update } from "firebase/database";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  CheckIn,
  Group,
  Id,
  JournalEntry,
  KoinoState,
  Membership,
  PrayerReaction,
  PrayerSession,
  Reply,
  SupportIntent,
  User,
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

type Profile = User & {
  email?: string | null;
  currentGroupId?: Id | null;
};

type Action =
  | { type: "signIn"; email: string; password: string }
  | { type: "signUp"; email: string; password: string; name: string }
  | { type: "signOut" }
  | { type: "createSession"; name: string; groupName?: string; inviteCode?: string }
  | { type: "createGroup"; name: string }
  | { type: "joinGroup"; inviteCode: string }
  | { type: "switchGroup"; id: Id }
  | { type: "leaveGroup"; id: Id }
  | { type: "updateGroup"; id: Id; name: string }
  | { type: "deleteGroup"; id: Id }
  | { type: "submitCheckIn"; mood: number; readToday: boolean; reflectionText: string; visibility: CheckIn["visibility"] }
  | { type: "deleteCheckIn"; id: Id }
  | { type: "createPost"; body: string }
  | { type: "deletePost"; id: Id }
  | { type: "finishPrayer"; targetType: "post" | "check_in"; targetId: Id; status: PrayerSession["status"]; startedAt: string }
  | { type: "unpray"; targetType: "post" | "check_in"; targetId: Id }
  | { type: "createReply"; targetType: "post" | "check_in"; targetId: Id; body: string }
  | { type: "deleteReply"; id: Id }
  | { type: "createJournalEntry"; body: string }
  | { type: "updateJournalEntry"; id: Id; body: string }
  | { type: "deleteJournalEntry"; id: Id }
  | { type: "createSupportIntent"; amount: number };

type KoinoContextValue = {
  state: KoinoState;
  dispatch: (action: Action) => void;
};

const KoinoContext = createContext<KoinoContextValue | null>(null);

function now() {
  return new Date().toISOString();
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

function authMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }

  switch (error.code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Try signing in instead.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "The email or password did not match.";
    case "auth/weak-password":
      return "Use a password with at least 6 characters.";
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

export function KoinoProvider({ children }: PropsWithChildren) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [userGroupsReady, setUserGroupsReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [userMemberships, setUserMemberships] = useState<Membership[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [posts, setPosts] = useState<KoinoState["posts"]>([]);
  const [prayerSessions, setPrayerSessions] = useState<PrayerSession[]>([]);
  const [prayerReactions, setPrayerReactions] = useState<PrayerReaction[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [supportIntents, setSupportIntents] = useState<SupportIntent[]>([]);
  const [authError, setAuthError] = useState<string>();

  useEffect(() => {
    return FirebaseAuth.onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      setAuthError(undefined);

      if (!user) {
        setProfile(null);
        setProfileReady(true);
        setUserGroupsReady(true);
        setGroups([]);
        setUserMemberships([]);
        setMemberships([]);
        setCheckIns([]);
        setPosts([]);
        setPrayerSessions([]);
        setPrayerReactions([]);
        setReplies([]);
        setJournalEntries([]);
        setSupportIntents([]);
      }
    });
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    setProfileReady(false);
    const profileRef = ref(database, `profiles/${firebaseUser.uid}`);
    const unsubscribe = onValue(profileRef, async (snapshot) => {
      if (!snapshot.exists()) {
        await ensureProfile(firebaseUser);
        return;
      }

      setProfile(snapshot.val() as Profile);
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
    const sessionsRef = ref(database, `prayerSessions/${firebaseUser.uid}`);
    const supportRef = ref(database, `supportIntents/${firebaseUser.uid}`);

    const unsubs = [
      onValue(journalRef, (snapshot) => setJournalEntries(asArray<JournalEntry>(snapshot.val()))),
      onValue(sessionsRef, (snapshot) => setPrayerSessions(asArray<PrayerSession>(snapshot.val()))),
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
      return;
    }

    const groupId = profile.currentGroupId;
    const membersRef = ref(database, `groupMembers/${groupId}`);
    const checkInsRef = ref(database, `checkIns/${groupId}`);
    const postsRef = ref(database, `posts/${groupId}`);
    const repliesRef = ref(database, `replies/${groupId}`);
    const reactionsRef = ref(database, `prayerReactions/${groupId}`);

    const unsubs = [
      onValue(membersRef, (snapshot) => setMemberships(asArray<Membership>(snapshot.val()))),
      onValue(checkInsRef, (snapshot) => setCheckIns(asArray<CheckIn>(snapshot.val()))),
      onValue(postsRef, (snapshot) => setPosts(asArray<KoinoState["posts"][number]>(snapshot.val()))),
      onValue(repliesRef, (snapshot) => setReplies(asArray<Reply>(snapshot.val()))),
      onValue(reactionsRef, (snapshot) => setPrayerReactions(asArray<PrayerReaction>(snapshot.val()))),
    ];

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [firebaseUser, profile?.currentGroupId]);

  const state = useMemo<KoinoState>(() => {
    const memberUsers = memberships.map<User>((membership) => ({
      id: membership.userId,
      name: membership.userName || (membership.userId === profile?.id ? profile.name : "Someone"),
      createdAt: membership.createdAt,
    }));
    const users = memberUsers.length > 0 ? memberUsers : profile ? [profile] : [];

    return {
      ready: authReady && (!firebaseUser || (profileReady && userGroupsReady)),
      currentUserId: firebaseUser?.uid,
      currentGroupId: profile?.currentGroupId ?? undefined,
      authEmail: firebaseUser?.email ?? profile?.email ?? undefined,
      authError,
      users,
      groups,
      memberships,
      checkIns,
      posts,
      prayerSessions,
      prayerReactions,
      replies,
      journalEntries,
      supportIntents,
    };
  }, [
    authError,
    authReady,
    checkIns,
    firebaseUser,
    groups,
    journalEntries,
    memberships,
    posts,
    prayerReactions,
    prayerSessions,
    profile,
    profileReady,
    replies,
    supportIntents,
    userGroupsReady,
  ]);

  const dispatch = useCallback(
    (action: Action) => {
      void (async () => {
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
              await FirebaseAuth.signOut(auth);
              return;
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
              return;
            }
            case "submitCheckIn": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const timestamp = now();
              const checkIn: CheckIn = {
                id: id("checkin"),
                userId: firebaseUser.uid,
                groupId: profile.currentGroupId,
                mood: action.mood,
                readToday: action.readToday,
                reflectionText: action.reflectionText.trim(),
                visibility: action.visibility,
                createdAt: timestamp,
              };

              if (action.visibility === "group") {
                await set(ref(database, `checkIns/${profile.currentGroupId}/${checkIn.id}`), checkIn);
              } else {
                await set(ref(database, `privateCheckIns/${firebaseUser.uid}/${checkIn.id}`), checkIn);
              }

              if (action.visibility === "private") {
                const entry: JournalEntry = {
                  id: id("journal"),
                  userId: firebaseUser.uid,
                  body: action.reflectionText.trim() || "Private check-in",
                  source: "private_check_in",
                  mood: action.mood,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                };
                await set(ref(database, `journalEntries/${firebaseUser.uid}/${entry.id}`), entry);
              }
              return;
            }
            case "createPost": {
              if (!firebaseUser || !profile?.currentGroupId || !action.body.trim()) return;
              const post = {
                id: id("post"),
                userId: firebaseUser.uid,
                groupId: profile.currentGroupId,
                body: action.body.trim(),
                createdAt: now(),
              };
              await set(ref(database, `posts/${profile.currentGroupId}/${post.id}`), post);
              return;
            }
            case "deleteCheckIn": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const checkIn = checkIns.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!checkIn || checkIn.userId !== firebaseUser.uid) return;

              const updates: Record<string, null> = {
                [`checkIns/${profile.currentGroupId}/${action.id}`]: null,
              };

              replies
                .filter((reply) => reply.targetType === "check_in" && reply.targetId === action.id)
                .forEach((reply) => {
                  updates[`replies/${profile.currentGroupId}/${reply.id}`] = null;
                });
              prayerReactions
                .filter((reaction) => reaction.targetType === "check_in" && reaction.targetId === action.id)
                .forEach((reaction) => {
                  updates[`prayerReactions/${profile.currentGroupId}/${reaction.id}`] = null;
                });

              await update(ref(database), updates);
              return;
            }
            case "deletePost": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const post = posts.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!post || post.userId !== firebaseUser.uid) return;

              const updates: Record<string, null> = {
                [`posts/${profile.currentGroupId}/${action.id}`]: null,
              };

              replies
                .filter((reply) => reply.targetType === "post" && reply.targetId === action.id)
                .forEach((reply) => {
                  updates[`replies/${profile.currentGroupId}/${reply.id}`] = null;
                });
              prayerReactions
                .filter((reaction) => reaction.targetType === "post" && reaction.targetId === action.id)
                .forEach((reaction) => {
                  updates[`prayerReactions/${profile.currentGroupId}/${reaction.id}`] = null;
                });

              await update(ref(database), updates);
              return;
            }
            case "finishPrayer": {
              if (!firebaseUser || !profile?.currentGroupId) return;
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

              if (action.status === "completed") {
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
              await remove(ref(database, `replies/${profile.currentGroupId}/${action.id}`));
              return;
            }
            case "createJournalEntry": {
              if (!firebaseUser || !action.body.trim()) return;
              const timestamp = now();
              const entry: JournalEntry = {
                id: id("journal"),
                userId: firebaseUser.uid,
                body: action.body.trim(),
                source: "manual",
                createdAt: timestamp,
                updatedAt: timestamp,
              };
              await set(ref(database, `journalEntries/${firebaseUser.uid}/${entry.id}`), entry);
              return;
            }
            case "updateJournalEntry":
              if (!firebaseUser) return;
              await update(ref(database, `journalEntries/${firebaseUser.uid}/${action.id}`), {
                body: action.body.trim(),
                updatedAt: now(),
              });
              return;
            case "deleteJournalEntry":
              if (!firebaseUser) return;
              await remove(ref(database, `journalEntries/${firebaseUser.uid}/${action.id}`));
              return;
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
          }
        } catch (error) {
          setAuthError(authMessage(error));
        }
      })();
    },
    [checkIns, firebaseUser, groups, posts, prayerReactions, profile?.currentGroupId, profile?.name, replies, userMemberships],
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
