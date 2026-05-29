import { useCallback, useEffect, useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image, Platform, Pressable, Share, Text, View } from "react-native";

import {
  EntryVisibility,
  defaultFeedTitle as productDefaultFeedTitle,
  feedItemLabel,
  moodLabel,
  normalizeEntryKind,
  prayerFilters,
  roomTabs,
  visibility,
} from "@/state/product";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, EntryKind, FeedItem, Group, GroupImage, Id } from "@/state/types";
import {
  AppScreen,
  Avatar,
  AvatarStack,
  BodyText,
  BottomSheet,
  Card,
  FilterChips,
  HeartPromptCard,
  PrimaryButton,
  RoomImage,
  Row,
  SecondaryButton,
  SectionHeading,
  TextInputField,
} from "@/ui/app-components";
import { primaryBibleVerse } from "@/ui/bible-verse-picker";
import { confirmAction } from "@/ui/confirm";
import { LinkPreview } from "@/ui/link-preview";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { RoomImageCropper, type RoomImageCropSource } from "@/ui/room-image-cropper";
import { SharedComposer } from "@/ui/shared-composer";
import { PostCard } from "@/ui/post-card";
import { colors } from "@/ui/theme";

type RoomView = "rooms" | "detail";
type RoomDetailTab = (typeof roomTabs)[number]["value"];
type PrayerFilter = (typeof prayerFilters)[number]["value"];

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

