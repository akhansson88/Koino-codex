import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { AccessibilityInfo, ActivityIndicator, Animated, BackHandler, PanResponder, Platform, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import { CheckInModal, type CheckInStep, moodNumber } from "@/features/check-in-modal";
import { activePrivateCheckIns } from "@/state/check-ins";
import {
  EntryVisibility,
  feedItemKind,
  normalizeEntryKind,
  prayerFilters,
  roomTabs,
  visibility,
} from "@/state/product";
import { useKoino } from "@/state/koino-store";
import { prayerReactionsForTarget } from "@/state/prayer-reactions";
import {
  selectCommunityContent,
  selectCommunityPostById,
  selectPrayerRequests,
} from "@/state/selectors/community-content";
import type { BibleVerse, EntryKind, FeedItem, Group, GroupImage, HeartMood, Id, PostReactionKind, Reply } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  BottomSheet,
  Card,
  ExpandableBodyText,
  HeartPromptCard,
  FullScreenModal,
  IconButton,
  PrimaryButton,
  RoomImage,
  Row,
  SecondaryButton,
  SectionHeading,
  StatusPill,
  TextInputField,
  VerseList,
} from "@/ui/app-components";
import { normalizeBibleVerses, primaryBibleVerse } from "@/features/bible-verse-utils";
import { BrandWaveMotif } from "@/ui/brand-wave-motif";
import { useAppTranslation } from "@/ui/app-language";
import {
  communityActionLabel,
  communityDefaultFeedTitle,
  communityMemberCount,
  communityMoodScaleLabel,
  communityPrayerMomentDisplayCopy,
  communityPrayerFilterLabel,
  communityPrayerNoun,
  communityResponseNoun,
  communityRoomTabLabel,
  communitySystemError,
} from "@/ui/community-copy";
import { confirmAction } from "@/ui/confirm";
import { DirectPrayerResultSheet, type DirectPrayerResult } from "@/ui/direct-prayer-result-sheet";
import { LinkPreviewContent } from "@/ui/link-preview";
import type { TranslationFunction } from "@/ui/localization";
import { PrayerActivity, type PrayerActivityEntry } from "@/ui/prayer-activity";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { SharedComposer } from "@/ui/shared-composer";
import {
  CommunityCardAction,
  CommunityCardResponseSummary,
  CommunityCheckInMood,
  CommunityFeedCard,
  PostCard,
} from "@/ui/post-card";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors, platformShadow, radius, typography } from "@/ui/theme";
import { WrittenEncouragementComposer } from "@/ui/written-encouragement-composer";

type RoomView = "rooms" | "detail" | "prayer" | "prayerMomentDetail" | "checkins" | "members";
type RoomDetailTab = (typeof roomTabs)[number]["value"];
type PrayerFilter = (typeof prayerFilters)[number]["value"];
type TransitionDirection = "forward" | "back";
type ComposerContext = "journal" | "room";
const COMMUNITY_CHECK_INS_HISTORY_KEY = "__koinoCommunityCheckIns";
type CommunityMember = { id: Id; image?: GroupImage; name: string; role: "owner" | "member" };
type CommunityPrayerAssignment = { groupId: Id; memberId: Id; weekEndsAt: string; weekStartsAt: string };
type CommunityFeedRevealState = Record<Id, Partial<Record<RoomDetailTab, number>>>;

const COMMUNITY_RECENT_DAYS = 30;
const COMMUNITY_RECENT_ITEM_LIMIT = 20;
const COMMUNITY_EARLIER_PAGE_SIZE = 20;
const FIREBASE_COMMUNITY_REVEAL_RESERVE = 50;
const COMMUNITY_FEED_TIMER_MAX_DELAY = 2_147_000_000;

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isPrayerFeedKind(kind: EntryKind | "post" | undefined) {
  const normalized = normalizeEntryKind(kind);
  return normalized === "prayer_request" || normalized === "prayer_moment";
}

function isPrayerMomentKind(kind: EntryKind | "post" | undefined) {
  return normalizeEntryKind(kind) === "prayer_moment";
}

function roomMemberCount(counts: Record<Id, number>, roomId?: Id, fallback = 1) {
  if (!roomId) return fallback;
  return counts[roomId] || fallback;
}

async function shareRoomInvite(room: Group, t: TranslationFunction) {
  const invitation = t("community.rooms.invitation", { code: room.inviteCode, name: room.name });
  const clipboard =
    Platform.OS === "web"
      ? (globalThis as typeof globalThis & { navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } } }).navigator?.clipboard
      : undefined;

  if (clipboard?.writeText) {
    await clipboard.writeText(invitation);
    return t("community.rooms.inviteCopied");
  }

  await Share.share({ message: invitation, title: t("community.rooms.joinNamed", { name: room.name }) });
  return t("community.rooms.inviteReady");
}

function communityFeedItemKey(item: FeedItem) {
  return `${item.type}:${item.id}`;
}

function filterCommunityFeedItems(items: FeedItem[], detailTab: RoomDetailTab) {
  if (detailTab === "prayer") {
    return items.filter((item) => item.type === "post" && isPrayerFeedKind(item.kind));
  }
  if (detailTab === "checkins") {
    return items.filter((item) => item.type === "check_in");
  }
  if (detailTab === "reflections") {
    return items.filter((item) => item.type === "post" && normalizeEntryKind(item.kind) === "reflection");
  }
  return items;
}

function partitionCommunityFeed(items: FeedItem[], now = Date.now()) {
  const cutoff = now - COMMUNITY_RECENT_DAYS * 24 * 60 * 60 * 1000;
  const recent: FeedItem[] = [];
  const earlier: FeedItem[] = [];

  for (const item of items) {
    const createdAt = Date.parse(item.createdAt);
    if (Number.isFinite(createdAt) && createdAt >= cutoff && recent.length < COMMUNITY_RECENT_ITEM_LIMIT) {
      recent.push(item);
    } else {
      earlier.push(item);
    }
  }

  return { earlier, recent };
}

