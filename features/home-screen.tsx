import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { FeedItem } from "@/state/types";
import { Body, Card, Choice, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { colors } from "@/ui/theme";

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

function moodLabel(mood: number) {
  return ["Heavy", "Tender", "Steady", "Hopeful", "Light"][mood - 1] ?? "Steady";
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
          <SectionTitle>Daily check-in</SectionTitle>
          <Body muted>A gentle entry point, not a productivity score.</Body>
          <Body>Have you read or reflected today?</Body>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Choice label="Yes" selected={readToday} onPress={() => setReadToday(true)} />
            <Choice label="Not yet" selected={!readToday} onPress={() => setReadToday(false)} />
          </View>
          <Body>Mood</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Choice key={value} label={`${value}`} selected={mood === value} onPress={() => setMood(value)} />
            ))}
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

        <Card tone="rose">
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
              const draftKey = `${targetType}:${item.id}`;
              return (
                <Card key={`${item.type}-${item.id}`}>
                  <View style={{ gap: 5 }}>
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
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <PillButton
                      variant={prayed ? "secondary" : "primary"}
                      onPress={() => setPrayerTarget({ targetType, targetId: item.id, body: item.body })}
                    >
                      {prayed ? "Prayed" : "Pray"}
                    </PillButton>
                  </View>
                  {replies.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {replies.map((reply) => (
                        <View key={reply.id} style={{ borderLeftColor: colors.moss, borderLeftWidth: 3, paddingLeft: 10 }}>
                          <Body>
                            {userById.get(reply.userId) ?? "Someone"}: {reply.body}
                          </Body>
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

function PrayerMoment({
  target,
  onClose,
  onFinish,
}: {
  target?: { targetType: "post" | "check_in"; targetId: string; body: string };
  onClose: () => void;
  onFinish: (status: "completed" | "skipped", startedAt: string) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(25);
  const [startedAt, setStartedAt] = useState(new Date().toISOString());

  useEffect(() => {
    if (!target) return;
    setSecondsLeft(25);
    setStartedAt(new Date().toISOString());
    const timer = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [target]);

  return (
    <Modal visible={Boolean(target)} animationType="fade" presentationStyle="fullScreen">
      <View style={{ flex: 1, justifyContent: "center", gap: 28, backgroundColor: "#263026", padding: 26 }}>
        <View
          style={{
            alignSelf: "center",
            backgroundColor: "rgba(255,250,242,0.12)",
            borderColor: "rgba(255,250,242,0.22)",
            borderRadius: 999,
            borderWidth: 1,
            height: 220 - secondsLeft * 2,
            maxHeight: 220,
            minHeight: 160,
            width: 220 - secondsLeft * 2,
            maxWidth: 220,
            minWidth: 160,
          }}
        />
        <View style={{ gap: 16 }}>
          <Text selectable style={{ color: colors.paper, fontSize: 34, fontWeight: "900", textAlign: "center" }}>
            Prayer moment
          </Text>
          <Text selectable style={{ color: "#E9E0D2", fontSize: 18, lineHeight: 27, textAlign: "center" }}>
            Take a quiet breath. Hold this person before God, without hurry.
          </Text>
          <Text selectable style={{ color: colors.gold, fontSize: 44, fontVariant: ["tabular-nums"], fontWeight: "900", textAlign: "center" }}>
            {secondsLeft}s
          </Text>
        </View>
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={() => onFinish("completed", startedAt)}
            style={{ alignItems: "center", backgroundColor: colors.paper, borderRadius: 999, padding: 16 }}
          >
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>Done</Text>
          </Pressable>
          <Pressable onPress={() => onFinish("skipped", startedAt)} style={{ alignItems: "center", padding: 16 }}>
            <Text style={{ color: "#E9E0D2", fontSize: 16, fontWeight: "800" }}>Skip for now</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: "center", padding: 8 }}>
            <Text style={{ color: "rgba(233,224,210,0.72)", fontSize: 14 }}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
