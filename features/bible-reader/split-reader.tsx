import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Text, View, type TextStyle } from "react-native";
import { bibleVerseLinks, type BibleFootnote, type BiblePosition, type BibleVersionId } from "@/features/bible-kjv";
import { useChapterWindow } from "@/features/bible-reader/chapter-window";
import { SplitPane, type SplitPaneHandle } from "@/features/bible-reader/split-pane";
import {
  composeAnchor,
  resolveAnchor,
  type ResolvedAnchor,
  type VerseAnchor,
} from "@/features/bible-reader/split-anchor";
import type { ReaderPalette } from "@/features/bible-reader/types";
import type { ReadingMarker } from "@/features/bible-reader/chapter-text";
import type { BibleHighlight, BibleHighlightColor } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { displayBibleBookName } from "@/features/bible-book-names";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";

const READING_LINE = 8;
const MIN_RATIO = 0.35;
const MAX_RATIO = 0.65;

export type SplitReaderProps = {
  audioAnchor?: { book: string; chapter: number; verse: number };
  bottomInset: number;
  flowingParagraphText: boolean;
  highlightByVerse: (versionId: BibleVersionId) => Record<number, BibleHighlightColor>;
  layoutKey: string;
  mirrorAnchor?: { book: string; chapter: number; fraction: number; verse: number };
  navigationRevision: number;
  onChangeRatio: (ratio: number) => void;
  onShowVersionPicker: (slot: "primary" | "secondary") => void;
  onClose: () => void;
  onFootnotePress: (marker: string, footnote: BibleFootnote, verse: number, versionId: BibleVersionId) => void;
  onPositionChange: (position: BiblePosition, versionId: BibleVersionId) => void;
  onReadingMarkerPress?: () => void;
  onToggleSync: () => void;
  onUserScroll: () => void;
  onVerseCopy: (verse: number, versionId: BibleVersionId) => void;
  onVerseLongPress: (verse: number, versionId: BibleVersionId) => void;
  onVersePress: (verse: number, versionId: BibleVersionId) => void;
  onVersePressIn: () => void;
  palette: ReaderPalette;
  position: BiblePosition;
  primaryVersionId: BibleVersionId;
  ratio: number;
  readerLineHeight: number;
  readerTextStyle: TextStyle;
  readingMarkersByVerse?: Record<number, ReadingMarker[]>;
  secondaryVersionId: BibleVersionId;
  selectedVerseNumbers: number[];
  selectedVersePosition?: BiblePosition;
  showVerseNumbers: boolean;
  spokenVerse?: number;
  sync: boolean;
  topInset: number;
  onAnchorChange?: (anchor: VerseAnchor) => void;
};

function highlightMap(highlights: BibleHighlight[], book: string, chapter: number, translation: string) {
  const result: Record<number, BibleHighlightColor> = {};
  highlights
    .filter((highlight) => highlight.book === book && highlight.chapter === chapter && highlight.translation === translation)
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt);
      const rightTime = Date.parse(right.updatedAt || right.createdAt);
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    })
    .forEach((highlight) => {
      for (let verse = highlight.startVerse; verse <= highlight.endVerse; verse += 1) {
        if (!result[verse]) result[verse] = highlight.color;
      }
    });
  return result;
}

