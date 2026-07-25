import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { AccessibilityInfo, ActivityIndicator, Animated, BackHandler, Image, PanResponder, Platform, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";
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
import type { BibleVerse, EntryKind, FeedItem, Group, GroupImage, HeartMood, Id, Membership, PostReactionKind, Reply } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  BottomSheet,
  Card,
  ExpandableBodyText,
  FilterChips,
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
import { normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { BrandWaveMotif } from "@/ui/brand-wave-motif";
import { useAppTranslation } from "@/ui/app-language";
import {
  communityActionLabel,
  communityDefaultFeedTitle,
  communityMemberCount,
  communityMoodScaleLabel,
  communityPrayerMomentCanonicalCopy,
  communityPrayerMomentDisplayCopy,
  communityPrayerFilterLabel,
  communityPrayerNoun,
  communityResponseNoun,
  communityRoomTabLabel,
  communitySystemError,
} from "@/ui/community-copy";
import { confirmAction } from "@/ui/confirm";
import { LinkPreviewContent } from "@/ui/link-preview";
import type { TranslationFunction } from "@/ui/localization";
import { PrayerActivity, type PrayerActivityEntry } from "@/ui/prayer-activity";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { SharedComposer } from "@/ui/shared-composer";
import {
  CommunityCardAction,
  CommunityCardResponseSummary,
  CommunityCheckInMood,
  CommunityFeedCard,
  PostCard,
} from "@/ui/post-card";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors, typography } from "@/ui/theme";

type RoomView = "rooms" | "detail" | "prayer" | "prayerDetail" | "checkins" | "members";
type RoomDetailTab = (typeof roomTabs)[number]["value"];
type PrayerFilter = (typeof prayerFilters)[number]["value"];
type TransitionDirection = "forward" | "back";
type CommunityMember = { id: Id; image?: GroupImage; name: string; role: "owner" | "member" };
type CommunityPrayerAssignment = { groupId: Id; memberId: Id; weekEndsAt: string; weekStartsAt: string };
type CommunityFeedRevealState = Record<Id, Partial<Record<RoomDetailTab, number>>>;
type CommunityPrayerIntent = {
  recipientImage?: GroupImage;
  recipientName?: string;
  recipientUserId?: Id;
  type: "pray_for_someone" | "pray_now";
};
type PendingPrayerPost = CommunityPrayerIntent & { completedAt: string };

const PRAYER_POST_NOTE_LIMIT = 280;
const COMMUNITY_RECENT_DAYS = 30;
const COMMUNITY_RECENT_ITEM_LIMIT = 20;
const COMMUNITY_EARLIER_PAGE_SIZE = 20;
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

function compareCommunityFeedItems(left: FeedItem, right: FeedItem) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  const leftIsValid = Number.isFinite(leftTime);
  const rightIsValid = Number.isFinite(rightTime);

  if (leftIsValid && rightIsValid && leftTime !== rightTime) return rightTime - leftTime;
  if (leftIsValid !== rightIsValid) return leftIsValid ? -1 : 1;
  return communityFeedItemKey(left).localeCompare(communityFeedItemKey(right));
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
  const [roomView, setRoomView] = useState<RoomView>("detail");
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>("forward");
  const roomViewRef = useRef<RoomView>("detail");
  const [detailTab, setDetailTab] = useState<RoomDetailTab>("recent");
  const [prayerFilter, setPrayerFilter] = useState<PrayerFilter>("open");
  const [joinSheetVisible, setJoinSheetVisible] = useState(false);
  const [manageSheetVisible, setManageSheetVisible] = useState(false);
  const [transferSheetVisible, setTransferSheetVisible] = useState(false);
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [currentGroupName, setCurrentGroupName] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [roomImageMessage, setRoomImageMessage] = useState("");
  const [cropSource, setCropSource] = useState<RoomImageCropSource>();
  const [roomImagePickerRequested, setRoomImagePickerRequested] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerKind, setComposerKind] = useState<EntryKind>("reflection");
  const [composerVisibility, setComposerVisibility] = useState<EntryVisibility>(visibility.room);
  const [composerTitle, setComposerTitle] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerVerses, setComposerVerses] = useState<BibleVerse[]>([]);
  const [editingPost, setEditingPost] = useState<Extract<FeedItem, { type: "post" }>>();
  const [selectedPrayerId, setSelectedPrayerId] = useState<Id>();
  const [prayerDetailReturnView, setPrayerDetailReturnView] = useState<"detail" | "prayer">("prayer");
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const [communityPrayerIntent, setCommunityPrayerIntent] = useState<CommunityPrayerIntent>();
  const [memberSelectVisible, setMemberSelectVisible] = useState(false);
  const [pendingPrayerPost, setPendingPrayerPost] = useState<PendingPrayerPost>();
  const [prayerPostNote, setPrayerPostNote] = useState("");
  const [encouragementDraft, setEncouragementDraft] = useState("");
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
  const transferableMemberships = useMemo(
    () => state.memberships.filter((membership) => membership.userId !== state.currentUserId && membership.role !== "owner"),
    [state.currentUserId, state.memberships],
  );
  const feedItems = useMemo<FeedItem[]>(() => {
    const checkIns: FeedItem[] = state.checkIns
      .filter((item) => item.groupId === state.currentGroupId && item.visibility === "group")
      .map((item) => ({
        type: "check_in",
        id: item.id,
        userId: item.userId,
        groupId: item.groupId,
        body: item.reflectionText,
        mood: item.mood,
        readToday: item.readToday,
        verse: item.verse,
        verses: item.verses,
        createdAt: item.createdAt,
      }));
    const posts: FeedItem[] = state.posts
      .filter((item) => item.groupId === state.currentGroupId)
      .map((item) => ({
        type: "post",
        id: item.id,
        userId: item.userId,
        groupId: item.groupId,
        kind: item.kind,
        title: item.title,
        body: item.body,
        verse: item.verse,
        verses: item.verses,
        images: item.images,
        answeredAt: item.answeredAt,
        answeredMarkedAt: item.answeredMarkedAt,
        createdAt: item.createdAt,
      }));
    return [...checkIns, ...posts].sort(compareCommunityFeedItems);
  }, [state.checkIns, state.currentGroupId, state.posts]);
  const visibleFeedItems = useMemo(() => {
    if (detailTab === "prayer") {
      return feedItems.filter((item) => item.type === "post" && isPrayerFeedKind(item.kind));
    }
    if (detailTab === "checkins") {
      return feedItems.filter((item) => item.type === "check_in");
    }
    if (detailTab === "reflections") {
      return feedItems.filter((item) => item.type === "post" && normalizeEntryKind(item.kind) === "reflection");
    }
    return feedItems;
  }, [detailTab, feedItems]);
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
  const communityFeedLoading = Boolean(group && !communityFeedReadyForGroup && !communityFeedError);
  const communityScrollKey = group ? `${group.id}:${detailTab}` : undefined;
  const prayerPosts = feedItems.filter(
    (item): item is Extract<FeedItem, { type: "post" }> => item.type === "post" && isPrayerFeedKind(item.kind),
  );
  const selectedPrayer = prayerPosts.find((item) => item.id === selectedPrayerId);
  const visiblePrayerPosts = prayerPosts.filter((item) => {
    if (item.type !== "post") return false;
    const prayerMoment = isPrayerMomentKind(item.kind);
    if (prayerFilter === "open") return prayerMoment || !item.answeredAt;
    if (prayerFilter === "answered") return !prayerMoment && Boolean(item.answeredAt);
    return true;
  });
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
  const canRename = Boolean(ownsGroup && group && currentGroupName.trim() && currentGroupName.trim() !== group.name);

  useFocusEffect(
    useCallback(() => {
      setCommunityFeedClock(Date.now());
    }, []),
  );

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
      if (roomViewRef.current !== "detail") {
        setTransitionDirection("back");
      }
      setRoomView("detail");
      setSelectedPrayerId(undefined);
      setPrayerDetailReturnView("prayer");
      setEncouragementDraft("");
      setMemberSelectVisible(false);
      setPendingPrayerPost(undefined);
      setPrayerPostNote("");
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

  const goBackFromRoomView = useCallback(() => {
    if (roomView === "prayerDetail") {
      navigateToRoomView(prayerDetailReturnView, "back");
      return true;
    }
    if (roomView === "prayer" || roomView === "checkins" || roomView === "members" || roomView === "rooms") {
      navigateToRoomView("detail", "back");
      return true;
    }
    return false;
  }, [navigateToRoomView, prayerDetailReturnView, roomView]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => goBackFromRoomView());
    return () => subscription.remove();
  }, [goBackFromRoomView]);

  function openComposer(kind: EntryKind = "reflection") {
    setEditingPost(undefined);
    setComposerKind(kind);
    setComposerVisibility(visibility.room);
    setComposerTitle("");
    setComposerBody("");
    setComposerVerses([]);
    setComposerVisible(true);
  }

  function editPost(item: Extract<FeedItem, { type: "post" }>) {
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
    if (!composerBody.trim()) return;
    if (editingPost) {
      await dispatch({ type: "editPost", id: editingPost.id, kind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses });
    } else if (composerVisibility === visibility.private) {
      await dispatch({ type: "createJournalEntry", entryKind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses, shareWithGroup: false });
    } else {
      await dispatch({ type: "createPost", kind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses });
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

    communityScrollRef.current?.scrollTo({ animated: false, y: pendingRestore.offset });
  }

  function handleCommunityScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!communityScrollKey) return;
    const offset = event.nativeEvent.contentOffset.y;
    const pendingRestore = pendingCommunityScrollRestoreRef.current;
    if (pendingRestore?.key === communityScrollKey) {
      if (Math.abs(offset - pendingRestore.offset) <= 2 || offset >= pendingRestore.offset - 2) {
        pendingCommunityScrollRestoreRef.current = undefined;
        communityScrollOffsetsRef.current[communityScrollKey] = offset;
      }
      return;
    }

    communityScrollOffsetsRef.current[communityScrollKey] = offset;
  }

  function handleCommunityScrollBeginDrag() {
    const pendingRestore = pendingCommunityScrollRestoreRef.current;
    if (pendingRestore?.key === communityScrollKey) {
      pendingCommunityScrollRestoreRef.current = undefined;
    }
  }

  function revealEarlierActivity() {
    if (!group || earlierFeedItems.length === 0) return;

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
    setSelectedPrayerId(item.id);
    setPrayerDetailReturnView(returnView);
    setEncouragementDraft("");
    navigateToRoomView("prayerDetail");
  }

  function itemPrayerState(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    const reactions = state.prayerReactions.filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id);
    const prayedByUserIds = [...new Set(reactions.map((reaction) => reaction.userId))];
    return {
      prayed: reactions.some((reaction) => reaction.userId === state.currentUserId),
      count: reactions.length,
      targetType,
      prayedBy: prayedByUserIds.map((userId) => ({ name: userById.get(userId) ?? t("common.someone"), image: userImageById.get(userId) })),
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

  function itemPrayerActivity(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    return state.prayerReactions
      .filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((reaction) => ({
        id: reaction.id,
        createdAt: reaction.createdAt,
        durationSeconds:
          reaction.durationSeconds ??
          (reaction.startedAt && reaction.completedAt ? Math.max(0, Math.floor((Date.parse(reaction.completedAt) - Date.parse(reaction.startedAt)) / 1000)) : undefined),
        name: reaction.userId === state.currentUserId ? t("common.you") : userById.get(reaction.userId) ?? t("common.someone"),
        image: userImageById.get(reaction.userId),
      }));
  }

  function prayForItem(item: FeedItem) {
    const prayer = itemPrayerState(item);
    const displayBody = item.type === "post" ? communityPrayerMomentDisplayCopy(item, t).body : item.body;
    setCommunityPrayerIntent(undefined);
    setPrayerTarget({
      targetType: prayer.targetType,
      targetId: item.id,
      body: displayBody,
      recipientUserId: item.userId,
      recipientName: userById.get(item.userId),
      recipientImage: userImageById.get(item.userId),
    });
  }

  function startCommunityPrayer(intent: CommunityPrayerIntent) {
    const targetId = intent.recipientUserId ?? state.currentUserId;
    if (!targetId) return;

    setCommunityPrayerIntent(intent);
    setPrayerTarget({
      targetType: "user",
      targetId,
      body: "",
      recipientUserId: targetId,
      recipientName: userById.get(targetId),
      recipientImage: userImageById.get(targetId),
    });
  }

  function closePrayerMoment() {
    setPrayerTarget(undefined);
    setCommunityPrayerIntent(undefined);
  }

  async function finishPrayerMoment(status: "completed" | "skipped", startedAt: string, completedAt: string) {
    const target = prayerTarget;
    const intent = communityPrayerIntent;

    setPrayerTarget(undefined);
    setCommunityPrayerIntent(undefined);

    if (target) {
      await dispatch({
        type: "finishPrayer",
        targetType: target.targetType,
        targetId: target.targetId,
        status,
        startedAt,
        recipientUserId: target.recipientUserId,
      });
    }

    if (status === "completed" && intent) {
      setPrayerPostNote("");
      setPendingPrayerPost({ ...intent, completedAt });
    }
  }

  async function publishPendingPrayerPost(noteOverride = prayerPostNote) {
    const pending = pendingPrayerPost;
    if (!pending) return;

    setPendingPrayerPost(undefined);
    setPrayerPostNote("");

    const copy = communityPrayerMomentCanonicalCopy(pending.recipientName, noteOverride);
    await dispatch({
      type: "createPost",
      kind: "prayer_moment",
      title: copy.title,
      body: copy.body,
    });
    setPrayerFilter("open");
    navigateToRoomView("prayer");
  }

  function togglePostAction(item: FeedItem) {
    const reaction = itemReactionState(item);
    dispatch({ type: "togglePostReaction", targetType: reaction.targetType, targetId: item.id, kind: reaction.kind });
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

  async function sendEncouragement(item: FeedItem) {
    const body = encouragementDraft.trim();
    if (!body) return;
    await dispatch({ type: "createReply", targetType: item.type === "post" ? "post" : "check_in", targetId: item.id, body });
    setEncouragementDraft("");
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

  async function handleRenameRoom() {
    if (!group || !canRename) return;
    await dispatch({ type: "updateGroup", id: group.id, name: currentGroupName });
    setManageSheetVisible(false);
  }

  useEffect(() => {
    if (!roomImagePickerRequested) return;

    const timer = setTimeout(() => {
      void openRoomImagePicker();
    }, Platform.OS === "ios" ? 500 : 250);

    return () => clearTimeout(timer);
  }, [roomImagePickerRequested]);

  async function selectedImageSize(asset: ImagePicker.ImagePickerAsset) {
    if (asset.width > 0 && asset.height > 0) {
      return { height: asset.height, width: asset.width };
    }

    return new Promise<{ height: number; width: number }>((resolve, reject) => {
      Image.getSize(
        asset.uri,
        (width, height) => resolve({ height, width }),
        () => reject(new Error(t("community.management.imageReadError"))),
      );
    });
  }

  function handleChooseRoomImage() {
    if (!group || !ownsGroup) return;
    setRoomImageMessage("");
    setManageSheetVisible(false);
    setRoomImagePickerRequested(true);
  }

  async function openRoomImagePicker() {
    setRoomImagePickerRequested(false);

    try {
      if (!group || !ownsGroup) return;

      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setRoomImageMessage(t("community.management.imagePermission"));
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 1,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        setRoomImageMessage(t("community.management.imageReadError"));
        return;
      }

      const size = await selectedImageSize(asset);
      setCropSource({ ...size, uri: asset.uri });
    } catch {
      setRoomImageMessage(t("community.management.imageOpenError"));
    }
  }

  async function handleSaveRoomImage(localUri: string) {
    if (!group) return;
    await dispatch({ type: "uploadGroupImage", id: group.id, localUri });
    setCropSource(undefined);
    setRoomImageMessage(t("community.management.imageUpdated"));
  }

  function handleDeleteRoomImage() {
    if (!group?.image || !ownsGroup) return;
    setManageSheetVisible(false);
    confirmAction({
      title: t("community.management.deleteImageTitle"),
      message: t("community.management.deleteImageBody"),
      confirmText: t("common.delete"),
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "deleteGroupImage", id: group.id })
          .then(() => setRoomImageMessage(t("community.management.imageDeleted")))
          .catch(() => setRoomImageMessage(t("community.management.imageDeleteError")));
      },
    });
  }

  function handleLeaveRoom() {
    if (!group) return;
    setManageSheetVisible(false);
    confirmAction({
      title: t("community.management.leaveTitle"),
      message: t("community.management.leaveBody", { name: group.name }),
      confirmText: t("community.management.leave"),
      destructive: true,
      onConfirm: () => dispatch({ type: "leaveGroup", id: group.id }),
    });
  }

  function handleDeleteRoom() {
    if (!group) return;
    setManageSheetVisible(false);
    confirmAction({
      title: t("community.management.deleteTitle"),
      message: t("community.management.deleteBody"),
      confirmText: t("common.delete"),
      destructive: true,
      onConfirm: () => dispatch({ type: "deleteGroup", id: group.id }),
    });
  }

  function openTransferOwnership() {
    if (!ownsGroup) return;
    setManageSheetVisible(false);
    setTransferSheetVisible(true);
  }

  function handleTransferOwnership(membership: Membership) {
    if (!group || !ownsGroup || membership.userId === state.currentUserId || membership.role === "owner") return;

    setTransferSheetVisible(false);
    confirmAction({
      title: t("community.management.transferTitle"),
      message: t("community.management.transferBody", { community: group.name, name: membership.userName }),
      confirmText: t("community.management.transfer"),
      onConfirm: () => {
        void dispatch({ type: "transferGroupOwnership", groupId: group.id, userId: membership.userId })
          .then(() => setRoomImageMessage(t("community.management.transferSuccess", { name: membership.userName })))
          .catch(() => setRoomImageMessage(t("community.management.transferError")));
      },
    });
  }

  async function handleSignOut() {
    setJoinSheetVisible(false);
    setManageSheetVisible(false);
    await dispatch({ type: "signOut" });
    router.replace("/");
  }

  function openRoomOverview() {
    navigateToRoomView("rooms");
    setJoinSheetVisible(false);
    setManageSheetVisible(false);
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
        startCommunityPrayer({
          recipientImage: member.image,
          recipientName: member.name,
          recipientUserId: member.id,
          type: "pray_for_someone",
        });
      }}
      visible={memberSelectVisible}
    />
  ) : null;

  const communityPrayerPostSheet = (
    <PrayerPostSheet
      note={prayerPostNote}
      onChangeNote={(value) => setPrayerPostNote(value.slice(0, PRAYER_POST_NOTE_LIMIT))}
      onPublish={() => publishPendingPrayerPost()}
      onSkip={() => publishPendingPrayerPost("")}
      pending={pendingPrayerPost}
    />
  );

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
            userById={userById}
            userImageById={userImageById}
          />
        </CommunityTransitionFrame>
        <SharedComposer
          visible={composerVisible}
          context="room"
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
        {communityPrayerPostSheet}
      </>
    );
  }

  if (roomView === "prayerDetail" && group) {
    if (!selectedPrayer) {
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

    const prayer = itemPrayerState(selectedPrayer);
    return (
      <>
        <CommunityTransitionFrame animationKey={roomView} canSwipeBack direction={transitionDirection} onSwipeBack={goBackFromRoomView}>
          <CommunityPrayerDetailScreen
            activity={itemPrayerActivity(selectedPrayer)}
            authorImage={userImageById.get(selectedPrayer.userId)}
            authorName={userById.get(selectedPrayer.userId) ?? t("common.someone")}
            encouragementDraft={encouragementDraft}
            item={selectedPrayer}
            onBack={goBackFromRoomView}
            onChangeEncouragement={setEncouragementDraft}
            onMarkAnswered={() => dispatch({ type: "markPrayerAnswered", id: selectedPrayer.id })}
            onPray={() => prayForItem(selectedPrayer)}
            onSendEncouragement={() => sendEncouragement(selectedPrayer)}
            ownsItem={selectedPrayer.userId === state.currentUserId}
            prayer={prayer}
            replies={itemReplies(selectedPrayer)}
            userById={userById}
            userImageById={userImageById}
          />
        </CommunityTransitionFrame>
        <PrayerMoment
          target={prayerTarget}
          onClose={closePrayerMoment}
          onFinish={finishPrayerMoment}
        />
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
            onOpenCheckIn={(item) => router.push(`/feed/${item.type}/${item.id}` as never)}
            onReact={togglePostAction}
            reactionState={itemReactionState}
            userById={userById}
            userImageById={userImageById}
          />
        </CommunityTransitionFrame>
        {communityCheckInModal}
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
            onManage={() => {
              setCurrentGroupName(group.name);
              setManageSheetVisible(true);
              navigateToRoomView("detail", "back");
            }}
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
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("community.detail.openCommunityDetails", {
                    memberCount: communityMemberCount(memberCount, t),
                    name: group.name,
                  })}
                  onPress={() => router.push("/room-details" as never)}
                  style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: 10, minWidth: 0 }}
                >
                  <RoomImage image={group.image} name={group.name} size={44} />
                  <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>{group.name}</Text>
                    <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>
                      {communityMemberCount(memberCount, t)} · {t("common.private")}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={17} color={colors.muted} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("community.management.open")}
                  onPress={() => {
                    setCurrentGroupName(group.name);
                    setManageSheetVisible(true);
                  }}
                  style={{ alignItems: "center", backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 999, borderWidth: 1, height: 38, justifyContent: "center", width: 38 }}
                >
                  <Feather name="more-horizontal" size={20} color={colors.ink} />
                </Pressable>
              </View>

              <CommunityPrayerActions
                groupId={group.id}
                members={otherCommunityMembers}
                onPrayForPerson={(assignedMember) => {
                  if (!assignedMember) {
                    setMemberSelectVisible(true);
                    return;
                  }

                  startCommunityPrayer({
                    recipientImage: assignedMember.image,
                    recipientName: assignedMember.name,
                    recipientUserId: assignedMember.id,
                    type: "pray_for_someone",
                  });
                }}
                onPrayForRequests={() => {
                  setPrayerFilter("open");
                  navigateToRoomView("prayer");
                }}
              />

              <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
                <SectionHeading>
                  {detailTab === "recent" ? t("community.feed.recentActivity") : communityRoomTabLabel(detailTab, t)}
                </SectionHeading>
                {detailTab === "prayer" ? (
                  <PrimaryButton icon="heart" onPress={() => navigateToRoomView("prayer")} style={{ minHeight: 38, paddingHorizontal: 12 }}>
                    {t("community.feed.openPrayer")}
                  </PrimaryButton>
                ) : detailTab === "checkins" ? (
                  <PrimaryButton icon="check-circle" onPress={() => navigateToRoomView("checkins")} style={{ minHeight: 38, paddingHorizontal: 12 }}>
                    {t("community.feed.openCheckIns")}
                  </PrimaryButton>
                ) : (
                  <PrimaryButton icon="edit-3" onPress={() => openComposer("reflection")} style={{ minHeight: 38, paddingHorizontal: 12 }}>
                    {t("community.feed.share")}
                  </PrimaryButton>
                )}
              </View>

              <FilterChips
                fit
                value={detailTab}
                onChange={handleCommunityTabChange}
                options={roomTabs.map((tab) => ({ label: communityRoomTabLabel(tab.value, t), value: tab.value }))}
              />
            </View>

            <View style={{ gap: 12 }}>
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
                    onViewEarlier={earlierFeedItems.length > 0 && visibleEarlierFeedItems.length === 0 ? revealEarlierActivity : undefined}
                    variant={recentFeedItems.length > 0 ? "caught-up" : "no-recent"}
                  />
                  {visibleEarlierFeedItems.length > 0 ? (
                    <>
                      <CommunityActivityDivider label={t("community.feed.earlierActivity")} />
                      {visibleEarlierFeedItems.map(renderCommunityFeedItem)}
                      {hasMoreEarlierFeedItems ? (
                        <CommunityEarlierActivityAction onPress={revealEarlierActivity} />
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
          context="room"
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
        {communityPrayerPostSheet}
        <BottomSheet title={t("community.management.settingsTitle")} visible={manageSheetVisible} onClose={() => setManageSheetVisible(false)}>
          <Card style={{ gap: 0, padding: 0 }}>
            <View style={{ paddingHorizontal: 14 }}>
              <Row icon="edit-2" onPress={ownsGroup ? handleRenameRoom : undefined}>
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.management.rename")}</Text>
                <TextInputField value={currentGroupName} onChangeText={setCurrentGroupName} onSubmitEditing={handleRenameRoom} placeholder={t("community.management.namePlaceholder")} returnKeyType="done" style={{ marginTop: 8 }} />
                {ownsGroup ? <Text style={{ color: canRename ? colors.gold : colors.muted, fontSize: 12, fontWeight: "700" }}>{t("community.management.renameHint")}</Text> : null}
              </Row>
            </View>
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <View style={{ paddingHorizontal: 14 }}>
              <Row icon="image" onPress={ownsGroup ? handleChooseRoomImage : undefined}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                  <RoomImage image={group.image} name={group.name} size={42} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>
                      {t(group.image ? "community.management.changeImage" : "community.management.addImage")}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                      {t(ownsGroup ? "community.management.imageOwnerHint" : "community.management.ownerOnlyChange")}
                    </Text>
                  </View>
                </View>
              </Row>
            </View>
            {group.image ? (
              <>
                <View style={{ backgroundColor: colors.line, height: 1 }} />
                <Pressable accessibilityRole="button" onPress={handleDeleteRoomImage} disabled={!ownsGroup} style={{ opacity: ownsGroup ? 1 : 0.45, paddingHorizontal: 14 }}>
                  <Row icon="trash-2" tone="danger">
                    <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>{t("community.management.deleteImage")}</Text>
                    <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{t("community.management.deleteImageHint")}</Text>
                  </Row>
                </Pressable>
              </>
            ) : null}
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <View style={{ paddingHorizontal: 14 }}>
              <Row icon="user-check" onPress={ownsGroup ? openTransferOwnership : undefined}>
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.management.transfer")}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {t(ownsGroup ? "community.management.transferHint" : "community.management.ownerOnlyTransfer")}
                </Text>
              </Row>
            </View>
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <Pressable accessibilityRole="button" onPress={handleLeaveRoom} disabled={ownsGroup} style={{ opacity: ownsGroup ? 0.45 : 1, paddingHorizontal: 14 }}>
              <Row icon="log-out">
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.management.leave")}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{t("community.management.leaveHint")}</Text>
              </Row>
            </Pressable>
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <Pressable accessibilityRole="button" onPress={handleDeleteRoom} disabled={!ownsGroup} style={{ opacity: ownsGroup ? 1 : 0.45, paddingHorizontal: 14 }}>
              <Row icon="trash-2" tone="danger">
                <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>{t("community.management.delete")}</Text>
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{t("community.management.deleteHint")}</Text>
              </Row>
            </Pressable>
          </Card>
          <SecondaryButton onPress={() => setManageSheetVisible(false)}>{t("common.cancel")}</SecondaryButton>
        </BottomSheet>
        <BottomSheet title={t("community.management.transfer")} visible={transferSheetVisible} onClose={() => setTransferSheetVisible(false)}>
          <BodyText muted>{t("community.management.transferChoose")}</BodyText>
          <TransferOwnershipList memberships={transferableMemberships} onTransfer={handleTransferOwnership} />
        </BottomSheet>
        <RoomImageCropper source={cropSource} title={t("community.management.cropImage")} visible={Boolean(cropSource)} onCancel={() => setCropSource(undefined)} onSave={handleSaveRoomImage} />
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
              {roomImageMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{roomImageMessage}</Text> : null}
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

      {group ? (
        <SecondaryButton
          icon="settings"
          onPress={() => {
            setCurrentGroupName(group.name);
            setManageSheetVisible(true);
          }}
        >
          {t("community.management.settingsTitle")}
        </SecondaryButton>
      ) : null}

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

      <BottomSheet title={t("community.management.settingsTitle")} visible={manageSheetVisible && Boolean(group)} onClose={() => setManageSheetVisible(false)}>
        <Card style={{ gap: 0, padding: 0 }}>
          <View style={{ paddingHorizontal: 14 }}>
            <Row icon="edit-2" onPress={ownsGroup ? handleRenameRoom : undefined}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.management.rename")}</Text>
              <TextInputField value={currentGroupName} onChangeText={setCurrentGroupName} onSubmitEditing={handleRenameRoom} placeholder={t("community.management.namePlaceholder")} returnKeyType="done" style={{ marginTop: 8 }} />
              {ownsGroup ? <Text style={{ color: canRename ? colors.gold : colors.muted, fontSize: 12, fontWeight: "700" }}>{t("community.management.renameHint")}</Text> : null}
            </Row>
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <View style={{ paddingHorizontal: 14 }}>
            <Row icon="image" onPress={ownsGroup ? handleChooseRoomImage : undefined}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <RoomImage image={group?.image} name={group?.name} size={42} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>
                    {t(group?.image ? "community.management.changeImage" : "community.management.addImage")}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                    {t(ownsGroup ? "community.management.imageOwnerHint" : "community.management.ownerOnlyChange")}
                  </Text>
                </View>
              </View>
            </Row>
          </View>
          {group?.image ? (
            <>
              <View style={{ backgroundColor: colors.line, height: 1 }} />
              <Pressable accessibilityRole="button" onPress={handleDeleteRoomImage} disabled={!ownsGroup} style={{ opacity: ownsGroup ? 1 : 0.45, paddingHorizontal: 14 }}>
                <Row icon="trash-2" tone="danger">
                  <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>{t("community.management.deleteImage")}</Text>
                  <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{t("community.management.deleteImageHint")}</Text>
                </Row>
              </Pressable>
            </>
          ) : null}
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <View style={{ paddingHorizontal: 14 }}>
            <Row icon="user-check" onPress={ownsGroup ? openTransferOwnership : undefined}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.management.transfer")}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                {t(ownsGroup ? "community.management.transferHint" : "community.management.ownerOnlyTransfer")}
              </Text>
            </Row>
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Pressable accessibilityRole="button" onPress={handleLeaveRoom} disabled={ownsGroup} style={{ opacity: ownsGroup ? 0.45 : 1, paddingHorizontal: 14 }}>
            <Row icon="log-out">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.management.leave")}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{t("community.management.leaveHint")}</Text>
            </Row>
          </Pressable>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Pressable accessibilityRole="button" onPress={handleDeleteRoom} disabled={!ownsGroup} style={{ opacity: ownsGroup ? 1 : 0.45, paddingHorizontal: 14 }}>
            <Row icon="trash-2" tone="danger">
              <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>{t("community.management.delete")}</Text>
              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{t("community.management.deleteHint")}</Text>
            </Row>
          </Pressable>
        </Card>
        <SecondaryButton onPress={() => setManageSheetVisible(false)}>{t("common.cancel")}</SecondaryButton>
      </BottomSheet>
      <BottomSheet title={t("community.management.transfer")} visible={transferSheetVisible} onClose={() => setTransferSheetVisible(false)}>
        <BodyText muted>{t("community.management.transferChoose")}</BodyText>
        <TransferOwnershipList memberships={transferableMemberships} onTransfer={handleTransferOwnership} />
      </BottomSheet>
        </AppScreen>
      </CommunityTransitionFrame>
      <RoomImageCropper source={cropSource} title={t("community.management.cropImage")} visible={Boolean(cropSource)} onCancel={() => setCropSource(undefined)} onSave={handleSaveRoomImage} />
    </>
  );
}

export const CommunityScreen = SettingsScreen;
export const RoomScreen = SettingsScreen;

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
      <BrandWaveMotif height={12} opacity={0.65} variant="accent" width={58} />
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

function CommunityEarlierActivityAction({ onPress }: { onPress: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Pressable
      accessibilityLabel={t("community.feed.viewMoreEarlier")}
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", alignSelf: "center", flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 }}
    >
      <Text style={[typography.label, { color: colors.olive }]}>{t("common.viewMore")}</Text>
      <Feather name="chevron-down" size={16} color={colors.olive} />
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

  useEffect(() => {
    translateX.setValue(direction === "forward" ? entryOffset : -entryOffset);
    Animated.timing(translateX, {
      duration: 220,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [animationKey, direction, entryOffset, translateX]);

  const opacity = translateX.interpolate({
    inputRange: [-entryOffset, 0, width],
    outputRange: [0.9, 1, 0.72],
    extrapolate: "clamp",
  });

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
            Animated.timing(translateX, {
              duration: 180,
              toValue: width,
              useNativeDriver: true,
            }).start(() => {
              onSwipeBack?.();
            });
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
      }),
    [canSwipeBack, onSwipeBack, translateX, width],
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
        numberOfLines={1}
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
    <View style={{ alignItems: "stretch", flexDirection: "row", gap: 8 }}>
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
        minWidth: 0,
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
        <Text numberOfLines={2} style={{ color: titleColor, fontSize: 13, fontWeight: "900", lineHeight: 16 }}>
          {title}
        </Text>
        <Text numberOfLines={2} style={{ color: subtitleColor, fontSize: 11, fontWeight: "700", lineHeight: 13 }}>
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

function PrayerPostSheet({
  note,
  onChangeNote,
  onPublish,
  onSkip,
  pending,
}: {
  note: string;
  onChangeNote: (value: string) => void;
  onPublish: () => void;
  onSkip: () => void;
  pending?: PendingPrayerPost;
}) {
  const { t } = useAppTranslation();
  const recipientName = pending?.recipientName?.trim();

  return (
    <BottomSheet title={t("community.prayer.share")} visible={Boolean(pending)} onClose={onSkip}>
      {recipientName ? (
        <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
          <Avatar image={pending?.recipientImage} name={recipientName} size={38} tone="green" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{recipientName}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{t("community.prayer.postForPerson")}</Text>
          </View>
        </Card>
      ) : null}
      <View style={{ gap: 6 }}>
        <TextInputField
          maxLength={PRAYER_POST_NOTE_LIMIT}
          multiline
          onChangeText={onChangeNote}
          placeholder={t("community.prayer.notePlaceholder")}
          returnKeyType="done"
          style={{ minHeight: 120 }}
          value={note}
        />
        <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>{note.length}/{PRAYER_POST_NOTE_LIMIT}</Text>
      </View>
      <PrimaryButton icon="send" onPress={onPublish}>
        {t("community.prayer.post")}
      </PrimaryButton>
      <SecondaryButton onPress={onSkip}>{t("community.prayer.skipNote")}</SecondaryButton>
    </BottomSheet>
  );
}

function CommunityPrayerScreen({
  communityName,
  filter,
  onBack,
  onCreatePrayer,
  onFilter,
  onOpenPrayer,
  onPray,
  onPrayForSomeone,
  prayerPosts,
  prayerState,
  userById,
  userImageById,
}: {
  communityName: string;
  filter: PrayerFilter;
  onBack: () => void;
  onCreatePrayer: () => void;
  onFilter: (filter: PrayerFilter) => void;
  onOpenPrayer: (item: Extract<FeedItem, { type: "post" }>) => void;
  onPray: (item: FeedItem) => void;
  onPrayForSomeone: () => void;
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
    <AppScreen topInset={false}>
      <FocusedCommunityScreenIntro
        communityName={communityName}
        description={t("community.prayer.pageDescription")}
        onBack={onBack}
        title={t("community.page.prayer")}
      />
      <FilterChips
        value={filter}
        onChange={onFilter}
        options={prayerFilters.map((item) => ({ label: communityPrayerFilterLabel(item.value, t), value: item.value }))}
      />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
        <BodyText muted>{t(prayerCountKey, { count: prayerPosts.length })}</BodyText>
        <PrimaryButton icon="heart" onPress={onCreatePrayer} style={{ minHeight: 42, paddingHorizontal: 14 }}>
          {t("community.prayer.share")}
        </PrimaryButton>
      </View>
      <SecondaryButton icon="users" onPress={onPrayForSomeone} style={{ minHeight: 42 }}>
        {t("community.prayer.prayForSomeone")}
      </SecondaryButton>
      {prayerPosts.length === 0 ? (
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
    </AppScreen>
  );
}

function CommunityPrayerDetailScreen({
  activity,
  authorImage,
  authorName,
  encouragementDraft,
  item,
  onBack,
  onChangeEncouragement,
  onMarkAnswered,
  onPray,
  onSendEncouragement,
  ownsItem,
  prayer,
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
  onMarkAnswered: () => void;
  onPray: () => void;
  onSendEncouragement: () => void;
  ownsItem: boolean;
  prayer: { prayed: boolean; count: number; prayedBy: { name: string; image?: GroupImage }[] };
  replies: Reply[];
  userById: Map<Id, string>;
  userImageById: Map<Id, GroupImage | undefined>;
}) {
  const { language, t } = useAppTranslation();
  const answered = Boolean(item.answeredAt);
  const prayerMoment = isPrayerMomentKind(item.kind);
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
      {prayerMoment ? (
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
      ) : (
        <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 14 }}>
          <View style={{ alignItems: "center", flex: 1, gap: 3 }}>
            <Text style={{ color: colors.gold, fontSize: 18, fontWeight: "900" }}>{prayer.count}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{communityPrayerNoun(prayer.count, t)}</Text>
          </View>
          <View style={{ backgroundColor: colors.line, height: 34, width: 1 }} />
          <View style={{ alignItems: "center", flex: 1, gap: 3 }}>
            <StatusPill status={answered ? "answered" : "open"} />
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{t("community.prayer.status.label")}</Text>
          </View>
        </Card>
      )}
      {answered ? (
        <Card style={{ backgroundColor: colors.mossSurface, gap: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
            <Feather name="check-circle" size={20} color={colors.olive} />
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{t("community.prayer.answeredTitle")}</Text>
          </View>
          <BodyText muted>
            {t("community.prayer.markedAnswered", { time: formatRelativeTime(item.answeredAt ?? item.createdAt, language) })}
          </BodyText>
        </Card>
      ) : null}
      {!answered && !prayerMoment ? (
        <PrayerActionButton onPress={onPray} prayed={prayer.prayed} />
      ) : null}
      {ownsItem && !answered && !prayerMoment ? (
        <SecondaryButton icon="check-circle" onPress={onMarkAnswered}>
          {t("community.prayer.markAnswered")}
        </SecondaryButton>
      ) : null}
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
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{userById.get(reply.userId) ?? t("common.someone")}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(reply.createdAt, language)}</Text>
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
          onSubmitEditing={onSendEncouragement}
          placeholder={t("community.reply.encouragementPlaceholder")}
          returnKeyType="send"
          style={{ flex: 1 }}
        />
        <Pressable
          accessibilityLabel={t("community.reply.send")}
          accessibilityRole="button"
          disabled={!encouragementDraft.trim()}
          onPress={onSendEncouragement}
          style={{ alignItems: "center", height: 48, justifyContent: "center", opacity: encouragementDraft.trim() ? 1 : 0.4, width: 48 }}
        >
          <Feather name="send" size={22} color={colors.gold} />
        </Pressable>
      </View>
      <PrayerActivity activity={activity} />
    </AppScreen>
  );
}

function PrayerActionButton({ onPress, prayed }: { onPress: () => void; prayed: boolean }) {
  const { t } = useAppTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: prayed ? colors.prayerSoft : colors.gold,
        borderColor: prayed ? colors.accentPrayer : colors.gold,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        minHeight: 54,
        paddingHorizontal: 18,
      }}
    >
      <MaterialCommunityIcons name="hands-pray" size={21} color={prayed ? colors.textMuted : colors.onAccent} />
      <Text style={{ color: prayed ? colors.textMuted : colors.onAccent, fontSize: 16, fontWeight: "900" }}>
        {communityActionLabel("prayer_request", prayed, t)}
      </Text>
    </Pressable>
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
  onBack,
  onCheckIn,
  onOpenCheckIn,
  onReact,
  reactionState,
  userById,
  userImageById,
}: {
  checkIns: Extract<FeedItem, { type: "check_in" }>[];
  checkedInToday: boolean;
  communityName: string;
  onBack: () => void;
  onCheckIn: () => void;
  onOpenCheckIn: (item: Extract<FeedItem, { type: "check_in" }>) => void;
  onReact: (item: FeedItem) => void;
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
    <AppScreen topInset={false}>
      <FocusedCommunityScreenIntro
        communityName={communityName}
        description={t("community.checkIns.pageDescription")}
        onBack={onBack}
        title={t("community.page.checkIns")}
      />
      {!checkedInToday ? (
        <Card>
          <SectionHeading>{t("community.checkIns.weeklyTitle")}</SectionHeading>
          <BodyText muted>{t("community.checkIns.weeklyDescription")}</BodyText>
          <PrimaryButton icon="edit-3" onPress={onCheckIn}>
            {t("community.checkIns.action")}
          </PrimaryButton>
        </Card>
      ) : null}
      <SectionHeading>{t("community.checkIns.recent")}</SectionHeading>
      {checkIns.length === 0 ? (
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
              onOpen={() => onOpenCheckIn(item)}
              onReact={() => onReact(item)}
              reacted={reaction.reacted}
              reactedBy={reaction.reactedBy}
              reactionCount={reaction.count}
            />
          );
        })
      )}
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
        ) : !answered ? (
          <CommunityCardAction
            active={prayed}
            icon="pray"
            label={communityActionLabel("prayer_request", prayed, t)}
            onPress={onPray}
            tone="prayer"
          />
        ) : undefined
      }
      attachment={<VerseList verse={item.verse} verses={item.verses} compact />}
      authorImage={authorImage}
      authorName={authorName}
      body={displayCopy.body}
      bodyContent={
        <LinkPreviewContent text={displayCopy.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <ExpandableBodyText collapsedLines={6} hiddenUrl={hiddenUrl}>
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
      title={displayCopy.title || communityDefaultFeedTitle(item, t)}
    />
  );
}

