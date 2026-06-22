import { useMemo, useState } from "react";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import {
  actionLabels,
  actionPastLabels,
  defaultFeedTitle as productDefaultFeedTitle,
  entryKindIcon,
  feedItemKind,
  feedItemLabel,
  moodLabel,
} from "@/state/product";
import type { FeedItem, GroupImage, PostReactionKind } from "@/state/types";
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
import { LinkPreview } from "@/ui/link-preview";
import { prayerCountNoun } from "@/ui/prayer-copy";
import { PrayerActivity } from "@/ui/prayer-activity";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors } from "@/ui/theme";

const MAX_REPLY_LENGTH = 500;

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function kindLabel(item: FeedItem) {
  return feedItemLabel(item);
}

function kindIcon(item: FeedItem) {
  if (item.type === "check_in") return "check-circle" as const;
  return entryKindIcon(item.kind);
}

function defaultTitle(item: FeedItem) {
  return productDefaultFeedTitle(item, moodLabel);
}

function targetTypeFor(item: FeedItem) {
  return item.type === "post" ? "post" : "check_in";
}

export function FeedDetailScreen() {
  const { id, targetType: routeTarget } = useLocalSearchParams<{ id?: string; targetType?: string }>();
  const routeId = routeParam(id);
  const routeTargetType = routeParam(routeTarget);
  const { state, dispatch } = useKoino();
  const navigation = useNavigation();
  const [replyDraft, setReplyDraft] = useState("");
  const [allowRemove, setAllowRemove] = useState(false);
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
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
    const reactions = state.prayerReactions.filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id);
    const prayedByUserIds = [...new Set(reactions.map((reaction) => reaction.userId))];
    return {
      prayed: reactions.some((reaction) => reaction.userId === state.currentUserId),
      count: reactions.length,
      prayedBy: prayedByUserIds.map((userId) => ({ name: userById.get(userId) ?? "Someone", image: userImageById.get(userId) })),
      activity: reactions
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((reaction) => ({
          id: reaction.id,
          name: reaction.userId === state.currentUserId ? "You" : userById.get(reaction.userId) ?? "Someone",
          image: userImageById.get(reaction.userId),
          createdAt: reaction.createdAt,
          durationSeconds:
            reaction.durationSeconds ??
            (reaction.startedAt && reaction.completedAt ? Math.max(0, Math.floor((Date.parse(reaction.completedAt) - Date.parse(reaction.startedAt)) / 1000)) : undefined),
        })),
    };
  }, [item, state.currentUserId, state.prayerReactions, targetType, userById, userImageById]);
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
      reactedBy: reactedByUserIds.map((userId) => ({ name: userById.get(userId) ?? "Someone", image: userImageById.get(userId) })),
    };
  }, [item, state.currentUserId, state.postReactions, targetType, userById, userImageById]);

  usePreventRemove(Boolean(replyDraft.trim()) && !allowRemove, ({ data }) => {
    Alert.alert("Discard reply?", "Your draft encouragement has not been sent.", [
      { text: "Keep writing", style: "cancel" },
      {
        text: "Discard",
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
        <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => router.back()} />
        <Card>
          <BodyText muted>This post is no longer available.</BodyText>
        </Card>
      </AppScreen>
    );
  }

  const authorName = userById.get(item.userId) ?? "Someone";
  const authorImage = userImageById.get(item.userId);
  const itemKind = feedItemKind(item);
  const isPrayerRequest = item.type === "post" && itemKind === "prayer_request";
  const isPrayerMoment = item.type === "post" && itemKind === "prayer_moment";
  const prayerAnswered = isPrayerRequest && Boolean(item.answeredAt);
  const ownsItem = item.userId === state.currentUserId;
  const actionPastLabel = actionPastLabels[itemKind];
  const canReact = !isPrayerRequest && !isPrayerMoment;

  async function sendReply() {
    const body = replyDraft.trim();
    if (!body || !item || !targetType) return;
    await dispatch({ type: "createReply", targetType, targetId: item.id, body });
    setReplyDraft("");
  }

  function startPrayer() {
    if (!item || !targetType) return;
    setPrayerTarget({ targetType, targetId: item.id, body: item.body, recipientUserId: item.userId });
  }

  function toggleReaction() {
    if (!item || !targetType || !canReact || !reaction) return;
    dispatch({ type: "togglePostReaction", targetType, targetId: item.id, kind: reaction.kind });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ backgroundColor: colors.cream, flex: 1 }}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => router.back()} />
          <Feather name="more-horizontal" size={22} color={colors.ink} />
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <Feather name={kindIcon(item)} size={18} color={colors.gold} />
          <Text style={{ color: colors.gold, fontSize: 14, fontWeight: "900" }}>{kindLabel(item)}</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <Avatar image={authorImage as GroupImage | undefined} name={authorName} size={48} tone="orange" />
          <View>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{authorName}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900", lineHeight: 30 }}>
            {item.type === "post" ? item.title || defaultTitle(item) : defaultTitle(item)}
          </Text>
          <BodyText style={{ fontSize: 17, lineHeight: 25 }}>{item.body || "No words today, just presence."}</BodyText>
          <LinkPreview text={item.body} />
        </View>
        <VerseList verse={item.verse} verses={item.verses} />
        {isPrayerRequest ? (
          <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 14 }}>
            <View style={{ alignItems: "center", flex: 1, gap: 3 }}>
              <Text style={{ color: colors.gold, fontSize: 18, fontWeight: "900" }}>{prayer?.count ?? 0}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{prayerCountNoun(prayer?.count ?? 0)}</Text>
            </View>
            <View style={{ backgroundColor: colors.line, height: 34, width: 1 }} />
            <View style={{ alignItems: "center", flex: 1, gap: 3 }}>
              <StatusPill status={prayerAnswered ? "answered" : "open"} />
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>status</Text>
            </View>
          </Card>
        ) : null}
        {prayerAnswered ? (
          <Card style={{ alignItems: "center", flexDirection: "row", gap: 10, padding: 14 }}>
            <Feather name="check-circle" size={20} color={colors.olive} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Answered prayer</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Marked answered {formatRelativeTime(item.answeredAt ?? item.createdAt)}</Text>
            </View>
          </Card>
        ) : !isPrayerMoment ? (
          <View style={{ gap: 10 }}>
            <DetailPrayerButton onPress={startPrayer} />
            {canReact ? (
              <DetailReactionButton active={Boolean(reaction?.reacted)} label={reaction?.reacted ? actionPastLabels[itemKind] : actionLabels[itemKind]} onPress={toggleReaction} />
            ) : null}
          </View>
        ) : null}
        {ownsItem && isPrayerRequest && !prayerAnswered ? (
          <SecondaryPrayerAction onPress={() => dispatch({ type: "markPrayerAnswered", id: item.id })} />
        ) : null}
        {!isPrayerMoment ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>
              {`${prayer?.count ?? 0} ${(prayer?.count ?? 0) === 1 ? "prayer" : "prayers"} recorded`}
            </Text>
            {prayer?.prayedBy.length ? <AvatarStack users={prayer.prayedBy} /> : null}
          </View>
        ) : null}
        {canReact ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>
              {`${actionPastLabel} by ${reaction?.count ?? 0} ${(reaction?.count ?? 0) === 1 ? "member" : "members"}`}
            </Text>
            {reaction?.reactedBy.length ? <AvatarStack users={reaction.reactedBy} /> : null}
          </View>
        ) : null}
        {replies.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionHeading>Encouragement</SectionHeading>
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
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{userById.get(reply.userId) ?? "Someone"}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(reply.createdAt)}</Text>
                    </View>
                    {reply.userId === state.currentUserId ? (
                      <Pressable onPress={() => dispatch({ type: "deleteReply", id: reply.id })} style={{ padding: 6 }}>
                        <Feather name="trash-2" size={16} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                  <BodyText>{reply.body}</BodyText>
                  <LinkPreview text={reply.body} />
                </View>
              ))}
            </Card>
          </View>
        ) : null}
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <TextInputField
            value={replyDraft}
            onChangeText={(value) => setReplyDraft(value.slice(0, MAX_REPLY_LENGTH))}
            onSubmitEditing={sendReply}
            placeholder={itemKind === "update" ? "Write a response..." : itemKind === "praise" ? "Write an amen..." : "Write an encouragement..."}
            returnKeyType="send"
            style={{ flex: 1 }}
          />
          <Pressable
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
        <PrayerActivity activity={prayer?.activity ?? []} />
      </AppScreen>
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

function DetailPrayerButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.gold,
        borderColor: colors.gold,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        minHeight: 58,
        paddingHorizontal: 18,
      }}
    >
      <MaterialCommunityIcons name="hands-pray" size={21} color={colors.onAccent} />
      <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: "900" }}>Pray</Text>
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
      <Text style={{ color: colors.olive, fontSize: 15, fontWeight: "900" }}>Mark answered</Text>
    </Pressable>
  );
}
