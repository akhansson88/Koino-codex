import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Modal, Pressable, Text, View } from "react-native";

import { BiblePlanCard } from "@/features/bible-plan-card";
import { BiblePlanReflectionEditor } from "@/features/bible-plan-reflection-editor";
import { biblePlanDayLabel, localDayKey, sortedBiblePlanReadings, todayBiblePlanReading } from "@/features/bible-plan-utils";
import {
  EntryVisibility,
  heartMoodLabel,
  heartMoods,
  journalEntryTypeFor,
  journalEntryTypeLabel,
  visibility,
} from "@/state/product";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, EntryKind, HeartMood, JournalEntry, JournalEntryType, ProfileImage } from "@/state/types";
import {
  AppScreen,
  Avatar,
  BodyText,
  Card,
  ExpandableBodyText,
  HeartPromptCard,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  SectionHeading,
  TextInputField,
  VerseList,
} from "@/ui/app-components";
import { BibleVerseField, normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { confirmAction } from "@/ui/confirm";
import { LinkPreview } from "@/ui/link-preview";
import { SharedComposer } from "@/ui/shared-composer";
import { colors } from "@/ui/theme";

const JOURNAL_BODY_PREVIEW_LINES = 3;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function formatPrayerDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} h and ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

function moodNumber(mood: HeartMood) {
  if (mood === "grateful") return 5;
  if (mood === "peaceful" || mood === "hopeful") return 4;
  if (mood === "heavy" || mood === "anxious" || mood === "tired") return 2;
  return 3;
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

type DisplayEntry = JournalEntry & { displaySource: string; isSharedCheckIn?: boolean };

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
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [checkInMood, setCheckInMood] = useState<HeartMood>("peaceful");
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInVerses, setCheckInVerses] = useState<BibleVerse[]>([]);
  const [planReflectionVisible, setPlanReflectionVisible] = useState(false);
  const [planReflectionText, setPlanReflectionText] = useState("");

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
    const privateEntries: DisplayEntry[] = state.journalEntries
      .filter((entry) => entry.userId === state.currentUserId)
      .map((entry) => ({ ...entry, displaySource: journalEntryTypeLabel(entry) }));
    const sharedCheckIns: DisplayEntry[] = state.checkIns
      .filter((checkIn) => checkIn.userId === state.currentUserId && checkIn.groupId === state.currentGroupId)
      .map((checkIn) => ({
        id: checkIn.id,
        userId: checkIn.userId,
        body: checkIn.reflectionText || "Shared check-in",
        source: "manual",
        journalType: "heart_checkin",
        entryKind: "reflection",
        mood: checkIn.mood,
        verse: checkIn.verse,
        verses: checkIn.verses,
        createdAt: checkIn.createdAt,
        updatedAt: checkIn.createdAt,
        displaySource: "Heart check-in",
        isSharedCheckIn: true,
      }));
    return [...privateEntries, ...sharedCheckIns].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [state.checkIns, state.currentGroupId, state.currentUserId, state.journalEntries]);

  const prayerNotifications = useMemo(() => {
    return state.prayerNotifications
      .map((notification) => {
        const prayEr = state.users.find((u) => u.id === notification.userId);
        return { notification, prayErName: prayEr?.name ?? "Someone", prayErImage: prayEr?.image };
      })
      .sort((a, b) => Date.parse(b.notification.createdAt) - Date.parse(a.notification.createdAt));
  }, [state.prayerNotifications, state.users]);

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

  async function submitCheckIn() {
    const selected = heartMoods.find((mood) => mood.value === checkInMood) ?? heartMoods[0];
    await dispatch({
      type: "submitCheckIn",
      mood: moodNumber(checkInMood),
      heartMood: checkInMood,
      readToday: true,
      reflectionText: checkInNote.trim() || selected.description,
      visibility: "private",
      verse: primaryBibleVerse(checkInVerses),
      verses: checkInVerses,
    });
    setCheckInVisible(false);
    setCheckInMood("peaceful");
    setCheckInNote("");
    setCheckInVerses([]);
  }

  function openPlanReflection() {
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
    if (!params.newEntry) return;
    beginEntry("reflection", visibility.private);
  }, [params.newEntry]);

  return (
    <AppScreen topInset={false}>
      <HeartPromptCard
        image={user?.image}
        name={user?.name ?? state.authEmail ?? "K"}
        subtitle="Take a quiet moment with God."
        onPress={() => setCheckInVisible(true)}
      />

      {state.privateBiblePlan && privatePlanReading ? (
        <BiblePlanCard
          completed={privatePlanCompleted}
          dayLabel={biblePlanDayLabel(privatePlanReading, privatePlanReadings.length)}
          onMarkRead={() =>
            dispatch({
              type: "markPrivateBiblePlanRead",
              planId: state.privateBiblePlan?.id ?? "",
              readingId: privatePlanReading.id,
              dateKey: todayKey,
            })
          }
          onReflect={openPlanReflection}
          passageReference={privatePlanReading.passage.reference}
          planTitle={state.privateBiblePlan.title}
          progressLabel={privatePlanCompleted ? "Read today" : "Not read yet"}
          reflectLabel={savedPlanReflection ? "Edit reflection" : "Reflect"}
          rhythmLabel="Private Scripture rhythm"
        />
      ) : state.privateBiblePlan ? (
        <Card>
          <BodyText muted>No Bible Plan reading scheduled for today.</BodyText>
        </Card>
      ) : null}

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

      <Card>
        <SectionHeading>Internal test</SectionHeading>
        <BodyText muted>{state.privateBiblePlan ? `Active private plan: ${state.privateBiblePlan.title}` : "No active private Bible plan."}</BodyText>
        <SecondaryButton icon="book-open" onPress={() => dispatch({ type: "createSamplePrivateBiblePlan" })}>
          Create sample private plan
        </SecondaryButton>
      </Card>

      <View style={{ gap: 10 }}>
        <SectionHeading>Quick actions</SectionHeading>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <JournalAction icon="edit-3" label="Write reflection" onPress={() => beginEntry("reflection", visibility.private)} />
          <JournalAction icon="heart" label="Add prayer" onPress={() => beginEntry("prayer", visibility.private)} />
          <JournalAction icon="check-circle" label="Answered prayer" onPress={() => beginEntry("answered_prayer", visibility.private)} />
          <JournalAction icon="book-open" label="Add Scripture" onPress={() => beginEntry("scripture_note", visibility.private)} />
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <SectionHeading>Recent memory</SectionHeading>
        {state.authError ? (
          <Card>
            <BodyText muted>{state.authError}</BodyText>
          </Card>
        ) : null}
        {prayerNotifications.map(({ notification, prayErName, prayErImage }) => (
          <PrayerNotificationCard
            key={`prayer-${notification.id}`}
            prayErName={prayErName}
            prayErImage={prayErImage}
            durationSeconds={notification.durationSeconds}
            createdAt={notification.createdAt}
          />
        ))}
        {entries.length === 0 && prayerNotifications.length === 0 ? (
          <Card>
            <BodyText muted>No journal entries yet. Start with one honest sentence.</BodyText>
          </Card>
        ) : (
          entries.map((entry) => (
            <JournalEntryCard
              key={`${entry.id}-${entry.createdAt}`}
              entry={entry}
              userName={user?.name ?? "You"}
              userImage={user?.image}
              onOpen={() => router.push(`/me/${entry.id}` as never)}
              onEdit={() => editEntry(entry)}
              onAddToJournal={(verse) => beginEntry("scripture_note", visibility.private, verse)}
              onShareToRoom={(verse) => beginEntry("scripture_note", visibility.room, verse, "A Scripture for today.")}
              onDelete={() =>
                confirmAction({
                  title: "Delete entry?",
                  message: "This journal entry will be removed.",
                  confirmText: "Delete",
                  destructive: true,
                  onConfirm: () => dispatch({ type: "deleteJournalEntry", id: entry.id }),
                })
              }
            />
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

      <HeartCheckInSheet
        visible={checkInVisible}
        mood={checkInMood}
        note={checkInNote}
        verses={checkInVerses}
        onMood={setCheckInMood}
        onNote={setCheckInNote}
        onVerses={setCheckInVerses}
        onClose={() => setCheckInVisible(false)}
        onSubmit={submitCheckIn}
      />
    </AppScreen>
  );
}

function JournalAction({ icon, label, onPress }: { icon: ComponentProps<typeof Feather>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexBasis: "46%", flexGrow: 1 }}>
      <Card style={{ alignItems: "center", gap: 8, minHeight: 82, padding: 12 }}>
        <Feather name={icon} size={19} color={colors.olive} />
        <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "900", textAlign: "center" }}>{label}</Text>
      </Card>
    </Pressable>
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
  userImage?: JournalEntry["verse"] extends never ? never : Parameters<typeof Avatar>[0]["image"];
  userName: string;
}) {
  const type = journalEntryTypeFor(entry);
  const typeLabel = journalEntryTypeLabel(entry);
  const mood = heartMoodLabel(entry.heartMood);

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
        <Avatar image={userImage} name={userName} size={38} tone={type === "answered_prayer" ? "orange" : "green"} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{userName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatDate(entry.createdAt)}</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
          <Feather name={type === "heart_checkin" ? "sun" : type === "scripture_note" ? "book-open" : type === "answered_prayer" ? "check-circle" : type === "prayer" ? "heart" : "edit-3"} size={13} color={colors.gold} />
          <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>{typeLabel}</Text>
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
      {entry.isSharedCheckIn ? null : (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <SecondaryButton icon="edit-2" onPress={onEdit} style={{ flex: 1 }}>
            Edit
          </SecondaryButton>
          <Pressable accessibilityRole="button" onPress={onDelete} style={{ padding: 8 }}>
            <Feather name="trash-2" size={19} color={colors.danger} />
          </Pressable>
        </View>
      )}
    </Card>
  );
}