export function SettingsScreen() {
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
  const navigation = useNavigation();
  const [roomView, setRoomView] = useState<RoomView>("detail");
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>("forward");
  const roomViewRef = useRef<RoomView>("detail");
  const checkInsHistoryBackPendingRef = useRef(false);
  const preserveRoomViewOnNextFocusRef = useRef(false);
  const [detailTab, setDetailTab] = useState<RoomDetailTab>("recent");
  const [prayerFilter, setPrayerFilter] = useState<PrayerFilter>("open");
  const [joinSheetVisible, setJoinSheetVisible] = useState(false);
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerContext, setComposerContext] = useState<ComposerContext>("room");
  const [composerKind, setComposerKind] = useState<EntryKind>("reflection");
  const [composerVisibility, setComposerVisibility] = useState<EntryVisibility>(visibility.room);
  const [composerTitle, setComposerTitle] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerVerses, setComposerVerses] = useState<BibleVerse[]>([]);
  const [editingPost, setEditingPost] = useState<Extract<FeedItem, { type: "post" }>>();
  const [selectedPrayerMomentId, setSelectedPrayerMomentId] = useState<Id>();
  const [prayerMomentDetailReturnView, setPrayerMomentDetailReturnView] = useState<"detail" | "prayer">("prayer");
  const [prayerMomentEncouragementDraft, setPrayerMomentEncouragementDraft] = useState("");
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const [directPrayerResult, setDirectPrayerResult] = useState<DirectPrayerResult>();
  const [memberSelectVisible, setMemberSelectVisible] = useState(false);
  const directPrayerPersistencePendingRef = useRef(false);
  const [feedEncouragementTarget, setFeedEncouragementTarget] = useState<FeedItem>();
  const [feedEncouragementDraft, setFeedEncouragementDraft] = useState("");
  const [feedEncouragementReduceMotion, setFeedEncouragementReduceMotion] = useState<boolean | undefined>(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return undefined;
  });
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [checkInStep, setCheckInStep] = useState<CheckInStep>("choose");
  const [heartMood, setHeartMood] = useState<HeartMood>();
  const [checkInText, setCheckInText] = useState("");
  const [checkInVerses, setCheckInVerses] = useState<BibleVerse[]>([]);
  const [shareCheckIn, setShareCheckIn] = useState(true);
  const [submittedCheckInKey, setSubmittedCheckInKey] = useState<string>();
  const [communityFeedRevealState, setCommunityFeedRevealState] = useState<CommunityFeedRevealState>({});
  const [communityFeedClock, setCommunityFeedClock] = useState(Date.now);
  const communityScrollRef = useRef<ScrollView | null>(null);
  const communityScrollOffsetsRef = useRef<Record<string, number>>({});
  const pendingCommunityScrollRestoreRef = useRef<{ key: string; offset: number } | undefined>(undefined);
  const communityFeedGroupIdRef = useRef(state.currentGroupId);

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const otherRooms = useMemo(() => state.groups.filter((item) => item.id !== state.currentGroupId), [state.currentGroupId, state.groups]);
  const memberCount = roomMemberCount(state.groupMemberCounts, group?.id, state.memberships.length || 1);
  const currentUser = state.users.find((item) => item.id === state.currentUserId);
  const todayKey = localDayKey(new Date());
  const currentCheckInKey = `${state.currentUserId}:${state.currentGroupId}:${todayKey}`;
  const todaysCheckIn = [...state.checkIns, ...activePrivateCheckIns(state.privateCheckIns, state.journalEntries)].some(
    (item) => item.userId === state.currentUserId && item.groupId === state.currentGroupId && localDayKey(item.createdAt) === todayKey,
  ) || submittedCheckInKey === currentCheckInKey;
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const userImageById = useMemo(() => new Map(state.users.map((user) => [user.id, user.image])), [state.users]);
  const communityMembers = useMemo(
    () =>
      state.memberships.map((membership) => {
        const user = state.users.find((candidate) => candidate.id === membership.userId);
        return {
          id: membership.userId,
          image: user?.image,
          name: user?.name ?? membership.userName,
          role: membership.role,
        };
      }),
    [state.memberships, state.users],
  );
  const otherCommunityMembers = useMemo(() => communityMembers.filter((member) => member.id !== state.currentUserId), [communityMembers, state.currentUserId]);
  const feedItems = useMemo(() => {
    return selectCommunityContent({
      checkIns: state.checkIns,
      groupId: state.currentGroupId,
      posts: state.posts,
    });
  }, [state.checkIns, state.currentGroupId, state.posts]);
  const visibleFeedItems = useMemo(() => filterCommunityFeedItems(feedItems, detailTab), [detailTab, feedItems]);
  const { earlier: earlierFeedItems, recent: recentFeedItems } = partitionCommunityFeed(
    visibleFeedItems,
    Math.max(communityFeedClock, Date.now()),
  );
  const revealedEarlierCount = group ? Math.min(communityFeedRevealState[group.id]?.[detailTab] ?? 0, earlierFeedItems.length) : 0;
  const visibleEarlierFeedItems = earlierFeedItems.slice(0, revealedEarlierCount);
  const hasMoreEarlierFeedItems = revealedEarlierCount < earlierFeedItems.length;
  const communityFeedStatusMatchesGroup = Boolean(group && state.communityFeedGroupId === group.id);
  const communityFeedReadyForGroup = Boolean(group && communityFeedStatusMatchesGroup && state.communityFeedReady);
  const communityFeedError = communityFeedStatusMatchesGroup ? state.communityFeedError : undefined;
  const communityFeedOffline = Boolean(communityFeedStatusMatchesGroup && state.communityFeedOffline);
  const communityFeedLoading = Boolean(group && !communityFeedReadyForGroup && !communityFeedError);
  const communityScrollKey = group ? `${group.id}:${detailTab}` : undefined;
  const prayerPosts = selectPrayerRequests(feedItems);
  const visiblePrayerPosts = prayerPosts.filter((item) => {
    if (prayerFilter === "open") return !item.answeredAt;
    if (prayerFilter === "answered") return Boolean(item.answeredAt);
    return true;
  });
  const selectedPrayerMomentItem = selectCommunityPostById(state.posts, state.currentGroupId, selectedPrayerMomentId);
  const selectedPrayerMoment =
    selectedPrayerMomentItem && isPrayerMomentKind(selectedPrayerMomentItem.kind) ? selectedPrayerMomentItem : undefined;
  const sharedCheckIns = feedItems.filter((item): item is Extract<FeedItem, { type: "check_in" }> => item.type === "check_in");
  const latestCheckInByUser = useMemo(() => {
    const latest = new Map<Id, Extract<FeedItem, { type: "check_in" }>>();
    for (const checkIn of sharedCheckIns) {
      if (!latest.has(checkIn.userId)) latest.set(checkIn.userId, checkIn);
    }
    return latest;
  }, [sharedCheckIns]);
  const canJoin = joinInviteCode.trim().length >= 3;
  const canCreate = newGroupName.trim().length > 0;

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: roomView !== "prayer" && roomView !== "checkins" });
  }, [navigation, roomView]);

  useEffect(() => {
    if (communityFeedGroupIdRef.current === state.currentGroupId) return;
    communityFeedGroupIdRef.current = state.currentGroupId;
    setDetailTab("recent");
    pendingCommunityScrollRestoreRef.current = undefined;
  }, [state.currentGroupId]);

  useFocusEffect(
    useCallback(() => {
      setCommunityFeedClock(Date.now());
    }, []),
  );

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setFeedEncouragementReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setFeedEncouragementReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const currentTime = Date.now();
    const recentWindowMs = COMMUNITY_RECENT_DAYS * 24 * 60 * 60 * 1000;
    const nextExpiration = visibleFeedItems
      .map((item) => Date.parse(item.createdAt))
      .filter((createdAt) => Number.isFinite(createdAt))
      .map((createdAt) => createdAt + recentWindowMs)
      .filter((expiresAt) => expiresAt > currentTime)
      .sort((left, right) => left - right)[0];
    if (!nextExpiration) return;

    const expirationTimer = setTimeout(
      () => setCommunityFeedClock(Date.now()),
      Math.min(nextExpiration - currentTime + 25, COMMUNITY_FEED_TIMER_MAX_DELAY),
    );
    return () => clearTimeout(expirationTimer);
  }, [communityFeedClock, visibleFeedItems]);

  useFocusEffect(
    useCallback(() => {
      if (preserveRoomViewOnNextFocusRef.current) {
        preserveRoomViewOnNextFocusRef.current = false;
        return;
      }
      if (roomViewRef.current !== "detail") {
        setTransitionDirection("back");
      }
      setRoomView("detail");
      setMemberSelectVisible(false);
      setDirectPrayerResult(undefined);
    }, []),
  );

  useEffect(() => {
    roomViewRef.current = roomView;
  }, [roomView]);

  useFocusEffect(
    useCallback(() => {
      if (roomView !== "detail" || !communityScrollKey || !communityFeedReadyForGroup || communityFeedError) return;

      pendingCommunityScrollRestoreRef.current = {
        key: communityScrollKey,
        offset: communityScrollOffsetsRef.current[communityScrollKey] ?? 0,
      };
      const restoreTimer = setTimeout(() => restorePendingCommunityScroll(), 50);
      return () => clearTimeout(restoreTimer);
    }, [communityFeedError, communityFeedReadyForGroup, communityScrollKey, roomView]),
  );

  const navigateToRoomView = useCallback((nextView: RoomView, direction: TransitionDirection = "forward") => {
    setTransitionDirection(direction);
    setRoomView(nextView);
  }, []);

  const openCheckInsView = useCallback(() => {
    if (Platform.OS === "web" && window.history.state?.[COMMUNITY_CHECK_INS_HISTORY_KEY] !== true) {
      const currentHistoryState = window.history.state;
      window.history.pushState(
        currentHistoryState && typeof currentHistoryState === "object"
          ? { ...currentHistoryState, [COMMUNITY_CHECK_INS_HISTORY_KEY]: true }
          : { [COMMUNITY_CHECK_INS_HISTORY_KEY]: true },
        "",
        window.location.href,
      );
    }
    navigateToRoomView("checkins");
  }, [navigateToRoomView]);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;

    const handlePopState = (event: PopStateEvent) => {
      const returnsToCheckIns = event.state?.[COMMUNITY_CHECK_INS_HISTORY_KEY] === true;
      const wasReturningToCommunity = checkInsHistoryBackPendingRef.current || roomViewRef.current === "checkins";
      checkInsHistoryBackPendingRef.current = false;

      if (returnsToCheckIns) {
        setTransitionDirection("forward");
        setRoomView("checkins");
      } else if (wasReturningToCommunity) {
        setTransitionDirection("back");
        setRoomView("detail");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const goBackFromRoomView = useCallback(() => {
    if (roomView === "prayerMomentDetail") {
      navigateToRoomView(prayerMomentDetailReturnView, "back");
      return true;
    }
    if (roomView === "checkins") {
      if (Platform.OS === "web" && window.history.state?.[COMMUNITY_CHECK_INS_HISTORY_KEY] === true) {
        if (!checkInsHistoryBackPendingRef.current) {
          checkInsHistoryBackPendingRef.current = true;
          window.history.back();
        }
        return true;
      }
      navigateToRoomView("detail", "back");
      return true;
    }
    if (roomView === "prayer" || roomView === "members" || roomView === "rooms") {
      navigateToRoomView("detail", "back");
      return true;
    }
    return false;
  }, [navigateToRoomView, prayerMomentDetailReturnView, roomView]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => goBackFromRoomView());
    return () => subscription.remove();
  }, [goBackFromRoomView]);

  function openComposer(kind: EntryKind = "reflection") {
    setEditingPost(undefined);
    setComposerContext("room");
    setComposerKind(kind);
    setComposerVisibility(visibility.room);
    setComposerTitle("");
    setComposerBody("");
    setComposerVerses([]);
    setComposerVisible(true);
  }

  function openScriptureReflection(item: Extract<FeedItem, { type: "post" }>) {
    const attachedVerses = normalizeBibleVerses(item.verse, item.verses);
    setEditingPost(undefined);
    setComposerContext("journal");
    setComposerKind("reflection");
    setComposerVisibility(visibility.private);
    setComposerTitle(attachedVerses[0]?.reference ?? "");
    setComposerBody("");
    setComposerVerses(attachedVerses);
    setComposerVisible(true);
  }

  function editPost(item: Extract<FeedItem, { type: "post" }>) {
    setComposerContext("room");
    setEditingPost(item);
    setComposerKind(normalizeEntryKind(item.kind));
    setComposerVisibility(visibility.room);
    setComposerTitle(item.title ?? "");
    setComposerBody(item.body);
    setComposerVerses(normalizeBibleVerses(item.verse, item.verses));
    setComposerVisible(true);
  }

  function closeComposer() {
    setComposerVisible(false);
    setEditingPost(undefined);
  }

  async function submitComposer() {
    const canSubmit = composerContext === "room" && composerKind === "scripture" ? composerVerses.length > 0 : Boolean(composerBody.trim());
    if (!canSubmit) return;
    if (composerContext === "room" && !editingPost && composerKind === "update") return;
    const titleFreeKind = composerKind === "reflection" || composerKind === "praise" || composerKind === "scripture";
    const title = titleFreeKind ? {} : { title: composerTitle };
    if (editingPost) {
      await dispatch({ type: "editPost", id: editingPost.id, kind: composerKind, ...title, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses });
    } else if (composerContext === "journal") {
      await dispatch({
        type: "createJournalEntry",
        entryKind: composerKind,
        title: composerTitle,
        body: composerBody,
        verse: primaryBibleVerse(composerVerses),
        verses: composerVerses,
        shareWithGroup: composerVisibility === visibility.room,
      });
    } else if (composerVisibility === visibility.private) {
      await dispatch({ type: "createJournalEntry", entryKind: composerKind, ...title, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses, shareWithGroup: false });
    } else {
      await dispatch({ type: "createPost", kind: composerKind, ...title, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses });
    }
    setComposerVisible(false);
    setComposerBody("");
    setComposerTitle("");
    setComposerVerses([]);
    setEditingPost(undefined);
  }

  function restorePendingCommunityScroll() {
    const pendingRestore = pendingCommunityScrollRestoreRef.current;
    if (!pendingRestore || pendingRestore.key !== communityScrollKey) return;

    communityScrollRef.current?.scrollTo({ animated: false, y: Math.max(0, pendingRestore.offset) });
  }

  function handleCommunityScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!communityScrollKey) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const offset = contentOffset.y;
    const pendingRestore = pendingCommunityScrollRestoreRef.current;
    if (pendingRestore?.key === communityScrollKey) {
      const maximumOffset = Math.max(0, contentSize.height - layoutMeasurement.height);
      const safeRestoreOffset = Math.min(Math.max(0, pendingRestore.offset), maximumOffset);
      if (Math.abs(offset - safeRestoreOffset) <= 2 || offset >= safeRestoreOffset - 2) {
        pendingCommunityScrollRestoreRef.current = undefined;
        communityScrollOffsetsRef.current[communityScrollKey] = Math.max(0, offset);
      }
      return;
    }

    communityScrollOffsetsRef.current[communityScrollKey] = Math.max(0, offset);
  }

  function handleCommunityScrollBeginDrag() {
    const pendingRestore = pendingCommunityScrollRestoreRef.current;
    if (pendingRestore?.key === communityScrollKey) {
      pendingCommunityScrollRestoreRef.current = undefined;
    }
  }

  async function revealEarlierActivity() {
    if (!group) return;

    if (revealedEarlierCount >= earlierFeedItems.length && state.communityContentHasMore) {
      setCommunityFeedRevealState((current) => ({
        ...current,
        [group.id]: {
          ...current[group.id],
          [detailTab]: (current[group.id]?.[detailTab] ?? 0) + FIREBASE_COMMUNITY_REVEAL_RESERVE,
        },
      }));
      await dispatch({ type: "loadOlderCommunityContent" });
      return;
    }

    if (earlierFeedItems.length === 0) return;

    const nextCount = Math.min(revealedEarlierCount + COMMUNITY_EARLIER_PAGE_SIZE, earlierFeedItems.length);
    const newlyRevealedCount = nextCount - revealedEarlierCount;
    if (newlyRevealedCount <= 0) return;

    setCommunityFeedRevealState((current) => {
      return {
        ...current,
        [group.id]: {
          ...current[group.id],
          [detailTab]: Math.max(current[group.id]?.[detailTab] ?? 0, nextCount),
        },
      };
    });
    AccessibilityInfo.announceForAccessibility(
      t(
        newlyRevealedCount === 1
          ? "community.feed.earlierRevealed.one"
          : "community.feed.earlierRevealed.other",
        { count: newlyRevealedCount },
      ),
    );
  }

  function handleCommunityTabChange(tab: RoomDetailTab) {
    if (tab === detailTab) return;
    if (group) {
      const targetKey = `${group.id}:${tab}`;
      pendingCommunityScrollRestoreRef.current = {
        key: targetKey,
        offset: communityScrollOffsetsRef.current[targetKey] ?? 0,
      };
    }
    setDetailTab(tab);
  }

  function openPrayerDetail(item: Extract<FeedItem, { type: "post" }>, returnView: "detail" | "prayer" = "prayer") {
    if (isPrayerMomentKind(item.kind)) {
      setSelectedPrayerMomentId(item.id);
      setPrayerMomentDetailReturnView(returnView);
      setPrayerMomentEncouragementDraft("");
      navigateToRoomView("prayerMomentDetail");
      return;
    }
    preserveRoomViewOnNextFocusRef.current = true;
    router.push({
      pathname: "/community/[groupId]/prayers/[prayerRequestId]",
      params: { groupId: item.groupId, prayerRequestId: item.id },
    } as never);
  }

  function itemPrayerState(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    const reactions = prayerReactionsForTarget(state.prayerReactions, targetType, item.id);
    return {
      prayed: reactions.some((reaction) => reaction.userId === state.currentUserId),
      count: reactions.length,
      targetType,
      prayedBy: reactions.map((reaction) => ({
        name: userById.get(reaction.userId) ?? t("common.someone"),
        image: userImageById.get(reaction.userId),
      })),
    };
  }

  function itemReactionState(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    const itemReactionKind = feedItemKind(item);
    const kind = (itemReactionKind === "prayer_request" || itemReactionKind === "prayer_moment" ? "reflection" : itemReactionKind) as PostReactionKind;
    const reactions = state.postReactions.filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id && reaction.kind === kind);
    const reactedByUserIds = [...new Set(reactions.map((reaction) => reaction.userId))];
    return {
      reacted: reactions.some((reaction) => reaction.userId === state.currentUserId),
      count: reactions.length,
      kind,
      targetType,
      reactedBy: reactedByUserIds.map((userId) => ({ name: userById.get(userId) ?? t("common.someone"), image: userImageById.get(userId) })),
    };
  }

  function itemReplies(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    return state.replies.filter((reply) => reply.targetType === targetType && reply.targetId === item.id);
  }

  function prayForItem(item: FeedItem) {
    const prayer = itemPrayerState(item);
    const displayBody = item.type === "post" ? communityPrayerMomentDisplayCopy(item, t).body : item.body;
    setPrayerTarget({
      targetType: prayer.targetType,
      targetId: item.id,
      body: displayBody,
      recipientUserId: item.userId,
      recipientName: userById.get(item.userId),
      recipientImage: userImageById.get(item.userId),
    });
  }

  function startCommunityPrayer(member: Pick<CommunityMember, "id" | "image" | "name">) {
    if (!member.id.trim()) return;

    setDirectPrayerResult(undefined);
    setPrayerTarget({
      targetType: "user",
      targetId: member.id,
      body: "",
      recipientUserId: member.id,
      recipientName: member.name,
      recipientImage: member.image,
    });
  }

  function closePrayerMoment() {
    setPrayerTarget(undefined);
  }

  async function finishPrayerMoment(status: "completed" | "skipped", startedAt: string) {
    const target = prayerTarget;
    setPrayerTarget(undefined);
    if (!target) return;

    const directPrayer = target.targetType === "user";
    const recipientName =
      target.recipientName?.trim() ||
      (target.recipientUserId ? userById.get(target.recipientUserId) : undefined) ||
      t("common.someone");
    const resultPerson = { recipientImage: target.recipientImage, recipientName };

    if (directPrayer) {
      if (directPrayerPersistencePendingRef.current) return;
      const recipientIsAvailable =
        Boolean(target.recipientUserId) &&
        (target.recipientUserId === state.currentUserId || state.users.some((member) => member.id === target.recipientUserId));
      if (
        !state.currentUserId ||
        !target.targetId.trim() ||
        !target.recipientUserId?.trim() ||
        target.targetId !== target.recipientUserId ||
        !recipientIsAvailable
      ) {
        setDirectPrayerResult({ ...resultPerson, status: "failed" });
        return;
      }
      directPrayerPersistencePendingRef.current = true;
      if (status === "completed") {
        setDirectPrayerResult({ ...resultPerson, status: "saving" });
      }
    }

    try {
      await dispatch({
        type: "finishPrayer",
        targetType: target.targetType,
        targetId: target.targetId,
        status,
        startedAt,
        recipientUserId: target.recipientUserId,
        throwOnError: directPrayer,
      });
      if (directPrayer) {
        setDirectPrayerResult(status === "completed" ? { ...resultPerson, status: "completed" } : undefined);
      }
    } catch {
      if (directPrayer) {
        setDirectPrayerResult({ ...resultPerson, status: "failed" });
      }
    } finally {
      if (directPrayer) {
        directPrayerPersistencePendingRef.current = false;
      }
    }
  }

  function togglePostAction(item: FeedItem) {
    if (item.type === "post" && normalizeEntryKind(item.kind) === "scripture") {
      openScriptureReflection(item);
      return;
    }
    const reaction = itemReactionState(item);
    const supportsOptionalMessage =
      item.type === "check_in" ||
      (item.type === "post" && (normalizeEntryKind(item.kind) === "reflection" || normalizeEntryKind(item.kind) === "praise"));

    if (!supportsOptionalMessage) {
      dispatch({ type: "togglePostReaction", targetType: reaction.targetType, targetId: item.id, kind: reaction.kind });
      return;
    }

    void dispatch({
      type: "togglePostReaction",
      targetType: reaction.targetType,
      targetId: item.id,
      kind: reaction.kind,
      mode: "ensure",
    }).catch(() => undefined);
    setFeedEncouragementDraft("");
    setFeedEncouragementTarget(item);
  }

  function itemPrayerActivity(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    return prayerReactionsForTarget(state.prayerReactions, targetType, item.id)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((reaction) => ({
        id: reaction.id,
        createdAt: reaction.createdAt,
        durationSeconds:
          reaction.durationSeconds ??
          (reaction.startedAt && reaction.completedAt
            ? Math.max(0, Math.floor((Date.parse(reaction.completedAt) - Date.parse(reaction.startedAt)) / 1000))
            : undefined),
        name: reaction.userId === state.currentUserId ? t("common.you") : userById.get(reaction.userId) ?? t("common.someone"),
        image: userImageById.get(reaction.userId),
      }));
  }

  function deletePost(item: Extract<FeedItem, { type: "post" }>) {
    confirmAction({
      title: t("community.card.deleteTitle"),
      message: t("community.card.deleteBody"),
      confirmText: t("common.delete"),
      destructive: true,
      onConfirm: () => {
        dispatch({ type: "deletePost", id: item.id });
      },
    });
  }

  function deleteCheckIn(item: Extract<FeedItem, { type: "check_in" }>) {
    if (item.userId !== state.currentUserId) return;
    confirmAction({
      title: t("community.card.deleteCheckInTitle"),
      message: t("community.card.deleteCheckInBody"),
      confirmText: t("common.delete"),
      destructive: true,
      onConfirm: () => {
        dispatch({ type: "deleteCheckIn", id: item.id });
      },
    });
  }

  function closeFeedEncouragement() {
    setFeedEncouragementTarget(undefined);
    setFeedEncouragementDraft("");
  }

  async function sendFeedEncouragement(body: string, replyId: string) {
    const item = feedEncouragementTarget;
    if (!item) return;

    const reaction = itemReactionState(item);
    await dispatch({
      type: "togglePostReaction",
      targetType: reaction.targetType,
      targetId: item.id,
      kind: reaction.kind,
      mode: "ensure",
    });
    await dispatch({
      type: "createReply",
      targetType: reaction.targetType,
      targetId: item.id,
      body,
      replyId,
    });
    closeFeedEncouragement();
  }

  async function sendPrayerMomentEncouragement(body = prayerMomentEncouragementDraft, replyId?: string) {
    if (!selectedPrayerMoment) return;
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    await dispatch({
      type: "createReply",
      targetType: "post",
      targetId: selectedPrayerMoment.id,
      body: trimmedBody,
      ...(replyId ? { replyId } : {}),
    });
    setPrayerMomentEncouragementDraft("");
  }

  function resetCommunityCheckIn() {
    setCheckInStep("choose");
    setHeartMood(undefined);
    setCheckInText("");
    setCheckInVerses([]);
    setShareCheckIn(true);
  }

  function openCheckInComposer() {
    resetCommunityCheckIn();
    setCheckInVisible(true);
  }

  async function submitCommunityCheckIn() {
    await dispatch({
      type: "submitCheckIn",
      mood: moodNumber(heartMood),
      heartMood,
      readToday: true,
      reflectionText: checkInText.trim(),
      visibility: shareCheckIn ? "group" : "private",
      verse: primaryBibleVerse(checkInVerses),
      verses: checkInVerses,
    });
    setSubmittedCheckInKey(currentCheckInKey);
    setCheckInStep("thanks");
  }

  async function handleInvite() {
    if (!group) return;
    try {
      setInviteMessage(await shareRoomInvite(group, t));
    } catch {
      setInviteMessage(t("community.rooms.inviteFallback"));
    }
  }

  async function handleJoinRoom() {
    if (!canJoin) return;
    await dispatch({ type: "joinGroup", inviteCode: joinInviteCode });
    setJoinInviteCode("");
    setJoinSheetVisible(false);
  }

  async function handleCreateRoom() {
    if (!canCreate) return;
    await dispatch({ type: "createGroup", name: newGroupName });
    setNewGroupName("");
    setJoinSheetVisible(false);
  }

  async function handleSignOut() {
    setJoinSheetVisible(false);
    await dispatch({ type: "signOut" });
    router.replace("/");
  }

  function openRoomOverview() {
    navigateToRoomView("rooms");
    setJoinSheetVisible(false);
  }

  function renderCommunityFeedItem(item: FeedItem) {
    const key = communityFeedItemKey(item);

    if (item.type === "check_in") {
      const reaction = itemReactionState(item);
      return (
        <CheckInCard
          key={key}
          authorImage={userImageById.get(item.userId)}
          authorName={userById.get(item.userId) ?? t("common.someone")}
          item={item}
          ownsItem={item.userId === state.currentUserId}
          onDelete={() => deleteCheckIn(item)}
          onOpen={() => router.push(`/feed/${item.type}/${item.id}` as never)}
          onReact={() => togglePostAction(item)}
          reacted={reaction.reacted}
          reactedBy={reaction.reactedBy}
          reactionCount={reaction.count}
        />
      );
    }

    if (isPrayerFeedKind(item.kind)) {
      const prayer = itemPrayerState(item);
      return (
        <PrayerRequestCard
          key={key}
          authorImage={userImageById.get(item.userId)}
          authorName={userById.get(item.userId) ?? t("common.someone")}
          item={item}
          prayed={prayer.prayed}
          prayedBy={prayer.prayedBy}
          prayerCount={prayer.count}
          onOpen={() => openPrayerDetail(item, "detail")}
          onPray={() => prayForItem(item)}
        />
      );
    }

    const prayer = itemPrayerState(item);
    const reaction = itemReactionState(item);
    return (
      <PostCard
        key={key}
        authorImage={userImageById.get(item.userId)}
        authorName={userById.get(item.userId) ?? t("common.someone")}
        item={item}
        ownsItem={item.userId === state.currentUserId}
        prayed={prayer.prayed}
        prayedBy={prayer.prayedBy}
        prayerCount={prayer.count}
        reacted={reaction.reacted}
        reactedBy={reaction.reactedBy}
        reactionCount={reaction.count}
        replyCount={itemReplies(item).length}
        onOpen={() => router.push(`/feed/${item.type}/${item.id}` as never)}
        onPray={() => prayForItem(item)}
        onReact={() => togglePostAction(item)}
        onEdit={() => editPost(item)}
        onDelete={() => deletePost(item)}
      />
    );
  }

  const communityCheckInModal = group ? (
    <CheckInModal
      visible={checkInVisible}
      step={checkInStep}
      mood={heartMood}
      note={checkInText}
      verses={checkInVerses}
      roomName={group.name}
      roomImage={group.image}
      share={shareCheckIn}
      onClose={() => setCheckInVisible(false)}
      onMood={(value) => {
        setHeartMood(value);
        setCheckInStep("details");
      }}
      onNote={setCheckInText}
      onVerses={setCheckInVerses}
      onShare={setShareCheckIn}
      onBack={() => setCheckInStep("choose")}
      onSubmit={submitCommunityCheckIn}
      onDone={() => {
        setCheckInVisible(false);
        resetCommunityCheckIn();
      }}
    />
  ) : null;

  const communityPrayerMemberModal = group ? (
    <CommunityPrayerMemberModal
      members={otherCommunityMembers}
      onClose={() => setMemberSelectVisible(false)}
      onSelect={(member) => {
        setMemberSelectVisible(false);
        startCommunityPrayer(member);
      }}
      visible={memberSelectVisible}
    />
  ) : null;

  const directPrayerResultSheet = (
    <DirectPrayerResultSheet onDone={() => setDirectPrayerResult(undefined)} result={directPrayerResult} />
  );

  const feedEncouragementSheet = feedEncouragementTarget ? (
    <BottomSheet
      title={t("community.encouragement.addMessageTitle")}
      visible
      onClose={closeFeedEncouragement}
      reducedMotion={feedEncouragementReduceMotion !== false}
    >
      <BodyText muted>{t("community.encouragement.supportingCopy")}</BodyText>
      <WrittenEncouragementComposer
        autoFocus
        onChangeText={setFeedEncouragementDraft}
        onDismiss={closeFeedEncouragement}
        onSend={sendFeedEncouragement}
        value={feedEncouragementDraft}
        variant="sheet"
      />
    </BottomSheet>
  ) : null;

  if (roomView === "prayerMomentDetail" && group) {
    if (!selectedPrayerMoment) {
      return (
        <CommunityTransitionFrame animationKey={roomView} canSwipeBack direction={transitionDirection} onSwipeBack={goBackFromRoomView}>
          <AppScreen topInset={false}>
            <FocusedScreenHeader onBack={goBackFromRoomView} title={t("community.page.prayer")} />
            <Card>
              <BodyText muted>{t("community.prayer.unavailable")}</BodyText>
            </Card>
          </AppScreen>
        </CommunityTransitionFrame>
      );
    }

    return (
      <>
        <CommunityTransitionFrame animationKey={roomView} canSwipeBack direction={transitionDirection} onSwipeBack={goBackFromRoomView}>
          <CommunityPrayerMomentDetailScreen
            activity={itemPrayerActivity(selectedPrayerMoment)}
            authorImage={userImageById.get(selectedPrayerMoment.userId)}
            authorName={userById.get(selectedPrayerMoment.userId) ?? t("common.someone")}
            encouragementDraft={prayerMomentEncouragementDraft}
            item={selectedPrayerMoment}
            onBack={goBackFromRoomView}
            onChangeEncouragement={setPrayerMomentEncouragementDraft}
            onSendEncouragement={sendPrayerMomentEncouragement}
            replies={itemReplies(selectedPrayerMoment)}
            userById={userById}
            userImageById={userImageById}
          />
        </CommunityTransitionFrame>
        <PrayerMoment target={prayerTarget} onClose={closePrayerMoment} onFinish={finishPrayerMoment} />
      </>
    );
  }

  if (roomView === "prayer" && group) {
    return (
      <>
        <CommunityTransitionFrame animationKey={roomView} canSwipeBack direction={transitionDirection} onSwipeBack={goBackFromRoomView}>
          <CommunityPrayerScreen
            communityName={group.name}
            filter={prayerFilter}
            onBack={goBackFromRoomView}
            onCreatePrayer={() => openComposer("prayer_request")}
            onFilter={setPrayerFilter}
            onOpenPrayer={openPrayerDetail}
            onPray={prayForItem}
            onPrayForSomeone={() => setMemberSelectVisible(true)}
            prayerPosts={visiblePrayerPosts}
            prayerState={itemPrayerState}
            feedError={communityFeedError}
            feedLoading={communityFeedLoading}
            feedOffline={communityFeedOffline}
            hasMore={state.communityContentHasMore}
            loadingMore={state.communityContentLoadingMore}
            onLoadMore={() => dispatch({ type: "loadOlderCommunityContent" })}
            userById={userById}
            userImageById={userImageById}
          />
        </CommunityTransitionFrame>
        <SharedComposer
          visible={composerVisible}
          context={composerContext}
          kind={composerKind}
          entryVisibility={composerVisibility}
          title={composerTitle}
          body={composerBody}
          verses={composerVerses}
          onKind={setComposerKind}
          onVisibility={setComposerVisibility}
          onTitle={setComposerTitle}
          onBody={setComposerBody}
          onVerses={setComposerVerses}
          onClose={closeComposer}
          onSubmit={submitComposer}
          editing={Boolean(editingPost)}
          roomName={group.name}
          roomImage={group.image}
        />
        <PrayerMoment
          target={prayerTarget}
          onClose={closePrayerMoment}
          onFinish={finishPrayerMoment}
        />
        {communityPrayerMemberModal}
        {directPrayerResultSheet}
      </>
    );
  }

  if (roomView === "checkins" && group) {
    return (
      <>
        <CommunityTransitionFrame animationKey={roomView} canSwipeBack direction={transitionDirection} onSwipeBack={goBackFromRoomView}>
          <CommunityCheckInsScreen
            checkIns={sharedCheckIns}
            checkedInToday={todaysCheckIn}
            communityName={group.name}
            onBack={goBackFromRoomView}
            onCheckIn={openCheckInComposer}
            currentUserId={state.currentUserId}
            onDelete={deleteCheckIn}
            onOpenCheckIn={(item) => router.push(`/feed/${item.type}/${item.id}` as never)}
            onReact={togglePostAction}
            reactionState={itemReactionState}
            feedError={communityFeedError}
            feedLoading={communityFeedLoading}
            feedOffline={communityFeedOffline}
            hasMore={state.communityContentHasMore}
            loadingMore={state.communityContentLoadingMore}
            onLoadMore={() => dispatch({ type: "loadOlderCommunityContent" })}
            userById={userById}
            userImageById={userImageById}
          />
        </CommunityTransitionFrame>
        {communityCheckInModal}
        {feedEncouragementSheet}
      </>
    );
  }

  if (roomView === "members" && group) {
    return (
      <CommunityTransitionFrame animationKey={roomView} canSwipeBack direction={transitionDirection} onSwipeBack={goBackFromRoomView}>
        <AppScreen topInset={false}>
          <FocusedScreenHeader onBack={goBackFromRoomView} title={t("community.members.title")} />
          <MembersPanel
            group={group}
            latestCheckInByUser={latestCheckInByUser}
            memberCount={memberCount}
            members={communityMembers}
            onInvite={handleInvite}
            onManage={() => router.push("/room-details" as never)}
            onSwitchRoom={openRoomOverview}
          />
        </AppScreen>
      </CommunityTransitionFrame>
    );
  }

  if (roomView === "detail" && group) {
    return (
      <>
        <CommunityTransitionFrame animationKey={roomView} direction={transitionDirection}>
          <AppScreen
            onContentSizeChange={restorePendingCommunityScroll}
            onScroll={handleCommunityScroll}
            onScrollBeginDrag={handleCommunityScrollBeginDrag}
            scrollEventThrottle={16}
            scrollRef={communityScrollRef}
            topInset={false}
          >
            <View style={{ gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("community.detail.openCommunityDetails", {
                  memberCount: communityMemberCount(memberCount, t),
                  name: group.name,
                })}
                onPress={() => router.push("/room-details" as never)}
                style={{ alignItems: "center", flexDirection: "row", gap: 10, minWidth: 0 }}
              >
                <RoomImage image={group.image} name={group.name} size={44} />
                <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>{group.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>
                      {communityMemberCount(memberCount, t)} · {t("common.private")}
                  </Text>
                </View>
                <Feather name="chevron-right" size={17} color={colors.muted} />
              </Pressable>

              <CommunityPrayerActions
                groupId={group.id}
                members={otherCommunityMembers}
                onPrayForPerson={(assignedMember) => {
                  if (!assignedMember) {
                    setMemberSelectVisible(true);
                    return;
                  }

                  startCommunityPrayer(assignedMember);
                }}
                onPrayForRequests={() => {
                  setPrayerFilter("open");
                  navigateToRoomView("prayer");
                }}
              />

              <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                <View style={{ flex: 1, minWidth: 148 }}>
                  <SectionHeading>
                    {detailTab === "recent" ? t("community.feed.recentActivity") : communityRoomTabLabel(detailTab, t)}
                  </SectionHeading>
                </View>
                {detailTab === "prayer" ? (
                  <PrimaryButton icon="heart" onPress={() => navigateToRoomView("prayer")} style={{ minHeight: 44, paddingHorizontal: 12 }}>
                    {t("community.feed.openPrayer")}
                  </PrimaryButton>
                ) : detailTab === "checkins" ? (
                  <PrimaryButton icon="check-circle" onPress={openCheckInsView} style={{ minHeight: 44, paddingHorizontal: 12 }}>
                    {t("community.feed.openCheckIns")}
                  </PrimaryButton>
                ) : (
                  <PrimaryButton icon="edit-3" onPress={() => openComposer("reflection")} style={{ minHeight: 44, paddingHorizontal: 12 }}>
                    {t("community.feed.share")}
                  </PrimaryButton>
                )}
              </View>

              <CommunityFilterChips
                value={detailTab}
                onChange={handleCommunityTabChange}
                options={roomTabs.map((tab) => ({ label: communityRoomTabLabel(tab.value, t), value: tab.value }))}
              />
            </View>

            <View style={{ gap: 12 }}>
              {communityFeedOffline && !communityFeedError ? <CommunityFeedOfflineState /> : null}
              {communityFeedLoading ? (
                <CommunityFeedLoadingState />
              ) : communityFeedError ? (
                <CommunityFeedErrorState />
              ) : visibleFeedItems.length === 0 ? (
                <Card>
                  <BodyText muted>
                    {detailTab === "recent"
                      ? t("community.empty.recent")
                      : detailTab === "prayer"
                        ? t("community.empty.prayer")
                        : detailTab === "checkins"
                          ? t("community.empty.checkIns")
                          : t("community.empty.reflections")}
                  </BodyText>
                </Card>
              ) : (
                <>
                  {recentFeedItems.map(renderCommunityFeedItem)}
                  <CommunityFeedEndpoint
                    communityName={group.name}
                    detailTab={detailTab}
                    onViewEarlier={(earlierFeedItems.length > 0 || state.communityContentHasMore) && visibleEarlierFeedItems.length === 0 ? revealEarlierActivity : undefined}
                    variant={recentFeedItems.length > 0 ? "caught-up" : "no-recent"}
                  />
                  {visibleEarlierFeedItems.length > 0 ? (
                    <>
                      <CommunityActivityDivider label={t("community.feed.earlierActivity")} />
                      {visibleEarlierFeedItems.map(renderCommunityFeedItem)}
                      {hasMoreEarlierFeedItems || state.communityContentHasMore ? (
                        <CommunityEarlierActivityAction loading={state.communityContentLoadingMore} onPress={revealEarlierActivity} />
                      ) : (
                        <CommunityActivityDivider label={t("community.feed.beginning")} />
                      )}
                    </>
                  ) : null}
                </>
              )}
            </View>
          </AppScreen>
        </CommunityTransitionFrame>
        <SharedComposer
          visible={composerVisible}
          context={composerContext}
          kind={composerKind}
          entryVisibility={composerVisibility}
          title={composerTitle}
          body={composerBody}
          verses={composerVerses}
          onKind={setComposerKind}
          onVisibility={setComposerVisibility}
          onTitle={setComposerTitle}
          onBody={setComposerBody}
          onVerses={setComposerVerses}
          onClose={closeComposer}
          onSubmit={submitComposer}
          editing={Boolean(editingPost)}
          roomName={group.name}
          roomImage={group.image}
        />
        {communityCheckInModal}
        {communityPrayerMemberModal}
        {directPrayerResultSheet}
        {feedEncouragementSheet}
        <PrayerMoment
          target={prayerTarget}
          onClose={closePrayerMoment}
          onFinish={finishPrayerMoment}
        />
      </>
    );
  }

  return (
    <>
      <CommunityTransitionFrame animationKey={roomView} canSwipeBack={roomView === "rooms"} direction={transitionDirection} onSwipeBack={goBackFromRoomView}>
        <AppScreen topInset={false}>
          <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontSize: 30, fontWeight: "900", lineHeight: 36 }}>{t("community.page.community")}</Text>
        <BodyText muted>{t("community.page.description")}</BodyText>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading>{t("community.rooms.current")}</SectionHeading>
        <Card style={{ gap: 18, padding: 20 }}>
          {group ? (
            <>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 18 }}>
                <RoomImage image={group.image} name={group.name} size={76} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{group.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "700" }}>{communityMemberCount(memberCount, t)}</Text>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      backgroundColor: colors.accentSubtle,
                      borderRadius: 999,
                      marginTop: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>{t("community.rooms.current")}</Text>
                  </View>
                </View>
              </View>
              <View style={{ backgroundColor: colors.line, height: 1 }} />
              <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{t("community.rooms.code")}</Text>
                  <RoomCodeCopy code={group.inviteCode} />
                </View>
                <PrimaryButton icon="share-2" onPress={handleInvite} style={{ minHeight: 48 }}>
                  {t("community.rooms.invite")}
                </PrimaryButton>
              </View>
              <SecondaryButton icon="message-circle" onPress={() => navigateToRoomView("detail", "back")}>
                {t("community.rooms.open")}
              </SecondaryButton>
              {inviteMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{inviteMessage}</Text> : null}
            </>
          ) : (
            <>
              <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "900" }}>{t("community.rooms.noneSelected")}</Text>
              <BodyText muted>{t("community.rooms.noneSelectedBody")}</BodyText>
              <PrimaryButton icon="plus" onPress={() => setJoinSheetVisible(true)}>
                {t("community.rooms.joinOrCreate")}
              </PrimaryButton>
            </>
          )}
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading>{t("community.rooms.other")}</SectionHeading>
        <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          {otherRooms.length === 0 ? (
            <BodyText muted style={{ padding: 16 }}>{t("community.rooms.noOther")}</BodyText>
          ) : (
            otherRooms.map((room, index) => (
              <Pressable
                accessibilityRole="button"
                key={room.id}
                onPress={() => {
                  dispatch({ type: "switchGroup", id: room.id });
                  setDetailTab("recent");
                  navigateToRoomView("detail", "back");
                }}
                style={{
                  alignItems: "center",
                  borderBottomColor: colors.line,
                  borderBottomWidth: index === otherRooms.length - 1 ? 0 : 1,
                  flexDirection: "row",
                  gap: 12,
                  padding: 14,
                }}
              >
                <RoomImage image={room.image} name={room.name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{room.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>
                    {communityMemberCount(roomMemberCount(state.groupMemberCounts, room.id), t)}
                  </Text>
                </View>
                <Feather name="chevron-right" size={19} color={colors.muted} />
              </Pressable>
            ))
          )}
        </Card>
        <Card style={{ gap: 0, padding: 0 }}>
          <Pressable accessibilityRole="button" onPress={() => setJoinSheetVisible(true)} style={{ paddingHorizontal: 16 }}>
            <Row icon="user-plus">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.rooms.joinAnother")}</Text>
            </Row>
          </Pressable>
        </Card>
        <Card style={{ gap: 0, padding: 0 }}>
          <Pressable accessibilityRole="button" onPress={() => setJoinSheetVisible(true)} style={{ paddingHorizontal: 16 }}>
            <Row icon="plus">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.rooms.createNew")}</Text>
            </Row>
          </Pressable>
        </Card>
      </View>

      <SecondaryButton icon="log-out" onPress={handleSignOut}>
        {t("common.logOut")}
      </SecondaryButton>

      <BottomSheet title={t("community.rooms.joinOrCreate")} visible={joinSheetVisible} onClose={() => setJoinSheetVisible(false)}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{t("community.rooms.enterCode")}</Text>
          <TextInputField autoCapitalize="characters" autoCorrect={false} value={joinInviteCode} onChangeText={(value) => setJoinInviteCode(value.toUpperCase())} onSubmitEditing={handleJoinRoom} placeholder={t("community.rooms.code")} returnKeyType="join" />
          <PrimaryButton disabled={!canJoin} onPress={handleJoinRoom}>
            {t("community.rooms.joinByCode")}
          </PrimaryButton>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "900" }}>{t("common.or")}</Text>
          <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{t("community.rooms.createNew")}</Text>
          <TextInputField value={newGroupName} onChangeText={setNewGroupName} onSubmitEditing={handleCreateRoom} placeholder={t("community.rooms.newNamePlaceholder")} returnKeyType="done" />
          <PrimaryButton disabled={!canCreate} onPress={handleCreateRoom}>
            {t("community.rooms.createAction")}
          </PrimaryButton>
        </View>
        {state.authError ? <Text style={{ color: colors.danger, fontWeight: "800" }}>{communitySystemError(state.authError, t)}</Text> : null}
        <SecondaryButton onPress={() => setJoinSheetVisible(false)}>{t("common.cancel")}</SecondaryButton>
      </BottomSheet>

        </AppScreen>
      </CommunityTransitionFrame>
    </>
  );
}

