import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { NativePressable } from "@/ui/native-pressable";
import { memo, useCallback, useMemo, useRef } from "react";
import { type LayoutChangeEvent, Platform, Text, TextStyle, View, ViewStyle } from "react-native";
import { bibleTextSegments } from "@/features/bible-footnotes";
import {
  type BibleChapterSubtitle,
  type BibleChapterVerse,
  type BibleFootnote,
  type BiblePosition,
} from "@/features/bible-kjv";
import { type BiblePlanMarker } from "@/features/bible-plans";
import type { BibleHighlightColor } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { radius } from "@/ui/theme";
import { type MeasurableView, type ReaderPalette } from "@/features/bible-reader/types";
import { defaultFontSize, fontFamilyFor } from "@/features/bible-reader/preferences";
import { highlightColorWithOpacity, referenceLabel } from "@/features/bible-reader/verse-helpers";
import { BiblePlanInlineMarker } from "@/features/bible-reader/plan-panel";

const bibleVerseWebInteractionStyle =
  Platform.OS === "web"
    ? ({
        userSelect: "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
      } as TextStyle & ViewStyle)
    : undefined;

export const BibleText = memo(function BibleText({
  chapterHeading,
  spokenVerse,
  chapterHighlightByVerse,
  highlightedPosition,
  onFootnotePress,
  onVersePress,
  onVersePressIn,
  onVerseLayout,
  onVerseLongPress,
  onVerseRef,
  palette,
  planMarkers,
  position,
  readerLineHeight,
  readerTextStyle,
  selectedVerseNumbers,
  selectedVersePosition,
  showVerseNumbers,
  subtitles,
  verses,
}: {
  chapterHeading?: string;
  spokenVerse?: number;
  chapterHighlightByVerse: Record<number, BibleHighlightColor>;
  highlightedPosition?: BiblePosition;
  onFootnotePress: (marker: string, footnote: BibleFootnote, verse: number) => void;
  onVersePress: (verse: number) => void;
  onVersePressIn: () => void;
  onVerseLayout: (verse: number, offset: number) => void;
  onVerseLongPress: (verse: number) => void;
  onVerseRef: (verse: number, node: MeasurableView | null) => void;
  palette: ReaderPalette;
  planMarkers: BiblePlanMarker[];
  position: BiblePosition;
  readerLineHeight: number;
  readerTextStyle: TextStyle;
  selectedVerseNumbers: number[];
  selectedVersePosition?: BiblePosition;
  showVerseNumbers: boolean;
  subtitles: BibleChapterSubtitle[];
  verses: BibleChapterVerse[];
}) {
  const bookLanguage = useBibleBookLanguage();
  const textOffsetRef = useRef<number | undefined>(undefined);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const verseFontSize = Math.max(10, Number(readerTextStyle.fontSize ?? defaultFontSize) * 0.7);
  const verseNumberStyle: TextStyle = useMemo(() => ({
    color: palette.accent,
    fontFamily: readerTextStyle.fontFamily,
    fontSize: verseFontSize,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    lineHeight: readerLineHeight,
    marginTop: -verseFontSize * 0.55,
  }), [palette.accent, readerTextStyle.fontFamily, readerLineHeight, verseFontSize]);
  const decorations = useMemo(() => new Map(verses.map(item => [item.verse, {
    subtitlesBefore: subtitles.filter(subtitle => subtitle.beforeVerse === item.verse),
    markersBefore: planMarkers.filter(marker => marker.verse === item.verse && marker.kind === "start"),
    markersAfter: planMarkers.filter(marker => marker.verse === item.verse && marker.kind === "finish"),
  }])), [verses, subtitles, planMarkers]);
  const onRowLayout = useCallback((verse: number, offset: number) => {
    verseOffsetsRef.current[verse] = offset;
    if (textOffsetRef.current !== undefined) onVerseLayout(verse, textOffsetRef.current + offset);
  }, [onVerseLayout]);
  return (
    <View
      onLayout={(event) => {
        textOffsetRef.current = event.nativeEvent.layout.y;
        for (const [verse, offset] of Object.entries(verseOffsetsRef.current)) {
          onVerseLayout(Number(verse), textOffsetRef.current + offset);
        }
      }}
      style={{ gap: 7 }}
    >
      {chapterHeading ? (
        <Text
          style={{
            color: palette.text,
            fontFamily: readerTextStyle.fontFamily,
            fontSize: Math.max(18, Number(readerTextStyle.fontSize ?? defaultFontSize) + 2),
            fontWeight: "700",
            lineHeight: Math.round(readerLineHeight * 1.05),
            marginBottom: 12,
          }}
        >
          {chapterHeading}
        </Text>
      ) : null}
      {verses.map((item, index) => {
        const highlighted = highlightedPosition?.book === position.book && highlightedPosition.chapter === position.chapter && highlightedPosition.verse === item.verse;
        const actionSelected = selectedVersePosition?.book === position.book && selectedVersePosition.chapter === position.chapter && selectedVersePosition.verse === item.verse;
        return <BibleVerseRow
          key={item.reference}
          item={item}
          chapterNumber={position.chapter}
          reference={referenceLabel({ ...position, verse: item.verse }, bookLanguage)}
          isFirstVerse={index === 0}
          temporarySelected={highlighted || actionSelected || selectedVerseNumbers.includes(item.verse)}
          persistedHighlightColor={chapterHighlightByVerse[item.verse]}
          spoken={item.verse === spokenVerse}
          onFootnotePress={onFootnotePress}
          onVersePress={onVersePress}
          onVersePressIn={onVersePressIn}
          onVerseLongPress={onVerseLongPress}
          onVerseRef={onVerseRef}
          onRowLayout={onRowLayout}
          palette={palette}
          readerLineHeight={readerLineHeight}
          readerTextStyle={readerTextStyle}
          verseNumberStyle={verseNumberStyle}
          showVerseNumbers={showVerseNumbers}
          {...decorations.get(item.verse)!}
        />;
      })}
    </View>
  );
});

