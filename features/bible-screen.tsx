import { BibleBookVersionContext, useBibleBookLanguage } from "@/features/use-bible-book-language";
import { tabBarHeight } from "@/ui/navigation-layout";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextStyle,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  initialBibleHistory,
  moveBibleHistory,
  updateBibleHistoryPosition,
  visitBiblePosition,
  type BibleHistory,
} from "@/features/bible-history";
import {
  bibleChapterAsync,
  bibleCrossReferences,
  bibleCrossReferenceVersesAsync,
  bibleVersionFor,
  buildBibleVerse,
  nextBibleChapter,
  normalizeBiblePosition,
  previousBibleChapter,
  type BibleChapter,
  type BibleCrossReference,
  type BiblePosition,
  type BibleVersionId,
} from "@/features/bible-kjv";
import { currentPlanDay, firstPositionForPlanDay, planMarkersForChapter, todayDateKey } from "@/features/bible-plans";
import {
  defaultBibleVersionId,
  notifyBibleVersionPreferenceChanged,
  readerStorageKey,
} from "@/features/bible-preferences";
import { displayBibleReference } from "@/features/bible-search";
import { nextUnreadPlanDay, todayPlanDay } from "@/state/bible-plan-schedule";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import { visibility, type EntryVisibility } from "@/state/product";
import { savedVerseIdentity } from "@/state/saved-verses";
import type { BibleHighlightColor, BibleHighlightPaletteColor, BibleVerse, EntryKind, SavedVerse } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { SharedComposer, type BibleComposerIntent } from "@/ui/shared-composer";
import { type ThemeName } from "@/ui/theme";
import {
  type MeasurableView,
  type BibleReaderFontId,
  type BibleReaderThemePreference,
  type SelectedBibleFootnote,
  type BibleTopicResult,
  type BibleTopicVoteValue,
  type ReaderToast,
  type PendingVerseComposerAction,
  type ChapterSwipeDirection,
  type BibleReaderPreferences,
  type VerseQuickAction,
  type BibleTopicReference,
} from "@/features/bible-reader/types";
import {
  defaultPosition,
  defaultFontId,
  defaultFontSize,
  defaultShowVerseNumbers,
  defaultShowFootnotes,
  defaultShowCrossReferences,
  defaultCompactMode,
  fontFamilyFor,
  minFontSize,
  parsePreferences,
  normalizeFontSize,
} from "@/features/bible-reader/preferences";
import { readerPaletteFor } from "@/features/bible-reader/palette";
import {
  selectedVerseRangesFor,
  selectedVerseReferenceLabel,
  highlightTime,
  verseRangesOverlap,
  chapterLabel,
  bibleVersionShortLabel,
  biblePositionFromReference,
} from "@/features/bible-reader/verse-helpers";
import {
  fetchBibleTopic,
  searchBibleTopicText,
  bibleTopicVoteKey,
  submitBibleTopicVote,
  bibleTopicKey,
} from "@/features/bible-reader/topics-api";
import { BibleReaderHeader } from "@/features/bible-reader/header";
import { BiblePlanReaderPanel } from "@/features/bible-reader/plan-panel";
import { BibleText } from "@/features/bible-reader/chapter-text";
import { ChapterSwipeIndicator } from "@/features/bible-reader/swipe-indicator";
import { BibleBottomReadingControls } from "@/features/bible-reader/reading-controls";
import { SelectedVerseSuggestionBar, VerseActionSheet } from "@/features/bible-reader/verse-actions";
import { ReaderToastMessage } from "@/features/bible-reader/toast";
import { HighlightColorManagerSheet } from "@/features/bible-reader/highlight-colors";
import { ReadingSettingsSheet } from "@/features/bible-reader/reading-settings";
import { BibleVersionSheet } from "@/features/bible-reader/version-sheet";
import { CrossReferenceSheet, FootnoteSheet } from "@/features/bible-reader/reference-sheets";
import { BibleDrawer } from "@/features/bible-reader/drawer";
import { BibleTopicsModal } from "@/features/bible-reader/topics-modal";

function isChapterSwipeGesture(dx: number, dy: number) {
  return Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.8;
}

const chapterSwipeActivationDistance = 12;

const chapterSwipeActivationRatio = 1.6;

const chapterScrollIntentDistance = 6;

const chapterSwipeDistanceRatio = 0.24;

const chapterSwipeVelocity = 0.7;

