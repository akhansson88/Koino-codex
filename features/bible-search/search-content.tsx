import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, View, type ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bibleVersionFor, type BibleVersionId } from "@/features/bible-versions";
import { displayBibleBookName, displayBibleReference, type ScriptureSearchResult } from "@/features/bible-search";
import { useScriptureSearch, type ScriptureSearchScrollState, type ScriptureSearchSession } from "./use-search";
import { buildSearchSynopsis } from "./synopsis";
import { suggestTopics } from "./topic-suggestions";
import { SearchSourceCredits } from "./search-credits";
import { useBibleAudio } from "@/features/bible-audio/provider";
import { TopicPassageAudioControl, TopicPlaybackPanel } from "@/features/bible-audio/topic-controls";
import type { TopicDefinition } from "@/features/bible-audio/topic-playback";
import { type ReaderPalette } from "@/features/bible-reader/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius } from "@/ui/theme";
import type { BibleVerse } from "@/state/types";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import { bookmarkMatchesQuery, sortBookmarks } from "@/state/bookmarks";
import { savedVerseIdentity } from "@/state/saved-verses";
import { SheetTextInput } from "@/ui/app-sheet";

const topics = ["anxiety", "hope", "forgiveness", "identity", "loneliness", "purpose", "prayer"] as const;
const noAudioResults: ScriptureSearchResult[] = [];

// Superscript glyphs keep raised numbers inside the native selectable text flow.
function superscriptVerseNumber(verse: number) {
  return String(verse).replace(/\d/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(digit)]);
}

function FilterPill({ active, clearLabel, icon, label, onClear, onPress, palette }: {
  active: boolean;
  clearLabel: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onClear?: () => void;
  onPress: () => void;
  palette: ReaderPalette;
}) {
  const tint = active ? palette.accent : palette.text;
  return <View style={{ alignItems: "center", backgroundColor: active ? palette.peach : palette.surface, borderColor: active ? palette.accent : palette.line,
    borderRadius: 22, borderWidth: active ? 2 : 1, flexDirection: "row", minHeight: 44 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, minHeight: 44, paddingLeft: 13, paddingRight: onClear ? 6 : 13 }}>
      <Feather name={icon} size={14} color={active ? palette.accent : palette.muted} />
      <Text numberOfLines={1} style={{ color: tint, fontSize: 13, fontWeight: "700", maxWidth: 190 }}>{label}</Text>
    </Pressable>
    {onClear ? <Pressable accessibilityRole="button" accessibilityLabel={clearLabel} hitSlop={6} onPress={onClear}
      style={{ alignItems: "center", justifyContent: "center", minHeight: 44, paddingLeft: 2, paddingRight: 11 }}>
      <Feather name="x" size={14} color={palette.accent} />
    </Pressable> : null}
  </View>;
}

function FilterOption({ icon, onPress, palette, selected = false, subtitle, title, trailing }: {
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  palette: ReaderPalette;
  selected?: boolean;
  subtitle?: string;
  title: string;
  trailing?: "chevron";
}) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => ({ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 56, opacity: pressed ? 0.6 : 1 })}>
    <View style={{ alignItems: "center", justifyContent: "center", width: 20 }}>
      <Feather name={icon} size={17} color={selected ? palette.accent : palette.muted} />
    </View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: selected ? palette.accent : palette.text, fontSize: 15, fontWeight: "700" }}>{title}</Text>
      {subtitle ? <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>{subtitle}</Text> : null}
    </View>
    {selected ? <Feather name="check" size={18} color={palette.accent} />
      : trailing === "chevron" ? <Feather name="chevron-right" size={18} color={palette.muted} /> : null}
  </Pressable>;
}

function FilterSection({ children, label, palette }: { children: React.ReactNode; label: string; palette: ReaderPalette }) {
  return <View style={{ gap: 2 }}>
    <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</Text>
    {children}
  </View>;
}

/**
 * An in-tree panel rather than a native modal: search itself is already presented
 * in a modal, and nesting another presentation there is fragile on iOS.
 */
