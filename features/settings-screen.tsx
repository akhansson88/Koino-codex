import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Animated, BackHandler, Image, PanResponder, Platform, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";

import { CheckInModal, type CheckInStep, moodNumber } from "@/features/check-in-modal";
import { activePrivateCheckIns } from "@/state/check-ins";
import {
  EntryVisibility,
  defaultFeedTitle as productDefaultFeedTitle,
  feedItemKind,
  feedItemLabel,
  heartMoods,
  moodLabel,
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
  AvatarStack,
  BodyText,
  BottomSheet,
  Card,
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
} from "@/ui/app-components";
import { normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { confirmAction } from "@/ui/confirm";
import { LinkPreview } from "@/ui/link-preview";
import { prayerCountLabel, prayerCountNoun } from "@/ui/prayer-copy";
import { PrayerActivity, type PrayerActivityEntry } from "@/ui/prayer-activity";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { SharedComposer } from "@/ui/shared-composer";
import { PostCard } from "@/ui/post-card";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors } from "@/ui/theme";

type RoomView = "rooms" | "detail" | "prayer" | "prayerDetail" | "checkins";
type RoomDetailTab = (typeof roomTabs)[number]["value"];
type PrayerFilter = (typeof prayerFilters)[number]["value"];
type TransitionDirection = "forward" | "back";
type CommunityMember = { id: Id; image?: GroupImage; name: string; role: "owner" | "member" };
type CommunityPrayerIntent = {
  recipientImage?: GroupImage;
  recipientName?: string;
  recipientUserId?: Id;
  type: "pray_for_someone" | "pray_now";
};
type PendingPrayerPost = CommunityPrayerIntent & { completedAt: string };

const PRAYER_POST_NOTE_LIMIT = 280;

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

function prayerMomentPostCopy(intent: CommunityPrayerIntent, note: string) {
  const recipientName = intent.recipientName?.trim();
  const lines = [recipientName ? `A prayer was made for ${recipientName}.` : "A prayer was made."];
  const trimmedNote = note.trim();

  if (trimmedNote) {
    lines.push(`About: ${trimmedNote}`);
  }

  return {
    body: lines.join("\n\n"),
    title: recipientName ? `Prayed for ${recipientName}` : "Prayer made",
  };
}

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

function roomMemberCount(counts: Record<Id, number>, roomId?: Id, fallback = 1) {
  if (!roomId) return fallback;
  return counts[roomId] || fallback;
}

async function shareRoomInvite(room: Group) {
  const invitation = `Join ${room.name} on KOINO with community code ${room.inviteCode}.`;
  const clipboard =
    Platform.OS === "web"
      ? (globalThis as typeof globalThis & { navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } } }).navigator?.clipboard
      : undefined;

  if (clipboard?.writeText) {
    await clipboard.writeText(invitation);
    return "Invite copied.";
  }

  await Share.share({ message: invitation, title: `Join ${room.name}` });
  return "Invite ready to share.";
}

function defaultTitle(item: FeedItem) {
  return productDefaultFeedTitle(item, moodLabel);
}

