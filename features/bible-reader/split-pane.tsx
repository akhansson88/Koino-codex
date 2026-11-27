import { Feather } from "@expo/vector-icons";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  type TextStyle,
  View,
} from "react-native";
import { BibleText, type ReadingMarker } from "@/features/bible-reader/chapter-text";
import type { BibleChapter, BibleFootnote, BiblePosition, BibleVersionId } from "@/features/bible-kjv";
import { bibleVersionShortLabel } from "@/features/bible-reader/verse-helpers";
import { anchorAtOffset, offsetForAnchor, type PaneLayout, type VerseAnchor } from "@/features/bible-reader/split-anchor";
import type { ReaderPalette } from "@/features/bible-reader/types";
import type { BibleHighlightColor } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";

export type SplitPaneHandle = {
  getAnchor: (line: number) => VerseAnchor | undefined;
  getLayout: () => PaneLayout | undefined;
  scrollToAnchor: (anchor: VerseAnchor, line: number) => boolean;
  scrollToTop: () => void;
};

type MeasuredVerse = { height?: number; offset: number };

type Props = {
  active: boolean;
  approximate: boolean;
  bottomInset: number;
  boundaryHint?: string;
  chapter?: BibleChapter;
  chapterError: boolean;
  flowingParagraphText: boolean;
  headerReference: string;
  highlightByVerse: Record<number, BibleHighlightColor>;
  onAnchor: (anchor: VerseAnchor) => void;
  onBoundaryPress?: () => void;
  onClose?: () => void;
  onDragStart: () => void;
  onFollowAgain?: () => void;
  onFootnotePress: (marker: string, footnote: BibleFootnote, verse: number) => void;
  onReadingMarkerPress?: () => void;
  onRetry: () => void;
  onShowVersionPicker: () => void;
  onToggleSync: () => void;
  onVerseCopy: (verse: number) => void;
  onVerseLongPress: (verse: number) => void;
  onVersePress: (verse: number) => void;
  onVersePressIn: () => void;
  palette: ReaderPalette;
  position: BiblePosition;
  readOnly: boolean;
  readerLineHeight: number;
  readerTextStyle: TextStyle;
  readingMarkersByVerse?: Record<number, ReadingMarker[]>;
  selectedVerseNumbers: number[];
  selectedVersePosition?: BiblePosition;
  showVerseNumbers: boolean;
  showFollowAgain: boolean;
  spokenVerse?: number;
  syncEnabled: boolean;
  versionId: BibleVersionId;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

/**
 * One pane of the compare reader. Owns its scroll position, its measured verse
 * layout and its header. The parent only supplies an anchor and receives the
 * anchor this pane is on; it never re-renders on every scroll frame.
 */
export const SplitPane = memo(forwardRef<SplitPaneHandle, Props>(function SplitPane({
  active,
  approximate,
  bottomInset,
  boundaryHint,
  chapter,
  chapterError,
  flowingParagraphText,
  headerReference,
  highlightByVerse,
  onAnchor,
  onBoundaryPress,
  onClose,
  onDragStart,
  onFollowAgain,
  onFootnotePress,
  onReadingMarkerPress,
  onRetry,
  onShowVersionPicker,
  onToggleSync,
  onVerseCopy,
  onVerseLongPress,
  onVersePress,
  onVersePressIn,
  palette,
  position,
  readOnly,
  readerLineHeight,
  readerTextStyle,
  readingMarkersByVerse,
  selectedVerseNumbers,
  selectedVersePosition,
  showVerseNumbers,
  showFollowAgain,
  spokenVerse,
  syncEnabled,
  versionId,
}: Props, ref) {
  const { t } = useAppTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const [headerVerse, setHeaderVerse] = useState(position.verse);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentOrigin, setContentOrigin] = useState(0);
  const scrollOffsetRef = useRef(0);
  const relativeRef = useRef<Record<number, MeasuredVerse>>({});
  const layoutRef = useRef<PaneLayout | undefined>(undefined);
  const pendingAnchorRef = useRef<{ anchor: VerseAnchor; line: number } | undefined>(undefined);
  const programmaticRef = useRef(false);
  const programmaticYRef = useRef(0);
  const onAnchorRef = useRef(onAnchor);
  onAnchorRef.current = onAnchor;

  const rebuildLayout = useCallback(() => {
    const entries = Object.entries(relativeRef.current)
      .map(([verse, measured]) => ({ verse: Number(verse), ...measured, top: contentOrigin + measured.offset }))
      .filter((entry) => Number.isFinite(entry.top) && entry.top >= 0)
      .sort((left, right) => left.verse - right.verse);
    if (entries.length === 0) {
      layoutRef.current = undefined;
      return;
    }
    layoutRef.current = {
      heights: entries.map((entry) => entry.height ?? 0),
      tops: entries.map((entry) => entry.top),
      verses: entries.map((entry) => entry.verse),
    };
  }, [contentOrigin]);

  useEffect(() => {
    rebuildLayout();
  }, [rebuildLayout]);

  const handleVerseLayout = useCallback((verse: number, offset: number, height?: number) => {
    relativeRef.current[verse] = { height, offset };
    rebuildLayout();
    const pending = pendingAnchorRef.current;
    if (pending && typeof scrollRef.current?.scrollTo === "function") {
      const layout = layoutRef.current;
      if (layout) {
        const y = offsetForAnchor(layout, pending.anchor, pending.line);
        if (y !== undefined) {
          pendingAnchorRef.current = undefined;
          programmaticRef.current = true;
          programmaticYRef.current = y;
          scrollRef.current?.scrollTo({ animated: false, y });
          requestAnimationFrame(() => { programmaticRef.current = false; });
        }
      }
    }
  }, [rebuildLayout]);

  const emitAnchor = useCallback((scrollY: number) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const anchor = anchorAtOffset(layout, scrollY, 8);
    if (!anchor) return;
    setHeaderVerse((current) => current === anchor.verse ? current : anchor.verse);
    onAnchorRef.current(anchor);
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = y;
    if (programmaticRef.current) {
      if (Math.abs(y - programmaticYRef.current) <= 2) return;
      programmaticRef.current = false;
    }
    emitAnchor(y);
  }, [emitAnchor]);

  const handleBeginDrag = useCallback(() => {
    programmaticRef.current = false;
    onDragStart();
  }, [onDragStart]);

  const scrollToAnchor = useCallback((anchor: VerseAnchor, line: number) => {
    const layout = layoutRef.current;
    if (!layout) {
      pendingAnchorRef.current = { anchor, line };
      return false;
    }
    const y = offsetForAnchor(layout, anchor, line);
    if (y === undefined) return false;
    const maximum = Math.max(0, (layout.tops[layout.tops.length - 1] ?? 0) + (layout.heights[layout.heights.length - 1] ?? 0) - viewportHeight);
    programmaticRef.current = true;
    programmaticYRef.current = Math.min(y, maximum);
    scrollOffsetRef.current = programmaticYRef.current;
    scrollRef.current?.scrollTo({ animated: false, y: programmaticYRef.current });
    setHeaderVerse(anchor.verse);
    requestAnimationFrame(() => { programmaticRef.current = false; });
    return true;
  }, [viewportHeight]);

  useImperativeHandle(ref, () => ({
    getAnchor: (line) => {
      const layout = layoutRef.current;
      return layout ? anchorAtOffset(layout, scrollOffsetRef.current, line) : undefined;
    },
    getLayout: () => layoutRef.current,
    scrollToAnchor,
    scrollToTop: () => {
      programmaticRef.current = true;
      programmaticYRef.current = 0;
      scrollOffsetRef.current = 0;
      scrollRef.current?.scrollTo({ animated: false, y: 0 });
      requestAnimationFrame(() => { programmaticRef.current = false; });
    },
  }), [scrollToAnchor]);

  useLayoutEffect(() => {
    setHeaderVerse(position.verse);
  }, [position.book, position.chapter, position.verse]);

  const versionLabel = bibleVersionShortLabel(versionId);

  return (
    <View style={{ backgroundColor: palette.background, flex: 1, minHeight: 0 }}>
      <View style={{
        alignItems: "center",
        borderBottomColor: palette.line,
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 6,
        minHeight: 34,
        paddingHorizontal: 10,
      }}>
        <Pressable
          accessibilityHint={t("bible.compare.changeVersionHint")}
          accessibilityLabel={t("bible.compare.paneVersion", { version: versionLabel })}
          accessibilityRole="button"
          onPress={onShowVersionPicker}
          style={{ alignItems: "center", backgroundColor: palette.input, borderColor: palette.line, borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 4, minHeight: 26, paddingHorizontal: 8 }}
        >
          <Text style={{ color: palette.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 }}>{versionLabel}</Text>
          <Feather name="chevron-down" size={11} color={palette.accent} />
        </Pressable>
        <Text numberOfLines={1} style={{ color: palette.text, flex: 1, fontSize: 12, fontWeight: "700" }}>
          {headerReference}
          {approximate ? <Text style={{ color: palette.muted }}>{"  ≈"}</Text> : null}
        </Text>
        {showFollowAgain ? (
          <Pressable
            accessibilityRole="button"
            onPress={onFollowAgain}
            style={{ alignItems: "center", backgroundColor: palette.text, borderRadius: 999, flexDirection: "row", gap: 3, minHeight: 24, paddingHorizontal: 8 }}
          >
            <Feather name="corner-down-right" size={11} color={palette.background} />
            <Text style={{ color: palette.background, fontSize: 10, fontWeight: "800" }}>{t("bible.compare.followAgain")}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={syncEnabled ? t("bible.compare.syncOn") : t("bible.compare.syncOff")}
          accessibilityRole="switch"
          accessibilityState={{ checked: syncEnabled }}
          hitSlop={8}
          onPress={onToggleSync}
          style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
        >
          <Feather name={syncEnabled ? "link" : "link-2"} size={14} color={syncEnabled ? palette.accent : palette.muted} />
        </Pressable>
        {onClose ? (
          <Pressable accessibilityLabel={t("bible.compare.close")} accessibilityRole="button" hitSlop={8} onPress={onClose} style={{ alignItems: "center", height: 26, justifyContent: "center", width: 24 }}>
            <Feather name="x" size={15} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>

      {boundaryHint ? (
        <Pressable
          accessibilityRole="button"
          onPress={onBoundaryPress}
          style={{ alignItems: "center", backgroundColor: palette.peach, borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: "row", gap: 4, minHeight: 24, paddingHorizontal: 10 }}
        >
          <Feather name="corner-down-right" size={11} color={palette.accent} />
          <Text numberOfLines={1} style={{ color: palette.accent, flex: 1, fontSize: 10, fontWeight: "800" }}>{boundaryHint}</Text>
        </Pressable>
      ) : null}
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: 16, paddingTop: 8 }}
        keyboardShouldPersistTaps="handled"
        onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}
        onMomentumScrollEnd={onScroll}
        onScroll={onScroll}
        onScrollBeginDrag={handleBeginDrag}
        ref={scrollRef}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, minHeight: 0 }}
      >
        <View
          onLayout={({ nativeEvent }) => {
            const next = nativeEvent.layout.y;
            setContentOrigin((current) => Math.abs(current - next) < 0.5 ? current : next);
          }}
        >
          {chapter ? (
            <BibleText
              chapterHeading={chapter.heading}
              chapterHighlightByVerse={highlightByVerse}
              copyLabel={t("bible.actions.copy")}
              flowingParagraphText={flowingParagraphText}
              onFootnotePress={onFootnotePress}
              onReadingMarkerPress={onReadingMarkerPress}
              onVerseCopy={onVerseCopy}
              onVerseLayout={handleVerseLayout}
              onVerseLongPress={onVerseLongPress}
              onVersePress={onVersePress}
              onVersePressIn={onVersePressIn}
              onVerseRef={() => {}}
              palette={palette}
              planMarkers={EMPTY_MARKERS}
              position={position}
              readingMarkersByVerse={readingMarkersByVerse}
              readerLineHeight={readerLineHeight}
              readerTextStyle={readerTextStyle}
              selectedVerseNumbers={selectedVerseNumbers}
              selectedVersePosition={selectedVersePosition}
              showVerseNumbers={showVerseNumbers}
              spokenVerse={spokenVerse}
              subtitles={chapter.subtitles}
              verses={chapter.verses}
            />
          ) : chapterError ? (
            <Pressable accessibilityRole="button" onPress={onRetry} style={{ alignItems: "center", justifyContent: "center", minHeight: 160 }}>
              <Text style={{ color: palette.text, textAlign: "center" }}>{t("bible.compare.chapterError")}</Text>
            </Pressable>
          ) : (
            <ActivityIndicator color={palette.text} style={{ minHeight: 160 }} />
          )}
        </View>
      </ScrollView>

      {readOnly ? (
        <View pointerEvents="none" style={{ bottom: 8, left: 0, position: "absolute", right: 0 }}>
          <Text style={{ color: palette.muted, fontSize: 10, textAlign: "center" }}>{t("bible.compare.readOnly")}</Text>
        </View>
      ) : null}
    </View>
  );
}));

const EMPTY_MARKERS: never[] = [];
