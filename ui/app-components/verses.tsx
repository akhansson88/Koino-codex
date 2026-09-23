import { displayBibleReference } from "@/features/bible-book-names";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextStyle, View, ViewStyle } from "react-native";
import { bibleVerseIdentity, normalizeBibleVerses } from "@/features/bible-verse-utils";
import { useKoinoActions, useKoinoSelector } from "@/state/koino-store";
import type { BibleVerse } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, typography } from "@/ui/theme";
import { ExpandableBodyText, BodyText } from "@/ui/app-components/text";
import { Card, BottomSheet } from "@/ui/app-components/layout";
import { IconButton, SecondaryButton, PrimaryButton } from "@/ui/app-components/controls";

type VerseActionHandlers = {
  onAddToJournal?: (verse: BibleVerse) => void;
  onOpenInBible?: (verse: BibleVerse) => void;
  onShareToRoom?: (verse: BibleVerse) => void;
};

export function VersePreviewCard({
  compact = false,
  inlineDetail = false,
  interactive = true,
  maxLines,
  onAddToJournal,
  onDetailVisibilityChange,
  onOpenInBible,
  onShareToRoom,
  openAccessibilityLabel,
  openLabel,
  showFullText = false,
  showOpenIndicator = true,
  verse,
}: VerseActionHandlers & {
  compact?: boolean;
  inlineDetail?: boolean;
  interactive?: boolean;
  maxLines?: number;
  onDetailVisibilityChange?: (visible: boolean) => void;
  openAccessibilityLabel?: string;
  openLabel?: string;
  showFullText?: boolean;
  showOpenIndicator?: boolean;
  verse?: BibleVerse;
}) {
  const bookLanguage = useBibleBookLanguage(verse?.translation);
  const savedVerses = useKoinoSelector((state) => state.savedVerses);
  const { t } = useAppTranslation();
  const [detailVisible, setDetailVisible] = useState(false);
  if (!verse) return null;
  const displayVerse = verse;
  const previewLines = maxLines ?? (compact ? 3 : 5);
  const cardOpenLabel = openAccessibilityLabel ?? t("shared.scripture.openReference", { reference: displayBibleReference(displayVerse.reference, bookLanguage) });
  const cardOpenText = openLabel ?? t("shared.scripture.open");
  const openDetail = () => {
    setDetailVisible(true);
    onDetailVisibilityChange?.(true);
  };
  const closeDetail = () => {
    setDetailVisible(false);
    onDetailVisibilityChange?.(false);
  };
  const saved = savedVerses.some((item) => bibleVerseIdentity(item) === bibleVerseIdentity(displayVerse));
  const verseTextStyle: TextStyle = { ...typography.bodyMedium, color: colors.ink, fontSize: compact ? 13 : 14, lineHeight: compact ? 18 : 20 };
  const previewCardStyle: ViewStyle = {
    alignItems: compact ? "flex-start" : "center",
    backgroundColor: colors.input,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: compact ? 12 : 14,
  };
  const header = (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
      <Text numberOfLines={1} style={[typography.label, { color: colors.ink, flex: 1, fontSize: compact ? 12 : 13 }]}>
        {displayBibleReference(displayVerse.reference, bookLanguage)}
      </Text>
      {displayVerse.translation ? <Text style={[typography.caption, { color: colors.muted, fontSize: 11 }]}>{displayVerse.translation}</Text> : null}
    </View>
  );

  return (
    <>
      {showFullText ? (
        <View style={previewCardStyle}>
          <Ionicons name="sunny-outline" size={20} color={colors.olive} />
          <View style={{ flex: 1, gap: 4 }}>
            <Pressable
              accessibilityLabel={cardOpenLabel}
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                openDetail();
              }}
            >
              {header}
            </Pressable>
            <ExpandableBodyText collapsedLines={previewLines} style={verseTextStyle}>
              {displayVerse.text}
            </ExpandableBodyText>
            {showOpenIndicator ? (
              <Pressable
                accessibilityLabel={cardOpenLabel}
                accessibilityRole="button"
                onPress={(event) => {
                  event.stopPropagation();
                  openDetail();
                }}
                style={{ alignSelf: "flex-start" }}
              >
                <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>{cardOpenText}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : interactive ? (
        <Pressable
          accessibilityLabel={cardOpenLabel}
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            openDetail();
          }}
          style={previewCardStyle}
        >
          <Ionicons name="sunny-outline" size={20} color={colors.olive} />
          <View style={{ flex: 1, gap: 4 }}>
            {header}
            <Text numberOfLines={previewLines} style={verseTextStyle}>
              {displayVerse.text}
            </Text>
            {showOpenIndicator ? <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>{cardOpenText}</Text> : null}
          </View>
        </Pressable>
      ) : (
        <View style={previewCardStyle}>
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Ionicons name="sunny-outline" size={20} color={colors.olive} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {header}
            <Text numberOfLines={previewLines} style={verseTextStyle}>
              {displayVerse.text}
            </Text>
          </View>
        </View>
      )}
      {interactive && inlineDetail && detailVisible ? (
        <Card style={{ gap: 12, marginTop: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <IconButton accessibilityLabel={t("shared.scripture.closeDetail")} icon="arrow-left" onPress={closeDetail} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.label, { color: colors.ink }]}>{displayBibleReference(displayVerse.reference, bookLanguage)}</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>{displayVerse.translation ?? t("shared.scripture.bible")}</Text>
            </View>
          </View>
          <Text selectable style={[typography.bodyMedium, { color: colors.ink, fontSize: 15, lineHeight: 23 }]}>
            {displayVerse.text}
          </Text>
          {onOpenInBible ? (
            <SecondaryButton icon="corner-up-right" onPress={(event) => {
              event.stopPropagation();
              closeDetail();
              setTimeout(() => onOpenInBible(displayVerse), 0);
            }}>
              {t("shared.scripture.openInBible")}
            </SecondaryButton>
          ) : null}
        </Card>
      ) : null}
      {interactive && !inlineDetail ? (
        <VerseDetailSheet
          onAddToJournal={onAddToJournal}
          onClose={closeDetail}
          onOpenInBible={onOpenInBible}
          onShareToRoom={onShareToRoom}
          saved={saved}
          verse={displayVerse}
          visible={detailVisible}
        />
      ) : null}
    </>
  );
}