export function SettingsScreen() {
  const { state, dispatch } = useKoino();
  const [roomView, setRoomView] = useState<RoomView>("detail");
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>("forward");
  const roomViewRef = useRef<RoomView>("detail");
  const [detailTab, setDetailTab] = useState<RoomDetailTab>("reflections");
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

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const otherRooms = useMemo(() => state.groups.filter((item) => item.id !== state.currentGroupId), [state.currentGroupId, state.groups]);
  const memberCount = roomMemberCount(state.groupMemberCounts, group?.id, state.memberships.length || 4);
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
    return [...checkIns, ...posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [state.checkIns, state.currentGroupId, state.posts]);
  const reflectionItems = feedItems.filter(
    (item): item is Extract<FeedItem, { type: "post" }> => item.type === "post" && !isPrayerFeedKind(item.kind),
  );
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
      if (roomViewRef.current !== "detail") {
        setTransitionDirection("back");
      }
      setRoomView("detail");
      setDetailTab("reflections");
      setSelectedPrayerId(undefined);
      setEncouragementDraft("");
      setMemberSelectVisible(false);
      setPendingPrayerPost(undefined);
      setPrayerPostNote("");
    }, []),
  );

  useEffect(() => {
    roomViewRef.current = roomView;
  }, [roomView]);

  const navigateToRoomView = useCallback((nextView: RoomView, direction: TransitionDirection = "forward") => {
    setTransitionDirection(direction);
    setRoomView(nextView);
  }, []);

  const goBackFromRoomView = useCallback(() => {
    if (roomView === "prayerDetail") {
      navigateToRoomView("prayer", "back");
      return true;
    }
    if (roomView === "prayer" || roomView === "checkins" || roomView === "rooms") {
      navigateToRoomView("detail", "back");
      return true;
    }
    return false;
  }, [navigateToRoomView, roomView]);

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

  function handleCommunityTabChange(tab: RoomDetailTab) {
    if (tab === "prayer") {
      navigateToRoomView("prayer");
      return;
    }
    if (tab === "checkins") {
      navigateToRoomView("checkins");
      return;
    }
    setDetailTab(tab);
  }

  function openPrayerDetail(item: Extract<FeedItem, { type: "post" }>) {
    setSelectedPrayerId(item.id);
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
      prayedBy: prayedByUserIds.map((userId) => ({ name: userById.get(userId) ?? "Someone", image: userImageById.get(userId) })),
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
      reactedBy: reactedByUserIds.map((userId) => ({ name: userById.get(userId) ?? "Someone", image: userImageById.get(userId) })),
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
        name: reaction.userId === state.currentUserId ? "You" : userById.get(reaction.userId) ?? "Someone",
        image: userImageById.get(reaction.userId),
      }));
  }

  function prayForItem(item: FeedItem) {
    const prayer = itemPrayerState(item);
    setCommunityPrayerIntent(undefined);
    setPrayerTarget({
      targetType: prayer.targetType,
      targetId: item.id,
      body: item.body,
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

    const copy = prayerMomentPostCopy(pending, noteOverride);
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
      title: "Delete post?",
      message: "This removes the post and its replies from your community.",
      confirmText: "Delete",
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
    const selected = heartMoods.find((option) => option.value === heartMood);
    await dispatch({
      type: "submitCheckIn",
      mood: moodNumber(heartMood),
      heartMood,
      readToday: true,
      reflectionText: checkInText.trim() || selected?.description || "",
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
      setInviteMessage(await shareRoomInvite(group));
    } catch {
      setInviteMessage("Community code is selectable if sharing is unavailable.");
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
        () => reject(new Error("Could not read that image.")),
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
          setRoomImageMessage("Photo library permission is needed to choose a community image.");
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
        setRoomImageMessage("Could not read that image.");
        return;
      }

      const size = await selectedImageSize(asset);
      setCropSource({ ...size, uri: asset.uri });
    } catch {
      setRoomImageMessage("Could not open that image.");
    }
  }

  async function handleSaveRoomImage(localUri: string) {
    if (!group) return;
    await dispatch({ type: "uploadGroupImage", id: group.id, localUri });
    setCropSource(undefined);
    setRoomImageMessage("Community image updated.");
  }

  function handleDeleteRoomImage() {
    if (!group?.image || !ownsGroup) return;
    setManageSheetVisible(false);
    confirmAction({
      title: "Delete community image?",
      message: "The community will return to its initials avatar.",
      confirmText: "Delete",
      destructive: true,
      onConfirm: () => {
        void dispatch({ type: "deleteGroupImage", id: group.id })
          .then(() => setRoomImageMessage("Community image deleted."))
          .catch(() => setRoomImageMessage("Could not delete the community image."));
      },
    });
  }

  function handleLeaveRoom() {
    if (!group) return;
    setManageSheetVisible(false);
    confirmAction({
      title: "Leave community?",
      message: `You will leave ${group.name}, but your account will stay signed in.`,
      confirmText: "Leave",
      destructive: true,
      onConfirm: () => dispatch({ type: "leaveGroup", id: group.id }),
    });
  }

  function handleDeleteRoom() {
    if (!group) return;
    setManageSheetVisible(false);
    confirmAction({
      title: "Delete community?",
      message: "This removes the community, shared check-ins, reflections, replies, and prayers.",
      confirmText: "Delete",
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
      title: "Transfer ownership?",
      message: `${membership.userName} will become the community host for ${group.name}. You will remain a member.`,
      confirmText: "Transfer",
      onConfirm: () => {
        void dispatch({ type: "transferGroupOwnership", groupId: group.id, userId: membership.userId })
          .then(() => setRoomImageMessage(`Ownership transferred to ${membership.userName}.`))
          .catch(() => setRoomImageMessage("Could not transfer ownership. Please try again."));
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

  if (roomView === "prayer" && group) {
    return (
      <>
        <CommunityTransitionFrame animationKey={roomView} canSwipeBack direction={transitionDirection} onSwipeBack={goBackFromRoomView}>
          <CommunityPrayerScreen
            filter={prayerFilter}
            onBack={goBackFromRoomView}
            onCreatePrayer={() => openComposer("prayer_request")}
            onFilter={setPrayerFilter}
            onOpenPrayer={openPrayerDetail}
            onPray={prayForItem}
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
      </>
    );
  }

  if (roomView === "prayerDetail" && group) {
    if (!selectedPrayer) {
      return (
        <CommunityTransitionFrame animationKey={roomView} canSwipeBack direction={transitionDirection} onSwipeBack={goBackFromRoomView}>
          <AppScreen topInset={false}>
            <FocusedScreenHeader onBack={() => navigateToRoomView("prayer", "back")} title="Prayer" />
            <Card>
              <BodyText muted>This prayer request is no longer available.</BodyText>
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
            authorName={userById.get(selectedPrayer.userId) ?? "Someone"}
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
            onBack={goBackFromRoomView}
            onCheckIn={openCheckInComposer}
            onOpenCheckIn={(item) => router.push(`/feed/${item.type}/${item.id}` as never)}
            userById={userById}
            userImageById={userImageById}
          />
        </CommunityTransitionFrame>
        {communityCheckInModal}
      </>
    );
  }

  if (roomView === "detail" && group) {
    return (
      <>
        <CommunityTransitionFrame animationKey={roomView} direction={transitionDirection}>
          <AppScreen topInset={false}>
            <View style={{ gap: 12 }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <RoomImage image={group.image} name={group.name} size={54} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 21, fontWeight: "900" }}>{group.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{memberLabel(memberCount)}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600", lineHeight: 18 }}>A quiet place to pray, reflect, and walk together.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open community management"
                  onPress={() => {
                    setCurrentGroupName(group.name);
                    setManageSheetVisible(true);
                  }}
                  style={{ alignItems: "center", backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 999, borderWidth: 1, height: 38, justifyContent: "center", width: 38 }}
                >
                  <Feather name="more-horizontal" size={20} color={colors.ink} />
                </Pressable>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <PrimaryButton
                icon="heart"
                onPress={() => startCommunityPrayer({ type: "pray_now" })}
                style={{ flex: 1, minHeight: 46, paddingHorizontal: 10 }}
              >
                Pray now
              </PrimaryButton>
              <SecondaryButton
                icon="users"
                onPress={() => setMemberSelectVisible(true)}
                style={{ flex: 1, minHeight: 46, paddingHorizontal: 10 }}
              >
                Pray for someone
              </SecondaryButton>
            </View>

            <FilterChips
              value={detailTab}
              onChange={handleCommunityTabChange}
              options={roomTabs.map((tab) => ({ label: tab.label, value: tab.value }))}
            />

            {detailTab === "reflections" ? (
              <View style={{ gap: 12 }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
                  <SectionHeading>Reflections</SectionHeading>
                  <PrimaryButton icon="edit-3" onPress={() => openComposer("reflection")} style={{ minHeight: 42, paddingHorizontal: 14 }}>
                    Share
                  </PrimaryButton>
                </View>
                {reflectionItems.length === 0 ? (
                  <Card>
                    <BodyText muted>No reflections yet. When you are ready, share one honest line with your community.</BodyText>
                  </Card>
                ) : (
                  reflectionItems.map((item) => {
                    const prayer = itemPrayerState(item);
                    const reaction = itemReactionState(item);
                    return (
                      <PostCard
                        key={`${item.type}-${item.id}`}
                        authorImage={userImageById.get(item.userId)}
                        authorName={userById.get(item.userId) ?? "Someone"}
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
                  })
                )}
              </View>
            ) : null}

            {detailTab === "members" ? (
              <MembersPanel
                group={group}
                latestCheckInByUser={latestCheckInByUser}
                memberCount={memberCount}
                members={communityMembers}
                onInvite={handleInvite}
                onManage={() => {
                  setCurrentGroupName(group.name);
                  setManageSheetVisible(true);
                }}
                onSwitchRoom={openRoomOverview}
              />
            ) : null}
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
        <PrayerPostSheet
          note={prayerPostNote}
          onChangeNote={(value) => setPrayerPostNote(value.slice(0, PRAYER_POST_NOTE_LIMIT))}
          onPublish={() => publishPendingPrayerPost()}
          onSkip={() => publishPendingPrayerPost("")}
          pending={pendingPrayerPost}
        />
        <BottomSheet title="Community settings" visible={manageSheetVisible} onClose={() => setManageSheetVisible(false)}>
          <Card style={{ gap: 0, padding: 0 }}>
            <View style={{ paddingHorizontal: 14 }}>
              <Row icon="edit-2" onPress={ownsGroup ? handleRenameRoom : undefined}>
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Rename community</Text>
                <TextInputField value={currentGroupName} onChangeText={setCurrentGroupName} onSubmitEditing={handleRenameRoom} placeholder="Community name" returnKeyType="done" style={{ marginTop: 8 }} />
                {ownsGroup ? <Text style={{ color: canRename ? colors.gold : colors.muted, fontSize: 12, fontWeight: "700" }}>Tap row to save the name of your community</Text> : null}
              </Row>
            </View>
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <View style={{ paddingHorizontal: 14 }}>
              <Row icon="image" onPress={ownsGroup ? handleChooseRoomImage : undefined}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                  <RoomImage image={group.image} name={group.name} size={42} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{group.image ? "Change community image" : "Add community image"}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{ownsGroup ? "Choose and crop a new community image" : "Only the owner can change this"}</Text>
                  </View>
                </View>
              </Row>
            </View>
            {group.image ? (
              <>
                <View style={{ backgroundColor: colors.line, height: 1 }} />
                <Pressable accessibilityRole="button" onPress={handleDeleteRoomImage} disabled={!ownsGroup} style={{ opacity: ownsGroup ? 1 : 0.45, paddingHorizontal: 14 }}>
                  <Row icon="trash-2" tone="danger">
                    <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>Delete community image</Text>
                    <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>Return to the initials avatar</Text>
                  </Row>
                </Pressable>
              </>
            ) : null}
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <View style={{ paddingHorizontal: 14 }}>
              <Row icon="user-check" onPress={ownsGroup ? openTransferOwnership : undefined}>
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Transfer ownership</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {ownsGroup ? "Hand over ownership to another member" : "Only the owner can transfer this"}
                </Text>
              </Row>
            </View>
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <Pressable accessibilityRole="button" onPress={handleLeaveRoom} disabled={ownsGroup} style={{ opacity: ownsGroup ? 0.45 : 1, paddingHorizontal: 14 }}>
              <Row icon="log-out">
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Leave community</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Leave this community</Text>
              </Row>
            </Pressable>
            <View style={{ backgroundColor: colors.line, height: 1 }} />
            <Pressable accessibilityRole="button" onPress={handleDeleteRoom} disabled={!ownsGroup} style={{ opacity: ownsGroup ? 1 : 0.45, paddingHorizontal: 14 }}>
              <Row icon="trash-2" tone="danger">
                <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>Delete community</Text>
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>Permanently delete this community</Text>
              </Row>
            </Pressable>
          </Card>
          <SecondaryButton onPress={() => setManageSheetVisible(false)}>Cancel</SecondaryButton>
        </BottomSheet>
        <BottomSheet title="Transfer ownership" visible={transferSheetVisible} onClose={() => setTransferSheetVisible(false)}>
          <BodyText muted>Choose another member to become the community host.</BodyText>
          <TransferOwnershipList memberships={transferableMemberships} onTransfer={handleTransferOwnership} />
        </BottomSheet>
        <RoomImageCropper source={cropSource} visible={Boolean(cropSource)} onCancel={() => setCropSource(undefined)} onSave={handleSaveRoomImage} />
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
        <Text style={{ color: colors.ink, fontSize: 30, fontWeight: "900", lineHeight: 36 }}>Community</Text>
        <BodyText muted>A quiet place to pray, reflect, and walk together.</BodyText>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading>Current community</SectionHeading>
        <Card style={{ gap: 18, padding: 20 }}>
          {group ? (
            <>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 18 }}>
                <RoomImage image={group.image} name={group.name} size={76} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{group.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "700" }}>{memberLabel(memberCount)}</Text>
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
                    <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>Current community</Text>
                  </View>
                </View>
              </View>
              <View style={{ backgroundColor: colors.line, height: 1 }} />
              <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Community code</Text>
                  <RoomCodeCopy code={group.inviteCode} />
                </View>
                <PrimaryButton icon="share-2" onPress={handleInvite} style={{ minHeight: 48 }}>
                  Invite
                </PrimaryButton>
              </View>
              <SecondaryButton icon="message-circle" onPress={() => navigateToRoomView("detail", "back")}>
                Open Community
              </SecondaryButton>
              {inviteMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{inviteMessage}</Text> : null}
              {roomImageMessage ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{roomImageMessage}</Text> : null}
            </>
          ) : (
            <>
              <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "900" }}>No community selected</Text>
              <BodyText muted>Join or create a community for the people you pray with.</BodyText>
              <PrimaryButton icon="plus" onPress={() => setJoinSheetVisible(true)}>
                Join or create community
              </PrimaryButton>
            </>
          )}
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading>Other communities</SectionHeading>
        <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          {otherRooms.length === 0 ? (
            <BodyText muted style={{ padding: 16 }}>No other communities yet.</BodyText>
          ) : (
            otherRooms.map((room, index) => (
              <Pressable
                accessibilityRole="button"
                key={room.id}
                onPress={() => {
                  dispatch({ type: "switchGroup", id: room.id });
                  setDetailTab("reflections");
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
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{memberLabel(roomMemberCount(state.groupMemberCounts, room.id))}</Text>
                </View>
                <Feather name="chevron-right" size={19} color={colors.muted} />
              </Pressable>
            ))
          )}
        </Card>
        <Card style={{ gap: 0, padding: 0 }}>
          <Pressable accessibilityRole="button" onPress={() => setJoinSheetVisible(true)} style={{ paddingHorizontal: 16 }}>
            <Row icon="user-plus">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Join another community</Text>
            </Row>
          </Pressable>
        </Card>
        <Card style={{ gap: 0, padding: 0 }}>
          <Pressable accessibilityRole="button" onPress={() => setJoinSheetVisible(true)} style={{ paddingHorizontal: 16 }}>
            <Row icon="plus">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Create a new community</Text>
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
          Community settings
        </SecondaryButton>
      ) : null}

      <SecondaryButton icon="log-out" onPress={handleSignOut}>
        Log out
      </SecondaryButton>

      <BottomSheet title="Join or create community" visible={joinSheetVisible} onClose={() => setJoinSheetVisible(false)}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Enter a community code</Text>
          <TextInputField autoCapitalize="characters" autoCorrect={false} value={joinInviteCode} onChangeText={(value) => setJoinInviteCode(value.toUpperCase())} onSubmitEditing={handleJoinRoom} placeholder="Community code" returnKeyType="join" />
          <PrimaryButton disabled={!canJoin} onPress={handleJoinRoom}>
            Join by code
          </PrimaryButton>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "900" }}>or</Text>
          <View style={{ backgroundColor: colors.line, flex: 1, height: 1 }} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Create a new community</Text>
          <TextInputField value={newGroupName} onChangeText={setNewGroupName} onSubmitEditing={handleCreateRoom} placeholder="New community name" returnKeyType="done" />
          <PrimaryButton disabled={!canCreate} onPress={handleCreateRoom}>
            Create new community
          </PrimaryButton>
        </View>
        {state.authError ? <Text style={{ color: colors.danger, fontWeight: "800" }}>{state.authError}</Text> : null}
        <SecondaryButton onPress={() => setJoinSheetVisible(false)}>Cancel</SecondaryButton>
      </BottomSheet>

      <BottomSheet title="Community settings" visible={manageSheetVisible && Boolean(group)} onClose={() => setManageSheetVisible(false)}>
        <Card style={{ gap: 0, padding: 0 }}>
          <View style={{ paddingHorizontal: 14 }}>
            <Row icon="edit-2" onPress={ownsGroup ? handleRenameRoom : undefined}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Rename community</Text>
              <TextInputField value={currentGroupName} onChangeText={setCurrentGroupName} onSubmitEditing={handleRenameRoom} placeholder="Community name" returnKeyType="done" style={{ marginTop: 8 }} />
              {ownsGroup ? <Text style={{ color: canRename ? colors.gold : colors.muted, fontSize: 12, fontWeight: "700" }}>Tap row to save the name of your community</Text> : null}
            </Row>
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <View style={{ paddingHorizontal: 14 }}>
            <Row icon="image" onPress={ownsGroup ? handleChooseRoomImage : undefined}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <RoomImage image={group?.image} name={group?.name} size={42} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{group?.image ? "Change community image" : "Add community image"}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{ownsGroup ? "Choose and crop a new community image" : "Only the owner can change this"}</Text>
                </View>
              </View>
            </Row>
          </View>
          {group?.image ? (
            <>
              <View style={{ backgroundColor: colors.line, height: 1 }} />
              <Pressable accessibilityRole="button" onPress={handleDeleteRoomImage} disabled={!ownsGroup} style={{ opacity: ownsGroup ? 1 : 0.45, paddingHorizontal: 14 }}>
                <Row icon="trash-2" tone="danger">
                  <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>Delete community image</Text>
                  <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>Return to the initials avatar</Text>
                </Row>
              </Pressable>
            </>
          ) : null}
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <View style={{ paddingHorizontal: 14 }}>
            <Row icon="user-check" onPress={ownsGroup ? openTransferOwnership : undefined}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Transfer ownership</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                {ownsGroup ? "Hand over ownership to another member" : "Only the owner can transfer this"}
              </Text>
            </Row>
          </View>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Pressable accessibilityRole="button" onPress={handleLeaveRoom} disabled={ownsGroup} style={{ opacity: ownsGroup ? 0.45 : 1, paddingHorizontal: 14 }}>
            <Row icon="log-out">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Leave community</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Leave this community</Text>
            </Row>
          </Pressable>
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <Pressable accessibilityRole="button" onPress={handleDeleteRoom} disabled={!ownsGroup} style={{ opacity: ownsGroup ? 1 : 0.45, paddingHorizontal: 14 }}>
            <Row icon="trash-2" tone="danger">
              <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "900" }}>Delete community</Text>
              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>Permanently delete this community</Text>
            </Row>
          </Pressable>
        </Card>
        <SecondaryButton onPress={() => setManageSheetVisible(false)}>Cancel</SecondaryButton>
      </BottomSheet>
      <BottomSheet title="Transfer ownership" visible={transferSheetVisible} onClose={() => setTransferSheetVisible(false)}>
        <BodyText muted>Choose another member to become the community host.</BodyText>
        <TransferOwnershipList memberships={transferableMemberships} onTransfer={handleTransferOwnership} />
      </BottomSheet>
        </AppScreen>
      </CommunityTransitionFrame>
      <RoomImageCropper source={cropSource} visible={Boolean(cropSource)} onCancel={() => setCropSource(undefined)} onSave={handleSaveRoomImage} />
    </>
  );
}

