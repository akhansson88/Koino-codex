import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";

import { CheckInModal, type CheckInStep, moodNumber } from "@/features/check-in-modal";
import { CommunityEncryptionNotice } from "@/features/community/encryption-notice";
import { primaryBibleVerse } from "@/features/bible-verse-utils";
import { HomeScripture } from "@/features/home-scripture";
import { markStartupMilestone } from "@/features/startup-performance";
import { CheckInSubmissionError, checkInForDay } from "@/state/check-ins";
import { normalizeEntryKind } from "@/state/product";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import { id, localDayKey } from "@/state/store/helpers";
import {
  selectCommunityContent,
  selectHomePrayerQueueIds,
  selectLatestHomeCommunityItem,
  selectOpenPrayerRequests,
} from "@/state/selectors/community-content";
import type { BibleVerse, FeedItem, Group, GroupImage, HeartMood, KoinoState } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  Card,
  FullScreenModal,
  IconButton,
  VersePreviewCard,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityDefaultFeedTitle, communityFeedItemLabel, communityPrayerMomentDisplayCopy, communitySystemError } from "@/ui/community-copy";
import { DirectPrayerResultSheet, type DirectPrayerResult } from "@/ui/direct-prayer-result-sheet";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { colors, typography } from "@/ui/theme";

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

const homeFields = [
  "authError", "biblePlans", "checkIns", "checkInDailyClaims", "checkInDailyClaimsReady", "communityFeedError",
  "communityFeedGroupId", "communityFeedOffline", "communityFeedReady", "currentGroupId", "currentUserId", "groups",
  "memberships", "posts", "prayerReactions", "privateCheckIns", "privateCheckInsReady", "profileReady",
  "userGroupsReady", "users",
] as const;

export function HomeScreen() {
  // Theme-only updates also need to render Home because the palette is mutable.
  const state = useKoinoFields(homeFields);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const isMember = state.memberships.some((member) => member.groupId === group?.id && member.userId === state.currentUserId);
  const activeGroupId = state.currentUserId && state.profileReady && state.userGroupsReady && isMember && !group?.migrationPending
    ? group?.id : undefined;
  // A draft and its audience must end with the account or community that opened it.
  const scope = JSON.stringify([state.currentUserId, state.currentGroupId]);
  return <HomeRhythm key={scope} state={state} group={group} activeGroupId={activeGroupId} />;
}

