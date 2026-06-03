import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { BiblePlanReflectionEditor } from "@/features/bible-plan-reflection-editor";
import { biblePlanDayLabel, localDayKey, sortedBiblePlanReadings, todayBiblePlanReading } from "@/features/bible-plan-utils";
import { EntryVisibility, heartMoodLabel, journalEntryTypeFor, journalEntryTypeLabel, visibility } from "@/state/product";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, EntryKind, JournalEntry, JournalEntryType, ProfileImage } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  Card,
  ExpandableBodyText,
  FullScreenModal,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  SectionHeading,
  VerseList,
} from "@/ui/app-components";
import { normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { confirmAction } from "@/ui/confirm";
import { LinkPreview } from "@/ui/link-preview";
import { QuietActionCard, ScriptureRhythmCard } from "@/ui/rhythm-cards";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, radius } from "@/ui/theme";

const JOURNAL_BODY_PREVIEW_LINES = 3;
const fallbackPassage = "Philippians 2:1-11";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function composerKindForJournalType(type: JournalEntryType): EntryKind {
  if (type === "prayer") return "prayer_request";
  if (type === "answered_prayer") return "praise";
  if (type === "scripture_note") return "scripture";
  return "reflection";
}

function journalTypeForKind(kind: EntryKind): JournalEntryType {
  if (kind === "prayer_request") return "prayer";
  if (kind === "praise") return "answered_prayer";
  if (kind === "scripture") return "scripture_note";
  return "reflection";
}

function journalTypeAccent(type: JournalEntryType) {
  if (type === "prayer") return colors.semantic.prayer;
  if (type === "answered_prayer") return colors.semantic.success;
  if (type === "heart_checkin") return colors.semantic.community;
  return colors.semantic.reflection;
}

type DisplayEntry = JournalEntry & { displaySource: string };

