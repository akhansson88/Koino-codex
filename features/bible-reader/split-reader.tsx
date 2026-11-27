import { Feather } from "@expo/vector-icons";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PanResponder, Text, View, type GestureResponderHandlers, type TextStyle } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { bibleVerseLinks, type BibleFootnote, type BiblePosition, type BibleVersionId } from "@/features/bible-kjv";
import { ChapterPager, type ChapterPagerHandle } from "@/features/bible-reader/chapter-pager";
import { chapterIndex, readerChapterKey } from "@/features/bible-reader/chapter-navigation";
import { useChapterWindow, type ChapterPage } from "@/features/bible-reader/chapter-window";
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
const NOOP = () => {};
const NOOP_ANCHOR = () => {};
const EMPTY_HIGHLIGHTS: Record<number, BibleHighlightColor> = {};
const EMPTY_NUMBERS: number[] = [];

export type SplitReaderProps = {
  audioAnchor?: { book: string; chapter: number; verse: number };
  bottomInset: number;
  cursor: SharedValue<number>;
  enabled: boolean;
  flowingParagraphText: boolean;
  highlightByVerse: (versionId: BibleVersionId, book: string, chapter: number) => Record<number, BibleHighlightColor>;
  layoutKey: string;
  mirrorAnchor?: { book: string; chapter: number; fraction: number; verse: number };
  mirroring: boolean;
  navigationRevision: number;
  onChangeRatio: (ratio: number) => void;
  onChapterCommit: (position: BiblePosition) => void;
  onShowVersionPicker: (slot: "primary" | "secondary") => void;
  onClose: () => void;
  onFootnotePress: (marker: string, footnote: BibleFootnote, verse: number, versionId: BibleVersionId, position: BiblePosition) => void;
  onPositionChange: (position: BiblePosition, versionId: BibleVersionId) => void;
  onReadingMarkerPress?: () => void;
  onToggleSync: () => void;
  onUserScroll: () => void;
  onVerseCopy: (verse: number, versionId: BibleVersionId, position: BiblePosition) => void;
  onVerseLongPress: (verse: number, versionId: BibleVersionId, position: BiblePosition) => void;
  onVersePress: (verse: number, versionId: BibleVersionId, position: BiblePosition) => void;
  onVersePressIn: () => void;
  palette: ReaderPalette;
  position: BiblePosition;
  primaryVersionId: BibleVersionId;
  ratio: number;
  readerLineHeight: number;
  readerTextStyle: TextStyle;
  readingMarkersByVerse?: Record<number, ReadingMarker[]>;
  reducedMotion: boolean;
  secondaryVersionId: BibleVersionId;
  selectedVerseNumbers: number[];
  selectedVersePosition?: BiblePosition;
  showVerseNumbers: boolean;
  spokenVerse?: number;
  sync: boolean;
  topInset: number;
  width: number;
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

const SplitSeam = memo(function SplitSeam({ active, handlers, palette }: {
  active: boolean;
  handlers?: GestureResponderHandlers;
  palette: ReaderPalette;
}) {
  const { t } = useAppTranslation();
  return (
    <View
      {...(handlers ?? {})}
      accessibilityLabel={active ? t("bible.compare.resize") : undefined}
      accessibilityRole={active ? "adjustable" : undefined}
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
  );
});

export type SplitReaderHandle = {
  step: (direction: -1 | 1) => void;
};

export const SplitReader = forwardRef<SplitReaderHandle, SplitReaderProps>(function SplitReader({
  audioAnchor,
  bottomInset,
  cursor,
  enabled,
  flowingParagraphText,
  highlightByVerse,
  layoutKey,
  mirrorAnchor,
  mirroring,
  navigationRevision,
  onChangeRatio,
  onChapterCommit,
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
  reducedMotion,
  secondaryVersionId,
  selectedVerseNumbers,
  selectedVersePosition,
  showVerseNumbers,
  spokenVerse,
  sync,
  topInset,
  width,
  onAnchorChange,
}: SplitReaderProps, ref) {
  const { t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage(primaryVersionId);

  const primaryChapterPosition = useMemo(
    () => ({ book: position.book, chapter: position.chapter, verse: 1 }),
    [position.book, position.chapter],
  );
  // A live mirror is read-only and always shows the sharer's chapter in both
  // panes. Otherwise the panes only share a chapter while the link is on.
  const followPrimary = sync || mirroring;
  const [secondaryPosition, setSecondaryPosition] = useState<BiblePosition>(() => ({
    book: position.book,
    chapter: position.chapter,
    verse: 1,
  }));
  const effectiveSecondaryPosition = useMemo(
    () => followPrimary ? primaryChapterPosition : secondaryPosition,
    [followPrimary, primaryChapterPosition, secondaryPosition],
  );

  const primary = useChapterWindow(primaryChapterPosition, primaryVersionId, true);
  const secondary = useChapterWindow(effectiveSecondaryPosition, secondaryVersionId, true);
  const primaryCursor = cursor;
  const secondaryCursor = useSharedValue(chapterIndex(effectiveSecondaryPosition));
  const primaryPagerRef = useRef<ChapterPagerHandle>(null);
  useImperativeHandle(ref, () => ({ step: (direction) => primaryPagerRef.current?.step(direction) }), []);

  const primaryPaneRef = useRef<SplitPaneHandle>(null);
  const secondaryPaneRef = useRef<SplitPaneHandle>(null);
  const driverRef = useRef<"primary" | "secondary">("primary");
  const [containerHeight, setContainerHeight] = useState(0);
  const [dragRatio, setDragRatio] = useState(ratio);
  const dragRatioRef = useRef(ratio);
  dragRatioRef.current = dragRatio;
  const dragStartRatioRef = useRef(ratio);
  const dragAnchorsRef = useRef<{ primary?: VerseAnchor; secondary?: VerseAnchor } | undefined>(undefined);
  const lastPrimaryAnchorRef = useRef<VerseAnchor | undefined>(undefined);
  const lastSecondaryAnchorRef = useRef<VerseAnchor | undefined>(undefined);
  const positionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingPositionRef = useRef<BiblePosition | undefined>(undefined);
  const [primaryHeader, setPrimaryHeader] = useState<ResolvedAnchor>();
  const [secondaryHeader, setSecondaryHeader] = useState<ResolvedAnchor>();
  const [primaryBoundary, setPrimaryBoundary] = useState<{ chapter: number; verse: number }>();
  const [secondaryBoundary, setSecondaryBoundary] = useState<{ chapter: number; verse: number }>();
  const primaryHeaderSignatureRef = useRef("");
  const secondaryHeaderSignatureRef = useRef("");
  const lastPositionRef = useRef("");
  const internalPositionRef = useRef("");
  const externalTokenRef = useRef(0);

  useEffect(() => {
    if (!dragRatioRef.current || dragRatioRef.current === ratio) return;
    setDragRatio(ratio);
  }, [ratio]);

  // While linked, the follower always shows the primary pane's chapter. The
  // local secondary chapter is only updated when the link turns off, so it
  // stays on whatever the linked reader was last showing.
  const wasFollowPrimaryRef = useRef(followPrimary);
  useEffect(() => {
    if (wasFollowPrimaryRef.current && !followPrimary) {
      setSecondaryPosition({ book: position.book, chapter: position.chapter, verse: 1 });
    }
    wasFollowPrimaryRef.current = followPrimary;
  }, [followPrimary, position.book, position.chapter]);

  // Each pane has its own cursor when unlinked, so only the swiped pane moves.
  useEffect(() => {
    if (followPrimary) return;
    secondaryCursor.value = chapterIndex(effectiveSecondaryPosition);
  }, [effectiveSecondaryPosition, followPrimary, secondaryCursor]);

  useEffect(() => {
    setPrimaryHeader(undefined);
    setPrimaryBoundary(undefined);
    primaryHeaderSignatureRef.current = "";
  }, [position.book, position.chapter, primaryVersionId]);

  useEffect(() => {
    setSecondaryHeader(undefined);
    setSecondaryBoundary(undefined);
    secondaryHeaderSignatureRef.current = "";
  }, [effectiveSecondaryPosition.book, effectiveSecondaryPosition.chapter, secondaryVersionId]);

  const primaryToPivot = useMemo(
    () => primaryVersionId === "kjv" ? undefined : bibleVerseLinks(position.book, position.chapter, primaryVersionId, "kjv"),
    [position.book, position.chapter, primaryVersionId],
  );
  const pivotToSecondary = useMemo(
    () => secondaryVersionId === "kjv" ? undefined : bibleVerseLinks(effectiveSecondaryPosition.book, effectiveSecondaryPosition.chapter, "kjv", secondaryVersionId),
    [effectiveSecondaryPosition.book, effectiveSecondaryPosition.chapter, secondaryVersionId],
  );
  const secondaryToPivot = useMemo(
    () => secondaryVersionId === "kjv" ? undefined : bibleVerseLinks(effectiveSecondaryPosition.book, effectiveSecondaryPosition.chapter, secondaryVersionId, "kjv"),
    [effectiveSecondaryPosition.book, effectiveSecondaryPosition.chapter, secondaryVersionId],
  );
  const pivotToPrimary = useMemo(
    () => primaryVersionId === "kjv" ? undefined : bibleVerseLinks(position.book, position.chapter, "kjv", primaryVersionId),
    [position.book, position.chapter, primaryVersionId],
  );

  const resolveToSecondary = useCallback((anchor: VerseAnchor): ResolvedAnchor | undefined => {
    if (primaryVersionId === secondaryVersionId) {
      return { approximate: false, chapter: effectiveSecondaryPosition.chapter, crossChapter: false, fraction: anchor.fraction, verse: anchor.verse };
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
    return composeAnchor(first, () => second);
  }, [effectiveSecondaryPosition.chapter, pivotToSecondary, position.chapter, primaryToPivot, primaryVersionId, secondaryVersionId]);

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
    if (first.chapter !== effectiveSecondaryPosition.chapter) return first;
    const second = resolveAnchor(pivotToPrimary!, { fraction: first.fraction, verse: first.verse });
    return composeAnchor(first, () => second);
  }, [effectiveSecondaryPosition.chapter, pivotToPrimary, position.chapter, primaryVersionId, pivotToPrimary, secondaryToPivot, secondaryVersionId]);

  const updatePrimaryHeader = useCallback((anchor: VerseAnchor) => {
    const signature = `${position.chapter}:${anchor.verse}`;
    if (primaryHeaderSignatureRef.current === signature) return;
    primaryHeaderSignatureRef.current = signature;
    setPrimaryHeader({ approximate: false, chapter: position.chapter, crossChapter: false, fraction: anchor.fraction, verse: anchor.verse });
  }, [position.chapter]);

  const updateSecondaryHeader = useCallback((anchor: VerseAnchor, approximate = false) => {
    const chapter = effectiveSecondaryPosition.chapter;
    const signature = `${chapter}:${anchor.verse}:${approximate}`;
    if (secondaryHeaderSignatureRef.current === signature) return;
    secondaryHeaderSignatureRef.current = signature;
    setSecondaryHeader({ approximate, chapter, crossChapter: false, fraction: anchor.fraction, verse: anchor.verse });
  }, [effectiveSecondaryPosition.chapter]);

  /** Scrolls each pane to its own anchor; omit a pane to leave it untouched. */
  const scrollPanes = useCallback((primaryAnchor?: VerseAnchor, secondaryAnchor?: VerseAnchor, secondaryApproximate = false) => {
    setPrimaryBoundary(undefined);
    setSecondaryBoundary(undefined);
    const token = ++externalTokenRef.current;
    let attempts = 0;
    const tick = () => {
      if (token !== externalTokenRef.current) return;
      const primaryDone = primaryAnchor ? primaryPaneRef.current?.scrollToAnchor(primaryAnchor, READING_LINE) ?? false : true;
      const secondaryDone = secondaryAnchor ? secondaryPaneRef.current?.scrollToAnchor(secondaryAnchor, READING_LINE) ?? false : true;
      if ((!primaryDone || !secondaryDone) && attempts++ < 120) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    if (primaryAnchor) {
      lastPrimaryAnchorRef.current = primaryAnchor;
      updatePrimaryHeader(primaryAnchor);
    }
    if (secondaryAnchor) {
      lastSecondaryAnchorRef.current = secondaryAnchor;
      updateSecondaryHeader(secondaryAnchor, secondaryApproximate);
    }
  }, [updatePrimaryHeader, updateSecondaryHeader]);

  const applyToSecondary = useCallback((primaryAnchor: VerseAnchor) => {
    const resolved = resolveToSecondary(primaryAnchor);
    if (!resolved) {
      setSecondaryBoundary(undefined);
      return;
    }
    if (resolved.crossChapter || resolved.chapter !== effectiveSecondaryPosition.chapter) {
      // Do not flip the follower's chapter while the driver is still in this
      // one. Clamp to the edge and show the approximate marker.
      const layout = secondaryPaneRef.current?.getLayout();
      const edgeVerse = layout?.verses.at(-1) ?? resolved.verse;
      const clamped = { fraction: 0, verse: edgeVerse };
      secondaryPaneRef.current?.scrollToAnchor(clamped, READING_LINE);
      lastSecondaryAnchorRef.current = clamped;
      updateSecondaryHeader(clamped, true);
      setSecondaryBoundary({ chapter: resolved.chapter, verse: resolved.verse });
      return;
    }
    setSecondaryBoundary(undefined);
    const anchor = { fraction: resolved.fraction, verse: resolved.verse };
    secondaryPaneRef.current?.scrollToAnchor(anchor, READING_LINE);
    lastSecondaryAnchorRef.current = anchor;
    updateSecondaryHeader(anchor, resolved.approximate);
  }, [effectiveSecondaryPosition.chapter, resolveToSecondary, updateSecondaryHeader]);

  const applyToPrimary = useCallback((secondaryAnchor: VerseAnchor) => {
    const resolved = resolveToPrimary(secondaryAnchor);
    if (!resolved) {
      setPrimaryBoundary(undefined);
      return;
    }
    if (resolved.crossChapter || resolved.chapter !== position.chapter) {
      const layout = primaryPaneRef.current?.getLayout();
      const edgeVerse = (resolved.verse > (layout?.verses.at(-1) ?? resolved.verse)) ? (layout?.verses.at(-1) ?? resolved.verse) : resolved.verse;
      const anchor = { fraction: 0, verse: edgeVerse };
      primaryPaneRef.current?.scrollToAnchor(anchor, READING_LINE);
      lastPrimaryAnchorRef.current = anchor;
      onAnchorChange?.(anchor);
      updatePrimaryHeader(anchor);
      setPrimaryBoundary({ chapter: resolved.chapter, verse: resolved.verse });
      return;
    }
    setPrimaryBoundary(undefined);
    const anchor = { fraction: resolved.fraction, verse: resolved.verse };
    primaryPaneRef.current?.scrollToAnchor(anchor, READING_LINE);
    lastPrimaryAnchorRef.current = anchor;
    onAnchorChange?.(anchor);
    updatePrimaryHeader(anchor);
  }, [onAnchorChange, position.chapter, resolveToPrimary, updatePrimaryHeader]);

  const handlePrimaryAnchor = useCallback((anchor: VerseAnchor) => {
    if (driverRef.current !== "primary") return;
    driverRef.current = "primary";
    lastPrimaryAnchorRef.current = anchor;
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
    updatePrimaryHeader(anchor);
    if (sync) applyToSecondary(anchor);
  }, [applyToSecondary, onAnchorChange, onPositionChange, position.book, position.chapter, primaryVersionId, sync, updatePrimaryHeader]);

  const handleSecondaryAnchor = useCallback((anchor: VerseAnchor) => {
    if (driverRef.current !== "secondary") return;
    driverRef.current = "secondary";
    lastSecondaryAnchorRef.current = anchor;
    updateSecondaryHeader(anchor);
    if (sync) applyToPrimary(anchor);
  }, [applyToPrimary, sync, updateSecondaryHeader]);

  useEffect(() => () => {
    if (positionTimerRef.current !== undefined) clearTimeout(positionTimerRef.current);
  }, []);

  const handleDragStart = useCallback((driver: "primary" | "secondary") => {
    driverRef.current = driver;
    if (driver === "primary") setSecondaryBoundary(undefined);
    else setPrimaryBoundary(undefined);
    onUserScroll();
  }, [onUserScroll]);

  const handlePrimaryBoundary = useCallback(() => {
    if (!primaryBoundary) return;
    onPositionChange({ book: position.book, chapter: primaryBoundary.chapter, verse: primaryBoundary.verse }, primaryVersionId);
  }, [onPositionChange, position.book, primaryBoundary, primaryVersionId]);

  const handleSecondaryBoundary = useCallback(() => {
    if (!secondaryBoundary) return;
    const target = { book: effectiveSecondaryPosition.book, chapter: secondaryBoundary.chapter, verse: secondaryBoundary.verse };
    if (sync) {
      onChapterCommit(target);
    } else {
      setSecondaryPosition(target);
    }
  }, [effectiveSecondaryPosition.book, onChapterCommit, secondaryBoundary, sync]);

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
    if (followPrimary) {
      const resolved = resolveToSecondary(primaryAnchor);
      const secondaryAnchor = resolved && !resolved.crossChapter && resolved.chapter === effectiveSecondaryPosition.chapter
        ? { fraction: resolved.fraction, verse: resolved.verse }
        : undefined;
      scrollPanes(primaryAnchor, secondaryAnchor, resolved?.approximate ?? false);
    } else {
      scrollPanes(primaryAnchor, undefined);
    }
  }, [effectiveSecondaryPosition.chapter, followPrimary, navigationRevision, position.book, position.chapter, position.verse, resolveToSecondary, scrollPanes]);

  // Audio follow always drives the primary pane.
  useEffect(() => {
    if (!audioAnchor || audioAnchor.book !== position.book || audioAnchor.chapter !== position.chapter) return;
    const primaryAnchor = { fraction: 0, verse: audioAnchor.verse };
    if (sync) {
      const resolved = resolveToSecondary(primaryAnchor);
      const secondaryAnchor = resolved && !resolved.crossChapter && resolved.chapter === effectiveSecondaryPosition.chapter
        ? { fraction: resolved.fraction, verse: resolved.verse }
        : undefined;
      scrollPanes(primaryAnchor, secondaryAnchor, resolved?.approximate ?? false);
    } else {
      scrollPanes(primaryAnchor, undefined);
    }
  }, [audioAnchor, effectiveSecondaryPosition.chapter, position.book, position.chapter, resolveToSecondary, scrollPanes, sync]);

  // A followed reader's anchor arrives from the mirror record.
  useEffect(() => {
    if (!mirrorAnchor || mirrorAnchor.book !== position.book || mirrorAnchor.chapter !== position.chapter) return;
    const primaryAnchor = { fraction: clampFraction(mirrorAnchor.fraction), verse: mirrorAnchor.verse };
    const resolved = resolveToSecondary(primaryAnchor);
    const secondaryAnchor = resolved && !resolved.crossChapter && resolved.chapter === effectiveSecondaryPosition.chapter
      ? { fraction: resolved.fraction, verse: resolved.verse }
      : undefined;
    scrollPanes(primaryAnchor, secondaryAnchor, resolved?.approximate ?? false);
  }, [effectiveSecondaryPosition.chapter, mirrorAnchor, position.book, position.chapter, resolveToSecondary, scrollPanes]);

  // A font-size, line-height or paragraph-mode change remeasures every row.
  // Restore each pane's own last anchor once the new layout is ready.
  useEffect(() => {
    const primaryAnchor = lastPrimaryAnchorRef.current ?? primaryPaneRef.current?.getAnchor(READING_LINE);
    const secondaryAnchor = lastSecondaryAnchorRef.current ?? secondaryPaneRef.current?.getAnchor(READING_LINE);
    if (primaryAnchor || secondaryAnchor) scrollPanes(primaryAnchor, secondaryAnchor);
  }, [layoutKey]);

  // Re-anchor after the seam moves: capture each pane's place before the
  // layout changes, then restore it once both panes have measured again.
  const reanchorAfterResize = useCallback(() => {
    const captured = dragAnchorsRef.current;
    dragAnchorsRef.current = undefined;
    const primaryAnchor = captured?.primary ?? primaryPaneRef.current?.getAnchor(READING_LINE);
    const secondaryAnchor = captured?.secondary ?? secondaryPaneRef.current?.getAnchor(READING_LINE);
    if (primaryAnchor || secondaryAnchor) scrollPanes(primaryAnchor, secondaryAnchor);
  }, [scrollPanes]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => {
      dragStartRatioRef.current = dragRatioRef.current;
      dragAnchorsRef.current = {
        primary: primaryPaneRef.current?.getAnchor(READING_LINE),
        secondary: secondaryPaneRef.current?.getAnchor(READING_LINE),
      };
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

  const commitPrimary = useCallback((page: ChapterPage) => {
    onChapterCommit(page.position);
  }, [onChapterCommit]);

  const commitSecondary = useCallback((page: ChapterPage) => {
    if (!followPrimary) {
      setSecondaryPosition({ book: page.position.book, chapter: page.position.chapter, verse: 1 });
    } else {
      onChapterCommit(page.position);
    }
  }, [followPrimary, onChapterCommit]);

  const primaryHighlights = useMemo(
    () => highlightByVerse(primaryVersionId, position.book, position.chapter),
    [highlightByVerse, position.book, position.chapter, primaryVersionId],
  );
  const secondaryHighlights = useMemo(
    () => highlightByVerse(secondaryVersionId, effectiveSecondaryPosition.book, effectiveSecondaryPosition.chapter),
    [effectiveSecondaryPosition.book, effectiveSecondaryPosition.chapter, highlightByVerse, secondaryVersionId],
  );

  const headerReference = useCallback((anchor: ResolvedAnchor | undefined, fallback: number, page: BiblePosition) => {
    if (!anchor) return `${displayBibleBookName(page.book, bookLanguage)} ${page.chapter}:${fallback}`;
    return `${displayBibleBookName(page.book, bookLanguage)} ${page.chapter}:${anchor.verse}`;
  }, [bookLanguage]);

  const primaryReference = headerReference(primaryHeader, position.verse, position);
  const secondaryReference = headerReference(secondaryHeader, 1, effectiveSecondaryPosition);
  const chapterReference = useCallback((page: BiblePosition) =>
    `${displayBibleBookName(page.book, bookLanguage)} ${page.chapter}:1`, [bookLanguage]);
  const selectionMatchesPage = useCallback((page: BiblePosition) => {
    if (selectedVersePosition) {
      return selectedVersePosition.book === page.book && selectedVersePosition.chapter === page.chapter;
    }
    return position.book === page.book && position.chapter === page.chapter;
  }, [position.book, position.chapter, selectedVersePosition]);

  const primaryKey = readerChapterKey(primaryVersionId, position);
  const secondaryKey = readerChapterKey(secondaryVersionId, effectiveSecondaryPosition);
  const retryPrimary = useCallback(() => primary.retry(primaryKey), [primary.retry, primaryKey]);
  const retrySecondary = useCallback(() => secondary.retry(secondaryKey), [secondary.retry, secondaryKey]);

  return (
    <View
      onLayout={({ nativeEvent }) => setContainerHeight(nativeEvent.layout.height)}
      style={{ flex: 1, minHeight: 0, paddingTop: topInset }}
    >
      <View style={{ flex: dragRatio, minHeight: 0 }}>
        <ChapterPager
          backgroundColor={palette.background}
          currentKey={primaryKey}
          cursor={primaryCursor}
          enabled={enabled}
          layoutKey={layoutKey}
          navigationRevision={navigationRevision}
          onCommit={commitPrimary}
          onInteractionChange={(active) => { if (active) { driverRef.current = "primary"; onUserScroll(); } }}
          onLayout={NOOP}
          onLoadError={NOOP}
          onRetry={(key) => primary.retry(key)}
          pages={primary.pages}
          reducedMotion={reducedMotion}
          ref={primaryPagerRef}
          renderPage={(page, active, pan) => (
            <SplitPane
              active={active && driverRef.current === "primary"}
              approximate={false}
              bottomInset={bottomInset}
              boundaryHint={active && primaryBoundary ? t("bible.compare.continueAt", { reference: `${displayBibleBookName(position.book, bookLanguage)} ${primaryBoundary.chapter}:${primaryBoundary.verse}` }) : undefined}
              chapter={page.chapter}
              chapterError={Boolean(page.error)}
              flowingParagraphText={flowingParagraphText}
              headerReference={active ? primaryReference : chapterReference(page.position)}
              highlightByVerse={active ? primaryHighlights : EMPTY_HIGHLIGHTS}
              onAnchor={active ? handlePrimaryAnchor : NOOP_ANCHOR}
              onBoundaryPress={active && primaryBoundary ? handlePrimaryBoundary : undefined}
              onDragStart={active ? () => handleDragStart("primary") : NOOP}
              onFootnotePress={active ? (marker, footnote, verse) => onFootnotePress(marker, footnote, verse, primaryVersionId, page.position) : NOOP}
              onReadingMarkerPress={active ? onReadingMarkerPress : undefined}
              onRetry={active ? retryPrimary : NOOP}
              onShowVersionPicker={active ? () => onShowVersionPicker("primary") : NOOP}
              onToggleSync={active ? onToggleSync : NOOP}
              onVerseCopy={active ? (verse) => onVerseCopy(verse, primaryVersionId, page.position) : NOOP}
              onVerseLongPress={active ? (verse) => onVerseLongPress(verse, primaryVersionId, page.position) : NOOP}
              onVersePress={active ? (verse) => onVersePress(verse, primaryVersionId, page.position) : NOOP}
              onVersePressIn={active ? onVersePressIn : NOOP}
              palette={palette}
              pan={active ? pan : undefined}
              position={page.position}
              readerLineHeight={readerLineHeight}
              readerTextStyle={readerTextStyle}
              readingMarkersByVerse={active ? readingMarkersByVerse : undefined}
              selectedVerseNumbers={active && selectionMatchesPage(page.position) ? selectedVerseNumbers : EMPTY_NUMBERS}
              selectedVersePosition={active && selectionMatchesPage(page.position) ? selectedVersePosition : undefined}
              showFollowAgain={false}
              showVerseNumbers={showVerseNumbers}
              spokenVerse={active ? spokenVerse : undefined}
              syncEnabled={sync}
              versionId={primaryVersionId}
            />
          )}
          viewportRef={undefined}
          width={width}
          wrapNativeGesture={false}
        />
      </View>

      <SplitSeam active handlers={panResponder.panHandlers} palette={palette} />

      <View style={{ flex: 1 - dragRatio, minHeight: 0 }}>
        <ChapterPager
          backgroundColor={palette.background}
          currentKey={secondaryKey}
          cursor={followPrimary ? primaryCursor : secondaryCursor}
          enabled={enabled}
          layoutKey={`${layoutKey}:secondary:${followPrimary ? "linked" : "free"}`}
          navigationRevision={followPrimary ? navigationRevision : 0}
          onCommit={commitSecondary}
          onInteractionChange={(active) => { if (active) { driverRef.current = "secondary"; onUserScroll(); } }}
          onLayout={NOOP}
          onLoadError={NOOP}
          onRetry={(key) => secondary.retry(key)}
          pages={secondary.pages}
          reducedMotion={reducedMotion}
          renderPage={(page, active, pan) => {
            const sameChapter = page.position.book === position.book && page.position.chapter === position.chapter;
            return (
              <SplitPane
                active={active && driverRef.current === "secondary"}
                approximate={active ? Boolean(secondaryHeader?.approximate) : false}
                bottomInset={bottomInset}
                boundaryHint={active && secondaryBoundary ? t("bible.compare.continueAt", { reference: `${displayBibleBookName(effectiveSecondaryPosition.book, bookLanguage)} ${secondaryBoundary.chapter}:${secondaryBoundary.verse}` }) : undefined}
                chapter={page.chapter}
                chapterError={Boolean(page.error)}
                flowingParagraphText={flowingParagraphText}
                headerReference={active ? secondaryReference : chapterReference(page.position)}
                highlightByVerse={active ? secondaryHighlights : EMPTY_HIGHLIGHTS}
                onAnchor={active ? handleSecondaryAnchor : NOOP_ANCHOR}
                onBoundaryPress={active && secondaryBoundary ? handleSecondaryBoundary : undefined}
                onClose={active ? onClose : undefined}
                onDragStart={active ? () => handleDragStart("secondary") : NOOP}
                onFollowAgain={active && !sync && !mirroring ? onToggleSync : undefined}
                onFootnotePress={active ? (marker, footnote, verse) => onFootnotePress(marker, footnote, verse, secondaryVersionId, page.position) : NOOP}
                onReadingMarkerPress={active ? onReadingMarkerPress : undefined}
                onRetry={active ? retrySecondary : NOOP}
                onShowVersionPicker={active ? () => onShowVersionPicker("secondary") : NOOP}
                onToggleSync={active ? onToggleSync : NOOP}
                onVerseCopy={active ? (verse) => onVerseCopy(verse, secondaryVersionId, page.position) : NOOP}
                onVerseLongPress={active ? (verse) => onVerseLongPress(verse, secondaryVersionId, page.position) : NOOP}
                onVersePress={active ? (verse) => onVersePress(verse, secondaryVersionId, page.position) : NOOP}
                onVersePressIn={active ? onVersePressIn : NOOP}
                palette={palette}
                pan={active ? pan : undefined}
                position={page.position}
                readerLineHeight={readerLineHeight}
                readerTextStyle={readerTextStyle}
                readingMarkersByVerse={active && sameChapter ? readingMarkersByVerse : undefined}
                selectedVerseNumbers={active && selectionMatchesPage(page.position) ? selectedVerseNumbers : EMPTY_NUMBERS}
                selectedVersePosition={active && selectionMatchesPage(page.position) ? selectedVersePosition : undefined}
                showFollowAgain={active && !sync && !mirroring}
                showVerseNumbers={showVerseNumbers}
                spokenVerse={active && sameChapter ? spokenVerse : undefined}
                syncEnabled={sync}
                versionId={secondaryVersionId}
              />
            );
          }}
          viewportRef={undefined}
          width={width}
          wrapNativeGesture={false}
        />
      </View>
    </View>
  );
});
