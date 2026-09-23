import { SheetTextInput } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type BibleVersionId } from "@/features/bible-kjv";
import { useAppTranslation } from "@/ui/app-language";
import { colors, platformShadow, radius } from "@/ui/theme";
import {
  type BibleTopicReference,
  type BibleTopicVoteValue,
  type ReaderPalette,
  type BibleTopicResult,
  type BibleTopicIndexItem,
  type SuggestedTopic,
} from "@/features/bible-reader/types";
import { fetchBibleTopicIndex, suggestedTopics, bibleTopicAlphabet } from "@/features/bible-reader/topics-api";
import { ReaderCircleButton } from "@/features/bible-reader/header";
import { BibleTopicDetailPane } from "@/features/bible-reader/topic-detail";

export function BibleTopicsModal({
  bibleVersionId,
  bibleVersionLabel,
  detailVisible,
  error,
  loading,
  onBack,
  onClose,
  onSelectReference,
  onSelectTopic,
  onVote,
  palette,
  references,
  source,
  topic,
  userVotes,
  visible,
  voteError,
  votePending,
}: {
  bibleVersionId: BibleVersionId;
  bibleVersionLabel: string;
  detailVisible: boolean;
  error?: string;
  loading: boolean;
  onBack: () => void;
  onClose: () => void;
  onSelectReference: (reference: string) => void;
  onSelectTopic: (topic: string) => void;
  onVote: (reference: BibleTopicReference, value: BibleTopicVoteValue) => void;
  palette: ReaderPalette;
  references: BibleTopicReference[];
  source: BibleTopicResult["source"];
  topic: string;
  userVotes: Record<string, BibleTopicVoteValue>;
  visible: boolean;
  voteError?: string;
  votePending: string;
}) {
  const { language, t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const slideX = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState("");
  const [topicIndex, setTopicIndex] = useState<BibleTopicIndexItem[]>([]);
  const [topicIndexError, setTopicIndexError] = useState(false);
  const [topicIndexLoading, setTopicIndexLoading] = useState(false);
  const [activeLetter, setActiveLetter] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setActiveLetter("");
      slideX.setValue(0);
    }
  }, [slideX, visible]);

  useEffect(() => {
    if (!visible || topicIndex.length > 0) return;
    let active = true;
    setTopicIndexLoading(true);
    setTopicIndexError(false);
    void fetchBibleTopicIndex()
      .then((topics) => {
        if (active) setTopicIndex(topics);
      })
      .catch(() => {
        if (active) setTopicIndexError(true);
      })
      .finally(() => {
        if (active) setTopicIndexLoading(false);
      });
    return () => {
      active = false;
    };
  }, [topicIndex.length, visible]);

  useEffect(() => {
    if (!visible) return;
    Animated.timing(slideX, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: detailVisible ? -width : 0,
      useNativeDriver: true,
    }).start();
  }, [detailVisible, slideX, visible, width]);

  const normalizedQuery = query.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return topicIndex
      .filter((item) => item.name.toLowerCase().includes(normalizedQuery))
      .sort((first, second) => {
        const firstStarts = first.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        const secondStarts = second.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        return firstStarts - secondStarts || first.name.localeCompare(second.name, "en");
      })
      .slice(0, 8);
  }, [normalizedQuery, topicIndex]);
  const exactSearchMatch = topicIndex.find((item) => item.name.toLowerCase() === normalizedQuery);
  const activeLetterTopics = useMemo(
    () => (activeLetter ? topicIndex.filter((item) => item.letter === activeLetter) : []),
    [activeLetter, topicIndex],
  );

  function submitSearch() {
    const nextQuery = query.trim();
    if (nextQuery) {
      const curatedTopic = suggestedTopics.find((item) => {
        const normalizedQuery = nextQuery.toLocaleLowerCase();
        return item.apiTopic.toLocaleLowerCase() === normalizedQuery || t(item.titleKey).toLocaleLowerCase() === normalizedQuery;
      });
      onSelectTopic(exactSearchMatch?.name ?? curatedTopic?.apiTopic ?? nextQuery);
    }
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={detailVisible ? onBack : onClose}>
      <View style={{ backgroundColor: palette.background, flex: 1, overflow: "hidden" }}>
        <Animated.View
          style={{
            flex: 1,
            flexDirection: "row",
            transform: [{ translateX: slideX }],
            width: width * 2,
          }}
        >
          <View
            accessibilityElementsHidden={detailVisible}
            aria-hidden={detailVisible}
            importantForAccessibility={detailVisible ? "no-hide-descendants" : "auto"}
            style={{ backgroundColor: palette.background, flex: 1, width }}
          >
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            alignItems: "center",
            gap: 22,
            paddingBottom: Math.max(30, insets.bottom + 24),
            paddingHorizontal: 20,
            paddingTop: insets.top + 14,
          }}
        >
          <View style={{ alignItems: "center", maxWidth: 430, minHeight: 56, width: "100%" }}>
            <View style={{ position: "absolute", right: 0, top: 0 }}>
              <ReaderCircleButton accessibilityLabel={t("bible.topics.close")} icon="x" onPress={onClose} palette={palette} />
            </View>
          </View>

          <View style={{ alignItems: "center", gap: 8, maxWidth: 430, width: "100%" }}>
            <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>{t("bible.topics.title")}</Text>
            <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19, maxWidth: 240, textAlign: "center" }}>
              {t("bible.topics.description")}
            </Text>
          </View>

          <View
            style={{
              alignItems: "center",
              backgroundColor: palette.surface,
              borderColor: palette.line,
              borderCurve: "continuous",
              borderRadius: radius.lg,
              borderWidth: 1,
              flexDirection: "row",
              gap: 10,
              maxWidth: 430,
              minHeight: 50,
              paddingHorizontal: 14,
              width: "100%",
              ...platformShadow({
                boxShadow: "0 8px 20px rgba(11, 18, 32, 0.045)",
                color: palette.shadow,
                offset: { width: 0, height: 8 },
                opacity: 0.045,
                radius: 18,
              }),
            }}
          >
            <Feather name="search" size={16} color={palette.muted} />
            <SheetTextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => {
                setQuery(value);
                if (value.trim()) setActiveLetter("");
              }}
              maxLength={100}
              onSubmitEditing={submitSearch}
              placeholder={t("bible.topics.searchPlaceholder")}
              placeholderTextColor={palette.muted}
              returnKeyType="search"
              style={{ color: palette.text, flex: 1, fontSize: 14, fontWeight: "700", minHeight: 48, paddingVertical: 0 }}
              value={query}
            />
          </View>

          {normalizedQuery.length >= 2 ? (
            <View style={{ gap: 10, maxWidth: 430, width: "100%" }}>
              <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{t("bible.topics.searchSuggestions")}</Text>
              <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" }}>
                {searchMatches.map((item, index) => (
                  <TopicIndexRow
                    item={item}
                    key={item.slug}
                    onPress={() => onSelectTopic(item.name)}
                    palette={palette}
                    showDivider={index < searchMatches.length - 1 || !exactSearchMatch}
                  />
                ))}
                {!exactSearchMatch ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSelectTopic(query.trim())}
                    style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 9 }}
                  >
                    <View style={{ alignItems: "center", backgroundColor: palette.peach, borderRadius: 999, height: 34, justifyContent: "center", width: 34 }}>
                      <Feather name="search" size={15} color={palette.accent} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, fontWeight: "800", textTransform: "none" }}>
                        {t("bible.topics.searchOpenBible", { topic: query.trim().toLowerCase() })}
                      </Text>
                      <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>
                        {t("bible.topics.searchOpenBibleSubtitle")}
                      </Text>
                    </View>
                    <Feather name="arrow-right" size={16} color={palette.muted} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {!normalizedQuery ? (
            <View style={{ gap: 10, maxWidth: 430, width: "100%" }}>
              <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{t("bible.topics.browseAlphabet")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {bibleTopicAlphabet.map((letter) => {
                  const available = topicIndex.some((item) => item.letter === letter);
                  const selected = activeLetter === letter;
                  return (
                    <Pressable
                      accessibilityLabel={t("bible.topics.openLetter", { letter })}
                      accessibilityRole="button"
                      disabled={!available}
                      key={letter}
                      onPress={() => setActiveLetter((currentLetter) => (currentLetter === letter ? "" : letter))}
                      style={{
                        alignItems: "center",
                        backgroundColor: selected ? palette.peach : palette.surface,
                        borderColor: selected ? palette.accent : palette.line,
                        borderRadius: 10,
                        borderWidth: 1,
                        height: 34,
                        justifyContent: "center",
                        opacity: available ? 1 : 0.35,
                        width: 34,
                      }}
                    >
                      <Text style={{ color: selected ? palette.accent : palette.text, fontSize: 12, fontWeight: "900" }}>{letter}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {topicIndexLoading ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: 9, paddingVertical: 6 }}>
                  <ActivityIndicator color={palette.accent} size="small" />
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{t("bible.topics.directoryLoading")}</Text>
                </View>
              ) : topicIndexError ? (
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700", lineHeight: 18 }}>{t("bible.topics.directoryError")}</Text>
              ) : null}
            </View>
          ) : null}

          {!normalizedQuery && activeLetter ? (
            <View style={{ gap: 10, maxWidth: 430, width: "100%" }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
                <Text style={{ color: palette.text, flexShrink: 1, fontSize: 13, fontWeight: "900" }}>
                  {t("bible.topics.letterTitle", { letter: activeLetter })}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActiveLetter("")}
                  style={{ alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 96, paddingHorizontal: 4 }}
                >
                  <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "800" }}>{t("bible.topics.showSuggestions")}</Text>
                </Pressable>
              </View>
              <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" }}>
                {activeLetterTopics.map((item, index) => (
                  <TopicIndexRow
                    item={item}
                    key={item.slug}
                    onPress={() => onSelectTopic(item.name)}
                    palette={palette}
                    showDivider={index < activeLetterTopics.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {!normalizedQuery && !activeLetter ? (
          <View style={{ gap: 10, maxWidth: 430, width: "100%" }}>
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{t("bible.topics.suggested")}</Text>
            <View
              style={{
                backgroundColor: palette.surface,
                borderColor: palette.line,
                borderRadius: radius.lg,
                borderWidth: 1,
                overflow: "hidden",
                ...platformShadow({
                  boxShadow: "0 10px 24px rgba(11, 18, 32, 0.055)",
                  color: palette.shadow,
                  offset: { width: 0, height: 10 },
                  opacity: 0.055,
                  radius: 24,
                }),
              }}
            >
              {suggestedTopics.map((topic, index) => (
                <SuggestedTopicRow
                  key={topic.apiTopic}
                  onPress={() => onSelectTopic(topic.apiTopic)}
                  palette={palette}
                  showDivider={index < suggestedTopics.length - 1}
                  topic={topic}
                />
              ))}
            </View>
          </View>
          ) : null}
        </ScrollView>
          </View>
          <View
            accessibilityElementsHidden={!detailVisible}
            aria-hidden={!detailVisible}
            importantForAccessibility={!detailVisible ? "no-hide-descendants" : "auto"}
            style={{ backgroundColor: palette.background, flex: 1, width }}
          >
            <BibleTopicDetailPane
              bibleVersionId={bibleVersionId}
              bibleVersionLabel={bibleVersionLabel}
              error={error}
              loading={loading}
              onBack={onBack}
              onSelectReference={onSelectReference}
              onVote={onVote}
              palette={palette}
              references={references}
              source={source}
              topic={topic}
              userVotes={userVotes}
              voteError={voteError}
              votePending={votePending}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SuggestedTopicRow({
  onPress,
  palette,
  showDivider,
  topic,
}: {
  onPress: () => void;
  palette: ReaderPalette;
  showDivider: boolean;
  topic: SuggestedTopic;
}) {
  const { t } = useAppTranslation();
  const tone = {
    blue: { background: colors.reflectionSoft, color: colors.textMuted },
    green: { background: colors.rhythmSoft, color: colors.textMuted },
    peach: { background: colors.warmSoft, color: colors.textMuted },
    rose: { background: colors.prayerSoft, color: colors.textMuted },
  }[topic.tone];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderBottomColor: showDivider ? palette.line : "transparent",
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 68,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: tone.background,
          borderRadius: 999,
          height: 38,
          justifyContent: "center",
          width: 38,
        }}
      >
        <Feather name={topic.icon} size={17} color={tone.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>
          {t(topic.titleKey)}
        </Text>
        <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>
          {t(topic.subtitleKey)}
        </Text>
      </View>
      <Feather name="chevron-right" size={17} color={palette.muted} />
    </Pressable>
  );
}

function TopicIndexRow({
  item,
  onPress,
  palette,
  showDivider,
}: {
  item: BibleTopicIndexItem;
  onPress: () => void;
  palette: ReaderPalette;
  showDivider: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderBottomColor: showDivider ? palette.line : "transparent",
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 10,
        minHeight: 54,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <Text numberOfLines={2} style={{ color: palette.text, flex: 1, fontSize: 14, fontWeight: "800", lineHeight: 19, textTransform: "none" }}>
        {item.name}
      </Text>
      <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>
        {item.passageCount === 1
          ? t("bible.topics.passage.single")
          : t("bible.topics.passage.count", { count: item.passageCount })}
      </Text>
      <Feather name="chevron-right" size={16} color={palette.muted} />
    </Pressable>
  );
}
