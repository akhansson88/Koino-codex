import type { ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from "react-native";

import { BiblePlanCard } from "@/features/bible-plan-card";
import { biblePlanDayLabel, localDayKey, sortedBiblePlanReadings, todayBiblePlanReading } from "@/features/bible-plan-utils";
import { activePrivateCheckIns } from "@/state/check-ins";
import {
  EntryVisibility,
  defaultFeedTitle as productDefaultFeedTitle,
  feedItemLabel,
  moodLabel as productMoodLabel,
  moodOptions,
  normalizeEntryKind,
  visibility,
} from "@/state/product";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, EntryKind, FeedItem, GroupImage } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  Card,
  CurrentRoomHeader,
  HeartPromptCard,
  IconButton,
  PrimaryButton,
  RoomImage,
  SecondaryButton,
  SectionHeading,
  TextInputField,
} from "@/ui/app-components";
import { PostCard } from "@/ui/post-card";
import { BibleVerseField, normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { confirmAction } from "@/ui/confirm";
import { LinkPreview } from "@/ui/link-preview";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, platformShadow, radius } from "@/ui/theme";

type CheckInStep = "choose" | "details" | "thanks";

const INITIAL_POST_COUNT = 10;
const LOAD_MORE_POST_COUNT = 20;

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

function kindLabel(item: FeedItem) {
  return feedItemLabel(item);
}

function defaultTitle(item: FeedItem) {
  return productDefaultFeedTitle(item, productMoodLabel);
}