function HomeRhythm({ state, group, activeGroupId }: {
  state: Pick<KoinoState, typeof homeFields[number]>;
  group: Group | undefined;
  activeGroupId: string | undefined;
}) {
  const { dispatch } = useKoinoActions();
  const { t } = useAppTranslation();
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
  const [homeDate, setHomeDate] = useState(() => new Date());
  const lastCheckInParamRef = useRef<string | undefined>(undefined);
  const directPrayerPersistencePendingRef = useRef(false);

  useEffect(() => {
    markStartupMilestone("firstScreenMounted", "home");
  }, []);

  const todayKey = localDayKey(homeDate);
  const profileLoading = Boolean(state.currentUserId && !state.profileReady);
  const feedMatchesGroup = Boolean(state.currentGroupId && state.communityFeedGroupId === state.currentGroupId);
  const feedError = feedMatchesGroup ? state.communityFeedError : undefined;
  const feedOffline = feedMatchesGroup && state.communityFeedOffline;
  const groupContentReady = Boolean(activeGroupId && feedMatchesGroup && state.communityFeedReady && !feedError);
  const canOpenGroupPrayer = groupContentReady && !feedOffline;
  const checkInStatusReady = groupContentReady && state.privateCheckInsReady && state.checkInDailyClaimsReady;
  const moderatedToday = checkInStatusReady && state.checkInDailyClaims.some((claim) => claim.dayKey === todayKey && claim.moderated);
  const todaysCheckIn = checkInStatusReady
    ? checkInForDay([...state.checkIns, ...state.privateCheckIns], state.currentUserId, activeGroupId, todayKey)
    : undefined;
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const userImageById = useMemo(() => new Map(state.users.map((user) => [user.id, user.image])), [state.users]);
  const directPrayerMembers = useMemo(() => {
    if (!activeGroupId) return [];
    const memberIds = new Set(state.memberships.filter((member) => member.groupId === activeGroupId).map((member) => member.userId));
    return state.users.filter((member) => member.id !== state.currentUserId && memberIds.has(member.id));
  }, [activeGroupId, state.currentUserId, state.memberships, state.users]);
  const liveActions = useRef<{ groupPrayer: boolean; submitCheckIn: boolean; members: typeof directPrayerMembers } | undefined>(undefined);
  useLayoutEffect(() => {
    liveActions.current = { groupPrayer: canOpenGroupPrayer, submitCheckIn: checkInStatusReady && !feedOffline, members: directPrayerMembers };
    return () => { liveActions.current = undefined; };
  }, [canOpenGroupPrayer, checkInStatusReady, directPrayerMembers, feedOffline]);
  useEffect(() => {
    if (state.currentUserId && state.profileReady && state.userGroupsReady) {
      markStartupMilestone("homeContentReady", "profile-and-membership-rendered");
    }
  }, [state.currentUserId, state.profileReady, state.userGroupsReady]);
  const visibleGroupId = canOpenGroupPrayer ? activeGroupId : undefined;
  const communityContent = useMemo(() => {
    return selectCommunityContent({
      checkIns: state.checkIns,
      groupId: visibleGroupId,
      posts: state.posts,
    });
  }, [state.checkIns, visibleGroupId, state.posts]);
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
  const greetingName = state.currentUserId ? firstName(userById.get(state.currentUserId)) : undefined;
  const greetingKey = homeGreetingKeys[homeGreetingPeriodAt(homeDate)][greetingName ? "named" : "default"];
  const showMigration = group?.migrationPending && state.profileReady && state.userGroupsReady;
  const showDiscovery = Boolean(state.currentUserId && state.profileReady && state.userGroupsReady && !activeGroupId &&
    (!group || (feedMatchesGroup && state.communityFeedReady)));

  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      setHomeDate(now);
      const nextBoundary = new Date(now);
      nextBoundary.setHours(now.getHours() < 12 ? 12 : now.getHours() < 18 ? 18 : 24, 0, 0, 0);
      timer = setTimeout(refresh, nextBoundary.getTime() - now.getTime());
    }
    refresh();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []));

  useEffect(() => {
    if (canOpenGroupPrayer) return;
    setMemberSelectVisible(false);
    setPrayerTarget(undefined);
    setDirectPrayerResult(undefined);
  }, [canOpenGroupPrayer]);

  useEffect(() => {
    if (activeGroupId) return;
    setCheckInVisible(false);
    resetCheckIn();
  }, [activeGroupId]);

  function resetCheckIn() {
    setCheckInStep("choose");
    setHeartMood(undefined);
    setCheckInText("");
    setCheckInVerses([]);
    setShareCheckIn(false);
  }

  const canOpenCheckIn = checkInStatusReady && !feedOffline && !todaysCheckIn && !moderatedToday;
  function openCheckIn() {
    if (!canOpenCheckIn) return;
    resetCheckIn();
    setCheckInVisible(true);
  }

  useEffect(() => {
    if (!params.checkIn || params.checkIn === lastCheckInParamRef.current || !canOpenCheckIn) return;
    lastCheckInParamRef.current = params.checkIn;
    openCheckIn();
  }, [params.checkIn, canOpenCheckIn]);

  function openPrivateReflection() {
    if (!state.currentUserId) return;
    router.navigate({ pathname: "/(tabs)/me", params: { newEntry: id("home-reflection") } });
  }

  function openPrayerSurface() {
    if (!liveActions.current?.groupPrayer || !activeGroupId) return;
    if (openPrayer) {
      router.push({
        pathname: "/home/[groupId]/prayer",
        params: { groupId: activeGroupId },
      } as never);
      return;
    }
    setMemberSelectVisible(true);
  }

  function openCommunityItem(item: FeedItem) {
    if (!liveActions.current?.groupPrayer || item.groupId !== visibleGroupId) return;
    if (item.type === "post" && normalizeEntryKind(item.kind) === "prayer_request") {
      router.push({
        pathname: "/community/[groupId]/prayers/[prayerRequestId]",
        params: { groupId: item.groupId, prayerRequestId: item.id },
      } as never);
      return;
    }
    router.push(`/feed/${item.type}/${item.id}` as never);
  }

  async function finishDirectPrayer(status: "completed" | "skipped", startedAt: string) {
    const actions = liveActions.current;
    if (!actions?.groupPrayer || !state.currentUserId || !activeGroupId) return;
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
      actions.members.some((member) => member.id === target.recipientUserId);
    if (
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
        expectedScope: { userId: state.currentUserId, groupId: activeGroupId },
      });
      setDirectPrayerResult(status === "completed" ? { ...resultPerson, status: "completed" } : undefined);
    } catch {
      setDirectPrayerResult({ ...resultPerson, status: "failed" });
    } finally {
      directPrayerPersistencePendingRef.current = false;
    }
  }

  return (
    <>
      <AppScreen topInset={false}>
        {profileLoading ? (
          <HomeStatus loading message={t("home.greeting.loading")} />
        ) : (
          <View style={{ gap: 5 }}>
            <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>
              {t(greetingKey, greetingName ? { name: greetingName } : undefined)}
            </Text>
            <BodyText muted>{t("home.greeting.subtitle")}</BodyText>
          </View>
        )}

        <HomeScripture plans={state.biblePlans} userId={state.currentUserId} date={todayKey} />

        {state.currentUserId ? (
          <View style={{ borderTopWidth: 1, borderColor: colors.line }}>
            {canOpenGroupPrayer ? (
              <PrayerPreviewRow onPress={openPrayerSurface} openPrayer={openPrayer} userById={userById} />
            ) : (
              <HomeAction icon="heart" onPress={openPrivateReflection} title={t("home.privateReflection.title")} subtitle={t("home.privateReflection.subtitle")} />
            )}

            {moderatedToday ? (
              <HomeStatus message={t("community.moderation.checkInRemoved")} />
            ) : todaysCheckIn ? (
              <HomeAction
                icon={todaysCheckIn.visibility === "group" ? "users" : "lock"}
                onPress={() => router.push({ pathname: "/me/[id]", params: { id: todaysCheckIn.id } })}
                title={t("home.checkIn.completed")}
                subtitle={todaysCheckIn.visibility === "group"
                  ? t("community.checkIn.sharedWithCommunity", { name: group?.name ?? t("tabs.community") }) : t("home.checkIn.private")}
                action={t("home.checkIn.view")}
              />
            ) : canOpenCheckIn ? (
              <HomeAction
                accessibilityLabel={t("community.checkIn.promptTitle")}
                accessibilityHint={t("home.checkIn.promptHint")}
                icon="plus"
                onPress={openCheckIn}
                title={t("home.checkIn.title")}
                subtitle={t("home.checkIn.promptHint")}
              />
            ) : groupContentReady && !feedOffline && !state.authError ? (
              <HomeStatus loading message={t("home.checkIn.loading")} />
            ) : !state.currentGroupId && state.profileReady && state.userGroupsReady && !state.authError ? (
              <HomeStatus message={t("home.checkIn.solo")} />
            ) : null}
          </View>
        ) : null}

        {showMigration && group ? (
          <Card style={{ gap: 8 }}>
            <Text style={[typography.cardTitle, { color: colors.ink }]}>{group.name}</Text>
            <CommunityEncryptionNotice group={group} />
            <HomeAction icon="users" onPress={() => router.navigate("/(tabs)/community")} title={t("community.rooms.open")} />
          </Card>
        ) : feedError || feedOffline ? (
          <HomeStatus message={t(feedError ? "community.feed.loadError" : "home.communityPreview.offline")} />
        ) : showDiscovery ? (
          <HomeAction
            icon="users"
            onPress={() => router.navigate("/(tabs)/community/rooms")}
            title={t("home.communityDiscovery.title")}
            subtitle={t("home.communityDiscovery.subtitle")}
          />
        ) : state.currentUserId && !groupContentReady ? (
          <HomeStatus loading message={t("home.communityPreview.loading")} />
        ) : groupContentReady ? (
          <CommunityPreviewCard item={latestCommunityItem} onOpen={openCommunityItem} userById={userById} userImageById={userImageById} />
        ) : null}

        {state.authError ? (
          <Card>
            <BodyText muted>{communitySystemError(state.authError, t)}</BodyText>
          </Card>
        ) : null}
      </AppScreen>

      <CheckInModal
        visible={checkInVisible && Boolean(activeGroupId)}
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
          if (!liveActions.current?.submitCheckIn || !state.currentUserId || !activeGroupId) {
            throw new CheckInSubmissionError("unavailable");
          }
          await dispatch({
            type: "submitCheckIn",
            expectedScope: { userId: state.currentUserId, groupId: activeGroupId },
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
        target={canOpenGroupPrayer ? prayerTarget : undefined}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt) => {
          void finishDirectPrayer(status, startedAt);
        }}
      />

      <DirectPrayerResultSheet onDone={() => setDirectPrayerResult(undefined)} result={canOpenGroupPrayer ? directPrayerResult : undefined} />

      <FullScreenModal animationType="slide" visible={memberSelectVisible && canOpenGroupPrayer} onRequestClose={() => setMemberSelectVisible(false)}>
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
    </>
  );
}

