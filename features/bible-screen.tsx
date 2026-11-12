import { AudioFollowScroll } from "@/features/bible-audio/follow";
import { useIsFocused } from "@react-navigation/native";
import { BibleAudioPlayer } from "@/features/bible-audio/player";
import { useBibleAudio } from "@/features/bible-audio/provider";
import { BibleBookVersionContext, useBibleBookLanguage } from "@/features/use-bible-book-language";
import { tabBarHeight } from "@/ui/navigation-layout";
import AsyncStorage from "@/state/encryption/local-storage";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextStyle,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import {
  initialBibleHistory,
  moveBibleHistory,
  sameBiblePosition,
  updateBibleHistoryPosition,
  visitBiblePosition,
  type BibleHistory,
} from "@/features/bible-history";
import {
  bibleCrossReferences,
  bibleVersionFor,
  buildBibleVerse,
  nextBibleChapter,
  normalizeBiblePosition,
  previousBibleChapter,
  type BibleCrossReference,
  type BibleFootnote,
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
import type { Action } from "@/state/store/types";
import type { BibleHighlightColor, BibleHighlightPaletteColor, BibleVerse, EntryKind, SavedVerse } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { SharedComposer, type BibleComposerIntent } from "@/ui/shared-composer";
import {
  type MeasurableView,
  type BibleReaderFontId,
  type SelectedBibleFootnote,
  type ReaderToast,
  type PendingVerseComposerAction,
  type BibleReaderPreferences,
  type VerseQuickAction,
} from "@/features/bible-reader/types";
import {
  defaultPosition,
  defaultFontId,
  defaultFontSize,
  defaultShowVerseNumbers,
  defaultFlowingParagraphText,
  fontFamilyFor,
  parsePreferences,
  normalizeFontSize,
} from "@/features/bible-reader/preferences";
import {
  fetchCloudBibleReaderPreferences,
  listenForCloudBibleReaderPreferences,
  listenForDatabaseConnection,
  readStoredBibleReaderPreferences,
  readerPreferencesSignature,
  saveCloudBibleReaderPreferences,
  serializeStoredBibleReaderPreferences,
  type StoredBibleReaderPreferences,
} from "@/features/bible-reader/preferences-sync";
import { readerPaletteFor } from "@/features/bible-reader/palette";
import {
  selectedVerseRangesFor,
  selectedVerseReferenceLabel,
  highlightTime,
  verseRangesOverlap,
  chapterLabel,
  compactChapterLabel,
  bibleVersionShortLabel,
} from "@/features/bible-reader/verse-helpers";
import { BibleReaderHeader } from "@/features/bible-reader/header";
import { BibleReaderToolsSheet } from "@/features/bible-reader/tools-sheet";
import { BiblePlanReaderPanel } from "@/features/bible-reader/plan-panel";
import { BibleText } from "@/features/bible-reader/chapter-text";
import { useVisibleVerseSelection } from "@/features/bible-reader/use-visible-verse";
import { ChapterPager, useChapterCursor, type ChapterPagerHandle } from "@/features/bible-reader/chapter-pager";
import { ChapterPageScrollView } from "@/features/bible-reader/chapter-page";
import { useReaderHeader } from "@/features/bible-reader/use-reader-header";
import { useChapterWindow } from "@/features/bible-reader/chapter-window";
import { chapterIndex, readerChapterKey, ReaderScrollIntent, type ReaderNavigationIntent } from "@/features/bible-reader/chapter-navigation";
import { chapterSelectionHaptic } from "@/features/bible-reader/chapter-haptics";
import { useReducedMotion } from "@/ui/use-reduced-motion";
import { BibleBottomReadingControls } from "@/features/bible-reader/reading-controls";
import { SelectedVerseSuggestionBar, VerseActionSheet } from "@/features/bible-reader/verse-actions";
import { ReaderToastMessage } from "@/features/bible-reader/toast";
import { HighlightColorManagerSheet } from "@/features/bible-reader/highlight-colors";
import { ReadingSettingsSheet } from "@/features/bible-reader/reading-settings";
import { BibleVersionSheet } from "@/features/bible-reader/version-sheet";
import { CrossReferenceSheet, FootnoteSheet } from "@/features/bible-reader/reference-sheets";
import { BibleDrawer } from "@/features/bible-reader/drawer";
import { ScriptureSearchContent } from "@/features/bible-search/search-content";
import { useScriptureSearchSession } from "@/features/bible-search/use-search";
import { ReaderCircleButton } from "@/features/bible-reader/header";

const ignorePreviewEvent = () => {};
const emptyVerseNumbers: number[] = [];

type ReaderNavigationOptions = { scroll?: boolean; highlight?: boolean; fromAudio?: boolean; intent?: ReaderNavigationIntent; haptic?: boolean };

type BibleReaderPreferenceSyncStatus = {
  userId?: string;
  connectionKnown: boolean;
  connected: boolean;
  cloudResolved: boolean;
  updatedAt: number;
  lastSignature: string;
  localSnapshot?: StoredBibleReaderPreferences;
};

type PendingBibleReaderCloudSave = {
  userId: string;
  snapshot: StoredBibleReaderPreferences;
  sync: BibleReaderPreferenceSyncStatus;
};

export function BibleScreen() {
  const planParams = useLocalSearchParams<{ planId?: string; planDay?: string; planJump?: string }>();
  const handledPlanJump = useRef<string | undefined>(undefined);
  const [selectedPlanDayNumber, setSelectedPlanDayNumber] = useState<number | undefined>();
  const state = useKoinoFields(["bibleHighlightColors", "bibleHighlights", "biblePlans", "currentGroupId", "currentUserId", "groups", "journalEntries", "journalShareGroupId", "savedVerses"]);
  const { dispatch } = useKoinoActions();
  const { language, t } = useAppTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const readerViewportRef = useRef<View>(null);
  const audioFollowScroll = useRef(new AudioFollowScroll());
  const isAudioPageFocused = useIsFocused();
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const relativeVerseOffsetsRef = useRef<Record<number, number>>({});
  const verseHeightsRef = useRef<Record<number, number>>({});
  const readerContentOriginRef = useRef<number | undefined>(undefined);
  const layoutChapterKeyRef = useRef("");
  const actionReturnFocusRef = useRef<View | null>(null);
  const verseRowsRef = useRef<Record<number, MeasurableView | null>>({});
  const readerScrollOffsetRef = useRef(0);
  const readerScrollIntent = useRef(new ReaderScrollIntent());
  const chapterFeedbackRevisionRef = useRef<number | undefined>(undefined);
  const programmaticTopRef = useRef(false);
  const programmaticScrollVerseRef = useRef<number | undefined>(undefined);
  const positionRef = useRef<BiblePosition>(defaultPosition);
  const historyRef = useRef<BibleHistory>(initialBibleHistory(defaultPosition));
  const lastScrollCommitRef = useRef(0);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pagerRef = useRef<ChapterPagerHandle>(null);
  const pagerInteractingRef = useRef(false);
  const verseLongPressActiveRef = useRef(false);

  const [position, setPosition] = useState<BiblePosition>(defaultPosition);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const chapterCursor = useChapterCursor(position);
  const reducedMotion = useReducedMotion();
  const [history, setHistory] = useState<BibleHistory>(() => initialBibleHistory(defaultPosition));
  const [highlightedPosition, setHighlightedPosition] = useState<BiblePosition | undefined>();
  const [bibleVersionId, setBibleVersionId] = useState<BibleVersionId>(defaultBibleVersionId);

  const bookLanguage = useBibleBookLanguage(bibleVersionId);
  const [fontId, setFontId] = useState<BibleReaderFontId>(defaultFontId);
  const [fontSize, setFontSize] = useState(defaultFontSize);
  const [showVerseNumbers, setShowVerseNumbers] = useState(defaultShowVerseNumbers);
  const [flowingParagraphText, setFlowingParagraphText] = useState(defaultFlowingParagraphText);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerInitialStage, setPickerInitialStage] = useState<"home" | "myPlaces" | "search">("home");
  const [versionPickerVisible, setVersionPickerVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [selectedVersePosition, setSelectedVersePosition] = useState<BiblePosition | undefined>();
  const [selectedVerseNumbers, setSelectedVerseNumbers] = useState<number[]>([]);
  const [reflectionText, setReflectionText] = useState("");
  const [crossReferencePosition, setCrossReferencePosition] = useState<BiblePosition | undefined>();
  const [selectedFootnote, setSelectedFootnote] = useState<SelectedBibleFootnote | undefined>();
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchReturn, setSearchReturn] = useState<{ userId?: string }>();
  const canReturnToSearch = !!searchReturn && searchReturn.userId === state.currentUserId;
  const searchSession = useScriptureSearchSession({ language, versionId: bibleVersionId, visible: searchVisible, currentBook: position.book, scopeKey: state.currentUserId });
  const browseAfterSearchDismiss = useRef(false);
  useEffect(() => {
    setSearchVisible(false);
    setSearchReturn(undefined);
  }, [state.currentUserId]);
  const [scriptureComposerVisible, setScriptureComposerVisible] = useState(false);
  const [scriptureComposerIntent, setScriptureComposerIntent] = useState<BibleComposerIntent>("reflect");
  const [scriptureComposerContext, setScriptureComposerContext] = useState<"journal" | "room">("journal");
  const [scriptureComposerKind, setScriptureComposerKind] = useState<EntryKind>("scripture");
  const [scriptureComposerVisibility, setScriptureComposerVisibility] = useState<EntryVisibility>(visibility.private);
  const [scriptureComposerTitle, setScriptureComposerTitle] = useState("");
  const [scriptureComposerBody, setScriptureComposerBody] = useState("");
  const [scriptureComposerVerses, setScriptureComposerVerses] = useState<BibleVerse[]>([]);
  const [scriptureJournalSaving, setScriptureJournalSaving] = useState(false);
  const [scriptureJournalFeedback, setScriptureJournalFeedback] = useState<TranslationKey>();
  const scriptureJournalRef = useRef<{ userId: string; audience?: { groupId: string }; inFlight?: boolean } | undefined>(undefined);
  const scriptureJournalDraft = scriptureJournalRef.current;
  const scriptureJournalAudience = scriptureJournalDraft?.audience;
  const journalShareGroupId = state.journalShareGroupId === state.currentGroupId
    && state.groups.some((group) => group.id === state.journalShareGroupId && !group.migrationPending && group.name)
    ? state.journalShareGroupId : undefined;
  const liveScriptureJournal = useRef({ userId: state.currentUserId, groupId: journalShareGroupId });
  liveScriptureJournal.current = { userId: state.currentUserId, groupId: journalShareGroupId };
  useLayoutEffect(() => () => { scriptureJournalRef.current = undefined; }, []);
  useLayoutEffect(() => {
    const draft = scriptureJournalRef.current;
    if (!draft) return;
    if (draft.userId !== state.currentUserId) {
      scriptureJournalRef.current = undefined;
      setScriptureComposerVisible(false);
      setScriptureComposerTitle("");
      setScriptureComposerBody("");
      setScriptureComposerVerses([]);
      setScriptureJournalSaving(false);
      setScriptureJournalFeedback(undefined);
    } else if (draft.audience && draft.audience.groupId !== journalShareGroupId) {
      draft.audience = undefined;
      setScriptureComposerVisibility(visibility.private);
      setScriptureJournalFeedback("me.journey.composer.communityChanged");
    }
  }, [state.currentUserId, journalShareGroupId]);
  const [readerToast, setReaderToast] = useState<ReaderToast | undefined>();
  const [selectionSaving, setSelectionSaving] = useState(false);
  const highlightFeedbackRef = useRef({ revision: 0, reported: 0, active: true, userId: state.currentUserId });
  if (highlightFeedbackRef.current.userId !== state.currentUserId) {
    highlightFeedbackRef.current = { revision: highlightFeedbackRef.current.revision + 1, reported: 0, active: true, userId: state.currentUserId };
  }
  useEffect(() => {
    highlightFeedbackRef.current.active = true;
    return () => { highlightFeedbackRef.current.active = false; };
  }, []);
  const [pendingVerseComposerAction, setPendingVerseComposerAction] = useState<PendingVerseComposerAction | undefined>();
  const [highlightColorManagerVisible, setHighlightColorManagerVisible] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>();
  const [chapterControlsHeight, setChapterControlsHeight] = useState(48);
  const [selectionControlsHeight, setSelectionControlsHeight] = useState(164);
  const readerPreferencesSyncRef = useRef<BibleReaderPreferenceSyncStatus>({
    connectionKnown: false,
    connected: false,
    cloudResolved: false,
    updatedAt: 0,
    lastSignature: "",
  });
  const pendingReaderCloudSaveRef = useRef<PendingBibleReaderCloudSave | undefined>(undefined);

  const storageKey = useMemo(() => readerStorageKey(state.currentUserId), [state.currentUserId]);
  const bibleVersion = bibleVersionFor(bibleVersionId);
  const readerPalette = useMemo(() => readerPaletteFor(), []);
  const audio = useBibleAudio();
  const [audioVisible, setAudioVisible] = useState(false);
  const [followAudio, setFollowAudio] = useState(true);
  const [followedAudioPassageKey, setFollowedAudioPassageKey] = useState<string | undefined>();
  const audioPassage = audio.pendingRequest?.passage ?? audio.session?.passage;
  const audioPassageEntry = audio.pendingRequest?.passage ? audio.pendingRequest.entry : audio.session?.entry;
  const audioTopic = audio.pendingTopic?.definition ?? audio.session?.topic?.definition;
  const boundedAudioPending = !!audio.pendingRequest?.passage || !!audio.pendingTopic;
  const audioPassageKey = audioTopic ? `topic:${audioTopic.id}` : audioPassage && audioPassageEntry
    ? JSON.stringify([audioPassageEntry.manifestUrl, audioPassage.savedVerseId, audioPassage.startVerse, audioPassage.endVerse])
    : undefined;
  const activelyFollowingAudio = followAudio && !boundedAudioPending && (!audioPassageKey || followedAudioPassageKey === audioPassageKey);
  const [audioMiniHeight, setAudioMiniHeight] = useState(82);
  const [audioMiniTop, setAudioMiniTop] = useState<number | undefined>();
  const audioChapter = audio.chapterSelection ?? audio.session?.chapter;
  const hasAudioSelection = !!(audio.chapterSelection || audio.session);
  const spokenVerse = audio.chapterSelection?.verse ?? audio.session?.chapter.verses[audio.session.index].verse;
  const paragraphSpokenVerse = flowingParagraphText ? spokenVerse : undefined;
  const audioMatchesChapter = bibleVersionId === "reformationsbibeln2026" && audioChapter?.book === position.book && audioChapter.chapter === position.chapter;
  const chapterKey = `${bibleVersionId}:${position.book}:${position.chapter}`;
  const readerInteractionsEnabled = preferencesReady && isAudioPageFocused && !pickerVisible && !searchVisible && !settingsVisible &&
    !moreVisible && !versionPickerVisible && !selectedVersePosition && !selectedFootnote && !crossReferencePosition &&
    !scriptureComposerVisible && !highlightColorManagerVisible && !audioVisible;
  const { height: readerHeaderHeight, hidden: readerHeaderHidden, motion: headerMotion, style: readerHeaderStyle,
    onLayout: handleHeaderLayout, reveal: revealReaderHeader, stopTracking: stopHeaderTracking,
    suspend: suspendHeaderTracking, topOcclusion: readerTopOcclusion,
  } = useReaderHeader({ enabled: readerInteractionsEnabled && selectedVerseNumbers.length === 0,
    focused: isAudioPageFocused, reducedMotion, pageKey: chapterKey });
  const readerLayoutKey = `${chapterKey}:${flowingParagraphText}:${fontId}:${fontSize}:${showVerseNumbers}:${width}:${readerHeaderHeight}`;
  if (layoutChapterKeyRef.current !== readerLayoutKey) {
    if (layoutChapterKeyRef.current.startsWith(`${chapterKey}:`) && readerScrollIntent.current.pending?.target.kind !== "top") {
      readerScrollIntent.current.request(chapterKey, readerScrollOffsetRef.current <= 1 && positionRef.current.verse === 1
        ? { kind: "top" } : { kind: "verse", verse: positionRef.current.verse });
    }
    layoutChapterKeyRef.current = readerLayoutKey;
    verseOffsetsRef.current = {};
    relativeVerseOffsetsRef.current = {};
    verseHeightsRef.current = {};
    verseRowsRef.current = {};
  }
  const { pages: chapterPages, loadedChapter, retry: retryChapter } = useChapterWindow(position, bibleVersionId);
  const chapter = loadedChapter?.key === chapterKey ? loadedChapter.value : { heading: undefined, subtitles: [], verses: [] };
  const chapterVerses = chapter.verses;
  const { select: selectVisibleAudioVerse, retry: retryAudioSelection, layoutChanged: audioSelectionLayoutChanged, cancel: cancelAudioSelection } = useVisibleVerseSelection({
    chapterKey,
    layoutKey: readerLayoutKey,
    ready: loadedChapter?.key === chapterKey,
    enabled: bibleVersion.hasAudio && isAudioPageFocused,
    verses: chapterVerses,
    viewport: readerViewportRef,
    rows: verseRowsRef,
    offset: readerScrollOffsetRef,
    topInset: readerTopOcclusion,
    controlsTop: audioMiniTop,
    onSelect: (verse) => {
      setAudioVisible(false);
      setFollowedAudioPassageKey(undefined);
      setFollowAudio(true);
      void audio.selectChapter({ ...positionRef.current, verse });
    },
  });
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
  const pagePlanMarkers = useMemo(() => Object.fromEntries(chapterPages.map(page => [page.key,
    selectedPlan ? planMarkersForChapter(selectedPlan, page.position, selectedPlanCurrentDay?.day) : [],
  ])), [chapterPages, selectedPlan, selectedPlanCurrentDay]);
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
  const pageHighlights = useMemo(() => Object.fromEntries(chapterPages.map(page => {
    const highlights = state.bibleHighlights
      .filter(
        (highlight) =>
          highlight.book === page.position.book &&
          highlight.chapter === page.position.chapter &&
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

    return [page.key, byVerse];
  })), [bibleVersion.translation, chapterPages, state.bibleHighlights]);
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
  const readerLineHeight = Math.round(fontSize * 1.62);
  const contentWidth = width >= 780 ? 720 : undefined;
  const selectedVerseBarVisible = selectedVerseRanges.length > 0;
  const chapterControlsVisible = !selectedVerseBarVisible && !(hasAudioSelection && activelyFollowingAudio);
  const audioMiniBottom = tabBarHeight(insets.bottom);
  const floatingControlsBottom = audioMiniBottom + (hasAudioSelection ? audioMiniHeight : 0) + 16;
  const activeFloatingControlsHeight = selectedVerseBarVisible
    ? selectionControlsHeight
    : chapterControlsVisible ? chapterControlsHeight : 0;
  const readerBottomPadding = Math.max(insets.bottom + 120, floatingControlsBottom + activeFloatingControlsHeight + 28);
  const readerToastBottom = floatingControlsBottom + activeFloatingControlsHeight + 14;
  const readerCanGoBack = canReturnToSearch || navigation.canGoBack();
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

    if (!storageKey || !state.currentUserId) {
      setPreferencesReady(true);
      return () => {
        active = false;
      };
    }

    const sync: BibleReaderPreferenceSyncStatus = {
      userId: state.currentUserId,
      connectionKnown: false,
      connected: false,
      cloudResolved: false,
      updatedAt: 0,
      lastSignature: "",
    };
    readerPreferencesSyncRef.current = sync;
    setPreferencesReady(false);
    let localLoaded = false;
    let didHydrate = false;
    let confirmedCloudRead = false;
    let reconciliationQueue = Promise.resolve();
    const fallbackTimeout = setTimeout(() => {
      if (active && localLoaded && !didHydrate) applyLocalFallback();
    }, 3000);

    const applySnapshot = (snapshot: StoredBibleReaderPreferences, source: "local" | "cloud") => {
      if (!active) return;
      if (source === "cloud" && sync.localSnapshot && sync.localSnapshot.updatedAt > snapshot.updatedAt) return;
      const nextPreferences: BibleReaderPreferences = source === "cloud"
        ? { ...snapshot.preferences, appTheme: "light" }
        : snapshot.preferences;
      const signature = readerPreferencesSignature(nextPreferences);
      const unchanged = didHydrate && sync.lastSignature === signature;
      const appliedSnapshot = { preferences: nextPreferences, updatedAt: snapshot.updatedAt };
      const pendingSave = pendingReaderCloudSaveRef.current;
      if (pendingSave?.sync === sync && pendingSave.snapshot.updatedAt <= snapshot.updatedAt) {
        pendingReaderCloudSaveRef.current = undefined;
      }
      sync.localSnapshot = appliedSnapshot;
      sync.updatedAt = snapshot.updatedAt;
      sync.lastSignature = signature;
      didHydrate = true;
      clearTimeout(fallbackTimeout);
      void AsyncStorage.setItem(storageKey, serializeStoredBibleReaderPreferences(appliedSnapshot));

      // Acknowledging our own save must not become another verse navigation.
      // Its delayed echo can arrive during the very next chapter gesture.
      if (unchanged) return;

      verseOffsetsRef.current = {};
      readerScrollIntent.current.request(readerChapterKey(nextPreferences.bibleVersionId, nextPreferences.position), { kind: "verse", verse: nextPreferences.position.verse });
      programmaticTopRef.current = false;
      setNavigationRevision(value => value + 1);
      positionRef.current = nextPreferences.position;
      historyRef.current = nextPreferences.history;
      setHistory(nextPreferences.history);
      setPosition(nextPreferences.position);
      setBibleVersionId(nextPreferences.bibleVersionId);
      notifyBibleVersionPreferenceChanged(nextPreferences.bibleVersionId);
      setFontId(nextPreferences.fontId);
      setFontSize(nextPreferences.fontSize);
      setShowVerseNumbers(nextPreferences.showVerseNumbers);
      setFlowingParagraphText(nextPreferences.flowingParagraphText);
      setPreferencesReady(true);
    };

    function applyLocalFallback() {
      if (!active || !localLoaded || didHydrate) return;
      applySnapshot(sync.localSnapshot ?? { preferences: parsePreferences(null), updatedAt: 0 }, "local");
    }

    async function reconcileCloudSnapshot(cloudSnapshot: StoredBibleReaderPreferences | null) {
      if (!active || !sync.connected) return;

      const localSnapshot = sync.localSnapshot;
      if (cloudSnapshot && localSnapshot && localSnapshot.updatedAt > cloudSnapshot.updatedAt) {
        try {
          const savedSnapshot = await saveCloudBibleReaderPreferences(state.currentUserId as string, localSnapshot);
          if (!active) return;
          sync.cloudResolved = true;
          applySnapshot(savedSnapshot ?? localSnapshot, savedSnapshot ? "cloud" : "local");
        } catch {
          sync.cloudResolved = false;
          applyLocalFallback();
        }
        return;
      }

      if (cloudSnapshot) {
        sync.cloudResolved = true;
        applySnapshot(cloudSnapshot, "cloud");
        return;
      }

      if (localSnapshot) {
        const migrationSnapshot = {
          preferences: localSnapshot.preferences,
          updatedAt: Math.max(localSnapshot.updatedAt, Date.now()),
        };
        try {
          const savedSnapshot = await saveCloudBibleReaderPreferences(state.currentUserId as string, migrationSnapshot);
          if (!active) return;
          sync.cloudResolved = true;
          applySnapshot(savedSnapshot ?? migrationSnapshot, savedSnapshot ? "cloud" : "local");
        } catch {
          sync.cloudResolved = false;
          applyLocalFallback();
        }
        return;
      }

      sync.cloudResolved = true;
      applySnapshot({ preferences: parsePreferences(null), updatedAt: 0 }, "local");
    }

    function enqueueReconciliation(snapshot: StoredBibleReaderPreferences | null) {
      reconciliationQueue = reconciliationQueue
        .then(() => reconcileCloudSnapshot(snapshot))
        .catch(() => applyLocalFallback());
    }

    async function refreshFromCloud() {
      if (!active || !localLoaded || !sync.connected) return;
      try {
        const cloudSnapshot = await fetchCloudBibleReaderPreferences(state.currentUserId as string);
        if (!active || !sync.connected) return;
        confirmedCloudRead = true;
        enqueueReconciliation(cloudSnapshot);
      } catch {
        if (!didHydrate) applyLocalFallback();
      }
    }

    const stopCloudListener = listenForCloudBibleReaderPreferences(
      state.currentUserId,
      (snapshot) => {
        if (active && sync.connected && confirmedCloudRead) enqueueReconciliation(snapshot);
      },
      () => {
        if (!didHydrate) applyLocalFallback();
      },
    );
    const stopConnectionListener = listenForDatabaseConnection(
      (connected) => {
        sync.connectionKnown = true;
        sync.connected = connected;
        if (!connected) {
          sync.cloudResolved = false;
          confirmedCloudRead = false;
          applyLocalFallback();
          return;
        }
        void refreshFromCloud();
      },
      () => {
        sync.connectionKnown = true;
        sync.connected = false;
        sync.cloudResolved = false;
        applyLocalFallback();
      },
    );

    void AsyncStorage.getItem(storageKey).then((value) => {
      if (!active) return;
      sync.localSnapshot = readStoredBibleReaderPreferences(value) ?? undefined;
      sync.updatedAt = sync.localSnapshot?.updatedAt ?? 0;
      localLoaded = true;
      if (sync.connected) void refreshFromCloud();
      else if (sync.connectionKnown) applyLocalFallback();
    }).catch(() => {
      if (!active) return;
      localLoaded = true;
      if (sync.connected) void refreshFromCloud();
      else if (sync.connectionKnown) applyLocalFallback();
    });

    return () => {
      active = false;
      clearTimeout(fallbackTimeout);
      stopCloudListener();
      stopConnectionListener();
    };
  }, [state.currentUserId, storageKey]);

  useEffect(() => {
    if (!storageKey || !preferencesReady) return;

    const sync = readerPreferencesSyncRef.current;
    if (sync.userId !== state.currentUserId) return;
    const payload: BibleReaderPreferences = {
      appTheme: "light",
      bibleVersionId,
      fontId,
      fontSize,
      position,
      history,
      readerTheme: "light",
      showVerseNumbers,
      flowingParagraphText,
    };
    const signature = readerPreferencesSignature(payload);

    const scheduleCloudSave = (pending: PendingBibleReaderCloudSave) => setTimeout(() => {
      if (pendingReaderCloudSaveRef.current !== pending) return;
      pendingReaderCloudSaveRef.current = undefined;
      const currentSync = readerPreferencesSyncRef.current;
      if (currentSync !== pending.sync || !currentSync.connected || !currentSync.cloudResolved) return;
      void saveCloudBibleReaderPreferences(pending.userId, pending.snapshot).catch(() => {
        currentSync.cloudResolved = false;
      });
    }, 700);

    if (sync.lastSignature === signature) {
      if (sync.localSnapshot && sync.localSnapshot.preferences.appTheme !== "light") {
        const localSnapshot: StoredBibleReaderPreferences = {
          preferences: { ...sync.localSnapshot.preferences, appTheme: "light" },
          updatedAt: sync.localSnapshot.updatedAt,
        };
        sync.localSnapshot = localSnapshot;
        void AsyncStorage.setItem(storageKey, serializeStoredBibleReaderPreferences(localSnapshot));
      }
      const pendingSave = pendingReaderCloudSaveRef.current;
      if (pendingSave?.sync === sync && sync.connected && sync.cloudResolved) {
        const timeout = scheduleCloudSave(pendingSave);
        return () => clearTimeout(timeout);
      }
      return;
    }

    const candidate: StoredBibleReaderPreferences = {
      preferences: payload,
      updatedAt: Math.max(Date.now(), sync.updatedAt + 1),
    };
    sync.localSnapshot = candidate;
    sync.updatedAt = candidate.updatedAt;
    sync.lastSignature = signature;
    void AsyncStorage.setItem(storageKey, serializeStoredBibleReaderPreferences(candidate));
    if (!sync.connected || !sync.cloudResolved || !state.currentUserId) return;

    const pendingSave = { userId: state.currentUserId, snapshot: candidate, sync };
    pendingReaderCloudSaveRef.current = pendingSave;
    const timeout = scheduleCloudSave(pendingSave);

    return () => clearTimeout(timeout);
  }, [bibleVersionId, fontId, fontSize, flowingParagraphText, history, position, preferencesReady, showVerseNumbers, state.currentUserId, storageKey]);

  useEffect(() => {
    return () => {
      const pendingSave = pendingReaderCloudSaveRef.current;
      pendingReaderCloudSaveRef.current = undefined;
      if (!pendingSave || !pendingSave.sync.connected || !pendingSave.sync.cloudResolved) return;
      void saveCloudBibleReaderPreferences(pendingSave.userId, pendingSave.snapshot).catch(() => {
        pendingSave.sync.cloudResolved = false;
      });
    };
  }, []);

  useEffect(() => {
    setSelectedVerseNumbers([]);
    setSelectedFootnote(undefined);
  }, [position.book, position.chapter]);

  useEffect(() => {
    setSelectedFootnote(undefined);
  }, [bibleVersionId]);

  const tryScrollToVerse = useCallback((verse: number, animated: boolean, request = readerScrollIntent.current.pending) => {
    if (!request || request.target.kind !== "verse" || request.target.verse !== verse ||
      !readerScrollIntent.current.isCurrent(request, chapterKey) || layoutChapterKeyRef.current !== readerLayoutKey) return false;
    const offset = verseOffsetsRef.current[verse];
    if (typeof offset !== "number") return false;
    readerScrollIntent.current.complete(request);
    programmaticTopRef.current = false;
    programmaticScrollVerseRef.current = verse;
    stopHeaderTracking();
    scrollRef.current?.scrollTo({ animated, y: Math.max(0, offset - readerTopOcclusion() - 18) });
    return true;
  }, [chapterKey, readerLayoutKey, stopHeaderTracking, readerTopOcclusion]);

  const tryScrollToChapterTop = useCallback((request = readerScrollIntent.current.pending) => {
    if (!request || request.target.kind !== "top" || !readerScrollIntent.current.isCurrent(request, chapterKey) ||
      loadedChapter?.key !== chapterKey || !scrollRef.current) return;
    programmaticScrollVerseRef.current = undefined;
    programmaticTopRef.current = true;
    readerScrollOffsetRef.current = 0;
    stopHeaderTracking();
    scrollRef.current.scrollTo({ y: 0, animated: false });
    readerScrollIntent.current.complete(request);
    if (chapterFeedbackRevisionRef.current === request.revision) {
      chapterFeedbackRevisionRef.current = undefined;
      chapterSelectionHaptic();
    }
  }, [chapterKey, loadedChapter?.key, stopHeaderTracking]);

  useLayoutEffect(() => { tryScrollToChapterTop(); }, [tryScrollToChapterTop, navigationRevision, readerLayoutKey]);

  const scrollToAudioVerse = useCallback(() => {
    if (pagerInteractingRef.current || !isAudioPageFocused || !activelyFollowingAudio || !audioMatchesChapter || loadedChapter?.key !== chapterKey) return;
    if (flowingParagraphText && AppState.currentState !== "active") return;
    audioFollowScroll.current.tryScroll(chapterKey, (verse, done) => {
      if (!readerViewportRef.current) return;
      const row = verseRowsRef.current[verse];
      if (!flowingParagraphText && !row) return;
      readerViewportRef.current.measureInWindow((_x, y, _w, viewportHeight) => {
        if (layoutChapterKeyRef.current !== readerLayoutKey) return;
        if (flowingParagraphText && AppState.currentState !== "active") return;
        const topInset = readerTopOcclusion();
        const viewport = { y: y + topInset, height: viewportHeight - topInset };
        if (flowingParagraphText) {
          // Paragraph verses share a potentially very tall native Text node.
          // Convert their measured content bounds into window coordinates;
          // measuring that entire node can fail once its origin is offscreen.
          const verseOffset = verseOffsetsRef.current[verse];
          const verseHeight = verseHeightsRef.current[verse];
          if (!Number.isFinite(verseOffset) || !Number.isFinite(verseHeight)) return;
          const offset = readerScrollOffsetRef.current;
          done({
            verse: { y: y + verseOffset - offset, height: verseHeight },
            viewport, offset,
            controlsTop: audioMiniTop ?? y + viewportHeight,
          });
          return;
        }
        row!.measureInWindow((_vx, verseY, _vw, verseHeight) => done({
          verse: { y: verseY, height: verseHeight }, viewport,
          offset: readerScrollOffsetRef.current,
          controlsTop: audioMiniTop ?? y + viewportHeight,
        }));
      });
    }, (offset, verse) => {
      programmaticTopRef.current = false;
      programmaticScrollVerseRef.current = verse;
      stopHeaderTracking();
      scrollRef.current?.scrollTo({ animated: true, y: offset });
    });
  }, [isAudioPageFocused, activelyFollowingAudio, audioMatchesChapter, loadedChapter?.key, chapterKey, audioMiniTop, flowingParagraphText, readerLayoutKey, readerTopOcclusion, stopHeaderTracking]);

  const refreshParagraphAudioFollow = useCallback(() => {
    if (!paragraphSpokenVerse || !isAudioPageFocused || !activelyFollowingAudio || !audioMatchesChapter) return;
    audioFollowScroll.current.request(chapterKey, paragraphSpokenVerse);
    requestAnimationFrame(scrollToAudioVerse);
  }, [paragraphSpokenVerse, isAudioPageFocused, activelyFollowingAudio, audioMatchesChapter, chapterKey, scrollToAudioVerse]);

  // A completed visibility check can be invalidated by an animation finishing
  // later or by Android restoring the scroll position after background audio.
  // Recheck during playback as well as when the reader becomes visible again.
  useEffect(() => {
    if (audio.playWhenReady) refreshParagraphAudioFollow();
  }, [audio.position, audio.playWhenReady, refreshParagraphAudioFollow]);

  useEffect(() => {
    if (!flowingParagraphText) return;
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") refreshParagraphAudioFollow();
    });
    return () => subscription.remove();
  }, [flowingParagraphText, refreshParagraphAudioFollow]);

  const ensureVerseVisibleAboveSelection = useCallback((verse: number) => {
    const verseRow = verseRowsRef.current[verse];
    if (!verseRow) return;

    verseRow.measureInWindow((_x, y, _width, verseHeight) => {
      const selectionTop = height - floatingControlsBottom - selectionControlsHeight;
      const overlap = y + verseHeight - selectionTop + 36;
      if (overlap <= 0) return;

      stopHeaderTracking();
      scrollRef.current?.scrollTo({
        animated: true,
        y: Math.max(0, readerScrollOffsetRef.current + overlap),
      });
    });
  }, [floatingControlsBottom, height, selectionControlsHeight, stopHeaderTracking]);

  useEffect(() => {
    if (selectedVerseNumbers.length === 0) return;
    const selectedVerse = selectedVerseNumbers[selectedVerseNumbers.length - 1];
    requestAnimationFrame(() => ensureVerseVisibleAboveSelection(selectedVerse));
  }, [ensureVerseVisibleAboveSelection, selectedVerseNumbers]);

  const jumpToPosition = useCallback(
    (nextPosition: Partial<BiblePosition>, { scroll: shouldScroll = true, highlight: shouldHighlight = false, fromAudio = false, intent = "verse", haptic = intent === "chapter" }: ReaderNavigationOptions = {}) => {
      cancelAudioSelection();
      if (!fromAudio) { revealReaderHeader(); setFollowAudio(false); audioFollowScroll.current.cancel(); }
      const normalized = normalizeBiblePosition(nextPosition, fromAudio ? "reformationsbibeln2026" : bibleVersionId);
      const current = positionRef.current;
      programmaticScrollVerseRef.current = undefined;
      programmaticTopRef.current = false;
      chapterFeedbackRevisionRef.current = undefined;
      readerScrollIntent.current.cancel();
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
        const request = readerScrollIntent.current.request(readerChapterKey(fromAudio ? "reformationsbibeln2026" : bibleVersionId, normalized),
          intent === "chapter" ? { kind: "top" } : { kind: "verse", verse: normalized.verse });
        if (haptic && intent === "chapter") chapterFeedbackRevisionRef.current = request.revision;
        if (sameChapter && intent === "verse") {
          requestAnimationFrame(() => tryScrollToVerse(normalized.verse, !reducedMotion, request));
        }
      }

      positionRef.current = normalized;
      setPosition(normalized);
      setNavigationRevision(value => value + 1);
      if (shouldHighlight) {
        showTemporaryHighlight(normalized);
      }
    },
    [bibleVersionId, showTemporaryHighlight, tryScrollToVerse, cancelAudioSelection, reducedMotion, revealReaderHeader],
  );

  const hadAudioSession = useRef(false);
  useEffect(() => {
    if (boundedAudioPending) {
      setFollowedAudioPassageKey(undefined);
      setFollowAudio(false);
      audioFollowScroll.current.cancel();
    }
  }, [audio.pendingRequest, audio.pendingTopic, boundedAudioPending]);

  useEffect(() => {
    if (audio.session && !audio.session.passage && !audio.session.topic && !boundedAudioPending && !hadAudioSession.current) setFollowAudio(true);
    if (!hasAudioSelection) {
      audioFollowScroll.current.cancel();
      setFollowedAudioPassageKey(undefined);
      if (hadAudioSession.current && !boundedAudioPending) setFollowAudio(true);
    }
    hadAudioSession.current = hasAudioSelection;
  }, [audio.session, hasAudioSelection, boundedAudioPending]);

  useEffect(() => {
    if (!audioChapter || !activelyFollowingAudio || !isAudioPageFocused || !spokenVerse) { audioFollowScroll.current.cancel(); return; }
    readerScrollIntent.current.cancel();
    const targetKey = `reformationsbibeln2026:${audioChapter.book}:${audioChapter.chapter}`;
    audioFollowScroll.current.request(targetKey, spokenVerse);
    if (bibleVersionId !== "reformationsbibeln2026") setBibleVersionId("reformationsbibeln2026");
    if (positionRef.current.book !== audioChapter.book || positionRef.current.chapter !== audioChapter.chapter) {
      jumpToPosition({ book: audioChapter.book, chapter: audioChapter.chapter, verse: spokenVerse }, { scroll: false, fromAudio: true });
    }
    const frame = requestAnimationFrame(scrollToAudioVerse);
    return () => { cancelAnimationFrame(frame); audioFollowScroll.current.cancel(); };
  }, [audioChapter?.book, audioChapter?.chapter, audio.session?.entry.manifestUrl, audioPassageKey, spokenVerse, audio.navigationRevision, audio.playWhenReady, activelyFollowingAudio, isAudioPageFocused, bibleVersionId, scrollToAudioVerse, jumpToPosition]);

  const travelHistory = useCallback((direction: -1 | 1) => {
    cancelAudioSelection();
    setFollowAudio(false); audioFollowScroll.current.cancel();
    const movedHistory = moveBibleHistory(historyRef.current, direction);
    if (movedHistory === historyRef.current) return;
    revealReaderHeader();
    const nextHistory = updateBibleHistoryPosition(movedHistory, normalizeBiblePosition(movedHistory.entries[movedHistory.index], bibleVersionId));
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    const destination = nextHistory.entries[nextHistory.index];
    const current = positionRef.current;
    programmaticScrollVerseRef.current = undefined;
    programmaticTopRef.current = false;
    const sameChapter = current.book === destination.book && current.chapter === destination.chapter;
    if (!sameChapter) {
      verseOffsetsRef.current = {};
      verseRowsRef.current = {};
      setSelectedVerseNumbers([]);
    }
    const request = readerScrollIntent.current.request(readerChapterKey(bibleVersionId, destination), { kind: "verse", verse: destination.verse });
    if (sameChapter) requestAnimationFrame(() => tryScrollToVerse(destination.verse, !reducedMotion, request));
    positionRef.current = destination;
    setPosition(destination);
    setNavigationRevision(value => value + 1);
  }, [bibleVersionId, tryScrollToVerse, cancelAudioSelection, reducedMotion, revealReaderHeader]);

  useEffect(() => {
    if (!preferencesReady || !planParams.planId || !planParams.planJump || handledPlanJump.current === planParams.planJump) return;
    const plan = activeBiblePlans.find((item) => item.id === planParams.planId);
    const day = plan?.days.find((item) => item.dayNumber === Number(planParams.planDay));
    const start = firstPositionForPlanDay(day);
    if (!plan || !day || !start) return;
    handledPlanJump.current = planParams.planJump;
    setSelectedPlanId(plan.id);
    setSelectedPlanDayNumber(day.dayNumber);
    jumpToPosition(start, { highlight: true });
  }, [activeBiblePlans, jumpToPosition, planParams.planId, planParams.planDay, planParams.planJump, preferencesReady]);

  const jumpToSelectedPlanDay = useCallback(() => {
    const start = firstPositionForPlanDay(selectedPlanCurrentDay?.day);
    if (start) {
      jumpToPosition(start, { highlight: true });
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
    cancelAudioSelection();
    revealReaderHeader();
    setFollowAudio(false); audioFollowScroll.current.cancel();
    const nextPosition = normalizeBiblePosition(positionRef.current, nextVersionId);
    readerScrollIntent.current.request(readerChapterKey(nextVersionId, nextPosition), { kind: "verse", verse: nextPosition.verse });
    programmaticTopRef.current = false;
    chapterFeedbackRevisionRef.current = undefined;
    setNavigationRevision(value => value + 1);
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    const entries: BiblePosition[] = [];
    let index = 0;
    historyRef.current.entries.forEach((entry, entryIndex) => {
      const normalized = normalizeBiblePosition(entry, nextVersionId);
      if (!entries.length || !sameBiblePosition(entries[entries.length - 1], normalized)) entries.push(normalized);
      if (entryIndex === historyRef.current.index) index = entries.length - 1;
    });
    const nextHistory = { entries, index };
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setSelectedVerseNumbers([]);
    setBibleVersionId(nextVersionId);
    notifyBibleVersionPreferenceChanged(nextVersionId);
  }, [cancelAudioSelection, revealReaderHeader]);

  const handleVerseLayout = useCallback(
    (verse: number, offset: number, verseHeight?: number) => {
      if (layoutChapterKeyRef.current !== readerLayoutKey) return;
      const previousHeight = verseHeightsRef.current[verse];
      relativeVerseOffsetsRef.current[verse] = offset;
      if (verseHeight !== undefined) verseHeightsRef.current[verse] = verseHeight;
      audioSelectionLayoutChanged();
      const origin = readerContentOriginRef.current;
      if (origin === undefined) return;
      const absoluteOffset = origin + offset;
      const changed = verseOffsetsRef.current[verse] !== absoluteOffset ||
        (verseHeight !== undefined && previousHeight !== verseHeight);
      verseOffsetsRef.current[verse] = absoluteOffset;
      if (verse === paragraphSpokenVerse && changed) refreshParagraphAudioFollow();
      else requestAnimationFrame(scrollToAudioVerse);
      const request = readerScrollIntent.current.pending;
      if (request?.target.kind === "verse" && request.target.verse === verse) {
        requestAnimationFrame(() => tryScrollToVerse(verse, !reducedMotion, request));
      }
    },
    [readerLayoutKey, tryScrollToVerse, scrollToAudioVerse, audioSelectionLayoutChanged, paragraphSpokenVerse, refreshParagraphAudioFollow, reducedMotion],
  );

  const handleVerseRef = useCallback((verse: number, node: MeasurableView | null) => {
    if (layoutChapterKeyRef.current !== readerLayoutKey || verseRowsRef.current[verse] === node) return;
    verseRowsRef.current[verse] = node;
    audioSelectionLayoutChanged();
  }, [readerLayoutKey, audioSelectionLayoutChanged]);

  const handleReaderOrigin = useCallback((y: number) => {
    if (layoutChapterKeyRef.current !== readerLayoutKey) return;
    readerContentOriginRef.current = y;
    audioSelectionLayoutChanged();
    for (const [verse, offset] of Object.entries(relativeVerseOffsetsRef.current)) handleVerseLayout(Number(verse), offset);
  }, [readerLayoutKey, audioSelectionLayoutChanged, handleVerseLayout]);

  const handlePagerInteraction = useCallback((active: boolean) => {
    const wasActive = pagerInteractingRef.current;
    pagerInteractingRef.current = active;
    suspendHeaderTracking(active);
    if (!active && wasActive) requestAnimationFrame(scrollToAudioVerse);
  }, [scrollToAudioVerse, suspendHeaderTracking]);

  const handleReaderScrollBeginDrag = useCallback(() => {
    setFollowAudio(false);
    audioFollowScroll.current.cancel();
    readerScrollIntent.current.cancel();
    chapterFeedbackRevisionRef.current = undefined;
    programmaticScrollVerseRef.current = undefined;
    programmaticTopRef.current = false;
  }, []);

  const openCrossReferences = useCallback(
    (verse: number) => {
      const nextPosition = normalizeBiblePosition({ book: positionRef.current.book, chapter: positionRef.current.chapter, verse }, bibleVersionId);
      setCrossReferencePosition(nextPosition);
    },
    [bibleVersionId],
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
      if (layoutChapterKeyRef.current !== readerLayoutKey || pagerInteractingRef.current || readerScrollIntent.current.pending) return;
      if (programmaticTopRef.current) {
        if (event.nativeEvent.contentOffset.y > 1) return;
        programmaticTopRef.current = false;
      }
      readerScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      retryAudioSelection();
      const now = Date.now();
      if (now - lastScrollCommitRef.current < 140) return;

      const topOffset = event.nativeEvent.contentOffset.y + readerTopOcclusion() + 24;
      let visibleVerse = chapterVerses[0]?.verse;

      for (const item of chapterVerses) {
        const offset = verseOffsetsRef.current[item.verse];
        if (typeof offset !== "number") continue;
        if (flowingParagraphText) {
          if (offset + (verseHeightsRef.current[item.verse] ?? 0) > topOffset) {
            visibleVerse = item.verse;
            break;
          }
          visibleVerse = item.verse;
          continue;
        }
        if (offset <= topOffset) {
          visibleVerse = item.verse;
          continue;
        }
        break;
      }

      if (programmaticScrollVerseRef.current !== undefined) {
        if (flowingParagraphText && visibleVerse !== undefined &&
          verseOffsetsRef.current[visibleVerse] === verseOffsetsRef.current[programmaticScrollVerseRef.current]) {
          visibleVerse = programmaticScrollVerseRef.current;
        }
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
    [chapterVerses, flowingParagraphText, retryAudioSelection, readerLayoutKey, readerTopOcclusion],
  );

  const openSearch = useCallback(() => {
    cancelAudioSelection();
    setFollowAudio(false);
    audioFollowScroll.current.cancel();
    setSearchReturn(undefined);
    setSearchVisible(true);
  }, [cancelAudioSelection]);

  const handleReaderBack = useCallback(() => {
    if (canReturnToSearch) {
      openSearch();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [canReturnToSearch, navigation, openSearch]);

  useEffect(() => {
    if (!isAudioPageFocused || !canReturnToSearch || searchVisible) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      handleReaderBack();
      return true;
    });
    return () => listener.remove();
  }, [canReturnToSearch, handleReaderBack, isAudioPageFocused, searchVisible]);

  const handleVersePressIn = useCallback(() => {
    verseLongPressActiveRef.current = false;
  }, []);

  const handleVersePress = useCallback((verse: number) => {
    if (verseLongPressActiveRef.current) {
      verseLongPressActiveRef.current = false;
      return;
    }

    const nextPosition = normalizeBiblePosition({ book: positionRef.current.book, chapter: positionRef.current.chapter, verse }, bibleVersionId);
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
  }, [bibleVersionId]);

  const handleVerseLongPress = useCallback((verse: number) => {
    pagerRef.current?.blockCurrentTouch();
    const verseNode = verseRowsRef.current[verse];
    actionReturnFocusRef.current = verseNode && "focusTarget" in verseNode ? verseNode.focusTarget : verseNode ?? null;
    verseLongPressActiveRef.current = true;
    const nextPosition = normalizeBiblePosition({ book: positionRef.current.book, chapter: positionRef.current.chapter, verse }, bibleVersionId);
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
  }, [bibleVersionId]);

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

  const performHighlightMutation = useCallback(async (
    action: Extract<Parameters<typeof dispatch>[0], { type: "highlightVerses" | "removeBibleHighlights" }>,
    success: Omit<ReaderToast, "tone">,
  ) => {
    const feedback = highlightFeedbackRef.current;
    const revision = ++feedback.revision;
    try {
      await dispatch(action);
      if (highlightFeedbackRef.current === feedback && feedback.active && feedback.revision === revision) {
        feedback.reported = revision;
        setReaderToast({ ...success, tone: "success" });
      }
    } catch {
      if (highlightFeedbackRef.current === feedback && feedback.active && revision >= feedback.reported) {
        feedback.reported = revision;
        setReaderToast({
          message: language === "sv" ? "Markeringen kunde inte sparas" : "Could not save highlight",
          detail: language === "sv" ? "Ändringen har återställts. Försök igen." : "The change was reverted. Please try again.",
          tone: "error",
        });
      }
    }
  }, [dispatch, language]);

  const handleHighlightSelectedVerses = useCallback(async (color: BibleHighlightColor, colorId?: string) => {
    if (selectionSaving || selectedVerseRanges.length === 0) return;

    const selectedVerses = selectedPassages;

    if (selectedVerses.length === 0) {
      setReaderToast({ detail: "Try selecting the verses again.", message: "Could not highlight selection", tone: "error" });
      return;
    }

    setSelectedVerseNumbers([]);
    setReaderToast(undefined);
    await performHighlightMutation({ type: "highlightVerses", color, colorId, verses: selectedVerses }, {
      detail: selectedVerses.length === 1 ? "Highlight saved to this Bible." : "Highlights saved to this Bible.",
      message: selectedVerses.length === 1 ? "Verse highlighted" : "Verses highlighted",
    });
  }, [performHighlightMutation, selectedPassages, selectedVerseRanges.length, selectionSaving]);

  const handleHighlightWithPaletteColor = useCallback(
    (paletteColor: BibleHighlightPaletteColor) => {
      void handleHighlightSelectedVerses(paletteColor.hex, paletteColor.id);
    },
    [handleHighlightSelectedVerses],
  );

  const handleDeleteSelectedHighlights = useCallback(async () => {
    if (selectionSaving || selectedHighlightIds.length === 0) return;

    setSelectedVerseNumbers([]);
    setReaderToast(undefined);
    await performHighlightMutation({ type: "removeBibleHighlights", ids: selectedHighlightIds }, {
      detail: selectedHighlightIds.length === 1 ? "Highlight removed from this Bible." : "Highlights removed from this Bible.",
      message: selectedHighlightIds.length === 1 ? "Highlight deleted" : "Highlights deleted",
    });
  }, [performHighlightMutation, selectedHighlightIds, selectionSaving]);

  const openScriptureComposer = useCallback((intent: BibleComposerIntent, context: "journal" | "room", kind: EntryKind, verse: BibleVerse) => {
    const userId = liveScriptureJournal.current.userId;
    if (scriptureJournalRef.current?.inFlight || (context === "journal" && !userId)) return;
    scriptureJournalRef.current = context === "journal" && userId ? { userId } : undefined;
    setScriptureJournalFeedback(undefined);
    setScriptureComposerIntent(intent);
    setScriptureComposerContext(context);
    setScriptureComposerKind(kind);
    setScriptureComposerVisibility(context === "room" ? visibility.room : visibility.private);
    setScriptureComposerTitle(context === "room" ? "" : displayBibleReference(verse.reference, bookLanguage, verse.translation));
    setScriptureComposerBody("");
    setScriptureComposerVerses([verse]);
    setScriptureComposerVisible(true);
  }, [bookLanguage]);

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
    if (action === "highlight") {
      const color = state.bibleHighlightColors[0];
      void performHighlightMutation({ type: "highlightVerses", color: color?.hex ?? "#FFC166", colorId: color?.id, verses: [selectedVerse] }, { message: "Verse highlighted" });
      return;
    }

    setPendingVerseComposerAction({ action, verse: selectedVerse });
  }, [dispatch, performHighlightMutation, selectedVersePosition, state.bibleHighlightColors, state.savedVerses, t, verseForPosition]);

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

  function scriptureJournalIsCurrent() {
    return Boolean(scriptureJournalDraft && scriptureJournalRef.current === scriptureJournalDraft
      && liveScriptureJournal.current.userId === scriptureJournalDraft.userId);
  }

  function changeScriptureDraft(change: () => void) {
    if (scriptureComposerContext === "room" || (scriptureJournalIsCurrent() && !scriptureJournalDraft?.inFlight)) change();
  }

  function changeScriptureVisibility(value: EntryVisibility) {
    changeScriptureDraft(() => {
      if (scriptureComposerContext === "journal") {
        if (!scriptureJournalDraft || scriptureJournalDraft.audience !== scriptureJournalAudience
          || (value === visibility.room && (!journalShareGroupId || liveScriptureJournal.current.groupId !== journalShareGroupId))) return;
        if (value !== scriptureComposerVisibility) {
          scriptureJournalDraft.audience = value === visibility.room && journalShareGroupId ? { groupId: journalShareGroupId } : undefined;
        }
        setScriptureJournalFeedback(undefined);
      }
      setScriptureComposerVisibility(value);
    });
  }

  function closeScriptureComposer() {
    changeScriptureDraft(() => {
      if (scriptureComposerContext === "journal") scriptureJournalRef.current = undefined;
      setScriptureComposerVisible(false);
    });
  }

  async function submitScriptureComposer() {
    const canSubmit = scriptureComposerContext === "room" && scriptureComposerKind === "scripture"
      ? scriptureComposerVerses.length > 0
      : Boolean(scriptureComposerBody.trim());
    if (!canSubmit) return;
    const verse = scriptureComposerVerses[0];
    const action: Action = scriptureComposerVisibility === visibility.room
      ? {
        type: "createPost",
        body: scriptureComposerBody,
        kind: scriptureComposerKind,
        ...(scriptureComposerKind === "prayer_request" ? { title: scriptureComposerTitle } : {}),
        verse,
        verses: scriptureComposerVerses,
      } : {
        type: "createJournalEntry",
        body: scriptureComposerBody,
        entryKind: scriptureComposerKind,
        journalType: scriptureComposerKind === "prayer_request" ? "prayer" : scriptureComposerKind === "scripture" ? "scripture_note" : "reflection",
        title: scriptureComposerTitle,
        verse,
        verses: scriptureComposerVerses,
        shareWithGroup: false,
      };
    if (scriptureComposerContext === "room") {
      await dispatch(action);
    } else {
      if (!scriptureJournalIsCurrent() || !scriptureJournalDraft || scriptureJournalDraft.inFlight
        || scriptureJournalDraft.audience !== scriptureJournalAudience
        || (scriptureJournalAudience && scriptureJournalAudience.groupId !== liveScriptureJournal.current.groupId)) return;
      const userId = scriptureJournalDraft.userId;
      const groupId = scriptureJournalAudience?.groupId;
      const expectedScope = groupId ? { userId, groupId } : undefined;
      if (action.type === "createPost" && !expectedScope) return;
      const scopedAction = action.type === "createPost"
        ? { ...action, expectedScope }
        : { ...action, journalScope: { userId } };
      scriptureJournalDraft.inFlight = true;
      setScriptureJournalSaving(true);
      setScriptureJournalFeedback(undefined);
      try {
        await dispatch(scopedAction);
      } catch {
        if (scriptureJournalIsCurrent() && scriptureJournalDraft.audience === scriptureJournalAudience) {
          setScriptureJournalFeedback(action.type === "createPost" ? "me.journey.composer.shareUnconfirmed" : "me.journey.composer.saveFailed");
        }
        return;
      } finally {
        scriptureJournalDraft.inFlight = false;
        if (scriptureJournalIsCurrent()) setScriptureJournalSaving(false);
      }
      if (!scriptureJournalIsCurrent()) return;
      scriptureJournalRef.current = undefined;
    }
    setScriptureComposerVisible(false);
    setScriptureComposerBody("");
    setScriptureComposerTitle("");
    setScriptureComposerVerses([]);
  }

  const handleReflectionAction = useCallback((_action: "journal" | "pray" | "save") => {
    // TODO: Persist end-of-chapter reflection actions when the product flow is defined.
  }, []);

  useEffect(() => {
    if (!readerToast) return;
    const timeout = setTimeout(() => setReaderToast(undefined), 2200);
    return () => clearTimeout(timeout);
  }, [readerToast]);

  function closeSearch() {
    searchSession.suspend();
    setSearchVisible(false);
  }

  function changeFontSize(delta: number) {
    setFontSize((current) => normalizeFontSize(current + delta));
  }

  const selectedVerseIsSaved = useMemo(() => {
    const selectedVerse = verseForPosition(selectedVersePosition);
    return Boolean(selectedVerse && state.savedVerses.some((verse) => savedVerseIdentity(verse) === savedVerseIdentity(selectedVerse)));
  }, [selectedVersePosition, state.savedVerses, verseForPosition]);

  const handleFootnotePress = useCallback((marker: string, footnote: BibleFootnote, verse: number) => {
    setSelectedFootnote({ footnote, marker, position: { book: position.book, chapter: position.chapter, verse } });
  }, [position.book, position.chapter]);

  const readerTextStyle: TextStyle = useMemo(() => ({
    color: readerPalette.text,
    fontFamily: readerFontFamily,
    fontSize,
    fontWeight: "400",
    lineHeight: readerLineHeight,
  }), [readerPalette.text, readerFontFamily, fontSize, readerLineHeight]);

  const headerActions = useMemo(() => ({
    onHistoryBack: () => travelHistory(-1),
    onHistoryForward: () => travelHistory(1),
    onOpenPicker: () => { setPickerInitialStage("home"); setPickerVisible(true); },
    onOpenSearch: openSearch,
    onOpenMyPlaces: () => { setFollowAudio(false); audioFollowScroll.current.cancel(); setPickerInitialStage("myPlaces"); setPickerVisible(true); },
    onOpenSettings: () => setSettingsVisible(true),
    onOpenMore: () => setMoreVisible(true),
    onOpenVersionPicker: () => setVersionPickerVisible(true),
  }), [travelHistory, openSearch]);

  return (
    <BibleBookVersionContext.Provider value={bibleVersionId}>
    <View pointerEvents={preferencesReady ? "auto" : "none"} style={{ backgroundColor: readerPalette.background, flex: 1, paddingTop: insets.top }}>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: readerPalette.background, zIndex: 30 }} />
      <Animated.View
        testID="bible-reader-header"
        accessibilityElementsHidden={readerHeaderHidden}
        importantForAccessibility={readerHeaderHidden ? "no-hide-descendants" : "auto"}
        pointerEvents={readerHeaderHidden ? "none" : "auto"}
        onLayout={handleHeaderLayout}
        style={[{ position: "absolute", top: insets.top, left: 0, right: 0, zIndex: 20 }, readerHeaderStyle]}
      >
      <BibleReaderHeader
        canGoBack={readerCanGoBack}
        canGoHistoryBack={history.index > 0}
        canGoHistoryForward={history.index < history.entries.length - 1}
        onBack={handleReaderBack}
        {...headerActions}
        audioAvailable={bibleVersion.hasAudio}
        onOpenAudio={selectVisibleAudioVerse}
        palette={readerPalette}
        title={chapterLabel(position, bookLanguage)}
        compactTitle={compactChapterLabel(position, bookLanguage)}
        chapterIndex={chapterIndex(position)}
        chapterCursor={chapterCursor}
        previousChapterTitle={previousChapter ? compactChapterLabel(previousChapter, bookLanguage) : undefined}
        nextChapterTitle={nextChapter ? compactChapterLabel(nextChapter, bookLanguage) : undefined}
        translationLabel={bibleVersionShortLabel(bibleVersionId)}
        topInset={0}
      />
      </Animated.View>

      <ChapterPager
        ref={pagerRef}
        pages={chapterPages}
        currentKey={chapterKey}
        cursor={chapterCursor}
        width={width}
        layoutKey={`${flowingParagraphText}:${fontId}:${fontSize}:${showVerseNumbers}:${readerHeaderHeight}`}
        navigationRevision={navigationRevision}
        reducedMotion={reducedMotion}
        enabled={readerInteractionsEnabled}
        backgroundColor={readerPalette.background}
        viewportRef={readerViewportRef}
        onLayout={() => {
          audioSelectionLayoutChanged();
          if (flowingParagraphText) refreshParagraphAudioFollow();
          else requestAnimationFrame(scrollToAudioVerse);
        }}
        onCommit={(page) => jumpToPosition(page.position, { intent: "chapter", haptic: false })}
        onInteractionChange={handlePagerInteraction}
        onRetry={retryChapter}
        onLoadError={() => setReaderToast({ tone: "error", message: language === "sv" ? "Kapitlet kunde inte läsas in. Försök igen." : "Could not load chapter. Please try again." })}
        renderPage={(page, active) => <ChapterPageScrollView
          active={active}
          pageKey={page.key}
          headerMotion={headerMotion}
          activeScrollRef={scrollRef}
          onOrigin={active ? handleReaderOrigin : ignorePreviewEvent}
          contentInsetAdjustmentBehavior="never"
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          onScroll={active ? handleScroll : undefined}
          onMomentumScrollEnd={active && flowingParagraphText ? refreshParagraphAudioFollow : undefined}
          onContentSizeChange={active ? () => tryScrollToChapterTop() : undefined}
          removeClippedSubviews={false}
          onScrollBeginDrag={active ? handleReaderScrollBeginDrag : undefined}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignSelf: "stretch", paddingBottom: readerBottomPadding, paddingHorizontal: 22, paddingTop: readerHeaderHeight + 18 }}
          contentStyle={{ alignSelf: "center", gap: 28, maxWidth: contentWidth, width: "100%" }}
        >
          <BiblePlanReaderPanel
            currentDay={selectedPlanCurrentDay}
            markers={pagePlanMarkers[page.key] ?? []}
            onJump={jumpToSelectedPlanDay}
            onMarkRead={toggleSelectedPlanDay}
            onSelectPlan={(id) => { setSelectedPlanId(id); setSelectedPlanDayNumber(undefined); }}
            onSelectDay={(dayNumber) => {
              const day = selectedPlan?.days.find((item) => item.dayNumber === dayNumber);
              const start = firstPositionForPlanDay(day);
              if (start) { setSelectedPlanDayNumber(dayNumber); jumpToPosition(start, { highlight: true }); }
            }}
            palette={readerPalette}
            plan={selectedPlan}
            plans={activeBiblePlans}
          />
          {page.chapter ? <BibleText
            key={`${page.key}:${flowingParagraphText}:${fontId}:${fontSize}:${showVerseNumbers}:${width}`}
            flowingParagraphText={flowingParagraphText}
            spokenVerse={active && audioMatchesChapter ? spokenVerse : undefined}
            chapterHeading={page.chapter.heading}
            chapterHighlightByVerse={pageHighlights[page.key]}
            highlightedPosition={active ? highlightedPosition : undefined}
            onFootnotePress={active ? handleFootnotePress : ignorePreviewEvent}
            onVersePress={active ? handleVersePress : ignorePreviewEvent}
            onVersePressIn={active ? handleVersePressIn : ignorePreviewEvent}
            onVerseLayout={active ? handleVerseLayout : ignorePreviewEvent}
            onVerseLongPress={active ? handleVerseLongPress : ignorePreviewEvent}
            onVerseRef={active ? handleVerseRef : ignorePreviewEvent}
            palette={readerPalette}
            position={active ? position : page.position}
            readerLineHeight={readerLineHeight}
            readerTextStyle={readerTextStyle}
            planMarkers={pagePlanMarkers[page.key] ?? []}
            selectedVerseNumbers={active ? selectedVerseNumbers : emptyVerseNumbers}
            selectedVersePosition={active ? selectedVersePosition : undefined}
            showVerseNumbers={showVerseNumbers}
            subtitles={page.chapter.subtitles}
            verses={page.chapter.verses}
          /> : page.error ? <Pressable accessibilityRole="button" onPress={() => retryChapter(page.key)} style={{ alignItems: "center", justifyContent: "center", minHeight: 180 }}>
            <Text style={{ color: readerPalette.text }}>{language === "sv" ? "Kapitlet kunde inte läsas in. Tryck för att försöka igen." : "Could not load chapter. Tap to try again."}</Text>
          </Pressable> : <ActivityIndicator color={readerPalette.text} style={{ minHeight: 180 }} />}
        </ChapterPageScrollView>}
      />

      <BibleAudioPlayer visible={audioVisible} onClose={() => setAudioVisible(false)} onOpen={() => setAudioVisible(true)}
        onMiniHeightChange={setAudioMiniHeight}
        onMiniTopChange={setAudioMiniTop}
        onChooseTranslation={() => setBibleVersionId("reformationsbibeln2026")}
        palette={readerPalette} book={position.book} chapter={position.chapter} version={bibleVersionId}
        bottom={audioMiniBottom} follow={activelyFollowingAudio}
        onFollow={() => {
          if (audioChapter && !boundedAudioPending) {
            if (audio.session?.topic) closeSearch();
            setFollowedAudioPassageKey(audio.session?.passage || audio.session?.topic ? audioPassageKey : undefined);
            setBibleVersionId("reformationsbibeln2026");
            setFollowAudio(true);
            jumpToPosition({ book: audioChapter.book, chapter: audioChapter.chapter, verse: spokenVerse ?? 1 }, { scroll: false, fromAudio: true });
            audioFollowScroll.current.request(`reformationsbibeln2026:${audioChapter.book}:${audioChapter.chapter}`, spokenVerse ?? 1);
            requestAnimationFrame(scrollToAudioVerse);
          }
        }} />

      {chapterControlsVisible ? (
        <BibleBottomReadingControls
          bottom={floatingControlsBottom}
          maxWidth={contentWidth}
          nextChapter={nextChapter}
          onHeightChange={setChapterControlsHeight}
          onNext={() => pagerRef.current?.step(1)}
          onPrevious={() => pagerRef.current?.step(-1)}
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
        flowingParagraphText={flowingParagraphText}
        onChangeFlowingParagraphText={setFlowingParagraphText}
        fontId={fontId}
        fontSize={fontSize}
        onChangeFont={setFontId}
        onChangeShowVerseNumbers={setShowVerseNumbers}
        onClose={() => setSettingsVisible(false)}
        onFontSizeChange={changeFontSize}
        palette={readerPalette}
        showVerseNumbers={showVerseNumbers}
        visible={settingsVisible}
      />
      <BibleReaderToolsSheet
        canGoHistoryBack={history.index > 0}
        canGoHistoryForward={history.index < history.entries.length - 1}
        onClose={() => setMoreVisible(false)}
        onHistoryBack={headerActions.onHistoryBack}
        onHistoryForward={headerActions.onHistoryForward}
        onOpenMyPlaces={headerActions.onOpenMyPlaces}
        onOpenSearch={headerActions.onOpenSearch}
        onOpenSettings={headerActions.onOpenSettings}
        palette={readerPalette}
        visible={moreVisible}
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
        onRemoveSavedVerse={async (id) => {
          await dispatch({ type: "removeSavedVerse", id });
          setReaderToast({ message: t("bible.actions.unsavedToast"), tone: "success" });
        }}
        onSelect={(nextPosition, intent = "verse") => {
          setPickerVisible(false);
          jumpToPosition(nextPosition, { intent });
        }}
        palette={readerPalette}
        savedVerses={state.savedVerses}
        versionLabel={bibleVersion.label}
        visible={pickerVisible}
      />
      <Modal animationType="slide" visible={searchVisible} onRequestClose={closeSearch} onDismiss={() => {
        if (!browseAfterSearchDismiss.current) return;
        browseAfterSearchDismiss.current = false;
        setPickerInitialStage("home");
        setPickerVisible(true);
      }}>
        {searchVisible ? <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: readerPalette.background }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: readerPalette.text, fontSize: 22, fontWeight: "800" }}>{t("bible.search.title")}</Text>
              <Text style={{ color: readerPalette.muted, fontSize: 12 }}>{bibleVersion.label}</Text>
            </View>
            <ReaderCircleButton accessibilityLabel={t("shared.scripturePicker.close")} icon="x" onPress={closeSearch} palette={readerPalette} />
          </View>
          <ScriptureSearchContent bibleVersionId={bibleVersionId} visible={searchVisible} palette={readerPalette} session={searchSession}
            onBrowse={() => {
              // iOS must finish dismissing one native modal before presenting the drawer.
              if (Platform.OS === "ios") browseAfterSearchDismiss.current = true;
              closeSearch();
              if (Platform.OS !== "ios") { setPickerInitialStage("home"); setPickerVisible(true); }
            }}
            onSelect={(verse) => {
              if (!verse.book || !verse.chapter || !verse.startVerse) return;
              closeSearch();
              setSearchReturn({ userId: state.currentUserId });
              jumpToPosition({ book: verse.book, chapter: verse.chapter, verse: verse.startVerse }, { highlight: true });
            }} />
        </View> : null}
      </Modal>
      <SharedComposer
        bibleIntent={scriptureComposerIntent}
        visible={scriptureComposerVisible && (scriptureComposerContext === "room" || scriptureJournalIsCurrent())}
        context={scriptureComposerContext}
        kind={scriptureComposerKind}
        entryVisibility={scriptureComposerVisibility}
        title={scriptureComposerTitle}
        body={scriptureComposerBody}
        verses={scriptureComposerVerses}
        submission={scriptureComposerContext === "journal" && scriptureJournalSaving ? { status: "pending", inFlight: true } : undefined}
        submissionFeedback={scriptureComposerContext === "journal" ? scriptureJournalSaving ? "me.journey.composer.saving" : scriptureJournalFeedback : undefined}
        communityAudienceAvailable={scriptureComposerContext === "room" || Boolean(journalShareGroupId)}
        onKind={(kind) => changeScriptureDraft(() => setScriptureComposerKind(kind))}
        onOpenVerseInBible={(verse) => changeScriptureDraft(() => {
          closeScriptureComposer();
          requestAnimationFrame(() => openVerseInReader(verse));
        })}
        onVisibility={changeScriptureVisibility}
        onTitle={(title) => changeScriptureDraft(() => setScriptureComposerTitle(title))}
        onBody={(body) => changeScriptureDraft(() => setScriptureComposerBody(body))}
        onVerses={(verses) => changeScriptureDraft(() => setScriptureComposerVerses(verses))}
        onClose={closeScriptureComposer}
        onSubmit={submitScriptureComposer}
        roomName={group?.name}
        roomImage={group?.image}
      />
    </View>
    </BibleBookVersionContext.Provider>
  );
}
