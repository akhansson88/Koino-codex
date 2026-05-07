import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Alert, Animated, Easing, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { ImageSourcePropType } from "react-native";

import { useKoino } from "@/state/koino-store";
import { FeedItem } from "@/state/types";
import { Body, Card, Choice, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { colors } from "@/ui/theme";

const moodOptions: { value: number; label: string; image: ImageSourcePropType }[] = [
  { value: 1, label: "Struggling", image: require("../emoji1-transparent.png") },
  { value: 2, label: "Okay", image: require("../emoji2-transparent.png") },
  { value: 3, label: "Good", image: require("../emoji3-transparent.png") },
  { value: 4, label: "Great", image: require("../emoji4-transparent.png") },
];
const PRAYER_COMPLETE_DELAY_MS = 15_000;

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

function formatJoinedDay(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function moodLabel(mood: number) {
  return moodOptions.find((option) => option.value === mood)?.label ?? moodOptions[moodOptions.length - 1].label;
}

export function HomeScreen() {
  const { state, dispatch } = useKoino();
  const [mood, setMood] = useState(3);
  const [readToday, setReadToday] = useState(true);
  const [reflectionText, setReflectionText] = useState("");
  const [visibility, setVisibility] = useState<"private" | "group">("group");
  const [postBody, setPostBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [prayerTarget, setPrayerTarget] = useState<{ targetType: "post" | "check_in"; targetId: string; body: string }>();

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const groupMembers = useMemo(
    () =>
      state.memberships
        .filter((membership) => membership.groupId === state.currentGroupId)
        .sort((a, b) => {
          if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
          if (a.userId === state.currentUserId) return -1;
          if (b.userId === state.currentUserId) return 1;
          return a.userName.localeCompare(b.userName);
        }),
    [state.currentGroupId, state.currentUserId, state.memberships],
  );
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const feedItems = useMemo<FeedItem[]>(() => {
    const sharedCheckIns: FeedItem[] = state.checkIns
      .filter((item) => item.groupId === state.currentGroupId && item.visibility === "group")
      .map((item) => ({
        type: "check_in",
        id: item.id,
        userId: item.userId,
        groupId: item.groupId,
        body: item.reflectionText,
        mood: item.mood,
        readToday: item.readToday,
        createdAt: item.createdAt,
      }));
    const posts: FeedItem[] = state.posts
      .filter((item) => item.groupId === state.currentGroupId)
      .map((item) => ({ type: "post", id: item.id, userId: item.userId, groupId: item.groupId, body: item.body, createdAt: item.createdAt }));
    return [...sharedCheckIns, ...posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [state.checkIns, state.currentGroupId, state.posts]);

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 110 }}>
        <Card tone="moss">
          <Text selectable style={{ color: colors.olive, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 }}>
            SMALL GROUP
          </Text>
          <SectionTitle>{group?.name ?? "Your group"}</SectionTitle>
          <Body muted>Invite code: {group?.inviteCode ?? "..."}</Body>
        </Card>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <SectionTitle>Group members</SectionTitle>
            <View
              style={{
                backgroundColor: colors.accentSubtle,
                borderColor: colors.moss,
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text selectable style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>
                {groupMembers.length} {groupMembers.length === 1 ? "member" : "members"}
              </Text>
            </View>
          </View>
          {groupMembers.length === 0 ? (
            <Body muted>No members are visible for this group yet.</Body>
          ) : (
            <View style={{ gap: 10 }}>
              {groupMembers.map((member) => {
                const memberName = member.userName || userById.get(member.userId) || "Someone";
                const isCurrentUser = member.userId === state.currentUserId;

                return (
                  <View
                    key={member.id}
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.elevated,
                      borderColor: colors.line,
                      borderCurve: "continuous",
                      borderRadius: 18,
                      borderWidth: 1,
                      flexDirection: "row",
                      gap: 12,
                      padding: 12,
                    }}
                  >
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: member.role === "owner" ? colors.olive : colors.roseSurface,
                        borderRadius: 999,
                        height: 44,
                        justifyContent: "center",
                        width: 44,
                      }}
                    >
                      <Text
                        selectable
                        style={{
                          color: member.role === "owner" ? colors.onAccent : colors.clay,
                          fontSize: 15,
                          fontWeight: "900",
                        }}
                      >
                        {initials(memberName) || "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text selectable style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>
                        {memberName}
                        {isCurrentUser ? " (you)" : ""}
                      </Text>
                      <Body muted>Joined {formatJoinedDay(member.createdAt)}</Body>
                    </View>
                    <Text
                      selectable
                      style={{
                        color: member.role === "owner" ? colors.olive : colors.muted,
                        fontSize: 13,
                        fontWeight: "900",
                        textTransform: "capitalize",
                      }}
                    >
                      {member.role}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        <Card>
          <SectionTitle>Daily check-in</SectionTitle>
          <Body muted>A gentle entry point, not a productivity score.</Body>
          <Body>Have you read or reflected today?</Body>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Choice label="Yes" selected={readToday} onPress={() => setReadToday(true)} />
            <Choice label="Not yet" selected={!readToday} onPress={() => setReadToday(false)} />
          </View>
          <View
            style={{
              alignSelf: "stretch",
              gap: 18,
              width: "100%",
            }}
          >
            <SectionTitle>How&apos;s your heart?</SectionTitle>
            <View style={{ alignSelf: "stretch", flexDirection: "row", width: "100%" }}>
              {moodOptions.map((option) => {
                const selected = mood === option.value;

                return (
                  <Pressable
                    accessibilityLabel={`Mood ${option.value}: ${option.label}`}
                    accessibilityRole="button"
                    key={option.value}
                    onPress={() => setMood(option.value)}
                    style={{
                      alignItems: "center",
                      borderColor: selected ? "rgba(245, 243, 240, 0.72)" : "transparent",
                      borderRadius: 18,
                      borderWidth: 1,
                      flex: 1,
                      gap: 8,
                      minWidth: 0,
                      paddingVertical: 6,
                    }}
                  >
                    <View
                      style={{
                        alignSelf: "stretch",
                        aspectRatio: 1,
                        overflow: "hidden",
                        paddingHorizontal: 3,
                        width: "100%",
                      }}
                    >
                      <Image
                        source={option.image}
                        style={{
                          height: "100%",
                          objectFit: "contain",
                          width: "100%",
                        }}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={{ color: selected ? colors.ink : colors.muted, fontSize: 13, fontWeight: "800", textAlign: "center", width: "100%" }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Field
            multiline
            value={reflectionText}
            onChangeText={setReflectionText}
            placeholder="Optional reflection. A sentence is enough."
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Choice label="Share with group" selected={visibility === "group"} onPress={() => setVisibility("group")} />
            <Choice label="Save privately" selected={visibility === "private"} onPress={() => setVisibility("private")} />
          </View>
          <PillButton
            onPress={() => {
              dispatch({ type: "submitCheckIn", mood, readToday, reflectionText, visibility });
              setReflectionText("");
              setMood(3);
              setReadToday(true);
            }}
          >
            Submit check-in
          </PillButton>
        </Card>

        <Card>
          <SectionTitle>Share with group</SectionTitle>
          <Field multiline value={postBody} onChangeText={setPostBody} placeholder="Text only. Keep it simple and sincere." />
          <PillButton
            disabled={!postBody.trim()}
            onPress={() => {
              dispatch({ type: "createPost", body: postBody });
              setPostBody("");
            }}
          >
            Publish
          </PillButton>
        </Card>

        <View style={{ gap: 12 }}>
          <SectionTitle>Group feed</SectionTitle>
          {feedItems.length === 0 ? (
            <Card>
              <Body muted>No shared check-ins or posts yet. This room can stay quiet until someone is ready.</Body>
            </Card>
          ) : (
            feedItems.map((item) => {
              const targetType = item.type === "post" ? "post" : "check_in";
              const replies = state.replies.filter((reply) => reply.targetType === targetType && reply.targetId === item.id);
              const prayed = state.prayerReactions.some(
                (reaction) => reaction.userId === state.currentUserId && reaction.targetType === targetType && reaction.targetId === item.id,
              );
              const prayerCount = new Set(
                state.prayerReactions
                  .filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id)
                  .map((reaction) => reaction.userId),
              ).size;
              const prayerCountLabel = prayerCount === 1 ? "1 person prayed" : `${prayerCount} people prayed`;
              const ownsItem = item.userId === state.currentUserId;
              const draftKey = `${targetType}:${item.id}`;
              return (
                <Card key={`${item.type}-${item.id}`}>
                  {ownsItem ? (
                    <Pressable
                      accessibilityLabel={item.type === "check_in" ? "Delete check-in" : "Delete post"}
                      accessibilityRole="button"
                      hitSlop={10}
                      onPress={() => {
                        Alert.alert(
                          item.type === "check_in" ? "Delete check-in?" : "Delete post?",
                          "This will remove it from the group feed.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () =>
                                dispatch({
                                  type: item.type === "check_in" ? "deleteCheckIn" : "deletePost",
                                  id: item.id,
                                }),
                            },
                          ],
                        );
                      }}
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.dangerSurface,
                        borderColor: colors.dangerBorder,
                        borderRadius: 999,
                        borderWidth: 1,
                        height: 36,
                        justifyContent: "center",
                        position: "absolute",
                        right: 12,
                        top: 12,
                        width: 36,
                        zIndex: 1,
                      }}
                    >
                      <Feather name="trash-2" size={17} color={colors.danger} />
                    </Pressable>
                  ) : null}
                  <View style={{ gap: 5, paddingRight: ownsItem ? 44 : 0 }}>
                    <Text selectable style={{ color: colors.ink, fontSize: 17, fontWeight: "900" }}>
                      {userById.get(item.userId) ?? "Someone"}
                    </Text>
                    <Body muted>
                      {formatDay(item.createdAt)}
                      {item.type === "check_in" ? ` · Mood ${item.mood} (${moodLabel(item.mood)})` : ""}
                    </Body>
                  </View>
                  {item.type === "check_in" ? <Body muted>{item.readToday ? "Read/reflected today" : "Not yet today"}</Body> : null}
                  <Body>{item.body || "No words today, just presence."}</Body>
                  <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    <PillButton
                      variant={prayed ? "secondary" : "primary"}
                      onPress={() => {
                        if (prayed) {
                          dispatch({ type: "unpray", targetType, targetId: item.id });
                          return;
                        }
                        setPrayerTarget({ targetType, targetId: item.id, body: item.body });
                      }}
                    >
                      {prayed ? "Prayed" : "Pray"}
                    </PillButton>
                    <Text selectable style={{ color: colors.muted, fontSize: 14, fontWeight: "800" }}>
                      {prayerCountLabel}
                    </Text>
                  </View>
                  {replies.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {replies.map((reply) => (
                        <View key={reply.id} style={{ borderLeftColor: colors.moss, borderLeftWidth: 3, paddingLeft: 10 }}>
                          <Body>
                            {userById.get(reply.userId) ?? "Someone"}: {reply.body}
                          </Body>
                          {reply.userId === state.currentUserId ? (
                            <Pressable
                              onPress={() => {
                                Alert.alert("Delete reply?", "This comment will be removed from the group feed.", [
                                  { text: "Cancel", style: "cancel" },
                                  { text: "Delete", style: "destructive", onPress: () => dispatch({ type: "deleteReply", id: reply.id }) },
                                ]);
                              }}
                              style={{ alignSelf: "flex-start", paddingVertical: 6 }}
                            >
                              <Text style={{ color: colors.clay, fontWeight: "900" }}>Delete</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Field
                    value={replyDrafts[draftKey] ?? ""}
                    onChangeText={(value) => setReplyDrafts((drafts) => ({ ...drafts, [draftKey]: value.slice(0, 500) }))}
                    placeholder="Short supportive reply"
                  />
                  <PillButton
                    variant="ghost"
                    disabled={!replyDrafts[draftKey]?.trim()}
                    onPress={() => {
                      dispatch({ type: "createReply", targetType, targetId: item.id, body: replyDrafts[draftKey] ?? "" });
                      setReplyDrafts((drafts) => ({ ...drafts, [draftKey]: "" }));
                    }}
                  >
                    Reply
                  </PillButton>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>

      <PrayerMoment
        target={prayerTarget}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt) => {
          if (prayerTarget) {
            dispatch({ type: "finishPrayer", targetType: prayerTarget.targetType, targetId: prayerTarget.targetId, status, startedAt });
          }
          setPrayerTarget(undefined);
        }}
      />
    </Screen>
  );
}

const BREATH_PHASE_MS = 3800;

function PrayerMoment({
  target,
  onClose,
  onFinish,
}: {
  target?: { targetType: "post" | "check_in"; targetId: string; body: string };
  onClose: () => void;
  onFinish: (status: "completed" | "skipped", startedAt: string) => void;
}) {
  const breathAnimation = useRef(new Animated.Value(0)).current;
  const completeProgressAnimation = useRef(new Animated.Value(0)).current;
  const [startedAt, setStartedAt] = useState(new Date().toISOString());
  const [canCompletePrayer, setCanCompletePrayer] = useState(false);

  const breathScale = breathAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1.08],
  });
  const haloScale = breathAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.28],
  });
  const haloOpacity = breathAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.34, 0.16, 0.3],
  });
  const coreOpacity = breathAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.66, 0.95],
  });
  const completeProgressWidth = completeProgressAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  useEffect(() => {
    if (!target) {
      setCanCompletePrayer(false);
      completeProgressAnimation.setValue(0);
      return;
    }

    setStartedAt(new Date().toISOString());
    setCanCompletePrayer(false);
    breathAnimation.setValue(0);
    completeProgressAnimation.setValue(0);

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnimation, {
          toValue: 1,
          duration: BREATH_PHASE_MS,
          easing: Easing.bezier(0.37, 0, 0.63, 1),
          useNativeDriver: true,
        }),
        Animated.timing(breathAnimation, {
          toValue: 0,
          duration: BREATH_PHASE_MS,
          easing: Easing.bezier(0.37, 0, 0.63, 1),
          useNativeDriver: true,
        }),
      ]),
    );
    const completeProgress = Animated.timing(completeProgressAnimation, {
      toValue: 1,
      duration: PRAYER_COMPLETE_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    breathLoop.start();
    completeProgress.start(({ finished }) => {
      if (finished) {
        setCanCompletePrayer(true);
      }
    });

    return () => {
      breathLoop.stop();
      completeProgress.stop();
    };
  }, [breathAnimation, completeProgressAnimation, target]);

  return (
    <Modal visible={Boolean(target)} animationType="fade" presentationStyle="fullScreen">
      <View style={{ flex: 1, justifyContent: "center", gap: 26, backgroundColor: colors.cream, padding: 26 }}>
        <View style={{ alignItems: "center", gap: 16 }}>
          <View
            accessible
            accessibilityLabel="Prayer breathing guide. Pray now."
            accessibilityRole="image"
            style={{ alignItems: "center", height: 280, justifyContent: "center", width: "100%" }}
          >
            <Animated.View
              style={{
                backgroundColor: "rgba(168,216,216,0.16)",
                borderColor: "rgba(168,216,216,0.24)",
                borderRadius: 999,
                borderWidth: 1,
                height: 238,
                opacity: haloOpacity,
                position: "absolute",
                transform: [{ scale: haloScale }],
                width: 238,
              }}
            />
            <Animated.View
              style={{
                alignItems: "center",
                backgroundColor: "rgba(232,166,128,0.16)",
                borderColor: "rgba(245,243,240,0.2)",
                borderRadius: 999,
                borderWidth: 1,
                height: 210,
                justifyContent: "center",
                opacity: coreOpacity,
                transform: [{ scale: breathScale }],
                width: 210,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                alignItems: "center",
                gap: 8,
                justifyContent: "center",
                position: "absolute",
              }}
            >
              <Text
                selectable
                style={{
                  color: colors.gold,
                  fontSize: 28,
                  fontWeight: "900",
                  textAlign: "center",
                }}
              >
                Pray Now
              </Text>
            </View>
          </View>
        </View>
        <View
          style={{
            backgroundColor: "rgba(245,243,240,0.05)",
            borderColor: colors.line,
            borderCurve: "continuous",
            borderRadius: 24,
            borderWidth: 1,
            gap: 12,
            padding: 18,
          }}
        >
          <Text selectable style={{ color: colors.ink, fontSize: 34, fontWeight: "900", textAlign: "center" }}>
            Prayer moment
          </Text>
          <Text selectable style={{ color: colors.muted, fontSize: 18, lineHeight: 27, textAlign: "center" }}>
            Take a quiet breath. Hold this person before God, without hurry.
          </Text>
        </View>
        <View style={{ gap: 12 }}>
          <Pressable
            accessibilityState={{ disabled: !canCompletePrayer }}
            disabled={!canCompletePrayer}
            onPress={() => onFinish("completed", startedAt)}
            style={{
              alignItems: "center",
              backgroundColor: canCompletePrayer ? colors.olive : colors.disabled,
              borderRadius: 999,
              overflow: "hidden",
              padding: 16,
              position: "relative",
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={{
                backgroundColor: colors.olive,
                bottom: 0,
                left: 0,
                opacity: canCompletePrayer ? 1 : 0.72,
                position: "absolute",
                top: 0,
                width: completeProgressWidth,
              }}
            />
            <Text style={{ color: canCompletePrayer ? colors.onAccent : colors.ink, fontSize: 16, fontWeight: "900", zIndex: 1 }}>
              Complete prayer
            </Text>
          </Pressable>
          <Pressable onPress={() => onFinish("skipped", startedAt)} style={{ alignItems: "center", padding: 16 }}>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "800" }}>Skip for now</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: "center", padding: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
