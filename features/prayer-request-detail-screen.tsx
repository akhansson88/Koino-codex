import { useMemo, useState } from "react";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";

import { normalizeEntryKind } from "@/state/product";
import { useKoino } from "@/state/koino-store";
import { prayerReactionsForTarget } from "@/state/prayer-reactions";
import type { GroupImage, Id, Post } from "@/state/types";
import {
  AppScreen,
  Avatar,
  AvatarStack,
  BodyText,
  BottomSheet,
  Card,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  SectionHeading,
  StatusPill,
  TextInputField,
  VerseList,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityActionLabel, communityPrayerNoun } from "@/ui/community-copy";
import { LinkPreviewContent } from "@/ui/link-preview";
import { PrayerActivity, type PrayerActivityEntry } from "@/ui/prayer-activity";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors } from "@/ui/theme";
import { WrittenEncouragementComposer } from "@/ui/written-encouragement-composer";
import { DiscussionFollowButton } from "@/ui/discussion-follow-button";

const MAX_ANSWERED_UPDATE_LENGTH = 280;

export type PrayerRequestDetailItem = Omit<Post, "kind"> & { kind: "prayer_request" };

export type PrayerRequestDetailPrayerState = {
  count: number;
  prayed: boolean;
  prayedBy: { image?: GroupImage; name: string }[];
};

export type PrayerRequestEncouragement = {
  authorImage?: GroupImage;
  authorName: string;
  body: string;
  canDelete: boolean;
  createdAt: string;
  id: Id;
};

export type PrayerRequestDetailScreenProps = {
  activity: PrayerActivityEntry[];
  answered: boolean;
  authorImage?: GroupImage;
  authorName: string;
  encouragementDraft: string;
  encouragements: PrayerRequestEncouragement[];
  item: PrayerRequestDetailItem;
  onBack: () => void;
  onChangeEncouragement: (value: string) => void;
  onDeleteEncouragement: (id: Id) => void;
  onOpenOwnerActions: () => void;
  onPray: () => void;
  onSendEncouragement: (body: string, replyId: string) => Promise<void>;
  onToggleDiscussionFollow: () => void;
  ownsItem: boolean;
  prayer: PrayerRequestDetailPrayerState;
  followsDiscussion: boolean;
  showDiscussionFollow: boolean;
};

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function PrayerRequestHeader({ onBack, onOpenOptions }: { onBack: () => void; onOpenOptions?: () => void }) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={onBack} />
      <Text style={{ color: colors.ink, flex: 1, fontSize: 18, fontWeight: "900", marginHorizontal: 8, textAlign: "center" }}>
        {t("community.page.prayer")}
      </Text>
      {onOpenOptions ? (
        <IconButton accessibilityLabel={t("community.prayer.ownerActions")} icon="more-horizontal" onPress={onOpenOptions} />
      ) : (
        <View style={{ width: 38 }} />
      )}
    </View>
  );
}

function AnsweredPrayerEditorSheet({
  draft,
  error,
  mode,
  onChangeDraft,
  onClose,
  onSave,
  saving,
}: {
  draft: string;
  error?: string;
  mode?: "edit" | "mark";
  onChangeDraft: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { t } = useAppTranslation();
  const editing = mode === "edit";
  return (
    <BottomSheet
      onClose={saving ? () => undefined : onClose}
      title={t(editing ? "community.prayer.editAnswer" : "community.prayer.answerTitle")}
      visible={Boolean(mode)}
    >
      <BodyText muted>{t(editing ? "community.prayer.editAnswerBody" : "community.prayer.answerBody")}</BodyText>
      <TextInputField
        accessibilityLabel={t("community.prayer.answerPlaceholder")}
        maxLength={MAX_ANSWERED_UPDATE_LENGTH}
        multiline
        onChangeText={(value) => onChangeDraft(value.slice(0, MAX_ANSWERED_UPDATE_LENGTH))}
        placeholder={t("community.prayer.answerPlaceholder")}
        value={draft}
      />
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "right" }}>
        {draft.length}/{MAX_ANSWERED_UPDATE_LENGTH}
      </Text>
      {error ? <BodyText style={{ color: colors.danger }}>{error}</BodyText> : null}
      <PrimaryButton disabled={saving} icon="check-circle" onPress={onSave}>
        {t(editing ? "common.done" : "community.prayer.markAnswered")}
      </PrimaryButton>
      <SecondaryButton disabled={saving} onPress={onClose}>
        {t("common.cancel")}
      </SecondaryButton>
    </BottomSheet>
  );
}

