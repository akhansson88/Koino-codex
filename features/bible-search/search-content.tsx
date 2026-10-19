import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bibleVersionFor, type BibleVersionId } from "@/features/bible-versions";
import { displayBibleReference, type ScriptureSearchResult } from "@/features/bible-search";
import { useScriptureSearch } from "./use-search";
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

export function defaultScriptureSearchPalette(): ReaderPalette {
  return { accent: colors.olive, background: colors.cream, buttonText: colors.onAccent, danger: colors.danger,
    dim: colors.muted, input: colors.input, line: colors.line, muted: colors.muted,
    peach: colors.warmSoft, shadow: colors.ink, sheet: colors.paper, surface: colors.paper, text: colors.ink };
}

function resultListId(versionId: string, results: ScriptureSearchResult[]) {
  let hash = 2166136261;
  for (const character of `${versionId}:${results.map((item) => item.id).join("|")}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return `search:${versionId}:${(hash >>> 0).toString(36)}`;
}

/** Modal-free so the reader and the composer keep their own native presentation lifecycle. */
export function ScriptureSearchContent({
  bibleVersionId, visible, onSelect, palette = defaultScriptureSearchPalette(), limit = 20,
  query: controlledQuery, onQueryChange, initialQuery = "", showInput = true, onBrowse,
}: {
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
}) {
  const { language, t } = useAppTranslation();
  const audio = useBibleAudio();
  const insets = useSafeAreaInsets();
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const search = useScriptureSearch({ query, versionId: bibleVersionId, limit, language, visible });
  const results = search.response.results;
  const version = bibleVersionFor(bibleVersionId);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const [following, setFollowing] = useState(true);
  const definition = useMemo<TopicDefinition>(() => ({
    id: resultListId(bibleVersionId, results), topic: query.trim() || t("bible.search.title"),
    title: query.trim() || t("bible.search.title"), translation: bibleVersionId,
    items: results.flatMap((item) => {
      const verse = item.verse;
      return verse.book && verse.chapter && verse.startVerse ? [{ id: item.id,
        reference: displayBibleReference(verse.reference, language, bibleVersionId), book: verse.book,
        chapter: verse.chapter, startVerse: verse.startVerse, endVerse: verse.endVerse ?? verse.startVerse }] : [];
    }), unavailableCount: 0,
  }), [bibleVersionId, language, query, results, t]);
  const session = !audio.pendingTopic && !audio.pendingRequest && audio.session?.topic?.definition.id === definition.id ? audio.session.topic : undefined;
  const pending = audio.pendingTopic?.definition.id === definition.id ? audio.pendingTopic : undefined;
  const activeId = pending?.options.initialItemId ?? (pending ? definition.items[0]?.id : session?.definition.items[session.itemIndex]?.id);

  useEffect(() => { if (visible && version.hasAudio) void audio.refresh(); }, [audio.refresh, version.hasAudio, visible]);
  useEffect(() => {
    if (controlledQuery === undefined) setLocalQuery(initialQuery);
  }, [controlledQuery, initialQuery, visible]);
  useEffect(() => { offsets.current = {}; }, [definition.id]);
  useEffect(() => { if (pending) setFollowing(true); }, [pending]);
  useEffect(() => {
    if (following && activeId && offsets.current[activeId] !== undefined) {
      scroll.current?.scrollTo({ y: Math.max(0, offsets.current[activeId] - 12), animated: true });
    }
  }, [activeId, following]);

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
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onScrollBeginDrag={() => setFollowing(false)}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: showInput ? 0 : 16, paddingBottom: 30, gap: 14 }}>
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
        {search.loading || search.response.semanticState === "unavailable" ? <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          {search.loading ? <ActivityIndicator size="small" color={palette.accent} /> : null}
          <Text style={{ flex: 1, color: palette.muted, fontSize: 12, lineHeight: 18 }}>{search.loading
            ? t(results.length > 0 ? "bible.search.findingRelated" : "shared.scripturePicker.searching")
            : t("bible.search.lexicalOnly")}</Text>
          {!search.loading && search.response.semanticState === "unavailable" ? <Pressable accessibilityRole="button" onPress={search.retry} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6 }}>
            <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "700" }}>{t("bible.search.retry")}</Text>
          </Pressable> : null}
        </View> : null}
        {search.error ? <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <Text style={{ color: palette.muted }}>{t("shared.scripturePicker.searchError")}</Text>
          <Pressable accessibilityRole="button" onPress={search.retry} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.search.retry")}</Text></Pressable>
        </View> : null}
        {!search.eligible ? <Text style={{ color: palette.muted }}>{t("bible.search.minimum")}</Text> : null}
        {!search.loading && search.eligible && !search.error && results.length === 0 ? <View accessibilityLiveRegion="polite" style={{ paddingVertical: 24, gap: 8 }}>
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: "800" }}>{t("bible.search.emptyTitle")}</Text>
          <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 22 }}>{t("bible.search.emptyBody")}</Text>
        </View> : null}
        {results.map((result) => <View key={result.id} onLayout={({ nativeEvent }) => {
          offsets.current[result.id] = nativeEvent.layout.y;
          if (following && activeId === result.id) scroll.current?.scrollTo({ y: Math.max(0, nativeEvent.layout.y - 12), animated: false });
        }} style={{ backgroundColor: palette.surface, borderColor: activeId === result.id ? palette.accent : palette.line, borderWidth: activeId === result.id ? 2 : 1, borderRadius: radius.lg, padding: 16, gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("bible.navigator.openPassage", { reference: displayBibleReference(result.verse.reference, language, bibleVersionId) })}
            onPress={() => onSelect(result.verse)} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, color: palette.text, fontSize: 17, fontWeight: "800" }}>{displayBibleReference(result.verse.reference, language, bibleVersionId)}</Text>
              <Feather name="arrow-up-right" size={18} color={palette.muted} />
            </View>
            <Text selectable numberOfLines={8} style={{ color: palette.text, fontSize: 16, lineHeight: 25 }}>{result.verse.text}</Text>
            <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 17 }}>{version.label} · {t(result.matchType === "reference" ? "bible.search.match.reference" : result.matchType === "semantic" ? "bible.search.match.semantic" : result.matchType === "topic" ? "bible.search.match.topic" : "bible.search.match.text")}</Text>
          </Pressable>
          {version.hasAudio ? <TopicPassageAudioControl definition={definition} itemId={result.id} reference={displayBibleReference(result.verse.reference, language, bibleVersionId)} palette={palette} /> : null}
        </View>)}
      </>}
      <SearchSourceCredits palette={palette} />
    </ScrollView>
    {version.hasAudio && results.length > 0 ? <>
      {!following && (session || pending) ? <Pressable accessibilityRole="button" onPress={() => setFollowing(true)} style={{ minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: palette.peach }}>
        <Text style={{ color: palette.accent, fontWeight: "700" }}>{t("bible.topics.audio.sync")}</Text>
      </Pressable> : null}
      <TopicPlaybackPanel definition={definition} palette={palette} insets={{ bottom: insets.bottom }} />
    </> : null}
  </View>;
}
