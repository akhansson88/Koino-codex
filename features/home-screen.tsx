import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckInModal, type CheckInStep, moodNumber } from "@/features/check-in-modal";
import { CommunityEncryptionNotice } from "@/features/community/encryption-notice";
import { primaryBibleVerse } from "@/features/bible-verse-utils";
import { markStartupMilestone } from "@/features/startup-performance";
import { checkInForDay } from "@/state/check-ins";
import { normalizeEntryKind } from "@/state/product";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
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
  VersePreviewCard,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityDefaultFeedTitle, communityFeedItemLabel, communityPrayerMomentDisplayCopy, communityPrayerNoun, communitySystemError } from "@/ui/community-copy";
import { DirectPrayerResultSheet, type DirectPrayerResult } from "@/ui/direct-prayer-result-sheet";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { formatRelativeTime } from "@/ui/relative-time";
import { QuietActionCard } from "@/ui/rhythm-cards";
import { colors, radius, typography } from "@/ui/theme";

function firstName(name?: string) {
  return name?.trim().split(/\s+/)[0];
}

type HomeGreetingPeriod = "morning" | "afternoon" | "evening" | "fallback";

const homeGreetingKeys = {
  morning: { default: "home.greeting.morning.default", named: "home.greeting.morning.named" },
  afternoon: { default: "home.greeting.afternoon.default", named: "home.greeting.afternoon.named" },
  evening: { default: "home.greeting.evening.default", named: "home.greeting.evening.named" },
  fallback: { default: "home.greeting.default", named: "home.greeting.named" },
} as const;