function CheckInCard({
  authorImage,
  authorName,
  item,
  onOpen,
  onReact,
  reacted,
  reactedBy,
  reactionCount,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: Extract<FeedItem, { type: "check_in" }>;
  onOpen: () => void;
  onReact: () => void;
  reacted: boolean;
  reactedBy?: { name: string; image?: GroupImage }[];
  reactionCount: number;
}) {
  const { t } = useAppTranslation();
  const itemKind = feedItemKind(item);
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
      bodyContent={
        <LinkPreviewContent text={item.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <ExpandableBodyText collapsedLines={6} hiddenUrl={hiddenUrl}>{item.body}</ExpandableBodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      }
      item={item}
      onOpen={onOpen}
      responseSummary={
        reactedBy?.length ? (
          <CommunityCardResponseSummary
            count={reactionCount}
            label={communityResponseNoun(item, reactionCount, t)}
            users={reactedBy}
          />
        ) : undefined
      }
      title={communityDefaultFeedTitle(item, t)}
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
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{member.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {t(member.role === "owner" ? "community.members.role.host" : "community.members.role.member")}
                </Text>
                {checkIn ? (
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>
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

function TransferOwnershipList({
  memberships,
  onTransfer,
}: {
  memberships: Membership[];
  onTransfer: (membership: Membership) => void;
}) {
  const { t } = useAppTranslation();
  if (memberships.length === 0) {
    return <BodyText muted>{t("community.management.transferEmpty")}</BodyText>;
  }

  return (
    <Card style={{ gap: 0, padding: 0 }}>
      {memberships.map((membership, index) => (
        <View
          key={membership.id}
          style={{
            alignItems: "center",
            borderBottomColor: colors.line,
            borderBottomWidth: index === memberships.length - 1 ? 0 : 1,
            flexDirection: "row",
            gap: 10,
            padding: 14,
          }}
        >
          <Avatar image={membership.image} name={membership.userName} size={38} tone="green" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{membership.userName}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{t("community.members.role.member")}</Text>
          </View>
          <Pressable
            accessibilityLabel={t("community.management.transferTo", { name: membership.userName })}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onTransfer(membership)}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: colors.mossSurface,
              borderColor: colors.moss,
              borderRadius: 999,
              borderWidth: 1,
              height: 36,
              justifyContent: "center",
              opacity: pressed ? 0.75 : 1,
              width: 36,
            })}
          >
            <Feather name="user-check" size={17} color={colors.olive} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}