export function BibleScreen() {
  const planParams = useLocalSearchParams<{ planId?: string; planDay?: string; planJump?: string }>();
  const handledPlanJump = useRef<string | undefined>(undefined);
  const [selectedPlanDayNumber, setSelectedPlanDayNumber] = useState<number | undefined>();
  const state = useKoinoFields(["bibleHighlightColors", "bibleHighlights", "biblePlans", "currentGroupId", "currentUserId", "groups", "journalEntries", "savedVerses", "theme"]);
  const { dispatch } = useKoinoActions();
  const { language, t } = useAppTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const actionReturnFocusRef = useRef<View | null>(null);
  const verseRowsRef = useRef<Record<number, MeasurableView | null>>({});
  const readerScrollOffsetRef = useRef(0);
  const pendingScrollVerseRef = useRef<number | undefined>(undefined);
  const programmaticScrollVerseRef = useRef<number | undefined>(undefined);
  const positionRef = useRef<BiblePosition>(defaultPosition);
  const historyRef = useRef<BibleHistory>(initialBibleHistory(defaultPosition));
  const lastScrollCommitRef = useRef(0);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const topicRequestRef = useRef(0);
  const chapterSwipeX = useRef(new Animated.Value(0)).current;
  const chapterSwipeAnimatingRef = useRef(false);
  const chapterSwipeBlockedByScrollRef = useRef(false);
  const verseLongPressActiveRef = useRef(false);

  const [position, setPosition] = useState<BiblePosition>(defaultPosition);
  const [history, setHistory] = useState<BibleHistory>(() => initialBibleHistory(defaultPosition));
  const [highlightedPosition, setHighlightedPosition] = useState<BiblePosition | undefined>();
  const [bibleVersionId, setBibleVersionId] = useState<BibleVersionId>(defaultBibleVersionId);

  const bookLanguage = useBibleBookLanguage(bibleVersionId);
  const [fontId, setFontId] = useState<BibleReaderFontId>(defaultFontId);
  const [fontSize, setFontSize] = useState(defaultFontSize);
  const [readerThemePreference, setReaderThemePreference] = useState<BibleReaderThemePreference>({
    appTheme: state.theme,
    readerTheme: state.theme,
  });
  const [showVerseNumbers, setShowVerseNumbers] = useState(defaultShowVerseNumbers);
  const [showFootnotes, setShowFootnotes] = useState(defaultShowFootnotes);
  const [showCrossReferences, setShowCrossReferences] = useState(defaultShowCrossReferences);
  const [compactMode, setCompactMode] = useState(defaultCompactMode);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerInitialStage, setPickerInitialStage] = useState<"home" | "search">("home");
  const [versionPickerVisible, setVersionPickerVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [selectedVersePosition, setSelectedVersePosition] = useState<BiblePosition | undefined>();
  const [selectedVerseNumbers, setSelectedVerseNumbers] = useState<number[]>([]);
  const [reflectionText, setReflectionText] = useState("");
  const [crossReferencePosition, setCrossReferencePosition] = useState<BiblePosition | undefined>();
  const [selectedFootnote, setSelectedFootnote] = useState<SelectedBibleFootnote | undefined>();
  const [topicsVisible, setTopicsVisible] = useState(false);
  const [topicDetailVisible, setTopicDetailVisible] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [topicResult, setTopicResult] = useState<BibleTopicResult | undefined>();
  const [topicError, setTopicError] = useState<string | undefined>();
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicUserVotes, setTopicUserVotes] = useState<Record<string, BibleTopicVoteValue>>({});
  const [topicVotePending, setTopicVotePending] = useState("");
  const [topicVoteError, setTopicVoteError] = useState<string | undefined>();
  const [scriptureComposerVisible, setScriptureComposerVisible] = useState(false);
  const [scriptureComposerIntent, setScriptureComposerIntent] = useState<BibleComposerIntent>("reflect");
  const [scriptureComposerContext, setScriptureComposerContext] = useState<"journal" | "room">("journal");
  const [scriptureComposerKind, setScriptureComposerKind] = useState<EntryKind>("scripture");
  const [scriptureComposerVisibility, setScriptureComposerVisibility] = useState<EntryVisibility>(visibility.private);
  const [scriptureComposerTitle, setScriptureComposerTitle] = useState("");
  const [scriptureComposerBody, setScriptureComposerBody] = useState("");
  const [scriptureComposerVerses, setScriptureComposerVerses] = useState<BibleVerse[]>([]);
  const [readerToast, setReaderToast] = useState<ReaderToast | undefined>();
  const [selectionSaving, setSelectionSaving] = useState(false);
  const [pendingVerseComposerAction, setPendingVerseComposerAction] = useState<PendingVerseComposerAction | undefined>();
  const [chapterSwipeDirection, setChapterSwipeDirection] = useState<ChapterSwipeDirection>("idle");
  const [highlightColorManagerVisible, setHighlightColorManagerVisible] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>();
  const [chapterControlsHeight, setChapterControlsHeight] = useState(46);
  const [selectionControlsHeight, setSelectionControlsHeight] = useState(164);
  const persistedAppThemeRef = useRef<ThemeName | undefined>(undefined);

  const storageKey = useMemo(() => readerStorageKey(state.currentUserId), [state.currentUserId]);
  const bibleVersion = bibleVersionFor(bibleVersionId);
  const effectiveReaderTheme = readerThemePreference.appTheme === state.theme ? readerThemePreference.readerTheme : state.theme;
  const readerPalette = readerPaletteFor(effectiveReaderTheme);
  const chapterKey = `${bibleVersionId}:${position.book}:${position.chapter}`;
  const [loadedChapter, setLoadedChapter] = useState<{ key: string; value: BibleChapter }>();
  const [chapterLoadError, setChapterLoadError] = useState(false);
  const [chapterLoadAttempt, setChapterLoadAttempt] = useState(0);
  const chapter = loadedChapter?.key === chapterKey ? loadedChapter.value : { heading: undefined, subtitles: [], verses: [] };
  useEffect(() => {
    let active = true;
    setChapterLoadError(false);
    void bibleChapterAsync(position.book, position.chapter, bibleVersionId).then((value) => {
      if (active) setLoadedChapter({ key: chapterKey, value });
    }).catch((error) => {
      if (active) setChapterLoadError(true);
      console.error("[bible] Could not load chapter", error);
    });
    return () => { active = false; };
  }, [chapterKey, chapterLoadAttempt]);
  const chapterVerses = chapter.verses;
  const activeBiblePlans = useMemo(
    () => state.biblePlans.filter((plan) => plan.userId === state.currentUserId),
    [state.biblePlans, state.currentUserId],
  );
  const selectedPlan = useMemo(
    () => activeBiblePlans.find((plan) => plan.id === selectedPlanId) ?? activeBiblePlans[0],
    [activeBiblePlans, selectedPlanId],
  );
  const selectedPlanCurrentDay = useMemo(() => {
    if (!selectedPlan) return undefined;
    const defaultDay = todayPlanDay(selectedPlan, todayDateKey()) ?? nextUnreadPlanDay(selectedPlan);
    const index = selectedPlan.days.findIndex((day) => day.dayNumber === (selectedPlanDayNumber ?? defaultDay?.dayNumber));
    return index >= 0
      ? { day: selectedPlan.days[index], index, isBeforeStart: false, isAfterEnd: false }
      : currentPlanDay(selectedPlan);
  }, [selectedPlan, selectedPlanDayNumber]);
  const selectedPlanMarkers = useMemo(
    () => (selectedPlan ? planMarkersForChapter(selectedPlan, position, selectedPlanCurrentDay?.day) : []),
    [position, selectedPlan, selectedPlanCurrentDay],
  );
  const selectedVerseRanges = useMemo(() => selectedVerseRangesFor(selectedVerseNumbers), [selectedVerseNumbers]);
  const selectedVerseReference = useMemo(() => selectedVerseReferenceLabel(position, selectedVerseRanges), [position, selectedVerseRanges]);
  const selectedPassages = useMemo(
    () => selectedVerseRanges
      .map((range) => buildBibleVerse(position.book, position.chapter, range.start, range.end, bibleVersionId))
      .filter((verse): verse is BibleVerse => Boolean(verse)),
    [bibleVersionId, position.book, position.chapter, selectedVerseRanges],
  );
  const selectedPassagesAreSaved = useMemo(
    () => selectedPassages.length > 0 && selectedPassages.length === selectedVerseRanges.length && selectedPassages.every((selectedVerse) =>
      state.savedVerses.some((savedVerse) => savedVerseIdentity(savedVerse) === savedVerseIdentity(selectedVerse)),
    ),
    [selectedPassages, selectedVerseRanges.length, state.savedVerses],
  );
  const chapterHighlightByVerse = useMemo(() => {
    const highlights = state.bibleHighlights
      .filter(
        (highlight) =>
          highlight.book === position.book &&
          highlight.chapter === position.chapter &&
          highlight.translation === bibleVersion.translation,
      )
      .sort((a, b) => highlightTime(b) - highlightTime(a));
    const byVerse: Record<number, BibleHighlightColor> = {};

    highlights.forEach((highlight) => {
      for (let verse = highlight.startVerse; verse <= highlight.endVerse; verse += 1) {
        if (!byVerse[verse]) {
          byVerse[verse] = highlight.color;
        }
      }
    });

    return byVerse;
  }, [bibleVersion.translation, position.book, position.chapter, state.bibleHighlights]);
  const selectedHighlightIds = useMemo(() => {
    if (selectedVerseRanges.length === 0) return [];

    return state.bibleHighlights
      .filter(
        (highlight) =>
          highlight.book === position.book &&
          highlight.chapter === position.chapter &&
          highlight.translation === bibleVersion.translation &&
          selectedVerseRanges.some((range) => verseRangesOverlap(range, { start: highlight.startVerse, end: highlight.endVerse })),
      )
      .map((highlight) => highlight.id);
  }, [bibleVersion.translation, position.book, position.chapter, selectedVerseRanges, state.bibleHighlights]);
  const [crossReferenceVerseSet, setCrossReferenceVerseSet] = useState<{ key: string; verses: Set<number> }>();
  const crossReferenceChapterKey = `${position.book}:${position.chapter}`;
  useEffect(() => {
    let active = true;
    void bibleCrossReferenceVersesAsync(position.book, position.chapter).then((verses) => {
      if (active) setCrossReferenceVerseSet({ key: crossReferenceChapterKey, verses });
    }).catch((error) => console.error("[bible] Could not load cross-reference markers", error));
    return () => { active = false; };
  }, [crossReferenceChapterKey]);
  const chapterCrossReferenceAvailability = useMemo(() => Object.fromEntries(
    chapterVerses.map((item) => [item.verse, crossReferenceVerseSet?.key === crossReferenceChapterKey && crossReferenceVerseSet.verses.has(item.verse)]),
  ) as Record<number, boolean>, [chapterVerses, crossReferenceChapterKey, crossReferenceVerseSet]);
  const crossReferenceKey = crossReferencePosition
    ? `${bibleVersionId}:${crossReferencePosition.book}:${crossReferencePosition.chapter}:${crossReferencePosition.verse}` : "";
  const [loadedCrossReferences, setLoadedCrossReferences] = useState<{ key: string; references: BibleCrossReference[] }>();
  const selectedCrossReferences = loadedCrossReferences?.key === crossReferenceKey ? loadedCrossReferences.references : [];
  useEffect(() => {
    if (!crossReferencePosition) return;
    let active = true;
    const frame = requestAnimationFrame(() => {
      const results = bibleCrossReferences(crossReferencePosition, bibleVersionId);
      if (active) setLoadedCrossReferences({ key: crossReferenceKey, references: results });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [crossReferenceKey]);
  const previousChapter = useMemo(() => previousBibleChapter(position.book, position.chapter), [position.book, position.chapter]);
  const nextChapter = useMemo(() => nextBibleChapter(position.book, position.chapter), [position.book, position.chapter]);
  const readerFontFamily = fontFamilyFor(fontId);
  const effectiveFontSize = compactMode ? Math.max(minFontSize, fontSize - 1) : fontSize;
  const readerLineHeight = Math.round(effectiveFontSize * (compactMode ? 1.48 : 1.62));
  const contentWidth = width >= 780 ? 720 : undefined;
  const selectedVerseBarVisible = selectedVerseRanges.length > 0;
  const chapterControlsVisible = !selectedVerseBarVisible;
  const floatingControlsBottom = tabBarHeight(insets.bottom) + 16;
  const activeFloatingControlsHeight = selectedVerseBarVisible
    ? selectionControlsHeight
    : chapterControlsHeight;
  const readerBottomPadding = Math.max(insets.bottom + 120, floatingControlsBottom + activeFloatingControlsHeight + 28);
  const readerToastBottom = floatingControlsBottom + activeFloatingControlsHeight + 14;
  const readerCanGoBack = navigation.canGoBack();
  const group = state.groups.find((item) => item.id === state.currentGroupId);

  useEffect(() => {
    if (activeBiblePlans.length === 0) {
      setSelectedPlanId(undefined);
      return;
    }
    if (!selectedPlanId || !activeBiblePlans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(activeBiblePlans[0].id);
    }
  }, [activeBiblePlans, selectedPlanId]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (readerThemePreference.appTheme === state.theme) return;
    setReaderThemePreference({ appTheme: state.theme, readerTheme: state.theme });
  }, [readerThemePreference.appTheme, state.theme]);

  const showTemporaryHighlight = useCallback((nextPosition: BiblePosition) => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    setHighlightedPosition(nextPosition);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedPosition(undefined);
      highlightTimeoutRef.current = undefined;
    }, 1400);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!storageKey) {
      setPreferencesReady(true);
      return () => {
        active = false;
      };
    }

    setPreferencesReady(false);
    void AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (!active) return;
        const nextPreferences = parsePreferences(value);
        verseOffsetsRef.current = {};
        pendingScrollVerseRef.current = nextPreferences.position.verse;
        positionRef.current = nextPreferences.position;
        historyRef.current = nextPreferences.history;
        setHistory(nextPreferences.history);
        setPosition(nextPreferences.position);
        setBibleVersionId(nextPreferences.bibleVersionId);
        notifyBibleVersionPreferenceChanged(nextPreferences.bibleVersionId);
        setFontId(nextPreferences.fontId);
        setFontSize(nextPreferences.fontSize);
        persistedAppThemeRef.current = nextPreferences.appTheme;
        setReaderThemePreference({ appTheme: nextPreferences.appTheme, readerTheme: nextPreferences.readerTheme });
        setShowVerseNumbers(nextPreferences.showVerseNumbers);
        setShowFootnotes(nextPreferences.showFootnotes);
        setShowCrossReferences(nextPreferences.showCrossReferences);
        setCompactMode(nextPreferences.compactMode);
      })
      .finally(() => {
        if (active) setPreferencesReady(true);
      });

    return () => {
      active = false;
    };
  }, [showTemporaryHighlight, storageKey]);

  useEffect(() => {
    if (!storageKey || !preferencesReady) return;

    const persistPreferences = (nextReaderTheme = effectiveReaderTheme) => {
      const payload: BibleReaderPreferences = {
        appTheme: state.theme,
        bibleVersionId,
        compactMode,
        fontId,
        fontSize,
        position,
        history,
        readerTheme: nextReaderTheme,
        showCrossReferences,
        showFootnotes,
        showVerseNumbers,
      };
      persistedAppThemeRef.current = state.theme;
      void AsyncStorage.setItem(storageKey, JSON.stringify(payload));
    };

    if (persistedAppThemeRef.current !== state.theme) {
      persistPreferences(state.theme);
      return;
    }

    const timeout = setTimeout(persistPreferences, 250);

    return () => clearTimeout(timeout);
  }, [bibleVersionId, compactMode, effectiveReaderTheme, fontId, fontSize, history, position, preferencesReady, showCrossReferences, showFootnotes, showVerseNumbers, state.theme, storageKey]);

  useEffect(() => {
    setSelectedVerseNumbers([]);
    setSelectedFootnote(undefined);
  }, [position.book, position.chapter]);

  useEffect(() => {
    setSelectedFootnote(undefined);
  }, [bibleVersionId]);

  const tryScrollToVerse = useCallback((verse: number, animated: boolean) => {
    const offset = verseOffsetsRef.current[verse];
    if (typeof offset !== "number") return false;
    pendingScrollVerseRef.current = undefined;
    programmaticScrollVerseRef.current = verse;
    scrollRef.current?.scrollTo({ animated, y: Math.max(0, offset - 18) });
    return true;
  }, []);

  const ensureVerseVisibleAboveSelection = useCallback((verse: number) => {
    const verseRow = verseRowsRef.current[verse];
    if (!verseRow) return;

    verseRow.measureInWindow((_x, y, _width, verseHeight) => {
      const selectionTop = height - floatingControlsBottom - selectionControlsHeight;
      const overlap = y + verseHeight - selectionTop + 36;
      if (overlap <= 0) return;

      scrollRef.current?.scrollTo({
        animated: true,
        y: Math.max(0, readerScrollOffsetRef.current + overlap),
      });
    });
  }, [floatingControlsBottom, height, selectionControlsHeight]);

  useEffect(() => {
    if (selectedVerseNumbers.length === 0) return;
    const selectedVerse = selectedVerseNumbers[selectedVerseNumbers.length - 1];
    requestAnimationFrame(() => ensureVerseVisibleAboveSelection(selectedVerse));
  }, [ensureVerseVisibleAboveSelection, selectedVerseNumbers]);

  const jumpToPosition = useCallback(
    (nextPosition: Partial<BiblePosition>, shouldScroll = true, shouldHighlight = false) => {
      const normalized = normalizeBiblePosition(nextPosition);
      const current = positionRef.current;
      programmaticScrollVerseRef.current = undefined;
      const nextHistory = visitBiblePosition(historyRef.current, normalized);
      if (nextHistory !== historyRef.current) {
        historyRef.current = nextHistory;
        setHistory(nextHistory);
      }
      const sameChapter = current.book === normalized.book && current.chapter === normalized.chapter;

      if (!sameChapter) {
        verseOffsetsRef.current = {};
        verseRowsRef.current = {};
        setSelectedVerseNumbers([]);
      }

      if (shouldScroll) {
        pendingScrollVerseRef.current = normalized.verse;
        if (sameChapter) {
          requestAnimationFrame(() => tryScrollToVerse(normalized.verse, true));
        }
      }

      positionRef.current = normalized;
      setPosition(normalized);
      if (shouldHighlight) {
        showTemporaryHighlight(normalized);
      }
    },
    [showTemporaryHighlight, tryScrollToVerse],
  );

  const travelHistory = useCallback((direction: -1 | 1) => {
    const nextHistory = moveBibleHistory(historyRef.current, direction);
    if (nextHistory === historyRef.current) return;
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    const destination = nextHistory.entries[nextHistory.index];
    const current = positionRef.current;
    programmaticScrollVerseRef.current = undefined;
    const sameChapter = current.book === destination.book && current.chapter === destination.chapter;
    if (!sameChapter) {
      verseOffsetsRef.current = {};
      verseRowsRef.current = {};
      setSelectedVerseNumbers([]);
    }
    pendingScrollVerseRef.current = destination.verse;
    if (sameChapter) requestAnimationFrame(() => tryScrollToVerse(destination.verse, true));
    positionRef.current = destination;
    setPosition(destination);
  }, [tryScrollToVerse]);

  useEffect(() => {
    if (!preferencesReady || !planParams.planId || !planParams.planJump || handledPlanJump.current === planParams.planJump) return;
    const plan = activeBiblePlans.find((item) => item.id === planParams.planId);
    const day = plan?.days.find((item) => item.dayNumber === Number(planParams.planDay));
    const start = firstPositionForPlanDay(day);
    if (!plan || !day || !start) return;
    handledPlanJump.current = planParams.planJump;
    setSelectedPlanId(plan.id);
    setSelectedPlanDayNumber(day.dayNumber);
    jumpToPosition(start, true, true);
  }, [activeBiblePlans, jumpToPosition, planParams.planId, planParams.planDay, planParams.planJump, preferencesReady]);

  const jumpToSelectedPlanDay = useCallback(() => {
    const start = firstPositionForPlanDay(selectedPlanCurrentDay?.day);
    if (start) {
      jumpToPosition(start, true, true);
    }
  }, [jumpToPosition, selectedPlanCurrentDay?.day]);

  const toggleSelectedPlanDay = useCallback(async () => {
    if (!selectedPlan || !selectedPlanCurrentDay?.day) return;
    await dispatch({
      type: "markBiblePlanDay",
      planId: selectedPlan.id,
      dayNumber: selectedPlanCurrentDay.day.dayNumber,
      read: !selectedPlanCurrentDay.day.completedAt,
    });
  }, [dispatch, selectedPlan, selectedPlanCurrentDay]);

  const chooseBibleVersion = useCallback((nextVersionId: BibleVersionId) => {
    setBibleVersionId(nextVersionId);
    notifyBibleVersionPreferenceChanged(nextVersionId);
  }, []);

  const handleVerseLayout = useCallback(
    (verse: number, offset: number) => {
      verseOffsetsRef.current[verse] = offset;
      if (pendingScrollVerseRef.current === verse) {
        requestAnimationFrame(() => tryScrollToVerse(verse, true));
      }
    },
    [tryScrollToVerse],
  );

  const openCrossReferences = useCallback(
    (verse: number) => {
      const nextPosition = normalizeBiblePosition({ book: positionRef.current.book, chapter: positionRef.current.chapter, verse });
      setCrossReferencePosition(nextPosition);
    },
    [],
  );

  const readCrossReferenceChapter = useCallback(
    (nextPosition: BiblePosition) => {
      setCrossReferencePosition(undefined);
      jumpToPosition(nextPosition);
    },
    [jumpToPosition],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      readerScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      if (pendingScrollVerseRef.current) return;
      const now = Date.now();
      if (now - lastScrollCommitRef.current < 140) return;

      const topOffset = event.nativeEvent.contentOffset.y + 24;
      let visibleVerse = chapterVerses[0]?.verse;

      for (const item of chapterVerses) {
        const offset = verseOffsetsRef.current[item.verse];
        if (typeof offset !== "number") continue;
        if (offset <= topOffset) {
          visibleVerse = item.verse;
          continue;
        }
        break;
      }

      if (programmaticScrollVerseRef.current !== undefined) {
        if (visibleVerse !== programmaticScrollVerseRef.current) return;
        programmaticScrollVerseRef.current = undefined;
      }

      const current = positionRef.current;
      if (!visibleVerse || visibleVerse === current.verse) return;

      lastScrollCommitRef.current = now;
      const nextPosition = { ...current, verse: visibleVerse };
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      const nextHistory = updateBibleHistoryPosition(historyRef.current, nextPosition);
      historyRef.current = nextHistory;
      setHistory(nextHistory);
    },
    [chapterVerses],
  );

  const handleReaderBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  const handleVersePressIn = useCallback(() => {
    verseLongPressActiveRef.current = false;
  }, []);

  const handleVersePress = useCallback((verse: number) => {
    if (verseLongPressActiveRef.current) {
      verseLongPressActiveRef.current = false;
      return;
    }

    const nextPosition = normalizeBiblePosition({ book: positionRef.current.book, chapter: positionRef.current.chapter, verse });
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    const nextHistory = updateBibleHistoryPosition(historyRef.current, nextPosition);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setSelectedVersePosition(undefined);
    setSelectedVerseNumbers((current) => {
      if (current.includes(verse)) {
        return current.filter((item) => item !== verse);
      }

      return [...current, verse].sort((a, b) => a - b);
    });
  }, []);

  const handleVerseLongPress = useCallback((verse: number) => {
    actionReturnFocusRef.current = verseRowsRef.current[verse] ?? null;
    verseLongPressActiveRef.current = true;
    const nextPosition = normalizeBiblePosition({ book: positionRef.current.book, chapter: positionRef.current.chapter, verse });
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    const nextHistory = updateBibleHistoryPosition(historyRef.current, nextPosition);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setSelectedVerseNumbers([]);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = undefined;
    }
    setHighlightedPosition(undefined);
    setSelectedVersePosition(nextPosition);
  }, []);

  const verseForPosition = useCallback(
    (target?: BiblePosition) => {
      if (!target) return undefined;
      return buildBibleVerse(target.book, target.chapter, target.verse, target.verse, bibleVersionId);
    },
    [bibleVersionId],
  );

  const handleSaveSelectedVerses = useCallback(async () => {
    if (selectionSaving || selectedVerseRanges.length === 0) return;

    if (selectedPassages.length === 0) {
      setReaderToast({ detail: t("bible.selection.errorDetail"), message: t("bible.selection.errorTitle"), tone: "error" });
      return;
    }

    const matchingSavedVerses = selectedPassages
      .map((selectedVerse) => state.savedVerses.find((savedVerse) => savedVerseIdentity(savedVerse) === savedVerseIdentity(selectedVerse)))
      .filter((verse): verse is SavedVerse => Boolean(verse));
    const shouldRemove = matchingSavedVerses.length === selectedPassages.length;
    const passagesToSave = selectedPassages.filter((selectedVerse) =>
      !state.savedVerses.some((savedVerse) => savedVerseIdentity(savedVerse) === savedVerseIdentity(selectedVerse)),
    );
    const isSingleVerse = selectedVerseNumbers.length === 1;

    setSelectionSaving(true);
    try {
      if (shouldRemove) {
        await Promise.all(matchingSavedVerses.map((verse) => dispatch({ type: "removeSavedVerse", id: verse.id })));
      } else {
        await Promise.all(passagesToSave.map((verse) => dispatch({ type: "saveVerse", verse })));
      }
      setSelectedVerseNumbers([]);
      setReaderToast({
        detail: t(shouldRemove ? "bible.selection.removedDetail" : "bible.selection.savedDetail"),
        message: t(shouldRemove
          ? isSingleVerse ? "bible.selection.removedVerse" : "bible.selection.removedPassage"
          : isSingleVerse ? "bible.selection.savedVerse" : "bible.selection.savedPassage"),
        tone: "success",
      });
    } finally {
      setSelectionSaving(false);
    }
  }, [dispatch, selectedPassages, selectedVerseNumbers.length, selectedVerseRanges.length, selectionSaving, state.savedVerses, t]);

  const handleHighlightSelectedVerses = useCallback(async (color: BibleHighlightColor, colorId?: string) => {
    if (selectionSaving || selectedVerseRanges.length === 0) return;

    const selectedVerses = selectedVerseRanges
      .map((range) => buildBibleVerse(position.book, position.chapter, range.start, range.end, bibleVersionId))
      .filter((verse): verse is BibleVerse => Boolean(verse));

    if (selectedVerses.length === 0) {
      setReaderToast({ detail: "Try selecting the verses again.", message: "Could not highlight selection", tone: "error" });
      return;
    }

    setSelectionSaving(true);
    try {
      await dispatch({ type: "highlightVerses", color, colorId, verses: selectedVerses });
      setSelectedVerseNumbers([]);
      setReaderToast({
        detail: selectedVerses.length === 1 ? "Highlight saved to this Bible." : "Highlights saved to this Bible.",
        message: selectedVerses.length === 1 ? "Verse highlighted" : "Verses highlighted",
        tone: "success",
      });
    } finally {
      setSelectionSaving(false);
    }
  }, [bibleVersionId, dispatch, position.book, position.chapter, selectedVerseRanges, selectionSaving]);

  const handleHighlightWithPaletteColor = useCallback(
    (paletteColor: BibleHighlightPaletteColor) => {
      void handleHighlightSelectedVerses(paletteColor.hex, paletteColor.id);
    },
    [handleHighlightSelectedVerses],
  );

  const handleDeleteSelectedHighlights = useCallback(async () => {
    if (selectionSaving || selectedHighlightIds.length === 0) return;

    setSelectionSaving(true);
    try {
      await Promise.all(selectedHighlightIds.map((id) => dispatch({ type: "removeBibleHighlight", id })));
      setSelectedVerseNumbers([]);
      setReaderToast({
        detail: selectedHighlightIds.length === 1 ? "Highlight removed from this Bible." : "Highlights removed from this Bible.",
        message: selectedHighlightIds.length === 1 ? "Highlight deleted" : "Highlights deleted",
        tone: "success",
      });
    } finally {
      setSelectionSaving(false);
    }
  }, [dispatch, selectedHighlightIds, selectionSaving]);

  const openScriptureComposer = useCallback((intent: BibleComposerIntent, context: "journal" | "room", kind: EntryKind, verse: BibleVerse) => {
    setScriptureComposerIntent(intent);
    setScriptureComposerContext(context);
    setScriptureComposerKind(kind);
    setScriptureComposerVisibility(context === "room" ? visibility.room : visibility.private);
    setScriptureComposerTitle(context === "room" ? "" : displayBibleReference(verse.reference, bookLanguage, verse.translation));
    setScriptureComposerBody("");
    setScriptureComposerVerses([verse]);
    setScriptureComposerVisible(true);
  }, []);

  const openVerseInReader = useCallback(
    (verse: BibleVerse) => {
      const match = /^(.+?)\s+(\d+):(\d+)/.exec(verse.reference);
      if (!match) {
        router.push("/(tabs)/bible" as never);
        return;
      }
      jumpToPosition({ book: match[1], chapter: Number(match[2]), verse: Number(match[3]) });
    },
    [jumpToPosition],
  );

  const handleVerseAction = useCallback((action: VerseQuickAction) => {
    const selectedVerse = verseForPosition(selectedVersePosition);
    if (!selectedVerse) {
      setSelectedVersePosition(undefined);
      return;
    }
    setSelectedVersePosition(undefined);
    if (action === "save") {
      const savedVerse = state.savedVerses.find((verse) => savedVerseIdentity(verse) === savedVerseIdentity(selectedVerse));
      if (savedVerse) {
        void dispatch({ type: "removeSavedVerse", id: savedVerse.id }).then(() => {
          setReaderToast({ message: t("bible.actions.unsavedToast"), tone: "success" });
        });
        return;
      }
      void dispatch({ type: "saveVerse", verse: selectedVerse }).then(() => {
        setReaderToast({ message: t("bible.actions.savedToast"), tone: "success" });
      });
      return;
    }
    if (action === "copy") {
      void Clipboard.setStringAsync(`${selectedVerse.text}\n${displayBibleReference(selectedVerse.reference, bookLanguage)} (${selectedVerse.translation ?? bibleVersion.translation})`).then(() => {
        setReaderToast({ message: "Verse copied", tone: "success" });
      });
      return;
    }
    if (action === "highlight") {
      const color = state.bibleHighlightColors[0];
      void dispatch({ type: "highlightVerses", color: color?.hex ?? "#FFC166", colorId: color?.id, verses: [selectedVerse] }).then(() => {
        setReaderToast({ message: "Verse highlighted", tone: "success" });
      });
      return;
    }

    setPendingVerseComposerAction({ action, verse: selectedVerse });
  }, [bibleVersion.translation, dispatch, selectedVersePosition, state.bibleHighlightColors, state.savedVerses, t, verseForPosition]);

  const handleVerseActionSheetClosed = useCallback(() => {
    if (!pendingVerseComposerAction) return;
    const { action, verse } = pendingVerseComposerAction;
    setPendingVerseComposerAction(undefined);

    if (action === "journal") {
      openScriptureComposer("reflect", "journal", "reflection", verse);
    }
    if (action === "share") {
      openScriptureComposer("share", "room", "scripture", verse);
    }
    if (action === "pray") {
      openScriptureComposer("pray", "journal", "prayer_request", verse);
    }
  }, [openScriptureComposer, pendingVerseComposerAction]);

  async function submitScriptureComposer() {
    const canSubmit = scriptureComposerContext === "room" && scriptureComposerKind === "scripture"
      ? scriptureComposerVerses.length > 0
      : Boolean(scriptureComposerBody.trim());
    if (!canSubmit) return;
    const verse = scriptureComposerVerses[0];
    if (scriptureComposerVisibility === visibility.room) {
      await dispatch({
        type: "createPost",
        body: scriptureComposerBody,
        kind: scriptureComposerKind,
        ...(scriptureComposerKind === "prayer_request" ? { title: scriptureComposerTitle } : {}),
        verse,
        verses: scriptureComposerVerses,
      });
    } else {
      await dispatch({
        type: "createJournalEntry",
        body: scriptureComposerBody,
        entryKind: scriptureComposerKind,
        journalType: scriptureComposerKind === "prayer_request" ? "prayer" : scriptureComposerKind === "scripture" ? "scripture_note" : "reflection",
        title: scriptureComposerTitle,
        verse,
        verses: scriptureComposerVerses,
        shareWithGroup: false,
      });
    }
    setScriptureComposerVisible(false);
    setScriptureComposerBody("");
    setScriptureComposerTitle("");
    setScriptureComposerVerses([]);
  }

  const handleReflectionAction = useCallback((_action: "journal" | "pray" | "save") => {
    // TODO: Persist end-of-chapter reflection actions when the product flow is defined.
  }, []);

  const shouldCaptureChapterSwipe = useCallback(
    (dx: number, dy: number) => {
      if (chapterSwipeAnimatingRef.current) return false;
      const horizontalDistance = Math.abs(dx);
      const verticalDistance = Math.abs(dy);
      if (verticalDistance >= chapterScrollIntentDistance && verticalDistance >= horizontalDistance) {
        chapterSwipeBlockedByScrollRef.current = true;
        return false;
      }
      if (chapterSwipeBlockedByScrollRef.current) return false;

      const hasTarget = dx < 0 ? Boolean(nextChapter) : Boolean(previousChapter);
      return hasTarget && horizontalDistance > chapterSwipeActivationDistance && horizontalDistance > verticalDistance * chapterSwipeActivationRatio;
    },
    [nextChapter, previousChapter],
  );

  const resetReaderTouchIntent = useCallback(() => {
    chapterSwipeBlockedByScrollRef.current = false;
  }, []);

  const handleReaderScrollBeginDrag = useCallback(() => {
    chapterSwipeBlockedByScrollRef.current = true;
    programmaticScrollVerseRef.current = undefined;
  }, []);

  const resetChapterSwipe = useCallback(() => {
    chapterSwipeAnimatingRef.current = false;
    setChapterSwipeDirection("idle");
  }, []);

  const chapterSwipePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => shouldCaptureChapterSwipe(gesture.dx, gesture.dy),
        onPanResponderGrant: () => {
          chapterSwipeX.stopAnimation();
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dy) > Math.abs(gesture.dx) * 2 && Math.abs(gesture.dy) > 30) {
            chapterSwipeBlockedByScrollRef.current = true;
            Animated.spring(chapterSwipeX, {
              damping: 20,
              stiffness: 210,
              toValue: 0,
              useNativeDriver: true,
            }).start(() => resetChapterSwipe());
            return;
          }

          const target = gesture.dx < 0 ? nextChapter : previousChapter;
          const direction: ChapterSwipeDirection = gesture.dx < 0 ? "next" : "previous";
          if (!target) {
            chapterSwipeX.setValue(0);
            setChapterSwipeDirection("idle");
            return;
          }

          const maxDrag = Math.max(96, width * 0.42);
          const clampedDx = Math.max(-maxDrag, Math.min(maxDrag, gesture.dx));
          chapterSwipeX.setValue(clampedDx);
          setChapterSwipeDirection(direction);
        },
        onPanResponderRelease: (_event, gesture) => {
          const target = gesture.dx < 0 ? nextChapter : previousChapter;
          const direction: ChapterSwipeDirection = gesture.dx < 0 ? "next" : "previous";
          const hasCommittedDistance = Math.abs(gesture.dx) >= Math.max(86, width * chapterSwipeDistanceRatio);
          const hasCommittedVelocity = Math.abs(gesture.vx) >= chapterSwipeVelocity;

          if (!target || !(hasCommittedDistance || hasCommittedVelocity) || !isChapterSwipeGesture(gesture.dx, gesture.dy)) {
            Animated.spring(chapterSwipeX, {
              damping: 20,
              stiffness: 210,
              toValue: 0,
              useNativeDriver: true,
            }).start(() => resetChapterSwipe());
            return;
          }

          chapterSwipeAnimatingRef.current = true;
          setChapterSwipeDirection(direction);
          Animated.timing(chapterSwipeX, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
            toValue: direction === "next" ? -width : width,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (!finished) {
              resetChapterSwipe();
              return;
            }

            const entryX = direction === "next" ? width : -width;
            chapterSwipeX.setValue(entryX);
            jumpToPosition(target, true, false);
            requestAnimationFrame(() => {
              Animated.timing(chapterSwipeX, {
                duration: 220,
                easing: Easing.out(Easing.cubic),
                toValue: 0,
                useNativeDriver: true,
              }).start(() => {
                resetChapterSwipe();
              });
            });
          });
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderTerminate: () => {
          Animated.spring(chapterSwipeX, {
            damping: 20,
            stiffness: 210,
            toValue: 0,
            useNativeDriver: true,
          }).start(() => {
            resetChapterSwipe();
          });
        },
        onShouldBlockNativeResponder: () => false,
      }),
    [chapterSwipeX, jumpToPosition, nextChapter, previousChapter, resetChapterSwipe, shouldCaptureChapterSwipe, width],
  );

  useEffect(() => {
    if (!readerToast) return;
    const timeout = setTimeout(() => setReaderToast(undefined), 2200);
    return () => clearTimeout(timeout);
  }, [readerToast]);

  const openTopic = useCallback((topic: string) => {
    const nextTopic = topic.trim();
    if (!nextTopic) return;

    const requestId = topicRequestRef.current + 1;
    topicRequestRef.current = requestId;
    setSelectedTopic(nextTopic);
    setTopicsVisible(true);
    setTopicDetailVisible(true);
    setTopicResult(undefined);
    setTopicError(undefined);
    setTopicLoading(true);
    setTopicVoteError(undefined);
    setTopicVotePending("");

    void fetchBibleTopic(nextTopic)
      .then((result) => {
        if (topicRequestRef.current !== requestId) return;
        setTopicResult(result);
      })
      .catch(async (error: unknown) => {
        if (topicRequestRef.current !== requestId) return;
        try {
          const references = await searchBibleTopicText(nextTopic, bibleVersionId);
          if (topicRequestRef.current !== requestId) return;
          if (references.length > 0) {
            setTopicResult({ count: references.length, references, source: "text-search", sourceUrl: "", topic: nextTopic });
            return;
          }
        } catch {
          // Preserve the original OpenBible error below.
        }
        setTopicError(error instanceof Error ? error.message : "Could not load this topic.");
      })
      .finally(() => {
        if (topicRequestRef.current === requestId) {
          setTopicLoading(false);
        }
      });
  }, [bibleVersionId]);

  async function castTopicVote(reference: BibleTopicReference, value: BibleTopicVoteValue) {
    if (!reference.voteId || topicVotePending) return;
    const voteTopic = selectedTopic;
    const voteKey = bibleTopicVoteKey(voteTopic, reference.voteId);
    const topicSession = topicRequestRef.current;
    if (topicUserVotes[voteKey]) return;

    setTopicVotePending(voteKey);
    setTopicVoteError(undefined);
    try {
      await submitBibleTopicVote(voteTopic, reference.voteId, value);
      setTopicUserVotes((current) => ({ ...current, [voteKey]: value }));
      setTopicResult((current) => {
        if (!current || bibleTopicKey(current.topic) !== bibleTopicKey(voteTopic)) return current;
        return {
          ...current,
          references: current.references.map((item) =>
            item.voteId === reference.voteId ? { ...item, votes: Math.max(0, item.votes + value) } : item,
          ),
        };
      });
    } catch (error) {
      if (topicRequestRef.current === topicSession) {
        setTopicVoteError(error instanceof Error ? error.message : "Could not submit this vote.");
      }
    } finally {
      if (topicRequestRef.current === topicSession) setTopicVotePending("");
    }
  }

  function closeTopics() {
    topicRequestRef.current += 1;
    setTopicsVisible(false);
    setTopicDetailVisible(false);
    setTopicLoading(false);
    setTopicVotePending("");
  }

  function changeFontSize(delta: number) {
    setFontSize((current) => normalizeFontSize(current + delta));
  }

  const selectedVerseIsSaved = useMemo(() => {
    const selectedVerse = verseForPosition(selectedVersePosition);
    return Boolean(selectedVerse && state.savedVerses.some((verse) => savedVerseIdentity(verse) === savedVerseIdentity(selectedVerse)));
  }, [selectedVersePosition, state.savedVerses, verseForPosition]);

  const readerTextStyle: TextStyle = {
    color: readerPalette.text,
    fontFamily: readerFontFamily,
    fontSize: effectiveFontSize,
    fontWeight: "400",
    lineHeight: readerLineHeight,
  };

  return (
    <BibleBookVersionContext.Provider value={bibleVersionId}>
    <View style={{ backgroundColor: readerPalette.background, flex: 1 }}>
      <BibleReaderHeader
        canGoBack={readerCanGoBack}
        canGoHistoryBack={history.index > 0}
        canGoHistoryForward={history.index < history.entries.length - 1}
        onBack={handleReaderBack}
        onHistoryBack={() => travelHistory(-1)}
        onHistoryForward={() => travelHistory(1)}
        onOpenPicker={() => {
          setPickerInitialStage("home");
          setPickerVisible(true);
        }}
        onOpenSearch={() => {
          setPickerInitialStage("search");
          setPickerVisible(true);
        }}
        onOpenSettings={() => setSettingsVisible(true)}
        onOpenVersionPicker={() => setVersionPickerVisible(true)}
        palette={readerPalette}
        title={chapterLabel(position, bookLanguage)}
        translationLabel={bibleVersionShortLabel(bibleVersionId)}
        topInset={insets.top}
      />

      <View
        {...chapterSwipePanResponder.panHandlers}
        onTouchCancel={resetReaderTouchIntent}
        onTouchEnd={resetReaderTouchIntent}
        onTouchStart={resetReaderTouchIntent}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          contentInsetAdjustmentBehavior="never"
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          onScrollBeginDrag={handleReaderScrollBeginDrag}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{
            alignSelf: "stretch",
            paddingBottom: readerBottomPadding,
            paddingHorizontal: 22,
            paddingTop: compactMode ? 12 : 18,
          }}
        >
          <Animated.View
            style={{ alignSelf: "center", gap: compactMode ? 20 : 28, maxWidth: contentWidth, transform: [{ translateX: chapterSwipeX }], width: "100%" }}
          >
            <BiblePlanReaderPanel
              currentDay={selectedPlanCurrentDay}
              markers={selectedPlanMarkers}
              onJump={jumpToSelectedPlanDay}
              onMarkRead={toggleSelectedPlanDay}
              onSelectPlan={(id) => { setSelectedPlanId(id); setSelectedPlanDayNumber(undefined); }}
              onSelectDay={(dayNumber) => {
                const day = selectedPlan?.days.find((item) => item.dayNumber === dayNumber);
                const start = firstPositionForPlanDay(day);
                if (start) { setSelectedPlanDayNumber(dayNumber); jumpToPosition(start, true, true); }
              }}
              palette={readerPalette}
              plan={selectedPlan}
              plans={activeBiblePlans}
            />
            {loadedChapter?.key === chapterKey ? <BibleText
              chapterHeading={chapter.heading}
              chapterHighlightByVerse={chapterHighlightByVerse}
              compactMode={compactMode}
              crossReferenceAvailability={chapterCrossReferenceAvailability}
              highlightedPosition={highlightedPosition}
              onFootnotePress={(marker, footnote, verse) => {
                setSelectedFootnote({
                  footnote,
                  marker,
                  position: { book: position.book, chapter: position.chapter, verse },
                });
              }}
              onVersePress={handleVersePress}
              onVersePressIn={handleVersePressIn}
              onVerseLayout={handleVerseLayout}
              onVerseLongPress={handleVerseLongPress}
              onVerseRef={(verse, node) => {
                verseRowsRef.current[verse] = node;
              }}
              palette={readerPalette}
              position={position}
              readerLineHeight={readerLineHeight}
              readerTextStyle={readerTextStyle}
              planMarkers={selectedPlanMarkers}
              selectedVerseNumbers={selectedVerseNumbers}
              selectedVersePosition={selectedVersePosition}
              showCrossReferences={showCrossReferences}
              showFootnotes={showFootnotes}
              showVerseNumbers={showVerseNumbers}
              subtitles={chapter.subtitles}
              verses={chapterVerses}
            /> : chapterLoadError ? <Pressable onPress={() => setChapterLoadAttempt((attempt) => attempt + 1)} style={{ alignItems: "center", justifyContent: "center", minHeight: 180 }}>
              <Text style={{ color: readerPalette.text }}>{language === "sv" ? "Kapitlet kunde inte läsas in. Tryck för att försöka igen." : "Could not load chapter. Tap to try again."}</Text>
            </Pressable> : <ActivityIndicator color={readerPalette.text} style={{ minHeight: 180 }} />}
          </Animated.View>
        </ScrollView>
      </View>

      <ChapterSwipeIndicator
        direction={chapterSwipeDirection}
        nextChapter={nextChapter}
        palette={readerPalette}
        previousChapter={previousChapter}
        progress={chapterSwipeX}
      />

      {chapterControlsVisible ? (
        <BibleBottomReadingControls
          bottom={floatingControlsBottom}
          maxWidth={contentWidth}
          nextChapter={nextChapter}
          onHeightChange={setChapterControlsHeight}
          onNext={() => nextChapter && jumpToPosition(nextChapter)}
          onPrevious={() => previousChapter && jumpToPosition(previousChapter)}
          palette={readerPalette}
          previousChapter={previousChapter}
        />
      ) : null}

      {selectedVerseBarVisible ? (
        <SelectedVerseSuggestionBar
          bottom={floatingControlsBottom}
          canDeleteHighlight={selectedHighlightIds.length > 0}
          highlightColors={state.bibleHighlightColors}
          maxWidth={contentWidth}
          onClear={() => setSelectedVerseNumbers([])}
          onDeleteHighlight={handleDeleteSelectedHighlights}
          onHeightChange={setSelectionControlsHeight}
          onHighlight={handleHighlightWithPaletteColor}
          onManageColors={() => setHighlightColorManagerVisible(true)}
          onSave={handleSaveSelectedVerses}
          palette={readerPalette}
          reference={displayBibleReference(selectedVerseReference, bookLanguage)}
          saved={selectedPassagesAreSaved}
          saving={selectionSaving}
          verseCount={selectedVerseNumbers.length}
        />
      ) : null}

      <ReaderToastMessage bottom={readerToastBottom} palette={readerPalette} toast={readerToast} />

      <HighlightColorManagerSheet
        colors={state.bibleHighlightColors}
        onClose={() => setHighlightColorManagerVisible(false)}
        onDelete={(color) => dispatch({ type: "deleteBibleHighlightColor", id: color.id })}
        onSave={(color) => dispatch({ type: "saveBibleHighlightColor", ...color })}
        palette={readerPalette}
        visible={highlightColorManagerVisible}
      />

      <VerseActionSheet
        returnFocusRef={actionReturnFocusRef}
        onAction={handleVerseAction}
        bibleVersionId={bibleVersionId}
        onClose={() => setSelectedVersePosition(undefined)}
        onClosed={handleVerseActionSheetClosed}
        onReadChapter={readCrossReferenceChapter}
        palette={readerPalette}
        position={selectedVersePosition}
        readerTextStyle={readerTextStyle}
        saved={selectedVerseIsSaved}
        visible={Boolean(selectedVersePosition)}
      />
      <ReadingSettingsSheet
        compactMode={compactMode}
        fontId={fontId}
        fontSize={fontSize}
        onChangeFont={setFontId}
        onChangeReaderTheme={(readerTheme) => setReaderThemePreference({ appTheme: state.theme, readerTheme })}
        onChangeShowCrossReferences={setShowCrossReferences}
        onChangeShowFootnotes={setShowFootnotes}
        onChangeShowVerseNumbers={setShowVerseNumbers}
        onClose={() => setSettingsVisible(false)}
        onCompactModeChange={setCompactMode}
        onFontSizeChange={changeFontSize}
        palette={readerPalette}
        readerTheme={effectiveReaderTheme}
        showCrossReferences={showCrossReferences}
        showFootnotes={showFootnotes}
        showVerseNumbers={showVerseNumbers}
        visible={settingsVisible}
      />
      <BibleVersionSheet
        bibleVersionId={bibleVersionId}
        onChangeBibleVersion={chooseBibleVersion}
        onClose={() => setVersionPickerVisible(false)}
        palette={readerPalette}
        visible={versionPickerVisible}
      />
      <CrossReferenceSheet
        onClose={() => setCrossReferencePosition(undefined)}
        onReadChapter={readCrossReferenceChapter}
        position={crossReferencePosition}
        palette={readerPalette}
        readerTextStyle={readerTextStyle}
        references={selectedCrossReferences}
        visible={Boolean(crossReferencePosition)}
      />
      <FootnoteSheet
        onClose={() => setSelectedFootnote(undefined)}
        palette={readerPalette}
        readerTextStyle={readerTextStyle}
        selection={selectedFootnote}
        visible={Boolean(selectedFootnote)}
      />
      <BibleDrawer
        biblePlanCount={state.biblePlans.filter((plan) => plan.userId === state.currentUserId).length}
        bibleVersionId={bibleVersionId}
        highlights={state.bibleHighlights}
        initialStage={pickerInitialStage}
        initialPosition={position}
        journalEntries={state.journalEntries.filter((entry) => entry.userId === state.currentUserId)}
        onClose={() => setPickerVisible(false)}
        onOpenPlans={() => {
          setPickerVisible(false);
          router.push("/bible-plans" as never);
        }}
        onOpenReflection={(entryId) => {
          setPickerVisible(false);
          router.push(`/me/${entryId}` as never);
        }}
        onOpenTopic={(topic) => {
          setPickerVisible(false);
          if (topic) {
            openTopic(topic);
            return;
          }
          setTopicsVisible(true);
        }}
        onRemoveSavedVerse={async (id) => {
          await dispatch({ type: "removeSavedVerse", id });
          setReaderToast({ message: t("bible.actions.unsavedToast"), tone: "success" });
        }}
        onSelect={(nextPosition) => {
          setPickerVisible(false);
          jumpToPosition(nextPosition);
        }}
        palette={readerPalette}
        savedVerses={state.savedVerses}
        versionLabel={bibleVersion.label}
        visible={pickerVisible}
      />
      <BibleTopicsModal
        bibleVersionId={bibleVersionId}
        bibleVersionLabel={bibleVersion.label}
        detailVisible={topicDetailVisible}
        error={topicError}
        loading={topicLoading}
        onBack={() => {
          setTopicDetailVisible(false);
        }}
        onClose={closeTopics}
        onSelectTopic={openTopic}
        onSelectReference={(reference) => {
          const nextPosition = biblePositionFromReference(reference);
          if (!nextPosition) return;
          closeTopics();
          jumpToPosition(nextPosition);
        }}
        onVote={(reference, value) => void castTopicVote(reference, value)}
        palette={readerPalette}
        references={topicResult?.references ?? []}
        source={topicResult?.source ?? "openbible"}
        topic={selectedTopic}
        userVotes={topicUserVotes}
        visible={topicsVisible}
        voteError={topicVoteError}
        votePending={topicVotePending}
      />
      <SharedComposer
        bibleIntent={scriptureComposerIntent}
        visible={scriptureComposerVisible}
        context={scriptureComposerContext}
        kind={scriptureComposerKind}
        entryVisibility={scriptureComposerVisibility}
        title={scriptureComposerTitle}
        body={scriptureComposerBody}
        verses={scriptureComposerVerses}
        onKind={setScriptureComposerKind}
        onOpenVerseInBible={(verse) => {
          setScriptureComposerVisible(false);
          requestAnimationFrame(() => openVerseInReader(verse));
        }}
        onVisibility={setScriptureComposerVisibility}
        onTitle={setScriptureComposerTitle}
        onBody={setScriptureComposerBody}
        onVerses={setScriptureComposerVerses}
        onClose={() => setScriptureComposerVisible(false)}
        onSubmit={submitScriptureComposer}
        roomName={group?.name}
        roomImage={group?.image}
      />
    </View>
    </BibleBookVersionContext.Provider>
  );
}