export function VerseCard(props: Parameters<typeof VersePreviewCard>[0]) {
  return <VersePreviewCard {...props} />;
}

export function VerseList({
  compact = false,
  maxLines,
  onAddToJournal,
  onOpenInBible,
  onShareToRoom,
  showFullText = false,
  verse,
  verses,
}: VerseActionHandlers & {
  verse?: BibleVerse;
  verses?: BibleVerse[];
  compact?: boolean;
  maxLines?: number;
  showFullText?: boolean;
}) {
  const visibleVerses = normalizeBibleVerses(verse, verses);
  if (visibleVerses.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {visibleVerses.map((item) => (
        <VersePreviewCard
          key={`${item.reference}-${item.text}`}
          compact={compact}
          maxLines={maxLines}
          onAddToJournal={onAddToJournal}
          onOpenInBible={onOpenInBible}
          onShareToRoom={onShareToRoom}
          showFullText={showFullText}
          verse={item}
        />
      ))}
    </View>
  );
}

export function VerseDetailSheet({
  onAddToJournal,
  onClose,
  onOpenInBible,
  onShareToRoom,
  saved,
  verse,
  visible,
}: VerseActionHandlers & {
  onClose: () => void;
  saved?: boolean;
  verse?: BibleVerse;
  visible: boolean;
}) {
  const bookLanguage = useBibleBookLanguage(verse?.translation);
  const { dispatch } = useKoinoActions();
  const { t } = useAppTranslation();
  const [busy, setBusy] = useState(false);
  if (!verse) return null;
  const currentVerse = verse;

  async function saveVerse() {
    if (busy) return;
    setBusy(true);
    await dispatch({ type: "saveVerse", verse: currentVerse });
    setBusy(false);
  }

  async function addToJournal() {
    if (onAddToJournal) {
      onClose();
      onAddToJournal(currentVerse);
      return;
    }
    await dispatch({
      type: "createJournalEntry",
      body: `Scripture note for ${displayBibleReference(currentVerse.reference, bookLanguage)}.`,
      entryKind: "scripture",
      journalType: "scripture_note",
      title: displayBibleReference(currentVerse.reference, bookLanguage),
      verse: currentVerse,
      verses: [currentVerse],
      shareWithGroup: false,
    });
    onClose();
  }

  async function shareToRoom() {
    if (onShareToRoom) {
      onClose();
      onShareToRoom(currentVerse);
      return;
    }
    await dispatch({
      type: "createPost",
      body: t("community.scripture.shareBody"),
      kind: "scripture",
      title: displayBibleReference(currentVerse.reference, bookLanguage),
      verse: currentVerse,
      verses: [currentVerse],
    });
    onClose();
  }

  function openInBible() {
    onClose();
    if (onOpenInBible) {
      setTimeout(() => onOpenInBible(currentVerse), 220);
      return;
    }
    router.push("/(tabs)/bible" as never);
  }

  return (
    <BottomSheet title={displayBibleReference(verse.reference, bookLanguage)} visible={visible} onClose={onClose}>
      <View style={{ gap: 6 }}>
        <Text style={[typography.sectionLabel, { color: colors.muted }]}>{verse.translation ?? t("shared.scripture.bible")}</Text>
        <Text selectable style={[typography.bodyMedium, { color: colors.ink, fontSize: 17, lineHeight: 26 }]}>
          {verse.text}
        </Text>
      </View>
      {verse.contextBefore || verse.contextAfter ? (
        <Card style={{ backgroundColor: colors.cream }}>
          {verse.contextBefore ? <BodyText muted>{verse.contextBefore}</BodyText> : null}
          {verse.contextAfter ? <BodyText muted>{verse.contextAfter}</BodyText> : null}
        </Card>
      ) : null}
      <PrimaryButton disabled={busy || saved} icon="bookmark" onPress={(event) => {
        event.stopPropagation();
        saveVerse();
      }}>
        {t(saved ? "shared.scripture.savedVerse" : "shared.scripture.saveVerse")}
      </PrimaryButton>
      <SecondaryButton icon="book-open" onPress={(event) => {
        event.stopPropagation();
        addToJournal();
      }}>
        {t("shared.scripture.addToJournal")}
      </SecondaryButton>
      <SecondaryButton icon="users" onPress={(event) => {
        event.stopPropagation();
        shareToRoom();
      }}>
        {t("shared.scripture.shareToCommunity")}
      </SecondaryButton>
      <SecondaryButton icon="corner-up-right" onPress={(event) => {
        event.stopPropagation();
        openInBible();
      }}>
        {t("shared.scripture.openInBible")}
      </SecondaryButton>
    </BottomSheet>
  );
}
