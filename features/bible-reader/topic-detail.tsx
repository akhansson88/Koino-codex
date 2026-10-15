import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bibleVerseFromReference, type BibleVersionId } from "@/features/bible-kjv";
import { displayBibleReference } from "@/features/bible-search";
import type { BibleVerse } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, platformShadow, radius } from "@/ui/theme";
import {
  type BibleTopicReference,
  type BibleTopicVoteValue,
  type ReaderPalette,
  type BibleTopicResult,
} from "@/features/bible-reader/types";
import { localizedTopicTitle, bibleTopicVoteKey } from "@/features/bible-reader/topics-api";
import { ReaderCircleButton } from "@/features/bible-reader/header";
import { useBibleAudio } from "@/features/bible-audio/provider";
import { TopicPassageAudioControl, TopicPlaybackPanel } from "@/features/bible-audio/topic-controls";
import { topicDefinition, topicReferenceItemIds } from "@/features/bible-audio/topic-definition";
import type { TopicDefinition } from "@/features/bible-audio/topic-playback";

export function BibleTopicDetailPane({
  bibleVersionId,
  bibleVersionLabel,
  error,
  loading,
  onBack,
  onSelectReference,
  onVote,
  palette,
  references,
  source,
  topic,
  userVotes,
  voteError,
  votePending,
}: {
  bibleVersionId: BibleVersionId;
  bibleVersionLabel: string;
  error?: string;
  loading: boolean;
  onBack: () => void;
  onSelectReference: (reference: string) => void;
  onVote: (reference: BibleTopicReference, value: BibleTopicVoteValue) => void;
  palette: ReaderPalette;
  references: BibleTopicReference[];
  source: BibleTopicResult["source"];
  topic: string;
  userVotes: Record<string, BibleTopicVoteValue>;
  voteError?: string;
  votePending: string;
}) {
  const { t } = useAppTranslation();
  const audio = useBibleAudio();
  const bookLanguage = useBibleBookLanguage(bibleVersionLabel);
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const cardOffsets = useRef<Record<number, number>>({});
  const [isFollowing, setIsFollowing] = useState(true);
  const [panelHeight, setPanelHeight] = useState(160);

  useEffect(() => { void audio.refresh(); }, [audio.refresh]);
  const resolvedVerses = useMemo(
    () =>
      references.map((item) => ({
        reference: item.reference,
        verse: bibleVerseFromReference(item.reference, bibleVersionId),
        votes: item.votes,
        voteId: item.voteId,
      })),
    [bibleVersionId, references],
  );
  const title = localizedTopicTitle(topic, t);
  const definition = useMemo(() => topicDefinition({
    topic,
    title,
    translation: bibleVersionId,
    references: resolvedVerses.map((item) => ({ ...item, displayedReference: displayBibleReference(item.reference, bookLanguage) })),
  }), [bibleVersionId, bookLanguage, resolvedVerses, title, topic]);
  const itemIds = useMemo(() => topicReferenceItemIds(resolvedVerses), [resolvedVerses]);

  const activeTopicSession = audio.session?.topic?.definition.id === definition.id ? audio.session.topic : undefined;
  const activeItem = activeTopicSession ? activeTopicSession.definition.items[activeTopicSession.itemIndex] : undefined;
  const activeVerseIndex = activeItem ? resolvedVerses.findIndex((_, index) => itemIds[index] === activeItem.id) : -1;

  // Pending item when playback has been requested but audio has not started yet
  const pendingItemId = audio.pendingTopic?.definition.id === definition.id ? (audio.pendingTopic.options.initialItemId ?? audio.pendingTopic.definition.items[0]?.id) : undefined;

  // Check if current verse is ending so we scroll to the next passage before its audio plays
  const currentVerse = audio.session?.chapter.verses[audio.session.index];
  const isLastVerseOfPassage = Boolean(currentVerse && activeItem && currentVerse.verse === activeItem.endVerse);
  const isNearEndOfPassage = Boolean(isLastVerseOfPassage && activeTopicSession && (audio.position >= (currentVerse?.duration ?? 0) - 0.5));

  // Determine target item to scroll to before audio plays
  let targetItemId = pendingItemId;
  if (!targetItemId && activeTopicSession) {
    if ((activeTopicSession.phase === "gap" || (isNearEndOfPassage && activeTopicSession.pauseSeconds === 0)) && activeTopicSession.loop !== "passage") {
      const nextIndex = activeTopicSession.itemIndex + 1;
      if (nextIndex < activeTopicSession.definition.items.length) {
        targetItemId = activeTopicSession.definition.items[nextIndex]?.id;
      } else if (activeTopicSession.loop === "topic") {
        targetItemId = activeTopicSession.definition.items[0]?.id;
      } else {
        targetItemId = activeTopicSession.definition.items[activeTopicSession.itemIndex]?.id;
      }
    } else {
      targetItemId = activeTopicSession.definition.items[activeTopicSession.itemIndex]?.id;
    }
  }

  const targetVerseIndex = targetItemId ? resolvedVerses.findIndex((_, index) => itemIds[index] === targetItemId) : activeVerseIndex;
  const isTopicPlaying = Boolean((activeTopicSession || audio.pendingTopic?.definition.id === definition.id) && (audio.playWhenReady || audio.loading || activeTopicSession?.phase === "gap"));

  const scrollToActiveVerse = useCallback((animated = true) => {
    if (targetVerseIndex >= 0 && cardOffsets.current[targetVerseIndex] !== undefined) {
      const offset = Math.max(0, cardOffsets.current[targetVerseIndex] - 16);
      scrollViewRef.current?.scrollTo({ y: offset, animated });
    }
  }, [targetVerseIndex]);

  // When a pending topic action starts, ensure following is active and scroll immediately
  useEffect(() => {
    if (audio.pendingTopic?.definition.id === definition.id) {
      setIsFollowing(true);
    }
  }, [audio.pendingTopic, definition.id]);

  useEffect(() => {
    if (isFollowing && targetVerseIndex >= 0) {
      scrollToActiveVerse(true);
    }
  }, [targetVerseIndex, isFollowing, scrollToActiveVerse]);

  return (
    <View style={{ backgroundColor: palette.background, flex: 1 }}>
        <View
          style={{
            alignItems: "center",
            borderBottomColor: palette.line,
            borderBottomWidth: 1,
            flexDirection: "row",
            gap: 12,
            paddingBottom: 14,
            paddingHorizontal: 18,
            paddingTop: insets.top + 12,
          }}
        >
          <ReaderCircleButton accessibilityLabel={t("bible.topics.back")} icon="arrow-left" onPress={onBack} palette={palette} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>
              {title}
            </Text>
            <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>
              {loading
                ? t("bible.topics.searchingSource")
                : references.length === 1
                  ? t("bible.topics.reference.single", { translation: bibleVersionLabel })
                  : t("bible.topics.reference.count", { count: references.length, translation: bibleVersionLabel })}
            </Text>
          </View>
          <View style={{ height: 46, width: 46 }} />
        </View>

        <ScrollView
          ref={scrollViewRef}
          onScrollBeginDrag={() => {
            setIsFollowing(false);
          }}
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            alignSelf: "center",
            gap: 12,
            maxWidth: 720,
            paddingBottom: Math.max(32, insets.bottom + 190),
            paddingHorizontal: 18,
            paddingTop: 18,
            width: "100%",
          }}
        >
          {loading ? (
            <View
              style={{
                alignItems: "center",
                backgroundColor: palette.surface,
                borderColor: palette.line,
                borderRadius: radius.lg,
                borderWidth: 1,
                gap: 12,
                padding: 22,
              }}
            >
              <ActivityIndicator color={palette.accent} />
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "800" }}>{t("bible.topics.searching", { topic: title.toLocaleLowerCase() })}</Text>
            </View>
          ) : error ? (
            <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, gap: 8, padding: 16 }}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>{t("bible.topics.errorTitle")}</Text>
              <Text selectable style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>
                {t("bible.topics.errorBody")}
              </Text>
            </View>
          ) : resolvedVerses.length > 0 ? (
            <>
              <View style={{ backgroundColor: palette.peach, borderRadius: radius.md, gap: 3, paddingHorizontal: 13, paddingVertical: 11 }}>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: "800", lineHeight: 18 }}>
                  {source === "openbible" ? t("bible.topics.voteSource") : t("bible.topics.textSearchSource", { translation: bibleVersionLabel })}
                </Text>
                {source === "openbible" && voteError ? <Text style={{ color: palette.danger, fontSize: 12, fontWeight: "800", lineHeight: 18 }}>{t("bible.topics.voteError")}</Text> : null}
              </View>
            {resolvedVerses.map((item, index) => (
              <View
                key={`${item.reference}-${index}`}
                onLayout={(e) => {
                  const y = e.nativeEvent.layout.y;
                  cardOffsets.current[index] = y;
                  if (isFollowing && targetVerseIndex === index) {
                    const offset = Math.max(0, y - 16);
                    scrollViewRef.current?.scrollTo({ y: offset, animated: false });
                  }
                }}
              >
                <TopicVerseCard
                  bibleVersionLabel={bibleVersionLabel}
                  definition={definition}
                  item={item}
                  itemId={itemIds[index]}
                  onPress={item.verse ? () => onSelectReference(item.reference) : undefined}
                  onVote={(value) => onVote(item, value)}
                  palette={palette}
                  userVote={item.voteId ? userVotes[bibleTopicVoteKey(topic, item.voteId)] : undefined}
                  voting={Boolean(item.voteId && votePending === bibleTopicVoteKey(topic, item.voteId))}
                  isPlaying={activeVerseIndex === index}
                />
              </View>
            ))}
            </>
          ) : (
            <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 16 }}>
              <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "800", lineHeight: 20 }}>{t("bible.topics.empty")}</Text>
            </View>
          )}
        </ScrollView>

        {resolvedVerses.length > 0 && !loading && !error ? (
          <View onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}>
            <TopicPlaybackPanel definition={definition} palette={palette} insets={insets} />
          </View>
        ) : null}

        {!isFollowing && activeVerseIndex >= 0 && isTopicPlaying ? (
          <View
            style={{
              position: "absolute",
              bottom: panelHeight + 12,
              alignSelf: "center",
              zIndex: 100,
              elevation: 12,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("bible.topics.audio.sync")}
              onPress={() => {
                setIsFollowing(true);
                scrollToActiveVerse(true);
              }}
              style={{
                alignItems: "center",
                backgroundColor: palette.peach,
                borderColor: palette.accent,
                borderWidth: 1.5,
                borderRadius: 20,
                flexDirection: "row",
                gap: 7,
                minHeight: 40,
                paddingHorizontal: 16,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
                elevation: 12,
              }}
            >
              <Feather name="navigation" size={15} color={palette.accent} />
              <Text style={{ color: palette.accent, fontSize: 13, fontWeight: "800" }}>
                {t("bible.topics.audio.sync")}
              </Text>
            </Pressable>
          </View>
        ) : null}
    </View>
  );
}

