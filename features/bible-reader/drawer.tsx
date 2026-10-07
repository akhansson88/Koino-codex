import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { AppSheet, type AppSheetHandle } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { type ReaderPalette, type PickerStage } from "@/features/bible-reader/types";
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
import { SavedVerseAudioControl } from "@/features/bible-audio/saved-verse-audio";
import { useBibleAudio } from "@/features/bible-audio/provider";

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
  initialStage: "home" | "myPlaces" | "search";
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
  const { refresh: refreshAudioCatalog } = useBibleAudio();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(height * 0.84), 720);
  const sheetRef = useRef<AppSheetHandle>(null);
  const drawerScrollRef = useRef<ScrollView>(null);
  const phraseSearchRequestRef = useRef(0);
  const [stage, setStage] = useState<PickerStage>(initialStage === "home" ? "book" : initialStage);
  useEffect(() => {
    if (visible && stage === "saved") void refreshAudioCatalog();
  }, [refreshAudioCatalog, stage, visible]);
  const [bookQuery, setBookQuery] = useState("");
  const [bookParentStage, setBookParentStage] = useState<"book" | "search">("book");
  const [selectedBook, setSelectedBook] = useState(initialPosition.book);
  const bookScrollOffset = useRef(0);
  const bookOffsets = useRef<Record<string, number>>({});
  const pendingBookScroll = useRef<number | "current" | null>("current");
  const bookContentReady = useRef(false);
  const bookViewportReady = useRef(false);
  const bookScrollFrame = useRef<number | undefined>(undefined);

  // Native row measurements account for translated names and larger text sizes.
  // Consume the pending target once so later layouts never undo user scrolling.
  const restoreBookScroll = useCallback(() => {
    if (pendingBookScroll.current === null) return;
    if (bookScrollFrame.current !== undefined) cancelAnimationFrame(bookScrollFrame.current);
    bookScrollFrame.current = requestAnimationFrame(() => {
      const pending = pendingBookScroll.current;
      if (pending === null || !bookContentReady.current || !bookViewportReady.current) return;
      const y = pending === "current" ? bookOffsets.current[initialPosition.book] : pending;
      if (y === undefined || !drawerScrollRef.current) return;
      drawerScrollRef.current.scrollTo({ animated: false, y: Math.max(0, y) });
      bookScrollOffset.current = Math.max(0, y);
      pendingBookScroll.current = null;
    });
  }, [initialPosition.book]);

  useLayoutEffect(() => {
    bookContentReady.current = false;
    bookViewportReady.current = false;
    return () => {
      if (bookScrollFrame.current !== undefined) cancelAnimationFrame(bookScrollFrame.current);
    };
  }, [stage, visible]);
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


  useLayoutEffect(() => {
    if (!visible) return;
    const normalized = normalizeBiblePosition(initialPosition);
    setStage(initialStage === "home" ? "book" : initialStage);
    setBookQuery("");
    setBookParentStage(initialStage === "search" ? "search" : "book");
    setSelectedBook(normalized.book);
    pendingBookScroll.current = "current";
    bookOffsets.current = {};
    bookScrollOffset.current = 0;
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
    if (!visible || stage === "book") return;
    const frame = requestAnimationFrame(() => drawerScrollRef.current?.scrollTo({ animated: false, y: 0 }));
    return () => cancelAnimationFrame(frame);
  }, [stage, visible]);

  const book = kjvBooks.find((item) => item.name === selectedBook) ?? kjvBooks[0];
  const normalizedQuery = bookQuery.trim().toLocaleLowerCase(language);
  const searchPosition = biblePositionFromSearchQuery(bookQuery, language, bibleVersionId);
  const selectableBooks = kjvBooks.filter((item) => {
    const displayName = displayBibleBookName(item.name, bookLanguage).toLocaleLowerCase(language);
    const matchesQuery = !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery) || displayName.includes(normalizedQuery);
    return matchesQuery;
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
  const isRootStage = stage === "book" || stage === "myPlaces";
  const title =
    stage === "book"
      ? t("bible.navigator.title")
      : stage === "myPlaces"
        ? t("bible.navigator.myPlaces")
      : stage === "search"
        ? t("bible.navigator.search")
        : stage === "chapter"
          ? displayBibleBookName(selectedBook, bookLanguage)
            : stage === "saved"
              ? t("bible.navigator.saved")
              : stage === "highlights"
                ? t("bible.navigator.highlights")
                : t("bible.navigator.reflections");

  function goBack() {
    if (stage === "saved" || stage === "highlights" || stage === "reflections") {
      setStage("myPlaces");
      return;
    }
    if (stage === "chapter") {
      if (bookParentStage === "book") pendingBookScroll.current = bookScrollOffset.current;
      setStage(bookParentStage);
      return;
    }
    if (!isRootStage) {
      pendingBookScroll.current = "current";
      setStage("book");
      setBookQuery("");
      return;
    }
    closeWithAnimation();
  }

  function filterBooks(query: string) {
    pendingBookScroll.current = 0;
    setBookQuery(query);
    restoreBookScroll();
    drawerScrollRef.current?.scrollTo({ animated: false, y: 0 });
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
    <AppSheet ref={sheetRef} contentPanning={false} onBack={goBack} visible={visible} onClose={onClose} height={sheetHeight} backgroundColor={palette.sheet} foregroundColor={palette.text}>
              <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          <BibleSheetTop
            bordered

            palette={palette}

          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, width: "100%" }}>
              <ReaderCircleButton
                accessibilityLabel={isRootStage ? t("bible.navigator.close") : t("bible.navigator.back")}
                icon={isRootStage ? "x" : "chevron-left"}
                onPress={goBack}
                palette={palette}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={2} style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>{title}</Text>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{stage === "book" ? `${chapterLabel(initialPosition, bookLanguage)} - ${versionLabel}` : versionLabel}</Text>
              </View>
            </View>
          </BibleSheetTop>

          {stage === "book" ? (
            <View style={{ paddingHorizontal: bibleSheetHorizontalPadding, paddingTop: 12, paddingBottom: 8 }}>
              <DrawerSearchBox
                onChangeText={filterBooks}
                onSubmit={() => undefined}
                palette={palette}
                placeholder={t("bible.navigator.filterBooks")}
                value={bookQuery}
              />
            </View>
          ) : null}
          {/* This fixed-height drawer scrolls independently of the sheet's animated scroll controller. */}
          <ScrollView
            key={stage}
            ref={drawerScrollRef}
            style={{ flex: 1, minHeight: 0 }}
            nestedScrollEnabled
            keyboardDismissMode="on-drag"
            onContentSizeChange={stage === "book" ? (_width, contentHeight) => {
              bookContentReady.current = contentHeight > 0;
              restoreBookScroll();
            } : undefined}
            onLayout={stage === "book" ? ({ nativeEvent }) => {
              // The sheet can briefly report its intrinsic content height while opening.
              // Wait for its bounded viewport before restoring a book position.
              bookViewportReady.current = nativeEvent.layout.height > 0 && nativeEvent.layout.height <= sheetHeight;
              restoreBookScroll();
            } : undefined}
            onScroll={stage === "book" ? ({ nativeEvent }) => {
              if (pendingBookScroll.current === null) bookScrollOffset.current = nativeEvent.contentOffset.y;
            } : undefined}
            scrollEventThrottle={16}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: stage === "book" ? 8 : 18, padding: bibleSheetHorizontalPadding, paddingBottom: Math.max(28, insets.bottom + 20) }}
          >
            {stage === "myPlaces" ? (
              <>
                <DrawerSection title={t("bible.navigator.myPlaces")} palette={palette}>
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
                {(["old", "new"] as const).map((section) => {
                  const books = selectableBooks.filter((item) => testamentForBook(item.name) === section);
                  if (!books.length) return null;
                  return [
                    <Text
                      key={section}
                      accessibilityRole="header"
                      style={{ color: palette.muted, fontSize: 13, fontWeight: "900", paddingTop: 12, paddingBottom: 4, borderTopWidth: section === "new" ? 1 : 0, borderTopColor: palette.line }}
                    >
                      {t(section === "old" ? "bible.navigator.oldTestament" : "bible.navigator.newTestament")}
                    </Text>,
                    ...books.map((item) => (
                      <View key={item.name} onLayout={({ nativeEvent }) => {
                        bookOffsets.current[item.name] = nativeEvent.layout.y;
                        restoreBookScroll();
                      }}>
                        <DrawerBookRow
                          book={item}
                          language={language}
                          onPress={() => chooseBook(item.name)}
                          palette={palette}
                          selected={item.name === initialPosition.book}
                          t={t}
                        />
                      </View>
                    )),
                  ];
                })}
                {!selectableBooks.length ? <DrawerEmptyState palette={palette} text={t("bible.navigator.noBooks")} /> : null}
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
                          hitSlop={4}
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
                      fullText
                      footer={<SavedVerseAudioControl verse={verse} reference={displayBibleReference(verse.reference, bookLanguage, verse.translation)} palette={palette} />}
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
          </ScrollView>
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
