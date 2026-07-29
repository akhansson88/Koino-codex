import { useMemo, useState } from "react";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { prayerReactionsForTarget } from "@/state/prayer-reactions";
import {
  EntryVisibility,
  entryKindIcon,
  feedItemKind,
  visibility,
} from "@/state/product";
import type { BibleVerse, EntryKind, FeedItem, GroupImage, PostReactionKind } from "@/state/types";
import {
  AppScreen,
  Avatar,
  AvatarStack,
  BodyText,
  Card,
  IconButton,
  SectionHeading,
  StatusPill,
  TextInputField,
  VerseList,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import {
  communityActionLabel,
  communityDefaultFeedTitle,
  communityFeedItemLabel,
  communityPrayerMomentDisplayCopy,
  communityPrayerNoun,
} from "@/ui/community-copy";
import { LinkPreviewContent } from "@/ui/link-preview";
import { CommunityCardAction, CommunityCheckInMood, CommunityContentTypeLabel } from "@/ui/post-card";
import { PrayerActivity } from "@/ui/prayer-activity";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { formatRelativeTime } from "@/ui/relative-time";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, typography } from "@/ui/theme";

const MAX_REPLY_LENGTH = 500;

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function kindIcon(item: FeedItem) {
  if (item.type === "check_in") return "check-circle" as const;
  return entryKindIcon(item.kind);
}

function targetTypeFor(item: FeedItem) {
  return item.type === "post" ? "post" : "check_in";
}

