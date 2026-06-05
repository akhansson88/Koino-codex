import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { BiblePlanReflectionEditor } from "@/features/bible-plan-reflection-editor";
import { biblePlanDayLabel, localDayKey, sortedBiblePlanReadings, todayBiblePlanReading } from "@/features/bible-plan-utils";
import { activePrivateCheckIns } from "@/state/check-ins";
import { defaultFeedTitle as productDefaultFeedTitle, feedItemLabel, heartMoods, moodLabel, normalizeEntryKind } from "@/state/product";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, FeedItem, GroupImage, HeartMood } from "@/state/types";
import {
  AppScreen,
  Avatar,
  AvatarStack,
  BodyText,
  Card,
  FullScreenModal,
  IconButton,
  PrimaryButton,
  RoomImage,
  SecondaryButton,
  SectionHeading,
  TextInputField,
} from "@/ui/app-components";
import { BibleVerseField, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { formatRelativeTime } from "@/ui/relative-time";
import { QuietActionCard, ScriptureRhythmCard } from "@/ui/rhythm-cards";
import { colors, platformShadow, radius } from "@/ui/theme";

type CheckInStep = "choose" | "details" | "thanks";
type FeatherName = ComponentProps<typeof Feather>["name"];

const fallbackPassage = "Philippians 2:1-11";

const moodTone: Record<HeartMood, { background: string; color: string; icon: FeatherName }> = {
  peaceful: { background: "#E5F0D8", color: "#58712D", icon: "feather" },
  grateful: { background: "#FFF0DE", color: "#B86B17", icon: "sun" },
  heavy: { background: "#EEF1F4", color: "#667085", icon: "cloud" },
  anxious: { background: "#FCE8DF", color: "#C45125", icon: "cloud-rain" },
  hopeful: { background: "#FFF2C7", color: "#B86B17", icon: "star" },
  tired: { background: "#ECE5FF", color: "#7253B8", icon: "moon" },
};

function firstName(name?: string) {
  return name?.trim().split(/\s+/)[0];
}

function moodNumber(mood?: HeartMood) {
  if (mood === "grateful") return 5;
  if (mood === "peaceful" || mood === "hopeful") return 4;
  if (mood === "heavy" || mood === "anxious" || mood === "tired") return 2;
  return 3;
}

function kindLabel(item: FeedItem) {
  return feedItemLabel(item);
}

function defaultTitle(item: FeedItem) {
  return productDefaultFeedTitle(item, moodLabel);
}

export function HomeScreen() {
  const { state, dispatch } = useKoino();
  const params = useLocalSearchParams<{ checkIn?: string }>();
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [checkInStep, setCheckInStep] = useState<CheckInStep>("choose");
  const [heartMood, setHeartMood] = useState<HeartMood>();
  const [checkInText, setCheckInText] = useState("");
  const [checkInVerses, setCheckInVerses] = useState<BibleVerse[]>([]);
  const [shareCheckIn, setShareCheckIn] = useState(true);
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const [memberSelectVisible, setMemberSelectVisible] = useState(false);
  const [groupPlanReflectionVisible, setGroupPlanReflectionVisible] = useState(false);
  const [groupPlanReflectionText, setGroupPlanReflectionText] = useState("");
  const lastCheckInParamRef = useRef<string | undefined>(undefined);

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const todayKey = localDayKey(new Date());
  const todaysCheckIn = [...state.checkIns, ...activePrivateCheckIns(state.privateCheckIns, state.journalEntries)].some(
    (item) => item.userId === state.currentUserId && item.groupId === state.currentGroupId && localDayKey(item.createdAt) === todayKey,
  );
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const userImageById = useMemo(() => new Map(state.users.map((user) => [user.id, user.image])), [state.users]);
  const communityMembers = useMemo(
    () =>
      state.memberships.map((membership) => {
        const member = state.users.find((candidate) => candidate.id === membership.userId);
        return {
          image: member?.image,
          name: member?.name ?? membership.userName,
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
  const latestCommunityItem = feedItems[0];
  const openPrayer = feedItems.find((item) => item.type === "post" && normalizeEntryKind(item.kind) === "prayer_request" && !item.answeredAt);
  const groupPlanReadings = useMemo(() => sortedBiblePlanReadings(state.groupBiblePlan), [state.groupBiblePlan]);
  const groupPlanReading = useMemo(() => todayBiblePlanReading(state.groupBiblePlan, todayKey), [state.groupBiblePlan, todayKey]);
  const currentGroupPlanProgress = useMemo(
    () =>
      groupPlanReading && state.currentUserId
        ? state.groupBiblePlanProgress.find((item) => item.userId === state.currentUserId && item.readingId === groupPlanReading.id)
        : undefined,
    [groupPlanReading, state.currentUserId, state.groupBiblePlanProgress],
  );
  const savedGroupPlanReflection = currentGroupPlanProgress?.reflectionText ?? "";
  const groupPlanCompletedByCurrentUser = Boolean(currentGroupPlanProgress?.read);
  const greeting = firstName(user?.name);

  function resetCheckIn() {
    setCheckInStep("choose");
    setHeartMood(undefined);
    setCheckInText("");
    setCheckInVerses([]);
    setShareCheckIn(true);
  }

  function openCheckIn() {
    resetCheckIn();
    setCheckInVisible(true);
  }

  useEffect(() => {
    if (!params.checkIn || params.checkIn === lastCheckInParamRef.current) return;
    lastCheckInParamRef.current = params.checkIn;
    openCheckIn();
  }, [params.checkIn]);

  function openGroupPlanReflection() {
    if (!state.groupBiblePlan || !groupPlanReading) {
      router.push({ pathname: "/(tabs)/me", params: { newEntry: Date.now().toString() } } as never);
      return;
    }
    setGroupPlanReflectionText(savedGroupPlanReflection);
    setGroupPlanReflectionVisible(true);
  }

  async function readGroupPlan() {
    if (state.groupBiblePlan && groupPlanReading) {
      await dispatch({
        type: "markGroupBiblePlanRead",
        planId: state.groupBiblePlan.id,
        readingId: groupPlanReading.id,
        dateKey: todayKey,
      });
    }
    router.push("/(tabs)/bible" as never);
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

  function openPrayerSurface() {
    if (openPrayer) {
      router.push(`/feed/post/${openPrayer.id}` as never);
      return;
    }
    setMemberSelectVisible(true);
  }

  function itemPrayerState(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    const reactions = state.prayerReactions.filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id);
    return {
      count: reactions.length,
      targetType,
    };
  }

  return (
    <AppScreen scroll={false} topInset={false}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 112, paddingTop: 18 }}
      >
        <View style={{ gap: 5 }}>
          <Text style={{ color: colors.ink, fontSize: 21, fontWeight: "900", lineHeight: 27 }}>
            {greeting ? `Good morning, ${greeting}` : "Good morning"}
          </Text>
          <BodyText muted>Take a quiet moment with God.</BodyText>
        </View>

        <HeartCheckInCard checkedIn={todaysCheckIn} onPress={openCheckIn} />

        <ScriptureRhythmCard
          completed={groupPlanCompletedByCurrentUser}
          onRead={readGroupPlan}
          onReflect={openGroupPlanReflection}
          passageReference={groupPlanReading?.passage.reference ?? fallbackPassage}
          progressLabel={groupPlanReading ? biblePlanDayLabel(groupPlanReading, groupPlanReadings.length) : "Day 1 of 3"}
          reflectLabel={savedGroupPlanReflection ? "Reflect" : "Reflect"}
          rhythmLabel="Today's Scripture rhythm"
        />

        {groupPlanReflectionVisible && state.groupBiblePlan && groupPlanReading ? (
          <BiblePlanReflectionEditor
            onCancel={() => setGroupPlanReflectionVisible(false)}
            onChangeText={setGroupPlanReflectionText}
            onSave={submitGroupPlanReflection}
            passageReference={groupPlanReading.passage.reference}
            placeholder="Write a brief reflection with your community..."
            saveIcon="send"
            title="Reflect"
            value={groupPlanReflectionText}
          />
        ) : null}

        <PrayerPreviewCard
          members={communityMembers}
          onPress={openPrayerSurface}
          openPrayer={openPrayer}
          userById={userById}
          userImageById={userImageById}
        />

        <CommunityPreviewCard
          item={latestCommunityItem}
          onOpen={(item) => router.push(`/feed/${item.type}/${item.id}` as never)}
          prayerCount={latestCommunityItem ? itemPrayerState(latestCommunityItem).count : 0}
          userById={userById}
          userImageById={userImageById}
        />

        {state.authError ? (
          <Card>
            <BodyText muted>{state.authError}</BodyText>
          </Card>
        ) : null}
      </ScrollView>

      <CheckInModal
        visible={checkInVisible}
        step={checkInStep}
        mood={heartMood}
        note={checkInText}
        verses={checkInVerses}
        roomName={group?.name ?? "Koinonia"}
        roomImage={group?.image}
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
        onSubmit={async () => {
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
          setCheckInStep("thanks");
        }}
        onDone={() => {
          setCheckInVisible(false);
          resetCheckIn();
        }}
      />

      <PrayerMoment
        target={prayerTarget}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt, completedAt) => {
          if (prayerTarget) {
            dispatch({
              type: "finishPrayer",
              targetType: prayerTarget.targetType,
              targetId: prayerTarget.targetId,
              status,
              startedAt,
              recipientUserId: prayerTarget.recipientUserId,
            });
          }
          setPrayerTarget(undefined);
        }}
      />

      <FullScreenModal animationType="slide" visible={memberSelectVisible} onRequestClose={() => setMemberSelectVisible(false)}>
        <AppScreen>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <IconButton accessibilityLabel="Close" icon="arrow-left" onPress={() => setMemberSelectVisible(false)} />
            <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>Pray for someone</Text>
            <View style={{ width: 38 }} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900" }}>Who would you like to pray for?</Text>
            <BodyText muted>Select a member from your community.</BodyText>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            {state.users
              .filter((member) => member.id !== state.currentUserId)
              .map((member) => (
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
            {state.users.filter((member) => member.id !== state.currentUserId).length === 0 ? (
              <Card>
                <BodyText muted>No other members in this community yet.</BodyText>
              </Card>
            ) : null}
          </ScrollView>
        </AppScreen>
      </FullScreenModal>
    </AppScreen>
  );
}

function HeartCheckInCard({ checkedIn, onPress }: { checkedIn: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, minHeight: 90, padding: 14 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>How is your heart today?</Text>
          <BodyText muted>{checkedIn ? "You checked in today. You can still pause with God." : "Check in and invite God into your day."}</BodyText>
        </View>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.accentSubtle,
            borderRadius: 16,
            height: 56,
            justifyContent: "center",
            width: 56,
          }}
        >
          <Feather name="plus" size={25} color={colors.olive} />
        </View>
      </Card>
    </Pressable>
  );
}

function PrayerPreviewCard({
  members,
  onPress,
  openPrayer,
  userById,
  userImageById,
}: {
  members: { image?: GroupImage; name: string }[];
  onPress: () => void;
  openPrayer?: FeedItem;
  userById: Map<string, string>;
  userImageById: Map<string, GroupImage | undefined>;
}) {
  const previewUsers =
    openPrayer && openPrayer.type === "post"
      ? [{ image: userImageById.get(openPrayer.userId), name: userById.get(openPrayer.userId) ?? "Someone" }, ...members]
      : members;

  return (
    <QuietActionCard icon="heart" onPress={onPress} subtitle="See and pray for someone" title="Someone needs prayer">
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        {previewUsers.length ? <AvatarStack users={previewUsers} size={32} /> : <BodyText muted>No open prayer requests right now.</BodyText>}
        {previewUsers.length > 4 ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "900" }}>+{previewUsers.length - 4}</Text> : null}
      </View>
    </QuietActionCard>
  );
}