function PrayerNotificationCard({
  prayErName,
  prayErImage,
  durationSeconds,
  createdAt,
}: {
  prayErName: string;
  prayErImage?: ProfileImage;
  durationSeconds: number;
  createdAt: string;
}) {
  const duration = formatPrayerDuration(durationSeconds);
  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Avatar image={prayErImage} name={prayErName} size={38} tone="pink" />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{prayErName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatDate(createdAt)}</Text>
        </View>
        <Feather name="heart" size={13} color={colors.gold} />
      </View>
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>
        {prayErName} prayed for you{duration ? ` for ${duration}` : ""}
      </Text>
    </Card>
  );
}

function HeartCheckInSheet({
  mood,
  note,
  onClose,
  onMood,
  onNote,
  onSubmit,
  onVerses,
  verses,
  visible,
}: {
  mood: HeartMood;
  note: string;
  onClose: () => void;
  onMood: (value: HeartMood) => void;
  onNote: (value: string) => void;
  onSubmit: () => void;
  onVerses: (verses: BibleVerse[]) => void;
  verses: BibleVerse[];
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel="Close check-in" icon="arrow-left" onPress={onClose} />
          <Text style={{ color: colors.olive, fontSize: 13, fontWeight: "900" }}>Save</Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900" }}>How is your heart today?</Text>
          <BodyText muted>Take a moment to be honest with God and with yourself.</BodyText>
        </View>
        <View style={{ gap: 10 }}>
          {heartMoods.map((option) => {
            const selected = option.value === mood;
            return (
              <Pressable accessibilityRole="button" key={option.value} onPress={() => onMood(option.value)}>
                <Card style={{ alignItems: "center", borderColor: selected ? colors.gold : colors.line, flexDirection: "row", gap: 12, padding: 14 }}>
                  <Feather name={option.icon} size={21} color={selected ? colors.gold : colors.olive} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{option.label}</Text>
                    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{option.description}</Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
        <View style={{ gap: 8 }}>
          <SectionHeading>What is on your heart?</SectionHeading>
          <TextInputField
            multiline
            value={note}
            onChangeText={onNote}
            onSubmitEditing={onSubmit}
            placeholder="A short honest sentence..."
            returnKeyType="done"
            style={{ minHeight: 112 }}
            submitBehavior="submit"
          />
        </View>
        <BibleVerseField verses={verses} onChange={onVerses} />
        <PrimaryButton icon="check-circle" onPress={onSubmit}>
          Save check-in
        </PrimaryButton>
      </AppScreen>
    </Modal>
  );
}
