import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { EntryVisibility, journalEntryTypeFor, visibility } from "@/state/product";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, EntryKind, JournalEntry, JournalEntryType } from "@/state/types";
import {
  AppScreen,
  BodyText,
  Card,
  FullScreenModal,
  IconButton,
  PrimaryButton,
  SecondaryButton,
} from "@/ui/app-components";
import { BrandWaveMotif } from "@/ui/brand-wave-motif";
import { normalizeBibleVerses, primaryBibleVerse } from "@/features/bible-verse-utils";
import { useAppTranslation } from "@/ui/app-language";
import { journalEntryPresentation } from "@/ui/journal-presentation";
import type { AppLanguage, TranslationFunction, TranslationKey } from "@/ui/localization";
import { QuietActionCard } from "@/ui/rhythm-cards";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, typography } from "@/ui/theme";

const JOURNAL_BODY_PREVIEW_LINES = 3;

function formatDate(value: string, language: AppLanguage) {
  return new Intl.DateTimeFormat(language, { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
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
    scripture_note: "me.journey.lastReflection",
  };
  const context = t(typeLabelKey[journalEntryPresentation(entry, t).journalType]);
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
  const entries = useMemo<JournalEntry[]>(() => {
    return state.journalEntries
      .filter((entry) => entry.userId === state.currentUserId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [state.currentUserId, state.journalEntries]);
  const mostRecentEntry = useMemo(
    () =>
      entries.reduce<JournalEntry | undefined>(
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
        hasMore={state.journalEntriesHasMore}
        loadingMore={state.journalEntriesLoadingMore}
        onClose={() => setHistoryVisible(false)}
        onOpen={(entry) => {
          setHistoryVisible(false);
          setTimeout(() => router.push(`/me/${entry.id}` as never), 220);
        }}
        onWriteEntry={() => {
          setHistoryVisible(false);
          beginEntry("reflection", visibility.private);
        }}
        onLoadMore={() => dispatch({ type: "loadOlderJournalEntries" })}
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
  hasMore,
  loadingMore,
  onClose,
  onLoadMore,
  onOpen,
  onWriteEntry,
  visible,
}: {
  entries: JournalEntry[];
  hasMore: boolean;
  loadingMore: boolean;
  onClose: () => void;
  onLoadMore: () => Promise<void>;
  onOpen: (entry: JournalEntry) => void;
  onWriteEntry: () => void;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const historyScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    historyScrollRef.current?.scrollTo({ animated: false, y: 0 });
  }, [visible]);

  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={onClose}>
      <AppScreen scrollRef={historyScrollRef}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={onClose} />
          <Text style={[typography.label, { color: colors.olive }]}>{t("me.journey.privateJournal")}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={[typography.screenTitle, { color: colors.ink, fontSize: 25, lineHeight: 31 }]}>{t("me.journey.title")}</Text>
          <BodyText muted>{t("me.journey.subtitle")}</BodyText>
        </View>
        {entries.length === 0 ? (
          <Card style={{ gap: 12 }}>
            <Text style={[typography.title, { color: colors.ink }]}>{t("me.journey.emptyState.title")}</Text>
            <BodyText muted>{t("me.journey.emptyState.body")}</BodyText>
            <PrimaryButton icon="edit-3" onPress={onWriteEntry}>
              {t("me.journey.emptyState.action")}
            </PrimaryButton>
          </Card>
        ) : null}
        {entries.map((entry) => (
          <JournalEntryCard
            key={`${entry.id}-${entry.createdAt}`}
            entry={entry}
            onOpen={() => onOpen(entry)}
          />
        ))}
        {hasMore ? (
          <SecondaryButton disabled={loadingMore} icon="chevron-down" onPress={onLoadMore}>
            {t(loadingMore ? "me.journey.loadingEarlier" : "me.journey.loadEarlier")}
          </SecondaryButton>
        ) : null}
      </AppScreen>
    </FullScreenModal>
  );
}

function JournalEntryCard({
  entry,
  onOpen,
}: {
  entry: JournalEntry;
  onOpen: () => void;
}) {
  const { language, t } = useAppTranslation();
  const presentation = journalEntryPresentation(entry, t);
  const references = normalizeBibleVerses(entry.verse, entry.verses).map((verse) => verse.reference);
  const date = formatDate(entry.createdAt, language);

  return (
    <Pressable
      accessibilityHint={t("me.journey.preview.openHint")}
      accessibilityLabel={t("me.journey.preview.openLabel", { date, type: presentation.typeLabel })}
      accessibilityRole="button"
      onPress={onOpen}
    >
      {({ pressed }) => (
        <Card style={{ gap: 10, opacity: pressed ? 0.88 : 1, padding: 14 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <View style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: 6 }}>
              <Feather name={presentation.typeIcon} size={14} color={colors.accentReflection} />
              <Text style={[typography.label, { color: colors.textMuted }]}>{presentation.typeLabel}</Text>
            </View>
            <Text style={[typography.caption, { color: colors.muted }]}>{date}</Text>
          </View>
          {presentation.moodLabel ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
              <Feather name={presentation.moodIcon} size={15} color={colors.olive} />
              <Text style={[typography.label, { color: colors.olive }]}>{presentation.moodLabel}</Text>
            </View>
          ) : null}
          {presentation.title ? (
            <Text numberOfLines={2} style={[typography.title, { color: colors.ink }]}>
              {presentation.title}
            </Text>
          ) : null}
          {presentation.body ? (
            <Text numberOfLines={JOURNAL_BODY_PREVIEW_LINES} style={[typography.body, { color: colors.muted }]}>
              {presentation.body}
            </Text>
          ) : null}
          {references.length > 0 ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
              <Feather name="book-open" size={14} color={colors.olive} />
              <Text numberOfLines={2} style={[typography.caption, { color: colors.olive, flex: 1 }]}>
                {references.join(" · ")}
              </Text>
              <Feather name="chevron-right" size={16} color={colors.muted} />
            </View>
          ) : (
            <View style={{ alignItems: "flex-end" }}>
              <Feather name="chevron-right" size={16} color={colors.muted} />
            </View>
          )}
        </Card>
      )}
    </Pressable>
  );
}
