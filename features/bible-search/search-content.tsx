import { Feather } from "@expo/vector-icons";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View, type ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bibleVersionFor, type BibleVersionId } from "@/features/bible-versions";
import { displayBibleReference, type ScriptureSearchResult } from "@/features/bible-search";
import { useScriptureSearch, type ScriptureSearchScrollState, type ScriptureSearchSession } from "./use-search";
import { SearchSourceCredits } from "./search-credits";
import { useBibleAudio } from "@/features/bible-audio/provider";
import { TopicPassageAudioControl, TopicPlaybackPanel } from "@/features/bible-audio/topic-controls";
import type { TopicDefinition } from "@/features/bible-audio/topic-playback";
import { type ReaderPalette } from "@/features/bible-reader/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius } from "@/ui/theme";
import type { BibleVerse } from "@/state/types";
import { SheetTextInput } from "@/ui/app-sheet";

const topics = ["anxiety", "hope", "forgiveness", "identity", "loneliness", "purpose", "prayer"] as const;
const noAudioResults: ScriptureSearchResult[] = [];

// Superscript glyphs keep raised numbers inside the native selectable text flow.
function superscriptVerseNumber(verse: number) {
  return String(verse).replace(/\d/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(digit)]);
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
    const definition: TopicDefinition = { id: `search:${versionId}:${(hash >>> 0).toString(36)}`, topic: title, title, translation: versionId,
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
  const version = bibleVersionFor(bibleVersionId);
  const scroll = useRef<FlatList<ScriptureSearchResult>>(null);
  const rowHeights = useRef<Record<string, number>>({});
  const searchRef = useRef(search);
  searchRef.current = search;
  const [following, setFollowing] = useState(!scrollState?.restore);
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
          scroll.current.scrollToIndex({ index: Math.min(index, Math.max(0, results.length - 1)), animated: false });
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
  }, [results]);

  useEffect(() => () => {
    if (restoreFrame.current !== undefined) cancelAnimationFrame(restoreFrame.current);
    if (scrollRetry.current !== undefined) clearTimeout(scrollRetry.current);
    if (restoreTimer.current !== undefined) clearTimeout(restoreTimer.current);
  }, [restoreScroll]);

  useLayoutEffect(() => {
    if (!scrollState) return;
    restoredSession.current = scrollState.restore;
    restoreOffset.current = scrollState.restore ? scrollState.offset : undefined;
    restoreAnchorReady.current = false;
    allowRestoreClamp.current = false;
    targetIndex.current = undefined;
    if (!scrollState.restore) scroll.current?.scrollToOffset({ offset: 0, animated: false });
    setFollowing(!scrollState.restore);
  }, [scrollState]);

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
    {showInput ? <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 12 }}>
      <View style={{ alignItems: "center", backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.lg, flexDirection: "row", gap: 10, paddingHorizontal: 14 }}>
        <Feather name="search" color={palette.muted} size={18} />
        <SheetTextInput accessibilityLabel={t("bible.search.placeholder")} autoCapitalize="sentences" autoCorrect={false}
          maxLength={500} onChangeText={setQuery} placeholder={t("bible.search.placeholder")} placeholderTextColor={palette.muted}
          returnKeyType="search" style={{ flex: 1, minHeight: 52, color: palette.text, fontSize: 15 }} value={query} />
        {query ? <Pressable accessibilityLabel={t("shared.scripturePicker.clearSearch")} accessibilityRole="button" onPress={() => setQuery("")} style={{ minHeight: 44, minWidth: 36, alignItems: "center", justifyContent: "center" }}>
          <Feather name="x" color={palette.muted} size={18} />
        </Pressable> : null}
      </View>
      {onBrowse ? <Pressable accessibilityRole="button" onPress={onBrowse} style={{ minHeight: 40, justifyContent: "center" }}>
        <Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.search.browse")}</Text>
      </Pressable> : null}
    </View> : null}
    <FlatList ref={scroll} data={query.trim() ? results : []} keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
      onScrollBeginDrag={() => { restoreOffset.current = undefined; targetIndex.current = undefined; setFollowing(false); }}
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
        {!search.eligible ? <Text style={{ color: palette.muted }}>{t("bible.search.minimum")}</Text> : null}
        {!search.loading && !search.interrupted && search.eligible && !search.error && results.length === 0 ? <View accessibilityLiveRegion="polite" style={{ paddingVertical: 24, gap: 8 }}>
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: "800" }}>{t("bible.search.emptyTitle")}</Text>
          <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 22 }}>{t("bible.search.emptyBody")}</Text>
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
  </View>;
}
