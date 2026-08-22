import { useEffect, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { normalizeScriptureQuery, resolveBibleReference, searchScripture, type ScriptureSearchResult } from "@/features/bible-search";
import { bibleVersionFor, buildBibleVerse, kjvBooks, type BibleVersionId, versesForChapter } from "@/features/bible-kjv";
import { usePreferredBibleVersion } from "@/features/bible-preferences";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse } from "@/state/types";
import { AppScreen, FullScreenModal, IconButton, PrimaryButton, SecondaryButton, SectionHeading, TextInputField, VersePreviewCard } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, typography } from "@/ui/theme";

const SCRIPTURE_SEARCH_DEBOUNCE_MS = 180;
const SCRIPTURE_SEARCH_MIN_LENGTH = 3;
const SCRIPTURE_SEARCH_RESULT_LIMIT = 8;

export function BibleVerseField({
  attachedFromBible = false,
  label,
  onChange,
  onOpenInBible,
  verses,
}: {
  attachedFromBible?: boolean;
  label?: string;
  onChange: (verses: BibleVerse[]) => void;
  onOpenInBible?: (verse: BibleVerse) => void;
  verses: BibleVerse[];
}) {
  const { state } = useKoino();
  const { t } = useAppTranslation();
  const preferredBibleVersion = usePreferredBibleVersion(state.currentUserId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailOpenRef = useRef(false);
  const detailCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedVerses = verses.slice(0, 5);
  const canAddVerse = selectedVerses.length < 5;

  useEffect(() => () => {
    if (detailCloseTimerRef.current) clearTimeout(detailCloseTimerRef.current);
  }, []);

  function handleDetailVisibilityChange(visible: boolean) {
    if (detailCloseTimerRef.current) clearTimeout(detailCloseTimerRef.current);
    if (visible) {
      detailOpenRef.current = true;
      setDetailOpen(true);
      return;
    }
    detailCloseTimerRef.current = setTimeout(() => {
      detailOpenRef.current = false;
      setDetailOpen(false);
    }, 750);
  }

  function removeVerse(reference: string) {
    if (detailOpenRef.current) return;
    onChange(selectedVerses.filter((item) => item.reference !== reference));
  }

  function addVerse(nextVerse: BibleVerse) {
    const withoutDuplicate = selectedVerses.filter((item) => item.reference !== nextVerse.reference);
    onChange([...withoutDuplicate, nextVerse].slice(0, 5));
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <SectionHeading>{label || t("shared.scripturePicker.fieldLabel")}</SectionHeading>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{selectedVerses.length}/5</Text>
      </View>
      {selectedVerses.length > 0 ? (
        <View style={{ gap: 8 }}>
          {selectedVerses.map((verse) => (
            <View key={`${verse.reference}-${verse.text}`} style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <VersePreviewCard
                  compact
                  inlineDetail={attachedFromBible}
                  onDetailVisibilityChange={handleDetailVisibilityChange}
                  onOpenInBible={onOpenInBible}
                  openAccessibilityLabel={attachedFromBible ? t("shared.scripture.viewReference", { reference: verse.reference }) : undefined}
                  openLabel={attachedFromBible ? t("shared.scripture.openInBible") : undefined}
                  verse={verse}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("shared.scripturePicker.removeReference", { reference: verse.reference })}
                accessibilityState={{ disabled: detailOpen }}
                disabled={detailOpen}
                onPress={() => removeVerse(verse.reference)}
                style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
              >
                <Feather name="x" size={18} color={colors.olive} />
              </Pressable>
            </View>
          ))}
          {canAddVerse ? (
            <SecondaryButton icon="plus" onPress={() => setPickerVisible(true)}>
              {t("shared.scripturePicker.addAnother")}
            </SecondaryButton>
          ) : null}
        </View>
      ) : (
        <SecondaryButton icon="plus" onPress={() => setPickerVisible(true)}>
          {t("shared.scripturePicker.addBibleVerse")}
        </SecondaryButton>
      )}
      {!canAddVerse ? (
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{t("shared.scripturePicker.maxReferences")}</Text>
      ) : null}
      {canAddVerse ? (
        <BibleVersePicker
          bibleVersionId={preferredBibleVersion}
          visible={pickerVisible}
          onBack={() => setPickerVisible(false)}
          onSelect={(nextVerse) => {
            addVerse(nextVerse);
            setPickerVisible(false);
          }}
        />
      ) : null}
    </View>
  );
}