type VerseRowProps = Pick<Parameters<typeof BibleText>[0],
  "onFootnotePress" | "onVersePress" | "onVersePressIn" | "onVerseLongPress" | "onVerseRef" | "palette" | "readerLineHeight" | "readerTextStyle" | "showVerseNumbers"
> & {
  item: BibleChapterVerse;
  chapterNumber: number;
  reference: string;
  isFirstVerse: boolean;
  temporarySelected: boolean;
  persistedHighlightColor?: BibleHighlightColor;
  spoken: boolean;
  onRowLayout: (verse: number, offset: number) => void;
  verseNumberStyle: TextStyle;
  subtitlesBefore: BibleChapterSubtitle[];
  markersBefore: BiblePlanMarker[];
  markersAfter: BiblePlanMarker[];
};

const BibleVerseRow = memo(function BibleVerseRow({
  item, chapterNumber, reference, isFirstVerse, temporarySelected, persistedHighlightColor, spoken,
  onFootnotePress, onVersePress, onVersePressIn, onVerseLongPress, onVerseRef, onRowLayout,
  palette, readerLineHeight, readerTextStyle, verseNumberStyle, showVerseNumbers,
  subtitlesBefore, markersBefore, markersAfter,
}: VerseRowProps) {
  const selected = temporarySelected || Boolean(persistedHighlightColor);
  const persistedHighlightStyle = persistedHighlightColor
    ? { backgroundColor: highlightColorWithOpacity(persistedHighlightColor, 0.16) }
    : undefined;
  const handleLayout = useCallback((event: LayoutChangeEvent) => onRowLayout(item.verse, event.nativeEvent.layout.y), [item.verse, onRowLayout]);
  const handleRef = useCallback((node: MeasurableView | null) => onVerseRef(item.verse, node), [item.verse, onVerseRef]);
  return (
  <View
    key={item.reference}
    collapsable={false}
    onLayout={handleLayout}
    ref={handleRef}
    style={{ gap: 5, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: spoken ? palette.accent : "transparent", backgroundColor: spoken ? palette.peach : undefined }}
  >
  {subtitlesBefore.map((subtitle) => (
    <Text
      key={`${item.reference}-${subtitle.beforeVerse}-${subtitle.text}`}
      style={{
        color: palette.accent,
        fontFamily: readerTextStyle.fontFamily,
        fontSize: Math.max(15, Number(readerTextStyle.fontSize ?? defaultFontSize) - 1),
        fontWeight: "800",
        lineHeight: Math.round(readerLineHeight * 0.95),
        paddingBottom: 5,
        paddingTop: isFirstVerse ? 0 : 14,
      }}
    >
      {subtitle.text}
    </Text>
  ))}
  {markersBefore.map((marker) => (
    <BiblePlanInlineMarker key={`${marker.planId}-${marker.kind}-${marker.verse}`} kind={marker.kind} label={marker.label} palette={palette} />
  ))}
  <NativePressable
    accessibilityLabel={reference}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    onLongPress={() => onVerseLongPress(item.verse)}
    onPress={() => onVersePress(item.verse)}
    onPressIn={onVersePressIn}
    style={{
      ...bibleVerseWebInteractionStyle,
      backgroundColor: temporarySelected ? palette.peach : "transparent",
      borderColor: "transparent",
      borderRadius: radius.md,
      borderWidth: 1,
      marginHorizontal: -10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    }}
  >
    {isFirstVerse ? (
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
        <Text
          style={{
            ...bibleVerseWebInteractionStyle,
            color: palette.accent,
            fontFamily: fontFamilyFor("classic"),
            fontSize: 44,
            fontWeight: "500",
            lineHeight: 50,
            minWidth: 28,
          }}
        >
          {chapterNumber}
        </Text>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
          {showVerseNumbers ? <Text style={[verseNumberStyle, bibleVerseWebInteractionStyle, persistedHighlightStyle]}>{item.verse} </Text> : null}
          <BibleVerseText
            footnotes={item.footnotes}
            onFootnotePress={(marker, footnote) => onFootnotePress(marker, footnote, item.verse)}
            palette={palette}
            persistedHighlightStyle={persistedHighlightStyle}
            readerTextStyle={readerTextStyle}
            reference={reference}
            text={item.text}
          />
        </View>
      </View>
    ) : (
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        {showVerseNumbers ? <Text style={[verseNumberStyle, bibleVerseWebInteractionStyle, persistedHighlightStyle]}>{item.verse} </Text> : null}
        <BibleVerseText
          footnotes={item.footnotes}
          onFootnotePress={(marker, footnote) => onFootnotePress(marker, footnote, item.verse)}
          palette={palette}
          persistedHighlightStyle={persistedHighlightStyle}
          readerTextStyle={readerTextStyle}
          reference={reference}
          text={item.text}
        />
      </View>
    )}
  </NativePressable>
  {markersAfter.map((marker) => (
    <BiblePlanInlineMarker key={`${marker.planId}-${marker.kind}-${marker.verse}`} kind={marker.kind} label={marker.label} palette={palette} />
  ))}
  </View>
  );
});

