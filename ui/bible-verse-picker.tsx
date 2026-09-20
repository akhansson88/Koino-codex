/* Hallmark · component: scripture picker · genre: editorial · theme: Koino
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50) · pre-emit critique: P5 H5 E4 S5 R5 V4
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BibleDatabaseProvider } from "@/features/bible-database-provider";
import {
  displayBibleBookName,
  displayBibleReference,
  normalizeScriptureQuery,
  resolveBibleReference,
  searchScripture,
  type ScriptureSearchResult,
} from "@/features/bible-search";
import {
  bibleChapterVerses,
  bibleVersionFor,
  buildBibleVerse,
  kjvBooks,
  type BibleChapterVerse,
  type BibleVersionId,
} from "@/features/bible-kjv";
import { nextBibleVerseSelection } from "@/features/bible-verse-selection";
import type { BibleVerse } from "@/state/types";
import { FullScreenModal, IconButton, PrimaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, typography } from "@/ui/theme";

const SCRIPTURE_SEARCH_DEBOUNCE_MS = 180;
const SCRIPTURE_SEARCH_MIN_LENGTH = 3;
const SCRIPTURE_SEARCH_RESULT_LIMIT = 8;
const OLD_TESTAMENT_BOOK_COUNT = 39;

type BrowseStep = "books" | "chapters" | "verses";

type BibleVersePickerProps = {
  bibleVersionId: BibleVersionId;
  onBack: () => void;
  onSelect: (verse: BibleVerse) => void;
  visible: boolean;
};

export function BibleVersePicker(props: BibleVersePickerProps) {
  return (
    <BibleDatabaseProvider>
      <BibleVersePickerContent {...props} />
    </BibleDatabaseProvider>
  );
}

function BibleVersePickerContent({ bibleVersionId, onBack, onSelect, visible }: BibleVersePickerProps) {
  const insets = useSafeAreaInsets();
  const { language, t } = useAppTranslation();
  const firstBook = kjvBooks[0];
  const [browseStep, setBrowseStep] = useState<BrowseStep>("books");
  const [scriptureQuery, setScriptureQuery] = useState("");
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState(firstBook?.name ?? "Genesis");
  const [selectedChapter, setSelectedChapter] = useState(firstBook?.chapters[0] ?? 1);
  const [selectionStart, setSelectionStart] = useState<number>();
  const [selectionEnd, setSelectionEnd] = useState<number>();
  const [pendingScrollVerse, setPendingScrollVerse] = useState<number>();
  const [searchResultState, setSearchResultState] = useState<{ key: string; results: ScriptureSearchResult[] }>();
  const [searchingKey, setSearchingKey] = useState<string>();
  const [completedSearchKey, setCompletedSearchKey] = useState<string>();
  const [searchErrorKey, setSearchErrorKey] = useState<string>();
  const [searchRetry, setSearchRetry] = useState(0);
  const searchRequestRef = useRef(0);
  const verseListRef = useRef<FlatList<BibleChapterVerse>>(null);

  const book = kjvBooks.find((item) => item.name === selectedBook) ?? firstBook;
  const chapterVerses = useMemo(
    () => bibleChapterVerses(selectedBook, selectedChapter, bibleVersionId),
    [bibleVersionId, selectedBook, selectedChapter],
  );
  const preview = selectionStart !== undefined
    ? buildBibleVerse(selectedBook, selectedChapter, selectionStart, selectionEnd ?? selectionStart, bibleVersionId)
    : undefined;
  const bibleVersion = bibleVersionFor(bibleVersionId);
  const normalizedScriptureQuery = normalizeScriptureQuery(scriptureQuery);
  const normalizedSearchLength = normalizedScriptureQuery.replace(/[^\p{L}\p{N}]/gu, "").length;
  const isDirectReference = Boolean(
    normalizedScriptureQuery && resolveBibleReference(normalizedScriptureQuery, language, bibleVersionId),
  );
  const canSearchScripture = isDirectReference || normalizedSearchLength >= SCRIPTURE_SEARCH_MIN_LENGTH;
  const searchKey = `${language}|${bibleVersionId}|${normalizedScriptureQuery}|${searchRetry}`;
  const currentSearchResults = searchResultState?.key === searchKey ? searchResultState.results : [];
  const isSearching = searchingKey === searchKey;
  const hasCompletedSearch = completedSearchKey === searchKey;
  const hasSearchError = searchErrorKey === searchKey;
  const isShowingSearch = normalizedScriptureQuery.length > 0;

  const filteredBooks = useMemo(() => {
    const locale = language === "sv" ? "sv" : "en";
    const query = bookQuery.trim().toLocaleLowerCase(locale);
    if (!query) return kjvBooks;
    return kjvBooks.filter((item) => {
      const localized = displayBibleBookName(item.name, language).toLocaleLowerCase(locale);
      return localized.includes(query) || item.name.toLowerCase().includes(query);
    });
  }, [bookQuery, language]);

  useEffect(() => {
    if (visible) return;
    searchRequestRef.current += 1;
    setBrowseStep("books");
    setScriptureQuery("");
    setBookQuery("");
    setSelectedBook(firstBook?.name ?? "Genesis");
    setSelectedChapter(firstBook?.chapters[0] ?? 1);
    setSelectionStart(undefined);
    setSelectionEnd(undefined);
    setPendingScrollVerse(undefined);
    setSearchResultState(undefined);
    setSearchingKey(undefined);
    setCompletedSearchKey(undefined);
    setSearchErrorKey(undefined);
    setSearchRetry(0);
  }, [firstBook, visible]);

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

    if (isDirectReference) void runSearch();
    else searchTimer = setTimeout(() => void runSearch(), SCRIPTURE_SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      if (searchTimer) clearTimeout(searchTimer);
    };
  }, [bibleVersionId, canSearchScripture, isDirectReference, language, normalizedScriptureQuery, searchKey, visible]);

  useEffect(() => {
    if (browseStep !== "verses" || pendingScrollVerse === undefined || chapterVerses.length === 0) return;
    const index = chapterVerses.findIndex((verse) => verse.verse === pendingScrollVerse);
    if (index < 0) return;
    const timer = setTimeout(() => {
      verseListRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0.18 });
      setPendingScrollVerse(undefined);
    }, 80);
    return () => clearTimeout(timer);
  }, [browseStep, chapterVerses, pendingScrollVerse]);

  function chooseBook(name: string) {
    const nextBook = kjvBooks.find((item) => item.name === name);
    setSelectedBook(name);
    setSelectedChapter(nextBook?.chapters[0] ?? 1);
    setSelectionStart(undefined);
    setSelectionEnd(undefined);
    setBookQuery("");
    setBrowseStep("chapters");
  }

  function chooseChapter(chapter: number) {
    setSelectedChapter(chapter);
    setSelectionStart(undefined);
    setSelectionEnd(undefined);
    setBrowseStep("verses");
  }

  function chooseVerse(verseNumber: number) {
    const nextSelection = nextBibleVerseSelection({ end: selectionEnd, start: selectionStart }, verseNumber);
    setSelectionStart(nextSelection.start);
    setSelectionEnd(nextSelection.end);
  }

  function openSearchResult(result: ScriptureSearchResult) {
    const { book: resultBook, chapter, startVerse, endVerse } = result.verse;
    if (!resultBook || !chapter || !startVerse) return;
    setSelectedBook(resultBook);
    setSelectedChapter(chapter);
    setSelectionStart(startVerse);
    setSelectionEnd(endVerse ?? startVerse);
    setPendingScrollVerse(startVerse);
    setBrowseStep("verses");
    setScriptureQuery("");
  }

  function goToBooks() {
    setBrowseStep("books");
    setSelectionStart(undefined);
    setSelectionEnd(undefined);
  }

  function goToChapters() {
    setBrowseStep("chapters");
    setSelectionStart(undefined);
    setSelectionEnd(undefined);
  }

  const displayReference = preview ? displayBibleReference(preview.reference, language) : undefined;

  return (
    <FullScreenModal animationType="slide" visible={visible} onRequestClose={onBack}>
      <View style={{ backgroundColor: colors.cream, flex: 1, paddingTop: insets.top }}>
        <View style={{ backgroundColor: colors.cream, gap: 14, paddingHorizontal: 18, paddingBottom: 14, paddingTop: 14 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text numberOfLines={1} style={[typography.heading, { color: colors.ink, fontSize: 20, lineHeight: 26 }]}>
                {t("shared.scripturePicker.title")}
              </Text>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>{bibleVersion.label}</Text>
            </View>
            <IconButton accessibilityLabel={t("shared.scripturePicker.close")} icon="x" onPress={onBack} />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[typography.label, { color: colors.ink }]}>{t("shared.scripturePicker.searchLabel")}</Text>
            <View style={{ position: "relative" }}>
              <TextInputField
                accessibilityLabel={t("shared.scripturePicker.searchAccessibility")}
                autoCapitalize="none"
                onChangeText={(value) => {
                  setScriptureQuery(value);
                  setSearchRetry(0);
                }}
                placeholder={t("shared.scripturePicker.searchPlaceholder")}
                returnKeyType="search"
                style={{ paddingRight: 50 }}
                value={scriptureQuery}
              />
              {scriptureQuery ? (
                <Pressable
                  accessibilityLabel={t("shared.scripturePicker.clearSearch")}
                  accessibilityRole="button"
                  hitSlop={4}
                  onPress={() => setScriptureQuery("")}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    height: 44,
                    justifyContent: "center",
                    opacity: pressed ? 0.55 : 1,
                    position: "absolute",
                    right: 3,
                    top: 3,
                    width: 44,
                  })}
                >
                  <Feather color={colors.muted} name="x" size={18} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {!isShowingSearch ? (
            <BrowseTrail
              browseStep={browseStep}
              bookName={displayBibleBookName(selectedBook, language)}
              chapter={selectedChapter}
              onBooks={goToBooks}
              onChapters={goToChapters}
              t={t}
            />
          ) : null}
        </View>

        <View style={{ borderTopColor: colors.line, borderTopWidth: 1, flex: 1 }}>
          {isShowingSearch ? (
            <SearchResults
              canSearch={canSearchScripture}
              hasCompleted={hasCompletedSearch}
              hasError={hasSearchError}
              isSearching={isSearching}
              language={language}
              onClear={() => setScriptureQuery("")}
              onRetry={() => setSearchRetry((value) => value + 1)}
              onSelect={openSearchResult}
              results={currentSearchResults}
              t={t}
            />
          ) : browseStep === "books" ? (
            <BookBrowser
              bookQuery={bookQuery}
              books={filteredBooks}
              language={language}
              onBookQuery={setBookQuery}
              onSelect={chooseBook}
              t={t}
            />
          ) : browseStep === "chapters" ? (
            <ChapterBrowser chapters={book?.chapters ?? []} onSelect={chooseChapter} t={t} />
          ) : (
            <VerseBrowser
              chapterVerses={chapterVerses}
              listRef={verseListRef}
              onSelect={chooseVerse}
              selectionEnd={selectionEnd}
              selectionStart={selectionStart}
              t={t}
            />
          )}
        </View>

        {!isShowingSearch && browseStep === "verses" ? (
          <View
            style={{
              backgroundColor: colors.paper,
              borderTopColor: colors.line,
              borderTopWidth: 1,
              gap: 10,
              paddingBottom: Math.max(insets.bottom, 12),
              paddingHorizontal: 18,
              paddingTop: 12,
            }}
          >
            <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 10, justifyContent: "space-between" }}>
              <Text numberOfLines={1} style={[typography.label, { color: colors.muted, flex: 1 }]}>
                {preview ? t("shared.scripturePicker.selected") : t("shared.scripturePicker.noSelection")}
              </Text>
              {displayReference ? (
                <Text numberOfLines={1} style={[typography.label, { color: colors.olive, flexShrink: 1 }]}>{displayReference}</Text>
              ) : null}
            </View>
            <PrimaryButton disabled={!preview} icon="plus" onPress={() => preview && onSelect(preview)}>
              {preview
                ? t("shared.scripturePicker.addReference", { reference: displayReference ?? preview.reference })
                : t("shared.scripturePicker.selectToAdd")}
            </PrimaryButton>
          </View>
        ) : null}
      </View>
    </FullScreenModal>
  );
}

function BrowseTrail({ bookName, browseStep, chapter, onBooks, onChapters, t }: {
  bookName: string;
  browseStep: BrowseStep;
  chapter: number;
  onBooks: () => void;
  onChapters: () => void;
  t: ReturnType<typeof useAppTranslation>["t"];
}) {
  return (
    <View accessibilityRole="tablist" style={{ alignItems: "center", flexDirection: "row", gap: 6, minHeight: 32 }}>
      <TrailButton active={browseStep === "books"} label={t("shared.scripturePicker.books")} onPress={onBooks} />
      {browseStep !== "books" ? (
        <>
          <Feather color={colors.muted} name="chevron-right" size={15} />
          <TrailButton active={browseStep === "chapters"} label={bookName} onPress={onChapters} />
        </>
      ) : null}
      {browseStep === "verses" ? (
        <>
          <Feather color={colors.muted} name="chevron-right" size={15} />
          <Text numberOfLines={1} style={[typography.label, { color: colors.olive, flexShrink: 1 }]}>
            {t("shared.scripturePicker.chapterNumber", { chapter })}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function TrailButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radius.sm,
        justifyContent: "center",
        maxWidth: "44%",
        minHeight: 44,
        opacity: pressed ? 0.58 : 1,
        paddingHorizontal: 4,
      })}
    >
      <Text numberOfLines={1} style={[typography.label, { color: active ? colors.ink : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

function BookBrowser({ bookQuery, books, language, onBookQuery, onSelect, t }: {
  bookQuery: string;
  books: typeof kjvBooks;
  language: "en" | "sv";
  onBookQuery: (value: string) => void;
  onSelect: (book: string) => void;
  t: ReturnType<typeof useAppTranslation>["t"];
}) {
  const oldTestament = books.filter((item) => kjvBooks.indexOf(item) < OLD_TESTAMENT_BOOK_COUNT);
  const newTestament = books.filter((item) => kjvBooks.indexOf(item) >= OLD_TESTAMENT_BOOK_COUNT);
  return (
    <ScrollView contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={{ gap: 5 }}>
        <Text style={[typography.title, { color: colors.ink }]}>{t("shared.scripturePicker.chooseBook")}</Text>
        <Text style={[typography.body, { color: colors.muted }]}>{t("shared.scripturePicker.chooseBookHelp")}</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[typography.label, { color: colors.ink }]}>{t("shared.scripturePicker.filterBooks")}</Text>
        <TextInputField accessibilityLabel={t("shared.scripturePicker.filterBooks")} onChangeText={onBookQuery} placeholder={t("shared.scripturePicker.searchBooks")} value={bookQuery} />
      </View>
      <BookSection label={t("shared.scripturePicker.oldTestament")} books={oldTestament} language={language} onSelect={onSelect} />
      <BookSection label={t("shared.scripturePicker.newTestament")} books={newTestament} language={language} onSelect={onSelect} />
      {books.length === 0 ? (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 28 }}>
          <Feather color={colors.muted} name="book" size={24} />
          <Text style={[typography.body, { color: colors.muted, textAlign: "center" }]}>{t("shared.scripturePicker.noBooks")}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function BookSection({ books, label, language, onSelect }: {
  books: typeof kjvBooks;
  label: string;
  language: "en" | "sv";
  onSelect: (book: string) => void;
}) {
  if (books.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={[typography.sectionLabel, { color: colors.muted }]}>{label}</Text>
      <View style={{ backgroundColor: colors.paper, borderColor: colors.line, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" }}>
        {books.map((item, index) => (
          <Pressable
            accessibilityRole="button"
            key={item.name}
            onPress={() => onSelect(item.name)}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: pressed ? colors.accentSubtle : colors.paper,
              borderTopColor: colors.line,
              borderTopWidth: index === 0 ? 0 : 1,
              flexDirection: "row",
              minHeight: 52,
              paddingHorizontal: 14,
            })}
          >
            <Text numberOfLines={1} style={[typography.bodyMedium, { color: colors.ink, flex: 1 }]}>{displayBibleBookName(item.name, language)}</Text>
            <Feather color={colors.muted} name="chevron-right" size={17} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ChapterBrowser({ chapters, onSelect, t }: { chapters: number[]; onSelect: (chapter: number) => void; t: ReturnType<typeof useAppTranslation>["t"] }) {
  return (
    <ScrollView contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: 5 }}>
        <Text style={[typography.title, { color: colors.ink }]}>{t("shared.scripturePicker.chooseChapter")}</Text>
        <Text style={[typography.body, { color: colors.muted }]}>{t("shared.scripturePicker.chooseChapterHelp")}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {chapters.map((chapter) => (
          <Pressable
            accessibilityLabel={t("shared.scripturePicker.chapterNumber", { chapter })}
            accessibilityRole="button"
            key={chapter}
            onPress={() => onSelect(chapter)}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: pressed ? colors.accentSubtle : colors.paper,
              borderColor: colors.line,
              borderRadius: radius.md,
              borderWidth: 1,
              flexBasis: "21%",
              flexGrow: 1,
              height: 52,
              justifyContent: "center",
              minWidth: 58,
            })}
          >
            <Text style={[typography.bodyMedium, { color: colors.ink }]}>{chapter}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function VerseBrowser({ chapterVerses, listRef, onSelect, selectionEnd, selectionStart, t }: {
  chapterVerses: BibleChapterVerse[];
  listRef: React.RefObject<FlatList<BibleChapterVerse> | null>;
  onSelect: (verse: number) => void;
  selectionEnd?: number;
  selectionStart?: number;
  t: ReturnType<typeof useAppTranslation>["t"];
}) {
  return (
    <FlatList
      ListHeaderComponent={
        <View style={{ gap: 5, paddingBottom: 12 }}>
          <Text style={[typography.title, { color: colors.ink }]}>{t("shared.scripturePicker.selectVerses")}</Text>
          <Text style={[typography.body, { color: colors.muted }]}>{t("shared.scripturePicker.rangeHelp")}</Text>
        </View>
      }
      contentContainerStyle={{ padding: 18, paddingBottom: 34 }}
      data={chapterVerses}
      keyExtractor={(item) => String(item.verse)}
      onScrollToIndexFailed={({ averageItemLength, index }) => listRef.current?.scrollToOffset({ animated: false, offset: Math.max(0, averageItemLength * index) })}
      ref={listRef}
      renderItem={({ item }) => {
        const isSelected = selectionStart !== undefined && item.verse >= selectionStart && item.verse <= (selectionEnd ?? selectionStart);
        const isBoundary = isSelected && (item.verse === selectionStart || item.verse === selectionEnd);
        return (
          <Pressable
            accessibilityLabel={`${item.verse}. ${item.text}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(item.verse)}
            style={({ pressed }) => ({
              backgroundColor: isSelected ? colors.accentSubtle : pressed ? colors.elevated : colors.cream,
              borderColor: isBoundary ? colors.gold : "transparent",
              borderRadius: radius.md,
              borderWidth: 1,
              flexDirection: "row",
              gap: 12,
              marginBottom: 4,
              minHeight: 54,
              paddingHorizontal: 12,
              paddingVertical: 11,
            })}
          >
            <View style={{ alignItems: "center", backgroundColor: isSelected ? colors.gold : colors.paper, borderColor: isSelected ? colors.gold : colors.line, borderRadius: 999, borderWidth: 1, height: 30, justifyContent: "center", width: 30 }}>
              {isSelected ? <Feather color={colors.onAccent} name="check" size={14} /> : <Text style={[typography.caption, { color: colors.muted }]}>{item.verse}</Text>}
            </View>
            <Text style={[typography.body, { color: colors.ink, flex: 1, fontSize: 16, lineHeight: 25 }]}>{item.text}</Text>
          </Pressable>
        );
      }}
      showsVerticalScrollIndicator={false}
    />
  );
}

function SearchResults({ canSearch, hasCompleted, hasError, isSearching, language, onClear, onRetry, onSelect, results, t }: {
  canSearch: boolean;
  hasCompleted: boolean;
  hasError: boolean;
  isSearching: boolean;
  language: "en" | "sv";
  onClear: () => void;
  onRetry: () => void;
  onSelect: (result: ScriptureSearchResult) => void;
  results: ScriptureSearchResult[];
  t: ReturnType<typeof useAppTranslation>["t"];
}) {
  return (
    <ScrollView contentContainerStyle={{ gap: 10, padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {!canSearch ? (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 34 }}>
          <Feather color={colors.muted} name="search" size={25} />
          <Text style={[typography.body, { color: colors.muted, textAlign: "center" }]}>{t("shared.scripturePicker.searchHint")}</Text>
        </View>
      ) : null}
      {isSearching ? (
        <View accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={{ alignItems: "center", gap: 10, paddingVertical: 34 }}>
          <ActivityIndicator color={colors.olive} size="small" />
          <Text style={[typography.body, { color: colors.muted }]}>{t("shared.scripturePicker.searching")}</Text>
        </View>
      ) : null}
      {results.map((result) => (
        <Pressable
          accessibilityLabel={t("shared.scripturePicker.resultAccessibility", { reference: displayBibleReference(result.verse.reference, language), text: result.verse.text })}
          accessibilityRole="button"
          key={`${result.verse.reference}-${result.verse.text}`}
          onPress={() => onSelect(result)}
          style={({ pressed }) => ({ backgroundColor: pressed ? colors.accentSubtle : colors.paper, borderColor: colors.line, borderRadius: radius.lg, borderWidth: 1, gap: 6, minHeight: 78, paddingHorizontal: 14, paddingVertical: 12 })}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <Text numberOfLines={1} style={[typography.label, { color: colors.olive, flex: 1 }]}>{displayBibleReference(result.verse.reference, language)}</Text>
            <Feather color={colors.muted} name="chevron-right" size={17} />
          </View>
          <Text numberOfLines={3} style={[typography.body, { color: colors.ink, fontSize: 14, lineHeight: 21 }]}>{result.verse.text}</Text>
        </Pressable>
      ))}
      {hasCompleted && !hasError && results.length === 0 ? (
        <SearchEmpty icon="book-open" message={t("shared.scripturePicker.noSearchResults")} action={t("shared.scripturePicker.clearSearchAction")} onAction={onClear} />
      ) : null}
      {hasError ? (
        <SearchEmpty icon="alert-circle" message={t("shared.scripturePicker.searchError")} action={t("shared.scripturePicker.retrySearch")} onAction={onRetry} />
      ) : null}
    </ScrollView>
  );
}

function SearchEmpty({ action, icon, message, onAction }: { action: string; icon: "alert-circle" | "book-open"; message: string; onAction: () => void }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: "center", gap: 12, paddingVertical: 34 }}>
      <Feather color={colors.muted} name={icon} size={26} />
      <Text style={[typography.body, { color: colors.muted, textAlign: "center" }]}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        style={({ pressed }) => ({ alignItems: "center", backgroundColor: pressed ? colors.accentSubtle : colors.paper, borderColor: colors.line, borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 18 })}
      >
        <Text style={[typography.button, { color: colors.olive }]}>{action}</Text>
      </Pressable>
    </View>
  );
}
