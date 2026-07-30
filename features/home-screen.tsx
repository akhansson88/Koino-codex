import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { CheckInModal, type CheckInStep, moodNumber } from "@/features/check-in-modal";
import { activePrivateCheckIns } from "@/state/check-ins";
import { normalizeEntryKind } from "@/state/product";
import { useKoino } from "@/state/koino-store";
import { prayerReactionsForTarget } from "@/state/prayer-reactions";
import {
  selectCommunityContent,
  selectHomePrayerQueueIds,
  selectLatestHomeCommunityItem,
  selectOpenPrayerRequests,
} from "@/state/selectors/community-content";
import type { BibleVerse, FeedItem, GroupImage, HeartMood } from "@/state/types";
import {
  AppScreen,
  Avatar,
  AvatarStack,
  BodyText,
  Card,
  FullScreenModal,
  IconButton,
  VerseList,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { primaryBibleVerse } from "@/ui/bible-verse-picker";
import { communityDefaultFeedTitle, communityFeedItemLabel, communityPrayerMomentDisplayCopy, communityPrayerNoun, communitySystemError } from "@/ui/community-copy";
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

export function HomeScreen() {
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
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
  const communityContent = useMemo(() => {
    return selectCommunityContent({
      checkIns: state.checkIns,
      groupId: state.currentGroupId,
      posts: state.posts,
    });
  }, [state.checkIns, state.currentGroupId, state.posts]);
  const latestCommunityItem = useMemo(
    () => selectLatestHomeCommunityItem(communityContent, state.currentUserId),
    [communityContent, state.currentUserId],
  );
  const openPrayerRequests = useMemo(() => selectOpenPrayerRequests(communityContent), [communityContent]);
  const homePrayerQueueIds = useMemo(
    () => selectHomePrayerQueueIds(communityContent, state.currentUserId, state.prayerReactions),
    [communityContent, state.currentUserId, state.prayerReactions],
  );
  const openPrayer = useMemo(
    () => openPrayerRequests.find((item) => item.id === homePrayerQueueIds[0]),
    [homePrayerQueueIds, openPrayerRequests],
  );
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
    if (openPrayer && state.currentGroupId) {
      router.push({
        pathname: "/home/[groupId]/prayer",
        params: { groupId: state.currentGroupId },
      } as never);
      return;
    }
    setMemberSelectVisible(true);
  }

  function openCommunityItem(item: FeedItem) {
    if (item.type === "post" && normalizeEntryKind(item.kind) === "prayer_request") {
      router.push({
        pathname: "/community/[groupId]/prayers/[prayerRequestId]",
        params: { groupId: item.groupId, prayerRequestId: item.id },
      } as never);
      return;
    }
    router.push(`/feed/${item.type}/${item.id}` as never);
  }

  function itemPrayerState(item: FeedItem) {
    const targetType: "post" | "check_in" = item.type === "post" ? "post" : "check_in";
    const reactions = prayerReactionsForTarget(state.prayerReactions, targetType, item.id);
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
            {t(greeting ? "home.greeting.named" : "home.greeting.default", greeting ? { name: greeting } : undefined)}
          </Text>
          <BodyText muted>{t("home.greeting.subtitle")}</BodyText>
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
          onOpen={openCommunityItem}
          prayerCount={latestCommunityItem ? itemPrayerState(latestCommunityItem).count : 0}
          userById={userById}
          userImageById={userImageById}
        />

        {state.authError ? (
          <Card>
            <BodyText muted>{communitySystemError(state.authError, t)}</BodyText>
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
            <IconButton accessibilityLabel={t("common.close")} icon="arrow-left" onPress={() => setMemberSelectVisible(false)} />
            <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>{t("community.prayer.prayForSomeone")}</Text>
            <View style={{ width: 38 }} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900" }}>{t("community.prayer.memberPromptTitle")}</Text>
            <BodyText muted>{t("community.prayer.memberPromptBody")}</BodyText>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            {state.users
              .filter((member) => member.id !== state.currentUserId)
              .map((member) => (
                <Pressable
                  accessibilityLabel={t("community.prayer.actions.prayForPerson", { name: member.name })}
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
                      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>
                        {t("community.prayer.actions.prayForPerson", { name: member.name })}
                      </Text>
                    </View>
                    <Feather name="heart" size={18} color={colors.gold} />
                  </Card>
                </Pressable>
              ))}
            {state.users.filter((member) => member.id !== state.currentUserId).length === 0 ? (
              <Card>
                <BodyText muted>{t("community.prayer.noOtherMembers")}</BodyText>
              </Card>
            ) : null}
          </ScrollView>
        </AppScreen>
      </FullScreenModal>
    </AppScreen>
  );
}

function HeartCheckInCard({ checkedIn, onPress }: { checkedIn: boolean; onPress: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, minHeight: 90, padding: 14 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{t("community.checkIn.promptTitle")}</Text>
          <BodyText muted>{t(checkedIn ? "home.checkIn.completedHint" : "home.checkIn.promptHint")}</BodyText>
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
  const { t } = useAppTranslation();
  const previewUsers =
    openPrayer && openPrayer.type === "post"
      ? [{ image: userImageById.get(openPrayer.userId), name: userById.get(openPrayer.userId) ?? t("common.someone") }, ...members]
      : members;

  return (
    <QuietActionCard icon="heart" onPress={onPress} subtitle={t("home.prayerPreview.subtitle")} title={t("home.prayerPreview.title")}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        {previewUsers.length ? <AvatarStack users={previewUsers} size={32} /> : <BodyText muted>{t("home.prayerPreview.empty")}</BodyText>}
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
  const { language, t } = useAppTranslation();
  if (!item) {
    return (
      <QuietActionCard icon="users" subtitle={t("home.communityPreview.subtitle")} title={t("home.communityPreview.title")}>
        <BodyText muted>{t("home.communityPreview.empty")}</BodyText>
      </QuietActionCard>
    );
  }

  const authorName = userById.get(item.userId) ?? t("common.someone");
  const displayCopy = item.type === "post" ? communityPrayerMomentDisplayCopy(item, t) : { body: item.body, title: undefined };
  const isScripture = item.type === "post" && normalizeEntryKind(item.kind) === "scripture";
  const hasPersonalNote = Boolean(displayCopy.body.trim());
  return (
    <Pressable accessibilityRole="button" onPress={() => onOpen(item)}>
      <Card style={{ gap: 12, padding: 14 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Text style={{ color: colors.ink, flex: 1, fontSize: 16, fontWeight: "900" }}>{t("home.communityPreview.title")}</Text>
          <Feather name="chevron-right" size={19} color={colors.muted} />
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Avatar image={userImageById.get(item.userId)} name={authorName} size={36} tone="green" />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, flex: 1, fontSize: 14, fontWeight: "900" }}>
                {authorName}
              </Text>
              <Text style={{ color: colors.olive, fontSize: 12, fontWeight: "900" }}>{communityFeedItemLabel(item, t)}</Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt, language)}</Text>
          </View>
        </View>
        {!isScripture || hasPersonalNote ? (
          <View style={{ gap: 5 }}>
            {!isScripture ? (
              <Text numberOfLines={item.type === "check_in" ? undefined : 2} style={{ color: colors.ink, flexShrink: 1, fontSize: 15, fontWeight: "900" }}>
                {displayCopy.title || communityDefaultFeedTitle(item, t)}
              </Text>
            ) : null}
            <BodyText muted numberOfLines={2}>
              {displayCopy.body || t("community.card.noWords")}
            </BodyText>
          </View>
        ) : null}
        {isScripture ? <VerseList compact verse={item.verse} verses={item.verses} /> : null}
        {prayerCount > 0 ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
            <Feather name="heart" size={14} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>
              {prayerCount} {communityPrayerNoun(prayerCount, t)}
            </Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