function SearchFilterSheet({
  bibleVersionId, bookName, engine, insetsBottom, onBrowse, onClose, onEngine, onTestament, onToggleBook, palette, testament, bookOnly,
}: {
  bibleVersionId: BibleVersionId;
  bookName: string;
  bookOnly: boolean;
  engine: "smart" | "precise";
  insetsBottom: number;
  onBrowse?: () => void;
  onClose: () => void;
  onEngine: (engine: "smart" | "precise") => void;
  onTestament: (testament: "all" | "old" | "new") => void;
  onToggleBook: () => void;
  palette: ReaderPalette;
  testament: "all" | "old" | "new";
}) {
  const { t } = useAppTranslation();
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { duration: 180, toValue: 1, useNativeDriver: true }).start();
  }, [appear]);
  return <View accessibilityViewIsModal style={StyleSheet.absoluteFill}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(23, 26, 20, 0.32)", opacity: appear }]}>
      <Pressable accessibilityLabel={t("shared.sheet.close")} accessibilityRole="button" onPress={onClose} style={{ flex: 1 }} />
    </Animated.View>
    <Animated.View style={{ backgroundColor: palette.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24, bottom: 0, left: 0,
      paddingBottom: Math.max(18, insetsBottom + 10), paddingHorizontal: 20, paddingTop: 8, position: "absolute", right: 0,
      transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
      <View style={{ alignItems: "center", paddingBottom: 6 }}><View style={{ backgroundColor: palette.line, borderRadius: 2, height: 4, width: 36 }} /></View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingBottom: 8 }}>
        <Text accessibilityRole="header" style={{ color: palette.text, flex: 1, fontSize: 19, fontWeight: "800" }}>{t("bible.search.filters.title")}</Text>
        <Pressable accessibilityLabel={t("shared.sheet.close")} accessibilityRole="button" onPress={onClose}
          style={{ alignItems: "center", borderColor: palette.line, borderRadius: 12, borderWidth: 1, height: 38, justifyContent: "center", width: 38 }}>
          <Feather name="x" size={18} color={palette.text} />
        </Pressable>
      </View>
      <FilterSection label={t("bible.search.engine.label")} palette={palette}>
        {(["smart", "precise"] as const).map((option) => <FilterOption key={option} palette={palette}
          icon={option === "smart" ? "zap" : "search"} selected={engine === option}
          subtitle={t(`bible.search.engine.${option}Hint`)} title={t(`bible.search.engine.${option}`)}
          onPress={() => { onEngine(option); onClose(); }} />)}
      </FilterSection>
      <FilterSection label={t("bible.search.testament.label")} palette={palette}>
        {(["all", "old", "new"] as const).map((option) => <FilterOption key={option} palette={palette}
          icon={option === "all" ? "book-open" : "book"} selected={!bookOnly && testament === option}
          title={t(`bible.search.testament.${option}`)}
          onPress={() => { onTestament(option); onClose(); }} />)}
      </FilterSection>
      <FilterSection label={t("bible.search.filters.book")} palette={palette}>
        {bookName ? <FilterOption palette={palette} icon="book" selected={bookOnly} title={bookName}
          subtitle={t(bookOnly ? "bible.search.filters.bookOnlyOn" : "bible.search.filters.bookOnlyOff")}
          onPress={() => { onToggleBook(); onClose(); }} /> : null}
        {onBrowse ? <FilterOption palette={palette} icon="list" title={t("bible.search.browse")} trailing="chevron"
          onPress={() => { onBrowse(); onClose(); }} /> : null}
      </FilterSection>
      <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16, paddingTop: 6 }}>{bibleVersionFor(bibleVersionId).label}</Text>
    </Animated.View>
  </View>;
}

export function defaultScriptureSearchPalette(): ReaderPalette {
  return { accent: colors.olive, background: colors.cream, buttonText: colors.onAccent, danger: colors.danger,
    dim: colors.muted, input: colors.input, line: colors.line, muted: colors.muted,
    peach: colors.warmSoft, shadow: colors.ink, sheet: colors.paper, surface: colors.paper, text: colors.ink };
}

