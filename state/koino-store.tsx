import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FirebaseAuth from "@firebase/auth";
import type { User as FirebaseUser } from "@firebase/auth";
import {
  equalTo,
  get,
  onValue,
  orderByChild,
  query,
  ref,
  remove,
  runTransaction,
  set,
  update,
} from "firebase/database";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckInSubmissionError, checkInExistsForDay } from "@/state/check-ins";
import {
  fetchOlderFirebasePage,
  FIREBASE_PAGE_SIZE,
  firebaseRecords,
  mergeFirebaseRecords,
  recentFirebaseQuery,
} from "@/state/firebase-pagination";
import { markStartupMilestone } from "@/features/startup-performance";
import { biblePlanProgressUpdates, preserveBiblePlanProgress } from "@/state/bible-plan-progress";
import { isPlanDate, rescheduleBiblePlan } from "@/state/bible-plan-schedule";
import { buildBiblePlanDays, completedDayNumbers, planCompletionStatus } from "@/features/bible-plans";
import { normalizeSavedVerseRecords, savedVerseIdentity, savedVerseStorageId } from "@/state/saved-verses";
import { createSnapshotStore, useSelectedSnapshot, type SnapshotStore } from "@/state/selective-store";
import { roomImagePublicUrl, uploadRoomImage, uploadUserAvatar, userAvatarPublicUrl } from "@/state/supabase-storage";
import { applyTheme, normalizeTheme, ThemeName } from "@/ui/theme";
import {
  ActivityNotification,
  BibleHighlight,
  BibleHighlightPaletteColor,
  CheckIn,
  CheckInDailyClaim,
  DiscussionFollow,
  BiblePlan,
  GroupBiblePlanAnnouncement,
  GroupBiblePlanParticipation,
  Group,
  Id,
  JournalEntry,
  KoinoState,
  Membership,
  NotificationPreferences,
  Post,
  PostReaction,
  PrayerNotification,
  PrayerReaction,
  PrayerSession,
  Reply,
  SavedVerse,
  SupportIntent,
  User,
} from "@/state/types";
import { type CommunityPageAvailability, type KoinoContextValue, type Profile, type Action } from "@/state/store/types";
import { auth, database } from "@/state/store/firebase";
import { ensureProfile, createGroupForUser, joinGroupByInvite } from "@/state/store/profile-operations";
import {
  authMessage,
  asArray,
  now,
  defaultBibleHighlightColors,
  localDayKey,
  actionVerses,
  id,
  validPostContent,
  postSupportsTitle,
  prayerReactionId,
  isMatchingPrayerReaction,
  prayerSessionFromReaction,
  isBibleHighlightColor,
  normalizeHighlightColor,
  bibleReferenceStorageId,
  highlightColorLabel,
} from "@/state/store/helpers";
import {
  syncUserMembershipImage,
  localUriToArrayBuffer,
  deleteRoomStoragePath,
  profileAndMembershipImageUpdates,
  deleteUserAvatarStoragePath,
} from "@/state/store/image-operations";
import { deleteFeedItemWithChildren } from "@/state/store/feed-operations";

const pendingCheckInKeys = new Set<string>();

const CHECK_IN_CLAIM_RECOVERY_MS = 2 * 60 * 1000;

function checkInClaimPath(userId: string, groupId: string, dayKey: string) {
  return `checkInDailyClaims/${userId}/${groupId}/${dayKey}`;
}

async function releaseCheckInClaim(userId: string, groupId: string, dayKey: string, checkInId: string) {
  await runTransaction(
    ref(database, checkInClaimPath(userId, groupId, dayKey)),
    (current: CheckInDailyClaim | null) => current?.checkInId === checkInId && current.status === "pending" ? null : undefined,
  );
}

function releaseDeletedCheckInClaim(userId: string, groupId: string, dayKey: string, checkInId: string) {
  return runTransaction(
    ref(database, checkInClaimPath(userId, groupId, dayKey)),
    (current: CheckInDailyClaim | null) => current?.checkInId === checkInId ? null : undefined,
  );
}

async function commitCheckInClaim(userId: string, groupId: string, dayKey: string, checkInId: string) {
  const claimRef = ref(database, checkInClaimPath(userId, groupId, dayKey));
  const claim = (await get(claimRef)).val() as CheckInDailyClaim | null;
  if (claim?.checkInId !== checkInId || claim.status === "committed") return;
  if (claim.status !== "pending") return;

  try {
    await set(claimRef, { ...claim, status: "committed" });
  } catch (error) {
    const latest = (await get(claimRef)).val() as CheckInDailyClaim | null;
    if (latest?.checkInId !== checkInId || latest.status !== "committed") throw error;
  }
}