function PrayerOwnerActionsSheet({
  answered,
  error,
  onClose,
  onEditAnswer,
  onMarkAnswered,
  onReopen,
  saving,
  visible,
}: {
  answered: boolean;
  error?: string;
  onClose: () => void;
  onEditAnswer: () => void;
  onMarkAnswered: () => void;
  onReopen: () => void;
  saving: boolean;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <BottomSheet onClose={saving ? () => undefined : onClose} title={t("community.prayer.ownerActions")} visible={visible}>
      {answered ? (
        <>
          <SecondaryButton disabled={saving} icon="edit-2" onPress={onEditAnswer}>
            {t("community.prayer.editAnswer")}
          </SecondaryButton>
          <SecondaryButton disabled={saving} icon="rotate-ccw" onPress={onReopen}>
            {t("community.prayer.reopen")}
          </SecondaryButton>
        </>
      ) : (
        <PrimaryButton disabled={saving} icon="check-circle" onPress={onMarkAnswered}>
          {t("community.prayer.markAnswered")}
        </PrimaryButton>
      )}
      {error ? <BodyText style={{ color: colors.danger }}>{error}</BodyText> : null}
      <SecondaryButton disabled={saving} onPress={onClose}>
        {t("common.cancel")}
      </SecondaryButton>
    </BottomSheet>
  );
}

function PrayerRequestRouteState({ loading, onBack }: { loading: boolean; onBack: () => void }) {
  const { t } = useAppTranslation();
  return (
    <AppScreen>
      <PrayerRequestHeader onBack={onBack} />
      <Card style={{ alignItems: loading ? "center" : undefined }}>
        {loading ? <ActivityIndicator color={colors.olive} /> : <BodyText muted>{t("community.prayer.unavailable")}</BodyText>}
      </Card>
    </AppScreen>
  );
}

