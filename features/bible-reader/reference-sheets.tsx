import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { AppSheet, SheetScrollView, type AppSheetHandle } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { useCallback, useRef } from "react";
import { Pressable, Text, TextStyle, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type BibleCrossReference, type BiblePosition } from "@/features/bible-kjv";
import { displayBibleBookName, displayBibleReference } from "@/features/bible-search";
import { useAppTranslation } from "@/ui/app-language";
import { radius } from "@/ui/theme";
import { type ReaderPalette, type SelectedBibleFootnote } from "@/features/bible-reader/types";
import { BibleSheetTop, bibleSheetHorizontalPadding } from "@/features/bible-reader/sheet-primitives";
import { referenceLabel } from "@/features/bible-reader/verse-helpers";
import { ReaderCircleButton } from "@/features/bible-reader/header";
import { defaultFontSize } from "@/features/bible-reader/preferences";

export function FootnoteSheet({
  onClose: notifyClose,
  palette,
  readerTextStyle,
  selection,
  visible,
}: {
  onClose: () => void;
  palette: ReaderPalette;
  readerTextStyle: TextStyle;
  selection?: SelectedBibleFootnote;
  visible: boolean;
}) {
  const bookLanguage = useBibleBookLanguage();
  const { t } = useAppTranslation();
  const sheetRef = useRef<AppSheetHandle>(null);
  const onClose = useCallback(() => sheetRef.current?.dismiss(), []);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  if (!selection) return null;

  return (
    <AppSheet ref={sheetRef} visible={visible} onClose={notifyClose} height={Math.min(Math.round(height * 0.55), 480)} backgroundColor={palette.sheet} foregroundColor={palette.text}>

          <View style={{ flex: 1, paddingBottom: insets.bottom }}>
            <BibleSheetTop bordered palette={palette}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12, width: "100%" }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>{t("bible.footnote.title")}</Text>
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{referenceLabel(selection.position, bookLanguage)}</Text>
                </View>
                <ReaderCircleButton accessibilityLabel={t("bible.footnote.close")} icon="x" onPress={onClose} palette={palette} />
              </View>
            </BibleSheetTop>
            <SheetScrollView
              contentContainerStyle={{ gap: 16, paddingHorizontal: bibleSheetHorizontalPadding, paddingVertical: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={{
                  alignItems: "center",
                  alignSelf: "flex-start",
                  backgroundColor: palette.peach,
                  borderColor: palette.line,
                  borderRadius: 999,
                  borderWidth: 1,
                  minHeight: 36,
                  justifyContent: "center",
                  minWidth: 44,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ color: palette.accent, fontSize: 16, fontWeight: "900" }}>{selection.marker}</Text>
              </View>
              <Text
                selectable
                style={[
                  readerTextStyle,
                  {
                    color: palette.text,
                    fontSize: Math.max(16, Number(readerTextStyle.fontSize ?? defaultFontSize) - 1),
                    lineHeight: Math.round(Math.max(16, Number(readerTextStyle.fontSize ?? defaultFontSize) - 1) * 1.55),
                  },
                ]}
              >
                {selection.footnote.text}
              </Text>
            </SheetScrollView>
          </View>


    </AppSheet>
  );
}

export function CrossReferenceSheet({
  onClose,
  onReadChapter,
  palette,
  position,
  readerTextStyle,
  references,
  visible,
}: {
  onClose: () => void;
  onReadChapter: (position: BiblePosition) => void;
  palette: ReaderPalette;
  position?: BiblePosition;
  readerTextStyle: TextStyle;
  references: BibleCrossReference[];
  visible: boolean;
}) {
  const bookLanguage = useBibleBookLanguage();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(height * 0.78), 680);
  const sheetRef = useRef<AppSheetHandle>(null);
  const sheetVerseFontSize = typeof readerTextStyle.fontSize === "number" ? Math.min(16, Math.max(14, readerTextStyle.fontSize - 2)) : 15;
  const sheetVerseLineHeight = Math.round(sheetVerseFontSize * 1.55);

  const closeWithAnimation = useCallback((afterClose?: () => void) => sheetRef.current?.dismiss(afterClose), []);

  if (!position) return null;

  return (
    <AppSheet ref={sheetRef} visible={visible} onClose={onClose} height={sheetHeight} backgroundColor={palette.sheet} foregroundColor={palette.text}>
              <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          <BibleSheetTop bordered  palette={palette}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, width: "100%" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>Korsreferenser</Text>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{referenceLabel(position, bookLanguage)}</Text>
              </View>
              <ReaderCircleButton accessibilityLabel="Close cross references" icon="x" onPress={() => closeWithAnimation()} palette={palette} />
            </View>
          </BibleSheetTop>

          <SheetScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: bibleSheetHorizontalPadding, paddingVertical: 18 }}>
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
                    onPress={() => closeWithAnimation(() => onReadChapter(reference.startPosition))}
                    style={{ gap: 7, minHeight: 54, justifyContent: "center" }}
                  >
                    <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                      <Text selectable style={{ color: palette.text, flex: 1, fontSize: 17, fontWeight: "900" }}>
                        {displayBibleReference(reference.reference, bookLanguage)}
                      </Text>
                      <Feather name="arrow-right" size={17} color={palette.accent} />
                    </View>
                    <Text selectable numberOfLines={3} style={[readerTextStyle, { color: palette.muted, fontSize: sheetVerseFontSize, lineHeight: sheetVerseLineHeight }]}>
                      {reference.text}
                    </Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <View style={{ backgroundColor: palette.input, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 16 }}>
                <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "700", lineHeight: 20 }}>Inga korsreferenser för denna vers ännu</Text>
              </View>
            )}
          </SheetScrollView>
        </View>

    </AppSheet>
  );
}
