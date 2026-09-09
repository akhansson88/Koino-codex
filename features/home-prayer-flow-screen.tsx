import { useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import {
  findNextHomePrayerQueueIndex,
  selectCommunityContent,
  selectHomePrayerQueueIds,
  selectOpenPrayerRequests,
} from "@/state/selectors/community-content";
import type { FeedItem, GroupImage, Id } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  BottomSheet,
  Card,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  VerseList,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { LinkPreviewContent } from "@/ui/link-preview";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors, typography } from "@/ui/theme";
import { WrittenEncouragementComposer } from "@/ui/written-encouragement-composer";

type PrayerRequestItem = Extract<FeedItem, { type: "post" }>;
type PrayerQueueSession = { key: string; requestIds: Id[] };

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function HomePrayerFlowHeader({ onBack }: { onBack: () => void }) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={onBack} />
      <Text style={{ color: colors.ink, flex: 1, fontSize: 18, fontWeight: "900", marginHorizontal: 8, textAlign: "center" }}>
        {t("home.prayerFlow.title")}
      </Text>
      <View style={{ width: 38 }} />
    </View>
  );
}

function HomePrayerFlowRouteState({
  loading = false,
  message,
  onDone,
}: {
  loading?: boolean;
  message: string;
  onDone: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <AppScreen>
      <HomePrayerFlowHeader onBack={onDone} />
      <Card style={{ alignItems: "center", justifyContent: "center", minHeight: 92 }}>
        <View
          accessibilityLabel={message}
          accessibilityLiveRegion="polite"
          accessibilityRole={loading ? "progressbar" : undefined}
          accessibilityState={loading ? { busy: true } : undefined}
          style={{ alignItems: "center", gap: 10 }}
        >
          {loading ? <ActivityIndicator color={colors.olive} /> : null}
          <BodyText muted style={{ textAlign: "center" }}>
            {message}
          </BodyText>
        </View>
      </Card>
      {!loading ? <SecondaryButton onPress={onDone}>{t("common.done")}</SecondaryButton> : null}
    </AppScreen>
  );
}