export function normalizeBibleVerses(verse?: BibleVerse, verses?: BibleVerse[]) {
  if (verses?.length) return verses.slice(0, 5);
  return verse ? [verse] : [];
}

export function primaryBibleVerse(verses: BibleVerse[]) {
  return verses[0];
}

export function BibleVersePicker({
  bibleVersionId,
  onBack,
  onSelect,
  visible,
}: {
  bibleVersionId: BibleVersionId;
  onBack: () => void;
  onSelect: (verse: BibleVerse) => void;
  visible: boolean;
}) {
  const { language, t } = useAppTranslation();
  const firstBook = kjvBooks[0];
  const [scriptureQuery, setScriptureQuery] = useState("");
  const [searchResultState, setSearchResultState] = useState<{ key: string; results: ScriptureSearchResult[] }>();
  const [searchingKey, setSearchingKey] = useState<string>();
  const [completedSearchKey, setCompletedSearchKey] = useState<string>();
  const [searchErrorKey, setSearchErrorKey] = useState<string>();
  const searchRequestRef = useRef(0);
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState(firstBook?.name ?? "Genesis");
  const [selectedChapter, setSelectedChapter] = useState(firstBook?.chapters[0] ?? 1);
  const initialVerse = versesForChapter(firstBook?.name ?? "Genesis", firstBook?.chapters[0] ?? 1)[0] ?? 1;
  const [startVerse, setStartVerse] = useState(initialVerse);
  const [endVerse, setEndVerse] = useState(initialVerse);
  const book = kjvBooks.find((item) => item.name === selectedBook) ?? firstBook;
  const chapterVerses = versesForChapter(selectedBook, selectedChapter);
  const selectableBooks = kjvBooks.filter((item) => item.name.toLowerCase().includes(bookQuery.trim().toLowerCase()));
  const bibleVersion = bibleVersionFor(bibleVersionId);
  const preview = buildBibleVerse(selectedBook, selectedChapter, startVerse, endVerse, bibleVersionId);
  const normalizedScriptureQuery = normalizeScriptureQuery(scriptureQuery);
  const normalizedSearchLength = normalizedScriptureQuery.replace(/[^\p{L}\p{N}]/gu, "").length;
  const isDirectReference = Boolean(
    normalizedScriptureQuery && resolveBibleReference(normalizedScriptureQuery, language, bibleVersionId),
  );
  const canSearchScripture = isDirectReference || normalizedSearchLength >= SCRIPTURE_SEARCH_MIN_LENGTH;
  const searchKey = `${language}|${bibleVersionId}|${normalizedScriptureQuery}`;
  const currentSearchResults = searchResultState?.key === searchKey ? searchResultState.results : [];
  const isSearching = searchingKey === searchKey;
  const hasCompletedSearch = completedSearchKey === searchKey;
  const hasSearchError = searchErrorKey === searchKey;

  useEffect(() => {
    if (visible) return;
    searchRequestRef.current += 1;
    setScriptureQuery("");
    setSearchResultState(undefined);
    setSearchingKey(undefined);
    setCompletedSearchKey(undefined);
    setSearchErrorKey(undefined);
  }, [visible]);

  useEffect(() => {
    const requestId = ++searchRequestRef.current;
    let active = true;
    let searchTimer: ReturnType<typeof setTimeout> | undefined;

    if (!visible || !canSearchScripture) {
      setSearchResultState(undefined);
      setSearchingKey(undefined);
      setCompletedSearchKey(undefined);
      setSearchErrorKey(undefined);
      return;
    }

    setSearchResultState(undefined);
    setSearchingKey(searchKey);
    setCompletedSearchKey(undefined);
    setSearchErrorKey(undefined);

    async function runSearch() {
      try {
        const results = await searchScripture({
          language,
          limit: SCRIPTURE_SEARCH_RESULT_LIMIT,
          query: normalizedScriptureQuery,
          versionId: bibleVersionId,
        });
        if (!active || requestId !== searchRequestRef.current) return;
        setSearchResultState({ key: searchKey, results });
        setCompletedSearchKey(searchKey);
      } catch {
        if (!active || requestId !== searchRequestRef.current) return;
        setSearchResultState({ key: searchKey, results: [] });
        setCompletedSearchKey(searchKey);
        setSearchErrorKey(searchKey);
      } finally {
        if (active && requestId === searchRequestRef.current) setSearchingKey(undefined);
      }
    }

    if (isDirectReference) {
      void runSearch();
    } else {
      searchTimer = setTimeout(() => void runSearch(), SCRIPTURE_SEARCH_DEBOUNCE_MS);
    }

    return () => {
      active = false;
      if (searchTimer) clearTimeout(searchTimer);
    };
  }, [bibleVersionId, canSearchScripture, isDirectReference, language, normalizedScriptureQuery, searchKey, visible]);

  function chooseBook(name: string) {
    const nextBook = kjvBooks.find((item) => item.name === name);
    const nextChapter = nextBook?.chapters[0] ?? 1;
    const nextVerse = versesForChapter(name, nextChapter)[0] ?? 1;
    setSelectedBook(name);
    setSelectedChapter(nextChapter);
    setStartVerse(nextVerse);
    setEndVerse(nextVerse);
  }

  function chooseChapter(chapter: number) {
    const nextVerse = versesForChapter(selectedBook, chapter)[0] ?? 1;
    setSelectedChapter(chapter);
    setStartVerse(nextVerse);
    setEndVerse(nextVerse);
  }

  function chooseStartVerse(verseNumber: number) {
    setStartVerse(verseNumber);
    setEndVerse((current) => Math.max(current, verseNumber));
  }

  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={onBack}>
      <AppScreen>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.heading, { color: colors.ink, fontSize: 20, lineHeight: 26 }]}>{t("shared.scripturePicker.title")}</Text>
            <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
              {bibleVersion.label}
            </Text>
          </View>
          <IconButton accessibilityLabel={t("shared.scripturePicker.close")} icon="x" onPress={onBack} />
        </View>
        <View style={{ gap: 10 }}>
          <View style={{ position: "relative" }}>
            <TextInputField
              accessibilityLabel={t("shared.scripturePicker.searchAccessibility")}
              autoCapitalize="none"
              onChangeText={setScriptureQuery}
              placeholder={t("shared.scripturePicker.searchPlaceholder")}
              returnKeyType="search"
              style={{ paddingRight: scriptureQuery ? 50 : 14 }}
              value={scriptureQuery}
            />
            {scriptureQuery ? (
              <Pressable
                accessibilityLabel={t("shared.scripturePicker.clearSearch")}
                accessibilityRole="button"
                hitSlop={4}
                onPress={() => setScriptureQuery("")}
                style={{ alignItems: "center", height: 44, justifyContent: "center", position: "absolute", right: 3, top: 3, width: 44 }}
              >
                <Feather color={colors.muted} name="x" size={18} />
              </Pressable>
            ) : null}
          </View>
          {isSearching ? (
            <View
              accessibilityLabel={t("shared.scripturePicker.searching")}
              accessibilityLiveRegion="polite"
              accessibilityRole="progressbar"
              style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 28 }}
            >
              <ActivityIndicator color={colors.olive} size="small" />
              <Text style={[typography.caption, { color: colors.muted }]}>{t("shared.scripturePicker.searching")}</Text>
            </View>
          ) : null}
          {currentSearchResults.length > 0 ? (
            <View style={{ gap: 8 }}>
              {currentSearchResults.map((result) => (
                <ScriptureSearchResultRow
                  accessibilityLabel={t("shared.scripturePicker.resultAccessibility", {
                    reference: result.verse.reference,
                    text: result.verse.text,
                  })}
                  key={`${result.verse.reference}-${result.verse.text}`}
                  onPress={() => onSelect(result.verse)}
                  result={result}
                />
              ))}
            </View>
          ) : null}
          {hasCompletedSearch && !hasSearchError && currentSearchResults.length === 0 ? (
            <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.muted, minHeight: 28 }]}>
              {t("shared.scripturePicker.noSearchResults")}
            </Text>
          ) : null}
          {hasSearchError ? (
            <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.muted, minHeight: 28 }]}>
              {t("shared.scripturePicker.searchError")}
            </Text>
          ) : null}
        </View>
        <SectionHeading>{t("shared.scripturePicker.browseBible")}</SectionHeading>
        <TextInputField value={bookQuery} onChangeText={setBookQuery} placeholder={t("shared.scripturePicker.searchBooks")} />
        <View style={{ gap: 10 }}>
          <SectionHeading muted>{t("shared.scripturePicker.book")}</SectionHeading>
          <PickerPills values={selectableBooks.map((item) => item.name)} selected={selectedBook} onSelect={chooseBook} />
        </View>
        <View style={{ gap: 10 }}>
          <SectionHeading muted>{t("shared.scripturePicker.chapter")}</SectionHeading>
          <PickerPills values={book?.chapters.map(String) ?? []} selected={String(selectedChapter)} onSelect={(value) => chooseChapter(Number(value))} />
        </View>
        <View style={{ gap: 10 }}>
          <SectionHeading muted>{t("shared.scripturePicker.startVerse")}</SectionHeading>
          <PickerPills values={chapterVerses.map(String)} selected={String(startVerse)} onSelect={(value) => chooseStartVerse(Number(value))} />
        </View>
        <View style={{ gap: 10 }}>
          <SectionHeading muted>{t("shared.scripturePicker.endVerse")}</SectionHeading>
          <PickerPills
            values={chapterVerses.filter((verseNumber) => verseNumber >= startVerse).map(String)}
            selected={String(endVerse)}
            onSelect={(value) => setEndVerse(Number(value))}
          />
        </View>
        <VersePreviewCard verse={preview} showOpenIndicator={false} />
        <PrimaryButton disabled={!preview} icon="book-open" onPress={() => preview && onSelect(preview)}>
          {t("shared.scripturePicker.addReference", { reference: preview?.reference ?? t("shared.scripturePicker.verseFallback") })}
        </PrimaryButton>
      </AppScreen>
    </FullScreenModal>
  );
}

function ScriptureSearchResultRow({
  accessibilityLabel,
  onPress,
  result,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  result: ScriptureSearchResult;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        gap: 5,
        minHeight: 72,
        opacity: pressed ? 0.72 : 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
      })}
    >
      <Text style={{ color: colors.olive, fontSize: 14, fontWeight: "900" }}>{result.verse.reference}</Text>
      <Text numberOfLines={3} style={[typography.body, { color: colors.ink, fontSize: 14, lineHeight: 20 }]}>
        {result.verse.text}
      </Text>
    </Pressable>
  );
}

function PickerPills<T extends string>({
  onSelect,
  selected,
  values,
}: {
  onSelect: (value: T) => void;
  selected: T;
  values: T[];
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {values.map((value) => {
        const isSelected = value === selected;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={value}
            onPress={() => onSelect(value)}
            style={{
              alignItems: "center",
              backgroundColor: isSelected ? colors.accentSubtle : colors.paper,
              borderColor: isSelected ? colors.gold : colors.line,
              borderRadius: 999,
              borderWidth: 1,
              justifyContent: "center",
              minHeight: 38,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: isSelected ? colors.olive : colors.muted, fontSize: 14, fontWeight: "800" }}>{value}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