function HomeStatus({ loading = false, message }: { loading?: boolean; message: string }) {
  return (
    <View
      accessible
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      accessibilityRole={loading ? "progressbar" : undefined}
      accessibilityState={loading ? { busy: true } : undefined}
      style={{ alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 10 }}
    >
      {loading ? <ActivityIndicator color={colors.olive} /> : null}
      <BodyText muted style={{ flex: 1 }}>{message}</BodyText>
    </View>
  );
}

function HomeAction({
  accessibilityHint,
  accessibilityLabel,
  action,
  icon,
  onPress,
  preview,
  subtitle,
  title,
}: {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  action?: string;
  icon: ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  preview?: string;
  subtitle?: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, preview, action].filter(Boolean).join(". ")}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center", borderBottomWidth: 1, borderColor: colors.line, flexDirection: "row",
        gap: 12, minHeight: 48, opacity: pressed ? 0.7 : 1, paddingVertical: 12,
      })}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Feather name={icon} size={20} color={icon === "heart" ? colors.accentPrayer : colors.olive} />
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={[typography.cardTitle, { color: colors.ink }]}>{title}</Text>
        {subtitle ? <BodyText muted>{subtitle}</BodyText> : null}
        {preview ? <Text numberOfLines={2} style={[typography.body, { color: colors.muted }]}>{preview}</Text> : null}
        {action ? <Text style={[typography.label, { color: colors.olive }]}>{action}</Text> : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Feather name="chevron-right" size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}

