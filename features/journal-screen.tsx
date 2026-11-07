import { displayBibleReference } from "@/features/bible-book-names";
import { JournalEntryPreview } from "@/features/journal-entry-preview";
import { MeBiblePlans } from "@/features/me-bible-plans";
import { ownedJournalEntries, recentJourneyEntries, reflectionForJournalDay } from "@/features/me-journal";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AppState, Pressable, Text, View } from "react-native";

import { isCheckInJournalEntry } from "@/state/check-ins";
import { EntryVisibility, journalEntryTypeFor, visibility } from "@/state/product";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import { localDayKey } from "@/state/store/helpers";
import type { BibleVerse, EntryKind, JournalEntry, JournalEntryType, KoinoState } from "@/state/types";
import { AppScreen, BodyText, Card } from "@/ui/app-components";
import { BrandWaveMotif } from "@/ui/brand-wave-motif";
import { normalizeBibleVerses, primaryBibleVerse } from "@/features/bible-verse-utils";
import { useAppTranslation } from "@/ui/app-language";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, typography } from "@/ui/theme";

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

function useLocalJournalDay() {
  const [day, setDay] = useState(() => localDayKey(new Date()));

  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout>;

    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      setDay(localDayKey(now));
      const nextDay = new Date(now);
      nextDay.setHours(24, 0, 0, 0);
      timer = setTimeout(refresh, nextDay.getTime() - now.getTime());
    }

    refresh();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []));

  return day;
}

const journalFields = ["authError", "biblePlans", "currentGroupId", "currentUserId", "groups", "journalEntries"] as const;

export function JournalScreen() {
  // Palette tokens mutate in place, so theme-only store updates must render Me.
  const state = useKoinoFields(journalFields);
  return <JournalContent key={state.currentUserId} state={state} />;
}

function JournalContent({ state }: { state: Pick<KoinoState, typeof journalFields[number]> }) {
  const bookLanguage = useBibleBookLanguage();
  const { dispatch } = useKoinoActions();
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
  const lastNewEntryParamRef = useRef<string | undefined>(undefined);

  const editingCheckIn = Boolean(editingEntry && isCheckInJournalEntry(editingEntry));
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const entries = useMemo(
    () => ownedJournalEntries(state.journalEntries, state.currentUserId),
    [state.currentUserId, state.journalEntries],
  );
  const recentEntries = recentJourneyEntries(entries);
  const today = useLocalJournalDay();
  const todaysReflection = reflectionForJournalDay(entries, today);

  function openEntry(entry: JournalEntry) {
    router.push({ pathname: "/me/[id]", params: { id: entry.id } });
  }

  function beginEntry(type: JournalEntryType = "reflection", share: EntryVisibility = visibility.private, attachedVerse?: BibleVerse, initialBody = "") {
    const kind = composerKindForJournalType(type);
    setJournalType(type);
    setEntryKind(kind);
    setEntryVisibility(share);
    setTitle(attachedVerse ? displayBibleReference(attachedVerse.reference, bookLanguage, attachedVerse.translation) : "");
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
        ...(editingCheckIn ? { heartMood: editingEntry.heartMood } : {}),
        sharedPostId: editingCheckIn
          ? editingEntry.sharedPostId : entryVisibility === visibility.room ? editingEntry.sharedPostId : undefined,
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
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{t("tabs.me")}</Text>
        <BodyText muted>{t("me.description")}</BodyText>
      </View>

      <ReflectTodayCard
        completed={Boolean(todaysReflection)}
        onPress={() => todaysReflection ? openEntry(todaysReflection) : beginEntry("reflection", visibility.private)}
      />

      <View style={{ gap: 6 }}>
        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          <Text accessibilityRole="header" style={[typography.heading, { color: colors.ink, flexShrink: 1 }]}>
            {t("me.journey.title")}
          </Text>
          <Pressable
            accessibilityHint={t("me.journey.seeAllHint")}
            accessibilityLabel={t("me.journey.seeAll")}
            accessibilityRole="button"
            onPress={() => router.navigate("/me/history")}
            style={({ pressed }) => ({ alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 6, minHeight: 44, opacity: pressed ? 0.7 : 1, paddingHorizontal: 4 })}
          >
            <Text style={[typography.label, { color: colors.olive, flexShrink: 1 }]}>{t("me.journey.seeAll")}</Text>
            <Feather name="arrow-right" size={15} color={colors.olive} />
          </Pressable>
        </View>
        {recentEntries.length ? (
          recentEntries.map((entry) => (
            <JournalEntryPreview entry={entry} key={entry.id} onOpen={() => openEntry(entry)} variant="journey" />
          ))
        ) : (
          <View style={{ borderColor: colors.line, borderTopWidth: 1, gap: 4, paddingVertical: 12 }}>
            <Text style={[typography.title, { color: colors.ink }]}>{t("me.journey.emptyState.title")}</Text>
            <BodyText muted>{t("me.journey.emptyState.body")}</BodyText>
          </View>
        )}
      </View>

      <MeBiblePlans plans={state.biblePlans} userId={state.currentUserId} />

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
        audienceLocked={editingCheckIn}
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

    </AppScreen>
  );
}

function ReflectTodayCard({ completed, onPress }: { completed: boolean; onPress: () => void }) {
  const { t } = useAppTranslation();
  const title = t(completed ? "me.reflect.completedTitle" : "me.reflect.title");
  const subtitle = t(completed ? "me.reflect.openEntry" : "me.reflect.subtitle");

  return (
    <Pressable accessibilityLabel={`${title}. ${subtitle}`} accessibilityRole="button" onPress={onPress}>
      {({ pressed }) => (
        <Card style={{ backgroundColor: colors.surface, borderColor: colors.border, justifyContent: "center", minHeight: 106, opacity: pressed ? 0.85 : 1, overflow: "hidden", padding: 16 }}>
          <BrandWaveMotif
            height={136}
            opacity={0.9}
            style={{ bottom: -12, position: "absolute", right: -54, transform: [{ rotate: "-2deg" }] }}
            width={306}
          />
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            {completed ? <Feather name="check-circle" size={18} color={colors.olive} /> : null}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[typography.cardTitle, { color: colors.ink }]}>{title}</Text>
              <BodyText muted>{subtitle}</BodyText>
            </View>
            <Feather name="chevron-right" size={19} color={colors.muted} />
          </View>
        </Card>
      )}
    </Pressable>
  );
}