function BibleVerseText({
  footnotes,
  onFootnotePress,
  palette,
  persistedHighlightStyle,
  readerTextStyle,
  reference,
  text,
}: {
  footnotes: BibleFootnote[];
  onFootnotePress: (marker: string, footnote: BibleFootnote) => void;
  palette: ReaderPalette;
  persistedHighlightStyle?: TextStyle;
  readerTextStyle: TextStyle;
  reference: string;
  text: string;
}) {
  const { t } = useAppTranslation();
  const segments = useMemo(() => bibleTextSegments(text, footnotes), [footnotes, text]);
  const markerFontSize = Math.max(10, Number(readerTextStyle.fontSize ?? defaultFontSize) * 0.66);

  return (
    <Text style={[readerTextStyle, bibleVerseWebInteractionStyle, { flex: 1 }]}>
      <Text style={[bibleVerseWebInteractionStyle, persistedHighlightStyle]}>
        {segments.map((segment, index) => {
          if (segment.kind === "text") return segment.text;
          return (
            <Text
              accessibilityLabel={t("bible.footnote.open", { marker: segment.marker, reference })}
              accessibilityRole="button"
              key={`footnote-${index}-${segment.marker}`}
              onPress={(event) => {
                event.stopPropagation();
                onFootnotePress(segment.marker, segment.footnote);
              }}
              style={{
                color: palette.accent,
                fontSize: markerFontSize,
                fontWeight: "900",
                textDecorationLine: "underline",
              }}
            >
              {segment.appended ? " " : ""}{segment.marker}
            </Text>
          );
        })}
      </Text>
    </Text>
  );
}