export function JournalScreen() {
  const { state, dispatch } = useKoino();
  const params = useLocalSearchParams<{ newEntry?: string }>();
  const [composerVisible, setComposerVisible] = useState(false);
  const [entryKind, setEntryKind] = useState<EntryKind>("reflection");
  const [entryVisibility, setEntryVisibility] = useState<EntryVisibility>(visibility.private);
  const [journalType, setJournalType] = useState<JournalEntryType>("reflection");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | undefined>();
  const [historyVisible, setHistoryVisible] = useState(false);
  const [planReflectionVisible, setPlanReflectionVisible] = useState(false);
  const [planReflectionText, setPlanReflectionText] = useState("");
  const lastNewEntryParamRef = useRef<string | undefined>(undefined);

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const todayKey = localDayKey(new Date());
  const privatePlanReadings = useMemo(() => sortedBiblePlanReadings(state.privateBiblePlan), [state.privateBiblePlan]);
  const privatePlanReading = useMemo(() => todayBiblePlanReading(state.privateBiblePlan, todayKey), [state.privateBiblePlan, todayKey]);
  const privatePlanProgress = useMemo(
    () => (privatePlanReading ? state.privateBiblePlanProgress.find((item) => item.readingId === privatePlanReading.id) : undefined),
    [privatePlanReading, state.privateBiblePlanProgress],
  );
  const privatePlanLinkedEntry = useMemo(
    () =>
      state.privateBiblePlan && privatePlanReading
        ? state.journalEntries.find(
            (entry) =>
              entry.userId === state.currentUserId &&
              entry.source === "bible_plan" &&
              entry.biblePlanId === state.privateBiblePlan?.id &&
              entry.biblePlanReadingId === privatePlanReading.id,
          )
        : undefined,
    [privatePlanReading, state.currentUserId, state.journalEntries, state.privateBiblePlan],
  );
  const privatePlanCompleted = Boolean(privatePlanProgress?.read);
  const savedPlanReflection = privatePlanProgress?.reflectionText || privatePlanLinkedEntry?.body || "";
  const entries = useMemo<DisplayEntry[]>(() => {
    return state.journalEntries
      .filter((entry) => entry.userId === state.currentUserId)
      .map((entry) => ({ ...entry, displaySource: journalEntryTypeLabel(entry) }))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [state.currentUserId, state.journalEntries]);

  function beginEntry(type: JournalEntryType = "reflection", share: EntryVisibility = visibility.private, attachedVerse?: BibleVerse, initialBody = "") {
    const kind = composerKindForJournalType(type);
    setJournalType(type);
    setEntryKind(kind);
    setEntryVisibility(share);
    setTitle(attachedVerse ? attachedVerse.reference : "");
    setBody(initialBody);
    setVerses(attachedVerse ? [attachedVerse] : []);
    setEditingEntry(undefined);
    setComposerVisible(true);
  }

  function beginFallbackScriptureReflection() {
    setJournalType("scripture_note");
    setEntryKind("scripture");
    setEntryVisibility(visibility.private);
    setTitle(fallbackPassage);
    setBody("");
    setVerses([]);
    setEditingEntry(undefined);
    setComposerVisible(true);
  }

  function editEntry(entry: JournalEntry) {
    const type = journalEntryTypeFor(entry);
    setEditingEntry(entry);
    setJournalType(type);
    setEntryKind(entry.entryKind ?? composerKindForJournalType(type));
    setEntryVisibility(entry.sharedPostId ? visibility.room : visibility.private);
    setTitle(entry.title ?? "");
    setBody(entry.body);
    setVerses(normalizeBibleVerses(entry.verse, entry.verses));
    setComposerVisible(true);
  }

  async function submitEntry() {
    if (!body.trim()) return;
    const resolvedJournalType = editingEntry ? journalType : journalTypeForKind(entryKind);
    if (editingEntry) {
      await dispatch({
        type: "updateJournalEntry",
        id: editingEntry.id,
        body,
        entryKind,
        journalType: resolvedJournalType,
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
        journalType: resolvedJournalType,
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

  async function readPrivatePlan() {
    if (state.privateBiblePlan && privatePlanReading) {
      await dispatch({
        type: "markPrivateBiblePlanRead",
        planId: state.privateBiblePlan.id,
        readingId: privatePlanReading.id,
        dateKey: todayKey,
      });
    }
    router.push("/(tabs)/bible" as never);
  }

  function openPlanReflection() {
    if (!state.privateBiblePlan || !privatePlanReading) {
      beginFallbackScriptureReflection();
      return;
    }
    setPlanReflectionText(savedPlanReflection);
    setPlanReflectionVisible(true);
  }

  async function submitPlanReflection() {
    if (!state.privateBiblePlan || !privatePlanReading || !planReflectionText.trim()) return;
    await dispatch({
      type: "savePrivateBiblePlanReflection",
      planId: state.privateBiblePlan.id,
      readingId: privatePlanReading.id,
      reflectionText: planReflectionText,
      dateKey: todayKey,
    });
    setPlanReflectionVisible(false);
  }

  useEffect(() => {
    if (!params.newEntry || params.newEntry === lastNewEntryParamRef.current) return;
    lastNewEntryParamRef.current = params.newEntry;
    beginEntry("reflection", visibility.private);
  }, [params.newEntry]);

  return (
    <AppScreen topInset={false}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.ink, fontSize: 25, fontWeight: "900", lineHeight: 31 }}>Journal</Text>
        <BodyText muted>A space for reflection, growth and spiritual memory.</BodyText>
      </View>

      <ScriptureRhythmCard
        completed={privatePlanCompleted}
        onRead={readPrivatePlan}
        onReflect={openPlanReflection}
        passageReference={privatePlanReading?.passage.reference ?? fallbackPassage}
        progressLabel={privatePlanReading ? biblePlanDayLabel(privatePlanReading, privatePlanReadings.length) : "Day 1 of 3"}
        rhythmLabel="Private Scripture rhythm"
      />

      {planReflectionVisible && state.privateBiblePlan && privatePlanReading ? (
        <BiblePlanReflectionEditor
          onCancel={() => setPlanReflectionVisible(false)}
          onChangeText={setPlanReflectionText}
          onSave={submitPlanReflection}
          passageReference={privatePlanReading.passage.reference}
          placeholder="Write a private thought or prayer..."
          title="Private reflection"
          value={planReflectionText}
        />
      ) : null}

      <ReflectTodayCard onPress={() => beginEntry("reflection", visibility.private)} />

      <JourneySummaryCard count={entries.length} onPress={() => setHistoryVisible(true)} />

      {entries.length === 0 ? (
        <Card>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>Your first reflection can be simple.</Text>
          <BodyText muted>Write a few honest lines with God.</BodyText>
        </Card>
      ) : null}

      {state.authError ? (
        <Card>
          <BodyText muted>{state.authError}</BodyText>
        </Card>
      ) : null}

      <SharedComposer
        visible={composerVisible}
        context="journal"
        kind={entryKind}
        entryVisibility={entryVisibility}
        title={title}
        body={body}
        verses={verses}
        editing={Boolean(editingEntry)}
        onKind={(kind) => {
          setEntryKind(kind);
          if (!editingEntry) setJournalType(journalTypeForKind(kind));
        }}
        onVisibility={setEntryVisibility}
        onTitle={setTitle}
        onBody={setBody}
        onVerses={setVerses}
        onClose={() => setComposerVisible(false)}
        onSubmit={submitEntry}
        roomName={group?.name}
        roomImage={group?.image}
      />

      <JournalHistoryModal
        entries={entries}
        onAddToJournal={(verse) => beginEntry("scripture_note", visibility.private, verse)}
        onClose={() => setHistoryVisible(false)}
        onDelete={(entry) =>
          confirmAction({
            title: "Delete entry?",
            message: "This journal entry will be removed.",
            confirmText: "Delete",
            destructive: true,
            onConfirm: () => dispatch({ type: "deleteJournalEntry", id: entry.id }),
          })
        }
        onEdit={editEntry}
        onOpen={(entry) => router.push(`/me/${entry.id}` as never)}
        onShareToRoom={(verse) => beginEntry("scripture_note", visibility.room, verse, "A Scripture for today.")}
        userImage={user?.image}
        userName={user?.name ?? "You"}
        visible={historyVisible}
      />
    </AppScreen>
  );
}

function ReflectTodayCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={{ backgroundColor: colors.semantic.reflectionSoft, gap: 12, padding: 14 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>Reflect on today</Text>
            <BodyText muted>Go deeper in your journal</BodyText>
          </View>
          <Feather name="chevron-right" size={19} color={colors.muted} />
        </View>
        <ReflectionVisual />
      </Card>
    </Pressable>
  );
}

function JourneySummaryCard({ count, onPress }: { count: number; onPress: () => void }) {
  const label = `${count} ${count === 1 ? "entry" : "entries"}`;

  return (
    <QuietActionCard icon="book-open" onPress={onPress} subtitle="Spiritual memory" title="Your journey">
      <View style={{ backgroundColor: colors.line, height: 1 }} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Feather name="book-open" size={15} color={colors.muted} />
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{label}</Text>
      </View>
    </QuietActionCard>
  );
}

function ReflectionVisual() {
  return (
    <View
      style={{
        backgroundColor: colors.semantic.reflectionSoft,
        borderRadius: radius.md,
        height: 112,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          backgroundColor: colors.semantic.warmthSoft,
          borderRadius: 999,
          height: 30,
          position: "absolute",
          right: 28,
          top: 24,
          width: 30,
        }}
      />
      <View
        style={{
          backgroundColor: colors.brand.lavender,
          borderRadius: 999,
          bottom: -50,
          height: 120,
          left: -28,
          position: "absolute",
          width: 190,
        }}
      />
      <View
        style={{
          backgroundColor: colors.semantic.communitySoft,
          borderRadius: 999,
          bottom: -58,
          height: 118,
          position: "absolute",
          right: -24,
          width: 210,
        }}
      />
      <View
        style={{
          backgroundColor: colors.background.surface,
          bottom: 18,
          height: 22,
          left: 18,
          position: "absolute",
          right: 18,
          transform: [{ rotate: "-2deg" }],
        }}
      />
    </View>
  );
}

function JournalHistoryModal({
  entries,
  onAddToJournal,
  onClose,
  onDelete,
  onEdit,
  onOpen,
  onShareToRoom,
  userImage,
  userName,
  visible,
}: {
  entries: DisplayEntry[];
  onAddToJournal: (verse: BibleVerse) => void;
  onClose: () => void;
  onDelete: (entry: DisplayEntry) => void;
  onEdit: (entry: JournalEntry) => void;
  onOpen: (entry: DisplayEntry) => void;
  onShareToRoom: (verse: BibleVerse) => void;
  userImage?: ProfileImage;
  userName: string;
  visible: boolean;
}) {
  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={onClose} />
          <Text style={{ color: colors.semantic.reflection, fontSize: 13, fontWeight: "900" }}>Private journal</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontSize: 25, fontWeight: "900", lineHeight: 31 }}>Your journey</Text>
          <BodyText muted>Spiritual memory</BodyText>
        </View>
        {entries.length === 0 ? (
          <Card>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>Your first reflection can be simple.</Text>
            <BodyText muted>Write a few honest lines with God.</BodyText>
          </Card>
        ) : null}
        {entries.map((entry) => (
          <JournalEntryCard
            key={`${entry.id}-${entry.createdAt}`}
            entry={entry}
            userName={userName}
            userImage={userImage}
            onOpen={() => onOpen(entry)}
            onEdit={() => onEdit(entry)}
            onAddToJournal={onAddToJournal}
            onShareToRoom={onShareToRoom}
            onDelete={() => onDelete(entry)}
          />
        ))}
      </AppScreen>
    </FullScreenModal>
  );
}