function clampFraction(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function SplitReader({
  audioAnchor,
  bottomInset,
  flowingParagraphText,
  highlightByVerse,
  layoutKey,
  mirrorAnchor,
  navigationRevision,
  onChangeRatio,
  onShowVersionPicker,
  onClose,
  onFootnotePress,
  onPositionChange,
  onReadingMarkerPress,
  onToggleSync,
  onUserScroll,
  onVerseCopy,
  onVerseLongPress,
  onVersePress,
  onVersePressIn,
  palette,
  position,
  primaryVersionId,
  ratio,
  readerLineHeight,
  readerTextStyle,
  readingMarkersByVerse,
  secondaryVersionId,
  selectedVerseNumbers,
  selectedVersePosition,
  showVerseNumbers,
  spokenVerse,
  sync,
  topInset,
  onAnchorChange,
}: SplitReaderProps) {
  const { t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage(primaryVersionId);
  const primary = useChapterWindow({ ...position, verse: 1 }, primaryVersionId, true);
  const secondary = useChapterWindow({ ...position, verse: 1 }, secondaryVersionId, true);
  const primaryPaneRef = useRef<SplitPaneHandle>(null);
  const secondaryPaneRef = useRef<SplitPaneHandle>(null);
  const driverRef = useRef<"primary" | "secondary">("primary");
  const [containerHeight, setContainerHeight] = useState(0);
  const [dragRatio, setDragRatio] = useState(ratio);
  const dragRatioRef = useRef(ratio);
  dragRatioRef.current = dragRatio;
  const dragStartRatioRef = useRef(ratio);
  const dragAnchorRef = useRef<{ anchor: VerseAnchor; driver: "primary" | "secondary" } | undefined>(undefined);
  const lastAnchorRef = useRef<{ anchor: VerseAnchor; driver: "primary" | "secondary" } | undefined>(undefined);
  const positionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingPositionRef = useRef<BiblePosition | undefined>(undefined);
  const [headers, setHeaders] = useState<{ primary: ResolvedAnchor; secondary: ResolvedAnchor }>();
  const [primaryBoundary, setPrimaryBoundary] = useState<{ chapter: number; verse: number }>();
  const [secondaryBoundary, setSecondaryBoundary] = useState<{ chapter: number; verse: number }>();
  const headerSignatureRef = useRef("");
  const lastPositionRef = useRef("");
  const internalPositionRef = useRef("");
  const externalTokenRef = useRef(0);

  useEffect(() => {
    if (!dragRatioRef.current || dragRatioRef.current === ratio) return;
    setDragRatio(ratio);
  }, [ratio]);

  useEffect(() => {
    setHeaders(undefined);
    headerSignatureRef.current = "";
  }, [position.book, position.chapter, primaryVersionId, secondaryVersionId]);

  // Switching a pane keeps the reader at the same verse and realigns the other
  // pane through the new pair's links.
  useEffect(() => {
    const anchor = { fraction: 0, verse: position.verse };
    const resolved = resolveToSecondary(anchor);
    const secondaryAnchor = resolved && !resolved.crossChapter && resolved.chapter === position.chapter
      ? { fraction: resolved.fraction, verse: resolved.verse }
      : undefined;
    applyAnchor(anchor, secondaryAnchor, resolved?.approximate ?? false);
  }, [primaryVersionId, secondaryVersionId]);

  const primaryToPivot = useMemo(
    () => primaryVersionId === "kjv" ? undefined : bibleVerseLinks(position.book, position.chapter, primaryVersionId, "kjv"),
    [position.book, position.chapter, primaryVersionId],
  );
  const pivotToSecondary = useMemo(
    () => secondaryVersionId === "kjv" ? undefined : bibleVerseLinks(position.book, position.chapter, "kjv", secondaryVersionId),
    [position.book, position.chapter, secondaryVersionId],
  );
  const secondaryToPivot = useMemo(
    () => secondaryVersionId === "kjv" ? undefined : bibleVerseLinks(position.book, position.chapter, secondaryVersionId, "kjv"),
    [position.book, position.chapter, secondaryVersionId],
  );
  const pivotToPrimary = useMemo(
    () => primaryVersionId === "kjv" ? undefined : bibleVerseLinks(position.book, position.chapter, "kjv", primaryVersionId),
    [position.book, position.chapter, primaryVersionId],
  );

  const resolveToSecondary = useCallback((anchor: VerseAnchor): ResolvedAnchor | undefined => {
    if (primaryVersionId === secondaryVersionId) {
      return { approximate: false, chapter: position.chapter, crossChapter: false, fraction: anchor.fraction, verse: anchor.verse };
    }
    if (primaryVersionId === "kjv") {
      if (secondaryVersionId === "kjv") return undefined;
      return resolveAnchor(pivotToSecondary!, anchor);
    }
    const first = resolveAnchor(primaryToPivot!, anchor);
    if (!first) return undefined;
    if (secondaryVersionId === "kjv") return first;
    if (first.chapter !== position.chapter) return first;
    const second = resolveAnchor(pivotToSecondary!, { fraction: first.fraction, verse: first.verse });
    const composed = composeAnchor(first, () => second);
    return composed;
  }, [pivotToSecondary, position.chapter, primaryToPivot, primaryVersionId, secondaryVersionId]);

  const resolveToPrimary = useCallback((anchor: VerseAnchor): ResolvedAnchor | undefined => {
    if (primaryVersionId === secondaryVersionId) {
      return { approximate: false, chapter: position.chapter, crossChapter: false, fraction: anchor.fraction, verse: anchor.verse };
    }
    if (secondaryVersionId === "kjv") {
      if (primaryVersionId === "kjv") return undefined;
      return resolveAnchor(pivotToPrimary!, anchor);
    }
    const first = resolveAnchor(secondaryToPivot!, anchor);
    if (!first) return undefined;
    if (primaryVersionId === "kjv") return first;
    if (first.chapter !== position.chapter) return first;
    const second = resolveAnchor(pivotToPrimary!, { fraction: first.fraction, verse: first.verse });
    return composeAnchor(first, () => second);
  }, [pivotToPrimary, position.chapter, primaryVersionId, pivotToPrimary, secondaryToPivot, secondaryVersionId]);

  const chapterLabel = useCallback((chapter: number) => `${displayBibleBookName(position.book, bookLanguage)} ${chapter}`, [bookLanguage, position.book]);

  const updateHeaders = useCallback((primaryAnchor: VerseAnchor, secondaryAnchor: VerseAnchor | undefined, approximate = false) => {
    const signature = `${primaryAnchor.verse}|${secondaryAnchor?.verse ?? 0}:${approximate}`;
    if (headerSignatureRef.current === signature) return;
    headerSignatureRef.current = signature;
    setHeaders({
      primary: { approximate: false, chapter: position.chapter, crossChapter: false, fraction: primaryAnchor.fraction, verse: primaryAnchor.verse },
      secondary: secondaryAnchor
        ? { approximate, chapter: position.chapter, crossChapter: false, fraction: secondaryAnchor.fraction, verse: secondaryAnchor.verse }
        : { approximate: false, chapter: position.chapter, crossChapter: false, fraction: 0, verse: primaryAnchor.verse },
    });
  }, [position.chapter]);

  const applyAnchor = useCallback((primaryAnchor: VerseAnchor, secondaryAnchor: VerseAnchor | undefined, secondaryApproximate = false) => {
    setPrimaryBoundary(undefined);
    setSecondaryBoundary(undefined);
    const token = ++externalTokenRef.current;
    let attempts = 0;
    const tick = () => {
      if (token !== externalTokenRef.current) return;
      const primaryDone = primaryPaneRef.current?.scrollToAnchor(primaryAnchor, READING_LINE) ?? false;
      const secondaryDone = secondaryAnchor
        ? secondaryPaneRef.current?.scrollToAnchor(secondaryAnchor, READING_LINE) ?? false
        : true;
      if (!primaryDone || !secondaryDone) {
        if (attempts++ < 120) requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    updateHeaders(primaryAnchor, secondaryAnchor, secondaryApproximate);
  }, [updateHeaders]);

  const applyToSecondary = useCallback((primaryAnchor: VerseAnchor) => {
    const resolved = resolveToSecondary(primaryAnchor);
    if (!resolved) {
      setSecondaryBoundary(undefined);
      updateHeaders(primaryAnchor, undefined, undefined);
      return;
    }
    if (resolved.crossChapter || resolved.chapter !== position.chapter) {
      // Do not flip the follower's chapter while the driver is still in this
      // one. Clamp to the edge and show the approximate marker.
      const layout = secondaryPaneRef.current?.getLayout();
      const edgeVerse = layout?.verses.at(-1) ?? resolved.verse;
      const clamped = { fraction: 0, verse: edgeVerse };
      secondaryPaneRef.current?.scrollToAnchor(clamped, READING_LINE);
      updateHeaders(primaryAnchor, clamped, true);
      setSecondaryBoundary({ chapter: resolved.chapter, verse: resolved.verse });
      return;
    }
    setSecondaryBoundary(undefined);
    secondaryPaneRef.current?.scrollToAnchor({ fraction: resolved.fraction, verse: resolved.verse }, READING_LINE);
    updateHeaders(primaryAnchor, { fraction: resolved.fraction, verse: resolved.verse }, resolved.approximate);
  }, [position.chapter, resolveToSecondary, updateHeaders]);

  const applyToPrimary = useCallback((secondaryAnchor: VerseAnchor) => {
    const resolved = resolveToPrimary(secondaryAnchor);
    if (!resolved) {
      setPrimaryBoundary(undefined);
      return;
    }
    if (resolved.crossChapter || resolved.chapter !== position.chapter) {
      const layout = primaryPaneRef.current?.getLayout();
      const edgeVerse = (resolved.verse > (layout?.verses.at(-1) ?? resolved.verse)) ? (layout?.verses.at(-1) ?? resolved.verse) : resolved.verse;
      primaryPaneRef.current?.scrollToAnchor({ fraction: 0, verse: edgeVerse }, READING_LINE);
      onAnchorChange?.({ fraction: 0, verse: edgeVerse });
      setPrimaryBoundary({ chapter: resolved.chapter, verse: resolved.verse });
      return;
    }
    setPrimaryBoundary(undefined);
    primaryPaneRef.current?.scrollToAnchor({ fraction: resolved.fraction, verse: resolved.verse }, READING_LINE);
    onAnchorChange?.({ fraction: resolved.fraction, verse: resolved.verse });
    updateHeaders({ fraction: resolved.fraction, verse: resolved.verse }, secondaryAnchor, resolved.approximate);
  }, [onAnchorChange, position.chapter, resolveToPrimary, updateHeaders]);

  const handlePrimaryAnchor = useCallback((anchor: VerseAnchor) => {
    if (driverRef.current !== "primary") return;
    driverRef.current = "primary";
    lastAnchorRef.current = { anchor, driver: "primary" };
    onAnchorChange?.(anchor);
    const signature = `${position.book}:${position.chapter}:${anchor.verse}`;
    if (lastPositionRef.current !== signature) {
      lastPositionRef.current = signature;
      pendingPositionRef.current = { book: position.book, chapter: position.chapter, verse: anchor.verse };
      if (positionTimerRef.current !== undefined) clearTimeout(positionTimerRef.current);
      // Publish the reader position once the gesture settles. Publishing every
      // verse makes the parent re-render and can drag the panes back to an
      // older verse while the finger is still moving.
      positionTimerRef.current = setTimeout(() => {
        positionTimerRef.current = undefined;
        const pending = pendingPositionRef.current;
        if (!pending) return;
        pendingPositionRef.current = undefined;
        internalPositionRef.current = `${pending.book}:${pending.chapter}:${pending.verse}`;
        onPositionChange(pending, primaryVersionId);
      }, 260);
    }
    if (sync) applyToSecondary(anchor);
    else updateHeaders(anchor, undefined, undefined);
  }, [applyToSecondary, onAnchorChange, onPositionChange, position.book, position.chapter, primaryVersionId, sync, updateHeaders]);

  const handleSecondaryAnchor = useCallback((anchor: VerseAnchor) => {
    if (driverRef.current !== "secondary") return;
    driverRef.current = "secondary";
    lastAnchorRef.current = { anchor, driver: "secondary" };
    if (sync) applyToPrimary(anchor);
    const signature = `${position.book}:${position.chapter}:${anchor.verse}`;
    if (lastPositionRef.current !== signature) {
      lastPositionRef.current = signature;
    }
  }, [applyToPrimary, position.book, position.chapter, sync]);

  useEffect(() => () => {
    if (positionTimerRef.current !== undefined) clearTimeout(positionTimerRef.current);
  }, []);

  const handleDragStart = useCallback((driver: "primary" | "secondary") => {
    driverRef.current = driver;
    if (driver === "primary") setSecondaryBoundary(undefined);
    else setPrimaryBoundary(undefined);
    onUserScroll();
  }, [onUserScroll]);

  // Apply a position requested from outside the split: chapter navigation,
  // history, search, plans, audio follow, or the very first render.
  useEffect(() => {
    const signature = `${position.book}:${position.chapter}:${position.verse}`;
    if (internalPositionRef.current === signature) {
      internalPositionRef.current = "";
      return;
    }
    lastPositionRef.current = signature;
    const primaryAnchor = { fraction: 0, verse: position.verse };
    const resolved = resolveToSecondary(primaryAnchor);
    const secondaryAnchor = resolved && !resolved.crossChapter && resolved.chapter === position.chapter
      ? { fraction: resolved.fraction, verse: resolved.verse }
      : undefined;
    applyAnchor(primaryAnchor, secondaryAnchor, resolved?.approximate ?? false);
  }, [applyAnchor, navigationRevision, position.book, position.chapter, position.verse, primaryVersionId, resolveToSecondary]);

  // Audio follow always drives the primary pane.
  useEffect(() => {
    if (!audioAnchor || audioAnchor.book !== position.book || audioAnchor.chapter !== position.chapter) return;
    const primaryAnchor = { fraction: 0, verse: audioAnchor.verse };
    const resolved = resolveToSecondary(primaryAnchor);
    if (resolved && !resolved.crossChapter && resolved.chapter === position.chapter) {
      applyAnchor(primaryAnchor, { fraction: resolved.fraction, verse: resolved.verse }, resolved.approximate);
    } else {
      applyAnchor(primaryAnchor, undefined, false);
    }
  }, [applyAnchor, audioAnchor, position.book, position.chapter, resolveToSecondary]);

  // A followed reader's anchor arrives from the mirror record.
  useEffect(() => {
    if (!mirrorAnchor || mirrorAnchor.book !== position.book || mirrorAnchor.chapter !== position.chapter) return;
    const primaryAnchor = { fraction: clampFraction(mirrorAnchor.fraction), verse: mirrorAnchor.verse };
    const resolved = resolveToSecondary(primaryAnchor);
    if (resolved && !resolved.crossChapter && resolved.chapter === position.chapter) {
      applyAnchor(primaryAnchor, { fraction: resolved.fraction, verse: resolved.verse }, resolved.approximate);
    } else {
      applyAnchor(primaryAnchor, undefined, false);
    }
  }, [applyAnchor, mirrorAnchor, position.book, position.chapter, resolveToSecondary]);

  // A font-size, line-height or paragraph-mode change remeasures every row.
  // Restore the last user anchor once the new layout is ready.
  useEffect(() => {
    const current = lastAnchorRef.current;
    if (!current) return;
    if (current.driver === "primary") {
      const resolved = resolveToSecondary(current.anchor);
      const secondaryAnchor = resolved && !resolved.crossChapter && resolved.chapter === position.chapter
        ? { fraction: resolved.fraction, verse: resolved.verse }
        : undefined;
      applyAnchor(current.anchor, secondaryAnchor, resolved?.approximate ?? false);
    } else {
      const resolved = resolveToPrimary(current.anchor);
      const primaryAnchor = resolved && !resolved.crossChapter && resolved.chapter === position.chapter
        ? { fraction: resolved.fraction, verse: resolved.verse }
        : { fraction: 0, verse: current.anchor.verse };
      applyAnchor(primaryAnchor, current.anchor, resolved?.approximate ?? false);
    }
  }, [layoutKey]);

  // Re-anchor after the seam moves: capture the driver's place before the
  // layout changes, then restore both panes once they have measured again.
  const reanchorAfterResize = useCallback(() => {
    const captured = dragAnchorRef.current;
    dragAnchorRef.current = undefined;
    const driver = captured?.driver ?? driverRef.current;
    const anchor = captured?.anchor ?? (driver === "primary"
      ? primaryPaneRef.current?.getAnchor(READING_LINE)
      : secondaryPaneRef.current?.getAnchor(READING_LINE));
    if (!anchor) return;
    if (driver === "primary") {
      const resolved = resolveToSecondary(anchor);
      const secondaryAnchor = resolved && !resolved.crossChapter && resolved.chapter === position.chapter
        ? { fraction: resolved.fraction, verse: resolved.verse }
        : undefined;
      applyAnchor(anchor, secondaryAnchor, resolved?.approximate ?? false);
    } else {
      const resolved = resolveToPrimary(anchor);
      const primaryAnchor = resolved && !resolved.crossChapter && resolved.chapter === position.chapter
        ? { fraction: resolved.fraction, verse: resolved.verse }
        : { fraction: 0, verse: anchor.verse };
      applyAnchor(primaryAnchor, anchor, resolved?.approximate ?? false);
    }
  }, [applyAnchor, position.chapter, resolveToPrimary, resolveToSecondary]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => {
      dragStartRatioRef.current = dragRatioRef.current;
      dragAnchorRef.current = driverRef.current === "primary"
        ? { anchor: primaryPaneRef.current?.getAnchor(READING_LINE) ?? { fraction: 0, verse: position.verse }, driver: "primary" }
        : { anchor: secondaryPaneRef.current?.getAnchor(READING_LINE) ?? { fraction: 0, verse: position.verse }, driver: "secondary" };
      onUserScroll();
    },
    onPanResponderMove: (_event, gesture) => {
      if (containerHeight <= 0) return;
      const next = Math.min(MAX_RATIO, Math.max(MIN_RATIO, dragStartRatioRef.current + gesture.dy / containerHeight));
      dragRatioRef.current = next;
      setDragRatio(next);
    },
    onPanResponderRelease: () => {
      onChangeRatio(dragRatioRef.current);
      requestAnimationFrame(reanchorAfterResize);
    },
    onPanResponderTerminate: () => {
      onChangeRatio(dragRatioRef.current);
      requestAnimationFrame(reanchorAfterResize);
    },
  }), [containerHeight, onChangeRatio, onUserScroll, reanchorAfterResize]);

  const primaryChapter = primary.loadedChapter?.key === `${primaryVersionId}:${position.book}:${position.chapter}`
    ? primary.loadedChapter.value
    : undefined;
  const secondaryKey = `${secondaryVersionId}:${position.book}:${position.chapter}`;
  const secondaryChapter = secondary.loadedChapter?.key === secondaryKey ? secondary.loadedChapter.value : undefined;

  const headerReference = useCallback((anchor: ResolvedAnchor | undefined, fallback: number) => {
    if (!anchor) return `${displayBibleBookName(position.book, bookLanguage)} ${position.chapter}:${fallback}`;
    return `${displayBibleBookName(position.book, bookLanguage)} ${position.chapter}:${anchor.verse}`;
  }, [bookLanguage, position.book, position.chapter]);

  const primaryHeader = headers?.primary;
  const secondaryHeader = headers?.secondary;
  const primaryHighlights = useMemo(() => highlightByVerse(primaryVersionId), [highlightByVerse, primaryVersionId]);
  const secondaryHighlights = useMemo(() => highlightByVerse(secondaryVersionId), [highlightByVerse, secondaryVersionId]);

  return (
    <View onLayout={({ nativeEvent }) => setContainerHeight(nativeEvent.layout.height)} style={{ flex: 1, minHeight: 0, paddingTop: topInset }}>
      <View style={{ flex: dragRatio, minHeight: 0 }}>
        <SplitPane
          active={driverRef.current === "primary"}
          approximate={false}
          bottomInset={bottomInset}
          boundaryHint={primaryBoundary ? t("bible.compare.continueAt", { reference: `${displayBibleBookName(position.book, bookLanguage)} ${primaryBoundary.chapter}:${primaryBoundary.verse}` }) : undefined}
          chapter={primaryChapter}
          chapterError={primary.chapterLoadError}
          flowingParagraphText={flowingParagraphText}
          headerReference={headerReference(primaryHeader, position.verse)}
          highlightByVerse={primaryHighlights}
          onAnchor={handlePrimaryAnchor}
          onBoundaryPress={primaryBoundary ? () => onPositionChange({ book: position.book, chapter: primaryBoundary.chapter, verse: primaryBoundary.verse }, primaryVersionId) : undefined}
          onDragStart={() => handleDragStart("primary")}
          onFootnotePress={(marker, footnote, verse) => onFootnotePress(marker, footnote, verse, primaryVersionId)}
          onReadingMarkerPress={onReadingMarkerPress}
          onRetry={() => primary.retry()}
          onShowVersionPicker={() => onShowVersionPicker("primary")}
          onToggleSync={onToggleSync}
          onVerseCopy={(verse) => onVerseCopy(verse, primaryVersionId)}
          onVerseLongPress={(verse) => onVerseLongPress(verse, primaryVersionId)}
          onVersePress={(verse) => onVersePress(verse, primaryVersionId)}
          onVersePressIn={onVersePressIn}
          palette={palette}
          position={position}
          readerLineHeight={readerLineHeight}
          readerTextStyle={readerTextStyle}
          readingMarkersByVerse={readingMarkersByVerse}
          ref={primaryPaneRef}
          selectedVerseNumbers={selectedVerseNumbers}
          selectedVersePosition={selectedVersePosition}
          showFollowAgain={false}
          showVerseNumbers={showVerseNumbers}
          spokenVerse={spokenVerse}
          syncEnabled={sync}
          versionId={primaryVersionId}
        />
      </View>

      <View
        {...panResponder.panHandlers}
        accessibilityLabel={t("bible.compare.resize")}
        accessibilityRole="adjustable"
        style={{ alignItems: "center", backgroundColor: palette.background, height: 22, justifyContent: "center", zIndex: 5 }}
      >
        <View style={{ backgroundColor: palette.line, height: 1, left: 0, position: "absolute", right: 0, top: 10 }} />
        <View style={{ alignItems: "center", backgroundColor: palette.surface, borderColor: palette.line, borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 3, height: 16, justifyContent: "center", width: 52 }}>
          <Feather name="minus" size={10} color={palette.muted} />
          <View style={{ backgroundColor: palette.muted, borderRadius: 999, height: 3, width: 3 }} />
          <View style={{ backgroundColor: palette.muted, borderRadius: 999, height: 3, width: 3 }} />
          <View style={{ backgroundColor: palette.muted, borderRadius: 999, height: 3, width: 3 }} />
          <Feather name="minus" size={10} color={palette.muted} />
        </View>
      </View>

      <View style={{ flex: 1 - dragRatio, minHeight: 0 }}>
        <SplitPane
          active={driverRef.current === "secondary"}
          approximate={Boolean(secondaryHeader?.approximate)}
          bottomInset={bottomInset}
          boundaryHint={secondaryBoundary ? t("bible.compare.continueAt", { reference: `${displayBibleBookName(position.book, bookLanguage)} ${secondaryBoundary.chapter}:${secondaryBoundary.verse}` }) : undefined}
          chapter={secondaryChapter}
          chapterError={secondary.chapterLoadError}
          flowingParagraphText={flowingParagraphText}
          headerReference={headerReference(secondaryHeader, position.verse)}
          highlightByVerse={secondaryHighlights}
          onAnchor={handleSecondaryAnchor}
          onBoundaryPress={secondaryBoundary ? () => onPositionChange({ book: position.book, chapter: secondaryBoundary.chapter, verse: secondaryBoundary.verse }, secondaryVersionId) : undefined}
          onClose={onClose}
          onDragStart={() => handleDragStart("secondary")}
          onFollowAgain={onToggleSync}
          onFootnotePress={(marker, footnote, verse) => onFootnotePress(marker, footnote, verse, secondaryVersionId)}
          onReadingMarkerPress={onReadingMarkerPress}
          onRetry={() => secondary.retry()}
          onShowVersionPicker={() => onShowVersionPicker("secondary")}
          onToggleSync={onToggleSync}
          onVerseCopy={(verse) => onVerseCopy(verse, secondaryVersionId)}
          onVerseLongPress={(verse) => onVerseLongPress(verse, secondaryVersionId)}
          onVersePress={(verse) => onVersePress(verse, secondaryVersionId)}
          onVersePressIn={onVersePressIn}
          palette={palette}
          position={position}
          readerLineHeight={readerLineHeight}
          readerTextStyle={readerTextStyle}
          ref={secondaryPaneRef}
          selectedVerseNumbers={selectedVerseNumbers}
          selectedVersePosition={selectedVersePosition}
          showFollowAgain={!sync}
          showVerseNumbers={showVerseNumbers}
          spokenVerse={spokenVerse}
          syncEnabled={sync}
          versionId={secondaryVersionId}
        />
      </View>
    </View>
  );
}
