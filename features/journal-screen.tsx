import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { EntryVisibility, heartMoods, journalEntryTypeFor, journalEntryTypeLabel, moodOptionForValue, visibility } from "@/state/product";
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
import { BrandWaveMotif } from "@/ui/brand-wave-motif";
import { normalizeBibleVerses, primaryBibleVerse } from "@/ui/bible-verse-picker";
import { useAppTranslation } from "@/ui/app-language";
import { communityHeartMoodCopy, communityMoodScaleLabel } from "@/ui/community-copy";
import { confirmAction } from "@/ui/confirm";
import { LinkPreview } from "@/ui/link-preview";
import type { AppLanguage, TranslationFunction, TranslationKey } from "@/ui/localization";
import { QuietActionCard } from "@/ui/rhythm-cards";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, typography } from "@/ui/theme";

const JOURNAL_BODY_PREVIEW_LINES = 3;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function formatRecentEntryDate(value: string, language: AppLanguage) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return new Intl.DateTimeFormat(language, { month: "short", day: "numeric" }).format(date);
}

function recentEntrySummary(entry: JournalEntry | undefined, language: AppLanguage, t: TranslationFunction) {
  if (!entry) return t("me.journey.empty");

  const typeLabelKey: Record<JournalEntryType, TranslationKey> = {
    reflection: "me.journey.lastReflection",
    prayer: "me.journey.lastPrayer",
    answered_prayer: "me.journey.lastAnsweredPrayer",
    heart_checkin: "me.journey.lastCheckIn",
    scripture_note: "me.journey.lastScriptureNote",
  };
  const context = t(typeLabelKey[journalEntryTypeFor(entry)]);
  const date = formatRecentEntryDate(entry.createdAt, language);

  return date ? `${context} · ${date}` : context;
}

function composerKindForJournalType(type: JournalEntryType): EntryKind {
  if (type === "prayer") return "prayer_request";
  if (type === "answered_prayer") return "praise";
  if (type === "scripture_note") return "scripture";
  return "reflection";
}

function journalTypeForKind(kind: EntryKind): JournalEntryType {
  if (kind === "prayer_request" || kind === "prayer_moment") return "prayer";
  if (kind === "praise") return "answered_prayer";
  if (kind === "scripture") return "scripture_note";
  return "reflection";
}

type DisplayEntry = JournalEntry & { displaySource: string };