function homeGreetingPeriodAt(date: Date): HomeGreetingPeriod {
  const hour = date.getHours();
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "fallback";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function HomeScreen() {
  const state = useKoinoFields(["authError", "checkIns", "checkInDailyClaims", "checkInDailyClaimsReady", "communityFeedError", "communityFeedGroupId", "communityFeedReady", "currentGroupId", "currentUserId", "groups", "memberships", "posts", "prayerReactions", "privateCheckIns", "privateCheckInsReady", "profileReady", "userGroupsReady", "users"]);
  const { dispatch } = useKoinoActions();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ checkIn?: string }>();
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [checkInStep, setCheckInStep] = useState<CheckInStep>("choose");
  const [heartMood, setHeartMood] = useState<HeartMood>();
  const [checkInText, setCheckInText] = useState("");
  const [checkInVerses, setCheckInVerses] = useState<BibleVerse[]>([]);
  const [shareCheckIn, setShareCheckIn] = useState(false);
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const [directPrayerResult, setDirectPrayerResult] = useState<DirectPrayerResult>();
  const [memberSelectVisible, setMemberSelectVisible] = useState(false);
  const [greetingPeriod, setGreetingPeriod] = useState<HomeGreetingPeriod>(() => homeGreetingPeriodAt(new Date()));
  const lastCheckInParamRef = useRef<string | undefined>(undefined);
  const directPrayerPersistencePendingRef = useRef(false);

  useEffect(() => {
    markStartupMilestone("firstScreenMounted", "home");
  }, []);

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const communityMigrationPending = Boolean(group?.migrationPending);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const todayKey = localDayKey(new Date());
  const moderatedToday = state.checkInDailyClaims.some(claim => claim.dayKey === todayKey && claim.moderated);
  const todaysCheckIn = checkInForDay([...state.checkIns, ...state.privateCheckIns], state.currentUserId, state.currentGroupId, todayKey);
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
  const directPrayerMembers = useMemo(
    () => state.users.filter((member) => member.id !== state.currentUserId),
    [state.currentUserId, state.users],
  );
  const communityFeedReadyForGroup = Boolean(
    state.currentGroupId && state.communityFeedGroupId === state.currentGroupId && state.communityFeedReady,
  );
  const profileLoading = Boolean(state.currentUserId && !state.profileReady);
  useEffect(() => {
    if (state.currentUserId && state.profileReady && state.userGroupsReady) {
      markStartupMilestone("homeContentReady", "profile-and-membership-rendered");
    }
  }, [state.currentUserId, state.profileReady, state.userGroupsReady]);
  const communityContentLoading =
    profileLoading ||
    !state.userGroupsReady ||
    Boolean(state.currentGroupId && !state.communityFeedError && !communityFeedReadyForGroup);
  const checkInStatusReady = Boolean(
    !communityMigrationPending &&
    state.currentUserId &&
    state.currentGroupId &&
    state.profileReady &&
    state.userGroupsReady &&
    state.privateCheckInsReady &&
    state.checkInDailyClaimsReady &&
    !state.communityFeedError &&
    communityFeedReadyForGroup,
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
  const greetingName = firstName(user?.name);
  const greetingKey = homeGreetingKeys[greetingPeriod][greetingName ? "named" : "default"];

  const refreshGreetingPeriod = useCallback(() => {
    setGreetingPeriod(homeGreetingPeriodAt(new Date()));
  }, []);

  useFocusEffect(refreshGreetingPeriod);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refreshGreetingPeriod();
    });
    return () => subscription.remove();
  }, [refreshGreetingPeriod]);

  function resetCheckIn() {
    setCheckInStep("choose");
    setHeartMood(undefined);
    setCheckInText("");
    setCheckInVerses([]);
    setShareCheckIn(false);
  }

  function openCheckIn() {
    if (!checkInStatusReady || todaysCheckIn || moderatedToday) return;
    resetCheckIn();
    setCheckInVisible(true);
  }

  useEffect(() => {
    if (!params.checkIn || params.checkIn === lastCheckInParamRef.current || !checkInStatusReady) return;
    lastCheckInParamRef.current = params.checkIn;
    openCheckIn();
  }, [params.checkIn, checkInStatusReady, todaysCheckIn]);

  function openPrayerSurface() {
    if (communityMigrationPending || communityContentLoading) return;
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

  async function finishDirectPrayer(status: "completed" | "skipped", startedAt: string) {
    const target = prayerTarget;
    setPrayerTarget(undefined);
    if (!target || directPrayerPersistencePendingRef.current) return;

    const recipientName =
      target.recipientName?.trim() ||
      (target.recipientUserId ? userById.get(target.recipientUserId) : undefined) ||
      t("common.someone");
    const resultPerson = { recipientImage: target.recipientImage, recipientName };
    const recipientIsAvailable =
      Boolean(target.recipientUserId) &&
      (target.recipientUserId === state.currentUserId || state.users.some((member) => member.id === target.recipientUserId));
    if (
      !state.currentUserId ||
      target.targetType !== "user" ||
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

    try {
      await dispatch({
        type: "finishPrayer",
        targetType: target.targetType,
        targetId: target.targetId,
        status,
        startedAt,
        recipientUserId: target.recipientUserId,
        throwOnError: true,
      });
      setDirectPrayerResult(status === "completed" ? { ...resultPerson, status: "completed" } : undefined);
    } catch {
      setDirectPrayerResult({ ...resultPerson, status: "failed" });
    } finally {
      directPrayerPersistencePendingRef.current = false;
    }
  }

  return (
    <AppScreen scroll={false} topInset={false}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: Math.max(112, insets.bottom + 92), paddingTop: 18 }}
      >
        {profileLoading ? (
          <ProfileGreetingSkeleton />
        ) : (
          <View style={{ gap: 5 }}>
            <Text style={{ color: colors.ink, fontSize: 21, fontWeight: "900", lineHeight: 27 }}>
              {t(greetingKey, greetingName ? { name: greetingName } : undefined)}
            </Text>
            <BodyText muted>{t("home.greeting.subtitle")}</BodyText>
          </View>
        )}

        {checkInStatusReady && moderatedToday ? <Card><BodyText muted>{t("community.moderation.checkInRemoved")}</BodyText></Card> : checkInStatusReady ? todaysCheckIn ? (
          <CompletedHeartCheckInCard
            shared={todaysCheckIn.visibility === "group"}
            communityName={group?.name ?? t("tabs.community")}
            onPress={() => router.push({ pathname: "/me/[id]", params: { id: todaysCheckIn.id } })}
          />
        ) : <HeartCheckInCard onPress={openCheckIn} /> : null}

        {communityMigrationPending ? <Card style={{ gap: 8 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{group?.name}</Text>
          {group ? <CommunityEncryptionNotice group={group} /> : null}
          <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/community" as never)}>
            <Text style={[typography.label, { color: colors.olive }]}>{t("community.rooms.open")}</Text>
          </Pressable>
        </Card> : <><PrayerPreviewCard
          members={communityMembers}
          loading={communityContentLoading}
          onPress={openPrayerSurface}
          openPrayer={openPrayer}
          userById={userById}
          userImageById={userImageById}
        />

        <CommunityPreviewCard
          item={latestCommunityItem}
          loading={communityContentLoading}
          onOpen={openCommunityItem}
          prayerCount={latestCommunityItem ? itemPrayerState(latestCommunityItem).count : 0}
          userById={userById}
          userImageById={userImageById}
        /></>}

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
        onFinish={(status, startedAt) => {
          void finishDirectPrayer(status, startedAt);
        }}
      />

      <DirectPrayerResultSheet onDone={() => setDirectPrayerResult(undefined)} result={directPrayerResult} />

      <FullScreenModal animationType="slide" visible={memberSelectVisible} onRequestClose={() => setMemberSelectVisible(false)}>
        <AppScreen>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <IconButton accessibilityLabel={t("common.close")} icon="arrow-left" onPress={() => setMemberSelectVisible(false)} />
            <Text style={[typography.sectionLabel, { color: colors.olive }]}>{t("community.prayer.prayForSomeone")}</Text>
            <View style={{ width: 38 }} />
          </View>
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={[typography.heading, { color: colors.ink }]}>
              {t("community.prayer.memberPromptTitle")}
            </Text>
            <BodyText muted>{t("community.prayer.memberPromptBody")}</BodyText>
          </View>
          <View style={{ gap: 10 }}>
            {directPrayerMembers.map((member) => (
                <Pressable
                  accessibilityLabel={t("community.prayer.actions.prayForPerson", { name: member.name })}
                  accessibilityRole="button"
                  key={member.id}
                  onPress={() => {
                    setMemberSelectVisible(false);
                    setDirectPrayerResult(undefined);
                    setPrayerTarget({
                      targetType: "user",
                      targetId: member.id,
                      body: "",
                      recipientUserId: member.id,
                      recipientName: member.name,
                      recipientImage: member.image,
                    });
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
                >
                  <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, padding: 14 }}>
                    <Avatar image={member.image} name={member.name} size={46} tone="green" />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={[typography.cardTitle, { color: colors.ink }]}>
                        {member.name}
                      </Text>
                      <Text style={[typography.label, { color: colors.muted }]}>
                        {t("community.prayer.actions.prayForPerson", { name: member.name })}
                      </Text>
                    </View>
                    <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
                      <Feather name="heart" size={18} color={colors.gold} />
                    </View>
                  </Card>
                </Pressable>
              ))}
            {directPrayerMembers.length === 0 ? (
              <Card>
                <BodyText muted>{t("community.prayer.noOtherMembers")}</BodyText>
              </Card>
            ) : null}
          </View>
        </AppScreen>
      </FullScreenModal>
    </AppScreen>
  );
}

function ProfileGreetingSkeleton() {
  return (
    <View accessibilityLabel="Loading profile" accessibilityRole="progressbar" style={{ gap: 8, minHeight: 51 }}>
      <View style={{ backgroundColor: colors.line, borderRadius: 8, height: 22, width: 190 }} />
      <View style={{ backgroundColor: colors.line, borderRadius: 7, height: 14, width: 250 }} />
    </View>
  );
}

function CompletedHeartCheckInCard({ shared, communityName, onPress }: { shared: boolean; communityName: string; onPress: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Card style={{ gap: 6, padding: 14 }}>
      <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("home.checkIn.title")}</Text>
      <BodyText muted>{t("home.checkIn.completed")}</BodyText>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
        <Feather name={shared ? "users" : "lock"} size={14} color={colors.muted} />
        <Text style={[typography.caption, { color: colors.muted }]}>
          {shared ? t("community.checkIn.sharedWithCommunity", { name: communityName }) : t("home.checkIn.private")}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={[typography.label, { color: colors.olive }]}>{t("home.checkIn.view")}</Text>
      </Pressable>
    </Card>
  );
}