async function claimCheckInDay(
  userId: string,
  groupId: string,
  dayKey: string,
  claim: CheckInDailyClaim,
) {
  const claimRef = ref(database, checkInClaimPath(userId, groupId, dayKey));
  const create = await runTransaction(
    claimRef,
    (current: CheckInDailyClaim | null) => current ? undefined : claim,
  );
  if (create.committed) return;

  const existing = create.snapshot.val() as CheckInDailyClaim | null;
  if (!existing) throw new CheckInSubmissionError("in_progress");

  const existingPath = existing.visibility === "group"
    ? `checkIns/${groupId}/${existing.checkInId}`
    : `privateCheckIns/${userId}/${existing.checkInId}`;
  const existingRecord = await get(ref(database, existingPath));
  if (existingRecord.exists()) {
    if (existing.status === "pending") {
      await commitCheckInClaim(userId, groupId, dayKey, existing.checkInId).catch(() => undefined);
    }
    throw new CheckInSubmissionError("already_submitted");
  }
  if (existing.status === "committed") {
    const cleanup = await releaseDeletedCheckInClaim(userId, groupId, dayKey, existing.checkInId);
    if (!cleanup.committed) throw new CheckInSubmissionError("in_progress");
    const retry = await runTransaction(claimRef, (current: CheckInDailyClaim | null) => current ? undefined : claim);
    if (!retry.committed) throw new CheckInSubmissionError("in_progress");
    return;
  }
  if (existing.status !== "pending") throw new CheckInSubmissionError("in_progress");

  const claimAge = Date.now() - existing.createdAt;
  if (Number.isFinite(claimAge) && claimAge < CHECK_IN_CLAIM_RECOVERY_MS) {
    throw new CheckInSubmissionError("in_progress");
  }

  const cleanup = await runTransaction(
    claimRef,
    (current: CheckInDailyClaim | null) =>
      current?.checkInId === existing.checkInId && current.status === "pending" && current.createdAt === existing.createdAt ? null : undefined,
  );
  if (!cleanup.committed) throw new CheckInSubmissionError("in_progress");

  const retry = await runTransaction(
    claimRef,
    (current: CheckInDailyClaim | null) => current ? undefined : claim,
  );
  if (!retry.committed) throw new CheckInSubmissionError("in_progress");
}

const pendingPrayerCompletionKeys = new Set<string>();

const pendingSavedVerseDedupKeys = new Set<string>();

const passwordResetUrl = "https://koino-codex.firebaseapp.com/reset-password";

const themeStorageKey = "koino.theme";

const noCommunityPages: CommunityPageAvailability = {
  checkIns: false,
  posts: false,
  replies: false,
  prayerReactions: false,
  postReactions: false,
};

const defaultNotificationPreferences: NotificationPreferences = {
  pushEnabled: true,
  ownContent: true,
  mentions: true,
  followedDiscussions: true,
  prayerActivity: true,
};

const KoinoContext = createContext<KoinoContextValue | null>(null);

const KoinoSnapshotContext = createContext<SnapshotStore<KoinoState> | null>(null);

const KoinoActionsContext = createContext<Pick<KoinoContextValue, "dispatch" | "getAuthToken"> | null>(null);

export function useKoinoSelector<Value>(selector: (state: KoinoState) => Value): Value {
  const store = useContext(KoinoSnapshotContext);
  if (!store) throw new Error("useKoinoSelector must be used inside KoinoProvider");
  return useSelectedSnapshot(store, selector);
}

export function useKoinoActions() {
  const actions = useContext(KoinoActionsContext);
  if (!actions) throw new Error("useKoinoActions must be used inside KoinoProvider");
  return actions;
}

