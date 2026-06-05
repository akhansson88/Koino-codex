import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
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
import type { FeedItem, GroupImage } from "@/state/types";
import {
  AppScreen,
  Avatar,
  AvatarStack,
  BodyText,
  Card,
  IconButton,
  PrimaryButton,
  SectionHeading,
  StatusPill,
  TextInputField,
  VerseList,
} from "@/ui/app-components";
import { LinkPreview } from "@/ui/link-preview";
import { PrayerMoment, type PrayerMomentTarget } from "@/ui/prayer-moment";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors } from "@/ui/theme";

const MAX_REPLY_LENGTH = 500;

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatPrayerDuration(seconds?: number) {
  if (seconds === undefined) return "Duration unavailable";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
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
          createdAt: reaction.createdAt,
          durationSeconds:
            reaction.durationSeconds ??
            (reaction.startedAt && reaction.completedAt ? Math.max(0, Math.floor((Date.parse(reaction.completedAt) - Date.parse(reaction.startedAt)) / 1000)) : undefined),
        })),
    };
  }, [item, state.currentUserId, state.prayerReactions, targetType, userById, userImageById]);

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
  const prayerAnswered = isPrayerRequest && Boolean(item.answeredAt);
  const ownsItem = item.userId === state.currentUserId;
  const actionLabel = isPrayerRequest ? "Pray" : actionLabels[itemKind];
  const actionPastLabel = actionPastLabels[itemKind];

  async function sendReply() {
    const body = replyDraft.trim();
    if (!body || !item || !targetType) return;
    await dispatch({ type: "createReply", targetType, targetId: item.id, body });
    setReplyDraft("");
  }

  function togglePrayer() {
    if (!item || !targetType) return;
    if (isPrayerRequest) {
      setPrayerTarget({ targetType, targetId: item.id, body: item.body, recipientUserId: item.userId });
      return;
    }
    dispatch({ type: "finishPrayer", targetType, targetId: item.id, status: "completed", startedAt: new Date().toISOString() });
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
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>prayed</Text>
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
        ) : (
          <PrimaryButton icon={isPrayerRequest ? "users" : "heart"} onPress={togglePrayer} style={{ minHeight: 58 }}>
            {actionLabel}
          </PrimaryButton>
        )}
        {ownsItem && isPrayerRequest && !prayerAnswered ? (
          <SecondaryPrayerAction onPress={() => dispatch({ type: "markPrayerAnswered", id: item.id })} />
        ) : null}
        <View style={{ gap: 12 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>
            {isPrayerRequest
              ? `${prayer?.count ?? 0} ${(prayer?.count ?? 0) === 1 ? "prayer" : "prayers"} recorded`
              : `${actionPastLabel} by ${prayer?.count ?? 0} ${(prayer?.count ?? 0) === 1 ? "member" : "members"}`}
          </Text>
          {prayer?.prayedBy.length ? <AvatarStack users={prayer.prayedBy} /> : null}
        </View>
        {isPrayerRequest ? (
          <View style={{ gap: 12 }}>
            <SectionHeading>Prayer activity</SectionHeading>
            <Card style={{ gap: 0, padding: 0 }}>
              {prayer?.activity.length ? (
                prayer.activity.map((activity, index) => (
                  <View
                    key={activity.id}
                    style={{
                      borderBottomColor: colors.line,
                      borderBottomWidth: index === prayer.activity.length - 1 ? 0 : 1,
                      flexDirection: "row",
                      gap: 10,
                      padding: 14,
                    }}
                  >
                    <Feather name="users" size={18} color={colors.gold} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{activity.name} prayed</Text>
                      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                        {formatRelativeTime(activity.createdAt)} - {formatPrayerDuration(activity.durationSeconds)}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <BodyText muted style={{ padding: 14 }}>No prayer activity yet.</BodyText>
              )}
            </Card>
          </View>
        ) : null}
        <View style={{ gap: 12 }}>
          <SectionHeading>Encouragement</SectionHeading>
          <Card style={{ gap: 0, padding: 0 }}>
            {replies.length === 0 ? (
              <BodyText muted style={{ padding: 14 }}>
                No encouragement yet.
              </BodyText>
            ) : (
              replies.map((reply, index) => (
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
              ))
            )}
          </Card>
        </View>
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