export const CommunityScreen = SettingsScreen;
export const RoomScreen = SettingsScreen;

function CommunityFilterChips<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              alignItems: "center",
              alignSelf: "stretch",
              backgroundColor: selected ? colors.accentSubtle : colors.paper,
              borderColor: selected ? colors.gold : colors.line,
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              flexShrink: 0,
              gap: 6,
              justifyContent: "center",
              maxWidth: "100%",
              minHeight: 44,
              paddingHorizontal: 13,
              paddingVertical: 8,
            }}
          >
            {selected ? (
              <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
                <Feather name="check" size={14} color={colors.olive} />
              </View>
            ) : null}
            <Text style={[typography.label, { color: selected ? colors.olive : colors.muted, flexShrink: 1, textAlign: "center" }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function communityFeedEndpointBody(detailTab: RoomDetailTab, communityName: string, variant: "caught-up" | "no-recent", t: TranslationFunction) {
  if (variant === "no-recent") {
    if (detailTab === "prayer") return t("community.feed.noRecentPrayer", { name: communityName });
    if (detailTab === "checkins") return t("community.feed.noRecentCheckIns", { name: communityName });
    if (detailTab === "reflections") return t("community.feed.noRecentReflections", { name: communityName });
    return t("community.feed.noRecent", { name: communityName });
  }

  if (detailTab === "prayer") return t("community.feed.caughtUpPrayer", { name: communityName });
  if (detailTab === "checkins") return t("community.feed.caughtUpCheckIns", { name: communityName });
  if (detailTab === "reflections") return t("community.feed.caughtUpReflections", { name: communityName });
  return t("community.feed.caughtUp", { name: communityName });
}

function CommunityFeedEndpoint({
  communityName,
  detailTab,
  onViewEarlier,
  variant,
}: {
  communityName: string;
  detailTab: RoomDetailTab;
  onViewEarlier?: () => void;
  variant: "caught-up" | "no-recent";
}) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", gap: 5, paddingBottom: 6, paddingHorizontal: 16, paddingTop: 14 }}>
      <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
        <BrandWaveMotif height={12} opacity={0.65} variant="accent" width={58} />
      </View>
      <Text style={[typography.cardTitle, { color: colors.ink, fontSize: 15, lineHeight: 20, textAlign: "center" }]}>
        {t(variant === "caught-up" ? "community.feed.caughtUpTitle" : "community.feed.noRecentTitle")}
      </Text>
      <Text style={[typography.caption, { color: colors.muted, maxWidth: 260, textAlign: "center" }]}>
        {communityFeedEndpointBody(detailTab, communityName, variant, t)}
      </Text>
      {onViewEarlier ? (
        <Pressable
          accessibilityLabel={t("community.feed.viewEarlierIn", { name: communityName })}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onViewEarlier}
          style={{ alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 }}
        >
          <Text style={[typography.label, { color: colors.olive }]}>{t("community.feed.viewEarlier")}</Text>
          <Feather name="chevron-down" size={16} color={colors.olive} />
        </Pressable>
      ) : null}
    </View>
  );
}