export function useKoinoFields<const Keys extends readonly (keyof KoinoState)[]>(keys: Keys): Pick<KoinoState, Keys[number]> {
  const key = keys.join("|");
  const previous = useRef<Pick<KoinoState, Keys[number]> | null>(null);
  const selector = useCallback((state: KoinoState) => {
    if (previous.current && keys.every((field) => Object.is((previous.current as KoinoState)[field], state[field]))) {
      return previous.current;
    }
    const next = Object.fromEntries(keys.map((field) => [field, state[field]])) as Pick<KoinoState, Keys[number]>;
    previous.current = next;
    return next;
  }, [key]);
  return useKoinoSelector(selector);
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
  const [privateCheckInsReady, setPrivateCheckInsReady] = useState(false);
  const [checkInDailyClaims, setCheckInDailyClaims] = useState<CheckInDailyClaim[]>([]);
  const [checkInDailyClaimsReady, setCheckInDailyClaimsReady] = useState(false);
  const [posts, setPosts] = useState<KoinoState["posts"]>([]);
  const [prayerSessions, setPrayerSessions] = useState<PrayerSession[]>([]);
  const [prayerNotifications, setPrayerNotifications] = useState<PrayerNotification[]>([]);
  const [activityNotifications, setActivityNotifications] = useState<ActivityNotification[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [prayerReactions, setPrayerReactions] = useState<PrayerReaction[]>([]);
  const [postReactions, setPostReactions] = useState<PostReaction[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [discussionFollows, setDiscussionFollows] = useState<DiscussionFollow[]>([]);
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
  const [communityPageAvailability, setCommunityPageAvailability] = useState<CommunityPageAvailability>(noCommunityPages);
  const [communityContentLoadingMore, setCommunityContentLoadingMore] = useState(false);
  const [journalEntriesHasMore, setJournalEntriesHasMore] = useState(false);
  const [journalEntriesLoadingMore, setJournalEntriesLoadingMore] = useState(false);
  const [privateCheckInsHasMore, setPrivateCheckInsHasMore] = useState(false);
  const [prayerNotificationsHasMore, setPrayerNotificationsHasMore] = useState(false);
  const [prayerNotificationsLoadingMore, setPrayerNotificationsLoadingMore] = useState(false);
  const olderJournalEntriesRef = useRef<JournalEntry[]>([]);
  const olderPrivateCheckInsRef = useRef<CheckIn[]>([]);
  const olderPrayerNotificationsRef = useRef<PrayerNotification[]>([]);
  const olderCheckInsRef = useRef<CheckIn[]>([]);
  const olderPostsRef = useRef<Post[]>([]);
  const olderRepliesRef = useRef<Reply[]>([]);
  const olderPrayerReactionsRef = useRef<PrayerReaction[]>([]);
  const olderPostReactionsRef = useRef<PostReaction[]>([]);
  const [theme, setTheme] = useState<ThemeName>("light");
  const membershipGroupIds = useMemo(() => [...new Set(userMemberships.map((item) => item.groupId))].sort(), [userMemberships]);
  const membershipGroupKey = JSON.stringify(membershipGroupIds);
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
    setPrivateCheckInsReady(true);
    setCheckInDailyClaims([]);
    setCheckInDailyClaimsReady(true);
    setPosts([]);
    setPrayerSessions([]);
    setPrayerNotifications([]);
    setActivityNotifications([]);
    setNotificationPreferences(defaultNotificationPreferences);
    setPrayerReactions([]);
    setPostReactions([]);
    setReplies([]);
    setDiscussionFollows([]);
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
    setCommunityPageAvailability(noCommunityPages);
    setCommunityContentLoadingMore(false);
    setJournalEntriesHasMore(false);
    setJournalEntriesLoadingMore(false);
    setPrivateCheckInsHasMore(false);
    setPrayerNotificationsHasMore(false);
    setPrayerNotificationsLoadingMore(false);
    olderJournalEntriesRef.current = [];
    olderPrivateCheckInsRef.current = [];
    olderPrayerNotificationsRef.current = [];
    olderCheckInsRef.current = [];
    olderPostsRef.current = [];
    olderRepliesRef.current = [];
    olderPrayerReactionsRef.current = [];
    olderPostReactionsRef.current = [];
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
      markStartupMilestone("authReady", user ? "signed-in" : "signed-out");
      setAuthError(undefined);

      if (!user) {
        markStartupMilestone("profileReady", "signed-out");
        markStartupMilestone("userGroupsReady", "signed-out");
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
    setProfile(null);
    let active = true;
    const profileRef = ref(database, `profiles/${firebaseUser.uid}`);
    const unsubscribe = onValue(
      profileRef,
      async (snapshot) => {
        if (!active) return;
        if (!snapshot.exists()) {
          try {
            await ensureProfile(firebaseUser);
          } catch (error) {
            if (!active) return;
            setAuthError(authMessage(error));
            setProfileReady(true);
            markStartupMilestone("profileReady", "error");
          }
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
        markStartupMilestone("profileReady");
      },
      (error) => {
        if (!active) return;
        setAuthError(authMessage(error));
        setProfileReady(true);
        markStartupMilestone("profileReady", "error");
      },
    );

    return () => { active = false; unsubscribe(); };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;

    setUserGroupsReady(false);
    setUserMemberships([]);
    let active = true;
    const userGroupsRef = ref(database, `userGroups/${firebaseUser.uid}`);
    const unsubscribe = onValue(
      userGroupsRef,
      (snapshot) => {
        if (!active) return;
        setUserMemberships(asArray<Membership>(snapshot.val()));
        setUserGroupsReady(true);
        markStartupMilestone("userGroupsReady");
      },
      (error) => {
        if (!active) return;
        setAuthError(authMessage(error));
        setUserGroupsReady(true);
        markStartupMilestone("userGroupsReady", "error");
      },
    );

    return () => { active = false; unsubscribe(); };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;

    if (membershipGroupIds.length === 0) {
      setGroups([]);
      return;
    }

    const groupById = new Map<Id, Group>();
    let active = true;
    const syncGroups = () => {
      setGroups(
        Array.from(groupById.values()).sort((a, b) => {
          const createdOrder = Date.parse(a.createdAt) - Date.parse(b.createdAt);
          return createdOrder || a.name.localeCompare(b.name);
        }),
      );
    };

    const unsubs = membershipGroupIds.map((groupId) =>
      onValue(ref(database, `groups/${groupId}`), (snapshot) => {
        if (!active) return;
        if (snapshot.exists()) {
          groupById.set(groupId, snapshot.val() as Group);
        } else {
          groupById.delete(groupId);
        }
        syncGroups();
      }),
    );

    return () => { active = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
  }, [firebaseUser?.uid, membershipGroupKey]);

  useEffect(() => {
    if (!firebaseUser) return;

    if (membershipGroupIds.length === 0) {
      setGroupMemberCounts({});
      return;
    }

    const counts = Object.fromEntries(membershipGroupIds.filter((groupId) => groupId !== profile?.currentGroupId).map((groupId) => [groupId, 0])) as Record<Id, number>;
    let active = true;

    const syncCounts = () => {
      setGroupMemberCounts((current) => {
        const next = Object.fromEntries(membershipGroupIds.map((groupId) =>
          [groupId, groupId === profile?.currentGroupId ? current[groupId] ?? 0 : counts[groupId]],
        ));
        return Object.keys(current).length === membershipGroupIds.length &&
          membershipGroupIds.every((groupId) => current[groupId] === next[groupId]) ? current : next;
      });
    };
    syncCounts();

    const unsubs = membershipGroupIds.filter((groupId) => groupId !== profile?.currentGroupId).map((groupId) =>
      onValue(ref(database, `groupMembers/${groupId}`), (snapshot) => {
        if (!active) return;
        counts[groupId] = Object.keys(snapshot.val() ?? {}).length;
        syncCounts();
      }),
    );

    return () => { active = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
  }, [firebaseUser?.uid, membershipGroupKey, profile?.currentGroupId]);

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
    const activityNotificationsRef = ref(database, `activityNotifications/${firebaseUser.uid}`);
    const notificationPreferencesRef = ref(database, `notificationPreferences/${firebaseUser.uid}`);
    const savedVersesRef = ref(database, `savedVerses/${firebaseUser.uid}`);
    const bibleHighlightsRef = ref(database, `bibleHighlights/${firebaseUser.uid}`);
    const bibleHighlightColorsRef = ref(database, `bibleHighlightColors/${firebaseUser.uid}`);
    const bibleHighlightColorSettingsRef = ref(database, `bibleHighlightColorSettings/${firebaseUser.uid}`);
    const biblePlansRef = ref(database, `biblePlans/${firebaseUser.uid}`);
    const participantIdsRef = ref(database, `groupBiblePlanParticipantIds/${firebaseUser.uid}`);
    const supportRef = ref(database, `supportIntents/${firebaseUser.uid}`);

    olderJournalEntriesRef.current = [];
    olderPrivateCheckInsRef.current = [];
    setPrivateCheckInsReady(false);
    olderPrayerNotificationsRef.current = [];
    setJournalEntriesHasMore(false);
    setPrivateCheckInsHasMore(false);
    setPrayerNotificationsHasMore(false);

    const unsubs = [
      onValue(recentFirebaseQuery(journalRef), (snapshot) => {
        const recent = firebaseRecords<JournalEntry>(snapshot.val());
        setJournalEntries(mergeFirebaseRecords(olderJournalEntriesRef.current, recent));
        setJournalEntriesHasMore(recent.length === FIREBASE_PAGE_SIZE);
      }),
      onValue(recentFirebaseQuery(privateCheckInsRef), (snapshot) => {
        const recent = firebaseRecords<CheckIn>(snapshot.val());
        setPrivateCheckIns(mergeFirebaseRecords(olderPrivateCheckInsRef.current, recent));
        setPrivateCheckInsHasMore(recent.length === FIREBASE_PAGE_SIZE);
        setPrivateCheckInsReady(true);
      }, (error) => {
        setAuthError(authMessage(error));
      }),
      onValue(sessionsRef, (snapshot) => setPrayerSessions(asArray<PrayerSession>(snapshot.val()))),
      onValue(recentFirebaseQuery(prayerNotificationsRef), (snapshot) => {
        const recent = firebaseRecords<PrayerNotification>(snapshot.val());
        setPrayerNotifications(mergeFirebaseRecords(olderPrayerNotificationsRef.current, recent));
        setPrayerNotificationsHasMore(recent.length === FIREBASE_PAGE_SIZE);
      }),
      onValue(recentFirebaseQuery(activityNotificationsRef), (snapshot) => {
        setActivityNotifications(firebaseRecords<ActivityNotification>(snapshot.val()));
      }),
      onValue(notificationPreferencesRef, (snapshot) => {
        setNotificationPreferences({
          ...defaultNotificationPreferences,
          ...((snapshot.val() as Partial<NotificationPreferences> | null) ?? {}),
        });
      }),
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
      setCheckInDailyClaims([]);
      setCheckInDailyClaimsReady(true);
      setPosts([]);
      setReplies([]);
      setDiscussionFollows([]);
      setPrayerReactions([]);
      setPostReactions([]);
      setCommunityPageAvailability(noCommunityPages);
      setCommunityContentLoadingMore(false);
      olderCheckInsRef.current = [];
      olderPostsRef.current = [];
      olderRepliesRef.current = [];
      olderPrayerReactionsRef.current = [];
      olderPostReactionsRef.current = [];
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
    setCheckInDailyClaims([]);
    setCheckInDailyClaimsReady(false);
    setPosts([]);
    setReplies([]);
    setDiscussionFollows([]);
    setPrayerReactions([]);
    setPostReactions([]);
    setCommunityPageAvailability(noCommunityPages);
    setCommunityContentLoadingMore(false);
    olderCheckInsRef.current = [];
    olderPostsRef.current = [];
    olderRepliesRef.current = [];
    olderPrayerReactionsRef.current = [];
    olderPostReactionsRef.current = [];
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
    const checkInDailyClaimsRef = ref(database, `checkInDailyClaims/${firebaseUser.uid}/${groupId}`);
    const postsRef = ref(database, `posts/${groupId}`);
    const repliesRef = ref(database, `replies/${groupId}`);
    const discussionFollowsRef = ref(database, `userDiscussionFollows/${firebaseUser.uid}/${groupId}`);
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
        const nextMembers = asArray<Membership>(snapshot.val());
        setMemberships(nextMembers);
        setGroupMemberCounts((current) => current[groupId] === nextMembers.length
          ? current : { ...current, [groupId]: nextMembers.length });
        membersReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(recentFirebaseQuery(checkInsRef), (snapshot) => {
        if (!active) return;
        const recent = firebaseRecords<CheckIn>(snapshot.val());
        setCheckIns(mergeFirebaseRecords(olderCheckInsRef.current, recent));
        setCommunityPageAvailability((current) => ({ ...current, checkIns: recent.length === FIREBASE_PAGE_SIZE }));
        checkInsReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(checkInDailyClaimsRef, (snapshot) => {
        if (!active) return;
        const claims = snapshot.val() as Record<string, Omit<CheckInDailyClaim, "dayKey">> | null;
        setCheckInDailyClaims(Object.entries(claims ?? {}).map(([dayKey, claim]) => ({ ...claim, dayKey })));
        setCheckInDailyClaimsReady(true);
      }, (error) => {
        if (!active) return;
        setAuthError(authMessage(error));
      }),
      onValue(recentFirebaseQuery(postsRef), (snapshot) => {
        if (!active) return;
        const recent = firebaseRecords<Post>(snapshot.val());
        setPosts(mergeFirebaseRecords(olderPostsRef.current, recent));
        setCommunityPageAvailability((current) => ({ ...current, posts: recent.length === FIREBASE_PAGE_SIZE }));
        postsReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(recentFirebaseQuery(repliesRef), (snapshot) => {
        if (!active) return;
        const recent = firebaseRecords<Reply>(snapshot.val());
        setReplies(mergeFirebaseRecords(olderRepliesRef.current, recent));
        setCommunityPageAvailability((current) => ({ ...current, replies: recent.length === FIREBASE_PAGE_SIZE }));
        repliesReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(discussionFollowsRef, (snapshot) => {
        if (!active) return;
        setDiscussionFollows(asArray<DiscussionFollow>(snapshot.val()));
      }),
      onValue(recentFirebaseQuery(reactionsRef), (snapshot) => {
        if (!active) return;
        const recent = firebaseRecords<PrayerReaction>(snapshot.val());
        setPrayerReactions(mergeFirebaseRecords(olderPrayerReactionsRef.current, recent));
        setCommunityPageAvailability((current) => ({ ...current, prayerReactions: recent.length === FIREBASE_PAGE_SIZE }));
        prayerReactionsReady = true;
        markCommunityFeedReady();
      }, handleCommunityFeedError),
      onValue(recentFirebaseQuery(postReactionsRef), (snapshot) => {
        if (!active) return;
        const recent = firebaseRecords<PostReaction>(snapshot.val());
        setPostReactions(mergeFirebaseRecords(olderPostReactionsRef.current, recent));
        setCommunityPageAvailability((current) => ({ ...current, postReactions: recent.length === FIREBASE_PAGE_SIZE }));
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
      authReady,
      profileReady,
      userGroupsReady,
      currentUserId: firebaseUser?.uid,
      currentGroupId: profile?.currentGroupId ?? undefined,
      authEmail: firebaseUser?.email ?? profile?.email ?? undefined,
      authError,
      communityFeedError,
      communityFeedGroupId,
      communityFeedOffline,
      communityFeedReady,
      communityContentHasMore: Object.values(communityPageAvailability).some(Boolean),
      communityContentLoadingMore,
      journalEntriesHasMore: journalEntriesHasMore || privateCheckInsHasMore,
      journalEntriesLoadingMore,
      privateCheckInsReady,
      checkInDailyClaims,
      checkInDailyClaimsReady,
      prayerNotificationsHasMore,
      prayerNotificationsLoadingMore,
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
      activityNotifications,
      notificationPreferences,
      prayerReactions,
      postReactions,
      replies,
      discussionFollows,
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
    activityNotifications,
    notificationPreferences,
    communityFeedError,
    communityFeedGroupId,
    communityFeedOffline,
    communityFeedReady,
    communityPageAvailability,
    communityContentLoadingMore,
    theme,
    authReady,
    checkIns,
    firebaseUser,
    groupMemberCounts,
    groups,
    journalEntries,
    journalEntriesHasMore,
    journalEntriesLoadingMore,
    memberships,
    posts,
    postReactions,
    prayerNotifications,
    prayerNotificationsHasMore,
    prayerNotificationsLoadingMore,
    privateCheckInsHasMore,
    privateCheckInsReady,
    checkInDailyClaims,
    checkInDailyClaimsReady,
    privateCheckIns,
    prayerReactions,
    prayerSessions,
    profile,
    profileReady,
    replies,
    discussionFollows,
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
              if (!firebaseUser || !profile?.currentGroupId) throw new CheckInSubmissionError("unavailable");
              const timestamp = now();
              const todayKey = localDayKey(timestamp);
              const pendingKey = `${firebaseUser.uid}:${profile.currentGroupId}:${todayKey}`;
              if (pendingCheckInKeys.has(pendingKey)) throw new CheckInSubmissionError("in_progress");

              if (checkInExistsForDay([...checkIns, ...privateCheckIns], firebaseUser.uid, profile.currentGroupId, todayKey)) {
                throw new CheckInSubmissionError("already_submitted");
              }
              pendingCheckInKeys.add(pendingKey);

              try {
                const verses = actionVerses(action);
                const checkIn: CheckIn = {
                  id: id("checkin"),
                  userId: firebaseUser.uid,
                  groupId: profile.currentGroupId,
                  dayKey: todayKey,
                  mood: action.mood,
                  readToday: action.readToday,
                  reflectionText: action.reflectionText.trim(),
                  visibility: action.visibility,
                  ...(verses[0] ? { verse: verses[0], verses } : {}),
                  createdAt: timestamp,
                };

                await claimCheckInDay(firebaseUser.uid, profile.currentGroupId, todayKey, {
                  dayKey: todayKey,
                  checkInId: checkIn.id,
                  visibility: action.visibility,
                  status: "pending",
                  createdAt: Date.now(),
                });

                try {
                  if (action.visibility === "group") {
                    await set(ref(database, `checkIns/${profile.currentGroupId}/${checkIn.id}`), checkIn);
                    setCheckIns((current) => current.some((item) => item.id === checkIn.id) ? current : [...current, checkIn]);
                    olderCheckInsRef.current = mergeFirebaseRecords(olderCheckInsRef.current, [checkIn]);
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
                    setPrivateCheckIns((current) => current.some((item) => item.id === checkIn.id) ? current : [...current, checkIn]);
                    olderPrivateCheckInsRef.current = mergeFirebaseRecords(olderPrivateCheckInsRef.current, [checkIn]);
                    setJournalEntries((current) => current.some((item) => item.id === entry.id) ? current : [...current, entry]);
                    olderJournalEntriesRef.current = mergeFirebaseRecords(olderJournalEntriesRef.current, [entry]);
                  }
                } catch (error) {
                  await releaseCheckInClaim(firebaseUser.uid, profile.currentGroupId, todayKey, checkIn.id).catch(() => undefined);
                  throw error;
                }
                await commitCheckInClaim(firebaseUser.uid, profile.currentGroupId, todayKey, checkIn.id).catch(() => undefined);
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
               setCheckIns((current) => current.map((item) => item.id === action.id ? {
                 ...item,
                 mood: action.mood,
                 readToday: action.readToday,
                 reflectionText: action.reflectionText.trim(),
                 visibility: action.visibility,
                 verse: actionVerses(action)[0],
                 verses: actionVerses(action).length ? actionVerses(action) : undefined,
               } : item));
               olderCheckInsRef.current = olderCheckInsRef.current.map((item) => item.id === action.id ? {
                 ...item,
                 mood: action.mood,
                 readToday: action.readToday,
                 reflectionText: action.reflectionText.trim(),
                 visibility: action.visibility,
                 verse: actionVerses(action)[0],
                 verses: actionVerses(action).length ? actionVerses(action) : undefined,
               } : item);
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
               setPosts((current) => current.map((item) => item.id === action.id ? {
                 ...item,
                 body: action.body.trim(),
                 kind: action.kind,
                 ...(postSupportsTitle(action.kind) ? { title: action.title?.trim() || undefined } : {}),
                 verse: verses[0],
                 verses: verses.length ? verses : undefined,
               } : item));
               olderPostsRef.current = olderPostsRef.current.map((item) => item.id === action.id ? {
                 ...item,
                 body: action.body.trim(),
                 kind: action.kind,
                 ...(postSupportsTitle(action.kind) ? { title: action.title?.trim() || undefined } : {}),
                 verse: verses[0],
                 verses: verses.length ? verses : undefined,
               } : item);
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
              setPosts((current) => current.map((item) => item.id === action.id ? {
                ...item,
                answeredAt: timestamp,
                answeredMarkedAt: timestamp,
                answeredUpdate: action.answeredUpdate?.trim() || undefined,
              } : item));
              olderPostsRef.current = olderPostsRef.current.map((item) => item.id === action.id ? {
                ...item,
                answeredAt: timestamp,
                answeredMarkedAt: timestamp,
                answeredUpdate: action.answeredUpdate?.trim() || undefined,
              } : item);
              return;
            }
            case "updatePrayerAnswer": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const post = posts.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!post || post.userId !== firebaseUser.uid || post.kind !== "prayer_request" || !post.answeredAt) return;
              await update(ref(database, `posts/${profile.currentGroupId}/${action.id}`), {
                answeredUpdate: action.answeredUpdate?.trim() || null,
              });
              setPosts((current) => current.map((item) => item.id === action.id ? {
                ...item,
                answeredUpdate: action.answeredUpdate?.trim() || undefined,
              } : item));
              olderPostsRef.current = olderPostsRef.current.map((item) => item.id === action.id ? {
                ...item,
                answeredUpdate: action.answeredUpdate?.trim() || undefined,
              } : item);
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
              setPosts((current) => current.map((item) => item.id === action.id ? {
                ...item,
                answeredAt: undefined,
                answeredMarkedAt: undefined,
                answeredUpdate: undefined,
              } : item));
              olderPostsRef.current = olderPostsRef.current.map((item) => item.id === action.id ? {
                ...item,
                answeredAt: undefined,
                answeredMarkedAt: undefined,
                answeredUpdate: undefined,
              } : item);
              return;
            }
            case "deleteCheckIn": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const checkIn = checkIns.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!checkIn || checkIn.userId !== firebaseUser.uid) return;
              await deleteFeedItemWithChildren(profile.currentGroupId, "check_in", action.id, firebaseUser.uid);
              setCheckIns((current) => current.filter((item) => item.id !== action.id));
              olderCheckInsRef.current = olderCheckInsRef.current.filter((item) => item.id !== action.id);
              const dayKey = checkIn.dayKey ?? localDayKey(checkIn.createdAt);
              if (dayKey) await releaseDeletedCheckInClaim(firebaseUser.uid, checkIn.groupId, dayKey, checkIn.id);
              return;
            }
            case "deletePost": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const post = posts.find((item) => item.id === action.id && item.groupId === profile.currentGroupId);
              if (!post || post.userId !== firebaseUser.uid) return;
              await deleteFeedItemWithChildren(profile.currentGroupId, "post", action.id, firebaseUser.uid);
              setPosts((current) => current.filter((item) => item.id !== action.id));
              olderPostsRef.current = olderPostsRef.current.filter((item) => item.id !== action.id);
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
                  const persistedSnapshot = await get(query(
                    ref(database, `prayerReactions/${groupId}`),
                    orderByChild("targetId"),
                    equalTo(action.targetId),
                  ));
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
              setPrayerReactions((current) => current.filter((reaction) => reaction.id !== reactionId));
              olderPrayerReactionsRef.current = olderPrayerReactionsRef.current.filter((reaction) => reaction.id !== reactionId);
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
                setPostReactions((current) => current.filter((reaction) => reaction.id !== reactionId));
                olderPostReactionsRef.current = olderPostReactionsRef.current.filter((reaction) => reaction.id !== reactionId);
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
              setPostReactions((current) => mergeFirebaseRecords(current, [reaction]));
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
              setReplies((current) => current.filter((item) => item.id !== action.id));
              setPrayerReactions((current) => current.filter((reaction) => reaction.targetType !== "reply" || reaction.targetId !== action.id));
              olderRepliesRef.current = olderRepliesRef.current.filter((item) => item.id !== action.id);
              olderPrayerReactionsRef.current = olderPrayerReactionsRef.current.filter((reaction) => reaction.targetType !== "reply" || reaction.targetId !== action.id);
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
            case "updateJournalEntry": {
              if (!firebaseUser) return;
              const updatedAt = now();
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
                updatedAt,
              });
              setJournalEntries((current) => current.map((entry) => entry.id === action.id ? {
                ...entry,
                body: action.body.trim(),
                title: action.title?.trim() || undefined,
                entryKind: action.entryKind,
                journalType: action.journalType,
                heartMood: action.heartMood,
                verse: actionVerses(action)[0],
                verses: actionVerses(action).length ? actionVerses(action) : undefined,
                sharedPostId: action.sharedPostId,
                images: undefined,
                updatedAt,
              } : entry));
              olderJournalEntriesRef.current = olderJournalEntriesRef.current.map((entry) => entry.id === action.id ? {
                ...entry,
                body: action.body.trim(),
                title: action.title?.trim() || undefined,
                entryKind: action.entryKind,
                journalType: action.journalType,
                heartMood: action.heartMood,
                verse: actionVerses(action)[0],
                verses: actionVerses(action).length ? actionVerses(action) : undefined,
                sharedPostId: action.sharedPostId,
                images: undefined,
                updatedAt,
              } : entry);
              return;
            }
            case "deleteJournalEntry": {
              if (!firebaseUser) return;
              const entry = journalEntries.find((item) => item.id === action.id && item.userId === firebaseUser.uid);
              let deletedCheckIn: CheckIn | undefined;
              const updates: Record<string, null> = {
                [`journalEntries/${firebaseUser.uid}/${action.id}`]: null,
              };

              if (entry?.source === "private_check_in") {
                const checkInId = privateCheckIns.find(
                  (checkIn) => checkIn.userId === firebaseUser.uid && checkIn.createdAt === entry.createdAt,
                )?.id;

                if (checkInId) {
                  deletedCheckIn = privateCheckIns.find((item) => item.id === checkInId);
                  updates[`privateCheckIns/${firebaseUser.uid}/${checkInId}`] = null;
                }
              }

              await update(ref(database), updates);
              setJournalEntries((current) => current.filter((item) => item.id !== action.id));
              olderJournalEntriesRef.current = olderJournalEntriesRef.current.filter((item) => item.id !== action.id);
              if (entry?.source === "private_check_in") {
                setPrivateCheckIns((current) => current.filter((checkIn) => checkIn.createdAt !== entry.createdAt));
                olderPrivateCheckInsRef.current = olderPrivateCheckInsRef.current.filter((checkIn) => checkIn.createdAt !== entry.createdAt);
              }
              if (deletedCheckIn) {
                const dayKey = deletedCheckIn.dayKey ?? localDayKey(deletedCheckIn.createdAt);
                if (dayKey) {
                  await releaseDeletedCheckInClaim(firebaseUser.uid, deletedCheckIn.groupId, dayKey, deletedCheckIn.id);
                }
              }
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
            case "loadOlderCommunityContent": {
              if (!firebaseUser || !profile?.currentGroupId || communityContentLoadingMore) return;
              if (!Object.values(communityPageAvailability).some(Boolean)) return;
              setCommunityContentLoadingMore(true);
              try {
                const groupId = profile.currentGroupId;
                const [checkInPage, postPage, replyPage, prayerReactionPage, postReactionPage] = await Promise.all([
                  communityPageAvailability.checkIns
                    ? fetchOlderFirebasePage<CheckIn>(ref(database, `checkIns/${groupId}`), checkIns)
                    : Promise.resolve({ hasMore: false, records: [] as CheckIn[] }),
                  communityPageAvailability.posts
                    ? fetchOlderFirebasePage<Post>(ref(database, `posts/${groupId}`), posts)
                    : Promise.resolve({ hasMore: false, records: [] as Post[] }),
                  communityPageAvailability.replies
                    ? fetchOlderFirebasePage<Reply>(ref(database, `replies/${groupId}`), replies)
                    : Promise.resolve({ hasMore: false, records: [] as Reply[] }),
                  communityPageAvailability.prayerReactions
                    ? fetchOlderFirebasePage<PrayerReaction>(ref(database, `prayerReactions/${groupId}`), prayerReactions)
                    : Promise.resolve({ hasMore: false, records: [] as PrayerReaction[] }),
                  communityPageAvailability.postReactions
                    ? fetchOlderFirebasePage<PostReaction>(ref(database, `postReactions/${groupId}`), postReactions)
                    : Promise.resolve({ hasMore: false, records: [] as PostReaction[] }),
                ]);

                olderCheckInsRef.current = mergeFirebaseRecords(olderCheckInsRef.current, checkInPage.records);
                olderPostsRef.current = mergeFirebaseRecords(olderPostsRef.current, postPage.records);
                olderRepliesRef.current = mergeFirebaseRecords(olderRepliesRef.current, replyPage.records);
                olderPrayerReactionsRef.current = mergeFirebaseRecords(olderPrayerReactionsRef.current, prayerReactionPage.records);
                olderPostReactionsRef.current = mergeFirebaseRecords(olderPostReactionsRef.current, postReactionPage.records);
                setCheckIns((current) => mergeFirebaseRecords(current, checkInPage.records));
                setPosts((current) => mergeFirebaseRecords(current, postPage.records));
                setReplies((current) => mergeFirebaseRecords(current, replyPage.records));
                setPrayerReactions((current) => mergeFirebaseRecords(current, prayerReactionPage.records));
                setPostReactions((current) => mergeFirebaseRecords(current, postReactionPage.records));
                setCommunityPageAvailability({
                  checkIns: checkInPage.hasMore,
                  posts: postPage.hasMore,
                  replies: replyPage.hasMore,
                  prayerReactions: prayerReactionPage.hasMore,
                  postReactions: postReactionPage.hasMore,
                });
              } finally {
                setCommunityContentLoadingMore(false);
              }
              return;
            }
            case "loadOlderJournalEntries": {
              if (!firebaseUser || journalEntriesLoadingMore || (!journalEntriesHasMore && !privateCheckInsHasMore)) return;
              setJournalEntriesLoadingMore(true);
              try {
                const [journalPage, checkInPage] = await Promise.all([
                  journalEntriesHasMore
                    ? fetchOlderFirebasePage<JournalEntry>(ref(database, `journalEntries/${firebaseUser.uid}`), journalEntries)
                    : Promise.resolve({ hasMore: false, records: [] as JournalEntry[] }),
                  privateCheckInsHasMore
                    ? fetchOlderFirebasePage<CheckIn>(ref(database, `privateCheckIns/${firebaseUser.uid}`), privateCheckIns)
                    : Promise.resolve({ hasMore: false, records: [] as CheckIn[] }),
                ]);
                olderJournalEntriesRef.current = mergeFirebaseRecords(olderJournalEntriesRef.current, journalPage.records);
                olderPrivateCheckInsRef.current = mergeFirebaseRecords(olderPrivateCheckInsRef.current, checkInPage.records);
                setJournalEntries((current) => mergeFirebaseRecords(current, journalPage.records));
                setPrivateCheckIns((current) => mergeFirebaseRecords(current, checkInPage.records));
                setJournalEntriesHasMore(journalPage.hasMore);
                setPrivateCheckInsHasMore(checkInPage.hasMore);
              } finally {
                setJournalEntriesLoadingMore(false);
              }
              return;
            }
            case "loadOlderPrayerNotifications": {
              if (!firebaseUser || prayerNotificationsLoadingMore || !prayerNotificationsHasMore) return;
              setPrayerNotificationsLoadingMore(true);
              try {
                const page = await fetchOlderFirebasePage<PrayerNotification>(
                  ref(database, `prayerNotifications/${firebaseUser.uid}`),
                  prayerNotifications,
                );
                olderPrayerNotificationsRef.current = mergeFirebaseRecords(olderPrayerNotificationsRef.current, page.records);
                setPrayerNotifications((current) => mergeFirebaseRecords(current, page.records));
                setPrayerNotificationsHasMore(page.hasMore);
              } finally {
                setPrayerNotificationsLoadingMore(false);
              }
              return;
            }
            case "markActivityNotificationRead": {
              if (!firebaseUser) return;
              const notification = activityNotifications.find((item) => item.id === action.id);
              if (!notification || notification.readAt) return;
              await update(ref(database, `activityNotifications/${firebaseUser.uid}/${action.id}`), { readAt: now() });
              return;
            }
            case "markActivityDiscussionRead": {
              if (!firebaseUser) return;
              const readAt = now();
              const matching = activityNotifications.filter(
                (item) =>
                  !item.readAt &&
                  item.groupId === action.groupId &&
                  item.targetType === action.targetType &&
                  item.targetId === action.targetId &&
                  item.priority === "normal",
              );
              if (matching.length === 0) return;
              await update(
                ref(database),
                Object.fromEntries(matching.map((item) => [`activityNotifications/${firebaseUser.uid}/${item.id}/readAt`, readAt])),
              );
              return;
            }
            case "markAllActivityNotificationsRead": {
              if (!firebaseUser) return;
              const unread = activityNotifications.filter((item) => !item.readAt);
              if (unread.length === 0) return;
              const readAt = now();
              await update(
                ref(database),
                Object.fromEntries(unread.map((item) => [`activityNotifications/${firebaseUser.uid}/${item.id}/readAt`, readAt])),
              );
              return;
            }
            case "registerPushToken": {
              if (!firebaseUser || !action.token.trim()) return;
              const tokenKey = action.token.replace(/[.#$\[\]\/]/g, "_");
              await set(ref(database, `pushTokens/${firebaseUser.uid}/${tokenKey}`), {
                token: action.token,
                platform: action.platform,
                updatedAt: now(),
              });
              return;
            }
            case "setDiscussionFollow": {
              if (!firebaseUser || !profile?.currentGroupId) return;
              const followId = `${action.targetType}_${action.targetId}`;
              const existing = discussionFollows.find((item) => item.id === followId);
              if (action.following === Boolean(existing)) return;
              const follow: DiscussionFollow | null = action.following
                ? {
                    id: followId,
                    userId: firebaseUser.uid,
                    targetType: action.targetType,
                    targetId: action.targetId,
                    createdAt: now(),
                  }
                : null;
              await update(ref(database), {
                [`discussionFollowers/${profile.currentGroupId}/${action.targetType}/${action.targetId}/${firebaseUser.uid}`]: follow,
                [`userDiscussionFollows/${firebaseUser.uid}/${profile.currentGroupId}/${followId}`]: follow,
              });
              return;
            }
            case "setNotificationPreference": {
              if (!firebaseUser) return;
              await update(ref(database, `notificationPreferences/${firebaseUser.uid}`), { [action.key]: action.value });
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
          action.type === "submitCheckIn" ||
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
      communityContentLoadingMore,
      communityPageAvailability,
      discussionFollows,
      firebaseUser,
      groupBiblePlanAnnouncements,
      groupBiblePlanParticipantIds,
      groupBiblePlanParticipations,
      groups,
      journalEntries,
      journalEntriesHasMore,
      journalEntriesLoadingMore,
      memberships,
      posts,
      postReactions,
      prayerReactions,
      prayerNotifications,
      prayerNotificationsHasMore,
      prayerNotificationsLoadingMore,
      activityNotifications,
      privateCheckIns,
      privateCheckInsHasMore,
      profile?.currentGroupId,
      profile?.name,
      replies,
      userMemberships,
    ],
  );

  const getAuthToken = useCallback(() => firebaseUser?.getIdToken() ?? Promise.resolve(null), [firebaseUser]);
  const snapshotStore = useMemo(() => createSnapshotStore(state), []);
  useLayoutEffect(() => snapshotStore.publish(state), [snapshotStore, state]);
  const dispatchRef = useRef(dispatch);
  const authTokenRef = useRef(getAuthToken);
  dispatchRef.current = dispatch;
  authTokenRef.current = getAuthToken;
  const actions = useMemo(() => ({
    dispatch: (action: Action) => dispatchRef.current(action),
    getAuthToken: () => authTokenRef.current(),
  }), []);
  const contextValue = useMemo(() => ({ state, ...actions }), [state, actions]);

  return <KoinoSnapshotContext.Provider value={snapshotStore}>
    <KoinoActionsContext.Provider value={actions}>
      <KoinoContext.Provider value={contextValue}>{children}</KoinoContext.Provider>
    </KoinoActionsContext.Provider>
  </KoinoSnapshotContext.Provider>;
}

export function useKoino() {
  const context = useContext(KoinoContext);
  if (!context) {
    throw new Error("useKoino must be used inside KoinoProvider");
  }
  return context;
}
