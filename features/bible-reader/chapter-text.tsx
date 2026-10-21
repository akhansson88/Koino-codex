import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { NativePressable } from "@/ui/native-pressable";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, type NativeSyntheticEvent, PixelRatio, Platform, Text, type TextLayoutEventData, TextStyle, View, ViewStyle } from "react-native";
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
import { groupParagraphVerses, mergeParagraphVerseBounds, paragraphFragments, paragraphOpeningSplit, paragraphProjection, paragraphProjectionSlice, paragraphVerseBounds } from "@/features/bible-reader/paragraph-layout";
import { BibleParagraphChunk, type ParagraphChunkGeometry } from "@/features/bible-reader/paragraph-chunk";

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
  flowingParagraphText = false,
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
  onVerseLayout: (verse: number, offset: number, height?: number) => void;
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
  flowingParagraphText?: boolean;
  subtitles: BibleChapterSubtitle[];
  verses: BibleChapterVerse[];
}) {
  const bookLanguage = useBibleBookLanguage();
  const textOffsetRef = useRef<number | undefined>(undefined);
  const verseOffsetsRef = useRef<Record<number, { offset: number; height?: number }>>({});
  const paragraphs = useMemo(() => groupParagraphVerses(verses, subtitles, planMarkers), [verses, subtitles, planMarkers]);
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
  const onRowLayout = useCallback((verse: number, offset: number, height?: number) => {
    verseOffsetsRef.current[verse] = { offset, height };
    if (textOffsetRef.current !== undefined) {
      if (height === undefined) onVerseLayout(verse, textOffsetRef.current + offset);
      else onVerseLayout(verse, textOffsetRef.current + offset, height);
    }
  }, [onVerseLayout]);
  return (
    <View
      onLayout={(event) => {
        textOffsetRef.current = event.nativeEvent.layout.y;
        for (const [verse, { offset, height }] of Object.entries(verseOffsetsRef.current)) {
          if (height === undefined) onVerseLayout(Number(verse), textOffsetRef.current + offset);
          else onVerseLayout(Number(verse), textOffsetRef.current + offset, height);
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
      {flowingParagraphText ? paragraphs.map((items, index) => (
        <BibleParagraph
          key={items[0].reference}
          verses={items}
          chapterNumber={index === 0 ? position.chapter : undefined}
          position={position}
          chapterHighlightByVerse={chapterHighlightByVerse}
          highlightedPosition={highlightedPosition}
          selectedVersePosition={selectedVersePosition}
          selectedVerseNumbers={selectedVerseNumbers}
          spokenVerse={spokenVerse}
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
          subtitlesBefore={decorations.get(items[0].verse)!.subtitlesBefore}
          markersBefore={decorations.get(items[0].verse)!.markersBefore}
          markersAfter={decorations.get(items[items.length - 1].verse)!.markersAfter}
        />
      )) : verses.map((item, index) => {
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

type ParagraphProps = Pick<Parameters<typeof BibleText>[0],
  "position" | "chapterHighlightByVerse" | "highlightedPosition" | "selectedVersePosition" | "selectedVerseNumbers" | "spokenVerse"
  | "verses" | "onFootnotePress" | "onVersePress" | "onVersePressIn" | "onVerseLongPress" | "onVerseRef"
  | "palette" | "readerLineHeight" | "readerTextStyle" | "showVerseNumbers"
> & Pick<VerseRowProps, "subtitlesBefore" | "markersBefore" | "markersAfter"> & {
  chapterNumber?: number;
  verseNumberStyle: TextStyle;
  onRowLayout: (verse: number, offset: number, height: number) => void;
};

const BibleParagraph = memo(function BibleParagraph({
  verses, chapterNumber, position, chapterHighlightByVerse, highlightedPosition, selectedVersePosition,
  selectedVerseNumbers, spokenVerse, onFootnotePress, onVersePress, onVersePressIn, onVerseLongPress,
  onVerseRef, onRowLayout, palette, readerLineHeight, readerTextStyle, verseNumberStyle, showVerseNumbers,
  subtitlesBefore, markersBefore, markersAfter,
}: ParagraphProps) {
  const bookLanguage = useBibleBookLanguage();
  const containerRef = useRef<View>(null);
  const contentRef = useRef<View>(null);
  const blockOffset = useRef<number | undefined>(undefined);
  const contentOffset = useRef<number | undefined>(undefined);
  const geometry = useRef(new Map<string, ParagraphChunkGeometry>());
  const requiredChunks = useRef<string[]>([]);
  const [contentWidth, setContentWidth] = useState(0);
  const [chapterSize, setChapterSize] = useState<{ width: number; height: number }>();
  const projection = useMemo(() => paragraphProjection(verses, showVerseNumbers), [verses, showVerseNumbers]);
  const verseByNumber = useMemo(() => new Map(verses.map(item => [item.verse, item])), [verses]);
  const fontScale = PixelRatio.getFontScale();
  const fontKey = `${readerTextStyle.fontFamily}:${readerTextStyle.fontSize}:${fontScale}`;
  const [numberMeasurements, setNumberMeasurements] = useState<{ key: string; widths: Record<number, number> }>({ key: fontKey, widths: {} });
  const numberWidths = numberMeasurements.key === fontKey ? numberMeasurements.widths : {};
  const measureNumberWidth = useCallback((verse: number, width: number) => {
    setNumberMeasurements(current => current.key === fontKey && current.widths[verse] === width ? current : {
      key: fontKey, widths: { ...(current.key === fontKey ? current.widths : {}), [verse]: width },
    });
  }, [fontKey]);
  const chapterWidth = chapterSize?.width ?? Math.max(28, String(chapterNumber ?? "").length * 44 * 0.65) * fontScale;
  const chapterHeight = chapterSize?.height ?? 50 * fontScale;
  const indent = chapterNumber === undefined ? 0 : chapterWidth + 10;
  const openingWidth = contentWidth - indent;
  const layoutKey = `${contentWidth}:${indent}:${chapterHeight}:${fontKey}:${readerLineHeight}:${showVerseNumbers}`;
  const [split, setSplit] = useState<{ key: string; projection: typeof projection; openingEnd: number; continuationStart: number }>();
  const measuredSplit = split?.key === layoutKey && split.projection === projection ? split : undefined;
  const openingEnd = measuredSplit?.openingEnd ?? projection.text.length;
  const continuationStart = measuredSplit?.continuationStart ?? projection.text.length;
  const openingId = `${layoutKey}:0:${openingEnd}`;
  const continuationId = `${layoutKey}:${continuationStart}:${projection.text.length}`;
  requiredChunks.current = continuationStart < projection.text.length ? [openingId, continuationId] : [openingId];
  for (const key of geometry.current.keys()) if (!requiredChunks.current.includes(key)) geometry.current.delete(key);
  const publishLayout = useCallback(() => {
    if (blockOffset.current === undefined || contentOffset.current === undefined || !contentRef.current) return;
    const chunks = requiredChunks.current.map(key => geometry.current.get(key))
      .filter((chunk): chunk is ParagraphChunkGeometry => chunk !== undefined);
    if (chunks.length !== requiredChunks.current.length) return;
    const bounds = mergeParagraphVerseBounds(chunks.map(chunk => paragraphVerseBounds(
      paragraphProjectionSlice(projection, chunk.start, chunk.end), chunk.lines,
    ).map(bound => ({ ...bound, y: chunk.y + bound.y }))));
    for (const bound of bounds) {
      const node = contentRef.current;
      onVerseRef(bound.verse, {
        focusTarget: containerRef.current,
        measureInWindow: callback => node.measureInWindow((x, y, width) => callback(x, y + bound.y, width, bound.height)),
      });
      onRowLayout(bound.verse, blockOffset.current + contentOffset.current + bound.y, bound.height);
    }
  }, [projection, onRowLayout, onVerseRef]);
  const reportGeometry = useCallback((chunk: ParagraphChunkGeometry) => {
    if (!requiredChunks.current.includes(chunk.id)) return;
    geometry.current.set(chunk.id, chunk);
    publishLayout();
  }, [publishLayout]);
  useEffect(() => () => {
    for (const verse of verses) onVerseRef(verse.verse, null);
  }, [verses, onVerseRef]);
  const renderRange = useCallback((start: number, end: number, ascenders: Record<number, number>, measuring: boolean) => (
    paragraphFragments(projection, start, end).map(fragment => {
      const item = verseByNumber.get(fragment.verse)!;
      const isPosition = (candidate?: BiblePosition) => candidate?.book === position.book && candidate.chapter === position.chapter && candidate.verse === item.verse;
      const selected = isPosition(highlightedPosition) || isPosition(selectedVersePosition) || selectedVerseNumbers.includes(item.verse);
      const color = chapterHighlightByVerse[item.verse];
      const reference = referenceLabel({ ...position, verse: item.verse }, bookLanguage);
      return <Text key={item.reference}>
        {fragment.before}
        {fragment.showNumber || fragment.textEnd > fragment.textStart ? <Text
          accessibilityLabel={measuring ? undefined : reference} accessibilityRole={measuring ? undefined : "button"}
          accessibilityState={measuring ? undefined : { selected: selected || Boolean(color) }}
          onPress={measuring ? undefined : () => onVersePress(item.verse)} onPressIn={measuring ? undefined : onVersePressIn}
          onLongPress={measuring ? undefined : () => onVerseLongPress(item.verse)}
          style={measuring ? undefined : { backgroundColor: selected || item.verse === spokenVerse ? palette.peach : color ? highlightColorWithOpacity(color, 0.16) : undefined }}>
          {fragment.showNumber ? <BibleVerseNumber verse={item.verse} style={verseNumberStyle}
            inlineAscender={ascenders[item.verse] ?? readerLineHeight * 0.8}
            measuredWidth={numberWidths[item.verse]} onMeasureWidth={measureNumberWidth} /> : null}
          {fragment.textEnd > fragment.textStart ? <BibleVerseText inline footnotes={item.footnotes}
            onFootnotePress={(marker, footnote) => onFootnotePress(marker, footnote, item.verse)}
            palette={palette} readerTextStyle={readerTextStyle} reference={reference} text={item.text}
            textRange={{ start: fragment.textStart, end: fragment.textEnd }} /> : null}
        </Text> : null}
      </Text>;
    })
  ), [projection, verseByNumber, position, highlightedPosition, selectedVersePosition, selectedVerseNumbers, chapterHighlightByVerse,
    bookLanguage, onVersePress, onVersePressIn, onVerseLongPress, spokenVerse, palette, verseNumberStyle, readerLineHeight,
    numberWidths, measureNumberWidth, onFootnotePress, readerTextStyle]);
  return (
    <View ref={containerRef} collapsable={false} onLayout={event => {
      blockOffset.current = event.nativeEvent.layout.y;
      publishLayout();
    }} style={{ gap: 5, paddingBottom: 12, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: "transparent" }}>
      {subtitlesBefore.map(subtitle => (
        <Text key={`${subtitle.beforeVerse}-${subtitle.text}`} style={{
          color: palette.accent, fontFamily: readerTextStyle.fontFamily,
          fontSize: Math.max(15, Number(readerTextStyle.fontSize ?? defaultFontSize) - 1),
          fontWeight: "800", lineHeight: Math.round(readerLineHeight * 0.95),
          paddingBottom: 5, paddingTop: chapterNumber === undefined ? 14 : 0,
        }}>{subtitle.text}</Text>
      ))}
      {markersBefore.map(marker => <BiblePlanInlineMarker key={`${marker.planId}-${marker.kind}-${marker.verse}`} kind={marker.kind} label={marker.label} palette={palette} />)}
      <View ref={contentRef} collapsable={false} testID="bible-paragraph-content" onLayout={event => {
        contentOffset.current = event.nativeEvent.layout.y;
        const width = event.nativeEvent.layout.width;
        if (Number.isFinite(width) && width > 0) setContentWidth(current => current === width ? current : width);
        publishLayout();
      }} style={{ paddingVertical: 8, minHeight: chapterNumber === undefined ? undefined : chapterHeight + 16 }}>
        {chapterNumber === undefined ? null : <View testID="bible-paragraph-chapter" style={{ position: "absolute", left: 0, top: 8 }}
          onLayout={event => {
            const { width, height } = event.nativeEvent.layout;
            if (width > 0 && height > 0) setChapterSize(current => current?.width === width && current.height === height ? current : { width, height });
          }}>
          <BibleChapterNumber number={chapterNumber} color={palette.accent} />
        </View>}
        <BibleParagraphChunk key={openingId} id={openingId} projection={projection} start={0} end={openingEnd}
          readerTextStyle={readerTextStyle} style={{ ...bibleVerseWebInteractionStyle, marginLeft: indent }}
          onGeometry={reportGeometry} renderRange={renderRange} />
        {continuationStart < projection.text.length ? <BibleParagraphChunk key={continuationId} id={continuationId} projection={projection}
          start={continuationStart} end={projection.text.length} readerTextStyle={readerTextStyle} style={bibleVerseWebInteractionStyle}
          onGeometry={reportGeometry} renderRange={renderRange} /> : null}
        {chapterNumber !== undefined && chapterSize && openingWidth > 0 ? <View accessible={false} accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants" pointerEvents="none"
          style={{ position: "absolute", left: indent, top: 8, width: openingWidth, opacity: 0 }}>
          <BibleParagraphChunk key={`probe:${layoutKey}`} id={`probe:${layoutKey}`} projection={projection} start={0} end={projection.text.length}
            readerTextStyle={readerTextStyle} style={{ width: openingWidth }} measuring renderRange={renderRange}
            onLines={lines => {
              if (!lines.length) return;
              const next = paragraphOpeningSplit(projection, lines, chapterHeight);
              setSplit(current => current?.key === layoutKey && current.projection === projection &&
                current.openingEnd === next.openingEnd && current.continuationStart === next.continuationStart
                ? current : { key: layoutKey, projection, ...next });
            }} />
        </View> : null}
      </View>
      {markersAfter.map(marker => <BiblePlanInlineMarker key={`${marker.planId}-${marker.kind}-${marker.verse}`} kind={marker.kind} label={marker.label} palette={palette} />)}
    </View>
  );
});

const BibleChapterNumber = memo(function BibleChapterNumber({ number, color }: { number: number; color: string }) {
  return <Text style={{
    ...bibleVerseWebInteractionStyle, color, fontFamily: fontFamilyFor("classic"),
    fontSize: 44, fontWeight: "500", lineHeight: 50, minWidth: 28,
  }}>{number}</Text>;
});

const BibleVerseNumber = memo(function BibleVerseNumber({ verse, style, highlightStyle, inlineAscender, measuredWidth, onMeasureWidth }: {
  verse: number;
  style: TextStyle;
  highlightStyle?: TextStyle;
  inlineAscender?: number;
  measuredWidth?: number;
  onMeasureWidth?: (verse: number, width: number) => void;
}) {
  const fontSize = Number(style.fontSize);
  // Leave enough room to measure the number plus its following space without
  // wrapping. The attachment then reserves only that measured width.
  const measurementWidth = fontSize * PixelRatio.getFontScale() * (String(verse).length + 1);
  const height = Math.min(fontSize, inlineAscender ?? fontSize);
  const [width, setWidth] = useState(measurementWidth);
  const measureWidth = useCallback((event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const measured = event.nativeEvent.lines[0]?.width;
    if (Number.isFinite(measured) && measured > 0) {
      const next = Math.ceil(measured * 4) / 4;
      if (onMeasureWidth) onMeasureWidth(verse, next);
      else setWidth(current => Math.abs(current - next) < 0.25 ? current : next);
    }
  }, [verse, onMeasureWidth]);
  const number = <Text accessible={false}
    onTextLayout={inlineAscender === undefined ? undefined : measureWidth}
    style={[style, bibleVerseWebInteractionStyle, highlightStyle, inlineAscender === undefined ? undefined : {
      position: "absolute", left: 0, top: height - inlineAscender, width: measurementWidth,
    }]}
  >{verse}{" "}</Text>;
  if (inlineAscender === undefined) return number;
  // A small native attachment gives the number the same raised position as a
  // verse row. Margins on nested Text are ignored by the native text engines.
  // Keep the attachment below the body ascender so it cannot stretch a line.
  return <View collapsable={false} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
    style={{ width: measuredWidth ?? width, height, overflow: "visible" }}>
    {number}
  </View>;
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
        <BibleChapterNumber number={chapterNumber} color={palette.accent} />
        <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
          {showVerseNumbers ? <BibleVerseNumber verse={item.verse} style={verseNumberStyle} highlightStyle={persistedHighlightStyle} /> : null}
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
        {showVerseNumbers ? <BibleVerseNumber verse={item.verse} style={verseNumberStyle} highlightStyle={persistedHighlightStyle} /> : null}
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
  inline = false,
  footnotes,
  onFootnotePress,
  palette,
  persistedHighlightStyle,
  readerTextStyle,
  reference,
  text,
  textRange,
}: {
  inline?: boolean;
  footnotes: BibleFootnote[];
  onFootnotePress: (marker: string, footnote: BibleFootnote) => void;
  palette: ReaderPalette;
  persistedHighlightStyle?: TextStyle;
  readerTextStyle: TextStyle;
  reference: string;
  text: string;
  textRange?: { start: number; end: number };
}) {
  const { t } = useAppTranslation();
  const segments = useMemo(() => bibleTextSegments(text, footnotes), [footnotes, text]);
  const markerFontSize = Math.max(10, Number(readerTextStyle.fontSize ?? defaultFontSize) * 0.66);
  let cursor = 0;

  return (
    <Text style={[readerTextStyle, bibleVerseWebInteractionStyle, !inline && { flex: 1 }]}>
      <Text style={[bibleVerseWebInteractionStyle, persistedHighlightStyle]}>
        {segments.map((segment, index) => {
          const content = segment.kind === "text" ? segment.text : `${segment.appended ? " " : ""}${segment.marker}`;
          const start = cursor;
          cursor += content.length;
          const visible = textRange ? content.slice(Math.max(0, textRange.start - start), Math.max(0, textRange.end - start)) : content;
          if (!visible) return null;
          if (segment.kind === "text") return visible;
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
              {visible}
            </Text>
          );
        })}
      </Text>
    </Text>
  );
}
