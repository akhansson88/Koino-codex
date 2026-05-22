import { useEffect, useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import type { BibleVerse, EntryKind, JournalEntry } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  Card,
  CurrentRoomHeader,
  ExpandableBodyText,
  HeartPromptCard,
  IconButton,
  PrimaryButton,
  RoomImage,
  SecondaryButton,
  SectionHeading,
  TextInputField,
  VerseList,
} from "@/ui/app-components";
import { BibleVerseField, normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { confirmAction } from "@/ui/confirm";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { colors } from "@/ui/theme";

type JournalStage = "feed" | "type" | "write";

const MAX_BODY_LENGTH = 500;
const JOURNAL_BODY_PREVIEW_LINES = 3;

const entryTypes: { kind: EntryKind; title: string; description: string; icon: "book-open" | "heart" | "star" | "send" }[] = [
  { kind: "reflection", title: "Reflection", description: "Write your thoughts and reflect on your day", icon: "book-open" },
  { kind: "prayer_request", title: "Prayer request", description: "Ask for prayer from your group", icon: "heart" },
  { kind: "praise", title: "Praise", description: "Share what God has done", icon: "star" },
  { kind: "update", title: "Update", description: "Share an update with your group", icon: "send" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function entryTitle(kind?: EntryKind) {
  return entryTypes.find((item) => item.kind === kind)?.title ?? "Reflection";
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function JournalScreen() {
  const { state, dispatch } = useKoino();
  const params = useLocalSearchParams<{ newEntry?: string }>();
  const [stage, setStage] = useState<JournalStage>("feed");
  const [entryKind, setEntryKind] = useState<EntryKind>("reflection");
  const [body, setBody] = useState("");
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | undefined>();
  const [shareWithRoom, setShareWithRoom] = useState(true);
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const entries = useMemo(() => {
    const privateEntries = state.journalEntries
      .filter((entry) => entry.userId === state.currentUserId)
      .map((entry) => ({ ...entry, displaySource: entry.source === "private_check_in" ? "Check-in" : "Journal" }));
    const sharedCheckIns = state.checkIns
      .filter((checkIn) => checkIn.userId === state.currentUserId && checkIn.groupId === state.currentGroupId)
      .map((checkIn) => ({
        id: checkIn.id,
        userId: checkIn.userId,
        body: checkIn.reflectionText || "Shared check-in",
        source: "manual" as const,
        entryKind: "reflection" as EntryKind,
        mood: checkIn.mood,
        verse: checkIn.verse,
        verses: checkIn.verses,
        createdAt: checkIn.createdAt,
        updatedAt: checkIn.createdAt,
        displaySource: "Shared check-in",
        isSharedCheckIn: true,
      }));
    return [...privateEntries, ...sharedCheckIns].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [state.checkIns, state.currentGroupId, state.currentUserId, state.journalEntries]);

  function beginEntry(kind?: EntryKind) {
    setEntryKind(kind ?? "reflection");
    setBody("");
    setVerses([]);
    setEditingEntry(undefined);
    setShareWithRoom(true);
    setStage(kind ? "write" : "type");
  }

  function editEntry(entry: JournalEntry) {
    setEditingEntry(entry);
    setEntryKind(entry.entryKind ?? "reflection");
    setBody(entry.body);
    setVerses(normalizeBibleVerses(entry.verse, entry.verses));
    setShareWithRoom(Boolean(entry.sharedPostId));
    setStage("write");
  }

  async function submitEntry() {
    if (!body.trim()) return;
    if (editingEntry) {
      await dispatch({ type: "updateJournalEntry", id: editingEntry.id, body, entryKind, verse: primaryBibleVerse(verses), verses, sharedPostId: editingEntry.sharedPostId });
    } else {
      await dispatch({ type: "createJournalEntry", body, entryKind, verse: primaryBibleVerse(verses), verses, shareWithGroup: shareWithRoom, title: entryTitle(entryKind) });
    }
    setStage("feed");
    setBody("");
    setVerses([]);
    setEditingEntry(undefined);
  }

  useEffect(() => {
    if (!params.newEntry) return;
    beginEntry();
  }, [params.newEntry]);

  return (
    <AppScreen topInset={false}>
      {stage === "feed" ? (
        <>
          <CurrentRoomHeader />

          <HeartPromptCard
            image={user?.image}
            name={user?.name ?? state.authEmail ?? "K"}
            onPress={() => beginEntry()}
            onCreate={() => beginEntry()}
          />
          <View style={{ gap: 12 }}>
            {state.authError ? (
              <Card>
                <BodyText muted>{state.authError}</BodyText>
              </Card>
            ) : null}
            {entries.length === 0 ? (
              <Card>
                <BodyText muted>No journal entries yet. Start with one honest sentence.</BodyText>
              </Card>
            ) : (
              entries.map((entry) => (
                <Card key={`${entry.id}-${entry.createdAt}`}>
                  <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
                    <Avatar image={user?.image} name={user?.name ?? "K"} size={38} tone="green" />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{user?.name ?? "You"}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatDate(entry.createdAt)}</Text>
                    </View>
                    <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
                      <Feather name={entry.displaySource === "Shared check-in" ? "check-circle" : "book-open"} size={13} color={colors.gold} />
                      <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>{entry.displaySource}</Text>
                    </View>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => router.push(`/journal/${entry.id}` as never)} style={{ gap: 8 }}>
                    <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>
                      {entryTitle(entry.entryKind)}
                    </Text>
                    <ExpandableBodyText collapsedLines={JOURNAL_BODY_PREVIEW_LINES}>
                      {entry.body}
                    </ExpandableBodyText>
                    <VerseList verse={entry.verse} verses={entry.verses} compact />
                  </Pressable>
                  {"isSharedCheckIn" in entry ? null : (
                    <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                      <SecondaryButton icon="edit-2" onPress={() => editEntry(entry)} style={{ flex: 1 }}>
                        Edit
                      </SecondaryButton>
                      <SecondaryButton
                        icon="heart"
                        onPress={() => setPrayerTarget({ targetType: "journal_entry", targetId: entry.id, body: entry.body })}
                        style={{ flex: 1 }}
                      >
                        Pray
                      </SecondaryButton>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          confirmAction({
                            title: "Delete entry?",
                            message: "This journal entry will be removed.",
                            confirmText: "Delete",
                            destructive: true,
                            onConfirm: () => dispatch({ type: "deleteJournalEntry", id: entry.id }),
                          })
                        }
                        style={{ padding: 8 }}
                      >
                        <Feather name="trash-2" size={19} color={colors.danger} />
                      </Pressable>
                    </View>
                  )}
                </Card>
              ))
            )}
          </View>
        </>
      ) : null}

      {stage === "type" ? (
        <>
          <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => setStage("feed")} />
          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900", lineHeight: 29 }}>What kind of entry would you like to create?</Text>
          </View>
          <View style={{ gap: 10 }}>
            {entryTypes.map((type) => (
              <Pressable
                accessibilityRole="button"
                key={type.kind}
                onPress={() => {
                  setEntryKind(type.kind);
                  setStage("write");
                }}
              >
                <Card style={{ alignItems: "center", flexDirection: "row", gap: 14, padding: 14 }}>
                  <Feather name={type.icon} size={22} color={colors.gold} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{type.title}</Text>
                    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>{type.description}</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {stage === "write" ? (
        <>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => setStage(editingEntry ? "feed" : "type")} />
            <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>Save</Text>
          </View>
          <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "900" }}>Write your entry</Text>
          <View style={{ gap: 8 }}>
            <TextInputField
              multiline
              maxLength={MAX_BODY_LENGTH}
              value={body}
              onChangeText={(value) => setBody(value.slice(0, MAX_BODY_LENGTH))}
              placeholder="Had a good meeting today. Feeling grateful for how God is opening doors..."
              style={{ minHeight: 170 }}
            />
            <Text style={{ alignSelf: "flex-end", color: colors.muted, fontSize: 11, fontWeight: "700" }}>{body.length}/{MAX_BODY_LENGTH}</Text>
          </View>
          <BibleVerseField verses={verses} onChange={setVerses} />
          <View style={{ gap: 8 }}>
            <SectionHeading>Share with</SectionHeading>
            <Pressable accessibilityRole="button" onPress={() => setShareWithRoom((current) => !current)}>
              <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
                <RoomImage image={shareWithRoom ? group?.image : undefined} name={shareWithRoom ? group?.name : "Private journal"} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{shareWithRoom ? group?.name ?? "Test Room" : "Private journal"}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{shareWithRoom ? "Shared with your room" : "Only you can see this"}</Text>
                </View>
                <Feather name="chevron-down" size={18} color={colors.muted} />
              </Card>
            </Pressable>
          </View>
          <PrimaryButton disabled={!body.trim()} icon="send" onPress={submitEntry}>
            {editingEntry ? "Save changes" : "Post entry"}
          </PrimaryButton>
        </>
      ) : null}

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
    </AppScreen>
  );
}