function CommunityFeedLoadingState() {
  const { t } = useAppTranslation();
  return (
    <View
      accessibilityLabel={t("community.feed.loading")}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={{ alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 24 }}
    >
      <ActivityIndicator color={colors.olive} size="small" />
      <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{t("community.feed.loading")}</Text>
    </View>
  );
}

function CommunityFeedOfflineState() {
  const { t } = useAppTranslation();
  return (
    <View accessibilityLabel={t("community.feed.unavailable")} accessibilityLiveRegion="polite">
      <Card style={{ alignItems: "center", gap: 6, padding: 18 }}>
        <Feather name="wifi-off" size={20} color={colors.muted} />
        <Text style={[typography.cardTitle, { color: colors.ink, fontSize: 15, textAlign: "center" }]}>{t("community.feed.unavailable")}</Text>
      </Card>
    </View>
  );
}

function CommunityFeedErrorState() {
  const { t } = useAppTranslation();
  return (
    <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <Card style={{ alignItems: "center", gap: 6, padding: 18 }}>
        <Feather name="cloud-off" size={20} color={colors.muted} />
        <Text style={[typography.cardTitle, { color: colors.ink, fontSize: 15, textAlign: "center" }]}>{t("community.feed.unavailable")}</Text>
        <Text style={[typography.caption, { color: colors.muted, maxWidth: 260, textAlign: "center" }]}>
          {t("community.feed.loadError")}
        </Text>
      </Card>
    </View>
  );
}