function useSearchDefinition(versionId: BibleVersionId, language: "en" | "sv", title: string, sessionId: string | undefined, results: ScriptureSearchResult[]) {
  const cache = useRef<{ versionId: BibleVersionId; language: string; title: string; sessionId?: string; count: number; first?: string; last?: string; prefix: string; hash: number; definition: TopicDefinition } | undefined>(undefined);
  return useMemo(() => {
    const previous = cache.current;
    const prefix = (count: number) => results.slice(0, Math.min(count, 100)).map((item) => item.id).join("|");
    const append = Boolean(previous && previous.versionId === versionId && previous.language === language && previous.title === title && previous.sessionId === sessionId && results.length >= previous.count
      && results[0]?.id === previous.first && results[previous.count - 1]?.id === previous.last && prefix(previous.count) === previous.prefix);
    if (append && previous && results.length === previous.count) return previous.definition;
    let hash = append && previous ? previous.hash : 2166136261;
    const addHash = (value: string) => { for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619); };
    if (!append) addHash(`${versionId}:`);
    const items = append && previous ? previous.definition.items.slice() : [];
    const start = append && previous ? previous.count : 0;
    for (let index = start; index < results.length; index++) {
      const item = results[index], verse = item.verse;
      addHash(`${index ? "|" : ""}${item.id}`);
      if (verse.book && verse.chapter && verse.startVerse) items.push({ id: item.id,
        reference: displayBibleReference(verse.reference, language, versionId), book: verse.book,
        chapter: verse.chapter, startVerse: verse.startVerse, endVerse: verse.endVerse ?? verse.startVerse });
    }
    const definition: TopicDefinition = { id: `search:${versionId}:${sessionId ?? "local"}:${(hash >>> 0).toString(36)}`, topic: title, title, translation: versionId,
      searchSessionId: sessionId, windowed: results.length > 100, items, unavailableCount: 0 };
    cache.current = { versionId, language, title, sessionId, count: results.length, first: results[0]?.id, last: results.at(-1)?.id, prefix: prefix(results.length), hash, definition };
    return definition;
  }, [versionId, language, title, sessionId, results]);
}

type ScriptureSearchContentProps = {
  bibleVersionId: BibleVersionId;
  visible: boolean;
  onSelect: (verse: BibleVerse) => void;
  palette?: ReaderPalette;
  limit?: number;
  query?: string;
  onQueryChange?: (query: string) => void;
  initialQuery?: string;
  showInput?: boolean;
  onBrowse?: () => void;
  session?: ScriptureSearchSession;
};

/** Modal-free so the reader and the composer keep their own native presentation lifecycle. */
export function ScriptureSearchContent({ session, ...props }: ScriptureSearchContentProps) {
  return session ? <ScriptureSearchView {...props} query={session.query} onQueryChange={session.setQuery}
    search={session.search} scrollState={session.scroll} /> : <LocalScriptureSearchContent {...props} />;
}

function LocalScriptureSearchContent(props: ScriptureSearchContentProps) {
  const { bibleVersionId, visible, limit = 20, query: controlledQuery, onQueryChange, initialQuery = "" } = props;
  const { language } = useAppTranslation();
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const query = controlledQuery ?? localQuery;
  const search = useScriptureSearch({ query, versionId: bibleVersionId, limit, language, visible });
  useEffect(() => {
    if (controlledQuery === undefined) setLocalQuery(initialQuery);
  }, [controlledQuery, initialQuery, visible]);
  return <ScriptureSearchView {...props} query={query} onQueryChange={onQueryChange ?? setLocalQuery} search={search} />;
}