function HeartCheckInCard({ onPress }: { onPress: () => void }) {
  const { t } = useAppTranslation();
  const hintKey = "home.checkIn.promptHint";
  return (
    <Pressable
      accessibilityHint={t(hintKey)}
      accessibilityLabel={t("community.checkIn.promptTitle")}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
    >
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, minHeight: 90, padding: 14 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("community.checkIn.promptTitle")}</Text>
          <BodyText muted>{t(hintKey)}</BodyText>
        </View>
        <View
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            alignItems: "center",
            backgroundColor: colors.accentSubtle,
            borderRadius: radius.lg,
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
  loading,
  members,
  onPress,
  openPrayer,
  userById,
  userImageById,
}: {
  loading: boolean;
  members: { image?: GroupImage; name: string }[];
  onPress: () => void;
  openPrayer?: FeedItem;
  userById: Map<string, string>;
  userImageById: Map<string, GroupImage | undefined>;
}) {
  const { t } = useAppTranslation();
  const openPrayerAuthor =
    openPrayer && openPrayer.type === "post"
      ? { image: userImageById.get(openPrayer.userId), name: userById.get(openPrayer.userId) ?? t("common.someone") }
      : undefined;
  const previewUsers =
    openPrayerAuthor ? [openPrayerAuthor] : members;
  const subtitle = loading
    ? t("home.prayerPreview.loading")
    : openPrayerAuthor
      ? t("home.prayerPreview.openSubtitle", { name: openPrayerAuthor.name })
      : t("home.prayerPreview.subtitle");
  const accessibilityHint = openPrayerAuthor
    ? t("home.prayerPreview.openHint", { name: openPrayerAuthor.name })
    : t("home.prayerPreview.fallbackHint");

  return (
    <QuietActionCard
      accessibilityHint={loading ? t("home.prayerPreview.loading") : accessibilityHint}
      accessibilityLabel={t("home.prayerPreview.title")}
      disabled={loading}
      icon="heart"
      onPress={onPress}
      subtitle={subtitle}
      title={t("home.prayerPreview.title")}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        {loading ? (
          <ActivityIndicator accessibilityLabel={t("home.prayerPreview.loading")} color={colors.olive} />
        ) : previewUsers.length ? (
          <AvatarStack users={previewUsers} size={32} />
        ) : (
          <BodyText muted>{t("home.prayerPreview.empty")}</BodyText>
        )}
      </View>
    </QuietActionCard>
  );
}