export function HomeScreen() {
  const { state, dispatch } = useKoino();
  const params = useLocalSearchParams<{ checkIn?: string; compose?: string }>();
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [checkInStep, setCheckInStep] = useState<CheckInStep>("choose");
  const [mood, setMood] = useState(4);
  const [checkInText, setCheckInText] = useState("");
  const [checkInVerses, setCheckInVerses] = useState<BibleVerse[]>([]);
  const [shareCheckIn, setShareCheckIn] = useState(true);
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerKind, setComposerKind] = useState<EntryKind>("reflection");
  const [composerVisibility, setComposerVisibility] = useState<EntryVisibility>(visibility.private);
  const [composerTitle, setComposerTitle] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerVerses, setComposerVerses] = useState<BibleVerse[]>([]);
  const [editingItem, setEditingItem] = useState<FeedItem | undefined>();
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const [memberSelectVisible, setMemberSelectVisible] = useState(false);
  const [visiblePostCount, setVisiblePostCount] = useState(INITIAL_POST_COUNT);
  const [groupPlanReflectionVisible, setGroupPlanReflectionVisible] = useState(false);
  const [groupPlanReflectionText, setGroupPlanReflectionText] = useState("");
  const lastComposeParamRef = useRef<string | undefined>(undefined);

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const todayKey = localDayKey(new Date());
  const todaysCheckIn = [...state.checkIns, ...activePrivateCheckIns(state.privateCheckIns, state.journalEntries)].some(
    (item) => item.userId === state.currentUserId && item.groupId === state.currentGroupId && localDayKey(item.createdAt) === todayKey,
  );
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const userImageById = useMemo(() => new Map(state.users.map((user) => [user.id, user.image])), [state.users]);
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
    return [...checkIns, ...posts]
      .filter((item) => {
        return true;
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [state.checkIns, state.currentGroupId, state.posts]);
  const recentActivity = feedItems.slice(0, visiblePostCount);
  const hasMorePosts = visiblePostCount < feedItems.length;
  const openPrayer = feedItems.find((item) => item.type === "post" && normalizeEntryKind(item.kind) === "prayer_request");
  const groupPlanReadings = useMemo(() => sortedBiblePlanReadings(state.groupBiblePlan), [state.groupBiblePlan]);
  const groupPlanReading = useMemo(() => todayBiblePlanReading(state.groupBiblePlan, todayKey), [state.groupBiblePlan, todayKey]);
  const groupPlanReadUserIds = useMemo(
    () => new Set(state.groupBiblePlanProgress.filter((item) => item.read).map((item) => item.userId)),
    [state.groupBiblePlanProgress],
  );
  const groupPlanReadCount = groupPlanReadUserIds.size;
  const groupPlanCompletedByCurrentUser = Boolean(state.currentUserId && groupPlanReadUserIds.has(state.currentUserId));
  const currentGroupPlanProgress = useMemo(
    () =>
      groupPlanReading && state.currentUserId
        ? state.groupBiblePlanProgress.find((item) => item.userId === state.currentUserId && item.readingId === groupPlanReading.id)
        : undefined,
    [groupPlanReading, state.currentUserId, state.groupBiblePlanProgress],
  );
  const savedGroupPlanReflection = currentGroupPlanProgress?.reflectionText ?? "";
  const groupPlanReflections = useMemo(
    () =>
      groupPlanReading
        ? state.groupBiblePlanProgress
            .filter(
              (item) =>
                item.readingId === groupPlanReading.id &&
                item.reflectionVisibility === "group" &&
                Boolean(item.reflectionText?.trim()),
            )
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        : [],
    [groupPlanReading, state.groupBiblePlanProgress],
  );
  const visibleGroupPlanReflections = groupPlanReflections.slice(0, 3);

  function resetCheckIn() {
    setCheckInStep("choose");
    setMood(4);
    setCheckInText("");
    setCheckInVerses([]);
    setShareCheckIn(true);
  }

  function openComposer(kind: EntryKind, item?: FeedItem, defaultVisibility: EntryVisibility = visibility.private) {
    setComposerKind(kind);
    setComposerVisibility(defaultVisibility);
    setEditingItem(item);
    setComposerTitle(item?.type === "post" ? item.title ?? "" : "");
    setComposerBody(item?.body ?? "");
    setComposerVerses(normalizeBibleVerses(item?.verse, item?.verses));
    setComposerVisible(true);
  }

  useEffect(() => {
    if (!params.checkIn) return;
    resetCheckIn();
    setCheckInVisible(true);
  }, [params.checkIn]);

  useEffect(() => {
    if (!params.compose || params.compose === lastComposeParamRef.current) return;
    lastComposeParamRef.current = params.compose;
    openComposer("reflection", undefined, visibility.room);
  }, [params.compose]);

  async function submitComposer() {
    if (!composerBody.trim()) return;
    if (editingItem?.type === "post") {
      await dispatch({ type: "editPost", id: editingItem.id, kind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses });
    } else if (composerVisibility === visibility.private) {
      await dispatch({ type: "createJournalEntry", entryKind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses, shareWithGroup: false });
    } else {
      await dispatch({ type: "createPost", kind: composerKind, title: composerTitle, body: composerBody, verse: primaryBibleVerse(composerVerses), verses: composerVerses });
    }
    setComposerVisible(false);
    setEditingItem(undefined);
    setComposerTitle("");
    setComposerBody("");
    setComposerVerses([]);
    setComposerKind("reflection");
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
    const targetType = item.type === "post" ? "post" : "check_in";
    return state.replies
      .filter((reply) => reply.targetType === targetType && reply.targetId === item.id)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  function deleteItem(item: FeedItem) {
    confirmAction({
      title: `Delete ${kindLabel(item).toLowerCase()}?`,
      message: "This will remove it from the shared room.",
      confirmText: "Delete",
      destructive: true,
      onConfirm: () => dispatch({ type: item.type === "post" ? "deletePost" : "deleteCheckIn", id: item.id }),
    });
  }

  function openGroupPlanReflection() {
    setGroupPlanReflectionText(savedGroupPlanReflection);
    setGroupPlanReflectionVisible(true);
  }

  async function submitGroupPlanReflection() {
    if (!state.groupBiblePlan || !groupPlanReading || !groupPlanReflectionText.trim()) return;
    await dispatch({
      type: "saveGroupBiblePlanReflection",
      planId: state.groupBiblePlan.id,
      readingId: groupPlanReading.id,
      reflectionText: groupPlanReflectionText,
      reflectionVisibility: "group",
      dateKey: todayKey,
    });
    setGroupPlanReflectionVisible(false);
  }

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
      if (distanceFromBottom < 100 && hasMorePosts) {
        setVisiblePostCount((prev) => Math.min(prev + LOAD_MORE_POST_COUNT, feedItems.length));
      }
    },
    [hasMorePosts, feedItems.length],
  );

  return (
    <AppScreen scroll={false} topInset={false}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 112, paddingTop: 18 }}
      >
      <CurrentRoomHeader />

      <HeartPromptCard
        image={user?.image}
        name={user?.name ?? state.authEmail ?? "K"}
        subtitle={todaysCheckIn ? "Share, reflect or ask for prayer..." : "Take a moment to check in..."}
        onPress={() => {
          resetCheckIn();
          setCheckInVisible(true);
        }}
      />

      <View style={{ gap: 10 }}>
        <SectionHeading>Group rhythm</SectionHeading>
        {state.groupBiblePlan && groupPlanReading ? (
          <BiblePlanCard
            completed={groupPlanCompletedByCurrentUser}
            dayLabel={biblePlanDayLabel(groupPlanReading, groupPlanReadings.length)}
            onMarkRead={() =>
              dispatch({
                type: "markGroupBiblePlanRead",
                planId: state.groupBiblePlan?.id ?? "",
                readingId: groupPlanReading.id,
                dateKey: todayKey,
              })
            }
            onReflect={openGroupPlanReflection}
            passageReference={groupPlanReading.passage.reference}
            planTitle={state.groupBiblePlan.title}
            progressLabel={`${groupPlanReadCount} read today`}
            reflectLabel={savedGroupPlanReflection ? "Edit reflection" : "Share reflection"}
            rhythmLabel="Shared Scripture rhythm"
          />
        ) : state.groupBiblePlan ? (
          <Card>
            <BodyText muted>No Bible Plan reading scheduled for today.</BodyText>
          </Card>
        ) : null}
        {groupPlanReflectionVisible && state.groupBiblePlan && groupPlanReading ? (
          <Card>
            <SectionHeading>Group reflection</SectionHeading>
            <BodyText muted>{groupPlanReading.passage.reference}</BodyText>
            <TextInputField
              multiline
              value={groupPlanReflectionText}
              onChangeText={setGroupPlanReflectionText}
              onSubmitEditing={submitGroupPlanReflection}
              placeholder="Share a brief reflection with your group..."
              returnKeyType="done"
              style={{ minHeight: 112 }}
              submitBehavior="submit"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <SecondaryButton onPress={() => setGroupPlanReflectionVisible(false)} style={{ flex: 1 }}>
                Cancel
              </SecondaryButton>
              <PrimaryButton disabled={!groupPlanReflectionText.trim()} icon="send" onPress={submitGroupPlanReflection} style={{ flex: 1 }}>
                Save
              </PrimaryButton>
            </View>
          </Card>
        ) : null}
        {visibleGroupPlanReflections.length > 0 ? (
          <Card>
            <SectionHeading>Shared reflections</SectionHeading>
            <View style={{ gap: 12 }}>
              {visibleGroupPlanReflections.map((reflection) => (
                <View key={reflection.id} style={{ gap: 4 }}>
                  <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                    {userById.get(reflection.userId) ?? "Someone"}
                  </Text>
                  <BodyText muted>{reflection.reflectionText}</BodyText>
                </View>
              ))}
            </View>
            {groupPlanReflections.length > visibleGroupPlanReflections.length ? (
              <BodyText muted>More reflections will be available here soon.</BodyText>
            ) : null}
          </Card>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <RhythmAction icon="edit-3" label="Write entry" onPress={() => openComposer("reflection", undefined, visibility.room)} />
          <RhythmAction icon="heart" label="Pray for someone" onPress={() => setMemberSelectVisible(true)} />
        </View>
      </View>

      {ownsGroup ? (
        <Card>
          <SectionHeading>Internal test</SectionHeading>
          <BodyText muted>{state.groupBiblePlan ? `Active group plan: ${state.groupBiblePlan.title}` : "No active group Bible plan."}</BodyText>
          <SecondaryButton icon="book-open" onPress={() => dispatch({ type: "createSampleGroupBiblePlan" })}>
            Create sample group plan
          </SecondaryButton>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHeading>{openPrayer ? "Someone to pray for" : "Open prayer"}</SectionHeading>
        <Card>
          {openPrayer ? (
            <>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>
                {openPrayer.type === "post" ? openPrayer.title || defaultTitle(openPrayer) : defaultTitle(openPrayer)}
              </Text>
              <BodyText muted numberOfLines={2}>{openPrayer.body}</BodyText>
              <LinkPreview text={openPrayer.body} />
              <PrimaryButton icon="heart" onPress={() => {
                const prayer = itemPrayerState(openPrayer);
                setPrayerTarget({ targetType: prayer.targetType, targetId: openPrayer.id, body: openPrayer.body });
              }}>
                Pray
              </PrimaryButton>
            </>
          ) : (
            <BodyText muted>No open prayer requests right now.</BodyText>
          )}
        </Card>
      </View>

      {state.authError ? (
        <Card>
          <BodyText muted>{state.authError}</BodyText>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHeading>Group Activity</SectionHeading>
      {recentActivity.length === 0 ? (
          <Card>
            <BodyText muted>This room is quiet right now. Start with a check-in or a small reflection.</BodyText>
          </Card>
      ) : (
        recentActivity.map((item) => {
          const authorName = userById.get(item.userId) ?? "Someone";
          const authorImage = userImageById.get(item.userId);
          const prayer = itemPrayerState(item);
          const replies = itemReplies(item);
          return (
            <PostCard
              key={`${item.type}-${item.id}`}
              authorImage={authorImage}
              authorName={authorName}
              item={item}
              ownsItem={item.userId === state.currentUserId}
              prayed={prayer.prayed}
              prayedBy={prayer.prayedBy}
              prayerCount={prayer.count}
              replyCount={replies.length}
              onOpen={() => router.push(`/feed/${item.type}/${item.id}` as never)}
              onEdit={() => {
                if (item.type === "post") openComposer(normalizeEntryKind(item.kind), item, visibility.room);
              }}
              onDelete={() => deleteItem(item)}
              onReply={() => router.push(`/feed/${item.type}/${item.id}` as never)}
              onPray={() => {
                if (prayer.prayed) {
                  dispatch({ type: "unpray", targetType: prayer.targetType, targetId: item.id });
                } else {
                  setPrayerTarget({ targetType: prayer.targetType, targetId: item.id, body: item.body });
                }
              }}
            />
          );
        })
      )}
      </View>

      <CheckInModal
        visible={checkInVisible}
        step={checkInStep}
        mood={mood}
        note={checkInText}
        verses={checkInVerses}
        roomName={group?.name ?? "Test Room"}
        roomImage={group?.image}
        share={shareCheckIn}
        onClose={() => setCheckInVisible(false)}
        onMood={(value) => {
          setMood(value);
          setCheckInStep("details");
        }}
        onNote={setCheckInText}
        onVerses={setCheckInVerses}
        onShare={setShareCheckIn}
        onBack={() => setCheckInStep("choose")}
        onSubmit={async () => {
          await dispatch({
            type: "submitCheckIn",
            mood,
            readToday: true,
            reflectionText: checkInText,
            visibility: shareCheckIn ? "group" : "private",
            verse: primaryBibleVerse(checkInVerses),
            verses: checkInVerses,
          });
          setCheckInStep("thanks");
        }}
        onDone={() => {
          setCheckInVisible(false);
          resetCheckIn();
        }}
      />

      <SharedComposer
        visible={composerVisible}
        context="today"
        kind={composerKind}
        entryVisibility={composerVisibility}
        title={composerTitle}
        body={composerBody}
        verses={composerVerses}
        editing={Boolean(editingItem)}
        onKind={setComposerKind}
        onVisibility={setComposerVisibility}
        onTitle={setComposerTitle}
        onBody={setComposerBody}
        onVerses={setComposerVerses}
        roomName={group?.name}
        roomImage={group?.image}
        onClose={() => {
          setComposerVisible(false);
          setEditingItem(undefined);
        }}
        onSubmit={submitComposer}
      />

      <PrayerMoment
        target={prayerTarget}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt, completedAt) => {
          if (prayerTarget) {
            dispatch({ type: "finishPrayer", targetType: prayerTarget.targetType, targetId: prayerTarget.targetId, status, startedAt, recipientUserId: prayerTarget.recipientUserId });
          }
          setPrayerTarget(undefined);
        }}
      />

      <Modal animationType="slide" visible={memberSelectVisible} onRequestClose={() => setMemberSelectVisible(false)}>
        <AppScreen>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <IconButton accessibilityLabel="Close" icon="arrow-left" onPress={() => setMemberSelectVisible(false)} />
            <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>Pray for someone</Text>
            <View style={{ width: 38 }} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900" }}>Who would you like to pray for?</Text>
            <BodyText muted>Select a member from your group.</BodyText>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            {state.users.filter((u) => u.id !== state.currentUserId).map((member) => (
              <Pressable
                accessibilityRole="button"
                key={member.id}
                onPress={() => {
                  setMemberSelectVisible(false);
                  setPrayerTarget({ targetType: "user", targetId: member.id, body: "", recipientUserId: member.id });
                }}
              >
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
            {state.users.filter((u) => u.id !== state.currentUserId).length === 0 ? (
              <Card>
                <BodyText muted>No other members in this group yet.</BodyText>
              </Card>
            ) : null}
          </ScrollView>
        </AppScreen>
      </Modal>
      </ScrollView>
    </AppScreen>
  );
}

function RhythmAction({ icon, label, onPress }: { icon: ComponentProps<typeof Feather>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexBasis: "47%", flexGrow: 1 }}>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 10, minHeight: 58, padding: 12 }}>
        <Feather name={icon} size={18} color={colors.olive} />
        <Text style={{ color: colors.ink, flex: 1, fontSize: 14, fontWeight: "900" }}>{label}</Text>
      </Card>
    </Pressable>
  );
}

function CheckInModal({
  visible,
  step,
  mood,
  note,
  verses,
  roomName,
  roomImage,
  share,
  onBack,
  onClose,
  onDone,
  onMood,
  onNote,
  onShare,
  onSubmit,
  onVerses,
}: {
  visible: boolean;
  step: CheckInStep;
  mood: number;
  note: string;
  verses: BibleVerse[];
  roomName: string;
  roomImage?: GroupImage;
  share: boolean;
  onBack: () => void;
  onClose: () => void;
  onDone: () => void;
  onMood: (value: number) => void;
  onNote: (value: string) => void;
  onShare: (value: boolean) => void;
  onSubmit: () => void;
  onVerses: (verses: BibleVerse[]) => void;
}) {
  const selectedMood = moodOptions.find((option) => option.value === mood) ?? moodOptions[1];
  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen>
        {step !== "thanks" ? (
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={step === "choose" ? onClose : onBack} />
            {step === "details" ? <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>Save</Text> : <View style={{ width: 38 }} />}
          </View>
        ) : null}

        {step === "choose" ? (
          <>
            <View style={{ gap: 7 }}>
              <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900" }}>How's your heart today?</Text>
              <BodyText muted>Take a moment to check in with God and with yourself.</BodyText>
            </View>
            <View style={{ gap: 10 }}>
              {moodOptions.map((option) => (
                <Pressable accessibilityRole="button" key={option.value} onPress={() => onMood(option.value)}>
                  <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, padding: 14 }}>
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.accentSubtle,
                        borderRadius: 999,
                        height: 40,
                        justifyContent: "center",
                        width: 40,
                      }}
                    >
                      <Ionicons name={option.icon} size={22} color={colors.olive} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{option.label}</Text>
                      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>{option.description}</Text>
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
            <SecondaryButton onPress={onClose}>Skip</SecondaryButton>
          </>
        ) : null}

        {step === "details" ? (
          <>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.accentSubtle,
                  borderRadius: 999,
                  height: 52,
                  justifyContent: "center",
                  width: 52,
                }}
              >
                <Ionicons name={selectedMood.icon} size={26} color={colors.olive} />
              </View>
              <View>
                <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>{selectedMood.label}</Text>
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{selectedMood.description}</Text>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <SectionHeading>Add a thought (optional)</SectionHeading>
              <TextInputField
                multiline
                maxLength={350}
                value={note}
                onChangeText={onNote}
                onSubmitEditing={onSubmit}
                placeholder="Thankful for a quiet morning and time with God."
                returnKeyType="send"
                submitBehavior="submit"
              />
              <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>{note.length}/350</Text>
            </View>
            <BibleVerseField verses={verses} onChange={onVerses} />
            <View style={{ gap: 8 }}>
              <SectionHeading>Share with</SectionHeading>
              <Pressable accessibilityRole="button" onPress={() => onShare(!share)}>
                <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
                  <RoomImage image={share ? roomImage : undefined} name={share ? roomName : "Private journal"} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{share ? roomName : "Private journal"}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{share ? "Shared with your room" : "Only you can see this"}</Text>
                  </View>
                  <Feather name="chevron-down" size={18} color={colors.muted} />
                </Card>
              </Pressable>
            </View>
            <PrimaryButton icon="send" onPress={onSubmit}>
              Post check-in
            </PrimaryButton>
          </>
        ) : null}

        {step === "thanks" ? (
          <View style={{ alignItems: "center", flex: 1, gap: 20, justifyContent: "center", minHeight: 560 }}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.accentSubtle,
                borderRadius: 999,
                height: 96,
                justifyContent: "center",
                width: 96,
              }}
            >
              <Feather name="feather" size={46} color={colors.gold} />
            </View>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>Thank you!</Text>
              <BodyText muted style={{ textAlign: "center" }}>
                Your check-in has been shared with {roomName}.
              </BodyText>
            </View>
            <PrimaryButton onPress={onDone} style={{ alignSelf: "stretch" }}>
              View in journal
            </PrimaryButton>
            <SecondaryButton onPress={onDone} style={{ alignSelf: "stretch" }}>
              Done
            </SecondaryButton>
          </View>
        ) : null}
      </AppScreen>
    </Modal>
  );
}


