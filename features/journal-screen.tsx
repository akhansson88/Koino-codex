import { JournalEntryPreview } from "@/features/journal-entry-preview";
import { MeBiblePlans } from "@/features/me-bible-plans";
import { ownedJournalEntries, recentJourneyEntries, reflectionForJournalDay } from "@/features/me-journal";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AppState, Pressable, Text, View } from "react-native";

import { type EntryVisibility, visibility } from "@/state/product";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import { localDayKey } from "@/state/store/helpers";
import type { BibleVerse, EntryKind, JournalEntry, JournalEntryType, KoinoState } from "@/state/types";
import { AppScreen, BodyText, Card } from "@/ui/app-components";
import { BrandWaveMotif } from "@/ui/brand-wave-motif";
import { primaryBibleVerse } from "@/features/bible-verse-utils";
import { useAppTranslation } from "@/ui/app-language";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, typography } from "@/ui/theme";

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

const journalFields = ["authError", "biblePlans", "currentUserId", "groups", "journalEntries", "journalShareGroupId"] as const;

type DraftAudience = { groupId: string };
type DraftFeedback = "me.journey.composer.communityChanged" | "me.journey.composer.saveFailed" | "me.journey.composer.shareUnconfirmed";

export function JournalScreen() {
  const state = useKoinoFields(journalFields);
  return <JournalContent key={state.currentUserId} state={state} />;
}

function JournalContent({ state }: { state: Pick<KoinoState, typeof journalFields[number]> }) {
  const { dispatch } = useKoinoActions();
  const { t } = useAppTranslation();
  const params = useLocalSearchParams<{ newEntry?: string }>();
  const [draft, setDraft] = useState<symbol>();
  const [entryKind, setEntryKind] = useState<EntryKind>("reflection");
  const [audience, setAudience] = useState<DraftAudience>();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<DraftFeedback>();
  const [saved, setSaved] = useState<{ community?: string }>();
  const draftRef = useRef<symbol | undefined>(undefined);
  const pending = useRef(false);
  const audienceRef = useRef<DraftAudience | undefined>(undefined);
  const liveShareTarget = useRef<DraftAudience | undefined>(undefined);
  const lastNewEntryParamRef = useRef<string | undefined>(undefined);

  const group = state.groups.find((item) => item.id === state.journalShareGroupId && !item.migrationPending && item.name);
  const groupId = group?.id;
  const shareTarget = useMemo(() => groupId ? { groupId } : undefined, [groupId]);
  const entries = useMemo(
    () => ownedJournalEntries(state.journalEntries, state.currentUserId),
    [state.currentUserId, state.journalEntries],
  );
  const recentEntries = recentJourneyEntries(entries);
  const today = useLocalJournalDay();
  const todaysReflection = reflectionForJournalDay(entries, today);

  useLayoutEffect(() => () => { draftRef.current = undefined; }, []);
  useLayoutEffect(() => {
    liveShareTarget.current = shareTarget;
    if (audienceRef.current && audienceRef.current !== shareTarget) {
      audienceRef.current = undefined;
      setAudience(undefined);
      setFeedback("me.journey.composer.communityChanged");
    }
  }, [shareTarget]);

  function openEntry(entry: JournalEntry) {
    router.push({ pathname: "/me/[id]", params: { id: entry.id } });
  }

  function clearDraft() {
    draftRef.current = undefined;
    setDraft(undefined);
    audienceRef.current = undefined;
    setAudience(undefined);
    setTitle("");
    setBody("");
    setVerses([]);
    setFeedback(undefined);
  }

  function beginEntry() {
    if (!state.currentUserId || pending.current) return;
    clearDraft();
    setSaved(undefined);
    setEntryKind("reflection");
    const nextDraft = Symbol();
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }

  function changeAudience(next: EntryVisibility) {
    if (!draft || draftRef.current !== draft || pending.current) return;
    const nextTarget = next === visibility.room ? shareTarget : undefined;
    if (next === visibility.room && (!nextTarget || liveShareTarget.current !== nextTarget)) return;
    audienceRef.current = nextTarget;
    setAudience(nextTarget);
    setFeedback(undefined);
  }

  async function submitEntry() {
    const userId = state.currentUserId;
    if (!userId || !draft || draftRef.current !== draft || pending.current || !body.trim()) return;
    // A captured Share action cannot become a private save or select a new room.
    if (audienceRef.current !== audience || (audience && liveShareTarget.current !== audience)) return;
    const destination = audience ? group : undefined;
    if (audience && destination?.id !== audience.groupId) return;

    pending.current = true;
    setSaving(true);
    setFeedback(undefined);
    try {
      await dispatch({
        type: "createJournalEntry",
        body,
        entryKind,
        journalType: journalTypeForKind(entryKind),
        title,
        verse: primaryBibleVerse(verses),
        verses,
        shareWithGroup: Boolean(destination),
        journalScope: destination ? { userId, groupId: destination.id } : { userId },
      });
      if (draftRef.current !== draft) return;
      setSaved(destination ? { community: destination.name } : {});
      clearDraft();
    } catch {
      if (draftRef.current === draft) {
        setFeedback(destination ? "me.journey.composer.shareUnconfirmed" : "me.journey.composer.saveFailed");
      }
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!params.newEntry || params.newEntry === lastNewEntryParamRef.current) return;
    lastNewEntryParamRef.current = params.newEntry;
    beginEntry();
  }, [params.newEntry]);

  return (
    <AppScreen topInset={false}>
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{t("tabs.me")}</Text>
        <BodyText muted>{t("me.description")}</BodyText>
      </View>

      <ReflectTodayCard
        completed={Boolean(todaysReflection)}
        onPress={() => todaysReflection ? openEntry(todaysReflection) : beginEntry()}
      />
      {saved ? (
        <BodyText accessibilityRole="alert" accessibilityLiveRegion="polite">
          {saved.community ? t("me.journey.composer.shared", { community: saved.community }) : t("me.journey.composer.savedPrivate")}
        </BodyText>
      ) : null}

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
        visible={Boolean(draft)}
        context="journal"
        kind={entryKind}
        entryVisibility={audience && audience === shareTarget ? visibility.room : visibility.private}
        communityAudienceAvailable={Boolean(shareTarget)}
        title={title}
        body={body}
        verses={verses}
        submission={saving ? { status: "pending", inFlight: true } : feedback ? { status: "failure", inFlight: false } : undefined}
        submissionFeedback={saving ? "me.journey.composer.saving" : feedback}
        onKind={setEntryKind}
        onVisibility={changeAudience}
        onTitle={setTitle}
        onBody={setBody}
        onVerses={setVerses}
        onClose={() => { if (draft && draftRef.current === draft && !pending.current) clearDraft(); }}
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