function CommunityActivityDivider({ label }: { label: string }) {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 4 }}>
      <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
      <Text style={[typography.caption, { color: colors.muted }]}>{label}</Text>
      <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
    </View>
  );
}

function CommunityEarlierActivityAction({ loading = false, onPress }: { loading?: boolean; onPress: () => void | Promise<void> }) {
  const { t } = useAppTranslation();
  return (
    <Pressable
      accessibilityLabel={t("community.feed.viewMoreEarlier")}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      onPress={onPress}
      style={{ alignItems: "center", alignSelf: "center", flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 }}
    >
      <Text style={[typography.label, { color: colors.olive }]}>{t(loading ? "community.feed.loadingEarlier" : "common.viewMore")}</Text>
      {loading ? <ActivityIndicator color={colors.olive} size="small" /> : <Feather name="chevron-down" size={16} color={colors.olive} />}
    </Pressable>
  );
}

function CommunityTransitionFrame({
  animationKey,
  canSwipeBack = false,
  children,
  direction,
  onSwipeBack,
}: {
  animationKey?: string;
  canSwipeBack?: boolean;
  children: ReactNode;
  direction: TransitionDirection;
  onSwipeBack?: () => boolean | void;
}) {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const entryOffset = Math.min(width * 0.18, 92);
  const [reduceMotion, setReduceMotion] = useState<boolean | undefined>(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return undefined;
  });

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    translateX.stopAnimation();
    if (reduceMotion !== false) {
      translateX.setValue(0);
      return undefined;
    }
    translateX.setValue(direction === "forward" ? entryOffset : -entryOffset);
    const animation = Animated.timing(translateX, {
      duration: 220,
      toValue: 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
      translateX.setValue(0);
    };
  }, [animationKey, direction, entryOffset, reduceMotion, translateX]);

  // Keep the native animation graph attached when feed/accessibility state rerenders.
  // Replacing the interpolation mid-transition can leave the translation stranded.
  const opacity = useMemo(
    () => translateX.interpolate({
      inputRange: [-entryOffset, 0, width],
      outputRange: [0.9, 1, 0.72],
      extrapolate: "clamp",
    }),
    [entryOffset, translateX, width],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          canSwipeBack && gesture.moveX < 42 && gesture.dx > 10 && Math.abs(gesture.dy) < 24,
        onPanResponderMove: (_, gesture) => {
          if (!canSwipeBack) return;
          translateX.setValue(Math.max(0, gesture.dx));
        },
        onPanResponderRelease: (_, gesture) => {
          if (!canSwipeBack) return;
          const shouldGoBack = gesture.dx > Math.min(width * 0.28, 120) || gesture.vx > 0.75;
          if (shouldGoBack) {
            if (reduceMotion !== false) {
              translateX.setValue(0);
              onSwipeBack?.();
              return;
            }
            Animated.timing(translateX, {
              duration: 180,
              toValue: width,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) onSwipeBack?.();
            });
            return;
          }
          if (reduceMotion !== false) {
            translateX.setValue(0);
            return;
          }
          Animated.spring(translateX, {
            damping: 22,
            mass: 0.8,
            stiffness: 220,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          translateX.stopAnimation();
          translateX.setValue(0);
        },
      }),
    [canSwipeBack, onSwipeBack, reduceMotion, translateX, width],
  );

  return (
    <Animated.View
      {...(canSwipeBack ? panResponder.panHandlers : {})}
      style={{ backgroundColor: colors.cream, flex: 1, opacity, transform: [{ translateX }] }}
    >
      {children}
    </Animated.View>
  );
}