function formatRelativeTime(value: string) {
  const created = Date.parse(value);
  if (Number.isNaN(created)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Today at ${new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function defaultTitle(item: FeedItem) {
  return productDefaultFeedTitle(item, moodLabel);
}

export function SettingsScreen() {
  const { state, dispatch } = useKoino();
  const [roomView, setRoomView] = useState<RoomView>("detail");
  const [detailTab, setDetailTab] = useState<RoomDetailTab>("reflections");
  const [prayerFilter, setPrayerFilter] = useState<PrayerFilter>("open");
  const [joinSheetVisible, setJoinSheetVisible] = useState(false);
  const [manageSheetVisible, setManageSheetVisible] = useState(false);
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

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const otherRooms = useMemo(() => state.groups.filter((item) => item.id !== state.currentGroupId), [state.currentGroupId, state.groups]);
  const memberCount = roomMemberCount(state.groupMemberCounts, group?.id, state.memberships.length || 4);
  const currentUser = state.users.find((item) => item.id === state.currentUserId);
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
    (item): item is Extract<FeedItem, { type: "post" }> => item.type === "post" && normalizeEntryKind(item.kind) !== "prayer_request",
  );
  const prayerRequests = feedItems.filter(
    (item): item is Extract<FeedItem, { type: "post" }> => item.type === "post" && normalizeEntryKind(item.kind) === "prayer_request",
  );
  const visiblePrayerRequests = prayerRequests.filter((item) => {
    if (item.type !== "post") return false;
    if (prayerFilter === "open") return !item.answeredAt;
    if (prayerFilter === "answered") return Boolean(item.answeredAt);
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
      setRoomView("detail");
      setDetailTab("reflections");
    }, []),
  );

  function openComposer(kind: EntryKind = "reflection") {
    setComposerKind(kind);
    setComposerVisibility(visibility.room);
    setComposerTitle("");
    setComposerBody("");
    setComposerVerses([]);
    setComposerVisible(true);
  }

  async function submitComposer() {
    if (!composerBody.trim()) return;
    if (composerVisibility === visibility.private) {
      await dispatch({ type: "createJournalEntry", entryKind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses, shareWithGroup: false });
    } else {
      await dispatch({ type: "createPost", kind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses });
    }
    setComposerVisible(false);
    setComposerBody("");
    setComposerTitle("");
    setComposerVerses([]);
  }

  function itemPrayerState(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    const reactions = state.prayerReactions.filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id);
    const prayedByUserIds = [...new Set(reactions.map((reaction) => reaction.userId))];
    return {
      prayed: reactions.some((reaction) => reaction.userId === state.currentUserId),
      count: prayedByUserIds.length,
      targetType,
      prayedBy: prayedByUserIds.map((userId) => ({ name: userById.get(userId) ?? "Someone", image: userImageById.get(userId) })),
    };
  }

  function itemReplies(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    return state.replies.filter((reply) => reply.targetType === targetType && reply.targetId === item.id);
  }

  function prayForItem(item: FeedItem) {
    const prayer = itemPrayerState(item);
    if (prayer.prayed) return;
    dispatch({ type: "finishPrayer", targetType: prayer.targetType, targetId: item.id, status: "completed", startedAt: new Date().toISOString() });
  }

  function togglePostAction(item: FeedItem) {
    const prayer = itemPrayerState(item);
    if (prayer.prayed) {
      dispatch({ type: "unpray", targetType: prayer.targetType, targetId: item.id });
      return;
    }
    prayForItem(item);
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

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setRoomImageMessage("Photo library permission is needed to choose a community image.");
        return;
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

  async function handleSignOut() {
    setJoinSheetVisible(false);
    setManageSheetVisible(false);
    await dispatch({ type: "signOut" });
    router.replace("/");
  }

  function openRoomOverview() {
    setRoomView("rooms");
    setJoinSheetVisible(false);
    setManageSheetVisible(false);
  }

  if (roomView === "detail" && group) {
    return (
      <>
        <AppScreen>
          <View style={{ gap: 12, paddingTop: 18 }}>
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
            {communityMembers.length > 0 ? <AvatarStack users={communityMembers} size={28} /> : null}
          </View>

          <HeartPromptCard
            actionIcon="edit-3"
            actionLabel="Check in"
            image={currentUser?.image}
            name={currentUser?.name ?? state.authEmail ?? "K"}
            subtitle="Take a quiet moment with God."
            onPress={() => router.push("/(tabs)?checkIn=1" as never)}
          />

          <FilterChips
            value={detailTab}
            onChange={setDetailTab}
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
                      replyCount={itemReplies(item).length}
                      onOpen={() => router.push(`/feed/${item.type}/${item.id}` as never)}
                      onPray={() => togglePostAction(item)}
                    />
                  );
                })
              )}
            </View>
          ) : null}

          {detailTab === "prayer" ? (
            <View style={{ gap: 12 }}>
              <FilterChips value={prayerFilter} onChange={setPrayerFilter} options={prayerFilters.map((filter) => ({ label: filter.label, value: filter.value }))} />
              <BodyText muted>{visiblePrayerRequests.length} {prayerFilter === "open" ? "open" : prayerFilter === "answered" ? "answered" : "total"} {visiblePrayerRequests.length === 1 ? "request" : "requests"}</BodyText>
              {visiblePrayerRequests.length === 0 ? (
                <Card>
                  <BodyText muted>{prayerFilter === "answered" ? "No answered prayers yet." : "No open prayer requests yet."}</BodyText>
                </Card>
              ) : (
                visiblePrayerRequests.map((item) => {
                  const prayer = itemPrayerState(item);
                  return (
                    <PrayerRequestCard
                      key={item.id}
                      authorImage={userImageById.get(item.userId)}
                      authorName={userById.get(item.userId) ?? "Someone"}
                      item={item}
                      prayed={prayer.prayed}
                      prayedBy={prayer.prayedBy}
                      prayerCount={prayer.count}
                      onOpen={() => router.push(`/feed/${item.type}/${item.id}` as never)}
                      onPray={() => prayForItem(item)}
                    />
                  );
                })
              )}
            </View>
          ) : null}

          {detailTab === "checkins" ? (
            <View style={{ gap: 12 }}>
              <Card>
                <SectionHeading>This week's check-in</SectionHeading>
                <BodyText muted>Take a moment to share how your heart is doing.</BodyText>
                <PrimaryButton icon="check-circle" onPress={() => router.push("/(tabs)?checkIn=1" as never)}>
                  Check in now
                </PrimaryButton>
              </Card>
              <SectionHeading>Recent check-ins</SectionHeading>
              {sharedCheckIns.length === 0 ? (
                <Card>
                  <BodyText muted>No shared check-ins yet. This space will stay gentle until someone is ready.</BodyText>
                </Card>
              ) : (
                sharedCheckIns.map((item) => (
                  <CheckInCard
                    key={item.id}
                    authorImage={userImageById.get(item.userId)}
                    authorName={userById.get(item.userId) ?? "Someone"}
                    item={item}
                    onOpen={() => router.push(`/feed/${item.type}/${item.id}` as never)}
                  />
                ))
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
          onClose={() => setComposerVisible(false)}
          onSubmit={submitComposer}
          roomName={group.name}
          roomImage={group.image}
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
              <Row icon="user" onPress={() => undefined}>
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Transfer ownership</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Hand over ownership to another member</Text>
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
        <RoomImageCropper source={cropSource} visible={Boolean(cropSource)} onCancel={() => setCropSource(undefined)} onSave={handleSaveRoomImage} />
      </>
    );
  }

  return (
    <>
    <AppScreen>
      <View style={{ gap: 8, paddingTop: 64 }}>
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
              <SecondaryButton icon="message-circle" onPress={() => setRoomView("detail")}>
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
                  setRoomView("detail");
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
            <Row icon="user" onPress={() => undefined}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Transfer ownership</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Hand over ownership to another member</Text>
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
    </AppScreen>
    <RoomImageCropper source={cropSource} visible={Boolean(cropSource)} onCancel={() => setCropSource(undefined)} onSave={handleSaveRoomImage} />
    </>
  );
}

export const CommunityScreen = SettingsScreen;
export const RoomScreen = SettingsScreen;

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
  return (
    <Pressable accessibilityRole="button" onPress={onOpen}>
      <Card style={{ gap: 12, padding: 16 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Avatar image={authorImage} name={authorName} size={40} tone="green" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{authorName}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
          <View style={{ backgroundColor: answered ? colors.mossSurface : colors.accentSubtle, borderColor: colors.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ color: answered ? colors.olive : colors.gold, fontSize: 11, fontWeight: "900" }}>{answered ? "Answered" : "Open"}</Text>
          </View>
        </View>
        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900", lineHeight: 24 }}>{item.title || defaultTitle(item)}</Text>
          <BodyText muted numberOfLines={3}>{item.body || "No words today, just presence."}</BodyText>
          <LinkPreview text={item.body} />
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          {prayedBy?.length ? <AvatarStack users={prayedBy} size={24} /> : null}
          <Text style={{ color: colors.muted, flex: 1, fontSize: 13, fontWeight: "800" }}>{prayerCount} prayed</Text>
          {!answered ? (
            <Pressable
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                onPray();
              }}
              style={{
                alignItems: "center",
                backgroundColor: prayed ? colors.accentSubtle : colors.paper,
                borderColor: prayed ? colors.gold : colors.line,
                borderRadius: 999,
                borderWidth: 1,
                flexDirection: "row",
                gap: 6,
                minHeight: 36,
                paddingHorizontal: 12,
              }}
            >
              <Feather name={prayed ? "check" : "heart"} size={15} color={prayed ? colors.gold : colors.olive} />
              <Text style={{ color: prayed ? colors.gold : colors.olive, fontSize: 12, fontWeight: "900" }}>{prayed ? "You prayed" : "Pray with this"}</Text>
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
      <Card>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>Community code</Text>
        <RoomCodeCopy code={group.inviteCode} />
        <PrimaryButton icon="share-2" onPress={onInvite}>
          Invite members
        </PrimaryButton>
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
      <SecondaryButton icon="settings" onPress={onManage}>
        Community settings
      </SecondaryButton>
      <SecondaryButton icon="repeat" onPress={onSwitchRoom}>
        Join or create community
      </SecondaryButton>
    </View>
  );
}
