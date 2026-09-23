import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { AppSheet, SheetScrollView, type AppSheetHandle } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildBibleVerse,
  kjvBooks,
  normalizeBiblePosition,
  searchBibleText,
  type BiblePosition,
  type BibleTextSearchResult,
  type BibleVersionId,
} from "@/features/bible-kjv";
import { biblePositionFromSearchQuery, displayBibleBookName, displayBibleReference } from "@/features/bible-search";
import type { BibleHighlight, JournalEntry, SavedVerse } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { type ReaderPalette, type PickerStage, type TestamentFilter } from "@/features/bible-reader/types";
import {
  biblePositionFromVerse,
  testamentForBook,
  highlightTime,
  chapterLabel,
  referenceLabel,
} from "@/features/bible-reader/verse-helpers";
import { suggestedTopics } from "@/features/bible-reader/topics-api";
import { BibleSheetTop, bibleSheetHorizontalPadding } from "@/features/bible-reader/sheet-primitives";
import { ReaderCircleButton } from "@/features/bible-reader/header";
import {
  DrawerSection,
  DrawerRow,
  DrawerSearchBox,
  DrawerEmptyState,
  DrawerBookRow,
  DrawerVerseRow,
  PickerGrid,
} from "@/features/bible-reader/drawer-components";
import { SavedVerseActionSheet } from "@/features/bible-reader/verse-actions";