function TopicVerseCard({
  bibleVersionLabel,
  definition,
  item,
  itemId,
  onPress,
  onVote,
  palette,
  userVote,
  voting,
  isPlaying = false,
}: {
  bibleVersionLabel: string;
  definition: TopicDefinition;
  item: BibleTopicReference & { verse?: BibleVerse };
  itemId: string;
  onPress?: () => void;
  onVote: (value: BibleTopicVoteValue) => void;
  palette: ReaderPalette;
  userVote?: BibleTopicVoteValue;
  voting: boolean;
  isPlaying?: boolean;
}) {
  const bookLanguage = useBibleBookLanguage(item.verse?.translation);
  const { t } = useAppTranslation();
  const displayedReference = displayBibleReference(item.reference, bookLanguage);
  return (
    <View
      style={{
        backgroundColor: palette.surface,
        borderColor: isPlaying ? palette.accent : palette.line,
        borderRadius: radius.lg,
        borderWidth: isPlaying ? 2 : 1,
        gap: 9,
        padding: 15,
        ...platformShadow({
          boxShadow: "0 8px 20px rgba(11, 18, 32, 0.045)",
          color: palette.shadow,
          offset: { width: 0, height: 8 },
          opacity: 0.045,
          radius: 18,
        }),
      }}
    >
      <Pressable
        accessibilityLabel={onPress ? t("bible.navigator.openPassage", { reference: displayedReference }) : undefined}
        accessibilityRole={onPress ? "button" : undefined}
        disabled={!onPress}
        onPress={onPress}
        style={{ gap: 9 }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <View style={{ alignItems: "center", backgroundColor: isPlaying ? palette.accent : palette.peach, borderRadius: 999, height: 28, justifyContent: "center", width: 28 }}>
            <Feather name={isPlaying ? "volume-2" : "book-open"} size={14} color={isPlaying ? palette.surface : palette.accent} />
          </View>
          <Text selectable style={{ color: isPlaying ? palette.accent : palette.text, flex: 1, fontSize: 16, fontWeight: "900" }}>
            {displayedReference}
          </Text>
        </View>
        {item.verse ? (
          <>
            <Text selectable style={{ color: palette.text, fontSize: 16, fontWeight: "500", lineHeight: 25 }}>
              {item.verse.text}
            </Text>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{item.verse.translation ?? bibleVersionLabel}</Text>
          </>
        ) : (
          <Text selectable style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>
            {t("bible.topics.unavailable", { translation: bibleVersionLabel })}
          </Text>
        )}
      </Pressable>
      <TopicPassageAudioControl definition={definition} itemId={itemId} reference={displayedReference} palette={palette} />
      {item.voteId ? <View style={{ alignItems: "center", borderTopColor: palette.line, borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", paddingTop: 11 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          {voting ? <ActivityIndicator color={palette.muted} size="small" /> : <Feather name="thumbs-up" size={13} color={palette.muted} />}
          <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800" }}>
            {t("bible.topics.helpfulVotes", { count: item.votes.toLocaleString() })}
          </Text>
        </View>
        <View accessibilityLabel={t("bible.topics.ratePassage", { reference: displayedReference })} style={{ flexDirection: "row", gap: 7 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !item.voteId || Boolean(userVote) || voting, selected: userVote === 1 }}
            disabled={!item.voteId || Boolean(userVote) || voting}
            onPress={() => onVote(1)}
            style={{
              alignItems: "center",
              backgroundColor: userVote === 1 ? palette.peach : palette.surface,
              borderColor: userVote === 1 ? palette.accent : palette.line,
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 5,
              minHeight: 44,
              opacity: !item.voteId || (Boolean(userVote) && userVote !== 1) ? 0.55 : 1,
              paddingHorizontal: 10,
            }}
          >
            <Feather name="thumbs-up" size={13} color={userVote === 1 ? palette.accent : palette.muted} />
            <Text style={{ color: userVote === 1 ? palette.accent : palette.text, fontSize: 11, fontWeight: "800" }}>{t("bible.topics.helpful")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !item.voteId || Boolean(userVote) || voting, selected: userVote === -1 }}
            disabled={!item.voteId || Boolean(userVote) || voting}
            onPress={() => onVote(-1)}
            style={{
              alignItems: "center",
              backgroundColor: userVote === -1 ? colors.prayerSoft : palette.surface,
              borderColor: userVote === -1 ? palette.danger : palette.line,
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 5,
              minHeight: 44,
              opacity: !item.voteId || (Boolean(userVote) && userVote !== -1) ? 0.55 : 1,
              paddingHorizontal: 10,
            }}
          >
            <Feather name="thumbs-down" size={13} color={userVote === -1 ? palette.danger : palette.muted} />
            <Text style={{ color: userVote === -1 ? palette.danger : palette.text, fontSize: 11, fontWeight: "800" }}>{t("bible.topics.notHelpful")}</Text>
          </Pressable>
        </View>
      </View> : null}
    </View>
  );
}