function ScriptureSearchView({
  bibleVersionId, visible, onSelect, palette = defaultScriptureSearchPalette(),
  query, onQueryChange: setQuery, showInput = true, onBrowse, search, scrollState,
}: ScriptureSearchContentProps & {
  query: string;
  onQueryChange: (query: string) => void;
  search: ReturnType<typeof useScriptureSearch>;
  scrollState?: ScriptureSearchScrollState;
}) {
  const { language, t } = useAppTranslation();
  const audio = useBibleAudio();
  const insets = useSafeAreaInsets();
  const results = search.response.results;
  const { dispatch } = useKoinoActions();
  const { savedVerses } = useKoinoFields(["savedVerses"]);
  const savedIdentities = useMemo(() => new Set(savedVerses.map(savedVerseIdentity)), [savedVerses]);
  const bookmarkMatches = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) return [];
    return sortBookmarks(savedVerses.filter((verse) => bookmarkMatchesQuery(verse, normalized)), "recent").slice(0, 3);
  }, [query, savedVerses]);
  const studyResults = !search.loading && !search.error && results.length > 0 ? (search.studyResults ?? []) : [];
  const [inputFocused, setInputFocused] = useState(false);
  const [expandedStudy, setExpandedStudy] = useState<number | undefined>(undefined);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const synopsis = useMemo(() => buildSearchSynopsis(results, query), [query, results]);
  const suggestions = useMemo(() => inputFocused ? suggestTopics(query, 5) : [], [inputFocused, query]);
  const chooseSuggestion = (suggestion: string) => {
    setQuery(suggestion);
    setInputFocused(false);
    Keyboard.dismiss();
  };
  const version = bibleVersionFor(bibleVersionId);
  const currentBookName = search.currentBook ? displayBibleBookName(search.currentBook, language, bibleVersionId) : "";
  const scroll = useRef<FlatList<ScriptureSearchResult>>(null);
  const rowHeights = useRef<Record<string, number>>({});
  const searchRef = useRef(search);
  searchRef.current = search;
  const [following, setFollowing] = useState(!scrollState?.restore);
  const [preservingPosition, setPreservingPosition] = useState(Boolean(scrollState?.restore));
  const restoreOffset = useRef<number | undefined>(scrollState?.restore ? scrollState.offset : undefined);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);
  const restoreFrame = useRef<number | undefined>(undefined);
  const scrollRetry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const allowRestoreClamp = useRef(false);
  const scrollRetryCount = useRef(0);
  const targetIndex = useRef<number | undefined>(undefined);
  const restoreAnchorReady = useRef(false);
  const restoredSession = useRef(Boolean(scrollState?.restore));
  const scrollStateRef = useRef(scrollState);
  scrollStateRef.current = scrollState;
  const definition = useSearchDefinition(bibleVersionId, language, query.trim() || t("bible.search.title"), search.sessionId, version.hasAudio ? results : noAudioResults);
  const belongsToSearch = (candidate?: TopicDefinition) => Boolean(candidate && (candidate.id === definition.id || (search.sessionId && candidate.searchSessionId === search.sessionId)));
  const session = !audio.pendingTopic && !audio.pendingRequest && belongsToSearch(audio.session?.topic?.definition) ? audio.session?.topic : undefined;
  const pending = belongsToSearch(audio.pendingTopic?.definition) ? audio.pendingTopic : undefined;
  const activeDefinition = pending?.definition ?? session?.definition;
  const activeItems = useMemo(() => new Set(activeDefinition?.items.map((item) => item.id) ?? []), [activeDefinition]);
  const activeId = pending?.options.initialItemId ?? (pending ? pending.definition.items[0]?.id : session?.definition.items[session.itemIndex]?.id);
  const previousPending = useRef(pending);

  const restoreScroll = useCallback(() => {
    if (restoreOffset.current === undefined) return;
    if (restoreFrame.current !== undefined) cancelAnimationFrame(restoreFrame.current);
    // Let viewport, row, and content-size events settle together. In particular,
    // a partial content-size event must not clamp away a position near the bottom.
    restoreFrame.current = requestAnimationFrame(() => {
      restoreFrame.current = undefined;
      const target = restoreOffset.current;
      if (target === undefined || !scroll.current || viewportHeight.current <= 0 || contentHeight.current <= 0) return;
      if (!allowRestoreClamp.current && contentHeight.current < (scrollStateRef.current?.contentHeight ?? 0) && target > contentHeight.current - viewportHeight.current) {
        if (restoreTimer.current !== undefined) clearTimeout(restoreTimer.current);
        restoreTimer.current = setTimeout(() => { allowRestoreClamp.current = true; restoreScrollRef.current(); }, 250);
        return;
      }
      const index = scrollStateRef.current?.index;
      if (index !== undefined && index > 0 && !restoreAnchorReady.current) {
        if (targetIndex.current !== index) {
          targetIndex.current = index;
          scrollRetryCount.current = 0;
          scroll.current.scrollToIndex({ index: Math.min(index, Math.max(0, searchRef.current.response.results.length - 1)), animated: false });
        }
        return;
      }
      restoreOffset.current = undefined;
      targetIndex.current = undefined;
      // Virtualized rows may have different estimated heights after remounting.
      // Once the saved row is visible, keep that anchor instead of applying an
      // obsolete absolute offset and jumping to a different passage.
      if (index !== undefined && index > 0) return;
      scroll.current.scrollToOffset({ offset: Math.min(target, Math.max(0, contentHeight.current - viewportHeight.current)), animated: false });
    });
  }, []);

  const cancelScrollWork = useCallback(() => {
    if (restoreFrame.current !== undefined) cancelAnimationFrame(restoreFrame.current);
    if (scrollRetry.current !== undefined) clearTimeout(scrollRetry.current);
    if (restoreTimer.current !== undefined) clearTimeout(restoreTimer.current);
    restoreFrame.current = undefined;
    scrollRetry.current = undefined;
    restoreTimer.current = undefined;
  }, []);

  useLayoutEffect(() => {
    const restore = Boolean(scrollState?.restore);
    restoredSession.current = restore;
    restoreOffset.current = restore ? scrollState?.offset : undefined;
    restoreAnchorReady.current = false;
    allowRestoreClamp.current = false;
    targetIndex.current = undefined;
    scrollRetryCount.current = 0;
    contentHeight.current = 0;
    viewportHeight.current = 0;
    rowHeights.current = {};
    if (!restore) scroll.current?.scrollToOffset({ offset: 0, animated: false });
    setFollowing(!restore);
    setPreservingPosition(restore);
    return cancelScrollWork;
  }, [cancelScrollWork, scrollState, search.scrollKey]);

  useEffect(() => { if (visible && version.hasAudio) void audio.refresh(); }, [audio.refresh, version.hasAudio, visible]);
  useEffect(() => {
    if (pending && (!restoredSession.current || pending !== previousPending.current)) {
      restoreOffset.current = undefined;
      setFollowing(true);
    }
    previousPending.current = pending;
  }, [pending]);
  useEffect(() => {
    const index = activeId ? results.findIndex((item) => item.id === activeId) : -1;
    if (visible && following && restoreOffset.current === undefined && index >= 0) {
      targetIndex.current = index;
      scrollRetryCount.current = 0;
      scroll.current?.scrollToIndex({ index, viewOffset: 12, animated: true });
    }
  }, [activeId, following, results, visible]);

  const restoreScrollRef = useRef(restoreScroll);
  restoreScrollRef.current = restoreScroll;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const visibleIndexes = viewableItems.flatMap((item) => item.isViewable && item.index !== null ? [item.index] : []);
    const saved = scrollStateRef.current;
    searchRef.current.onVisibleResults?.(visibleIndexes);
    if (restoreOffset.current !== undefined && saved?.index !== undefined && visibleIndexes.includes(saved.index)) {
      restoreAnchorReady.current = true;
      restoreScrollRef.current();
    } else if (restoreOffset.current === undefined && saved && visibleIndexes.length) saved.index = Math.min(...visibleIndexes);
  }).current;

  return <View style={{ flex: 1, backgroundColor: palette.background }}>
    {showInput ? <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 10 }}>
      <View style={{ alignItems: "center", backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.lg, flexDirection: "row", gap: 10, paddingHorizontal: 14 }}>
        <Feather name="search" color={palette.muted} size={18} />
        <SheetTextInput accessibilityLabel={t("bible.search.placeholder")} autoCapitalize="sentences" autoCorrect={false}
          maxLength={500} onChangeText={setQuery} onBlur={() => setInputFocused(false)} onFocus={() => setInputFocused(true)}
          placeholder={t("bible.search.placeholder")} placeholderTextColor={palette.muted}
          returnKeyType="search" style={{ flex: 1, minHeight: 52, color: palette.text, fontSize: 15 }} value={query} />
        {query ? <Pressable accessibilityLabel={t("shared.scripturePicker.clearSearch")} accessibilityRole="button" onPress={() => setQuery("")} style={{ minHeight: 44, minWidth: 36, alignItems: "center", justifyContent: "center" }}>
          <Feather name="x" color={palette.muted} size={18} />
        </Pressable> : null}
      </View>
      {/* One compact row of state pills; the choices live in a sheet so results stay above the fold. */}
      <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        <FilterPill active={search.engine !== "smart"} clearLabel={t("bible.search.filters.clearOne", { filter: t("bible.search.engine.label") })}
          icon={search.engine === "precise" ? "search" : "zap"} label={t(`bible.search.engine.${search.engine}`)} palette={palette}
          onClear={() => search.setEngine("smart")} onPress={() => setFiltersVisible(true)} />
        {!search.bookOnly ? <FilterPill active={search.testament !== "all"}
          clearLabel={t("bible.search.filters.clearOne", { filter: t("bible.search.testament.label") })}
          icon={search.testament === "all" ? "layers" : "book"} label={search.testament === "all" ? t("bible.search.filters.allScripture") : t(`bible.search.testament.${search.testament}`)} palette={palette}
          onClear={() => search.setTestament("all")} onPress={() => setFiltersVisible(true)} /> : null}
        <FilterPill active={search.bookOnly}
          clearLabel={t("bible.search.filters.clearOne", { filter: t("bible.search.filters.book") })}
          icon="book-open" label={search.bookOnly && currentBookName ? currentBookName : t("bible.search.filters.books")} palette={palette}
          onClear={() => search.setBookOnly(false)}
          onPress={() => { if (onBrowse) onBrowse(); else setFiltersVisible(true); }} />
      </ScrollView>
      {suggestions.length ? <View style={{ gap: 7 }}>
        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{t("bible.search.suggestions")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {suggestions.map((suggestion) => <Pressable key={suggestion} accessibilityRole="button" accessibilityLabel={suggestion}
            onPressIn={() => chooseSuggestion(suggestion)} onPress={() => chooseSuggestion(suggestion)}
            style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5, borderColor: palette.line, borderWidth: 1,
              borderRadius: 20, backgroundColor: palette.surface, paddingHorizontal: 11 }}>
            <Feather name="hash" size={12} color={palette.muted} />
            <Text style={{ color: palette.text, fontSize: 13 }}>{suggestion}</Text>
          </Pressable>)}
        </View>
      </View> : null}
    </View> : null}
    {/* Fresh searches stay at the top while ranking settles; preserve a position only after scrolling or restoring. */}
    <FlatList key={search.scrollKey} ref={scroll} data={query.trim() ? results : []} keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7}
      maintainVisibleContentPosition={preservingPosition ? { minIndexForVisible: 0 } : undefined}
      onLayout={({ nativeEvent }) => { viewportHeight.current = nativeEvent.layout.height; restoreScroll(); }}
      onContentSizeChange={(_width, height) => {
        contentHeight.current = height;
        if (scrollState && restoreOffset.current === undefined) scrollState.contentHeight = height;
        restoreScroll();
      }}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      onScroll={({ nativeEvent }) => {
        if (visible && scrollState && restoreOffset.current === undefined) scrollState.offset = Math.max(0, nativeEvent.contentOffset.y);
      }} scrollEventThrottle={16}
      onScrollBeginDrag={() => { restoreOffset.current = undefined; targetIndex.current = undefined; setFollowing(false); setPreservingPosition(true); }}
      onScrollToIndexFailed={({ averageItemLength, index }) => {
        scroll.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index), animated: false });
        if (scrollRetry.current !== undefined) clearTimeout(scrollRetry.current);
        // Large, variable-height lists need time to render and rehydrate the
        // target window before FlatList can calculate an exact index offset.
        if (scrollRetryCount.current++ < 60) scrollRetry.current = setTimeout(() => {
          if (targetIndex.current === index) scroll.current?.scrollToIndex({ index, viewOffset: 12, animated: false });
        }, 100);
      }}
      onEndReached={() => { if (restoreOffset.current === undefined) search.loadMore(); }} onEndReachedThreshold={0.5}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: showInput ? 0 : 16, paddingBottom: 30 }}
      ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
      ListHeaderComponent={<View style={{ gap: 14, paddingBottom: results.length ? 14 : 0 }}>
      {!query.trim() ? <>
        <Text style={{ color: palette.text, fontSize: 22, fontWeight: "800", lineHeight: 30 }}>{t("bible.search.intro")}</Text>
        <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 22 }}>{t("bible.search.description")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 6 }}>
          {topics.map((topic) => <Pressable key={topic} accessibilityRole="button" onPress={() => setQuery(t(`bible.topic.${topic}.title`))}
            style={{ minHeight: 44, justifyContent: "center", borderColor: palette.line, borderWidth: 1, borderRadius: 24, backgroundColor: palette.surface, paddingHorizontal: 16 }}>
            <Text style={{ color: palette.text, fontWeight: "700" }}>{t(`bible.topic.${topic}.title`)}</Text>
          </Pressable>)}
        </View>
      </> : <>
        {search.loading || search.interrupted || search.response.semanticState === "unavailable" ? <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          {search.loading ? <ActivityIndicator size="small" color={palette.accent} /> : null}
          <Text style={{ flex: 1, color: palette.muted, fontSize: 12, lineHeight: 18 }}>{search.loading
            ? t(results.length > 0 ? "bible.search.findingRelated" : "shared.scripturePicker.searching")
            : t(search.interrupted ? "bible.search.interrupted" : "bible.search.lexicalOnly")}</Text>
          {!search.loading && (search.interrupted || search.response.semanticState === "unavailable") ? <Pressable accessibilityRole="button" onPress={search.retry} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6 }}>
            <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "700" }}>{t("bible.search.retry")}</Text>
          </Pressable> : null}
        </View> : null}
        {search.error ? <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <Text style={{ color: palette.muted }}>{t("shared.scripturePicker.searchError")}</Text>
          <Pressable accessibilityRole="button" onPress={search.retry} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.search.retry")}</Text></Pressable>
        </View> : null}
        {bookmarkMatches.length && !search.error ? <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 10 }}>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: "800" }}>{t("bible.search.bookmarks.title")}</Text>
          {bookmarkMatches.map((verse) => {
            const matchReference = displayBibleReference(verse.reference, language, verse.translation);
            return (
              <Pressable
                accessibilityLabel={t("bible.navigator.openPassage", { reference: matchReference })}
                accessibilityRole="button"
                key={verse.id}
                onPress={() => onSelect({
                  book: verse.book,
                  chapter: verse.chapter,
                  startVerse: verse.startVerse,
                  endVerse: verse.endVerse,
                  reference: verse.reference,
                  text: verse.text,
                  translation: verse.translation,
                  contextBefore: verse.contextBefore,
                  contextAfter: verse.contextAfter,
                })}
                style={({ pressed }) => ({ gap: 3, minHeight: 44, opacity: pressed ? 0.65 : 1, paddingVertical: 3 })}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
                  <Feather name="bookmark" size={14} color={palette.accent} />
                  <Text style={{ color: palette.accent, flex: 1, fontSize: 13, fontWeight: "800" }}>{matchReference}</Text>
                  {verse.note ? <Feather name="edit-3" size={12} color={palette.muted} /> : null}
                </View>
                <Text numberOfLines={2} style={{ color: palette.text, fontSize: 14, lineHeight: 20 }}>{verse.text}</Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" onPress={() => router.push("/bookmarks" as never)} style={{ minHeight: 38, justifyContent: "center" }}>
            <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "700" }}>{t("bible.search.bookmarks.viewAll")}</Text>
          </Pressable>
        </View> : null}
        {studyResults.length && !search.error ? <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 12 }}>
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: "800" }}>{t("bible.search.study.title")}</Text>
          {studyResults.map((entry) => <View key={entry.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ backgroundColor: palette.peach, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: palette.accent, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>{t(entry.kind === "dictionary" ? "bible.search.study.dictionary" : "bible.search.study.commentary")}</Text>
              </View>
              <Text style={{ flex: 1, color: palette.text, fontSize: 16, fontWeight: "800" }}>{entry.title}</Text>
            </View>
            <Text selectable style={{ color: palette.text, fontSize: 14, lineHeight: 21 }}>{expandedStudy === entry.id ? entry.text : entry.snippet}</Text>
            {entry.refs.length && !(entry.kind === "commentary" && entry.refs.length === 1 && entry.refs[0] === entry.title) ? <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16 }}>{entry.refs.slice(0, 5).join(" · ")}{entry.refs.length > 5 ? "…" : ""}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedStudy === entry.id }}
              onPress={() => setExpandedStudy((value) => value === entry.id ? undefined : entry.id)} style={{ minHeight: 36, justifyContent: "center" }}>
              <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "700" }}>{t(expandedStudy === entry.id ? "bible.search.study.less" : "bible.search.study.read")}</Text>
            </Pressable>
          </View>)}
        </View> : null}
        {!search.eligible ? <Text style={{ color: palette.muted }}>{t("bible.search.minimum")}</Text> : null}
        {!search.loading && !search.interrupted && search.eligible && !search.error && results.length === 0 && studyResults.length === 0 ? <View accessibilityLiveRegion="polite" style={{ paddingVertical: 24, gap: 8 }}>
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: "800" }}>{t("bible.search.emptyTitle")}</Text>
          <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 22 }}>{t("bible.search.emptyBody")}</Text>
        </View> : null}
        {synopsis && !search.loading && !search.interrupted && !search.error ? <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 10 }}>
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: "800" }}>{t("bible.search.synopsis.title")}</Text>
          <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>{t("bible.search.synopsis.intro")}</Text>
          {synopsis.points.map((point) => <View key={point.reference} style={{ gap: 3 }}>
            <Text selectable style={{ color: palette.text, fontSize: 15, lineHeight: 23 }}>“{point.text}”</Text>
            <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "700" }}>{displayBibleReference(point.reference, language, bibleVersionId)}</Text>
          </View>)}
          <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16 }}>{t("bible.search.synopsis.note")}</Text>
        </View> : null}
      </>}
      <SearchSourceCredits palette={palette} />
      </View>}
      renderItem={({ item: result, index }) => <View onLayout={({ nativeEvent }) => { if (!result.contentState) rowHeights.current[result.id] = nativeEvent.layout.height; }} style={{ backgroundColor: palette.surface, borderColor: activeId === result.id ? palette.accent : palette.line, borderWidth: activeId === result.id ? 2 : 1, borderRadius: radius.lg, padding: 16, gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("bible.navigator.openPassage", { reference: displayBibleReference(result.verse.reference, language, bibleVersionId) })}
            disabled={Boolean(result.contentState)} onPress={() => {
              // Return to the passage the user actually opened, even when a
              // virtualized list has only estimated the preceding row heights.
              if (scrollState) scrollState.index = index;
              onSelect(result.verse);
            }} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, color: palette.text, fontSize: 17, fontWeight: "800" }}>{displayBibleReference(result.verse.reference, language, bibleVersionId)}</Text>
              <Pressable
                accessibilityLabel={t("shared.scripture.saveVerse")}
                accessibilityRole="button"
                accessibilityState={{ selected: savedIdentities.has(savedVerseIdentity(result.verse)) }}
                onPress={(event) => {
                  event.stopPropagation();
                  void dispatch({ type: "saveVerse", verse: result.verse });
                }}
                style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
              >
                <Feather name="bookmark" size={18} color={savedIdentities.has(savedVerseIdentity(result.verse)) ? palette.accent : palette.muted} />
              </Pressable>
              <Feather name="arrow-up-right" size={18} color={palette.muted} />
            </View>
            {result.contentState ? <View accessibilityLiveRegion="polite" style={{ minHeight: Math.max(32, (rowHeights.current[result.id] ?? 120) - 100), flexDirection: "row", alignItems: "center", gap: 8 }}>
              {result.contentState !== "error" ? <ActivityIndicator size="small" color={palette.accent} /> : null}
              <Text style={{ color: palette.muted, fontSize: 13 }}>{t(result.contentState === "error" ? "bible.search.passageError" : "bible.search.loadingPassage")}</Text>
            </View> : <Text selectable accessibilityLabel={result.verses.map(({ verse, text }) => `${verse} ${text}`).join(" ")}
              style={{ color: palette.text, fontSize: 16, lineHeight: 25 }}>
              {result.verses.map(({ verse, text }, index) => <Fragment key={verse}>
                {index > 0 ? " " : null}
                <Text style={{ color: palette.muted, fontWeight: "600" }}>{superscriptVerseNumber(verse)}</Text>
                {` ${text}`}
              </Fragment>)}
            </Text>}
            <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 17 }}>{version.label} · {t(result.matchType === "reference" ? "bible.search.match.reference" : result.matchType === "semantic" ? "bible.search.match.semantic" : result.matchType === "topic" ? "bible.search.match.topic" : "bible.search.match.text")}</Text>
          </Pressable>
          {result.contentState === "error" ? <Pressable accessibilityRole="button" onPress={() => search.retryExcerpt(index)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.search.retry")}</Text></Pressable> : null}
          {version.hasAudio ? <TopicPassageAudioControl definition={activeDefinition && activeItems.has(result.id) ? activeDefinition : definition} itemId={result.id} reference={displayBibleReference(result.verse.reference, language, bibleVersionId)} palette={palette} /> : null}
        </View>}
      ListFooterComponent={<View style={{ gap: 8, paddingTop: 14 }}>
        {search.loadingMore ? <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color={palette.accent} /><Text style={{ color: palette.muted }}>{t("bible.search.loadingMore")}</Text>
        </View> : null}
        {search.moreError ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>{t("bible.search.moreError")}</Text> : null}
        {search.hasMore && !search.loading && !search.interrupted && !search.loadingMore ? <Pressable accessibilityRole="button" onPress={search.moreError ? search.retryMore : search.loadMore}
          style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t(search.moreError ? "bible.search.retry" : "bible.search.loadMore")}</Text></Pressable> : null}
        {!search.hasMore && !search.loading && !search.interrupted && results.length > 0 ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontSize: 12 }}>{t("bible.search.end")}</Text> : null}
      </View>}
    />
    {version.hasAudio && results.length > 0 ? <>
      {!following && (session || pending) ? <Pressable accessibilityRole="button" onPress={() => { restoreOffset.current = undefined; setFollowing(true); }} style={{ minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: palette.peach }}>
        <Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.topics.audio.sync")}</Text>
      </Pressable> : null}
      <TopicPlaybackPanel definition={activeDefinition ?? definition} playAllLabel={t("bible.search.playLoaded")} palette={palette} insets={{ bottom: insets.bottom }} />
    </> : null}
    {filtersVisible ? <SearchFilterSheet bibleVersionId={bibleVersionId} bookName={currentBookName} bookOnly={search.bookOnly}
      engine={search.engine} insetsBottom={insets.bottom} palette={palette} testament={search.testament}
      onBrowse={onBrowse ? () => { setFiltersVisible(false); onBrowse(); } : undefined}
      onClose={() => setFiltersVisible(false)}
      onEngine={(engine) => search.setEngine(engine)}
      onTestament={(testament) => { search.setBookOnly(false); search.setTestament(testament); }}
      onToggleBook={() => { search.setBookOnly(!search.bookOnly); if (!search.bookOnly) search.setTestament("all"); }} /> : null}
  </View>;
}
