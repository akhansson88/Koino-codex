import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { CheckInModal, type CheckInStep, moodNumber } from "@/features/check-in-modal";
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
} from "@/ui/app-components";
import { primaryBibleVerse } from "@/ui/bible-verse-picker";
import { prayerCountLabel } from "@/ui/prayer-copy";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { formatRelativeTime } from "@/ui/relative-time";
import { QuietActionCard } from "@/ui/rhythm-cards";
import { colors } from "@/ui/theme";

function firstName(name?: string) {
  return name?.trim().split(/\s+/)[0];
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
                    setPrayerTarget({
                      targetType: "user",
                      targetId: member.id,
                      body: "",
                      recipientUserId: member.id,
                      recipientName: member.name,
                      recipientImage: member.image,
                    });
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
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{prayerCountLabel(prayerCount)}</Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