function CommunityPreviewCard({
  item,
  onOpen,
  prayerCount,
  userById,
  userImageById,
}: {
  item?: FeedItem;
  onOpen: (item: FeedItem) => void;
  prayerCount: number;
  userById: Map<string, string>;
  userImageById: Map<string, GroupImage | undefined>;
}) {
  if (!item) {
    return (
      <QuietActionCard icon="users" subtitle="Take a moment to pray or reflect." title="Latest from your community">
        <BodyText muted>Nothing new right now.</BodyText>
      </QuietActionCard>
    );
  }

  const authorName = userById.get(item.userId) ?? "Someone";
  return (
    <Pressable accessibilityRole="button" onPress={() => onOpen(item)}>
      <Card style={{ gap: 12, padding: 14 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Text style={{ color: colors.ink, flex: 1, fontSize: 16, fontWeight: "900" }}>Latest from your community</Text>
          <Feather name="chevron-right" size={19} color={colors.muted} />
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Avatar image={userImageById.get(item.userId)} name={authorName} size={36} tone="green" />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, flex: 1, fontSize: 14, fontWeight: "900" }}>
                {authorName}
              </Text>
              <Text style={{ color: colors.olive, fontSize: 12, fontWeight: "900" }}>{kindLabel(item)}</Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
        </View>
        <View style={{ gap: 5 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>
            {item.type === "post" ? item.title || defaultTitle(item) : defaultTitle(item)}
          </Text>
          <BodyText muted numberOfLines={2}>
            {item.body || "No words today, just presence."}
          </BodyText>
        </View>
        {prayerCount > 0 ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
            <Feather name="heart" size={14} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{prayerCount} prayed</Text>
          </View>
        ) : null}
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
  mood?: HeartMood;
  note: string;
  verses: BibleVerse[];
  roomName: string;
  roomImage?: GroupImage;
  share: boolean;
  onBack: () => void;
  onClose: () => void;
  onDone: () => void;
  onMood: (value: HeartMood) => void;
  onNote: (value: string) => void;
  onShare: (value: boolean) => void;
  onSubmit: () => void;
  onVerses: (verses: BibleVerse[]) => void;
}) {
  const selectedMood = heartMoods.find((option) => option.value === mood);

  return (
    <FullScreenModal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={step === "details" ? onBack : onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ backgroundColor: colors.cream, flex: 1 }}>
        <AppScreen topInset>
          {step !== "thanks" ? (
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={step === "choose" ? onClose : onBack} />
              {step === "details" ? (
                <Pressable accessibilityRole="button" onPress={onSubmit} style={{ padding: 8 }}>
                  <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>Save</Text>
                </Pressable>
              ) : (
                <View style={{ width: 38 }} />
              )}
            </View>
          ) : null}

          {step === "choose" ? (
            <>
              <View style={{ gap: 7 }}>
                <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31 }}>How is your heart today?</Text>
                <BodyText muted>Choose how your heart feels right now.</BodyText>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {heartMoods.map((option) => (
                  <MoodOptionCard key={option.value} option={option} selected={option.value === mood} onPress={() => onMood(option.value)} />
                ))}
              </View>
              <SecondaryButton onPress={onClose}>Skip</SecondaryButton>
            </>
          ) : null}

          {step === "details" ? (
            <>
              <View style={{ gap: 7 }}>
                <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31 }}>What's on your heart?</Text>
                <BodyText muted>Be honest. God already knows.</BodyText>
              </View>
              <View style={{ gap: 6 }}>
                <TextInputField
                  multiline
                  maxLength={350}
                  value={note}
                  onChangeText={(value) => onNote(value.slice(0, 350))}
                  onSubmitEditing={onSubmit}
                  placeholder="Write your thoughts..."
                  returnKeyType="send"
                  style={{ minHeight: 210 }}
                  submitBehavior="submit"
                />
                <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>{note.length}/350</Text>
              </View>
              {selectedMood ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                  <MoodIcon mood={selectedMood.value} size={34} />
                  <Text style={{ color: colors.muted, flex: 1, fontSize: 13, fontWeight: "800" }}>{selectedMood.label}</Text>
                </View>
              ) : null}
              <BibleVerseField label="Add Scripture (optional)" verses={verses} onChange={onVerses} />
              <View style={{ gap: 8, marginTop: 8 }}>
                <SectionHeading>Share with</SectionHeading>
                <Pressable accessibilityRole="button" onPress={() => onShare(!share)}>
                  <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
                    <RoomImage image={share ? roomImage : undefined} name={share ? roomName : "Private journal"} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{share ? roomName : "Private journal"}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                        {share ? "Shared with your room" : "Only you can see this"}
                      </Text>
                    </View>
                    <Feather name="chevron-down" size={18} color={colors.muted} />
                  </Card>
                </Pressable>
              </View>
              <PrimaryButton icon="send" onPress={onSubmit} style={{ minHeight: 58 }}>
                {share ? "Share check-in" : "Save privately"}
              </PrimaryButton>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" }}>
                <Feather name="lock" size={13} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {share ? "This will be shared with your room" : "This will stay in your private journal"}
                </Text>
              </View>
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
                <Feather name="heart" size={42} color={colors.gold} />
              </View>
              <View style={{ alignItems: "center", gap: 8 }}>
                <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>Check-in shared</Text>
                <BodyText muted style={{ textAlign: "center" }}>
                  Thank you for taking a quiet moment with God.
                </BodyText>
              </View>
              <PrimaryButton onPress={onDone} style={{ alignSelf: "stretch" }}>
                Done
              </PrimaryButton>
            </View>
          ) : null}
        </AppScreen>
      </KeyboardAvoidingView>
    </FullScreenModal>
  );
}

function MoodOptionCard({
  onPress,
  option,
  selected,
}: {
  onPress: () => void;
  option: (typeof heartMoods)[number];
  selected: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ flexBasis: "47%", flexGrow: 1 }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: selected ? colors.accentSubtle : colors.paper,
          borderColor: selected ? colors.gold : colors.line,
          borderRadius: radius.lg,
          borderWidth: 1,
          gap: 10,
          minHeight: 136,
          padding: 12,
          ...platformShadow({
            boxShadow: "0 8px 18px rgba(11, 18, 32, 0.04)",
            offset: { width: 0, height: 8 },
            opacity: 0.04,
            radius: 18,
          }),
        }}
      >
        <MoodIcon mood={option.value} />
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900", textAlign: "center" }}>{option.label}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, textAlign: "center" }}>{option.description}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function MoodIcon({ mood, size = 48 }: { mood: HeartMood; size?: number }) {
  const tone = moodTone[mood];
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: tone.background,
        borderRadius: 999,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Feather name={tone.icon} size={Math.round(size * 0.45)} color={tone.color} />
    </View>
  );
}