function FocusedScreenHeader({ onBack, title }: { onBack: () => void; title: string }) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={onBack} />
      <Text
        style={{ color: colors.ink, flex: 1, fontSize: 18, fontWeight: "900", marginHorizontal: 8, textAlign: "center" }}
      >
        {title}
      </Text>
      <View style={{ width: 38 }} />
    </View>
  );
}

function FocusedCommunityScreenIntro({
  communityName,
  description,
  onBack,
  title,
}: {
  communityName: string;
  description: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <View style={{ gap: 10 }}>
      <FocusedScreenHeader onBack={onBack} title={communityName} />
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>
          {title}
        </Text>
        <BodyText muted>{description}</BodyText>
      </View>
    </View>
  );
}

function CommunityPrayerActions({
  activeAssignment,
  groupId,
  members,
  onPrayForPerson,
  onPrayForRequests,
}: {
  activeAssignment?: CommunityPrayerAssignment;
  groupId: Id;
  members: CommunityMember[];
  onPrayForPerson: (assignedMember?: CommunityMember) => void;
  onPrayForRequests: () => void;
}) {
  const { t } = useAppTranslation();
  const [assignmentClock, setAssignmentClock] = useState(Date.now);

  useEffect(() => {
    const weekStartsAt = Date.parse(activeAssignment?.weekStartsAt ?? "");
    const weekEndsAt = Date.parse(activeAssignment?.weekEndsAt ?? "");
    if (!Number.isFinite(weekStartsAt) || !Number.isFinite(weekEndsAt)) return;

    let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleNextBoundary = () => {
      const currentTime = Date.now();
      const nextBoundary = [weekStartsAt, weekEndsAt]
        .filter((boundary) => boundary > currentTime)
        .sort((left, right) => left - right)[0];
      if (!nextBoundary) return;

      boundaryTimer = setTimeout(() => {
        setAssignmentClock(Date.now());
        scheduleNextBoundary();
      }, Math.min(nextBoundary - currentTime + 25, 2_147_000_000));
    };

    scheduleNextBoundary();
    return () => {
      if (boundaryTimer) clearTimeout(boundaryTimer);
    };
  }, [activeAssignment?.weekEndsAt, activeAssignment?.weekStartsAt]);

  const now = Math.max(assignmentClock, Date.now());
  const weekStartsAt = Date.parse(activeAssignment?.weekStartsAt ?? "");
  const weekEndsAt = Date.parse(activeAssignment?.weekEndsAt ?? "");
  const assignmentIsCurrent = Boolean(
    activeAssignment?.groupId === groupId
      && Number.isFinite(weekStartsAt)
      && Number.isFinite(weekEndsAt)
      && weekStartsAt <= now
      && now < weekEndsAt,
  );
  const assignedMember = activeAssignment && assignmentIsCurrent
    ? members.find((member) => member.id === activeAssignment.memberId)
    : undefined;
  const assignedName = assignedMember?.name.trim();
  const activeAssignedMember = assignedName ? assignedMember : undefined;
  const personIsPrimary = Boolean(activeAssignedMember);
  const assignedFirstName = assignedName?.split(/\s+/)[0];

  return (
    <View style={{ alignItems: "stretch", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <CommunityPrayerAction
        icon="list"
        onPress={onPrayForRequests}
        primary={!personIsPrimary}
        subtitle={t("community.prayer.actions.viewRequests")}
        title={t("community.prayer.actions.prayForRequests")}
      />
      <CommunityPrayerAction
        member={activeAssignedMember}
        icon="users"
        onPress={() => onPrayForPerson(activeAssignedMember)}
        primary={personIsPrimary}
        subtitle={t(activeAssignedMember ? "community.prayer.actions.thisWeeksPerson" : "community.prayer.actions.chooseMember")}
        title={assignedFirstName ? t("community.prayer.actions.prayForPerson", { name: assignedFirstName }) : t("community.prayer.actions.prayForSomeone")}
      />
    </View>
  );
}

function CommunityPrayerAction({
  icon,
  member,
  onPress,
  primary,
  subtitle,
  title,
}: {
  icon: "list" | "users";
  member?: CommunityMember;
  onPress: () => void;
  primary: boolean;
  subtitle: string;
  title: string;
}) {
  const { t } = useAppTranslation();
  const titleColor = primary ? colors.onAccent : colors.ink;
  const subtitleColor = primary ? colors.onAccent : colors.muted;

  return (
    <Pressable
      accessibilityLabel={`${member ? t("community.prayer.actions.prayForPerson", { name: member.name }) : title}. ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: primary ? colors.gold : colors.paper,
        borderColor: primary ? colors.gold : colors.line,
        borderRadius: 16,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: 8,
        minHeight: 70,
        minWidth: 140,
        paddingHorizontal: 9,
        paddingVertical: 9,
      }}
    >
      {member ? (
        <Avatar image={member.image} name={member.name} size={34} tone="green" />
      ) : (
        <View
          style={{
            alignItems: "center",
            backgroundColor: primary ? colors.paper : colors.accentSubtle,
            borderRadius: 999,
            height: 32,
            justifyContent: "center",
            width: 32,
          }}
        >
          <Feather name={icon} size={16} color={colors.olive} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={{ color: titleColor, fontSize: 13, fontWeight: "900", lineHeight: 16 }}>
          {title}
        </Text>
        <Text style={{ color: subtitleColor, fontSize: 11, fontWeight: "700", lineHeight: 13 }}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function CommunityPrayerMemberModal({
  members,
  onClose,
  onSelect,
  visible,
}: {
  members: CommunityMember[];
  onClose: () => void;
  onSelect: (member: CommunityMember) => void;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel={t("common.close")} icon="arrow-left" onPress={onClose} />
          <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>{t("community.prayer.actions.prayForSomeone")}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900" }}>{t("community.prayer.memberPromptTitle")}</Text>
          <BodyText muted>{t("community.prayer.memberPromptBody")}</BodyText>
        </View>
        <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
          {members.map((member) => (
            <Pressable accessibilityRole="button" key={member.id} onPress={() => onSelect(member)}>
              <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, padding: 14 }}>
                <Avatar image={member.image} name={member.name} size={46} tone="green" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{member.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>{t("community.prayer.actions.prayForPerson", { name: member.name })}</Text>
                </View>
                <Feather name="heart" size={18} color={colors.gold} />
              </Card>
            </Pressable>
          ))}
          {members.length === 0 ? (
            <Card>
              <BodyText muted>{t("community.prayer.noOtherMembers")}</BodyText>
            </Card>
          ) : null}
        </ScrollView>
      </AppScreen>
    </FullScreenModal>
  );
}

function CommunityPrayerScreen({
  communityName,
  feedError,
  feedLoading,
  feedOffline,
  hasMore,
  loadingMore,
  filter,
  onBack,
  onCreatePrayer,
  onFilter,
  onOpenPrayer,
  onPray,
  onPrayForSomeone,
  onLoadMore,
  prayerPosts,
  prayerState,
  userById,
  userImageById,
}: {
  communityName: string;
  feedError?: string;
  feedLoading: boolean;
  feedOffline: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  filter: PrayerFilter;
  onBack: () => void;
  onCreatePrayer: () => void;
  onFilter: (filter: PrayerFilter) => void;
  onOpenPrayer: (item: Extract<FeedItem, { type: "post" }>) => void;
  onPray: (item: FeedItem) => void;
  onPrayForSomeone: () => void;
  onLoadMore: () => Promise<void>;
  prayerPosts: Extract<FeedItem, { type: "post" }>[];
  prayerState: (item: FeedItem) => { prayed: boolean; count: number; prayedBy: { name: string; image?: GroupImage }[] };
  userById: Map<Id, string>;
  userImageById: Map<Id, GroupImage | undefined>;
}) {
  const { t } = useAppTranslation();
  const prayerCountKey =
    filter === "open"
      ? prayerPosts.length === 1
        ? "community.prayer.count.open.one"
        : "community.prayer.count.open.other"
      : filter === "answered"
        ? prayerPosts.length === 1
          ? "community.prayer.count.answered.one"
          : "community.prayer.count.answered.other"
        : prayerPosts.length === 1
          ? "community.prayer.count.total.one"
          : "community.prayer.count.total.other";

  return (
    <AppScreen>
      <FocusedCommunityScreenIntro
        communityName={communityName}
        description={t("community.prayer.pageDescription")}
        onBack={onBack}
        title={t("community.page.prayer")}
      />
      <CommunityFilterChips
        value={filter}
        onChange={onFilter}
        options={prayerFilters.map((item) => ({ label: communityPrayerFilterLabel(item.value, t), value: item.value }))}
      />
      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
        <BodyText muted style={{ flex: 1, minWidth: 140 }}>
          {feedLoading
            ? t("community.feed.loading")
            : feedError
              ? t("community.feed.unavailable")
              : t(prayerCountKey, { count: prayerPosts.length })}
        </BodyText>
        <PrimaryButton icon="heart" onPress={onCreatePrayer} style={{ minHeight: 44, paddingHorizontal: 14 }}>
          {t("community.prayer.share")}
        </PrimaryButton>
      </View>
      <SecondaryButton icon="users" onPress={onPrayForSomeone} style={{ minHeight: 44 }}>
        {t("community.prayer.prayForSomeone")}
      </SecondaryButton>
      {feedOffline && !feedError ? <CommunityFeedOfflineState /> : null}
      {feedLoading ? (
        <CommunityFeedLoadingState />
      ) : feedError ? (
        <CommunityFeedErrorState />
      ) : prayerPosts.length === 0 ? (
        <Card>
          <BodyText muted>
            {t(filter === "answered" ? "community.prayer.emptyAnswered" : "community.prayer.empty")}
          </BodyText>
        </Card>
      ) : (
        prayerPosts.map((item) => {
          const prayer = prayerState(item);
          return (
            <PrayerRequestCard
              key={item.id}
              authorImage={userImageById.get(item.userId)}
              authorName={userById.get(item.userId) ?? t("common.someone")}
              item={item}
              prayed={prayer.prayed}
              prayedBy={prayer.prayedBy}
              prayerCount={prayer.count}
              onOpen={() => onOpenPrayer(item)}
              onPray={() => onPray(item)}
            />
          );
        })
      )}
      {hasMore && !feedLoading && !feedError ? (
        <CommunityEarlierActivityAction loading={loadingMore} onPress={onLoadMore} />
      ) : null}
    </AppScreen>
  );
}

function CommunityPrayerMomentDetailScreen({
  activity,
  authorImage,
  authorName,
  encouragementDraft,
  item,
  onBack,
  onChangeEncouragement,
  onSendEncouragement,
  replies,
  userById,
  userImageById,
}: {
  activity: PrayerActivityEntry[];
  authorImage?: GroupImage;
  authorName: string;
  encouragementDraft: string;
  item: Extract<FeedItem, { type: "post" }>;
  onBack: () => void;
  onChangeEncouragement: (value: string) => void;
  onSendEncouragement: (body?: string, replyId?: string) => Promise<void>;
  replies: Reply[];
  userById: Map<Id, string>;
  userImageById: Map<Id, GroupImage | undefined>;
}) {
  const { language, t } = useAppTranslation();
  const displayCopy = communityPrayerMomentDisplayCopy(item, t);

  return (
    <AppScreen topInset={false}>
      <FocusedScreenHeader onBack={onBack} title={t("community.page.prayer")} />
      <View style={{ alignItems: "center", gap: 8 }}>
        <Avatar image={authorImage} name={authorName} size={58} tone="green" />
        <View style={{ alignItems: "center", gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{authorName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt, language)}</Text>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31, textAlign: "center" }}>
          {displayCopy.title || communityDefaultFeedTitle(item, t)}
        </Text>
        <LinkPreviewContent text={displayCopy.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <BodyText hiddenUrl={hiddenUrl} style={{ fontSize: 16, lineHeight: 24, textAlign: "center" }}>
                {displayCopy.body || t("community.card.noWords")}
              </BodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      </View>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 10, padding: 14 }}>
        <MaterialCommunityIcons name="hands-pray" size={20} color={colors.gold} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.prayer.made")}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
            {t("community.prayer.sharedTime", { time: formatRelativeTime(item.createdAt, language) })}
          </Text>
        </View>
        <PrayerMomentPill />
      </Card>
      {replies.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionHeading>{t("community.reply.heading")}</SectionHeading>
          <Card style={{ gap: 0, padding: 0 }}>
            {replies.map((reply, index) => (
              <View
                key={reply.id}
                style={{
                  borderBottomColor: colors.line,
                  borderBottomWidth: index === replies.length - 1 ? 0 : 1,
                  gap: 8,
                  padding: 14,
                }}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                  <Avatar image={userImageById.get(reply.userId)} name={userById.get(reply.userId)} size={32} tone="pink" />
                  <View>
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                      {userById.get(reply.userId) ?? t("common.someone")}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                      {formatRelativeTime(reply.createdAt, language)}
                    </Text>
                  </View>
                </View>
                <LinkPreviewContent text={reply.body}>
                  {({ hiddenUrl, preview }) => (
                    <>
                      <BodyText hiddenUrl={hiddenUrl}>{reply.body}</BodyText>
                      {preview}
                    </>
                  )}
                </LinkPreviewContent>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <TextInputField
          value={encouragementDraft}
          onChangeText={(value) => onChangeEncouragement(value.slice(0, 500))}
          onSubmitEditing={() => onSendEncouragement()}
          placeholder={t("community.reply.encouragementPlaceholder")}
          returnKeyType="send"
          style={{ flex: 1 }}
        />
        <Pressable
          accessibilityLabel={t("community.reply.send")}
          accessibilityRole="button"
          disabled={!encouragementDraft.trim()}
          onPress={() => onSendEncouragement()}
          style={{ alignItems: "center", height: 48, justifyContent: "center", opacity: encouragementDraft.trim() ? 1 : 0.4, width: 48 }}
        >
          <Feather name="send" size={22} color={colors.gold} />
        </Pressable>
      </View>
      <PrayerActivity activity={activity} />
    </AppScreen>
  );
}

function PrayerMomentPill() {
  const { t } = useAppTranslation();
  return (
    <View
      style={{
        backgroundColor: colors.rhythmSoft,
        borderColor: colors.accentRhythm,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>{t("community.action.prayer.completed")}</Text>
    </View>
  );
}

function CommunityCheckInsScreen({
  checkIns,
  checkedInToday,
  communityName,
  currentUserId,
  feedError,
  feedLoading,
  feedOffline,
  hasMore,
  loadingMore,
  onBack,
  onCheckIn,
  onDelete,
  onOpenCheckIn,
  onReact,
  onLoadMore,
  reactionState,
  userById,
  userImageById,
}: {
  checkIns: Extract<FeedItem, { type: "check_in" }>[];
  checkedInToday: boolean;
  communityName: string;
  currentUserId?: Id;
  feedError?: string;
  feedLoading: boolean;
  feedOffline: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onBack: () => void;
  onCheckIn: () => void;
  onDelete: (item: Extract<FeedItem, { type: "check_in" }>) => void;
  onOpenCheckIn: (item: Extract<FeedItem, { type: "check_in" }>) => void;
  onReact: (item: FeedItem) => void;
  onLoadMore: () => Promise<void>;
  reactionState: (item: FeedItem) => {
    reacted: boolean;
    count: number;
    reactedBy: { name: string; image?: GroupImage }[];
  };
  userById: Map<Id, string>;
  userImageById: Map<Id, GroupImage | undefined>;
}) {
  const { t } = useAppTranslation();
  return (
    <AppScreen>
      <FocusedCommunityScreenIntro
        communityName={communityName}
        description={t("community.checkIns.pageDescription")}
        onBack={onBack}
        title={t("community.page.checkIns")}
      />
      {!feedLoading && !feedError && !checkedInToday ? (
        <Card>
          <SectionHeading>{t("community.checkIns.weeklyTitle")}</SectionHeading>
          <BodyText muted>{t("community.checkIns.weeklyDescription")}</BodyText>
          <PrimaryButton icon="edit-3" onPress={onCheckIn}>
            {t("community.checkIns.action")}
          </PrimaryButton>
        </Card>
      ) : null}
      <SectionHeading>{t("community.checkIns.recent")}</SectionHeading>
      {feedOffline && !feedError ? <CommunityFeedOfflineState /> : null}
      {feedLoading ? (
        <CommunityFeedLoadingState />
      ) : feedError ? (
        <CommunityFeedErrorState />
      ) : checkIns.length === 0 ? (
        <Card>
          <BodyText muted>{t("community.checkIns.empty")}</BodyText>
        </Card>
      ) : (
        checkIns.map((item) => {
          const reaction = reactionState(item);
          return (
            <CheckInCard
              key={item.id}
              authorImage={userImageById.get(item.userId)}
              authorName={userById.get(item.userId) ?? t("common.someone")}
              item={item}
              ownsItem={item.userId === currentUserId}
              onDelete={() => onDelete(item)}
              onOpen={() => onOpenCheckIn(item)}
              onReact={() => onReact(item)}
              reacted={reaction.reacted}
              reactedBy={reaction.reactedBy}
              reactionCount={reaction.count}
            />
          );
        })
      )}
      {hasMore && !feedLoading && !feedError ? (
        <CommunityEarlierActivityAction loading={loadingMore} onPress={onLoadMore} />
      ) : null}
    </AppScreen>
  );
}

function PrayerRequestCard({
  authorImage,
  authorName,
  item,
  onOpen,
  onPray,
  prayed,
  prayedBy,
  prayerCount,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: Extract<FeedItem, { type: "post" }>;
  onOpen: () => void;
  onPray: () => void;
  prayed: boolean;
  prayedBy?: { name: string; image?: GroupImage }[];
  prayerCount: number;
}) {
  const { t } = useAppTranslation();
  const answered = Boolean(item.answeredAt);
  const prayerMoment = isPrayerMomentKind(item.kind);
  const displayCopy = communityPrayerMomentDisplayCopy(item, t);
  return (
    <CommunityFeedCard
      actions={
        prayerMoment ? (
          <CommunityCardAction active icon="pray" label={t("community.action.prayer.completed")} tone="prayer" />
        ) : (
          <CommunityCardAction
            active={prayed}
            icon="pray"
            label={communityActionLabel("prayer_request", prayed, t)}
            onPress={onPray}
            tone="prayer"
          />
        )
      }
      attachment={<VerseList verse={item.verse} verses={item.verses} compact />}
      authorImage={authorImage}
      authorName={authorName}
      body={displayCopy.body}
      bodyContent={
        <LinkPreviewContent text={displayCopy.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <ExpandableBodyText actionMinHeight={44} collapsedLines={6} hiddenUrl={hiddenUrl}>
                {displayCopy.body || t("community.card.noWords")}
              </ExpandableBodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      }
      bodyFallback={t("community.card.noWords")}
      item={item}
      onOpen={onOpen}
      responseSummary={
        prayerMoment ? undefined : (
          <CommunityCardResponseSummary
            count={prayerCount}
            label={communityPrayerNoun(prayerCount, t)}
            showWhenEmpty
            users={prayedBy}
          />
        )
      }
      status={prayerMoment ? undefined : <StatusPill status={answered ? "answered" : "open"} />}
    />
  );
}

function CheckInCard({
  authorImage,
  authorName,
  item,
  onDelete,
  onOpen,
  onReact,
  ownsItem,
  reacted,
  reactedBy,
  reactionCount,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: Extract<FeedItem, { type: "check_in" }>;
  onDelete?: () => void;
  onOpen: () => void;
  onReact: () => void;
  ownsItem: boolean;
  reacted: boolean;
  reactedBy?: { name: string; image?: GroupImage }[];
  reactionCount: number;
}) {
  const { t } = useAppTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressOpenRef = useRef(false);
  const itemKind = feedItemKind(item);

  function openDeleteConfirmation() {
    if (!onDelete) return;
    suppressOpenRef.current = true;
    setMenuOpen(false);
    onDelete();
    setTimeout(() => {
      suppressOpenRef.current = false;
    }, 250);
  }

  const menuButton = ownsItem && onDelete ? (
    <Pressable
      accessibilityLabel={t("community.card.checkInOptions")}
      accessibilityRole="button"
      hitSlop={4}
      onPressIn={(event) => event.stopPropagation()}
      onPress={(event) => {
        event.stopPropagation();
        setMenuOpen((current) => !current);
      }}
      style={{ alignItems: "center", flexShrink: 0, height: 44, justifyContent: "center", width: 44 }}
    >
      <Feather name="more-horizontal" size={19} color={colors.ink} />
    </Pressable>
  ) : null;

  const menu = ownsItem && onDelete && menuOpen ? (
    <View
      style={{
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: radius.md,
        borderWidth: 1,
        minWidth: 118,
        paddingVertical: 4,
        position: "absolute",
        right: 14,
        top: 54,
        zIndex: 40,
        ...platformShadow({
          boxShadow: "0 10px 24px rgba(11, 18, 32, 0.14)",
          elevation: 12,
          offset: { width: 0, height: 10 },
          opacity: 0.14,
          radius: 24,
        }),
      }}
    >
      <Pressable
        accessibilityLabel={t("common.delete")}
        accessibilityRole="button"
        onPressIn={(event) => event.stopPropagation()}
        onPress={(event) => {
          event.stopPropagation();
          openDeleteConfirmation();
        }}
        style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 }}
      >
        <Feather name="trash-2" size={14} color={colors.danger} />
        <Text style={[typography.label, { color: colors.danger }]}>{t("common.delete")}</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <CommunityFeedCard
      actions={
        <CommunityCardAction
          active={reacted}
          icon="heart"
          label={communityActionLabel(itemKind, reacted, t)}
          onPress={onReact}
          tone="check_in"
        />
      }
      attachment={
        <>
          <CommunityCheckInMood mood={item.mood} />
          <VerseList verse={item.verse} verses={item.verses} compact />
        </>
      }
      authorImage={authorImage}
      authorName={authorName}
      body={item.body}
      bodyContent={item.body.trim() ? (
        <LinkPreviewContent text={item.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <ExpandableBodyText actionMinHeight={44} collapsedLines={6} hiddenUrl={hiddenUrl}>{item.body}</ExpandableBodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      ) : undefined}
      headerAccessory={menuButton}
      item={item}
      onOpen={() => {
        if (menuOpen || suppressOpenRef.current) {
          setMenuOpen(false);
          return;
        }
        onOpen();
      }}
      overlay={menu}
      responseSummary={
        reactedBy?.length ? (
          <CommunityCardResponseSummary
            count={reactionCount}
            label={communityResponseNoun(item, reactionCount, t)}
            users={reactedBy}
          />
        ) : undefined
      }
      style={{ zIndex: menuOpen ? 10 : 1 }}
    />
  );
}

function MembersPanel({
  group,
  latestCheckInByUser,
  memberCount,
  members,
  onInvite,
  onManage,
  onSwitchRoom,
}: {
  group: Group;
  latestCheckInByUser: Map<Id, Extract<FeedItem, { type: "check_in" }>>;
  memberCount: number;
  members: { id: Id; image?: GroupImage; name: string; role: "owner" | "member" }[];
  onInvite: () => void;
  onManage: () => void;
  onSwitchRoom: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
        <RoomImage image={group.image} name={group.name} size={58} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{group.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{communityMemberCount(memberCount, t)}</Text>
        </View>
      </Card>
      <Card style={{ gap: 0, padding: 0 }}>
        {members.map((member, index) => {
          const checkIn = latestCheckInByUser.get(member.id);
          return (
            <View
              key={member.id}
              style={{
                alignItems: "center",
                borderBottomColor: colors.line,
                borderBottomWidth: index === members.length - 1 ? 0 : 1,
                flexDirection: "row",
                gap: 10,
                padding: 14,
              }}
            >
              <Avatar image={member.image} name={member.name} size={38} tone={member.role === "owner" ? "orange" : "green"} />
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{member.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {t(member.role === "owner" ? "community.members.role.host" : "community.members.role.member")}
                </Text>
                {checkIn ? (
                  <Text style={{ color: colors.muted, flexShrink: 1, fontSize: 12, fontWeight: "600" }}>
                    {t("community.members.lastCheckIn", { mood: communityMoodScaleLabel(checkIn.mood, t) })}
                  </Text>
                ) : null}
              </View>
              <View
                style={{
                  backgroundColor: checkIn ? colors.mossSurface : colors.input,
                  borderRadius: 999,
                  height: 9,
                  width: 9,
                }}
              />
            </View>
          );
        })}
      </Card>
      <PrimaryButton icon="share-2" onPress={onInvite}>
        {t("community.members.invite")}
      </PrimaryButton>
      <Card>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{t("community.rooms.code")}</Text>
        <RoomCodeCopy code={group.inviteCode} />
      </Card>
      <SecondaryButton icon="settings" onPress={onManage}>
        {t("community.management.title")}
      </SecondaryButton>
      <SecondaryButton icon="repeat" onPress={onSwitchRoom}>
        {t("community.rooms.joinOrCreate")}
      </SecondaryButton>
    </View>
  );
}
