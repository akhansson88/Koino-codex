import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { JournalEntryPreview } from "@/features/journal-entry-preview";
import { ownedJournalEntries } from "@/features/me-journal";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import type { JournalEntry, JournalEntryType } from "@/state/types";
import { AppScreen, BodyText, Card, IconButton, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { presentedJournalEntryType } from "@/ui/journal-presentation";
import type { TranslationKey } from "@/ui/localization";
import { colors, typography } from "@/ui/theme";

const filters = [
  { value: "all", label: "me.journey.filter.all" },
  { value: "reflections", label: "me.journey.filter.reflections" },
  { value: "prayers", label: "me.journey.filter.prayers" },
  { value: "checkIns", label: "me.journey.filter.checkIns" },
  { value: "scripture", label: "me.journey.filter.scripture" },
] as const satisfies readonly { value: string; label: TranslationKey }[];

type JournalHistoryFilter = (typeof filters)[number]["value"];

const filterByType: Record<JournalEntryType, Exclude<JournalHistoryFilter, "all">> = {
  reflection: "reflections",
  prayer: "prayers",
  answered_prayer: "prayers",
  heart_checkin: "checkIns",
  scripture_note: "scripture",
};

export function filterJournalHistory(entries: readonly JournalEntry[], filter: JournalHistoryFilter) {
  if (filter === "all") return entries;
  return entries.filter((entry) => filterByType[presentedJournalEntryType(entry)] === filter);
}

export function JournalHistoryScreen() {
  const { authReady, currentUserId, journalEntries, journalEntriesHasMore, journalEntriesLoadingMore } =
    useKoinoFields(["authReady", "currentUserId", "journalEntries", "journalEntriesHasMore", "journalEntriesLoadingMore"]);
  const { dispatch } = useKoinoActions();
  const openingUserId = useRef(currentUserId);
  const accountChanged = openingUserId.current !== undefined && openingUserId.current !== currentUserId;
  const entries = useMemo(() => ownedJournalEntries(journalEntries, currentUserId), [journalEntries, currentUserId]);

  useFocusEffect(useCallback(() => {
    if (accountChanged || (authReady && !currentUserId)) {
      router.dismissTo("/(tabs)/me");
    } else if (currentUserId) {
      openingUserId.current = currentUserId;
    }
  }, [accountChanged, authReady, currentUserId]));

  // An older account's route may still be underneath a detail screen.
  if (!currentUserId || accountChanged) return <AppScreen scroll={false} />;

  return (
    <JournalHistoryContent
      entries={entries}
      hasMore={journalEntriesHasMore}
      loadingMore={journalEntriesLoadingMore}
      onLoadMore={() => dispatch({ type: "loadOlderJournalEntries" })}
    />
  );
}

function JournalHistoryContent({ entries, hasMore, loadingMore, onLoadMore }: {
  entries: JournalEntry[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
}) {
  const { t } = useAppTranslation();
  const [filter, setFilter] = useState<JournalHistoryFilter>("all");
  const visibleEntries = filterJournalHistory(entries, filter);
  const journalIsEmpty = entries.length === 0 && !hasMore;

  function closeHistory() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/me");
  }

  function writeEntry() {
    router.dismissTo({ pathname: "/(tabs)/me", params: { newEntry: String(Date.now()) } });
  }

  return (
    <AppScreen>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
        <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={closeHistory} />
        <Text style={[typography.label, { color: colors.olive, flexShrink: 1, textAlign: "center" }]}>
          {t("me.journey.journalLabel")}
        </Text>
        <View style={{ width: 38 }} />
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink, flexShrink: 1, fontSize: 25, lineHeight: 31 }]}>
          {t("me.journey.historyTitle")}
        </Text>
        {!journalIsEmpty ? (
          <Pressable
            accessibilityRole="button"
            onPress={writeEntry}
            style={({ pressed }) => ({ alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 6, minHeight: 44, opacity: pressed ? 0.7 : 1, paddingHorizontal: 4 })}
          >
            <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
              <Feather name="edit-3" size={15} color={colors.olive} />
            </View>
            <Text style={[typography.label, { color: colors.olive, flexShrink: 1 }]}>{t("me.journey.historyNewEntry")}</Text>
          </Pressable>
        ) : null}
      </View>
      {journalIsEmpty ? (
        <Card style={{ gap: 12 }}>
          <Text style={[typography.title, { color: colors.ink }]}>{t("me.journey.emptyState.title")}</Text>
          <BodyText muted>{t("me.journey.emptyState.body")}</BodyText>
          <PrimaryButton icon="edit-3" onPress={writeEntry}>
            {t("me.journey.emptyState.action")}
          </PrimaryButton>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {filters.map((option) => {
              const selected = filter === option.value;
              const label = t(option.label);
              return (
                <Pressable
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.value}
                  onPress={() => setFilter(option.value)}
                  style={{
                    alignItems: "center",
                    backgroundColor: selected ? colors.accentSubtle : colors.paper,
                    borderColor: selected ? colors.gold : colors.line,
                    borderRadius: 999,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: 6,
                    justifyContent: "center",
                    maxWidth: "100%",
                    minHeight: 44,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  {selected ? (
                    <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
                      <Feather name="check" size={14} color={colors.olive} />
                    </View>
                  ) : null}
                  <Text style={[typography.label, { color: selected ? colors.olive : colors.muted, flexShrink: 1, textAlign: "center" }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {visibleEntries.length === 0 ? (
            <View accessibilityLiveRegion="polite">
              <BodyText muted>{t(hasMore ? "me.journey.filteredEmpty.earlier" : "me.journey.filteredEmpty.none")}</BodyText>
            </View>
          ) : null}
          {visibleEntries.map((entry) => (
            <JournalEntryPreview
              key={entry.id}
              entry={entry}
              onOpen={() => router.push({ pathname: "/me/[id]", params: { id: entry.id } })}
              variant="history"
            />
          ))}
          {hasMore ? (
            <SecondaryButton disabled={loadingMore} icon="chevron-down" onPress={onLoadMore}>
              {t(loadingMore ? "me.journey.loadingEarlier" : "me.journey.loadEarlier")}
            </SecondaryButton>
          ) : null}
        </>
      )}
    </AppScreen>
  );
}