export function FeedDetailScreen() {
  const { id, targetType: routeTarget } = useLocalSearchParams<{ id?: string; targetType?: string }>();
  const routeId = routeParam(id);
  const routeTargetType = routeParam(routeTarget);
  const { state, dispatch } = useKoino();
  const { language, t } = useAppTranslation();
  const navigation = useNavigation();
  const [replyDraft, setReplyDraft] = useState("");
  const [allowRemove, setAllowRemove] = useState(false);
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const [reflectionComposerVisible, setReflectionComposerVisible] = useState(false);
  const [reflectionKind, setReflectionKind] = useState<EntryKind>("reflection");
  const [reflectionVisibility, setReflectionVisibility] = useState<EntryVisibility>(visibility.private);
  const [reflectionTitle, setReflectionTitle] = useState("");
  const [reflectionBody, setReflectionBody] = useState("");
  const [reflectionVerses, setReflectionVerses] = useState<BibleVerse[]>([]);
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const userImageById = useMemo(() => new Map(state.users.map((user) => [user.id, user.image])), [state.users]);
  const item = useMemo<FeedItem | undefined>(() => {
    if (!routeId) return undefined;
    if (routeTargetType === "post") {
      const post = state.posts.find((candidate) => candidate.id === routeId && candidate.groupId === state.currentGroupId);
      return post ? { ...post, type: "post" } : undefined;
    }
    if (routeTargetType === "check_in") {
      const checkIn = state.checkIns.find((candidate) => candidate.id === routeId && candidate.groupId === state.currentGroupId);
      return checkIn
        ? {
            type: "check_in",
            id: checkIn.id,
            userId: checkIn.userId,
            groupId: checkIn.groupId,
            body: checkIn.reflectionText,
            mood: checkIn.mood,
            readToday: checkIn.readToday,
            verse: checkIn.verse,
            verses: checkIn.verses,
            createdAt: checkIn.createdAt,
          }
        : undefined;
    }
    return undefined;
  }, [routeId, routeTargetType, state.checkIns, state.currentGroupId, state.posts]);

  const targetType = item ? targetTypeFor(item) : undefined;
  const replies = useMemo(
    () =>
      targetType && item
        ? state.replies
            .filter((reply) => reply.targetType === targetType && reply.targetId === item.id)
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        : [],
    [item, state.replies, targetType],
  );
  const prayer = useMemo(() => {
    if (!item || !targetType) return undefined;
    const reactions = prayerReactionsForTarget(state.prayerReactions, targetType, item.id);
    return {
      prayed: reactions.some((reaction) => reaction.userId === state.currentUserId),
      count: reactions.length,
      prayedBy: reactions.map((reaction) => ({
        name: userById.get(reaction.userId) ?? t("common.someone"),
        image: userImageById.get(reaction.userId),
      })),
      activity: reactions
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((reaction) => ({
          id: reaction.id,
          name: reaction.userId === state.currentUserId ? t("common.you") : userById.get(reaction.userId) ?? t("common.someone"),
          image: userImageById.get(reaction.userId),
          createdAt: reaction.createdAt,
          durationSeconds:
            reaction.durationSeconds ??
            (reaction.startedAt && reaction.completedAt ? Math.max(0, Math.floor((Date.parse(reaction.completedAt) - Date.parse(reaction.startedAt)) / 1000)) : undefined),
        })),
    };
  }, [item, state.currentUserId, state.prayerReactions, t, targetType, userById, userImageById]);
  const reaction = useMemo(() => {
    if (!item || !targetType) return undefined;
    const itemReactionKind = feedItemKind(item);
    if (itemReactionKind === "prayer_request" || itemReactionKind === "prayer_moment") return undefined;
    const kind = itemReactionKind as PostReactionKind;
    const reactions = state.postReactions.filter((candidate) => candidate.targetType === targetType && candidate.targetId === item.id && candidate.kind === kind);
    const reactedByUserIds = [...new Set(reactions.map((candidate) => candidate.userId))];
    return {
      reacted: reactions.some((candidate) => candidate.userId === state.currentUserId),
      count: reactions.length,
      kind,
      reactedBy: reactedByUserIds.map((userId) => ({ name: userById.get(userId) ?? t("common.someone"), image: userImageById.get(userId) })),
    };
  }, [item, state.currentUserId, state.postReactions, t, targetType, userById, userImageById]);

  usePreventRemove(Boolean(replyDraft.trim()) && !allowRemove, ({ data }) => {
    Alert.alert(t("community.reply.discardTitle"), t("community.reply.discardBody"), [
      { text: t("community.reply.keepWriting"), style: "cancel" },
      {
        text: t("community.reply.discard"),
        style: "destructive",
        onPress: () => {
          setAllowRemove(true);
          setReplyDraft("");
          setTimeout(() => navigation.dispatch(data.action), 0);
        },
      },
    ]);
  });

  if (!item || !targetType) {
    return (
      <AppScreen>
        <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={() => router.back()} />
        <Card>
          <BodyText muted>{t("community.detail.unavailable")}</BodyText>
        </Card>
      </AppScreen>
    );
  }

  const authorName = userById.get(item.userId) ?? t("common.someone");
  const authorImage = userImageById.get(item.userId);
  const itemKind = feedItemKind(item);
  const isPrayerRequest = item.type === "post" && itemKind === "prayer_request";
  const isPrayerMoment = item.type === "post" && itemKind === "prayer_moment";
  const isPraise = item.type === "post" && itemKind === "praise";
  const isScripture = item.type === "post" && itemKind === "scripture";
  const displayCopy = item.type === "post" ? communityPrayerMomentDisplayCopy(item, t) : { body: item.body, title: undefined };
  const hasPersonalNote = Boolean(displayCopy.body.trim());
  const prayerAnswered = isPrayerRequest && Boolean(item.answeredAt);
  const ownsItem = item.userId === state.currentUserId;
  const actionPastLabel = communityActionLabel(itemKind, true, t);
  const canReact = !isPrayerRequest && !isPrayerMoment;
  const isExpandedFeedCard = item.type === "check_in" || itemKind === "reflection";
  const group = state.groups.find((candidate) => candidate.id === state.currentGroupId);

  async function sendReply() {
    const body = replyDraft.trim();
    if (!body || !item || !targetType) return;
    await dispatch({ type: "createReply", targetType, targetId: item.id, body });
    setReplyDraft("");
  }

  function startPrayer() {
    if (!item || !targetType) return;
    setPrayerTarget({
      targetType,
      targetId: item.id,
      body: displayCopy.body,
      recipientUserId: item.userId,
      recipientName: authorName,
      recipientImage: authorImage,
    });
  }

  function toggleReaction() {
    if (!item || !targetType || !canReact || !reaction) return;
    dispatch({ type: "togglePostReaction", targetType, targetId: item.id, kind: reaction.kind });
  }

  function openScriptureReflection() {
    if (!item) return;
    const attachedVerses = normalizeBibleVerses(item.verse, item.verses);
    setReflectionKind("reflection");
    setReflectionVisibility(visibility.private);
    setReflectionTitle(attachedVerses[0]?.reference ?? "");
    setReflectionBody("");
    setReflectionVerses(attachedVerses);
    setReflectionComposerVisible(true);
  }

  function closeScriptureReflection() {
    setReflectionComposerVisible(false);
  }

  async function submitScriptureReflection() {
    if (!reflectionBody.trim()) return;
    await dispatch({
      type: "createJournalEntry",
      entryKind: reflectionKind,
      title: reflectionTitle,
      body: reflectionBody,
      verse: primaryBibleVerse(reflectionVerses),
      verses: reflectionVerses,
      shareWithGroup: reflectionVisibility === visibility.room,
    });
    setReflectionComposerVisible(false);
    setReflectionTitle("");
    setReflectionBody("");
    setReflectionVerses([]);
  }

  const replyList = replies.length > 0 ? (
    <Card style={{ gap: 0, padding: 0 }}>
      {replies.map((reply, index) => (
        <View
          key={reply.id}
          style={{
            borderBottomColor: colors.line,
            borderBottomWidth: index === replies.length - 1 ? 0 : 1,
            gap: 8,
            padding: 14,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
            <Avatar image={userImageById.get(reply.userId)} name={userById.get(reply.userId)} size={32} tone="pink" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                {userById.get(reply.userId) ?? t("common.someone")}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(reply.createdAt, language)}</Text>
            </View>
            {reply.userId === state.currentUserId ? (
              <Pressable
                accessibilityLabel={t("community.reply.delete")}
                accessibilityRole="button"
                onPress={() => dispatch({ type: "deleteReply", id: reply.id })}
                style={{ padding: 6 }}
              >
                <Feather name="trash-2" size={16} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
          <LinkPreviewContent text={reply.body}>
            {({ hiddenUrl, preview }) => (
              <>
                <BodyText hiddenUrl={hiddenUrl}>{reply.body}</BodyText>
                {preview}
              </>
            )}
          </LinkPreviewContent>
        </View>
      ))}
    </Card>
  ) : null;

  const encouragementInput = (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
      <TextInputField
        value={replyDraft}
        onChangeText={(value) => setReplyDraft(value.slice(0, MAX_REPLY_LENGTH))}
        onSubmitEditing={sendReply}
        placeholder={
          itemKind === "update"
            ? t("community.reply.responsePlaceholder")
            : t("community.reply.encouragementPlaceholder")
        }
        returnKeyType="send"
        style={{ flex: 1 }}
      />
      <Pressable
        accessibilityLabel={t("community.reply.send")}
        accessibilityRole="button"
        disabled={!replyDraft.trim()}
        onPress={sendReply}
        style={{
          alignItems: "center",
          height: 48,
          justifyContent: "center",
          opacity: replyDraft.trim() ? 1 : 0.4,
          width: 48,
        }}
      >
        <Feather name="send" size={22} color={colors.gold} />
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ backgroundColor: colors.cream, flex: 1 }}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={() => router.back()} />
          <View style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}>
            <Feather name="more-horizontal" size={22} color={colors.ink} />
          </View>
        </View>
        {isExpandedFeedCard ? (
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10, minWidth: 0 }}>
            <Avatar image={authorImage as GroupImage | undefined} name={authorName} size={42} tone="green" />
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text numberOfLines={2} style={[typography.label, { color: colors.ink, fontSize: 15 }]}>
                {authorName}
              </Text>
              <Text style={[typography.caption, { color: colors.muted }]}>{formatRelativeTime(item.createdAt, language)}</Text>
            </View>
            <View style={{ alignItems: "flex-end", flexShrink: 1, maxWidth: "46%", minWidth: 0 }}>
              <CommunityContentTypeLabel item={item} />
            </View>
          </View>
        ) : (
          <>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <Feather name={kindIcon(item)} size={18} color={colors.gold} />
              <Text style={{ color: colors.gold, fontSize: 14, fontWeight: "900" }}>{communityFeedItemLabel(item, t)}</Text>
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
              <Avatar image={authorImage as GroupImage | undefined} name={authorName} size={48} tone="orange" />
              <View>
                <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{authorName}</Text>
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{formatRelativeTime(item.createdAt, language)}</Text>
              </View>
            </View>
          </>
        )}
        {!isScripture || hasPersonalNote ? (
          <View style={{ gap: 12 }}>
            {!isExpandedFeedCard && !isScripture ? (
              <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900", lineHeight: 30 }}>
                {displayCopy.title || communityDefaultFeedTitle(item, t)}
              </Text>
            ) : null}
            <LinkPreviewContent text={displayCopy.body}>
              {({ hiddenUrl, preview }) => (
                <>
                  <BodyText hiddenUrl={hiddenUrl} style={{ fontSize: isExpandedFeedCard ? 16 : 17, lineHeight: isExpandedFeedCard ? 24 : 25 }}>
                    {displayCopy.body || t("community.card.noWords")}
                  </BodyText>
                  {preview}
                </>
              )}
            </LinkPreviewContent>
          </View>
        ) : null}
        {item.type === "check_in" ? <CommunityCheckInMood mood={item.mood} /> : null}
        <VerseList compact={isExpandedFeedCard} verse={item.verse} verses={item.verses} />
        {isPrayerRequest ? (
          <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 14 }}>
            <View style={{ alignItems: "center", flex: 1, gap: 3 }}>
              <Text style={{ color: colors.gold, fontSize: 18, fontWeight: "900" }}>{prayer?.count ?? 0}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{communityPrayerNoun(prayer?.count ?? 0, t)}</Text>
            </View>
            <View style={{ backgroundColor: colors.line, height: 34, width: 1 }} />
            <View style={{ alignItems: "center", flex: 1, gap: 3 }}>
              <StatusPill status={prayerAnswered ? "answered" : "open"} />
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{t("community.prayer.status.label")}</Text>
            </View>
          </Card>
        ) : null}
        {prayerAnswered ? (
          <Card style={{ alignItems: "center", flexDirection: "row", gap: 10, padding: 14 }}>
            <Feather name="check-circle" size={20} color={colors.olive} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{t("community.prayer.answeredTitle")}</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>
                {t("community.prayer.markedAnswered", { time: formatRelativeTime(item.answeredAt ?? item.createdAt, language) })}
              </Text>
            </View>
          </Card>
        ) : isPraise ? (
          <DetailPraiseButton active={Boolean(reaction?.reacted)} label={communityActionLabel(itemKind, Boolean(reaction?.reacted), t)} onPress={toggleReaction} />
        ) : isScripture ? (
          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <CommunityCardAction
              icon="book-open"
              label={communityActionLabel(itemKind, false, t)}
              onPress={openScriptureReflection}
              tone="scripture"
            />
            <CommunityCardAction
              active={Boolean(prayer?.prayed)}
              icon="pray"
              label={t(prayer?.prayed ? "community.action.prayer.completed" : "community.action.prayer.default")}
              onPress={startPrayer}
              tone="prayer"
              variant="secondary"
            />
          </View>
        ) : !isPrayerMoment && isExpandedFeedCard && canReact ? (
          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <CommunityCardAction
              active={Boolean(reaction?.reacted)}
              icon="heart"
              label={communityActionLabel(itemKind, Boolean(reaction?.reacted), t)}
              onPress={toggleReaction}
              tone={item.type === "check_in" ? "check_in" : "reflection"}
            />
            <CommunityCardAction
              active={Boolean(prayer?.prayed)}
              icon="pray"
              label={t(prayer?.prayed ? "community.action.prayer.completed" : "community.action.prayer.default")}
              onPress={startPrayer}
              tone="prayer"
              variant="secondary"
            />
          </View>
        ) : !isPrayerMoment ? (
          <View style={{ gap: 10 }}>
            <DetailPrayerButton onPress={startPrayer} prayed={Boolean(prayer?.prayed)} />
            {canReact ? (
              <DetailReactionButton active={Boolean(reaction?.reacted)} label={communityActionLabel(itemKind, Boolean(reaction?.reacted), t)} onPress={toggleReaction} />
            ) : null}
          </View>
        ) : null}
        {ownsItem && isPrayerRequest && !prayerAnswered ? (
          <SecondaryPrayerAction onPress={() => dispatch({ type: "markPrayerAnswered", id: item.id })} />
        ) : null}
        {!isPrayerMoment && !isExpandedFeedCard && !isPraise && (!isScripture || (prayer?.count ?? 0) > 0) ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>
              {t((prayer?.count ?? 0) === 1 ? "community.detail.prayerRecorded.one" : "community.detail.prayerRecorded.other", {
                count: prayer?.count ?? 0,
              })}
            </Text>
            {prayer?.prayedBy.length ? <AvatarStack users={prayer.prayedBy} /> : null}
          </View>
        ) : null}
        {canReact && !isScripture && !isExpandedFeedCard && (!isPraise || (reaction?.count ?? 0) > 0) ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>
              {t((reaction?.count ?? 0) === 1 ? "community.detail.reactionSummary.one" : "community.detail.reactionSummary.other", {
                action: actionPastLabel,
                count: reaction?.count ?? 0,
              })}
            </Text>
            {reaction?.reactedBy.length ? <AvatarStack users={reaction.reactedBy} /> : null}
          </View>
        ) : null}
        {!isExpandedFeedCard && replies.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionHeading>
              {isPraise ? t("community.detail.encouragementsHeading", { count: replies.length }) : t("community.reply.heading")}
            </SectionHeading>
            {replyList}
          </View>
        ) : null}
        {isExpandedFeedCard && canReact ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>
              {t("community.detail.encouragementsHeading", { count: reaction?.count ?? 0 })}
            </Text>
            {reaction?.reactedBy.length ? <AvatarStack users={reaction.reactedBy} /> : null}
            {replyList}
            {encouragementInput}
          </View>
        ) : encouragementInput}
        {!isPraise ? <PrayerActivity activity={prayer?.activity ?? []} /> : null}
      </AppScreen>
      <SharedComposer
        visible={reflectionComposerVisible}
        context="journal"
        kind={reflectionKind}
        entryVisibility={reflectionVisibility}
        title={reflectionTitle}
        body={reflectionBody}
        verses={reflectionVerses}
        onKind={setReflectionKind}
        onVisibility={setReflectionVisibility}
        onTitle={setReflectionTitle}
        onBody={setReflectionBody}
        onVerses={setReflectionVerses}
        onClose={closeScriptureReflection}
        onSubmit={submitScriptureReflection}
        roomName={group?.name}
        roomImage={group?.image}
      />
      <PrayerMoment
        target={prayerTarget}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt) => {
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
    </KeyboardAvoidingView>
  );
}

function DetailPraiseButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.warmSoft : colors.accentWarm,
        borderColor: colors.accentWarm,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        minHeight: 58,
        paddingHorizontal: 18,
      }}
    >
      <Ionicons name={active ? "star" : "star-outline"} size={21} color={active ? colors.textMuted : colors.onAccent} />
      <Text style={{ color: active ? colors.textMuted : colors.onAccent, fontSize: 16, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function DetailPrayerButton({ onPress, prayed }: { onPress: () => void; prayed: boolean }) {
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
        minHeight: 58,
        paddingHorizontal: 18,
      }}
    >
      <MaterialCommunityIcons name="hands-pray" size={21} color={prayed ? colors.textMuted : colors.onAccent} />
      <Text style={{ color: prayed ? colors.textMuted : colors.onAccent, fontSize: 16, fontWeight: "900" }}>
        {t(prayed ? "community.action.prayer.completed" : "community.action.prayer.default")}
      </Text>
    </Pressable>
  );
}

function DetailReactionButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 9,
        justifyContent: "center",
        minHeight: 52,
        paddingHorizontal: 18,
      }}
    >
      <Ionicons name={active ? "heart" : "heart-outline"} size={20} color={active ? colors.accentPrayer : colors.olive} />
      <Text style={{ color: colors.olive, fontSize: 16, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function SecondaryPrayerAction({ onPress }: { onPress: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 9,
        justifyContent: "center",
        minHeight: 50,
        paddingHorizontal: 16,
      }}
    >
      <Feather name="check-circle" size={18} color={colors.olive} />
      <Text style={{ color: colors.olive, fontSize: 15, fontWeight: "900" }}>{t("community.prayer.markAnswered")}</Text>
    </Pressable>
  );
}
