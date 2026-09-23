import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
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
  const insets = useSafeAreaInsets();
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
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            alignSelf: "center",
            gap: 12,
            maxWidth: 720,
            paddingBottom: Math.max(32, insets.bottom + 24),
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
              <TopicVerseCard
                key={`${item.reference}-${index}`}
                bibleVersionLabel={bibleVersionLabel}
                item={item}
                onPress={item.verse ? () => onSelectReference(item.reference) : undefined}
                onVote={(value) => onVote(item, value)}
                palette={palette}
                userVote={item.voteId ? userVotes[bibleTopicVoteKey(topic, item.voteId)] : undefined}
                voting={Boolean(item.voteId && votePending === bibleTopicVoteKey(topic, item.voteId))}
              />
            ))}
            </>
          ) : (
            <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 16 }}>
              <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "800", lineHeight: 20 }}>{t("bible.topics.empty")}</Text>
            </View>
          )}
        </ScrollView>
    </View>
  );
}

function TopicVerseCard({
  bibleVersionLabel,
  item,
  onPress,
  onVote,
  palette,
  userVote,
  voting,
}: {
  bibleVersionLabel: string;
  item: BibleTopicReference & { verse?: BibleVerse };
  onPress?: () => void;
  onVote: (value: BibleTopicVoteValue) => void;
  palette: ReaderPalette;
  userVote?: BibleTopicVoteValue;
  voting: boolean;
}) {
  const bookLanguage = useBibleBookLanguage(item.verse?.translation);
  const { t } = useAppTranslation();
  const displayedReference = displayBibleReference(item.reference, bookLanguage);
  return (
    <View
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
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
          <View style={{ alignItems: "center", backgroundColor: palette.peach, borderRadius: 999, height: 28, justifyContent: "center", width: 28 }}>
            <Feather name="book-open" size={14} color={palette.accent} />
          </View>
          <Text selectable style={{ color: palette.text, flex: 1, fontSize: 16, fontWeight: "900" }}>
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
              minHeight: 32,
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
              minHeight: 32,
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