function shortPreview(value: string) {
  const characters = Array.from(value.trim().replace(/\s+/g, " "));
  return characters.length > 120 ? `${characters.slice(0, 117).join("").trimEnd()}…` : characters.join("");
}

function PrayerPreviewRow({ onPress, openPrayer, userById }: {
  onPress: () => void;
  openPrayer?: Extract<FeedItem, { type: "post" }>;
  userById: Map<string, string>;
}) {
  const { t } = useAppTranslation();
  if (!openPrayer) {
    return <HomeAction
      accessibilityHint={t("home.prayerPreview.fallbackHint")}
      accessibilityLabel={t("home.prayerPreview.title")}
      icon="heart"
      onPress={onPress}
      title={t("home.prayerPreview.title")}
      subtitle={t("home.prayerPreview.subtitle")}
    />;
  }
  const name = userById.get(openPrayer.userId) || t("common.someone");
  return <HomeAction
    accessibilityHint={t("home.prayerPreview.openHint", { name })}
    icon="heart"
    onPress={onPress}
    title={t("home.prayerPreview.openSubtitle", { name })}
    preview={shortPreview(openPrayer.body)}
  />;
}

function CommunityPreviewCard({
  item,
  onOpen,
  userById,
  userImageById,
}: {
  item?: FeedItem;
  onOpen: (item: FeedItem) => void;
  userById: Map<string, string>;
  userImageById: Map<string, GroupImage | undefined>;
}) {
  const { t } = useAppTranslation();
  if (!item) {
    return (
      <HomeAction
        icon="users"
        onPress={() => router.navigate("/(tabs)/community")}
        subtitle={t("home.communityPreview.empty")}
        title={t("home.communityPreview.title")}
      />
    );
  }

  const authorName = userById.get(item.userId) ?? t("common.someone");
  const displayCopy = item.type === "post" ? communityPrayerMomentDisplayCopy(item, t) : { body: item.body, title: undefined };
  const isScripture = item.type === "post" && normalizeEntryKind(item.kind) === "scripture";
  const preview = shortPreview(displayCopy.body);
  const itemLabel = communityFeedItemLabel(item, t);
  const displayTitle = displayCopy.title || communityDefaultFeedTitle(item, t);
  const accessibilityTitle = isScripture && preview ? preview : displayTitle;
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
      <Card style={{ gap: 8, padding: 12 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Text style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{t("home.communityPreview.title")}</Text>
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Feather name="chevron-right" size={19} color={colors.muted} />
          </View>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <Avatar image={userImageById.get(item.userId)} name={authorName} size={36} tone="green" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{authorName}</Text>
            <Text style={[typography.caption, { color: colors.muted }]}>{itemLabel}</Text>
          </View>
        </View>
        {!isScripture ? <Text style={[typography.bodyMedium, { color: colors.ink }]} numberOfLines={2}>{displayTitle}</Text> : null}
        {preview ? <Text style={[typography.body, { color: colors.muted }]} numberOfLines={2}>{preview}</Text> : null}
        {isScripture ? (
          <VersePreviewCard compact interactive={false} maxLines={2} showOpenIndicator={false} verse={item.verses?.[0] ?? item.verse} />
        ) : null}
      </Card>
    </Pressable>
  );
}