function JournalEntryCard({
  entry,
  onDelete,
  onEdit,
  onAddToJournal,
  onOpen,
  onShareToRoom,
  userImage,
  userName,
}: {
  entry: DisplayEntry;
  onDelete: () => void;
  onEdit: () => void;
  onAddToJournal: (verse: BibleVerse) => void;
  onOpen: () => void;
  onShareToRoom: (verse: BibleVerse) => void;
  userImage?: ProfileImage;
  userName: string;
}) {
  const type = journalEntryTypeFor(entry);
  const typeLabel = journalEntryTypeLabel(entry);
  const mood = heartMoodLabel(entry.heartMood);
  const accent = journalTypeAccent(type);

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
        <Avatar image={userImage} name={userName} size={38} tone={type === "answered_prayer" ? "orange" : "green"} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{userName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatDate(entry.createdAt)}</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
          <Feather
            name={
              type === "heart_checkin"
                ? "sun"
                : type === "scripture_note"
                  ? "book-open"
                  : type === "answered_prayer"
                    ? "check-circle"
                    : type === "prayer"
                      ? "heart"
                      : "edit-3"
            }
            size={13}
            color={accent}
          />
          <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: "900" }}>{typeLabel}</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ gap: 8 }}>
        <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>
          {entry.title || (type === "heart_checkin" && mood ? mood : typeLabel)}
        </Text>
        <ExpandableBodyText collapsedLines={JOURNAL_BODY_PREVIEW_LINES}>{entry.body}</ExpandableBodyText>
        {mood ? <BodyText muted>{mood}</BodyText> : null}
        <VerseList verse={entry.verse} verses={entry.verses} compact onAddToJournal={onAddToJournal} onShareToRoom={onShareToRoom} />
      </Pressable>
      <LinkPreview text={entry.body} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <SecondaryButton icon="edit-2" onPress={onEdit} style={{ flex: 1 }}>
          Edit
        </SecondaryButton>
        <Pressable accessibilityRole="button" onPress={onDelete} style={{ padding: 8 }}>
          <Feather name="trash-2" size={19} color={colors.danger} />
        </Pressable>
      </View>
    </Card>
  );
}