export function PrayerRequestDetailScreen({
  activity,
  answered,
  authorImage,
  authorName,
  encouragementDraft,
  encouragements,
  item,
  onBack,
  onChangeEncouragement,
  onDeleteEncouragement,
  onOpenOwnerActions,
  onPray,
  onSendEncouragement,
  onToggleDiscussionFollow,
  ownsItem,
  prayer,
  followsDiscussion,
  showDiscussionFollow,
}: PrayerRequestDetailScreenProps) {
  const { language, t } = useAppTranslation();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ backgroundColor: colors.cream, flex: 1 }}>
      <AppScreen>
      <PrayerRequestHeader onBack={onBack} onOpenOptions={ownsItem ? onOpenOwnerActions : undefined} />
      <View style={{ alignItems: "center", gap: 8 }}>
        <Avatar image={authorImage} name={authorName} size={58} tone="green" />
        <View style={{ alignItems: "center", gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{authorName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt, language)}</Text>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 31, textAlign: "center" }}>
          {item.title || t("community.defaultTitle.prayerRequest")}
        </Text>
        <LinkPreviewContent text={item.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <BodyText hiddenUrl={hiddenUrl} style={{ fontSize: 16, lineHeight: 24, textAlign: "center" }}>
                {item.body || t("community.card.noWords")}
              </BodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      </View>
      <VerseList verse={item.verse} verses={item.verses} />
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
      {prayer.prayedBy.length > 0 ? <AvatarStack users={prayer.prayedBy} /> : null}
      {answered ? (
        <Card style={{ backgroundColor: colors.mossSurface, gap: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
            <Feather name="check-circle" size={20} color={colors.olive} />
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{t("community.prayer.answeredTitle")}</Text>
          </View>
          <BodyText muted>
            {t("community.prayer.markedAnswered", { time: formatRelativeTime(item.answeredAt ?? item.createdAt, language) })}
          </BodyText>
          {item.answeredUpdate?.trim() ? (
            <View style={{ borderTopColor: colors.line, borderTopWidth: 1, gap: 6, paddingTop: 10 }}>
              <Text style={{ color: colors.olive, fontSize: 12, fontWeight: "900" }}>
                {t("community.prayer.updateLabel")}
              </Text>
              <BodyText>{item.answeredUpdate}</BodyText>
            </View>
          ) : null}
        </Card>
      ) : null}
      <PrayerActionButton onPress={onPray} prayed={prayer.prayed} />
      {encouragements.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionHeading>{t("community.reply.heading")}</SectionHeading>
          <Card style={{ gap: 0, padding: 0 }}>
            {encouragements.map((encouragement, index) => (
              <View
                key={encouragement.id}
                style={{
                  borderBottomColor: colors.line,
                  borderBottomWidth: index === encouragements.length - 1 ? 0 : 1,
                  gap: 8,
                  padding: 14,
                }}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                  <Avatar image={encouragement.authorImage} name={encouragement.authorName} size={32} tone="pink" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                      {encouragement.authorName}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                      {formatRelativeTime(encouragement.createdAt, language)}
                    </Text>
                  </View>
                  {encouragement.canDelete ? (
                    <Pressable
                      accessibilityLabel={t("community.reply.delete")}
                      accessibilityRole="button"
                      onPress={() => onDeleteEncouragement(encouragement.id)}
                      style={{ padding: 6 }}
                    >
                      <Feather name="trash-2" size={16} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
                <LinkPreviewContent text={encouragement.body}>
                  {({ hiddenUrl, preview }) => (
                    <>
                      <BodyText hiddenUrl={hiddenUrl}>{encouragement.body}</BodyText>
                      {preview}
                    </>
                  )}
                </LinkPreviewContent>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
      <WrittenEncouragementComposer
        onChangeText={onChangeEncouragement}
        onSend={onSendEncouragement}
        placeholder={t("community.reply.encouragementPlaceholder")}
        value={encouragementDraft}
      />
      {showDiscussionFollow ? (
        <DiscussionFollowButton following={followsDiscussion} onPress={onToggleDiscussionFollow} />
      ) : null}
      <PrayerActivity activity={activity} />
      </AppScreen>
    </KeyboardAvoidingView>
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

export function PrayerRequestDetailRouteScreen() {
  const params = useLocalSearchParams<{ groupId?: string | string[]; prayerRequestId?: string | string[] }>();
  const groupId = routeParam(params.groupId)?.trim();
  const prayerRequestId = routeParam(params.prayerRequestId)?.trim();
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
  const [encouragementDraft, setEncouragementDraft] = useState("");
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const [ownerActionsVisible, setOwnerActionsVisible] = useState(false);
  const [answerEditorMode, setAnswerEditorMode] = useState<"edit" | "mark">();
  const [answeredUpdateDraft, setAnsweredUpdateDraft] = useState("");
  const [answerSaving, setAnswerSaving] = useState(false);
  const [answerError, setAnswerError] = useState<string>();

  const routeIsValid = Boolean(groupId && prayerRequestId);
  const routeUsesCurrentGroup = Boolean(groupId && groupId === state.currentGroupId);
  const routeGroupExists = Boolean(groupId && state.groups.some((group) => group.id === groupId));
  const feedMatchesRoute = Boolean(groupId && state.communityFeedGroupId === groupId);
  const feedLoading =
    !state.authReady ||
    !state.profileReady ||
    !state.userGroupsReady ||
    (routeIsValid && routeUsesCurrentGroup && !state.communityFeedError && (!feedMatchesRoute || !state.communityFeedReady));

  const prayerRequest = useMemo<PrayerRequestDetailItem | undefined>(() => {
    if (!groupId || !prayerRequestId || !routeUsesCurrentGroup) return undefined;
    const post = state.posts.find((candidate) => candidate.id === prayerRequestId && candidate.groupId === groupId);
    if (!post || normalizeEntryKind(post.kind) !== "prayer_request") return undefined;
    return { ...post, kind: "prayer_request" };
  }, [groupId, prayerRequestId, routeUsesCurrentGroup, state.posts]);

  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const userImageById = useMemo(() => new Map(state.users.map((user) => [user.id, user.image])), [state.users]);

  const prayerReactions = useMemo(
    () => (prayerRequest ? prayerReactionsForTarget(state.prayerReactions, "post", prayerRequest.id) : []),
    [prayerRequest, state.prayerReactions],
  );
  const prayer = useMemo<PrayerRequestDetailPrayerState>(
    () => ({
      count: prayerReactions.length,
      prayed: prayerReactions.some((reaction) => reaction.userId === state.currentUserId),
      prayedBy: prayerReactions.map((reaction) => ({
        image: userImageById.get(reaction.userId),
        name: userById.get(reaction.userId) ?? t("common.someone"),
      })),
    }),
    [prayerReactions, state.currentUserId, t, userById, userImageById],
  );
  const activity = useMemo<PrayerActivityEntry[]>(
    () =>
      [...prayerReactions]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .map((reaction) => ({
          id: reaction.id,
          createdAt: reaction.createdAt,
          durationSeconds:
            reaction.durationSeconds ??
            (reaction.startedAt && reaction.completedAt
              ? Math.max(0, Math.floor((Date.parse(reaction.completedAt) - Date.parse(reaction.startedAt)) / 1000))
              : undefined),
          name: reaction.userId === state.currentUserId ? t("common.you") : userById.get(reaction.userId) ?? t("common.someone"),
          image: userImageById.get(reaction.userId),
        })),
    [prayerReactions, state.currentUserId, t, userById, userImageById],
  );
  const encouragements = useMemo<PrayerRequestEncouragement[]>(
    () =>
      prayerRequest
        ? state.replies
            .filter((reply) => reply.targetType === "post" && reply.targetId === prayerRequest.id)
            .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
            .map((reply) => ({
              id: reply.id,
              authorImage: userImageById.get(reply.userId),
              authorName: userById.get(reply.userId) ?? t("common.someone"),
              body: reply.body,
              canDelete: reply.userId === state.currentUserId,
              createdAt: reply.createdAt,
            }))
        : [],
    [prayerRequest, state.currentUserId, state.replies, t, userById, userImageById],
  );
  const followsDiscussion = Boolean(
    prayerRequest && state.discussionFollows.some((follow) => follow.targetType === "post" && follow.targetId === prayerRequest.id),
  );
  const hasCommented = encouragements.some((encouragement) => encouragement.canDelete);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/community" as never);
  }

  if (feedLoading) {
    return <PrayerRequestRouteState loading onBack={goBack} />;
  }

  if (!routeIsValid || !routeUsesCurrentGroup || !routeGroupExists || !prayerRequest) {
    return <PrayerRequestRouteState loading={false} onBack={goBack} />;
  }

  const activePrayerRequest = prayerRequest;
  const authorName = userById.get(activePrayerRequest.userId) ?? t("common.someone");
  const authorImage = userImageById.get(activePrayerRequest.userId);
  const answered = Boolean(activePrayerRequest.answeredAt);

  function openAnswerEditor(mode: "edit" | "mark") {
    setOwnerActionsVisible(false);
    setAnsweredUpdateDraft(mode === "edit" ? activePrayerRequest.answeredUpdate ?? "" : "");
    setAnswerError(undefined);
    setAnswerEditorMode(mode);
  }

  async function saveAnswer() {
    if (answerSaving) return;
    setAnswerSaving(true);
    setAnswerError(undefined);
    try {
      await dispatch({
        type: answerEditorMode === "edit" ? "updatePrayerAnswer" : "markPrayerAnswered",
        id: activePrayerRequest.id,
        answeredUpdate: answeredUpdateDraft,
      });
      setAnswerEditorMode(undefined);
    } catch {
      setAnswerError(t("community.prayer.answerError"));
    } finally {
      setAnswerSaving(false);
    }
  }

  async function reopenPrayer() {
    if (answerSaving) return;
    setAnswerSaving(true);
    setAnswerError(undefined);
    try {
      await dispatch({ type: "unmarkPrayerAnswered", id: activePrayerRequest.id });
      setOwnerActionsVisible(false);
    } catch {
      setAnswerError(t("community.prayer.answerError"));
    } finally {
      setAnswerSaving(false);
    }
  }

  return (
    <>
      <PrayerRequestDetailScreen
        activity={activity}
        answered={answered}
        authorImage={authorImage}
        authorName={authorName}
        encouragementDraft={encouragementDraft}
        encouragements={encouragements}
        item={activePrayerRequest}
        onBack={goBack}
        onChangeEncouragement={setEncouragementDraft}
        onDeleteEncouragement={(id) => {
          void dispatch({ type: "deleteReply", id });
        }}
        onOpenOwnerActions={() => {
          setAnswerError(undefined);
          setOwnerActionsVisible(true);
        }}
        onPray={() => {
          setPrayerTarget({
            targetType: "post",
            targetId: activePrayerRequest.id,
            body: activePrayerRequest.body,
            recipientUserId: activePrayerRequest.userId,
            recipientName: authorName,
            recipientImage: authorImage,
          });
        }}
        onSendEncouragement={async (body, replyId) => {
          const trimmedBody = body.trim();
          if (!trimmedBody) return;
          await dispatch({
            type: "createReply",
            targetType: "post",
            targetId: activePrayerRequest.id,
            body: trimmedBody,
            replyId,
          });
          setEncouragementDraft("");
        }}
        followsDiscussion={followsDiscussion}
        showDiscussionFollow={activePrayerRequest.userId !== state.currentUserId && (followsDiscussion || hasCommented)}
        onToggleDiscussionFollow={() => {
          void dispatch({
            type: "setDiscussionFollow",
            targetType: "post",
            targetId: activePrayerRequest.id,
            following: !followsDiscussion,
          });
        }}
        ownsItem={activePrayerRequest.userId === state.currentUserId}
        prayer={prayer}
      />
      <PrayerMoment
        target={prayerTarget}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt) => {
          const target = prayerTarget;
          setPrayerTarget(undefined);
          if (!target) return;
          void dispatch({
            type: "finishPrayer",
            targetType: target.targetType,
            targetId: target.targetId,
            status,
            startedAt,
            recipientUserId: target.recipientUserId,
          });
        }}
      />
      <PrayerOwnerActionsSheet
        answered={answered}
        error={ownerActionsVisible ? answerError : undefined}
        onClose={() => setOwnerActionsVisible(false)}
        onEditAnswer={() => openAnswerEditor("edit")}
        onMarkAnswered={() => openAnswerEditor("mark")}
        onReopen={() => {
          void reopenPrayer();
        }}
        saving={answerSaving}
        visible={ownerActionsVisible}
      />
      <AnsweredPrayerEditorSheet
        draft={answeredUpdateDraft}
        error={answerEditorMode ? answerError : undefined}
        mode={answerEditorMode}
        onChangeDraft={setAnsweredUpdateDraft}
        onClose={() => setAnswerEditorMode(undefined)}
        onSave={() => {
          void saveAnswer();
        }}
        saving={answerSaving}
      />
    </>
  );
}
