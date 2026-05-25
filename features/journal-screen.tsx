import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { EntryVisibility, actionLabels, entryKindLabel, visibility } from "@/state/product";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, EntryKind, JournalEntry } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  Card,
  ExpandableBodyText,
  HeartPromptCard,
  SecondaryButton,
  SectionHeading,
  VerseList,
} from "@/ui/app-components";
import { normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { confirmAction } from "@/ui/confirm";
import { LinkPreview } from "@/ui/link-preview";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { SharedComposer } from "@/ui/shared-composer";
import { colors } from "@/ui/theme";

const JOURNAL_BODY_PREVIEW_LINES = 3;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

type DisplayEntry = JournalEntry & { displaySource: string; isSharedCheckIn?: boolean };

export function JournalScreen() {
  const { state, dispatch } = useKoino();
  const params = useLocalSearchParams<{ newEntry?: string }>();
  const [composerVisible, setComposerVisible] = useState(false);
  const [entryKind, setEntryKind] = useState<EntryKind>("reflection");
  const [entryVisibility, setEntryVisibility] = useState<EntryVisibility>(visibility.private);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | undefined>();
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const entries = useMemo<DisplayEntry[]>(() => {
    const privateEntries: DisplayEntry[] = state.journalEntries
      .filter((entry) => entry.userId === state.currentUserId)
      .map((entry) => ({ ...entry, displaySource: entry.source === "private_check_in" ? "Check-in" : "Journal" }));
    const sharedCheckIns: DisplayEntry[] = state.checkIns
      .filter((checkIn) => checkIn.userId === state.currentUserId && checkIn.groupId === state.currentGroupId)
      .map((checkIn) => ({
        id: checkIn.id,
        userId: checkIn.userId,
        body: checkIn.reflectionText || "Shared check-in",
        source: "manual",
        entryKind: "reflection",
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

  function beginEntry(kind: EntryKind = "reflection", share: EntryVisibility = visibility.private) {
    setEntryKind(kind);
    setEntryVisibility(share);
    setTitle("");
    setBody("");
    setVerses([]);
    setEditingEntry(undefined);
    setComposerVisible(true);
  }

  function editEntry(entry: JournalEntry) {
    setEditingEntry(entry);
    setEntryKind(entry.entryKind ?? "reflection");
    setEntryVisibility(entry.sharedPostId ? visibility.room : visibility.private);
    setTitle(entry.title ?? "");
    setBody(entry.body);
    setVerses(normalizeBibleVerses(entry.verse, entry.verses));
    setComposerVisible(true);
  }

  async function submitEntry() {
    if (!body.trim()) return;
    if (editingEntry) {
      await dispatch({
        type: "updateJournalEntry",
        id: editingEntry.id,
        body,
        entryKind,
        title,
        verse: primaryBibleVerse(verses),
        verses,
        sharedPostId: entryVisibility === visibility.room ? editingEntry.sharedPostId : undefined,
      });
    } else {
      await dispatch({
        type: "createJournalEntry",
        body,
        entryKind,
        title,
        verse: primaryBibleVerse(verses),
        verses,
        shareWithGroup: entryVisibility === visibility.room,
      });
    }
    setComposerVisible(false);
    setBody("");
    setVerses([]);
    setTitle("");
    setEditingEntry(undefined);
  }

  useEffect(() => {
    if (!params.newEntry) return;
    beginEntry("reflection", visibility.private);
  }, [params.newEntry]);

  return (
    <AppScreen topInset={false}>
      <HeartPromptCard
        image={user?.image}
        name={user?.name ?? state.authEmail ?? "K"}
        subtitle="Take a moment to check in..."
        onPress={() => beginEntry("reflection", visibility.private)}
        onCreate={() => beginEntry("reflection", visibility.private)}
      />

      <View style={{ gap: 10 }}>
        <SectionHeading>Quick actions</SectionHeading>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <JournalAction icon="edit-3" label="Write reflection" onPress={() => beginEntry("reflection", visibility.private)} />
          <JournalAction icon="heart" label="Add prayer" onPress={() => beginEntry("prayer_request", visibility.private)} />
          <JournalAction icon="check-circle" label="Answered prayer" onPress={() => beginEntry("praise", visibility.private)} />
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <SectionHeading>Recent journal entries</SectionHeading>
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
                <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>{entry.displaySource}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push(`/journal/${entry.id}` as never)} style={{ gap: 8 }}>
                <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>
                  {entry.title || entryKindLabel(entry.entryKind)}
                </Text>
                <ExpandableBodyText collapsedLines={JOURNAL_BODY_PREVIEW_LINES}>{entry.body}</ExpandableBodyText>
                <VerseList verse={entry.verse} verses={entry.verses} compact />
              </Pressable>
              <LinkPreview text={entry.body} />
              {entry.isSharedCheckIn ? null : (
                <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                  <SecondaryButton icon="edit-2" onPress={() => editEntry(entry)} style={{ flex: 1 }}>
                    Edit
                  </SecondaryButton>
                  <SecondaryButton
                    icon="heart"
                    onPress={() => setPrayerTarget({ targetType: "journal_entry", targetId: entry.id, body: entry.body })}
                    style={{ flex: 1 }}
                  >
                    {actionLabels[entry.entryKind ?? "reflection"]}
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

      <SharedComposer
        visible={composerVisible}
        context="journal"
        kind={entryKind}
        entryVisibility={entryVisibility}
        title={title}
        body={body}
        verses={verses}
        editing={Boolean(editingEntry)}
        onKind={setEntryKind}
        onVisibility={setEntryVisibility}
        onTitle={setTitle}
        onBody={setBody}
        onVerses={setVerses}
        onClose={() => setComposerVisible(false)}
        onSubmit={submitEntry}
        roomName={group?.name}
        roomImage={group?.image}
      />

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

function JournalAction({ icon, label, onPress }: { icon: ComponentProps<typeof Feather>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexBasis: "31%", flexGrow: 1 }}>
      <Card style={{ alignItems: "center", gap: 8, minHeight: 76, padding: 12 }}>
        <Feather name={icon} size={18} color={colors.olive} />
        <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "900", textAlign: "center" }}>{label}</Text>
      </Card>
    </Pressable>
  );
}
