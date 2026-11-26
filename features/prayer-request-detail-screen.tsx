import { CommunityRemovalMenu } from "@/ui/community-removal-menu";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { prayerReactionsForTarget } from "@/state/prayer-reactions";
import { normalizeEntryKind } from "@/state/product";
import type { AudioClip, GroupImage, Id, Post } from "@/state/types";
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
import { DiscussionFollowButton } from "@/ui/discussion-follow-button";
import { LinkPreviewContent } from "@/ui/link-preview";
import { PrayerActivity, type PrayerActivityEntry } from "@/ui/prayer-activity";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { formatRelativeTime } from "@/ui/relative-time";
import { Separator } from "@/ui/shadcn/separator";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { SheetMenuGroup, SheetMenuItem } from "@/ui/sheet-menu";
import { WrittenEncouragementComposer } from "@/ui/written-encouragement-composer";
import { AudioCard } from "@/features/audio/audio-card";

const MAX_ANSWERED_UPDATE_LENGTH = 280;

export type PrayerRequestDetailItem = Omit<Post, "kind"> & { kind: "prayer_request" };

export type PrayerRequestDetailPrayerState = {
  count: number;
  prayed: boolean;
  prayedBy: { image?: GroupImage; name: string }[];
};

export type PrayerRequestEncouragement = {
  authorImage?: GroupImage;
  authorId?: string;
  authorName: string;
  audio?: AudioClip;
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
  communityName?: string;
  encouragementDraft: string;
  encouragements: PrayerRequestEncouragement[];
  item: PrayerRequestDetailItem;
  onBack: () => void;
  onChangeEncouragement: (value: string) => void;
  onDeleteEncouragement: (id: Id) => void;
  onOpenOwnerActions: () => void;
  onPray: () => void;
  onSendEncouragement: (body: string, replyId: string, audio?: AudioClip) => Promise<void>;
  onToggleDiscussionFollow: () => void;
  ownsItem: boolean;
  prayer: PrayerRequestDetailPrayerState;
  followsDiscussion: boolean;
  showDiscussionFollow: boolean;
};

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function PrayerRequestHeader({ onBack, onOpenOptions, item }: { onBack: () => void; onOpenOptions?: () => void; item?: PrayerRequestDetailItem }) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={onBack} />
      <Text numberOfLines={1} style={[typography.title, { color: colors.ink, flex: 1, marginHorizontal: 8, textAlign: "center" }]}>
        {t("community.page.prayer")}
      </Text>
      {onOpenOptions ? (
        <IconButton accessibilityLabel={t("community.prayer.ownerActions")} icon="more-horizontal" onPress={onOpenOptions} />
      ) : (
        item ? <CommunityRemovalMenu groupId={item.groupId} targetType="post" targetId={item.id} authorId={item.userId} /> : <View style={{ width: 38 }} />
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
      dismissible={!saving} onClose={onClose}
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
      <Text style={[typography.caption, { color: colors.muted, textAlign: "right" }]}>
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
  const pendingAction = useRef<(() => void) | undefined>(undefined);
  return (
    <BottomSheet dismissible={!saving} onClose={onClose} title={t("community.prayer.ownerActions")} visible={visible}
      onDismiss={() => {
        const action = pendingAction.current;
        pendingAction.current = undefined;
        action?.();
      }}
    >
      <SheetMenuGroup>
        {answered ? (
          <>
            <SheetMenuItem disabled={saving} icon="edit-2" title={t("community.prayer.editAnswer")} onPress={() => { pendingAction.current = onEditAnswer; onClose(); }} />
            <SheetMenuItem disabled={saving} icon="rotate-ccw" showDivider title={t("community.prayer.reopen")} onPress={() => { pendingAction.current = onReopen; onClose(); }} />
          </>
        ) : (
          <SheetMenuItem disabled={saving} icon="check-circle" title={t("community.prayer.markAnswered")} onPress={() => { pendingAction.current = onMarkAnswered; onClose(); }} />
        )}
      </SheetMenuGroup>
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
        {loading ? <ActivityIndicator color={colors.ink} /> : <BodyText muted>{t("community.prayer.unavailable")}</BodyText>}
      </Card>
    </AppScreen>
  );
}

export function PrayerRequestDetailScreen({
  activity,
  answered,
  authorImage,
  authorName,
  communityName,
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
      <PrayerRequestHeader onBack={onBack} item={item} onOpenOptions={ownsItem ? onOpenOwnerActions : undefined} />
      <View style={{ alignItems: "center", gap: 8 }}>
        <Avatar image={authorImage} name={authorName} size={56} tone="green" />
        <View style={{ alignItems: "center", gap: 2 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{authorName}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{formatRelativeTime(item.createdAt, language)}</Text>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={[typography.heading, { color: colors.ink, textAlign: "center" }]}>
          {item.title || t("community.defaultTitle.prayerRequest")}
        </Text>
        {item.audio ? <AudioCard clip={item.audio} /> : null}
        {item.body ? (
          <LinkPreviewContent text={item.body}>
            {({ hiddenUrl, preview }) => (
              <>
                <BodyText hiddenUrl={hiddenUrl} style={{ fontSize: 16, lineHeight: 24, textAlign: "center" }}>
                  {item.body}
                </BodyText>
                {preview}
              </>
            )}
          </LinkPreviewContent>
        ) : item.audio ? null : (
          <BodyText style={{ textAlign: "center" }}>{t("community.card.noWords")}</BodyText>
        )}
      </View>
      <VerseList verse={item.verse} verses={item.verses} />
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 14 }}>
        <View style={{ alignItems: "center", flex: 1, gap: 3 }}>
          <Text style={[typography.title, { color: colors.ink }]}>{prayer.count}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{communityPrayerNoun(prayer.count, t)}</Text>
        </View>
        <View style={{ backgroundColor: colors.line, height: 34, width: 1 }} />
        <View style={{ alignItems: "center", flex: 1, gap: 5 }}>
          <StatusPill status={answered ? "answered" : "open"} />
          <Text style={[typography.caption, { color: colors.muted }]}>{t("community.prayer.status.label")}</Text>
        </View>
      </Card>
      {prayer.prayedBy.length > 0 ? <AvatarStack users={prayer.prayedBy} /> : null}
      {answered ? (
        <Card style={{ gap: 10 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: shadcn.successSoft,
                borderCurve: "continuous",
                borderRadius: radius.md,
                height: 36,
                justifyContent: "center",
                width: 36,
              }}
            >
              <Feather name="check" size={18} color={shadcn.success} />
            </View>
            <Text style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{t("community.prayer.answeredTitle")}</Text>
          </View>
          <BodyText muted>
            {t("community.prayer.markedAnswered", { time: formatRelativeTime(item.answeredAt ?? item.createdAt, language) })}
          </BodyText>
          {item.answeredUpdate?.trim() ? (
            <View style={{ gap: 8 }}>
              <Separator />
              <Text style={[typography.sectionLabel, { color: colors.muted, fontSize: 10 }]}>
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
          <Card style={{ gap: 0, overflow: "hidden", padding: 0 }}>
            {encouragements.map((encouragement, index) => (
              <View key={encouragement.id}>
                <View style={{ gap: 8, padding: 14 }}>
                  <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                    <Avatar image={encouragement.authorImage} name={encouragement.authorName} size={30} tone="pink" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={2} style={[typography.cardTitle, { color: colors.ink, fontSize: 14, lineHeight: 19 }]}>
                        {encouragement.authorName}
                      </Text>
                      <Text style={[typography.caption, { color: colors.muted }]}>
                        {formatRelativeTime(encouragement.createdAt, language)}
                      </Text>
                    </View>
                    {encouragement.canDelete ? (
                      <Pressable
                        accessibilityLabel={t("community.reply.delete")}
                        accessibilityRole="button"
                        onPress={() => onDeleteEncouragement(encouragement.id)}
                        style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}
                      >
                        <Feather name="trash-2" size={16} color={colors.danger} />
                      </Pressable>
                    ) : encouragement.authorId ? <CommunityRemovalMenu groupId={item.groupId} targetType="reply" targetId={encouragement.id} authorId={encouragement.authorId} /> : null}
                  </View>
                  {encouragement.audio ? <AudioCard clip={encouragement.audio} /> : null}
                  {encouragement.body ? (
                    <LinkPreviewContent text={encouragement.body}>
                      {({ hiddenUrl, preview }) => (
                        <>
                          <BodyText hiddenUrl={hiddenUrl}>{encouragement.body}</BodyText>
                          {preview}
                        </>
                      )}
                    </LinkPreviewContent>
                  ) : null}
                </View>
                {index < encouragements.length - 1 ? <Separator style={{ marginHorizontal: 14 }} /> : null}
              </View>
            ))}
          </Card>
        </View>
      ) : null}
      <WrittenEncouragementComposer
        communityName={communityName}
        groupId={item.groupId}
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
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: prayed ? shadcn.secondary : pressed ? "#292524" : shadcn.primary,
        borderColor: prayed ? shadcn.border : shadcn.primary,
        borderCurve: "continuous",
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 9,
        justifyContent: "center",
        minHeight: 52,
        paddingHorizontal: 18,
      })}
    >
      <MaterialCommunityIcons name="hands-pray" size={20} color={prayed ? colors.ink : shadcn.primaryForeground} />
      <Text style={[typography.button, { color: prayed ? colors.ink : shadcn.primaryForeground }]}>
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
              audio: reply.audio,
              body: reply.body,
              canDelete: reply.userId === state.currentUserId,
              authorId: reply.userId,
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
        communityName={state.groups.find((group) => group.id === activePrayerRequest.groupId)?.name}
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
        onSendEncouragement={async (body, replyId, audio) => {
          const trimmedBody = body.trim();
          if (!trimmedBody && !audio) return;
          await dispatch({
            type: "createReply",
            targetType: "post",
            targetId: activePrayerRequest.id,
            body: trimmedBody,
            ...(audio ? { audio } : {}),
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