export function BibleDrawer({
  biblePlanCount,
  bibleVersionId,
  highlights,
  initialStage,
  initialPosition,
  journalEntries,
  onClose,
  onOpenPlans: openPlans,
  onOpenReflection: openReflection,
  onOpenTopic: openTopic,
  onRemoveSavedVerse,
  onSelect: selectPosition,
  palette,
  savedVerses,
  versionLabel,
  visible,
}: {
  biblePlanCount: number;
  bibleVersionId: BibleVersionId;
  highlights: BibleHighlight[];
  initialStage: "home" | "search";
  initialPosition: BiblePosition;
  journalEntries: JournalEntry[];
  onClose: () => void;
  onOpenPlans: () => void;
  onOpenReflection: (entryId: string) => void;
  onOpenTopic: (topic?: string) => void;
  onRemoveSavedVerse: (id: string) => Promise<void>;
  onSelect: (position: BiblePosition) => void;
  palette: ReaderPalette;
  savedVerses: SavedVerse[];
  versionLabel: string;
  visible: boolean;
}) {
  const bookLanguage = useBibleBookLanguage(bibleVersionId);
  const { language, t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(height * 0.84), 720);
  const sheetRef = useRef<AppSheetHandle>(null);
  const drawerScrollRef = useRef<ScrollView>(null);
  const phraseSearchRequestRef = useRef(0);
  const [stage, setStage] = useState<PickerStage>(initialStage);
  const [bookQuery, setBookQuery] = useState("");
  const [bookParentStage, setBookParentStage] = useState<"book" | "search">("book");
  const [selectedBook, setSelectedBook] = useState(initialPosition.book);
  const [testament, setTestament] = useState<TestamentFilter>("all");
  const [phraseSearchLoading, setPhraseSearchLoading] = useState(false);
  const [phraseSearchResults, setPhraseSearchResults] = useState<BibleTextSearchResult[]>([]);
  const [savedVerseMenu, setSavedVerseMenu] = useState<SavedVerse | undefined>();
  const [hiddenSavedVerseIds, setHiddenSavedVerseIds] = useState<string[]>([]);
  const visibleSavedVerses = useMemo(
    () => savedVerses.filter((verse) => !hiddenSavedVerseIds.includes(verse.id)),
    [hiddenSavedVerseIds, savedVerses],
  );
  const closeWithAnimation = useCallback((afterClose?: () => void) => sheetRef.current?.dismiss(afterClose), []);
  const onSelect = useCallback((position: BiblePosition) => sheetRef.current?.dismiss(() => selectPosition(position)), [selectPosition]);
  const onOpenPlans = () => sheetRef.current?.dismiss(openPlans);
  const onOpenReflection = (id: string) => sheetRef.current?.dismiss(() => openReflection(id));
  const onOpenTopic = (topic?: string) => sheetRef.current?.dismiss(() => openTopic(topic));


  useEffect(() => {
    if (!visible) return;
    const normalized = normalizeBiblePosition(initialPosition);
    setStage(initialStage);
    setBookQuery("");
    setBookParentStage(initialStage === "search" ? "search" : "book");
    setSelectedBook(normalized.book);
    setTestament("all");
    setSavedVerseMenu(undefined);
  }, [initialPosition, initialStage, visible]);

  useEffect(() => {
    setHiddenSavedVerseIds((current) => current.filter((id) => savedVerses.some((verse) => verse.id === id)));
  }, [savedVerses]);

  const openSavedVerse = useCallback((verse: SavedVerse) => {
    const nextPosition = biblePositionFromVerse(verse);
    if (!nextPosition) return;
    setSavedVerseMenu(undefined);
    onSelect(nextPosition);
  }, [onSelect]);

  const removeSavedVerse = useCallback((verse: SavedVerse) => {
    setSavedVerseMenu(undefined);
    setHiddenSavedVerseIds((current) => current.includes(verse.id) ? current : [...current, verse.id]);
    void onRemoveSavedVerse(verse.id).catch(() => {
      setHiddenSavedVerseIds((current) => current.filter((id) => id !== verse.id));
    });
  }, [onRemoveSavedVerse]);


  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => drawerScrollRef.current?.scrollTo({ animated: false, y: 0 }));
  }, [stage, visible]);

  const book = kjvBooks.find((item) => item.name === selectedBook) ?? kjvBooks[0];
  const normalizedQuery = bookQuery.trim().toLocaleLowerCase(language);
  const searchPosition = biblePositionFromSearchQuery(bookQuery, language, bibleVersionId);
  const selectableBooks = kjvBooks.filter((item) => {
    const displayName = displayBibleBookName(item.name, bookLanguage).toLocaleLowerCase(language);
    const matchesQuery = !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery) || displayName.includes(normalizedQuery);
    const matchesTestament = testament === "all" || testamentForBook(item.name) === testament;
    return matchesQuery && matchesTestament;
  });
  const matchingTopics = normalizedQuery
    ? suggestedTopics.filter((topic) => {
        const title = t(topic.titleKey).toLocaleLowerCase(language);
        const subtitle = t(topic.subtitleKey).toLocaleLowerCase(language);
        return title.includes(normalizedQuery) || subtitle.includes(normalizedQuery) || topic.apiTopic.toLowerCase().includes(normalizedQuery);
      })
    : [];
  const phraseSearchEligible = Boolean(
    stage === "search" &&
    normalizedQuery &&
    !searchPosition &&
    selectableBooks.length === 0 &&
    matchingTopics.length === 0,
  );

  useEffect(() => {
    const requestId = phraseSearchRequestRef.current + 1;
    phraseSearchRequestRef.current = requestId;
    if (!visible || !phraseSearchEligible) {
      setPhraseSearchLoading(false);
      setPhraseSearchResults([]);
      return;
    }

    setPhraseSearchLoading(true);
    setPhraseSearchResults([]);
    const timeout = setTimeout(() => {
      void searchBibleText(bookQuery, bibleVersionId)
        .then((results) => {
          if (phraseSearchRequestRef.current !== requestId) return;
          setPhraseSearchResults(results);
        })
        .catch(() => {
          if (phraseSearchRequestRef.current !== requestId) return;
          setPhraseSearchResults([]);
        })
        .finally(() => {
          if (phraseSearchRequestRef.current === requestId) {
            setPhraseSearchLoading(false);
          }
        });
    }, 180);

    return () => clearTimeout(timeout);
  }, [bibleVersionId, bookQuery, phraseSearchEligible, visible]);

  const recentHighlights = useMemo(() => [...highlights].sort((a, b) => highlightTime(b) - highlightTime(a)).slice(0, 12), [highlights]);
  const bibleReflections = useMemo(
    () =>
      journalEntries
        .filter((entry) => entry.verse || entry.verses?.length || entry.passage)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 12),
    [journalEntries],
  );
  const title =
    stage === "home"
      ? t("bible.navigator.title")
      : stage === "search"
        ? t("bible.navigator.search")
      : stage === "book"
        ? testament === "old"
          ? t("bible.navigator.oldTestament")
          : t("bible.navigator.newTestament")
        : stage === "chapter"
          ? displayBibleBookName(selectedBook, bookLanguage)
            : stage === "saved"
              ? t("bible.navigator.saved")
              : stage === "highlights"
                ? t("bible.navigator.highlights")
                : t("bible.navigator.reflections");

  function goBack() {
    if (stage === "chapter") {
      setStage(bookParentStage);
      return;
    }
    if (stage !== "home") {
      setStage("home");
      setBookQuery("");
      return;
    }
    closeWithAnimation();
  }

  function openBookList(nextTestament: TestamentFilter) {
    setTestament(nextTestament);
    setBookQuery("");
    setStage("book");
  }

  function openSearch() {
    setTestament("all");
    setBookQuery("");
    setStage("search");
  }

  function chooseBook(bookName: string) {
    const nextBook = kjvBooks.find((item) => item.name === bookName);
    if (!nextBook) return;
    setBookParentStage(stage === "search" ? "search" : "book");
    setSelectedBook(bookName);
    setStage("chapter");
  }

  function chooseChapter(chapter: number) {
    onSelect(normalizeBiblePosition({ book: selectedBook, chapter, verse: 1 }));
  }

  return (
    <AppSheet ref={sheetRef} onBack={goBack} visible={visible} onClose={onClose} height={sheetHeight} backgroundColor={palette.sheet} foregroundColor={palette.text}>
              <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          <BibleSheetTop
            bordered

            palette={palette}

          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, width: "100%" }}>
              <ReaderCircleButton
                accessibilityLabel={stage === "home" ? t("bible.navigator.close") : t("bible.navigator.back")}
                icon={stage === "home" ? "x" : "chevron-left"}
                onPress={goBack}
                palette={palette}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={2} style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>{title}</Text>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{stage === "home" ? `${chapterLabel(initialPosition, bookLanguage)} - ${versionLabel}` : versionLabel}</Text>
              </View>
            </View>
          </BibleSheetTop>

          <SheetScrollView
            ref={drawerScrollRef}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 18, padding: bibleSheetHorizontalPadding, paddingBottom: Math.max(28, insets.bottom + 20) }}
          >
            {stage === "home" ? (
              <>
                <DrawerSection title={t("bible.navigator.goTo")} palette={palette}>
                  <DrawerRow
                    icon="book-open"
                    onPress={() => openBookList("old")}
                    palette={palette}
                    subtitle={t("bible.navigator.oldTestamentRange")}
                    title={t("bible.navigator.oldTestament")}
                  />
                  <DrawerRow
                    icon="book"
                    onPress={() => openBookList("new")}
                    palette={palette}
                    subtitle={t("bible.navigator.newTestamentRange")}
                    title={t("bible.navigator.newTestament")}
                  />
                  <DrawerRow
                    icon="search"
                    onPress={openSearch}
                    palette={palette}
                    subtitle={t("bible.navigator.searchSubtitle")}
                    title={t("bible.navigator.search")}
                  />
                </DrawerSection>

                <DrawerSection title={t("bible.navigator.myPlaces")} palette={palette}>
                  <DrawerRow
                    icon="play-circle"
                    onPress={() => onSelect(initialPosition)}
                    palette={palette}
                    subtitle={referenceLabel(initialPosition, bookLanguage)}
                    title={t("bible.navigator.continue")}
                  />
                  <DrawerRow
                    icon="bookmark"
                    onPress={() => setStage("saved")}
                    palette={palette}
                    subtitle={savedVerses.length === 0
                      ? t("bible.navigator.saved.emptyCount")
                      : savedVerses.length === 1
                        ? t("bible.navigator.saved.single")
                        : t("bible.navigator.saved.count", { count: savedVerses.length })}
                    title={t("bible.navigator.saved")}
                  />
                  <DrawerRow
                    icon="edit-2"
                    onPress={() => setStage("highlights")}
                    palette={palette}
                    subtitle={recentHighlights.length === 0
                      ? t("bible.navigator.highlights.emptyCount")
                      : recentHighlights.length === 1
                        ? t("bible.navigator.highlights.single")
                        : t("bible.navigator.highlights.count", { count: recentHighlights.length })}
                    title={t("bible.navigator.highlights")}
                  />
                  <DrawerRow
                    icon="edit-3"
                    onPress={() => setStage("reflections")}
                    palette={palette}
                    subtitle={bibleReflections.length === 0
                      ? t("bible.navigator.reflections.emptyCount")
                      : bibleReflections.length === 1
                        ? t("bible.navigator.reflections.single")
                        : t("bible.navigator.reflections.count", { count: bibleReflections.length })}
                    title={t("bible.navigator.reflections")}
                  />
                  <DrawerRow
                    icon="calendar"
                    onPress={onOpenPlans}
                    palette={palette}
                    subtitle={biblePlanCount === 0
                      ? t("bible.navigator.plans.empty")
                      : biblePlanCount === 1
                        ? t("bible.navigator.plans.single")
                        : t("bible.navigator.plans.count", { count: biblePlanCount })}
                    title={t("bible.navigator.plans")}
                  />
                </DrawerSection>
              </>
            ) : null}

            {stage === "search" ? (
              <>
                <DrawerSearchBox
                  onChangeText={setBookQuery}
                  onSubmit={() => searchPosition && onSelect(searchPosition)}
                  palette={palette}
                  placeholder={t("bible.navigator.searchPlaceholder")}
                  value={bookQuery}
                />
                {!normalizedQuery ? (
                  <>
                    <DrawerRow
                      icon="compass"
                      onPress={() => onOpenTopic()}
                      palette={palette}
                      subtitle={t("bible.topics.exploreSubtitle")}
                      title={t("bible.topics.explore")}
                    />
                    <DrawerEmptyState palette={palette} text={t("bible.navigator.searchIntro")} />
                  </>
                ) : null}
                {searchPosition ? (
                  <DrawerRow
                    icon="search"
                    onPress={() => onSelect(searchPosition)}
                    palette={palette}
                    subtitle={t("bible.navigator.openPassageSubtitle")}
                    title={t("bible.navigator.openPassage", { reference: referenceLabel(searchPosition, bookLanguage) })}
                  />
                ) : null}
                {normalizedQuery && !searchPosition && selectableBooks.length ? (
                  <View style={{ gap: 8 }}>
                    {selectableBooks.slice(0, 12).map((item) => (
                      <DrawerBookRow
                        key={item.name}
                        book={item}
                        language={language}
                        onPress={() => chooseBook(item.name)}
                        palette={palette}
                        selected={item.name === initialPosition.book}
                        t={t}
                      />
                    ))}
                  </View>
                ) : null}
                {matchingTopics.length ? (
                  <DrawerSection title={t("bible.topics.suggested")} palette={palette}>
                    {matchingTopics.map((topic) => (
                      <DrawerRow
                        icon="compass"
                        key={topic.apiTopic}
                        onPress={() => onOpenTopic(topic.apiTopic)}
                        palette={palette}
                        subtitle={t(topic.subtitleKey)}
                        title={t(topic.titleKey)}
                      />
                    ))}
                  </DrawerSection>
                ) : null}
                {phraseSearchEligible && phraseSearchLoading ? (
                  <View style={{ alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 8 }}>
                    <ActivityIndicator color={palette.accent} size="small" />
                    <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700" }}>
                      {t("bible.navigator.searchingText", { translation: versionLabel })}
                    </Text>
                  </View>
                ) : null}
                {phraseSearchEligible && !phraseSearchLoading && phraseSearchResults.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {phraseSearchResults.map((result) => (
                      <DrawerVerseRow
                        key={`${bibleVersionId}-${result.reference}`}
                        meta={versionLabel}
                        onPress={() => onSelect(result.position)}
                        palette={palette}
                        reference={displayBibleReference(result.reference, bookLanguage)}
                        text={result.text}
                      />
                    ))}
                  </View>
                ) : null}
                {phraseSearchEligible && !phraseSearchLoading && phraseSearchResults.length === 0 ? (
                  <DrawerEmptyState palette={palette} text={t("bible.navigator.searchTextNoResults")} />
                ) : null}
              </>
            ) : null}

            {stage === "book" ? (
              <>
                <DrawerSearchBox
                  onChangeText={setBookQuery}
                  onSubmit={() => undefined}
                  palette={palette}
                  placeholder={t("bible.navigator.filterBooks")}
                  value={bookQuery}
                />
                <View style={{ gap: 8 }}>
                  {selectableBooks.length > 0 ? (
                    selectableBooks.map((item) => (
                      <DrawerBookRow
                        key={item.name}
                        book={item}
                        language={language}
                        onPress={() => chooseBook(item.name)}
                        palette={palette}
                        selected={item.name === initialPosition.book}
                        t={t}
                      />
                    ))
                  ) : (
                    <DrawerEmptyState palette={palette} text={t("bible.navigator.noBooks")} />
                  )}
                </View>
              </>
            ) : null}

            {stage === "chapter" ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" }}>{t("bible.navigator.chapter")}</Text>
                <PickerGrid
                  palette={palette}
                  selected={initialPosition.book === selectedBook ? initialPosition.chapter : undefined}
                  values={book?.chapters ?? []}
                  onSelect={chooseChapter}
                />
              </View>
            ) : null}

            {stage === "saved" ? (
              <View style={{ gap: 8 }}>
                {visibleSavedVerses.length ? (
                  visibleSavedVerses.map((verse) => (
                    <DrawerVerseRow
                      action={(
                        <Pressable
                          accessibilityLabel={t("bible.saved.actions.more", { reference: displayBibleReference(verse.reference, bookLanguage, verse.translation) })}
                          accessibilityRole="button"
                          onPress={() => setSavedVerseMenu(verse)}
                          style={{
                            alignItems: "center",
                            backgroundColor: palette.input,
                            borderColor: palette.line,
                            borderRadius: 999,
                            borderWidth: 1,
                            height: 40,
                            justifyContent: "center",
                            width: 40,
                          }}
                        >
                          <Feather name="more-horizontal" size={18} color={palette.accent} />
                        </Pressable>
                      )}
                      key={verse.id}
                      onPress={() => openSavedVerse(verse)}
                      palette={palette}
                      reference={displayBibleReference(verse.reference, bookLanguage, verse.translation)}
                      showArrow={false}
                      meta={verse.translation && verse.translation !== versionLabel ? verse.translation : undefined}
                      text={verse.text}
                    />
                  ))
                ) : (
                  <DrawerEmptyState palette={palette} text={t("bible.navigator.saved.empty")} />
                )}
              </View>
            ) : null}

            {stage === "highlights" ? (
              <View style={{ gap: 8 }}>
                {recentHighlights.length ? (
                  recentHighlights.map((highlight) => {
                    const preview = buildBibleVerse(highlight.book, highlight.chapter, highlight.startVerse, highlight.endVerse, bibleVersionId)?.text;
                    return (
                      <DrawerVerseRow
                        accentColor={highlight.color}
                        key={highlight.id}
                        onPress={() => onSelect(normalizeBiblePosition({ book: highlight.book, chapter: highlight.chapter, verse: highlight.startVerse }))}
                        palette={palette}
                        reference={displayBibleReference(highlight.reference, bookLanguage)}
                        meta={highlight.translation && highlight.translation !== versionLabel ? highlight.translation : undefined}
                        text={preview}
                      />
                    );
                  })
                ) : (
                  <DrawerEmptyState palette={palette} text={t("bible.navigator.highlights.empty")} />
                )}
              </View>
            ) : null}

            {stage === "reflections" ? (
              <View style={{ gap: 8 }}>
                {bibleReflections.length ? (
                  bibleReflections.map((entry) => {
                    const verse = entry.verses?.[0] ?? entry.verse;
                    return (
                      <DrawerVerseRow
                        key={entry.id}
                        onPress={() => onOpenReflection(entry.id)}
                        palette={palette}
                        reference={displayBibleReference(verse?.reference ?? entry.passage?.reference ?? entry.title ?? t("bible.navigator.reflectionFallback"), bookLanguage)}
                        text={entry.body}
                      />
                    );
                  })
                ) : (
                  <DrawerEmptyState palette={palette} text={t("bible.navigator.reflections.empty")} />
                )}
              </View>
            ) : null}
          </SheetScrollView>
        </View>

      <SavedVerseActionSheet
        onClose={() => setSavedVerseMenu(undefined)}
        onOpen={openSavedVerse}
        onRemove={removeSavedVerse}
        palette={palette}
        verse={savedVerseMenu}
      />
    </AppSheet>
  );
}