function PrayerRequestStep({
  authorImage,
  authorName,
  item,
  onBack,
  onOpenDetail,
  onPray,
  persistenceError,
  persisting,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: PrayerRequestItem;
  onBack: () => void;
  onOpenDetail: () => void;
  onPray: () => void;
  persistenceError: boolean;
  persisting: boolean;
}) {
  const { language, t } = useAppTranslation();
  return (
    <AppScreen>
      <HomePrayerFlowHeader onBack={onBack} />
      <View style={{ alignItems: "center", gap: 8 }}>
        <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
          <Avatar image={authorImage} name={authorName} size={64} tone="green" />
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{authorName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
            {formatRelativeTime(item.createdAt, language)}
          </Text>
        </View>
        <StatusPill status="open" />
      </View>
      <View style={{ gap: 12 }}>
        {item.title?.trim() ? (
          <Text accessibilityRole="header" style={[typography.heading, { color: colors.ink }]}>
            {item.title}
          </Text>
        ) : null}
        <LinkPreviewContent text={item.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <BodyText hiddenUrl={hiddenUrl} style={{ fontSize: 17, lineHeight: 26 }}>
                {item.body}
              </BodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      </View>
      <VerseList verse={item.verse} verses={item.verses} />
      {persistenceError ? (
        <Card style={{ backgroundColor: colors.warmSoft }}>
          <BodyText accessibilityLiveRegion="assertive" accessibilityRole="alert" muted>
            {t("home.prayerFlow.prayerSaveError")}
          </BodyText>
        </Card>
      ) : null}
      <PrimaryButton
        accessibilityHint={t("home.prayerFlow.prayHint", { name: authorName })}
        disabled={persisting}
        icon="heart"
        onPress={onPray}
      >
        {t(persisting ? "home.prayerFlow.savingPrayer" : "community.action.prayer.default")}
      </PrimaryButton>
      <SecondaryButton
        accessibilityHint={t("home.prayerFlow.openDetailHint")}
        disabled={persisting}
        icon="external-link"
        onPress={onOpenDetail}
      >
        {t("home.prayerFlow.openDetail")}
      </SecondaryButton>
    </AppScreen>
  );
}

function PrayerCompletionStep({
  authorImage,
  authorName,
  messageSent,
  onAddMessage,
  onBack,
  onDone,
  onNext,
}: {
  authorImage?: GroupImage;
  authorName: string;
  messageSent: boolean;
  onAddMessage: () => void;
  onBack: () => void;
  onDone: () => void;
  onNext: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <AppScreen>
      <HomePrayerFlowHeader onBack={onBack} />
      <View style={{ alignItems: "center", gap: 14, paddingVertical: 18 }}>
        <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
          <Avatar image={authorImage} name={authorName} size={68} tone="green" />
        </View>
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="header"
          style={{ color: colors.ink, fontSize: 25, fontWeight: "900", lineHeight: 33, textAlign: "center" }}
        >
          {t("home.prayerFlow.completed", { name: authorName })}
        </Text>
      </View>
      {messageSent ? (
        <Card style={{ backgroundColor: colors.mossSurface }}>
          <BodyText>{t("home.prayerFlow.messageSent")}</BodyText>
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          <BodyText muted style={{ textAlign: "center" }}>
            {t("home.prayerFlow.addMessageOptional")}
          </BodyText>
          <PrimaryButton accessibilityHint={t("home.prayerFlow.addMessageHint")} icon="message-circle" onPress={onAddMessage}>
            {t("home.prayerFlow.addMessage")}
          </PrimaryButton>
        </View>
      )}
      <View style={{ gap: 10 }}>
        <SecondaryButton onPress={onNext}>
          {t("home.prayerFlow.next")}
        </SecondaryButton>
        <SecondaryButton onPress={onDone}>
          {t("common.done")}
        </SecondaryButton>
      </View>
    </AppScreen>
  );
}

export function HomePrayerFlowScreen() {
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = routeParam(params.groupId)?.trim();
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
  const [queueSession, setQueueSession] = useState<PrayerQueueSession>();
  const [cursor, setCursor] = useState(0);
  const [completedRequestId, setCompletedRequestId] = useState<Id>();
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const [persistingRequestId, setPersistingRequestId] = useState<Id>();
  const [persistenceErrorRequestId, setPersistenceErrorRequestId] = useState<Id>();
  const [messageComposerVisible, setMessageComposerVisible] = useState(false);
  const [encouragementDraft, setEncouragementDraft] = useState("");
  const [messageSentRequestId, setMessageSentRequestId] = useState<Id>();

  const routeIsValid = Boolean(groupId);
  const routeUsesCurrentGroup = Boolean(groupId && groupId === state.currentGroupId);
  const routeGroupExists = Boolean(groupId && state.groups.some((group) => group.id === groupId));
  const feedMatchesRoute = Boolean(groupId && state.communityFeedGroupId === groupId);
  const feedLoading =
    !state.authReady ||
    !state.profileReady ||
    !state.userGroupsReady ||
    (routeIsValid &&
      routeUsesCurrentGroup &&
      routeGroupExists &&
      Boolean(state.currentUserId) &&
      !state.communityFeedError &&
      (!feedMatchesRoute || !state.communityFeedReady));
  const hasRouteAccess = Boolean(
    routeIsValid && routeUsesCurrentGroup && routeGroupExists && state.currentUserId && feedMatchesRoute && state.communityFeedReady,
  );
  const sessionKey = groupId && state.currentUserId ? `${groupId}:${state.currentUserId}` : undefined;

  const communityContent = useMemo(
    () =>
      selectCommunityContent({
        checkIns: state.checkIns,
        groupId: routeUsesCurrentGroup ? groupId : undefined,
        posts: state.posts,
      }),
    [groupId, routeUsesCurrentGroup, state.checkIns, state.posts],
  );
  const candidateQueueIds = useMemo(
    () => selectHomePrayerQueueIds(communityContent, state.currentUserId, state.prayerReactions),
    [communityContent, state.currentUserId, state.prayerReactions],
  );
  const liveOpenRequests = useMemo(
    () => selectOpenPrayerRequests(communityContent).filter((item) => item.userId !== state.currentUserId),
    [communityContent, state.currentUserId],
  );
  const liveRequestById = useMemo(() => new Map(liveOpenRequests.map((item) => [item.id, item])), [liveOpenRequests]);
  const validRequestIds = useMemo(() => new Set(liveRequestById.keys()), [liveRequestById]);
  const activeQueueSession = queueSession?.key === sessionKey ? queueSession : undefined;
  const resolvedCursor = activeQueueSession
    ? findNextHomePrayerQueueIndex(activeQueueSession.requestIds, validRequestIds, cursor)
    : 0;
  const activeRequestId = activeQueueSession?.requestIds[resolvedCursor];
  const activeRequest = activeRequestId ? liveRequestById.get(activeRequestId) : undefined;

  useEffect(() => {
    if (!hasRouteAccess || state.communityFeedError || !sessionKey || queueSession?.key === sessionKey) return;
    setQueueSession({ key: sessionKey, requestIds: candidateQueueIds });
    setCursor(0);
    setCompletedRequestId(undefined);
    setPrayerTarget(undefined);
    setPersistingRequestId(undefined);
    setPersistenceErrorRequestId(undefined);
    setMessageComposerVisible(false);
    setEncouragementDraft("");
    setMessageSentRequestId(undefined);
  }, [candidateQueueIds, hasRouteAccess, queueSession?.key, sessionKey, state.communityFeedError]);

  useEffect(() => {
    if (!activeQueueSession || resolvedCursor === cursor) return;
    setCursor(resolvedCursor);
    setCompletedRequestId(undefined);
    setPrayerTarget(undefined);
    setPersistingRequestId(undefined);
    setPersistenceErrorRequestId(undefined);
    setMessageComposerVisible(false);
    setEncouragementDraft("");
    setMessageSentRequestId(undefined);
  }, [activeQueueSession, cursor, resolvedCursor]);

  function returnHome() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/" as never);
  }

  function resetForNextRequest(nextCursor: number) {
    setCursor(nextCursor);
    setCompletedRequestId(undefined);
    setPrayerTarget(undefined);
    setPersistingRequestId(undefined);
    setPersistenceErrorRequestId(undefined);
    setMessageComposerVisible(false);
    setEncouragementDraft("");
    setMessageSentRequestId(undefined);
  }

  function advanceToNextRequest() {
    if (!activeQueueSession) return;
    const nextCursor = findNextHomePrayerQueueIndex(activeQueueSession.requestIds, validRequestIds, resolvedCursor + 1);
    resetForNextRequest(nextCursor);
  }

  async function persistCompletedPrayer(target: PrayerMomentTarget, status: "completed" | "skipped", startedAt: string) {
    setPrayerTarget(undefined);
    if (status !== "completed") return;

    if (!validRequestIds.has(target.targetId)) {
      if (activeQueueSession) {
        const targetIndex = activeQueueSession.requestIds.indexOf(target.targetId);
        const nextCursor = findNextHomePrayerQueueIndex(
          activeQueueSession.requestIds,
          validRequestIds,
          Math.max(0, targetIndex + 1),
        );
        resetForNextRequest(nextCursor);
      }
      return;
    }

    setPersistingRequestId(target.targetId);
    setPersistenceErrorRequestId(undefined);
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
      setCompletedRequestId(target.targetId);
      setMessageSentRequestId(undefined);
    } catch {
      setPersistenceErrorRequestId(target.targetId);
    } finally {
      setPersistingRequestId((current) => (current === target.targetId ? undefined : current));
    }
  }

  if (feedLoading) {
    return <HomePrayerFlowRouteState loading message={t("home.prayerFlow.loading")} onDone={returnHome} />;
  }

  if (!hasRouteAccess || state.communityFeedError) {
    return <HomePrayerFlowRouteState message={t("home.prayerFlow.unavailable")} onDone={returnHome} />;
  }

  if (!activeQueueSession) {
    return <HomePrayerFlowRouteState loading message={t("home.prayerFlow.loading")} onDone={returnHome} />;
  }

  if (activeQueueSession.requestIds.length === 0) {
    return <HomePrayerFlowRouteState message={t("home.prayerFlow.noRequests")} onDone={returnHome} />;
  }

  if (!activeRequest) {
    return <HomePrayerFlowRouteState message={t("home.prayerFlow.finished")} onDone={returnHome} />;
  }

  const author = state.users.find((user) => user.id === activeRequest.userId);
  const authorName = author?.name ?? t("common.someone");
  const authorImage = author?.image;
  const requestCompleted = completedRequestId === activeRequest.id;

  return (
    <>
      {requestCompleted ? (
        <PrayerCompletionStep
          authorImage={authorImage}
          authorName={authorName}
          messageSent={messageSentRequestId === activeRequest.id}
          onAddMessage={() => setMessageComposerVisible(true)}
          onBack={returnHome}
          onDone={returnHome}
          onNext={advanceToNextRequest}
        />
      ) : (
        <PrayerRequestStep
          authorImage={authorImage}
          authorName={authorName}
          item={activeRequest}
          onBack={returnHome}
          onOpenDetail={() => {
            router.push({
              pathname: "/community/[groupId]/prayers/[prayerRequestId]",
              params: { groupId: activeRequest.groupId, prayerRequestId: activeRequest.id },
            } as never);
          }}
          onPray={() => {
            if (persistingRequestId) return;
            setPersistenceErrorRequestId(undefined);
            setPrayerTarget({
              targetType: "post",
              targetId: activeRequest.id,
              body: activeRequest.body,
              recipientUserId: activeRequest.userId,
              recipientName: authorName,
              recipientImage: authorImage,
            });
          }}
          persistenceError={persistenceErrorRequestId === activeRequest.id}
          persisting={persistingRequestId === activeRequest.id}
        />
      )}
      <PrayerMoment
        target={prayerTarget}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt) => {
          const target = prayerTarget;
          if (!target) return;
          void persistCompletedPrayer(target, status, startedAt);
        }}
      />
      <BottomSheet
        onClose={() => setMessageComposerVisible(false)}
        title={t("community.encouragement.addMessageTitle")}
        visible={requestCompleted && messageComposerVisible}
      >
        <BodyText muted>{t("community.encouragement.supportingCopy")}</BodyText>
        <WrittenEncouragementComposer
          autoFocus
          onChangeText={setEncouragementDraft}
          onDismiss={() => setMessageComposerVisible(false)}
          onSend={async (body, replyId) => {
            if (messageSentRequestId === activeRequest.id) return;
            await dispatch({
              type: "createReply",
              targetType: "post",
              targetId: activeRequest.id,
              body,
              replyId,
            });
            setEncouragementDraft("");
            setMessageSentRequestId(activeRequest.id);
            setMessageComposerVisible(false);
          }}
          placeholder={t("community.reply.encouragementPlaceholder")}
          value={encouragementDraft}
          variant="sheet"
        />
      </BottomSheet>
    </>
  );
}