export function JournalScreen() {
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
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
  const lastNewEntryParamRef = useRef<string | undefined>(undefined);

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const user = state.users.find((item) => item.id === state.currentUserId);
  const entries = useMemo<DisplayEntry[]>(() => {
    return state.journalEntries
      .filter((entry) => entry.userId === state.currentUserId)
      .map((entry) => ({ ...entry, displaySource: journalEntryTypeLabel(entry) }))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [state.currentUserId, state.journalEntries]);
  const mostRecentEntry = useMemo(
    () =>
      entries.reduce<DisplayEntry | undefined>(
        (latest, entry) => (!latest || Date.parse(entry.createdAt) > Date.parse(latest.createdAt) ? entry : latest),
        undefined,
      ),
    [entries],
  );

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

  useEffect(() => {
    if (!params.newEntry || params.newEntry === lastNewEntryParamRef.current) return;
    lastNewEntryParamRef.current = params.newEntry;
    beginEntry("reflection", visibility.private);
  }, [params.newEntry]);

  return (
    <AppScreen topInset={false}>
      <View style={{ gap: 6 }}>
        <Text style={[typography.screenTitle, { color: colors.ink, fontSize: 25, lineHeight: 31 }]}>{t("tabs.me")}</Text>
        <BodyText muted>{t("me.description")}</BodyText>
      </View>

      <ReflectTodayCard onPress={() => beginEntry("reflection", visibility.private)} />

      <JourneySummaryCard entry={mostRecentEntry} onPress={() => setHistoryVisible(true)} />

      <BiblePlansCard count={state.biblePlans.filter((plan) => plan.userId === state.currentUserId).length} />

      {entries.length === 0 ? (
        <Card>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{t("me.empty.title")}</Text>
          <BodyText muted>{t("me.empty.body")}</BodyText>
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

function BiblePlansCard({ count }: { count: number }) {
  const { t } = useAppTranslation();

  return (
    <QuietActionCard icon="calendar" onPress={() => router.push("/bible-plans" as never)} subtitle={t("me.biblePlans.subtitle")} title={t("me.biblePlans.title")}>
      <View style={{ backgroundColor: colors.line, height: 1 }} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Feather name="book-open" size={15} color={colors.muted} />
        <Text style={[typography.caption, { color: colors.muted }]}>
          {count === 0 ? t("me.biblePlans.empty") : count === 1 ? t("me.biblePlans.single") : t("me.biblePlans.count", { count })}
        </Text>
      </View>
    </QuietActionCard>
  );
}

function ReflectTodayCard({ onPress }: { onPress: () => void }) {
  const { t } = useAppTranslation();

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={{ backgroundColor: colors.surface, borderColor: colors.border, minHeight: 150, overflow: "hidden", padding: 16 }}>
        <BrandWaveMotif
          height={136}
          opacity={0.95}
          style={{ bottom: -12, position: "absolute", right: -54, transform: [{ rotate: "-2deg" }] }}
          width={306}
        />
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12, zIndex: 1 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("me.reflect.title")}</Text>
            <BodyText muted>{t("me.reflect.subtitle")}</BodyText>
          </View>
          <Feather name="chevron-right" size={19} color={colors.muted} />
        </View>
      </Card>
    </Pressable>
  );
}

function JourneySummaryCard({ entry, onPress }: { entry?: JournalEntry; onPress: () => void }) {
  const { language, t } = useAppTranslation();

  return (
    <QuietActionCard icon="book-open" onPress={onPress} subtitle={t("me.journey.subtitle")} title={t("me.journey.title")} tone="accent">
      <View style={{ backgroundColor: colors.line, height: 1 }} />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Feather name="book-open" size={15} color={colors.muted} />
        <Text style={[typography.caption, { color: colors.muted }]}>{recentEntrySummary(entry, language, t)}</Text>
      </View>
    </QuietActionCard>
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
          <Text style={[typography.label, { color: colors.olive }]}>Private journal</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={[typography.screenTitle, { color: colors.ink, fontSize: 25, lineHeight: 31 }]}>Your journey</Text>
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
  const { t } = useAppTranslation();
  const type = journalEntryTypeFor(entry);
  const typeLabel = type === "heart_checkin" ? t("community.contentType.checkIn") : journalEntryTypeLabel(entry);
  const exactMood = entry.heartMood ? heartMoods.find((item) => item.value === entry.heartMood) : undefined;
  const numericMood = typeof entry.mood === "number" ? moodOptionForValue(entry.mood) : undefined;
  const mood = entry.heartMood
    ? communityHeartMoodCopy(entry.heartMood, t).label
    : typeof entry.mood === "number"
      ? communityMoodScaleLabel(entry.mood, t)
      : undefined;
  const checkInIcon = exactMood?.icon ?? numericMood?.icon ?? "circle";

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
        <Avatar image={userImage} name={userName} size={38} tone={type === "answered_prayer" ? "orange" : "green"} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[typography.label, { color: colors.ink, fontSize: 14 }]}>{userName}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{formatDate(entry.createdAt)}</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
          <Feather
            name={
              type === "heart_checkin"
                ? checkInIcon
                : type === "scripture_note"
                  ? "book-open"
                  : type === "answered_prayer"
                    ? "check-circle"
                    : type === "prayer"
                      ? "heart"
                      : "edit-3"
            }
            size={13}
            color={colors.accentReflection}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[typography.caption, { color: colors.textMuted }]}>{typeLabel}</Text>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={onOpen}>
          <Text numberOfLines={type === "heart_checkin" && !entry.title ? undefined : 2} style={[typography.title, { color: colors.ink }]}>
            {entry.title || (type === "heart_checkin" && mood ? mood : typeLabel)}
          </Text>
        </Pressable>
        <ExpandableBodyText collapsedLines={JOURNAL_BODY_PREVIEW_LINES}>{entry.body}</ExpandableBodyText>
        {mood ? <BodyText muted>{mood}</BodyText> : null}
        <VerseList verse={entry.verse} verses={entry.verses} compact onAddToJournal={onAddToJournal} onShareToRoom={onShareToRoom} />
      </View>
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