function CommunityPreviewCard({
  item,
  loading,
  onOpen,
  prayerCount,
  userById,
  userImageById,
}: {
  item?: FeedItem;
  loading: boolean;
  onOpen: (item: FeedItem) => void;
  prayerCount: number;
  userById: Map<string, string>;
  userImageById: Map<string, GroupImage | undefined>;
}) {
  const { language, t } = useAppTranslation();
  if (loading) {
    return (
      <QuietActionCard icon="users" subtitle={t("home.communityPreview.loading")} title={t("home.communityPreview.title")}>
        <View
          accessibilityLabel={t("home.communityPreview.loading")}
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
          style={{ alignItems: "flex-start" }}
        >
          <ActivityIndicator color={colors.olive} />
        </View>
      </QuietActionCard>
    );
  }
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
  const itemLabel = communityFeedItemLabel(item, t);
  const displayTitle = displayCopy.title || communityDefaultFeedTitle(item, t);
  const accessibilityTitle = isScripture && hasPersonalNote ? displayCopy.body : displayTitle;
  return (
    <Pressable
      accessibilityHint={t("home.communityPreview.openHint")}
      accessibilityLabel={t("home.communityPreview.accessibilityLabel", {
        author: authorName,
        title: accessibilityTitle,
        type: itemLabel,
      })}
      accessibilityRole="button"
      onPress={() => onOpen(item)}
      style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
    >
      <Card style={{ gap: 12, padding: 14 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Text style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{t("home.communityPreview.title")}</Text>
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Feather name="chevron-right" size={19} color={colors.muted} />
          </View>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Avatar image={userImageById.get(item.userId)} name={authorName} size={36} tone="green" />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
              <Text numberOfLines={1} style={[typography.label, { color: colors.ink, flex: 1 }]}>
                {authorName}
              </Text>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.olive, fontWeight: "700" }]}>
                {itemLabel}
              </Text>
            </View>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.muted, fontWeight: "700" }]}>
              {formatRelativeTime(item.createdAt, language)}
            </Text>
          </View>
        </View>
        {!isScripture || hasPersonalNote ? (
          <View style={{ gap: 5 }}>
            {!isScripture ? (
              <Text numberOfLines={2} style={[typography.bodyMedium, { color: colors.ink, flexShrink: 1 }]}>
                {displayTitle}
              </Text>
            ) : null}
            <BodyText muted numberOfLines={2}>
              {displayCopy.body || t("community.card.noWords")}
            </BodyText>
          </View>
        ) : null}
        {isScripture ? (
          <VersePreviewCard compact interactive={false} maxLines={2} showOpenIndicator={false} verse={item.verses?.[0] ?? item.verse} />
        ) : null}
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

