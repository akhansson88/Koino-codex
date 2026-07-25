import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { EntryVisibility, heartMoods, journalEntryTypeFor, journalEntryTypeLabel, moodOptionForValue, visibility } from "@/state/product";
import type { BibleVerse, EntryKind, JournalEntry, JournalEntryType } from "@/state/types";
import { AppScreen, Avatar, BodyText, Card, IconButton, RoomImage, SecondaryButton, SectionHeading, VerseList } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { communityHeartMoodCopy, communityMoodScaleLabel } from "@/ui/community-copy";
import { confirmAction } from "@/ui/confirm";
import { LinkPreview } from "@/ui/link-preview";
import { SharedComposer } from "@/ui/shared-composer";
import { colors } from "@/ui/theme";

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

type DetailEntry = JournalEntry & { displaySource: string; isSharedCheckIn?: boolean };

export function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routeId = routeParam(id);
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
  const [composerVisible, setComposerVisible] = useState(false);
  const [entryKind, setEntryKind] = useState<EntryKind>("reflection");
  const [entryVisibility, setEntryVisibility] = useState<EntryVisibility>(visibility.private);
  const [journalType, setJournalType] = useState<JournalEntryType>("reflection");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const entry = useMemo<DetailEntry | undefined>(() => {
    if (!routeId) return undefined;
    const privateEntry = state.journalEntries.find((item) => item.id === routeId && item.userId === state.currentUserId);
    if (privateEntry) return { ...privateEntry, displaySource: privateEntry.source === "private_check_in" ? "Check-in" : "Journal" };
    const sharedCheckIn = state.checkIns.find((item) => item.id === routeId && item.userId === state.currentUserId && item.groupId === state.currentGroupId);
    return sharedCheckIn
      ? {
          id: sharedCheckIn.id,
          userId: sharedCheckIn.userId,
          body: sharedCheckIn.reflectionText || "Shared check-in",
          source: "manual" as const,
          journalType: "heart_checkin" as const,
          entryKind: "reflection" as EntryKind,
          mood: sharedCheckIn.mood,
          heartMood: undefined,
          verse: sharedCheckIn.verse,
          verses: sharedCheckIn.verses,
          sharedPostId: undefined,
          isPrivate: false,
          createdAt: sharedCheckIn.createdAt,
          updatedAt: sharedCheckIn.createdAt,
          displaySource: "Shared check-in",
          isSharedCheckIn: true,
        }
      : undefined;
  }, [routeId, state.checkIns, state.currentGroupId, state.currentUserId, state.journalEntries]);

  if (!entry) {
    return (
      <AppScreen>
        <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => router.back()} />
        <Card>
          <BodyText muted>This journal entry is no longer available.</BodyText>
        </Card>
      </AppScreen>
    );
  }

  const currentEntry = entry;
  const type = journalEntryTypeFor(currentEntry);
  const typeLabel = type === "heart_checkin" ? t("community.contentType.checkIn") : journalEntryTypeLabel(currentEntry);
  const exactMood = currentEntry.heartMood ? heartMoods.find((item) => item.value === currentEntry.heartMood) : undefined;
  const numericMood = typeof currentEntry.mood === "number" ? moodOptionForValue(currentEntry.mood) : undefined;
  const mood = currentEntry.heartMood
    ? communityHeartMoodCopy(currentEntry.heartMood, t).label
    : typeof currentEntry.mood === "number"
      ? communityMoodScaleLabel(currentEntry.mood, t)
      : undefined;
  const checkInIcon = exactMood?.icon ?? numericMood?.icon ?? "circle";
  const isSharedCheckIn = Boolean(currentEntry.isSharedCheckIn);

  function openEditor() {
    setJournalType(type);
    setEntryKind(currentEntry.entryKind ?? (type === "prayer" ? "prayer_request" : type === "answered_prayer" ? "praise" : type === "scripture_note" ? "scripture" : "reflection"));
    setEntryVisibility(currentEntry.sharedPostId ? visibility.room : visibility.private);
    setTitle(currentEntry.title ?? "");
    setBody(currentEntry.body);
    setVerses(normalizeBibleVerses(currentEntry.verse, currentEntry.verses));
    setComposerVisible(true);
  }

  async function submitEdit() {
    if (!body.trim()) return;
    await dispatch({
      type: "updateJournalEntry",
      id: currentEntry.id,
      body,
      entryKind,
      journalType,
      title,
      verse: primaryBibleVerse(verses),
      verses,
      sharedPostId: entryVisibility === visibility.room ? currentEntry.sharedPostId : undefined,
    });
    setComposerVisible(false);
  }

  return (
    <AppScreen>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => router.back()} />
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Feather
            name={type === "heart_checkin" ? checkInIcon : type === "answered_prayer" ? "check-circle" : type === "prayer" ? "heart" : type === "scripture_note" ? "book-open" : "edit-3"}
            size={15}
            color={colors.gold}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>{typeLabel}</Text>
        </View>
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <Avatar image={user?.image} name={user?.name ?? "K"} size={48} tone="green" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{user?.name ?? "You"}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{formatDate(currentEntry.createdAt)}</Text>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 25, fontWeight: "900", lineHeight: 31 }}>{currentEntry.title || (mood ?? typeLabel)}</Text>
        {mood ? <BodyText muted>{mood}</BodyText> : null}
        <BodyText style={{ fontSize: 17, lineHeight: 25 }}>{currentEntry.body}</BodyText>
        <LinkPreview text={currentEntry.body} />
      </View>
      <VerseList verse={currentEntry.verse} verses={currentEntry.verses} />
      <View style={{ gap: 8 }}>
        <SectionHeading>Shared with</SectionHeading>
        <Card style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 12 }}>
          <RoomImage image={currentEntry.displaySource === "Shared check-in" ? group?.image : undefined} name={currentEntry.displaySource === "Shared check-in" ? group?.name : "Private journal"} size={34} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
              {currentEntry.displaySource === "Shared check-in" ? group?.name ?? "Community" : "Private journal"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
              {currentEntry.displaySource === "Shared check-in" ? "Shared with your community" : "Only you can see this"}
            </Text>
          </View>
        </Card>
      </View>
      {isSharedCheckIn ? null : (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <SecondaryButton icon="edit-2" onPress={openEditor} style={{ flex: 1 }}>
            Edit
          </SecondaryButton>
          <SecondaryButton
            icon="trash-2"
            tone="danger"
            onPress={() =>
              confirmAction({
                title: "Delete entry?",
                message: "This journal entry will be removed.",
                confirmText: "Delete",
                destructive: true,
                onConfirm: () => {
                  dispatch({ type: "deleteJournalEntry", id: currentEntry.id });
                  router.back();
                },
              })
            }
            style={{ flex: 1 }}
          >
            Delete
          </SecondaryButton>
        </View>
      )}
      <SharedComposer
        visible={composerVisible}
        context="journal"
        kind={entryKind}
        entryVisibility={entryVisibility}
        title={title}
        body={body}
        verses={verses}
        editing
        onKind={setEntryKind}
        onVisibility={setEntryVisibility}
        onTitle={setTitle}
        onBody={setBody}
        onVerses={setVerses}
        onClose={() => setComposerVisible(false)}
        onSubmit={submitEdit}
        roomName={group?.name}
        roomImage={group?.image}
      />
    </AppScreen>
  );
}