export const CommunityScreen = SettingsScreen;
export const RoomScreen = SettingsScreen;

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
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={onBack} />
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>{title}</Text>
      <View style={{ width: 38 }} />
    </View>
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
  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel="Close" icon="arrow-left" onPress={onClose} />
          <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>Pray for someone</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900" }}>Who would you like to pray for?</Text>
          <BodyText muted>Select a member from your community.</BodyText>
        </View>
        <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
          {members.map((member) => (
            <Pressable accessibilityRole="button" key={member.id} onPress={() => onSelect(member)}>
              <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, padding: 14 }}>
                <Avatar image={member.image} name={member.name} size={46} tone="green" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{member.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Pray for {member.name}</Text>
                </View>
                <Feather name="heart" size={18} color={colors.gold} />
              </Card>
            </Pressable>
          ))}
          {members.length === 0 ? (
            <Card>
              <BodyText muted>No other members in this community yet.</BodyText>
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
  const recipientName = pending?.recipientName?.trim();

  return (
    <BottomSheet title="Share prayer" visible={Boolean(pending)} onClose={onSkip}>
      {recipientName ? (
        <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
          <Avatar image={pending?.recipientImage} name={recipientName} size={38} tone="green" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{recipientName}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Prayer will be posted for this person.</Text>
          </View>
        </Card>
      ) : null}
      <View style={{ gap: 6 }}>
        <TextInputField
          maxLength={PRAYER_POST_NOTE_LIMIT}
          multiline
          onChangeText={onChangeNote}
          placeholder="What did you pray for? (optional)"
          returnKeyType="done"
          style={{ minHeight: 120 }}
          value={note}
        />
        <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>{note.length}/{PRAYER_POST_NOTE_LIMIT}</Text>
      </View>
      <PrimaryButton icon="send" onPress={onPublish}>
        Post prayer
      </PrimaryButton>
      <SecondaryButton onPress={onSkip}>Skip note</SecondaryButton>
    </BottomSheet>
  );
}

function CommunityPrayerScreen({
  filter,
  onBack,
  onCreatePrayer,
  onFilter,
  onOpenPrayer,
  onPray,
  prayerPosts,
  prayerState,
  userById,
  userImageById,
}: {
  filter: PrayerFilter;
  onBack: () => void;
  onCreatePrayer: () => void;
  onFilter: (filter: PrayerFilter) => void;
  onOpenPrayer: (item: Extract<FeedItem, { type: "post" }>) => void;
  onPray: (item: FeedItem) => void;
  prayerPosts: Extract<FeedItem, { type: "post" }>[];
  prayerState: (item: FeedItem) => { prayed: boolean; count: number; prayedBy: { name: string; image?: GroupImage }[] };
  userById: Map<Id, string>;
  userImageById: Map<Id, GroupImage | undefined>;
}) {
  const countLabel = filter === "open" ? "open" : filter === "answered" ? "answered" : "total";

  return (
    <AppScreen topInset={false}>
      <FocusedScreenHeader onBack={onBack} title="Prayer" />
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "900", lineHeight: 34 }}>Prayer</Text>
        <BodyText muted>Hold requests with care, pray with intention, and return with encouragement.</BodyText>
      </View>
      <FilterChips value={filter} onChange={onFilter} options={prayerFilters.map((item) => ({ label: item.label, value: item.value }))} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
        <BodyText muted>{prayerPosts.length} {countLabel} {prayerPosts.length === 1 ? "prayer" : "prayers"}</BodyText>
        <PrimaryButton icon="heart" onPress={onCreatePrayer} style={{ minHeight: 42, paddingHorizontal: 14 }}>
          Share prayer
        </PrimaryButton>
      </View>
      {prayerPosts.length === 0 ? (
        <Card>
          <BodyText muted>{filter === "answered" ? "No answered prayers yet." : "No prayers here yet."}</BodyText>
        </Card>
      ) : (
        prayerPosts.map((item) => {
          const prayer = prayerState(item);
          return (
            <PrayerRequestCard
              key={item.id}
              authorImage={userImageById.get(item.userId)}
              authorName={userById.get(item.userId) ?? "Someone"}
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
  const answered = Boolean(item.answeredAt);
  const prayerMoment = isPrayerMomentKind(item.kind);

  return (
    <AppScreen topInset={false}>
      <FocusedScreenHeader onBack={onBack} title="Prayer" />
      <View style={{ alignItems: "center", gap: 8 }}>
        <Avatar image={authorImage} name={authorName} size={58} tone="green" />
        <View style={{ alignItems: "center", gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{authorName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31, textAlign: "center" }}>{item.title || defaultTitle(item)}</Text>
        <BodyText style={{ fontSize: 16, lineHeight: 24, textAlign: "center" }}>{item.body || "No words today, just presence."}</BodyText>
        <LinkPreview text={item.body} />
      </View>
      {prayerMoment ? (
        <Card style={{ alignItems: "center", flexDirection: "row", gap: 10, padding: 14 }}>
          <MaterialCommunityIcons name="hands-pray" size={20} color={colors.gold} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Prayer made</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Shared {formatRelativeTime(item.createdAt)}</Text>
          </View>
          <PrayerMomentPill />
        </Card>
      ) : (
        <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 14 }}>
          <View style={{ alignItems: "center", flex: 1, gap: 3 }}>
            <Text style={{ color: colors.gold, fontSize: 18, fontWeight: "900" }}>{prayer.count}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{prayerCountNoun(prayer.count)}</Text>
          </View>
          <View style={{ backgroundColor: colors.line, height: 34, width: 1 }} />
          <View style={{ alignItems: "center", flex: 1, gap: 3 }}>
            <StatusPill status={answered ? "answered" : "open"} />
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>status</Text>
          </View>
        </Card>
      )}
      {answered ? (
        <Card style={{ backgroundColor: colors.mossSurface, gap: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
            <Feather name="check-circle" size={20} color={colors.olive} />
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>Answered prayer</Text>
          </View>
          <BodyText muted>Marked answered {formatRelativeTime(item.answeredAt ?? item.createdAt)}</BodyText>
        </Card>
      ) : null}
      {!answered && !prayerMoment ? (
        <PrayerActionButton onPress={onPray} prayed={prayer.prayed} />
      ) : null}
      {ownsItem && !answered && !prayerMoment ? (
        <SecondaryButton icon="check-circle" onPress={onMarkAnswered}>
          Mark as answered
        </SecondaryButton>
      ) : null}
      {replies.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionHeading>Encouragement</SectionHeading>
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
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{userById.get(reply.userId) ?? "Someone"}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(reply.createdAt)}</Text>
                  </View>
                </View>
                <BodyText>{reply.body}</BodyText>
                <LinkPreview text={reply.body} />
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
          placeholder="Write an encouragement..."
          returnKeyType="send"
          style={{ flex: 1 }}
        />
        <Pressable
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
      <Text style={{ color: prayed ? colors.textMuted : colors.onAccent, fontSize: 16, fontWeight: "900" }}>{prayed ? "Prayed" : "Pray"}</Text>
    </Pressable>
  );
}

function PrayerMomentPill() {
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
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>Prayed</Text>
    </View>
  );
}

function CommunityCheckInsScreen({
  checkIns,
  checkedInToday,
  onBack,
  onCheckIn,
  onOpenCheckIn,
  userById,
  userImageById,
}: {
  checkIns: Extract<FeedItem, { type: "check_in" }>[];
  checkedInToday: boolean;
  onBack: () => void;
  onCheckIn: () => void;
  onOpenCheckIn: (item: Extract<FeedItem, { type: "check_in" }>) => void;
  userById: Map<Id, string>;
  userImageById: Map<Id, GroupImage | undefined>;
}) {
  return (
    <AppScreen topInset={false}>
      <FocusedScreenHeader onBack={onBack} title="Check-ins" />
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "900", lineHeight: 34 }}>Check-ins</Text>
        <BodyText muted>Take a gentle moment to share how your heart is doing.</BodyText>
      </View>
      {!checkedInToday ? (
        <Card>
          <SectionHeading>This week's check-in</SectionHeading>
          <BodyText muted>Take a moment to share how your heart is doing.</BodyText>
          <PrimaryButton icon="edit-3" onPress={onCheckIn}>
            Check in now
          </PrimaryButton>
        </Card>
      ) : null}
      <SectionHeading>Recent check-ins</SectionHeading>
      {checkIns.length === 0 ? (
        <Card>
          <BodyText muted>No shared check-ins yet. This space will stay gentle until someone is ready.</BodyText>
        </Card>
      ) : (
        checkIns.map((item) => (
          <CheckInCard
            key={item.id}
            authorImage={userImageById.get(item.userId)}
            authorName={userById.get(item.userId) ?? "Someone"}
            item={item}
            onOpen={() => onOpenCheckIn(item)}
          />
        ))
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
  const answered = Boolean(item.answeredAt);
  const prayerMoment = isPrayerMomentKind(item.kind);
  return (
    <Pressable accessibilityRole="button" onPress={onOpen}>
      <Card style={{ gap: 12, padding: 16 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Avatar image={authorImage} name={authorName} size={40} tone="green" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{authorName}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
          {prayerMoment ? <PrayerMomentPill /> : <StatusPill status={answered ? "answered" : "open"} />}
        </View>
        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900", lineHeight: 24 }}>{item.title || defaultTitle(item)}</Text>
          <BodyText muted numberOfLines={3}>{item.body || "No words today, just presence."}</BodyText>
          <LinkPreview text={item.body} />
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          {prayedBy?.length ? <AvatarStack users={prayedBy} size={24} /> : null}
          <Text style={{ color: colors.muted, flex: 1, fontSize: 13, fontWeight: "800" }}>{prayerMoment ? "Prayer made" : prayerCountLabel(prayerCount)}</Text>
          {!answered && !prayerMoment ? (
            <Pressable
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                onPray();
              }}
              style={{
                alignItems: "center",
                backgroundColor: prayed ? colors.prayerSoft : colors.gold,
                borderColor: prayed ? colors.accentPrayer : colors.gold,
                borderRadius: 999,
                borderWidth: 1,
                flexDirection: "row",
                gap: 6,
                minHeight: 36,
                paddingHorizontal: 12,
              }}
            >
              <MaterialCommunityIcons name="hands-pray" size={16} color={prayed ? colors.textMuted : colors.onAccent} />
              <Text style={{ color: prayed ? colors.textMuted : colors.onAccent, fontSize: 12, fontWeight: "900" }}>{prayed ? "Prayed" : "Pray"}</Text>
            </Pressable>
          ) : (
            <Feather name="bookmark" size={18} color={colors.gold} />
          )}
        </View>
      </Card>
    </Pressable>
  );
}

function CheckInCard({
  authorImage,
  authorName,
  item,
  onOpen,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: Extract<FeedItem, { type: "check_in" }>;
  onOpen: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onOpen}>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 14 }}>
        <Avatar image={authorImage} name={authorName} size={38} tone="green" />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{authorName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt)}</Text>
          {item.body ? <BodyText muted numberOfLines={2}>{item.body}</BodyText> : null}
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Feather name="smile" size={20} color={colors.olive} />
          <Text style={{ color: colors.ink, fontSize: 12, fontWeight: "900" }}>{moodLabel(item.mood)}</Text>
        </View>
      </Card>
    </Pressable>
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
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
        <RoomImage image={group.image} name={group.name} size={58} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{group.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{memberLabel(memberCount)}</Text>
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
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{member.role === "owner" ? "Community host" : "Member"}</Text>
                {checkIn ? (
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>
                    Last check-in: {moodLabel(checkIn.mood)}
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
        Invite members
      </PrimaryButton>
      <Card>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>Community code</Text>
        <RoomCodeCopy code={group.inviteCode} />
      </Card>
      <SecondaryButton icon="settings" onPress={onManage}>
        Community settings
      </SecondaryButton>
      <SecondaryButton icon="repeat" onPress={onSwitchRoom}>
        Join or create community
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
  if (memberships.length === 0) {
    return <BodyText muted>Invite another member before transferring ownership.</BodyText>;
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
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Member</Text>
          </View>
          <Pressable
            accessibilityLabel={`Transfer ownership to ${membership.userName}`}
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
