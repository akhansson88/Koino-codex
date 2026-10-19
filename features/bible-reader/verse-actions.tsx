import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { AppSheet, SheetActionRow, SheetScrollView, type AppSheetHandle } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextStyle, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  bibleCrossReferences,
  type BibleCrossReference,
  type BiblePosition,
  type BibleVersionId,
} from "@/features/bible-kjv";
import { displayBibleBookName, displayBibleReference } from "@/features/bible-search";
import type { BibleHighlightPaletteColor, SavedVerse } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, platformShadow, radius } from "@/ui/theme";
import { type ReaderPalette, type VerseQuickAction } from "@/features/bible-reader/types";
import {
  bibleSheetTopPadding,
  bibleSheetHandleHeight,
  BibleSheetTop,
  bibleSheetHorizontalPadding,
} from "@/features/bible-reader/sheet-primitives";
import { referenceLabel } from "@/features/bible-reader/verse-helpers";
import { ReaderCircleButton } from "@/features/bible-reader/header";

export function SelectedVerseSuggestionBar({
  bottom,
  canDeleteHighlight,
  highlightColors,
  maxWidth,
  onClear,
  onDeleteHighlight,
  onHeightChange,
  onHighlight,
  onManageColors,
  onSave,
  palette,
  reference,
  saved,
  saving,
  verseCount,
}: {
  bottom: number;
  canDeleteHighlight: boolean;
  highlightColors: BibleHighlightPaletteColor[];
  maxWidth?: number;
  onClear: () => void;
  onDeleteHighlight: () => void;
  onHeightChange: (height: number) => void;
  onHighlight: (color: BibleHighlightPaletteColor) => void;
  onManageColors: () => void;
  onSave: () => void;
  palette: ReaderPalette;
  reference: string;
  saved: boolean;
  saving: boolean;
  verseCount: number;
}) {
  const { t } = useAppTranslation();

  return (
    <View pointerEvents="box-none" style={{ alignItems: "center", bottom, left: 0, paddingHorizontal: 18, position: "absolute", right: 0, zIndex: 30 }}>
      <View
        onLayout={(event) => onHeightChange(Math.ceil(event.nativeEvent.layout.height))}
        style={{
          alignItems: "stretch",
          backgroundColor: palette.surface,
          borderColor: palette.line,
          borderRadius: radius.xl,
          borderWidth: 1,
          gap: 9,
          maxWidth,
          padding: 10,
          width: "100%",
          ...platformShadow({
            boxShadow: "0 14px 32px rgba(11, 18, 32, 0.16)",
            color: palette.shadow,
            offset: { width: 0, height: 12 },
            opacity: 0.15,
            radius: 26,
          }),
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>
              {reference}
            </Text>
            <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
              {t(verseCount === 1 ? "bible.selection.single" : "bible.selection.multiple", { count: verseCount })}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={t("bible.selection.clear")}
            accessibilityRole="button"
            disabled={saving}
            onPress={onClear}
            style={{
              alignItems: "center",
              backgroundColor: palette.input,
              borderColor: palette.line,
              borderRadius: 999,
              borderWidth: 1,
              height: 44,
              justifyContent: "center",
              opacity: saving ? 0.58 : 1,
              width: 44,
            }}
          >
            <Feather name="x" size={18} color={palette.accent} />
          </Pressable>
          <Pressable
            accessibilityLabel={t(saved ? "bible.selection.removeAccessibility" : "bible.selection.saveAccessibility", { reference })}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={onSave}
            style={{
              alignItems: "center",
              backgroundColor: saving ? palette.line : palette.peach,
              borderColor: palette.line,
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 8,
              justifyContent: "center",
              minHeight: 44,
              opacity: saving ? 0.68 : 1,
              paddingHorizontal: 12,
            }}
          >
            <Feather name="bookmark" size={16} color={saving ? palette.muted : palette.accent} />
            <Text numberOfLines={1} style={{ color: saving ? palette.muted : palette.text, fontSize: 13, fontWeight: "900" }}>
              {t(saving
                ? saved ? "bible.selection.removing" : "bible.selection.saving"
                : saved
                  ? "bible.selection.remove"
                  : verseCount === 1 ? "bible.selection.saveVerse" : "bible.selection.savePassage")}
            </Text>
          </Pressable>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", minHeight: 38 }}>
          <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{t("bible.selection.highlight")}</Text>
          {highlightColors.slice(0, 8).map((option) => (
            <Pressable
              accessibilityLabel={`${option.label} highlight ${reference}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              key={option.id}
              onPress={() => onHighlight(option)}
              style={{
                alignItems: "center",
                backgroundColor: option.hex,
                borderColor: palette.line,
                borderRadius: 999,
                borderWidth: 1,
                height: 34,
                justifyContent: "center",
                opacity: saving ? 0.58 : 1,
                width: 34,
              }}
            />
          ))}
          <Pressable
            accessibilityLabel={t("bible.selection.manageColors")}
            accessibilityRole="button"
            disabled={saving}
            onPress={onManageColors}
            style={{
              alignItems: "center",
              backgroundColor: palette.input,
              borderColor: palette.line,
              borderRadius: 999,
              borderWidth: 1,
              height: 34,
              justifyContent: "center",
              opacity: saving ? 0.58 : 1,
              width: 34,
            }}
          >
            <Feather name="edit-3" size={14} color={palette.accent} />
          </Pressable>
          {canDeleteHighlight ? (
            <Pressable
              accessibilityLabel={t("bible.selection.deleteHighlight", { reference })}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={onDeleteHighlight}
              style={{
                alignItems: "center",
                backgroundColor: palette.input,
                borderColor: palette.line,
                borderRadius: 999,
                borderWidth: 1,
                height: 34,
                justifyContent: "center",
                opacity: saving ? 0.58 : 1,
                width: 34,
              }}
            >
              <Feather name="trash-2" size={15} color={colors.danger} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function VerseActionSheet({
  returnFocusRef,
  onAction,
  bibleVersionId,
  onClose,
  onClosed,
  onReadChapter,
  palette,
  position,
  readerTextStyle,
  saved,
  visible,
}: {
  returnFocusRef: React.RefObject<View | null>;
  onAction: (action: VerseQuickAction) => void;
  bibleVersionId: BibleVersionId;
  onClose: () => void;
  onClosed: () => void;
  onReadChapter: (position: BiblePosition) => void;
  palette: ReaderPalette;
  position?: BiblePosition;
  readerTextStyle: TextStyle;
  saved: boolean;
  visible: boolean;
}) {
  const bookLanguage = useBibleBookLanguage(bibleVersionId);
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetRef = useRef<AppSheetHandle>(null);

  const [displayedPosition, setDisplayedPosition] = useState(position);
  const [view, setView] = useState<"actions" | "references">("actions");
  const referencesKey = displayedPosition && visible
    ? `${bibleVersionId}:${displayedPosition.book}:${displayedPosition.chapter}:${displayedPosition.verse}` : "";
  const [loadedReferences, setLoadedReferences] = useState<{ key: string; references: BibleCrossReference[] }>();
  const references = loadedReferences?.key === referencesKey ? loadedReferences.references : [];
  useEffect(() => {
    if (!displayedPosition || !visible) return;
    let active = true;
    const frame = requestAnimationFrame(() => {
      const results = bibleCrossReferences(displayedPosition, bibleVersionId);
      if (active) setLoadedReferences({ key: referencesKey, references: results });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [referencesKey]);
  const sheetVerseFontSize = typeof readerTextStyle.fontSize === "number" ? Math.min(16, Math.max(14, readerTextStyle.fontSize - 2)) : 15;
  const sheetVerseLineHeight = Math.round(sheetVerseFontSize * 1.55);
  const bottomPadding = Math.max(28, insets.bottom + 20);
  const contentHeight = bibleSheetTopPadding + bibleSheetHandleHeight + 6 * 72 + bottomPadding;
  const sheetHeight = Math.min(height * 0.78, contentHeight);

  useEffect(() => {
    if (visible && position) { setDisplayedPosition(position); setView("actions"); }
  }, [visible, position]);
  if (!displayedPosition) return null;

  return (
    <AppSheet returnFocusRef={returnFocusRef} ref={sheetRef} title={referenceLabel(displayedPosition, bookLanguage)} onDismiss={onClosed} visible={visible} onClose={onClose} height={sheetHeight} backgroundColor={palette.sheet} foregroundColor={palette.text}>

          <View style={{ flex: 1, paddingBottom: insets.bottom }}>
            <BibleSheetTop palette={palette} />
            {view === "actions" ? (
              <SheetScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: bibleSheetHorizontalPadding }}
                style={{ flex: 1, minHeight: 0 }}
              >
                <VerseSheetAction icon="book-open" onPress={() => setView("references")} palette={palette} subtitle={t("bible.actions.crossReferencesSubtitle")} title={t("bible.actions.crossReferences")} />
                <VerseSheetAction
                  icon="bookmark"
                  onPress={() => onAction("save")}
                  palette={palette}
                  subtitle={saved ? t("bible.actions.unsaveSubtitle") : t("bible.actions.saveSubtitle")}
                  title={saved ? t("bible.actions.unsave") : t("bible.actions.save")}
                />
                <VerseSheetAction icon="edit-3" onPress={() => onAction("journal")} palette={palette} subtitle={t("bible.actions.reflectSubtitle")} title={t("bible.actions.reflect")} />
                <VerseSheetAction icon="heart" onPress={() => onAction("pray")} palette={palette} subtitle={t("bible.actions.praySubtitle")} title={t("bible.actions.pray")} />
                <VerseSheetAction icon="users" onPress={() => onAction("share")} palette={palette} subtitle={t("bible.actions.shareSubtitle")} title={t("bible.actions.share")} />
                <VerseSheetAction icon="edit-2" onPress={() => onAction("highlight")} palette={palette} subtitle={t("bible.actions.highlightSubtitle")} title={t("bible.actions.highlight")} />
              </SheetScrollView>
            ) : (
              <View style={{ flex: 1, gap: 14, minHeight: 0, paddingHorizontal: bibleSheetHorizontalPadding }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                  <ReaderCircleButton accessibilityLabel={t("bible.actions.back")} icon="chevron-left" onPress={() => setView("actions")} palette={palette} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>{t("bible.actions.crossReferences")}</Text>
                    <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{referenceLabel(displayedPosition, bookLanguage)}</Text>
                  </View>
                </View>
                <SheetScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
                  {references.length > 0 ? (
                    references.map((reference, index) => (
                      <View
                        key={`${reference.source}-${index}`}
                        style={{
                          borderBottomColor: index === references.length - 1 ? "transparent" : palette.line,
                          borderBottomWidth: 1,
                          gap: 8,
                          paddingBottom: 18,
                          paddingTop: index === 0 ? 0 : 18,
                        }}
                      >
                        <Pressable
                          accessibilityLabel={`Read ${displayBibleBookName(reference.startPosition.book, bookLanguage)} ${reference.startPosition.chapter}`}
                          accessibilityRole="button"
                          onPress={() => {
                            sheetRef.current?.dismiss(() => onReadChapter(reference.startPosition));
                          }}
                          style={{ gap: 7, justifyContent: "center", minHeight: 54 }}
                        >
                          <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                            <Text style={{ color: palette.text, flex: 1, fontSize: 17, fontWeight: "900" }}>{displayBibleReference(reference.reference, bookLanguage)}</Text>
                            <Feather name="arrow-right" size={17} color={palette.accent} />
                          </View>
                          <Text numberOfLines={3} style={[readerTextStyle, { color: palette.muted, fontSize: sheetVerseFontSize, lineHeight: sheetVerseLineHeight }]}>
                            {reference.text}
                          </Text>
                        </Pressable>
                      </View>
                    ))
                  ) : (
                    <View style={{ backgroundColor: palette.input, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 16 }}>
                      <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "700", lineHeight: 20 }}>{t("bible.actions.crossReferencesEmpty")}</Text>
                    </View>
                  )}
                </SheetScrollView>
              </View>
            )}
          </View>


    </AppSheet>
  );
}

function VerseSheetAction({
  icon,
  onPress,
  palette,
  subtitle,
  title,
  tone = "default",
}: {
  icon: "book-open" | "bookmark" | "edit-2" | "edit-3" | "heart" | "trash-2" | "users";
  onPress: () => void;
  palette: ReaderPalette;
  subtitle: string;
  title: string;
  tone?: "danger" | "default";
}) {
  const destructive = tone === "danger";
  return <SheetActionRow icon={icon} onPress={onPress} title={title} subtitle={subtitle} destructive={tone === "danger"} color={palette.text} />;
}

export function SavedVerseActionSheet({
  onClose,
  onOpen,
  onRemove,
  palette,
  verse,
}: {
  onClose: () => void;
  onOpen: (verse: SavedVerse) => void;
  onRemove: (verse: SavedVerse) => void;
  palette: ReaderPalette;
  verse?: SavedVerse;
}) {
  const sheetRef = useRef<AppSheetHandle>(null);
  const bookLanguage = useBibleBookLanguage();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (!verse) return null;

  const bottomPadding = Math.max(28, insets.bottom + 20);
  const titleLineHeight = 24;
  const contentHeight =
    bibleSheetTopPadding +
    bibleSheetHandleHeight +
    2 +
    titleLineHeight +
    8 +
    2 * 72 +
    bottomPadding;
  const sheetHeight = Math.min(height * 0.92, contentHeight);

  return (
    <AppSheet ref={sheetRef} title={displayBibleReference(verse.reference, bookLanguage, verse.translation)} visible={Boolean(verse)} onClose={onClose} height={sheetHeight} backgroundColor={palette.sheet} foregroundColor={palette.text}>

          <View style={{ flex: 1, paddingBottom: insets.bottom }}>
            <BibleSheetTop palette={palette} />
            <View style={{ paddingHorizontal: bibleSheetHorizontalPadding }}>
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 18, fontWeight: "900", lineHeight: titleLineHeight, paddingBottom: 8 }}>
                {displayBibleReference(verse.reference, bookLanguage, verse.translation)}
              </Text>
              <VerseSheetAction
                icon="book-open"
                onPress={() => sheetRef.current?.dismiss(() => onOpen(verse))}
                palette={palette}
                subtitle={t("bible.saved.actions.openSubtitle")}
                title={t("bible.saved.actions.open")}
              />
              <VerseSheetAction
                icon="trash-2"
                onPress={() => sheetRef.current?.dismiss(() => onRemove(verse))}
                palette={palette}
                subtitle={t("bible.saved.actions.removeSubtitle")}
                title={t("bible.saved.actions.remove")}
                tone="danger"
              />
            </View>
          </View>


    </AppSheet>
  );
}
