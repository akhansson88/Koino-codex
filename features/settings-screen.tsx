import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { AccessibilityInfo, BackHandler, FlatList, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { normalizeBibleVerses, primaryBibleVerse } from "@/features/bible-verse-utils";
import { CheckInModal, moodNumber, type CheckInStep } from "@/features/check-in-modal";
import { checkInExistsForDay } from "@/state/check-ins";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import { prayerReactionsForTarget } from "@/state/prayer-reactions";
import { EntryVisibility, feedItemKind, normalizeEntryKind, roomTabs, visibility } from "@/state/product";
import {
  selectCommunityContent,
  selectCommunityPostById,
  selectPrayerRequests,
} from "@/state/selectors/community-content";
import type {
  BibleVerse,
  EntryKind,
  FeedItem,
  HeartMood,
  Id,
  PostReactionKind,
  PrayerReaction,
  PostReaction,
  Reply,
} from "@/state/types";
import {
  AppScreen,
  BodyText,
  BottomSheet,
  Card,
  PrimaryButton,
  RoomImage,
  Row,
  SecondaryButton,
  SectionHeading,
  TextInputField,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import {
  communityMemberCount,
  communityPrayerMomentDisplayCopy,
  communityRoomTabLabel,
  communitySystemError,
} from "@/ui/community-copy";
import { confirmAction } from "@/ui/confirm";
import { DirectPrayerResultSheet, type DirectPrayerResult } from "@/ui/direct-prayer-result-sheet";
import { tabContentClearance } from "@/ui/navigation-layout";
import { PostCard } from "@/ui/post-card";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { SharedComposer } from "@/ui/shared-composer";
import { colors } from "@/ui/theme";
import { WrittenEncouragementComposer } from "@/ui/written-encouragement-composer";
import {
  type RoomView,
  type RoomDetailTab,
  type PrayerFilter,
  type ComposerContext,
  type CommunityFeedRevealState,
  type CommunityFeedRow,
  type TransitionDirection,
  type CommunityMember,
} from "@/features/community/types";
import {
  roomMemberCount,
  localDayKey,
  filterCommunityFeedItems,
  partitionCommunityFeed,
  isPrayerMomentKind,
  COMMUNITY_RECENT_DAYS,
  COMMUNITY_FEED_TIMER_MAX_DELAY,
  FIREBASE_COMMUNITY_REVEAL_RESERVE,
  COMMUNITY_EARLIER_PAGE_SIZE,
  shareRoomInvite,
  communityFeedItemKey,
  isPrayerFeedKind,
} from "@/features/community/feed-helpers";
import { CheckInCard, CommunityCheckInsScreen } from "@/features/community/check-ins";
import {
  PrayerRequestCard,
  CommunityPrayerMomentDetailScreen,
  CommunityPrayerScreen,
} from "@/features/community/prayer-screens";
import { CommunityPrayerMemberModal, CommunityPrayerActions } from "@/features/community/prayer-actions";
import { FocusedScreenHeader } from "@/features/community/focused-header";
import { MembersPanel } from "@/features/community/members-panel";
import { CommunityEncryptionNotice } from "@/features/community/encryption-notice";
import {
  MemoCommunityFeedCard,
  CommunityFeedEndpoint,
  CommunityActivityDivider,
  CommunityEarlierActivityAction,
  CommunityFilterChips,
  CommunityFeedOfflineState,
  CommunityFeedLoadingState,
  CommunityFeedErrorState,
} from "@/features/community/feed-components";

export function SettingsScreen({ roomView: routeRoomView = "detail" }: { roomView?: RoomView }) {
  const insets = useSafeAreaInsets();
  const state = useKoinoFields(["authError", "checkIns", "checkInDailyClaims", "checkInDailyClaimsReady", "communityContentHasMore", "communityContentLoadingMore", "communityFeedError", "communityFeedGroupId", "communityFeedOffline", "communityFeedReady", "currentGroupId", "currentUserId", "groupMemberCounts", "groups", "journalEntries", "memberships", "postReactions", "posts", "prayerReactions", "privateCheckIns", "privateCheckInsReady", "replies", "users"]);
  const { dispatch } = useKoinoActions();
  const { t } = useAppTranslation();
  const navigation = useNavigation();
  const { prayerMomentId } = useLocalSearchParams<{ prayerMomentId?: string }>();
  const [roomView, setRoomView] = useState<RoomView>(routeRoomView);
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
  const selectedPrayerMomentId = prayerMomentId;
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
  const communityScrollRef = useRef<FlatList<CommunityFeedRow> | null>(null);
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
  const todaysCheckIn = checkInExistsForDay([...state.checkIns, ...state.privateCheckIns], state.currentUserId, state.currentGroupId, todayKey) || submittedCheckInKey === currentCheckInKey;
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const userImageById = useMemo(() => new Map(state.users.map((user) => [user.id, user.image])), [state.users]);
  const prayerReactionsByTarget = useMemo(() => {
    const byTarget = new Map<string, PrayerReaction[]>();
    state.prayerReactions.forEach((reaction) => {
      const key = `${reaction.targetType}:${reaction.targetId}`;
      const items = byTarget.get(key) ?? [];
      items.push(reaction);
      byTarget.set(key, items);
    });
    return byTarget;
  }, [state.prayerReactions]);
  const postReactionsByTarget = useMemo(() => {
    const byTarget = new Map<string, PostReaction[]>();
    state.postReactions.forEach((reaction) => {
      const key = `${reaction.targetType}:${reaction.targetId}:${reaction.kind}`;
      const items = byTarget.get(key) ?? [];
      items.push(reaction);
      byTarget.set(key, items);
    });
    return byTarget;
  }, [state.postReactions]);
  const repliesByTarget = useMemo(() => {
    const byTarget = new Map<string, Reply[]>();
    state.replies.forEach((reply) => {
      const key = `${reply.targetType}:${reply.targetId}`;
      const items = byTarget.get(key) ?? [];
      items.push(reply);
      byTarget.set(key, items);
    });
    return byTarget;
  }, [state.replies]);
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
  const communityFeedRows = useMemo<CommunityFeedRow[]>(() => communityFeedLoading || communityFeedError || visibleFeedItems.length === 0 ? [] : [
    ...recentFeedItems.map((item): CommunityFeedRow => ({ type: "item", item })),
    { type: "endpoint" },
    ...(visibleEarlierFeedItems.length > 0 ? [
      { type: "earlierDivider" } as CommunityFeedRow,
      ...visibleEarlierFeedItems.map((item): CommunityFeedRow => ({ type: "item", item })),
      { type: "earlierEnd" } as CommunityFeedRow,
    ] : []),
  ], [communityFeedLoading, communityFeedError, visibleFeedItems, communityFeedClock, revealedEarlierCount]);
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

  useEffect(() => {
    setRoomView(routeRoomView);
  }, [routeRoomView]);

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
    // Prayer and check-ins stay in the mounted overview screen. On Android,
    // pushing either view onto the nested native stack can leave its view tree
    // present but its drawing surface blank until the tab is reselected.
    if (routeRoomView === "detail" && (nextView === "detail" || nextView === "prayer" || nextView === "checkins")) {
      setRoomView(nextView);
    } else if (nextView === "detail") {
      router.dismissTo("/(tabs)/community" as never);
    } else if (direction === "back" && navigation.canGoBack()) {
      router.back();
    } else if (nextView !== roomView) {
      router.navigate(`/(tabs)/community/${nextView}` as never);
    }
  }, [navigation, roomView, routeRoomView]);
  const openCheckInsView = useCallback(() => navigateToRoomView("checkins"), [navigateToRoomView]);
  const goBackFromRoomView = useCallback(() => {
    if (routeRoomView === "detail" && (roomView === "prayer" || roomView === "checkins")) {
      setRoomView("detail");
    } else if (navigation.canGoBack()) router.back();
    else router.replace("/(tabs)/community" as never);
    return true;
  }, [navigation, roomView, routeRoomView]);

  useEffect(() => {
    if (Platform.OS === "web" || routeRoomView !== "detail" || (roomView !== "prayer" && roomView !== "checkins")) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", goBackFromRoomView);
    return () => subscription.remove();
  }, [goBackFromRoomView, roomView, routeRoomView]);

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

    communityScrollRef.current?.scrollToOffset({ animated: false, offset: Math.max(0, pendingRestore.offset) });
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

      setPrayerMomentEncouragementDraft("");
      router.navigate({ pathname: "/(tabs)/community/prayerMomentDetail", params: { prayerMomentId: item.id } } as never);
      return;
    }
    router.push({
      pathname: "/community/[groupId]/prayers/[prayerRequestId]",
      params: { groupId: item.groupId, prayerRequestId: item.id },
    } as never);
  }

  function itemPrayerState(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    const reactions = prayerReactionsByTarget.get(`${targetType}:${item.id}`) ?? [];
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
    const reactions = postReactionsByTarget.get(`${targetType}:${item.id}:${kind}`) ?? [];
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
    return repliesByTarget.get(`${targetType}:${item.id}`) ?? [];
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
    if (todaysCheckIn || !state.privateCheckInsReady || !state.checkInDailyClaimsReady || !communityFeedReadyForGroup) return;
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
          ownsItem={item.userId === state.currentUserId}
          prayed={prayer.prayed}
          prayedBy={prayer.prayedBy}
          prayerCount={prayer.count}
          onOpen={() => openPrayerDetail(item, "detail")}
          onPray={() => prayForItem(item)}
          onEdit={() => editPost(item)}
          onDelete={() => deletePost(item)}
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

  const communityFeedCardRenderer = useRef<(item: FeedItem) => ReactNode>(renderCommunityFeedItem);
  communityFeedCardRenderer.current = renderCommunityFeedItem;
  const communityFeedCardVersion = useMemo(() => ({}), [
    state.currentGroupId, state.currentUserId, state.postReactions, state.prayerReactions,
    state.replies, state.users, t,
  ]);

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

  if (group?.migrationPending && roomView !== "rooms") {
    return <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <AppScreen topInset={false}>
        {roomView !== "detail" ? <FocusedScreenHeader onBack={goBackFromRoomView} title={group.name} /> : null}
        <Card style={{ gap: 20, padding: 20 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
            <RoomImage name={group.name} size={58} />
            <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900", flex: 1 }}>{group.name}</Text>
          </View>
          <CommunityEncryptionNotice group={group} />
          <SecondaryButton onPress={openRoomOverview}>{t("community.rooms.other")}</SecondaryButton>
        </Card>
      </AppScreen>
    </View>;
  }

  if (roomView === "prayerMomentDetail" && group) {
    if (!selectedPrayerMoment) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.cream }}>
          <AppScreen topInset={false}>
            <FocusedScreenHeader onBack={goBackFromRoomView} title={t("community.page.prayer")} />
            <Card>
              <BodyText muted>{t("community.prayer.unavailable")}</BodyText>
            </Card>
          </AppScreen>
        </View>
      );
    }

    return (
      <>
        <View style={{ flex: 1, backgroundColor: colors.cream }}>
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
        </View>
        <PrayerMoment target={prayerTarget} onClose={closePrayerMoment} onFinish={finishPrayerMoment} />
      </>
    );
  }

  if (roomView === "prayer" && group) {
    return (
      <>
        <View style={{ flex: 1, backgroundColor: colors.cream }}>
          <CommunityPrayerScreen
            communityName={group.name}
            filter={prayerFilter}
            onBack={goBackFromRoomView}
            onCreatePrayer={() => openComposer("prayer_request")}
            onEditPrayer={editPost}
            onDeletePrayer={deletePost}
            onFilter={setPrayerFilter}
            onOpenPrayer={openPrayerDetail}
            onPray={prayForItem}
            onPrayForSomeone={() => setMemberSelectVisible(true)}
            prayerPosts={visiblePrayerPosts}
            prayerState={itemPrayerState}
            currentUserId={state.currentUserId}
            feedError={communityFeedError}
            feedLoading={communityFeedLoading}
            feedOffline={communityFeedOffline}
            hasMore={state.communityContentHasMore}
            loadingMore={state.communityContentLoadingMore}
            onLoadMore={() => dispatch({ type: "loadOlderCommunityContent" })}
            userById={userById}
            userImageById={userImageById}
          />
        </View>
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
        <View style={{ flex: 1, backgroundColor: colors.cream }}>
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
            feedLoading={communityFeedLoading || !state.privateCheckInsReady || !state.checkInDailyClaimsReady}
            feedOffline={communityFeedOffline}
            hasMore={state.communityContentHasMore}
            loadingMore={state.communityContentLoadingMore}
            onLoadMore={() => dispatch({ type: "loadOlderCommunityContent" })}
            userById={userById}
            userImageById={userImageById}
          />
        </View>
        {communityCheckInModal}
        {feedEncouragementSheet}
      </>
    );
  }

  if (roomView === "members" && group) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.cream }}>
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
      </View>
    );
  }

  if (roomView === "detail" && group) {
    return (
      <>
        <View style={{ flex: 1, backgroundColor: colors.cream }}>
          <FlatList
            data={communityFeedRows}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            keyExtractor={(row) => row.type === "item" ? communityFeedItemKey(row.item) : row.type}
            renderItem={({ item: row }) => <View style={{ marginBottom: 12 }}>
              {row.type === "item" ? <MemoCommunityFeedCard item={row.item} renderRef={communityFeedCardRenderer} version={communityFeedCardVersion} />
                : row.type === "endpoint" ? <CommunityFeedEndpoint
                    communityName={group.name}
                    detailTab={detailTab}
                    onViewEarlier={(earlierFeedItems.length > 0 || state.communityContentHasMore) && visibleEarlierFeedItems.length === 0 ? revealEarlierActivity : undefined}
                    variant={recentFeedItems.length > 0 ? "caught-up" : "no-recent"}
                  />
                : row.type === "earlierDivider" ? <CommunityActivityDivider label={t("community.feed.earlierActivity")} />
                : hasMoreEarlierFeedItems || state.communityContentHasMore
                  ? <CommunityEarlierActivityAction loading={state.communityContentLoadingMore} onPress={revealEarlierActivity} />
                  : <CommunityActivityDivider label={t("community.feed.beginning")} />}
            </View>}
            contentContainerStyle={{ gap: 0, padding: 18, paddingBottom: tabContentClearance(insets.bottom) }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={restorePendingCommunityScroll}
            onScroll={handleCommunityScroll}
            onScrollBeginDrag={handleCommunityScrollBeginDrag}
            scrollEventThrottle={16}
            ref={communityScrollRef}
            ListHeaderComponent={<>
            <View style={{ gap: 12, marginBottom: 16 }}>
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

            <View style={{ gap: 12, marginBottom: 12 }}>
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
              ) : null}
            </View>
            </>}
          />
        </View>
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
      <View style={{ flex: 1, backgroundColor: colors.cream }}>
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
              {group.migrationPending ? <CommunityEncryptionNotice group={group} /> : <>
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
              </>}
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
                    {room.migrationPending ? t(room.migrationAwaitingApproval ? "community.encryption.approvalTitle" : "community.encryption.setupTitle") : communityMemberCount(roomMemberCount(state.groupMemberCounts, room.id), t)}
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
      </View>
    </>
  );
}

export const CommunityScreen = SettingsScreen;

export const RoomScreen = SettingsScreen;
