import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { router, useNavigation } from "expo-router";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextStyle,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import {
  bibleChapterVerses,
  bibleCrossReferences,
  bibleVerseFromReference,
  buildBibleVerse,
  bibleVersionFor,
  bibleVersions,
  type BibleCrossReference,
  type BibleChapterVerse,
  type BiblePosition,
  type BibleVersionId,
  hasBibleCrossReferences,
  isBibleVersionId,
  kjvBooks,
  nextBibleChapter,
  normalizeBiblePosition,
  previousBibleChapter,
  versesForChapter,
} from "@/features/bible-kjv";
import { biblePlanDayLabel, localDayKey, sortedBiblePlanReadings, todayBiblePlanReading } from "@/features/bible-plan-utils";
import { defaultBibleVersionId, notifyBibleVersionPreferenceChanged, readerStorageKey } from "@/features/bible-preferences";
import { useKoino } from "@/state/koino-store";
import { visibility, type EntryVisibility } from "@/state/product";
import { BodyText, Card, IconButton, PrimaryButton, SecondaryButton, SectionHeading, TextInputField, VersePreviewCard } from "@/ui/app-components";
import { confirmAction } from "@/ui/confirm";
import { openLinkInApp } from "@/ui/open-link";
import { SharedComposer } from "@/ui/shared-composer";
import { colors, platformShadow, radius, themes } from "@/ui/theme";
import type { BibleHighlight, BibleHighlightColor, BibleHighlightPaletteColor, BibleVerse, EntryKind, JournalEntry, SavedVerse } from "@/state/types";

type FeatherName = ComponentProps<typeof Feather>["name"];

const readerFonts = [
  { id: "serif", label: "Serif" },
  { id: "classic", label: "Classic" },
  { id: "humanist", label: "Humanist" },
  { id: "system", label: "System" },
] as const;

const readerThemes = [
  { id: "light", label: "Ljus" },
  { id: "sepia", label: "Sepia" },
  { id: "dark", label: "Mörk" },
] as const;

type BibleReaderFontId = (typeof readerFonts)[number]["id"];
type BibleReaderThemeId = (typeof readerThemes)[number]["id"];
type PickerStage = "home" | "book" | "chapter" | "verse" | "saved" | "highlights" | "reflections";
type TestamentFilter = "all" | "old" | "new";
type VerseQuickAction = "copy" | "highlight" | "journal" | "pray" | "save" | "share";

type BibleReaderPreferences = {
  audioPosition: BiblePosition;
  audioVoiceId: string;
  audioVoiceName?: string;
  bibleVersionId: BibleVersionId;
  compactMode: boolean;
  fontId: BibleReaderFontId;
  fontSize: number;
  position: BiblePosition;
  readerTheme: BibleReaderThemeId;
  showCrossReferences: boolean;
  showFootnotes: boolean;
  showVerseNumbers: boolean;
};

type AudioPlaybackState = "idle" | "preparing" | "playing" | "paused" | "error";

type AudioVoice = {
  description?: string;
  id: string;
  languageName?: string;
  name: string;
};

type AudioBridgeMessage =
  | { type: "ready" }
  | { type: "voices"; requestId: string; voices: unknown }
  | { type: "audio"; base64: string; mimeType?: string; requestId: string }
  | { chunk: string; index: number; requestId: string; type: "audio-chunk" }
  | { mimeType?: string; requestId: string; totalChunks: number; type: "audio-start" }
  | { requestId: string; type: "audio-end" }
  | { message?: string; requestId: string; type: "interaction" }
  | { type: "error"; message?: string; requestId?: string };

type AudioBridgeCommand =
  | { token: string; type: "setAuthToken" }
  | { type: "listVoices"; requestId: string }
  | { requiresGesture?: boolean; text: string; type: "synthesize"; requestId: string; voiceId: string };

type PendingAudioTransfer = {
  chunks: string[];
  totalChunks: number;
};

type BibleTopicResult = {
  count: number;
  references: BibleTopicReference[];
  sourceUrl: string;
  topic: string;
};

type BibleTopicReference = {
  reference: string;
  votes: number;
};

type SuggestedTopic = {
  icon: FeatherName;
  title: string;
  subtitle: string;
  tone: "peach" | "green" | "rose" | "blue";
};

const suggestedTopics: SuggestedTopic[] = [
  { icon: "cloud-rain", title: "Anxiety", subtitle: "God's peace in the middle of worry", tone: "peach" },
  { icon: "sunrise", title: "Hope", subtitle: "God's promises for your future", tone: "green" },
  { icon: "heart", title: "Forgiveness", subtitle: "Freedom through God's grace", tone: "rose" },
  { icon: "user", title: "Identity", subtitle: "Who you are in Christ", tone: "peach" },
  { icon: "users", title: "Loneliness", subtitle: "God is with you", tone: "green" },
  { icon: "compass", title: "Purpose", subtitle: "Living with meaning", tone: "rose" },
  { icon: "message-circle", title: "Prayer", subtitle: "How to talk with God", tone: "peach" },
];

const defaultPosition = normalizeBiblePosition({ book: "Philippians", chapter: 4, verse: 4 });
const defaultFontId: BibleReaderFontId = "serif";
const defaultFontSize = 18;
const defaultReaderTheme: BibleReaderThemeId = "light";
const defaultShowVerseNumbers = true;
const defaultShowFootnotes = false;
const defaultShowCrossReferences = true;
const defaultCompactMode = false;
const oldTestamentBookCount = 39;
const minFontSize = 16;
const maxFontSize = 28;
const fontSizeStep = 2;
const elevenLabsTurboModel = "eleven_turbo_v2_5";
const puterDashboardUrl = "https://puter.com/dashboard#account";
const defaultAudioVoice: AudioVoice = { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", description: "Warm and steady" };
const fallbackAudioVoices: AudioVoice[] = [
  defaultAudioVoice,
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Clear sample voice" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft and bright" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Calm narration" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", description: "Gentle reading" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Grounded voice" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep narration" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", description: "Measured tone" },
];

type ReaderToast = {
  detail?: string;
  message: string;
  tone: "success" | "error";
};

type PendingVerseComposerAction = {
  action: "journal" | "pray" | "share";
  verse: BibleVerse;
};

type ChapterSwipeDirection = "idle" | "previous" | "next";

type SelectedVerseRange = {
  end: number;
  start: number;
};

const colorWheelColors = [
  "#FF5252",
  "#FF7043",
  "#FF9800",
  "#FFC107",
  "#FFF200",
  "#CDDC39",
  "#8BC34A",
  "#4DF06A",
  "#00C853",
  "#00BFA5",
  "#09C6DF",
  "#03A9F4",
  "#448AFF",
  "#3F51B5",
  "#7C4DFF",
  "#9C27B0",
  "#E040FB",
  "#F48FB1",
  "#FF4081",
  "#FF8A80",
  "#FFC166",
  "#A5D6A7",
  "#80DEEA",
  "#CE93D8",
];

function savedVerseIdentity(verse: Pick<BibleVerse, "reference" | "translation">) {
  return `${verse.reference}|${verse.translation ?? ""}`;
}

function selectedVerseRangesFor(verses: number[]): SelectedVerseRange[] {
  const sortedVerses = Array.from(new Set(verses)).sort((a, b) => a - b);
  const ranges: SelectedVerseRange[] = [];

  sortedVerses.forEach((verse) => {
    const previousRange = ranges[ranges.length - 1];
    if (previousRange && verse === previousRange.end + 1) {
      previousRange.end = verse;
      return;
    }

    ranges.push({ end: verse, start: verse });
  });

  return ranges;
}

function selectedVerseReferenceLabel(position: Pick<BiblePosition, "book" | "chapter">, ranges: SelectedVerseRange[]) {
  if (ranges.length === 0) return "";

  const rangeLabels = ranges.map((range) => (range.start === range.end ? String(range.start) : `${range.start}-${range.end}`));
  return `${position.book} ${position.chapter}:${rangeLabels.join(", ")}`;
}

function verseRangesOverlap(first: SelectedVerseRange, second: SelectedVerseRange) {
  return first.start <= second.end && second.start <= first.end;
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return withHash.toUpperCase();
}

function isHexColor(value: string) {
  return /^#[0-9A-F]{6}$/.test(normalizeHexColor(value));
}

function highlightTime(highlight: BibleHighlight) {
  const parsed = Date.parse(highlight.updatedAt || highlight.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function puterTokenStorageKey(userId?: string) {
  return userId ? `koino.puterAuthToken.${userId}` : "koino.puterAuthToken";
}

function isReaderFontId(value: unknown): value is BibleReaderFontId {
  return typeof value === "string" && readerFonts.some((font) => font.id === value);
}

function isReaderThemeId(value: unknown): value is BibleReaderThemeId {
  return typeof value === "string" && readerThemes.some((theme) => theme.id === value);
}

function normalizeFontSize(value: unknown) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : defaultFontSize;
  const clamped = Math.min(maxFontSize, Math.max(minFontSize, numericValue));
  return minFontSize + Math.round((clamped - minFontSize) / fontSizeStep) * fontSizeStep;
}

function normalizeStoredVoice(id: unknown, name: unknown): AudioVoice {
  const voiceId = typeof id === "string" && id.trim().length > 0 ? id : defaultAudioVoice.id;
  const voiceName = typeof name === "string" && name.trim().length > 0 ? name : fallbackAudioVoices.find((voice) => voice.id === voiceId)?.name ?? defaultAudioVoice.name;
  return { id: voiceId, name: voiceName };
}

function normalizeBridgeVoices(value: unknown): AudioVoice[] {
  if (!Array.isArray(value)) return fallbackAudioVoices;

  const voices = value
    .map((item): AudioVoice | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const candidate = item as {
        category?: unknown;
        description?: unknown;
        id?: unknown;
        language?: { name?: unknown };
        name?: unknown;
      };
      if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) return undefined;
      const name = typeof candidate.name === "string" && candidate.name.trim().length > 0 ? candidate.name : candidate.id;
      const description =
        typeof candidate.description === "string" && candidate.description.trim().length > 0
          ? candidate.description
          : typeof candidate.category === "string" && candidate.category.trim().length > 0
            ? candidate.category
            : undefined;
      const languageName = typeof candidate.language?.name === "string" ? candidate.language.name : undefined;
      return { description, id: candidate.id, languageName, name };
    })
    .filter((item): item is AudioVoice => Boolean(item));

  return voices.length > 0 ? voices.slice(0, 30) : fallbackAudioVoices;
}

function parsePreferences(value: string | null): BibleReaderPreferences {
  if (!value) {
    return {
      audioPosition: defaultPosition,
      audioVoiceId: defaultAudioVoice.id,
      audioVoiceName: defaultAudioVoice.name,
      bibleVersionId: defaultBibleVersionId,
      compactMode: defaultCompactMode,
      fontId: defaultFontId,
      fontSize: defaultFontSize,
      position: defaultPosition,
      readerTheme: defaultReaderTheme,
      showCrossReferences: defaultShowCrossReferences,
      showFootnotes: defaultShowFootnotes,
      showVerseNumbers: defaultShowVerseNumbers,
    };
  }

  try {
    const parsed = JSON.parse(value) as Partial<BibleReaderPreferences> | null;
    const storedVoice = normalizeStoredVoice(parsed?.audioVoiceId, parsed?.audioVoiceName);
    const position = normalizeBiblePosition(parsed?.position);
    return {
      audioPosition: normalizeBiblePosition(parsed?.audioPosition ?? position),
      audioVoiceId: storedVoice.id,
      audioVoiceName: storedVoice.name,
      bibleVersionId: isBibleVersionId(parsed?.bibleVersionId) ? parsed.bibleVersionId : defaultBibleVersionId,
      compactMode: typeof parsed?.compactMode === "boolean" ? parsed.compactMode : defaultCompactMode,
      fontId: isReaderFontId(parsed?.fontId) ? parsed.fontId : defaultFontId,
      fontSize: normalizeFontSize(parsed?.fontSize),
      position,
      readerTheme: isReaderThemeId(parsed?.readerTheme) ? parsed.readerTheme : defaultReaderTheme,
      showCrossReferences: typeof parsed?.showCrossReferences === "boolean" ? parsed.showCrossReferences : defaultShowCrossReferences,
      showFootnotes: typeof parsed?.showFootnotes === "boolean" ? parsed.showFootnotes : defaultShowFootnotes,
      showVerseNumbers: typeof parsed?.showVerseNumbers === "boolean" ? parsed.showVerseNumbers : defaultShowVerseNumbers,
    };
  } catch {
    return {
      audioPosition: defaultPosition,
      audioVoiceId: defaultAudioVoice.id,
      audioVoiceName: defaultAudioVoice.name,
      bibleVersionId: defaultBibleVersionId,
      compactMode: defaultCompactMode,
      fontId: defaultFontId,
      fontSize: defaultFontSize,
      position: defaultPosition,
      readerTheme: defaultReaderTheme,
      showCrossReferences: defaultShowCrossReferences,
      showFootnotes: defaultShowFootnotes,
      showVerseNumbers: defaultShowVerseNumbers,
    };
  }
}

function fontFamilyFor(fontId: BibleReaderFontId) {
  if (fontId === "system") return undefined;
  if (fontId === "humanist") {
    if (Platform.OS === "ios") return "Avenir Next";
    if (Platform.OS === "android") return "sans-serif-light";
    return "Avenir Next, Segoe UI, sans-serif";
  }
  if (fontId === "classic") {
    if (Platform.OS === "ios") return "Palatino";
    if (Platform.OS === "android") return "serif";
    return "Palatino Linotype, Palatino, Georgia, serif";
  }
  if (Platform.OS === "ios") return "Georgia";
  if (Platform.OS === "android") return "serif";
  return "Georgia, serif";
}

function referenceLabel(position: BiblePosition) {
  return `${position.book} ${position.chapter}:${position.verse}`;
}

function chapterLabel(position: BiblePosition) {
  return `${position.book} ${position.chapter}`;
}

function biblePositionFromVerse(verse?: Pick<BibleVerse, "book" | "chapter" | "reference" | "startVerse">) {
  if (!verse) return undefined;
  if (verse.book && typeof verse.chapter === "number" && typeof verse.startVerse === "number") {
    return normalizeBiblePosition({ book: verse.book, chapter: verse.chapter, verse: verse.startVerse });
  }

  const resolvedVerse = bibleVerseFromReference(verse.reference);
  if (!resolvedVerse?.book || typeof resolvedVerse.chapter !== "number" || typeof resolvedVerse.startVerse !== "number") {
    return undefined;
  }

  return normalizeBiblePosition({ book: resolvedVerse.book, chapter: resolvedVerse.chapter, verse: resolvedVerse.startVerse });
}

function biblePositionFromReference(reference?: string) {
  if (!reference) return undefined;
  return biblePositionFromVerse(bibleVerseFromReference(reference));
}

function biblePositionFromSearchQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const versePosition = biblePositionFromReference(trimmed);
  if (versePosition) return versePosition;

  const chapterMatch = trimmed.match(/^(.+?)\s+(\d+)$/);
  if (!chapterMatch) return undefined;
  return normalizeBiblePosition({ book: chapterMatch[1], chapter: Number(chapterMatch[2]), verse: 1 });
}

function testamentForBook(bookName: string): TestamentFilter {
  const index = kjvBooks.findIndex((book) => book.name === bookName);
  if (index < 0) return "all";
  return index < oldTestamentBookCount ? "old" : "new";
}

function testamentLabel(testament: TestamentFilter) {
  if (testament === "old") return "Old Testament";
  if (testament === "new") return "New Testament";
  return "All books";
}

function bibleVersionShortLabel(versionId: BibleVersionId) {
  if (versionId === "reformationsbibeln2026") return "RB26";
  if (versionId === "sv1917") return "1917";
  return "KJV";
}

function bibleVersionDescription(versionId: BibleVersionId) {
  if (versionId === "reformationsbibeln2026") return "Modern Swedish translation";
  if (versionId === "sv1917") return "Classic Swedish";
  return "English";
}

const productionBibleTopicApiOrigin = "https://spontaneous-jalebi-46756a.netlify.app";

function bibleTopicEndpoints(topic: string) {
  const path = `/api/bible-topic?topic=${encodeURIComponent(topic)}&v=votes`;
  return [`${productionBibleTopicApiOrigin}${path}`];
}

async function fetchBibleTopic(topic: string) {
  let lastError: unknown;

  for (const endpoint of bibleTopicEndpoints(topic)) {
    try {
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as Partial<Omit<BibleTopicResult, "references">> & { error?: string; references?: unknown };
      if (!response.ok) {
        throw new Error(data.error || `Topic request failed with ${response.status}`);
      }
      if (!Array.isArray(data.references)) {
        throw new Error("The topic response did not include Bible references.");
      }
      const references = data.references
        .map((item): BibleTopicReference | undefined => {
          if (typeof item === "string") {
            const reference = item.trim();
            return reference ? { reference, votes: 0 } : undefined;
          }
          if (!item || typeof item !== "object") return undefined;
          const candidate = item as { reference?: unknown; votes?: unknown };
          const reference = typeof candidate.reference === "string" ? candidate.reference.trim() : "";
          if (!reference) return undefined;
          return {
            reference,
            votes: typeof candidate.votes === "number" && Number.isFinite(candidate.votes) ? candidate.votes : 0,
          };
        })
        .filter((item): item is BibleTopicReference => Boolean(item))
        .sort((a, b) => b.votes - a.votes || a.reference.localeCompare(b.reference));
      return {
        count: typeof data.count === "number" ? data.count : references.length,
        references,
        sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : "",
        topic: typeof data.topic === "string" ? data.topic : topic,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not load this topic.");
}

function topicTitle(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function isChapterSwipeGesture(dx: number, dy: number) {
  return Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.8;
}

const chapterSwipeActivationDistance = 12;
const chapterSwipeActivationRatio = 1.6;
const chapterScrollIntentDistance = 6;
const chapterSwipeDistanceRatio = 0.24;
const chapterSwipeVelocity = 0.7;

function chapterSwipeBadgeLabel(position?: BiblePosition) {
  return position ? String(position.chapter) : "";
}

type ReaderPalette = {
  accent: string;
  background: string;
  buttonText: string;
  danger: string;
  dim: string;
  input: string;
  line: string;
  muted: string;
  peach: string;
  shadow: string;
  sheet: string;
  surface: string;
  text: string;
};

function readerPaletteFor(theme: BibleReaderThemeId): ReaderPalette {
  if (theme === "dark") {
    const dark = themes.dark;
    return {
      accent: dark.brand.mistBlue,
      background: dark.background.app,
      buttonText: dark.onAccent,
      danger: dark.danger,
      dim: dark.overlay.scrim,
      input: dark.background.surface,
      line: dark.border.subtle,
      muted: dark.text.secondary,
      peach: dark.semantic.reflectionSoft,
      shadow: dark.shadow.soft,
      sheet: dark.background.surface,
      surface: dark.background.elevated,
      text: dark.text.primary,
    };
  }

  if (theme === "sepia") {
    const light = themes.light;
    return {
      accent: light.text.primary,
      background: light.background.app,
      buttonText: light.onAccent,
      danger: light.danger,
      dim: light.overlay.scrim,
      input: light.background.surface,
      line: light.border.subtle,
      muted: light.text.secondary,
      peach: light.semantic.warmthSoft,
      shadow: light.shadow.soft,
      sheet: light.background.surface,
      surface: light.background.elevated,
      text: light.text.primary,
    };
  }

  const light = themes.light;
  return {
    accent: light.text.primary,
    background: light.background.app,
    buttonText: light.onAccent,
    danger: light.danger,
    dim: light.overlay.scrim,
    input: light.background.surface,
    line: light.border.subtle,
    muted: light.text.secondary,
    peach: light.semantic.reflectionSoft,
    shadow: light.shadow.soft,
    sheet: light.background.surface,
    surface: light.background.surface,
    text: light.text.primary,
  };
}

export function BibleScreen() {
  const { state, dispatch } = useKoino();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const audioPlayer = useAudioPlayer(null, { keepAudioSessionActive: true, updateInterval: 250 });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const scrollRef = useRef<ScrollView>(null);
  const audioBridgeRef = useRef<WebView>(null);
  const activeAudioRequestRef = useRef<string | undefined>(undefined);
  const audioFinishHandledRef = useRef(false);
  const audioFileRef = useRef<File | undefined>(undefined);
  const audioPrepareTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const audioServiceConnectedRef = useRef(false);
  const pendingAudioTransfersRef = useRef<Record<string, PendingAudioTransfer>>({});
  const bridgeReadyRef = useRef(false);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const pendingScrollVerseRef = useRef<number | undefined>(undefined);
  const positionRef = useRef<BiblePosition>(defaultPosition);
  const audioPositionRef = useRef<BiblePosition>(defaultPosition);
  const lastScrollCommitRef = useRef(0);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const topicRequestRef = useRef(0);
  const chapterSwipeX = useRef(new Animated.Value(0)).current;
  const chapterSwipeAnimatingRef = useRef(false);
  const chapterSwipeBlockedByScrollRef = useRef(false);
  const verseLongPressActiveRef = useRef(false);

  const [position, setPosition] = useState<BiblePosition>(defaultPosition);
  const [audioPosition, setAudioPosition] = useState<BiblePosition>(defaultPosition);
  const [highlightedPosition, setHighlightedPosition] = useState<BiblePosition | undefined>();
  const [bibleVersionId, setBibleVersionId] = useState<BibleVersionId>(defaultBibleVersionId);
  const [fontId, setFontId] = useState<BibleReaderFontId>(defaultFontId);
  const [fontSize, setFontSize] = useState(defaultFontSize);
  const [readerTheme, setReaderTheme] = useState<BibleReaderThemeId>(defaultReaderTheme);
  const [showVerseNumbers, setShowVerseNumbers] = useState(defaultShowVerseNumbers);
  const [showFootnotes, setShowFootnotes] = useState(defaultShowFootnotes);
  const [showCrossReferences, setShowCrossReferences] = useState(defaultShowCrossReferences);
  const [compactMode, setCompactMode] = useState(defaultCompactMode);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [versionPickerVisible, setVersionPickerVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [selectedVersePosition, setSelectedVersePosition] = useState<BiblePosition | undefined>();
  const [selectedVerseNumbers, setSelectedVerseNumbers] = useState<number[]>([]);
  const [reflectionText, setReflectionText] = useState("");
  const [audioError, setAudioError] = useState<string | undefined>();
  const [audioPlaybackState, setAudioPlaybackState] = useState<AudioPlaybackState>("idle");
  const [audioVoice, setAudioVoice] = useState<AudioVoice>(defaultAudioVoice);
  const [audioVoices, setAudioVoices] = useState<AudioVoice[]>(fallbackAudioVoices);
  const [authTokenInput, setAuthTokenInput] = useState("");
  const [bridgeOverlayVisible, setBridgeOverlayVisible] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [puterAuthToken, setPuterAuthToken] = useState<string | undefined>();
  const [puterTokenModalVisible, setPuterTokenModalVisible] = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const [crossReferencePosition, setCrossReferencePosition] = useState<BiblePosition | undefined>();
  const [topicsVisible, setTopicsVisible] = useState(false);
  const [topicDetailVisible, setTopicDetailVisible] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [topicResult, setTopicResult] = useState<BibleTopicResult | undefined>();
  const [topicError, setTopicError] = useState<string | undefined>();
  const [topicLoading, setTopicLoading] = useState(false);
  const [scriptureComposerVisible, setScriptureComposerVisible] = useState(false);
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

  const storageKey = useMemo(() => readerStorageKey(state.currentUserId), [state.currentUserId]);
  const puterTokenKey = useMemo(() => puterTokenStorageKey(state.currentUserId), [state.currentUserId]);
  const bibleVersion = bibleVersionFor(bibleVersionId);
  const readerPalette = useMemo(() => readerPaletteFor(readerTheme), [readerTheme]);
  const chapterVerses = useMemo(() => bibleChapterVerses(position.book, position.chapter, bibleVersionId), [bibleVersionId, position.book, position.chapter]);
  const selectedVerseRanges = useMemo(() => selectedVerseRangesFor(selectedVerseNumbers), [selectedVerseNumbers]);
  const selectedVerseReference = useMemo(() => selectedVerseReferenceLabel(position, selectedVerseRanges), [position, selectedVerseRanges]);
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
  const chapterCrossReferenceAvailability = useMemo(
    () =>
      Object.fromEntries(
        chapterVerses.map((item) => [
          item.verse,
          hasBibleCrossReferences({
            book: position.book,
            chapter: position.chapter,
            verse: item.verse,
          }),
        ]),
      ) as Record<number, boolean>,
    [chapterVerses, position.book, position.chapter],
  );
  const selectedCrossReferences = useMemo(() => (crossReferencePosition ? bibleCrossReferences(crossReferencePosition, bibleVersionId) : []), [bibleVersionId, crossReferencePosition]);
  const previousChapter = useMemo(() => previousBibleChapter(position.book, position.chapter), [position.book, position.chapter]);
  const nextChapter = useMemo(() => nextBibleChapter(position.book, position.chapter), [position.book, position.chapter]);
  const previousAudioChapter = useMemo(() => previousBibleChapter(audioPosition.book, audioPosition.chapter), [audioPosition.book, audioPosition.chapter]);
  const nextAudioChapter = useMemo(() => nextBibleChapter(audioPosition.book, audioPosition.chapter), [audioPosition.book, audioPosition.chapter]);
  const todayKey = useMemo(() => localDayKey(new Date()), []);
  const groupPlanReadings = useMemo(() => sortedBiblePlanReadings(state.groupBiblePlan), [state.groupBiblePlan]);
  const privatePlanReadings = useMemo(() => sortedBiblePlanReadings(state.privateBiblePlan), [state.privateBiblePlan]);
  const groupPlanReading = useMemo(() => todayBiblePlanReading(state.groupBiblePlan, todayKey), [state.groupBiblePlan, todayKey]);
  const privatePlanReading = useMemo(() => todayBiblePlanReading(state.privateBiblePlan, todayKey), [state.privateBiblePlan, todayKey]);
  const activeDrawerPlan = state.groupBiblePlan?.status === "active" ? state.groupBiblePlan : state.privateBiblePlan?.status === "active" ? state.privateBiblePlan : undefined;
  const activeDrawerPlanReading = state.groupBiblePlan?.status === "active" ? groupPlanReading : privatePlanReading;
  const activeDrawerPlanReadings = state.groupBiblePlan?.status === "active" ? groupPlanReadings : privatePlanReadings;
  const readerFontFamily = fontFamilyFor(fontId);
  const effectiveFontSize = compactMode ? Math.max(minFontSize, fontSize - 1) : fontSize;
  const readerLineHeight = Math.round(effectiveFontSize * (compactMode ? 1.48 : 1.62));
  const contentWidth = width >= 780 ? 720 : undefined;
  const audioIsPreparing = audioPlaybackState === "preparing";
  const audioIsPlaying = audioPlaybackState === "playing";
  const audioMiniPlayerVisible = audioPlaybackState === "playing" || audioPlaybackState === "paused";
  const selectedVerseBarVisible = selectedVerseRanges.length > 0;
  const bottomControlsBottom = Math.max(92, insets.bottom + 72);
  const audioMiniPlayerBottom = bottomControlsBottom + 72;
  const selectedVerseBarBottom = audioMiniPlayerVisible ? audioMiniPlayerBottom + 76 : bottomControlsBottom + 76;
  const defaultReaderBottomPadding = audioMiniPlayerVisible ? Math.max(254, insets.bottom + 234) : Math.max(180, insets.bottom + 160);
  const readerBottomPadding = selectedVerseBarVisible ? Math.max(defaultReaderBottomPadding, selectedVerseBarBottom + 158) : defaultReaderBottomPadding;
  const readerToastBottom = selectedVerseBarVisible
    ? selectedVerseBarBottom + 138
    : audioMiniPlayerVisible
      ? audioMiniPlayerBottom + 76
      : bottomControlsBottom + 72;
  const audioHighlightActive = audioPlaybackState === "preparing" || audioPlaybackState === "playing" || audioPlaybackState === "paused";
  const readerCanGoBack = navigation.canGoBack();
  const audioStatusLabel =
    audioPlaybackState === "preparing"
      ? bridgeOverlayVisible
        ? "Complete the voice service prompt, then playback will continue."
        : "Preparing verse audio..."
      : audioPlaybackState === "playing"
        ? `Listening to ${referenceLabel(audioPosition)}`
        : audioPlaybackState === "paused"
          ? `Paused at ${referenceLabel(audioPosition)}`
          : audioPlaybackState === "error"
            ? audioError ?? "Audio could not be prepared."
            : !puterAuthToken
              ? "Connect Puter in your browser to enable ElevenLabs audio."
            : bridgeOverlayVisible
              ? "Complete the voice service prompt, then playback will continue."
            : bridgeReady
              ? `Ready to listen from ${referenceLabel(audioPosition)}`
            : "Loading voice service...";
  const group = state.groups.find((item) => item.id === state.currentGroupId);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useEffect(() => {
    let active = true;

    void SecureStore.getItemAsync(puterTokenKey)
      .then((token) => {
        if (!active) return;
        const normalizedToken = token?.trim();
        if (normalizedToken) {
          audioServiceConnectedRef.current = true;
          setPuterAuthToken(normalizedToken);
          setAuthTokenInput(normalizedToken);
        } else {
          audioServiceConnectedRef.current = false;
          setPuterAuthToken(undefined);
          setAuthTokenInput("");
        }
      })
      .catch(() => {
        if (active) {
          audioServiceConnectedRef.current = false;
          setPuterAuthToken(undefined);
          setAuthTokenInput("");
        }
      });

    return () => {
      active = false;
    };
  }, [puterTokenKey]);

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
        audioPositionRef.current = nextPreferences.audioPosition;
        setPosition(nextPreferences.position);
        setAudioPosition(nextPreferences.audioPosition);
        setAudioVoice(normalizeStoredVoice(nextPreferences.audioVoiceId, nextPreferences.audioVoiceName));
        setBibleVersionId(nextPreferences.bibleVersionId);
        notifyBibleVersionPreferenceChanged(nextPreferences.bibleVersionId);
        setFontId(nextPreferences.fontId);
        setFontSize(nextPreferences.fontSize);
        setReaderTheme(nextPreferences.readerTheme);
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

    const timeout = setTimeout(() => {
      const payload: BibleReaderPreferences = {
        audioPosition,
        audioVoiceId: audioVoice.id,
        audioVoiceName: audioVoice.name,
        bibleVersionId,
        compactMode,
        fontId,
        fontSize,
        position,
        readerTheme,
        showCrossReferences,
        showFootnotes,
        showVerseNumbers,
      };
      void AsyncStorage.setItem(storageKey, JSON.stringify(payload));
    }, 250);

    return () => clearTimeout(timeout);
  }, [audioPosition, audioVoice.id, audioVoice.name, bibleVersionId, compactMode, fontId, fontSize, position, preferencesReady, readerTheme, showCrossReferences, showFootnotes, showVerseNumbers, storageKey]);

  useEffect(() => {
    setSelectedVerseNumbers([]);
  }, [position.book, position.chapter]);

  const tryScrollToVerse = useCallback((verse: number, animated: boolean) => {
    const offset = verseOffsetsRef.current[verse];
    if (typeof offset !== "number") return false;
    pendingScrollVerseRef.current = undefined;
    scrollRef.current?.scrollTo({ animated, y: Math.max(0, offset - 18) });
    return true;
  }, []);

  const jumpToPosition = useCallback(
    (nextPosition: Partial<BiblePosition>, shouldScroll = true, shouldHighlight = false) => {
      const normalized = normalizeBiblePosition(nextPosition);
      const current = positionRef.current;
      const sameChapter = current.book === normalized.book && current.chapter === normalized.chapter;

      if (!sameChapter) {
        verseOffsetsRef.current = {};
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

  const updateAudioPosition = useCallback((nextPosition: Partial<BiblePosition>) => {
    const normalized = normalizeBiblePosition(nextPosition);
    audioPositionRef.current = normalized;
    setAudioPosition(normalized);
    return normalized;
  }, []);

  const cleanupAudioFile = useCallback(() => {
    const file = audioFileRef.current;
    audioFileRef.current = undefined;
    if (!file?.exists) return;

    try {
      file.delete();
    } catch {
      // Cache cleanup is best-effort; playback should not fail because a temp file lingered.
    }
  }, []);

  const clearAudioPrepareTimeout = useCallback(() => {
    if (audioPrepareTimeoutRef.current) {
      clearTimeout(audioPrepareTimeoutRef.current);
      audioPrepareTimeoutRef.current = undefined;
    }
  }, []);

  const sendAudioBridgeCommand = useCallback((command: AudioBridgeCommand) => {
    audioBridgeRef.current?.postMessage(JSON.stringify(command));
  }, []);

  const stopAudioPlayback = useCallback(
    (nextState: AudioPlaybackState = "idle") => {
      activeAudioRequestRef.current = undefined;
      audioFinishHandledRef.current = true;
      clearAudioPrepareTimeout();
      pendingAudioTransfersRef.current = {};
      audioPlayer.pause();
      setBridgeOverlayVisible(false);
      setAudioPlaybackState(nextState);
    },
    [audioPlayer, clearAudioPrepareTimeout],
  );

  useEffect(() => {
    const audioActive = audioPlaybackState === "preparing" || audioPlaybackState === "playing" || audioPlaybackState === "paused";
    if (!audioActive) return;
    if (audioPosition.book === position.book && audioPosition.chapter === position.chapter) return;
    stopAudioPlayback("idle");
  }, [audioPlaybackState, audioPosition.book, audioPosition.chapter, position.book, position.chapter, stopAudioPlayback]);

  const startVerseAudio = useCallback(
    (requestedPosition?: Partial<BiblePosition>) => {
      const nextPosition = updateAudioPosition(requestedPosition ?? audioPositionRef.current);
      const activePuterToken = puterAuthToken || authTokenInput.trim();
      if (!activePuterToken) {
        setAudioPlaybackState("idle");
        setAudioError(undefined);
        setPuterTokenModalVisible(true);
        return;
      }

      if (!bridgeReadyRef.current) {
        setAudioPlaybackState("error");
        setAudioError("Voice service is still loading.");
        return;
      }

      const verse = bibleChapterVerses(nextPosition.book, nextPosition.chapter, bibleVersionId).find((item) => item.verse === nextPosition.verse);

      if (!verse) {
        setAudioPlaybackState("error");
        setAudioError("That verse could not be found.");
        return;
      }

      const requestId = `bible-audio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeAudioRequestRef.current = requestId;
      audioFinishHandledRef.current = true;
      clearAudioPrepareTimeout();
      audioPlayer.pause();
      setAudioError(undefined);
      setAudioPlaybackState("preparing");
      setBridgeOverlayVisible(false);

      sendAudioBridgeCommand({ token: activePuterToken, type: "setAuthToken" });
      sendAudioBridgeCommand({
        requestId,
        requiresGesture: false,
        text: verse.text,
        type: "synthesize",
        voiceId: audioVoice.id,
      });
    },
    [audioPlayer, audioVoice.id, authTokenInput, bibleVersionId, clearAudioPrepareTimeout, puterAuthToken, sendAudioBridgeCommand, updateAudioPosition],
  );

  const advanceAudioPlayback = useCallback(() => {
    const current = audioPositionRef.current;
    const verses = bibleChapterVerses(current.book, current.chapter, bibleVersionId);
    const verseIndex = verses.findIndex((item) => item.verse === current.verse);
    const nextVerse = verseIndex >= 0 ? verses[verseIndex + 1] : undefined;

    if (nextVerse) {
      const nextPosition = { ...current, verse: nextVerse.verse };
      updateAudioPosition(nextPosition);
      requestAnimationFrame(() => startVerseAudio(nextPosition));
      return;
    }

    const nextChapterPosition = nextBibleChapter(current.book, current.chapter);
    if (nextChapterPosition) {
      updateAudioPosition(nextChapterPosition);
      jumpToPosition(nextChapterPosition);
      setTimeout(() => startVerseAudio(nextChapterPosition), 80);
      return;
    }

    stopAudioPlayback("idle");
  }, [bibleVersionId, jumpToPosition, startVerseAudio, stopAudioPlayback, updateAudioPosition]);

  const chooseBibleVersion = useCallback(
    (nextVersionId: BibleVersionId) => {
      setBibleVersionId(nextVersionId);
      notifyBibleVersionPreferenceChanged(nextVersionId);
      if (audioPlaybackState === "playing" || audioPlaybackState === "preparing" || audioPlaybackState === "paused") {
        stopAudioPlayback("idle");
      }
    },
    [audioPlaybackState, stopAudioPlayback],
  );

  const playAudioBase64 = useCallback(
    async (requestId: string, base64: string) => {
      try {
        const file = new File(Paths.cache, `${requestId}.mp3`);
        if (file.exists) {
          file.delete();
        }
        await FileSystem.writeAsStringAsync(file.uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        cleanupAudioFile();
        audioFileRef.current = file;
        activeAudioRequestRef.current = undefined;
        audioFinishHandledRef.current = false;
        audioServiceConnectedRef.current = true;
        clearAudioPrepareTimeout();
        setBridgeOverlayVisible(false);
        audioPlayer.replace({ uri: file.uri });
        audioPlayer.play();
        setAudioPlaybackState("playing");
      } catch (error) {
        activeAudioRequestRef.current = undefined;
        clearAudioPrepareTimeout();
        setAudioPlaybackState("error");
        setAudioError(error instanceof Error ? error.message : "Audio could not be played.");
      }
    },
    [audioPlayer, cleanupAudioFile, clearAudioPrepareTimeout],
  );

  const handleAudioBridgeMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: AudioBridgeMessage | undefined;
      try {
        message = JSON.parse(event.nativeEvent.data) as AudioBridgeMessage;
      } catch {
        return;
      }

      if (message.type === "ready") {
        bridgeReadyRef.current = true;
        setBridgeReady(true);
        if (puterAuthToken) {
          sendAudioBridgeCommand({ token: puterAuthToken, type: "setAuthToken" });
        }
        sendAudioBridgeCommand({ requestId: `voices-${Date.now()}`, type: "listVoices" });
        return;
      }

      if (message.type === "voices") {
        const nextVoices = normalizeBridgeVoices(message.voices);
        setAudioVoices(nextVoices);
        setAudioVoice((current) => {
          const matchingVoice = nextVoices.find((voice) => voice.id === current.id);
          return matchingVoice ?? current;
        });
        return;
      }

      if (message.type === "error") {
        if (!message.requestId || message.requestId === activeAudioRequestRef.current) {
          activeAudioRequestRef.current = undefined;
          clearAudioPrepareTimeout();
          pendingAudioTransfersRef.current = {};
          setAudioPlaybackState("error");
          setAudioError(message.message ?? "Audio could not be prepared.");
        }
        return;
      }

      if (message.type === "interaction") {
        if (message.requestId === activeAudioRequestRef.current) {
          setBridgeOverlayVisible(true);
        }
        return;
      }

      if (message.type === "audio-start") {
        if (message.requestId !== activeAudioRequestRef.current) return;
        pendingAudioTransfersRef.current[message.requestId] = {
          chunks: new Array(message.totalChunks).fill(""),
          totalChunks: message.totalChunks,
        };
        return;
      }

      if (message.type === "audio-chunk") {
        if (message.requestId !== activeAudioRequestRef.current) return;
        const transfer = pendingAudioTransfersRef.current[message.requestId];
        if (!transfer || message.index < 0 || message.index >= transfer.totalChunks) return;
        transfer.chunks[message.index] = message.chunk;
        return;
      }

      if (message.type === "audio-end") {
        if (message.requestId !== activeAudioRequestRef.current) return;
        const transfer = pendingAudioTransfersRef.current[message.requestId];
        if (!transfer || transfer.chunks.some((chunk) => chunk.length === 0)) {
          activeAudioRequestRef.current = undefined;
          clearAudioPrepareTimeout();
          setAudioPlaybackState("error");
          setAudioError("Audio transfer was interrupted.");
          return;
        }
        delete pendingAudioTransfersRef.current[message.requestId];
        playAudioBase64(message.requestId, transfer.chunks.join(""));
        return;
      }

      if (message.type !== "audio" || message.requestId !== activeAudioRequestRef.current) return;
      playAudioBase64(message.requestId, message.base64);
    },
    [clearAudioPrepareTimeout, playAudioBase64, puterAuthToken, sendAudioBridgeCommand],
  );

  useEffect(() => {
    if (!bridgeReady || !puterAuthToken) return;
    sendAudioBridgeCommand({ token: puterAuthToken, type: "setAuthToken" });
  }, [bridgeReady, puterAuthToken, sendAudioBridgeCommand]);

  const handleAudioToggle = useCallback(() => {
    if (audioPlaybackState === "preparing") {
      stopAudioPlayback("idle");
      return;
    }

    if (audioPlaybackState === "playing") {
      activeAudioRequestRef.current = undefined;
      audioPlayer.pause();
      setAudioPlaybackState("paused");
      return;
    }

    if (audioPlaybackState === "paused" && audioStatus.isLoaded) {
      audioFinishHandledRef.current = false;
      audioPlayer.play();
      setAudioPlaybackState("playing");
      return;
    }

    startVerseAudio(positionRef.current);
  }, [audioPlaybackState, audioPlayer, audioStatus.isLoaded, startVerseAudio, stopAudioPlayback]);

  const handleAudioChapterJump = useCallback(
    (nextPosition: BiblePosition) => {
      const shouldResume = audioPlaybackState === "playing" || audioPlaybackState === "preparing";
      stopAudioPlayback(shouldResume ? "preparing" : "idle");
      updateAudioPosition(nextPosition);
      jumpToPosition(nextPosition);
      if (shouldResume) {
        setTimeout(() => startVerseAudio(nextPosition), 80);
      }
    },
    [audioPlaybackState, jumpToPosition, startVerseAudio, stopAudioPlayback, updateAudioPosition],
  );

  const chooseAudioVoice = useCallback(
    (voice: AudioVoice) => {
      setAudioVoice(voice);
      setVoicePickerVisible(false);
      if (audioPlaybackState === "playing" || audioPlaybackState === "preparing") {
        stopAudioPlayback("idle");
      }
    },
    [audioPlaybackState, stopAudioPlayback],
  );

  const openPuterDashboard = useCallback(async () => {
    await openLinkInApp(puterDashboardUrl);
  }, []);

  const savePuterAuthToken = useCallback(async () => {
    const token = authTokenInput.trim();
    if (!token) {
      setAudioError("Paste your Puter auth token first.");
      return;
    }

    await SecureStore.setItemAsync(puterTokenKey, token);
    setPuterAuthToken(token);
    setPuterTokenModalVisible(false);
    setAudioError(undefined);
    audioServiceConnectedRef.current = true;
    if (bridgeReadyRef.current) {
      sendAudioBridgeCommand({ token, type: "setAuthToken" });
    }
    startVerseAudio(audioPositionRef.current);
  }, [authTokenInput, puterTokenKey, sendAudioBridgeCommand, startVerseAudio]);

  const forgetPuterAuthToken = useCallback(async () => {
    await SecureStore.deleteItemAsync(puterTokenKey);
    setPuterAuthToken(undefined);
    setAuthTokenInput("");
    audioServiceConnectedRef.current = false;
    sendAudioBridgeCommand({ token: "", type: "setAuthToken" });
    stopAudioPlayback("idle");
  }, [puterTokenKey, sendAudioBridgeCommand, stopAudioPlayback]);

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

      const current = positionRef.current;
      if (!visibleVerse || visibleVerse === current.verse) return;

      lastScrollCommitRef.current = now;
      const nextPosition = { ...current, verse: visibleVerse };
      positionRef.current = nextPosition;
      setPosition(nextPosition);
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
    setSelectedVersePosition(undefined);
    setSelectedVerseNumbers((current) => {
      if (current.includes(verse)) {
        return current.filter((item) => item !== verse);
      }

      return [...current, verse].sort((a, b) => a - b);
    });
  }, []);

  const handleVerseLongPress = useCallback((verse: number) => {
    verseLongPressActiveRef.current = true;
    const nextPosition = normalizeBiblePosition({ book: positionRef.current.book, chapter: positionRef.current.chapter, verse });
    positionRef.current = nextPosition;
    setPosition(nextPosition);
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

    const selectedVerses = selectedVerseRanges
      .map((range) => buildBibleVerse(position.book, position.chapter, range.start, range.end, bibleVersionId))
      .filter((verse): verse is BibleVerse => Boolean(verse));

    if (selectedVerses.length === 0) {
      setReaderToast({ detail: "Try selecting the verses again.", message: "Could not save selection", tone: "error" });
      return;
    }

    const unsavedVerses = selectedVerses.filter((selectedVerse) => !state.savedVerses.some((verse) => savedVerseIdentity(verse) === savedVerseIdentity(selectedVerse)));

    if (unsavedVerses.length === 0) {
      setReaderToast({ detail: "Every selected reference is already saved.", message: "Selection already saved", tone: "error" });
      return;
    }

    setSelectionSaving(true);
    try {
      await Promise.all(unsavedVerses.map((verse) => dispatch({ type: "saveVerse", verse })));
      setSelectedVerseNumbers([]);
      setReaderToast({
        detail: unsavedVerses.length === 1 ? "You can find it under saved verses." : "You can find them under saved verses.",
        message: unsavedVerses.length === 1 ? "Selection saved" : `${unsavedVerses.length} selections saved`,
        tone: "success",
      });
    } finally {
      setSelectionSaving(false);
    }
  }, [bibleVersionId, dispatch, position.book, position.chapter, selectedVerseRanges, selectionSaving, state.savedVerses]);

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

  const openScriptureComposer = useCallback((context: "journal" | "room", kind: EntryKind, verse: BibleVerse, body = "") => {
    setScriptureComposerContext(context);
    setScriptureComposerKind(kind);
    setScriptureComposerVisibility(context === "room" ? visibility.room : visibility.private);
    setScriptureComposerTitle(verse.reference);
    setScriptureComposerBody(body);
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
      const savedAlready = state.savedVerses.some((verse) => savedVerseIdentity(verse) === savedVerseIdentity(selectedVerse));
      if (savedAlready) {
        setReaderToast({ message: "Verse already saved", tone: "error" });
        return;
      }
      void dispatch({ type: "saveVerse", verse: selectedVerse }).then(() => {
        setReaderToast({ message: "Saved to your verses", tone: "success" });
      });
      return;
    }
    if (action === "copy") {
      void Clipboard.setStringAsync(`${selectedVerse.text}\n${selectedVerse.reference} (${selectedVerse.translation ?? bibleVersion.translation})`).then(() => {
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
  }, [bibleVersion.translation, dispatch, selectedVersePosition, state.bibleHighlightColors, state.savedVerses, verseForPosition]);

  const handleVerseActionSheetClosed = useCallback(() => {
    if (!pendingVerseComposerAction) return;
    const { action, verse } = pendingVerseComposerAction;
    setPendingVerseComposerAction(undefined);

    if (action === "journal") {
      openScriptureComposer("journal", "scripture", verse);
    }
    if (action === "share") {
      openScriptureComposer("room", "scripture", verse, "A Scripture for today.");
    }
    if (action === "pray") {
      openScriptureComposer("journal", "prayer_request", verse, "Praying with this Scripture.");
    }
  }, [openScriptureComposer, pendingVerseComposerAction]);

  async function submitScriptureComposer() {
    if (!scriptureComposerBody.trim()) return;
    const verse = scriptureComposerVerses[0];
    if (scriptureComposerVisibility === visibility.room) {
      await dispatch({
        type: "createPost",
        body: scriptureComposerBody,
        kind: scriptureComposerKind,
        title: scriptureComposerTitle,
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
    if (!audioStatus.didJustFinish || audioPlaybackState !== "playing" || audioFinishHandledRef.current) return;
    audioFinishHandledRef.current = true;
    advanceAudioPlayback();
  }, [advanceAudioPlayback, audioPlaybackState, audioStatus.didJustFinish]);

  useEffect(() => {
    return () => {
      activeAudioRequestRef.current = undefined;
      pendingAudioTransfersRef.current = {};
      clearAudioPrepareTimeout();
      audioPlayer.pause();
      cleanupAudioFile();
    };
  }, [audioPlayer, cleanupAudioFile, clearAudioPrepareTimeout]);

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

    void fetchBibleTopic(nextTopic)
      .then((result) => {
        if (topicRequestRef.current !== requestId) return;
        setTopicResult(result);
      })
      .catch((error: unknown) => {
        if (topicRequestRef.current !== requestId) return;
        setTopicError(error instanceof Error ? error.message : "Could not load this topic.");
      })
      .finally(() => {
        if (topicRequestRef.current === requestId) {
          setTopicLoading(false);
        }
      });
  }, []);

  function closeTopics() {
    topicRequestRef.current += 1;
    setTopicsVisible(false);
    setTopicDetailVisible(false);
    setTopicLoading(false);
  }

  function changeFontSize(delta: number) {
    setFontSize((current) => normalizeFontSize(current + delta));
  }

  const readerTextStyle: TextStyle = {
    color: readerPalette.text,
    fontFamily: readerFontFamily,
    fontSize: effectiveFontSize,
    fontWeight: "400",
    lineHeight: readerLineHeight,
  };

  return (
    <View style={{ backgroundColor: readerPalette.background, flex: 1 }}>
      <BibleReaderHeader
        audioActive={audioIsPlaying || audioIsPreparing}
        audioDisabled={false}
        canGoBack={readerCanGoBack}
        onAudioPress={handleAudioToggle}
        onBack={handleReaderBack}
        onOpenPicker={() => setPickerVisible(true)}
        onOpenSettings={() => setSettingsVisible(true)}
        onOpenTopics={() => setTopicsVisible(true)}
        onOpenVersionPicker={() => setVersionPickerVisible(true)}
        palette={readerPalette}
        title={chapterLabel(position)}
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
            <BibleText
              audioHighlightActive={audioHighlightActive}
              audioPosition={audioPosition}
              chapterHighlightByVerse={chapterHighlightByVerse}
              compactMode={compactMode}
              crossReferenceAvailability={chapterCrossReferenceAvailability}
              highlightedPosition={highlightedPosition}
              onVersePress={handleVersePress}
              onVersePressIn={handleVersePressIn}
              onVerseLayout={handleVerseLayout}
              onVerseLongPress={handleVerseLongPress}
              palette={readerPalette}
              position={position}
              readerLineHeight={readerLineHeight}
              readerTextStyle={readerTextStyle}
              selectedVerseNumbers={selectedVerseNumbers}
              selectedVersePosition={selectedVersePosition}
              showCrossReferences={showCrossReferences}
              showVerseNumbers={showVerseNumbers}
              verses={chapterVerses}
            />
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

      {audioMiniPlayerVisible ? (
        <CompactAudioPlayer
          bottom={audioMiniPlayerBottom}
          disabled={false}
          isActive={audioIsPlaying}
          label={`${chapterLabel(audioPosition)} · ${audioVoice.name}`}
          maxWidth={contentWidth}
          onToggle={handleAudioToggle}
          onVoicePress={() => setVoicePickerVisible(true)}
          palette={readerPalette}
          statusLabel={audioStatusLabel}
        />
      ) : null}

      <BibleBottomReadingControls
        audioActive={audioIsPlaying}
        audioPreparing={audioIsPreparing}
        bottom={bottomControlsBottom}
        maxWidth={contentWidth}
        nextChapter={nextChapter}
        onListen={handleAudioToggle}
        onNext={() => nextChapter && jumpToPosition(nextChapter)}
        onPrevious={() => previousChapter && jumpToPosition(previousChapter)}
        palette={readerPalette}
        previousChapter={previousChapter}
      />

      {selectedVerseBarVisible ? (
        <SelectedVerseSuggestionBar
          bottom={selectedVerseBarBottom}
          canDeleteHighlight={selectedHighlightIds.length > 0}
          highlightColors={state.bibleHighlightColors}
          maxWidth={contentWidth}
          onClear={() => setSelectedVerseNumbers([])}
          onDeleteHighlight={handleDeleteSelectedHighlights}
          onHighlight={handleHighlightWithPaletteColor}
          onManageColors={() => setHighlightColorManagerVisible(true)}
          onSave={handleSaveSelectedVerses}
          palette={readerPalette}
          reference={selectedVerseReference}
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
        onAction={handleVerseAction}
        bibleVersionId={bibleVersionId}
        onClose={() => setSelectedVersePosition(undefined)}
        onClosed={handleVerseActionSheetClosed}
        onReadChapter={readCrossReferenceChapter}
        palette={readerPalette}
        position={selectedVersePosition}
        readerTextStyle={readerTextStyle}
        visible={Boolean(selectedVersePosition)}
      />
      <ReadingSettingsSheet
        compactMode={compactMode}
        fontId={fontId}
        fontSize={fontSize}
        onChangeFont={setFontId}
        onChangeReaderTheme={setReaderTheme}
        onChangeShowCrossReferences={setShowCrossReferences}
        onChangeShowFootnotes={setShowFootnotes}
        onChangeShowVerseNumbers={setShowVerseNumbers}
        onClose={() => setSettingsVisible(false)}
        onCompactModeChange={setCompactMode}
        onFontSizeChange={changeFontSize}
        palette={readerPalette}
        readerTheme={readerTheme}
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
      <BibleDrawer
        activePlanDetail={
          activeDrawerPlanReading
            ? `${activeDrawerPlanReading.passage.reference} - ${biblePlanDayLabel(activeDrawerPlanReading, activeDrawerPlanReadings.length)}`
            : undefined
        }
        activePlanTitle={activeDrawerPlan?.title}
        highlights={state.bibleHighlights}
        initialPosition={position}
        journalEntries={state.journalEntries.filter((entry) => entry.userId === state.currentUserId)}
        onClose={() => setPickerVisible(false)}
        onOpenJournal={() => {
          setPickerVisible(false);
          router.push("/(tabs)/me" as never);
        }}
        onOpenToday={() => {
          setPickerVisible(false);
          router.push("/(tabs)" as never);
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
        palette={readerPalette}
        references={topicResult?.references ?? []}
        topic={selectedTopic}
        visible={topicsVisible}
      />
      <SharedComposer
        visible={scriptureComposerVisible}
        context={scriptureComposerContext}
        kind={scriptureComposerKind}
        entryVisibility={scriptureComposerVisibility}
        title={scriptureComposerTitle}
        body={scriptureComposerBody}
        verses={scriptureComposerVerses}
        onKind={setScriptureComposerKind}
        onVisibility={setScriptureComposerVisibility}
        onTitle={setScriptureComposerTitle}
        onBody={setScriptureComposerBody}
        onVerses={setScriptureComposerVerses}
        onClose={() => setScriptureComposerVisible(false)}
        onSubmit={submitScriptureComposer}
        roomName={group?.name}
        roomImage={group?.image}
      />
      <AudioVoicePicker
        onClose={() => setVoicePickerVisible(false)}
        onSelect={chooseAudioVoice}
        selectedVoiceId={audioVoice.id}
        visible={voicePickerVisible}
        voices={audioVoices}
      />
      <PuterTokenModal
        authTokenInput={authTokenInput}
        hasStoredToken={Boolean(puterAuthToken)}
        onChangeAuthToken={setAuthTokenInput}
        onClose={() => setPuterTokenModalVisible(false)}
        onForget={forgetPuterAuthToken}
        onOpenDashboard={openPuterDashboard}
        onSave={savePuterAuthToken}
        visible={puterTokenModalVisible}
      />
      <PuterAudioBridge
        ref={audioBridgeRef}
        onClose={() => setBridgeOverlayVisible(false)}
        onMessage={handleAudioBridgeMessage}
        visible={bridgeOverlayVisible}
      />
    </View>
  );
}

function ReaderCircleButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
  palette,
  text,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon?: FeatherName;
  onPress: () => void;
  palette: ReaderPalette;
  text?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 42,
        justifyContent: "center",
        opacity: disabled ? 0.48 : 1,
        width: 42,
      }}
    >
      {icon ? <Feather name={icon} size={18} color={palette.accent} /> : null}
      {text ? <Text style={{ color: palette.accent, fontSize: 15, fontWeight: "800" }}>{text}</Text> : null}
    </Pressable>
  );
}

function BibleReaderHeader({
  audioActive,
  audioDisabled,
  canGoBack,
  onAudioPress,
  onBack,
  onOpenPicker,
  onOpenSettings,
  onOpenTopics,
  onOpenVersionPicker,
  palette,
  title,
  translationLabel,
  topInset,
}: {
  audioActive: boolean;
  audioDisabled: boolean;
  canGoBack: boolean;
  onAudioPress: () => void;
  onBack: () => void;
  onOpenPicker: () => void;
  onOpenSettings: () => void;
  onOpenTopics: () => void;
  onOpenVersionPicker: () => void;
  palette: ReaderPalette;
  title: string;
  translationLabel: string;
  topInset: number;
}) {
  return (
    <View
      style={{
        backgroundColor: palette.background,
        paddingBottom: 10,
        paddingHorizontal: 18,
        paddingTop: topInset + 10,
        position: "relative",
        zIndex: 20,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 52 }}>
        {canGoBack ? <ReaderCircleButton accessibilityLabel="Go back" icon="arrow-left" onPress={onBack} palette={palette} /> : null}

        <Pressable
          accessibilityLabel="Choose Bible chapter"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onOpenPicker}
          style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: 4, minWidth: 0, paddingHorizontal: 4 }}
        >
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>
            {title}
          </Text>
          <Feather name="chevron-down" size={14} color={palette.muted} />
        </Pressable>

        <Pressable
          accessibilityLabel="Choose Bible translation"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenVersionPicker}
          style={{
            alignItems: "center",
            backgroundColor: palette.surface,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            flexDirection: "row",
            gap: 4,
            height: 38,
            maxWidth: 82,
            paddingHorizontal: 8,
          }}
        >
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 12, fontWeight: "900" }}>
            {translationLabel}
          </Text>
          <Feather name="chevron-down" size={13} color={palette.muted} />
        </Pressable>

        <View style={{ flexDirection: "row", gap: 6 }}>
          <ReaderCircleButton accessibilityLabel="Search Scripture" icon="search" onPress={onOpenTopics} palette={palette} />
          <ReaderCircleButton
            accessibilityLabel={audioActive ? "Pause audio Bible" : "Play audio Bible"}
            disabled={audioDisabled}
            icon="volume-2"
            onPress={onAudioPress}
            palette={palette}
          />
          <ReaderCircleButton accessibilityLabel="Open reading settings" onPress={onOpenSettings} palette={palette} text="Aa" />
        </View>
      </View>
    </View>
  );
}

function BibleTopicsModal({
  bibleVersionId,
  bibleVersionLabel,
  detailVisible,
  error,
  loading,
  onBack,
  onClose,
  onSelectTopic,
  palette,
  references,
  topic,
  visible,
}: {
  bibleVersionId: BibleVersionId;
  bibleVersionLabel: string;
  detailVisible: boolean;
  error?: string;
  loading: boolean;
  onBack: () => void;
  onClose: () => void;
  onSelectTopic: (topic: string) => void;
  palette: ReaderPalette;
  references: BibleTopicReference[];
  topic: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const slideX = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      slideX.setValue(0);
    }
  }, [slideX, visible]);

  useEffect(() => {
    if (!visible) return;
    Animated.timing(slideX, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: detailVisible ? -width : 0,
      useNativeDriver: true,
    }).start();
  }, [detailVisible, slideX, visible, width]);

  function submitSearch() {
    const topic = query.trim();
    if (topic) {
      onSelectTopic(topic);
    }
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={detailVisible ? onBack : onClose}>
      <View style={{ backgroundColor: palette.background, flex: 1, overflow: "hidden" }}>
        <Animated.View
          style={{
            flex: 1,
            flexDirection: "row",
            transform: [{ translateX: slideX }],
            width: width * 2,
          }}
        >
          <View style={{ backgroundColor: palette.background, flex: 1, width }}>
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            alignItems: "center",
            gap: 22,
            paddingBottom: Math.max(30, insets.bottom + 24),
            paddingHorizontal: 20,
            paddingTop: insets.top + 14,
          }}
        >
          <View style={{ alignItems: "center", maxWidth: 430, minHeight: 56, width: "100%" }}>
            <View style={{ position: "absolute", right: 0, top: 0 }}>
              <ReaderCircleButton accessibilityLabel="Close Bible topics" icon="x" onPress={onClose} palette={palette} />
            </View>
          </View>

          <View style={{ alignItems: "center", gap: 8, maxWidth: 430, width: "100%" }}>
            <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>Explore Scripture by topic</Text>
            <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19, maxWidth: 240, textAlign: "center" }}>
              Find verses for what you are walking through.
            </Text>
          </View>

          <View
            style={{
              alignItems: "center",
              backgroundColor: palette.surface,
              borderColor: palette.line,
              borderCurve: "continuous",
              borderRadius: radius.lg,
              borderWidth: 1,
              flexDirection: "row",
              gap: 10,
              maxWidth: 430,
              minHeight: 50,
              paddingHorizontal: 14,
              width: "100%",
              ...platformShadow({
                boxShadow: "0 8px 20px rgba(11, 18, 32, 0.045)",
                color: palette.shadow,
                offset: { width: 0, height: 8 },
                opacity: 0.045,
                radius: 18,
              }),
            }}
          >
            <Feather name="search" size={16} color={palette.muted} />
            <TextInput
              autoCapitalize="words"
              autoCorrect
              onChangeText={setQuery}
              onSubmitEditing={submitSearch}
              placeholder="Search topics..."
              placeholderTextColor={palette.muted}
              returnKeyType="search"
              style={{ color: palette.text, flex: 1, fontSize: 14, fontWeight: "700", minHeight: 48, paddingVertical: 0 }}
              value={query}
            />
          </View>

          <View style={{ gap: 10, maxWidth: 430, width: "100%" }}>
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>Suggested topics</Text>
            <View
              style={{
                backgroundColor: palette.surface,
                borderColor: palette.line,
                borderRadius: radius.lg,
                borderWidth: 1,
                overflow: "hidden",
                ...platformShadow({
                  boxShadow: "0 10px 24px rgba(11, 18, 32, 0.055)",
                  color: palette.shadow,
                  offset: { width: 0, height: 10 },
                  opacity: 0.055,
                  radius: 24,
                }),
              }}
            >
              {suggestedTopics.map((topic, index) => (
                <SuggestedTopicRow
                  key={topic.title}
                  onPress={() => onSelectTopic(topic.title)}
                  palette={palette}
                  showDivider={index < suggestedTopics.length - 1}
                  topic={topic}
                />
              ))}
            </View>
          </View>
        </ScrollView>
          </View>
          <View style={{ backgroundColor: palette.background, flex: 1, width }}>
            <BibleTopicDetailPane
              bibleVersionId={bibleVersionId}
              bibleVersionLabel={bibleVersionLabel}
              error={error}
              loading={loading}
              onBack={onBack}
              onClose={onClose}
              palette={palette}
              references={references}
              topic={topic}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SuggestedTopicRow({
  onPress,
  palette,
  showDivider,
  topic,
}: {
  onPress: () => void;
  palette: ReaderPalette;
  showDivider: boolean;
  topic: SuggestedTopic;
}) {
  const tone = {
    blue: { background: "#E7EEF7", color: "#365778" },
    green: { background: "#E7F1DD", color: "#58712D" },
    peach: { background: "#FFF0E5", color: "#A45118" },
    rose: { background: "#FCEDE8", color: "#B35A48" },
  }[topic.tone];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderBottomColor: showDivider ? palette.line : "transparent",
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 68,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: tone.background,
          borderRadius: 999,
          height: 38,
          justifyContent: "center",
          width: 38,
        }}
      >
        <Feather name={topic.icon} size={17} color={tone.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>
          {topic.title}
        </Text>
        <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>
          {topic.subtitle}
        </Text>
      </View>
      <Feather name="chevron-right" size={17} color={palette.muted} />
    </Pressable>
  );
}

function BibleTopicDetailPane({
  bibleVersionId,
  bibleVersionLabel,
  error,
  loading,
  onBack,
  onClose,
  palette,
  references,
  topic,
}: {
  bibleVersionId: BibleVersionId;
  bibleVersionLabel: string;
  error?: string;
  loading: boolean;
  onBack: () => void;
  onClose: () => void;
  palette: ReaderPalette;
  references: BibleTopicReference[];
  topic: string;
}) {
  const insets = useSafeAreaInsets();
  const resolvedVerses = useMemo(
    () =>
      references.map((item) => ({
        reference: item.reference,
        verse: bibleVerseFromReference(item.reference, bibleVersionId),
        votes: item.votes,
      })),
    [bibleVersionId, references],
  );
  const title = topicTitle(topic || "Topic");

  return (
    <View style={{ backgroundColor: palette.background, flex: 1 }}>
        <View
          style={{
            alignItems: "center",
            borderBottomColor: palette.line,
            borderBottomWidth: 1,
            flexDirection: "row",
            gap: 12,
            paddingBottom: 14,
            paddingHorizontal: 18,
            paddingTop: insets.top + 12,
          }}
        >
          <ReaderCircleButton accessibilityLabel="Back to Bible topics" icon="arrow-left" onPress={onBack} palette={palette} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>
              {title}
            </Text>
            <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>
              {loading ? "Searching OpenBible..." : `${references.length} references - ${bibleVersionLabel}`}
            </Text>
          </View>
          <ReaderCircleButton accessibilityLabel="Close Bible topics" icon="x" onPress={onClose} palette={palette} />
        </View>

        <ScrollView
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            alignSelf: "center",
            gap: 12,
            maxWidth: 720,
            paddingBottom: Math.max(32, insets.bottom + 24),
            paddingHorizontal: 18,
            paddingTop: 18,
            width: "100%",
          }}
        >
          {loading ? (
            <View
              style={{
                alignItems: "center",
                backgroundColor: palette.surface,
                borderColor: palette.line,
                borderRadius: radius.lg,
                borderWidth: 1,
                gap: 12,
                padding: 22,
              }}
            >
              <ActivityIndicator color={palette.accent} />
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "800" }}>Searching for {title.toLowerCase()} verses...</Text>
            </View>
          ) : error ? (
            <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, gap: 8, padding: 16 }}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>Could not load this topic</Text>
              <Text selectable style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>
                {error}
              </Text>
            </View>
          ) : resolvedVerses.length > 0 ? (
            resolvedVerses.map((item, index) => <TopicVerseCard key={`${item.reference}-${index}`} bibleVersionLabel={bibleVersionLabel} item={item} palette={palette} />)
          ) : (
            <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 16 }}>
              <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "800", lineHeight: 20 }}>No Bible references were found for this topic.</Text>
            </View>
          )}
        </ScrollView>
    </View>
  );
}

function TopicVerseCard({
  bibleVersionLabel,
  item,
  palette,
}: {
  bibleVersionLabel: string;
  item: { reference: string; verse?: BibleVerse; votes: number };
  palette: ReaderPalette;
}) {
  const voteLabel = `${item.votes.toLocaleString()} ${item.votes === 1 ? "vote" : "votes"}`;

  return (
    <View
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        gap: 9,
        padding: 15,
        ...platformShadow({
          boxShadow: "0 8px 20px rgba(11, 18, 32, 0.045)",
          color: palette.shadow,
          offset: { width: 0, height: 8 },
          opacity: 0.045,
          radius: 18,
        }),
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <View style={{ alignItems: "center", backgroundColor: palette.peach, borderRadius: 999, height: 28, justifyContent: "center", width: 28 }}>
          <Feather name="book-open" size={14} color={palette.accent} />
        </View>
        <Text selectable style={{ color: palette.text, flex: 1, fontSize: 16, fontWeight: "900" }}>
          {item.reference}
        </Text>
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette.peach,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            justifyContent: "center",
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
        >
          <Text style={{ color: palette.accent, fontSize: 11, fontWeight: "900" }}>{voteLabel}</Text>
        </View>
      </View>
      {item.verse ? (
        <>
          <Text selectable style={{ color: palette.text, fontSize: 16, fontWeight: "500", lineHeight: 25 }}>
            {item.verse.text}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{item.verse.translation ?? bibleVersionLabel}</Text>
        </>
      ) : (
        <Text selectable style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>
          This reference is not available in {bibleVersionLabel} yet.
        </Text>
      )}
    </View>
  );
}

function BibleText({
  audioHighlightActive,
  audioPosition,
  chapterHighlightByVerse,
  compactMode,
  highlightedPosition,
  onVersePress,
  onVersePressIn,
  onVerseLayout,
  onVerseLongPress,
  palette,
  position,
  readerLineHeight,
  readerTextStyle,
  selectedVerseNumbers,
  selectedVersePosition,
  showVerseNumbers,
  verses,
}: {
  audioHighlightActive: boolean;
  audioPosition: BiblePosition;
  chapterHighlightByVerse: Record<number, BibleHighlightColor>;
  compactMode: boolean;
  crossReferenceAvailability: Record<number, boolean>;
  highlightedPosition?: BiblePosition;
  onVersePress: (verse: number) => void;
  onVersePressIn: () => void;
  onVerseLayout: (verse: number, offset: number) => void;
  onVerseLongPress: (verse: number) => void;
  palette: ReaderPalette;
  position: BiblePosition;
  readerLineHeight: number;
  readerTextStyle: TextStyle;
  selectedVerseNumbers: number[];
  selectedVersePosition?: BiblePosition;
  showCrossReferences: boolean;
  showVerseNumbers: boolean;
  verses: BibleChapterVerse[];
}) {
  const verseFontSize = Math.max(10, Number(readerTextStyle.fontSize ?? defaultFontSize) * 0.7);
  const verseNumberStyle: TextStyle = {
    color: palette.accent,
    fontFamily: readerTextStyle.fontFamily,
    fontSize: verseFontSize,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    lineHeight: readerLineHeight,
    marginTop: -verseFontSize * 0.55,
  };
  const selectedTextStyle: TextStyle & { textUnderlineOffset?: number } = {
    textDecorationColor: palette.accent,
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textUnderlineOffset: 3,
  };

  return (
    <View style={{ gap: compactMode ? 4 : 7 }}>
      {verses.map((item, index) => {
        const highlighted =
          highlightedPosition?.book === position.book &&
          highlightedPosition.chapter === position.chapter &&
          highlightedPosition.verse === item.verse;
        const audioHighlighted =
          audioHighlightActive &&
          audioPosition.book === position.book &&
          audioPosition.chapter === position.chapter &&
          audioPosition.verse === item.verse;
        const actionSelected =
          selectedVersePosition?.book === position.book &&
          selectedVersePosition.chapter === position.chapter &&
          selectedVersePosition.verse === item.verse;
        const persistedHighlightColor = chapterHighlightByVerse[item.verse];
        const surfaceSelected = highlighted || audioHighlighted || actionSelected;
        const tapSelected = selectedVerseNumbers.includes(item.verse);
        const selected = surfaceSelected || tapSelected || Boolean(persistedHighlightColor);
        const verseTextStyle = [persistedHighlightColor ? { backgroundColor: persistedHighlightColor } : undefined, tapSelected ? selectedTextStyle : undefined];
        const isFirstVerse = index === 0;
        return (
          <Pressable
            accessibilityLabel={`${position.book} ${position.chapter}:${item.verse}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={item.reference}
            delayLongPress={1000}
            onLayout={(event) => onVerseLayout(item.verse, event.nativeEvent.layout.y)}
            onLongPress={() => onVerseLongPress(item.verse)}
            onPress={() => onVersePress(item.verse)}
            onPressIn={onVersePressIn}
            style={{
              backgroundColor: surfaceSelected ? palette.peach : "transparent",
              borderColor: surfaceSelected ? palette.line : "transparent",
              borderRadius: radius.md,
              borderWidth: 1,
              paddingHorizontal: surfaceSelected ? 10 : 0,
              paddingVertical: compactMode ? 5 : 8,
            }}
          >
            {isFirstVerse ? (
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
                <Text
                  style={{
                    color: palette.accent,
                    fontFamily: fontFamilyFor("classic"),
                    fontSize: 44,
                    fontWeight: "500",
                    lineHeight: 50,
                    minWidth: 28,
                  }}
                >
                  {position.chapter}
                </Text>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
                  {showVerseNumbers ? <Text style={verseNumberStyle}>{item.verse} </Text> : null}
                  <Text style={[readerTextStyle, { flex: 1 }]}><Text style={verseTextStyle}>{item.text}</Text></Text>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                {showVerseNumbers ? <Text style={verseNumberStyle}>{item.verse} </Text> : null}
                <Text style={[readerTextStyle, { flex: 1 }]}><Text style={verseTextStyle}>{item.text}</Text></Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function ChapterSwipeIndicator({
  direction,
  nextChapter,
  palette,
  previousChapter,
  progress,
}: {
  direction: ChapterSwipeDirection;
  nextChapter?: BiblePosition;
  palette: ReaderPalette;
  previousChapter?: BiblePosition;
  progress: Animated.Value;
}) {
  const target = direction === "next" ? nextChapter : direction === "previous" ? previousChapter : undefined;
  if (!target || direction === "idle") return null;

  const isNext = direction === "next";
  const opacity = progress.interpolate({
    inputRange: isNext ? [-84, -24, 0] : [0, 24, 84],
    outputRange: isNext ? [1, 0.72, 0] : [0, 0.72, 1],
    extrapolate: "clamp",
  });
  const nudge = progress.interpolate({
    inputRange: isNext ? [-120, 0] : [0, 120],
    outputRange: isNext ? [0, 12] : [-12, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        opacity,
        position: "absolute",
        top: "47%",
        transform: [{ translateX: nudge }],
        ...(isNext ? { right: 22 } : { left: 22 }),
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.sheet,
          borderColor: palette.line,
          borderRadius: radius.md,
          borderWidth: 1,
          height: 54,
          justifyContent: "center",
          width: 54,
          ...platformShadow({
            boxShadow: "0 10px 24px rgba(11, 18, 32, 0.14)",
            color: palette.shadow,
            offset: { width: 0, height: 8 },
            opacity: 0.13,
            radius: 18,
          }),
        }}
      >
        <Text style={{ color: palette.muted, fontSize: 20, fontVariant: ["tabular-nums"], fontWeight: "900" }}>{chapterSwipeBadgeLabel(target)}</Text>
      </View>
    </Animated.View>
  );
}

function SelectedVerseSuggestionBar({
  bottom,
  canDeleteHighlight,
  highlightColors,
  maxWidth,
  onClear,
  onDeleteHighlight,
  onHighlight,
  onManageColors,
  onSave,
  palette,
  reference,
  saving,
  verseCount,
}: {
  bottom: number;
  canDeleteHighlight: boolean;
  highlightColors: BibleHighlightPaletteColor[];
  maxWidth?: number;
  onClear: () => void;
  onDeleteHighlight: () => void;
  onHighlight: (color: BibleHighlightPaletteColor) => void;
  onManageColors: () => void;
  onSave: () => void;
  palette: ReaderPalette;
  reference: string;
  saving: boolean;
  verseCount: number;
}) {
  return (
    <View pointerEvents="box-none" style={{ alignItems: "center", bottom, left: 0, paddingHorizontal: 18, position: "absolute", right: 0, zIndex: 30 }}>
      <View
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
              {verseCount} {verseCount === 1 ? "verse" : "verses"} selected
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Clear selected verses"
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
            accessibilityLabel={`Save selected verses ${reference}`}
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
              {saving ? "Saving..." : "Save selection"}
            </Text>
          </Pressable>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", minHeight: 38 }}>
          <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>Highlight:</Text>
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
            accessibilityLabel="Manage highlight colors"
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
              accessibilityLabel={`Delete highlight ${reference}`}
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

function HighlightColorManagerSheet({
  colors: highlightColors,
  onClose,
  onDelete,
  onSave,
  palette,
  visible,
}: {
  colors: BibleHighlightPaletteColor[];
  onClose: () => void;
  onDelete: (color: BibleHighlightPaletteColor) => Promise<void>;
  onSave: (color: { hex: BibleHighlightColor; id?: string; label?: string }) => Promise<void>;
  palette: ReaderPalette;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(height * 0.78), 680);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const [editingColor, setEditingColor] = useState<BibleHighlightPaletteColor | undefined>();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [draftHex, setDraftHex] = useState("#FFF200");
  const [draftLabel, setDraftLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setEditingColor(undefined);
      setPickerVisible(false);
      setDraftHex(colorWheelColors[4]);
      setDraftLabel("");
    }
  }, [visible]);

  const normalizedDraftHex = normalizeHexColor(draftHex);
  const draftValid = isHexColor(draftHex);

  const closeWithAnimation = useCallback(() => {
    Animated.timing(translateY, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
      toValue: sheetHeight,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [onClose, sheetHeight, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 5,
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 90 || gesture.vy > 0.7) {
            closeWithAnimation();
            return;
          }

          Animated.spring(translateY, {
            damping: 22,
            stiffness: 220,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onStartShouldSetPanResponder: () => true,
      }),
    [closeWithAnimation, translateY],
  );

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(sheetHeight);
    Animated.timing(translateY, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [sheetHeight, translateY, visible]);

  function openCreate() {
    setEditingColor(undefined);
    setDraftHex(colorWheelColors[4]);
    setDraftLabel("");
    setPickerVisible(true);
  }

  function openEdit(color: BibleHighlightPaletteColor) {
    setEditingColor(color);
    setDraftHex(color.hex);
    setDraftLabel(color.label);
    setPickerVisible(true);
  }

  async function saveDraft() {
    if (busy || !draftValid) return;
    setBusy(true);
    try {
      await onSave({ hex: normalizedDraftHex, id: editingColor?.id, label: draftLabel.trim() || normalizedDraftHex });
      setPickerVisible(false);
      setEditingColor(undefined);
    } finally {
      setBusy(false);
    }
  }

  function deleteColor(color: BibleHighlightPaletteColor) {
    if (busy) return;
    confirmAction({
      title: "Delete highlight color?",
      message: "This removes the color and deletes highlights that use it.",
      confirmText: "Delete",
      destructive: true,
      onConfirm: () => {
        setBusy(true);
        void onDelete(color).finally(() => setBusy(false));
      },
    });
  }

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} onRequestClose={closeWithAnimation}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close highlight colors" accessibilityRole="button" onPress={closeWithAnimation} style={{ backgroundColor: palette.dim, flex: 1 }} />
        <Animated.View
          style={{
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            height: sheetHeight,
            overflow: "hidden",
            paddingBottom: insets.bottom,
            transform: [{ translateY }],
            ...platformShadow({
              boxShadow: "0 -16px 34px rgba(11, 18, 32, 0.18)",
              color: palette.shadow,
              offset: { width: 0, height: -10 },
              opacity: 0.14,
              radius: 26,
            }),
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <View
            style={{
              flex: 1,
              paddingHorizontal: 18,
            }}
          >
            <View style={{ alignItems: "center", borderBottomColor: palette.line, borderBottomWidth: 1, gap: 10, paddingTop: 8 }}>
              <View {...panResponder.panHandlers} style={{ alignItems: "center", height: 22, justifyContent: "center", width: 120 }}>
                <View style={{ backgroundColor: palette.line, borderRadius: 999, height: 5, width: 56 }} />
              </View>
            </View>

            <ScrollView
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 14, paddingBottom: 12 }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <ReaderCircleButton
                  accessibilityLabel={pickerVisible ? "Back to highlight colors" : "Close highlight colors"}
                  icon={pickerVisible ? "arrow-left" : "x"}
                  onPress={pickerVisible ? () => setPickerVisible(false) : closeWithAnimation}
                  palette={palette}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: palette.text, fontSize: 21, fontWeight: "900" }}>{pickerVisible ? (editingColor ? "Edit color" : "Add color") : "Highlight colors"}</Text>
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
                    {pickerVisible ? "Choose a color for your Bible highlights." : "Manage your saved highlight palette."}
                  </Text>
                </View>
                {!pickerVisible ? (
                  <Pressable
                    accessibilityLabel="Add highlight color"
                    accessibilityRole="button"
                    onPress={openCreate}
                    style={{
                      alignItems: "center",
                      backgroundColor: palette.peach,
                      borderColor: palette.line,
                      borderRadius: 999,
                      borderWidth: 1,
                      height: 42,
                      justifyContent: "center",
                      width: 42,
                    }}
                  >
                    <Feather name="plus" size={18} color={palette.accent} />
                  </Pressable>
                ) : null}
              </View>

              {pickerVisible ? (
                <View style={{ gap: 14 }}>
                  <HighlightColorWheel color={normalizedDraftHex} onChange={setDraftHex} palette={palette} />
                  <TextInputField autoCapitalize="words" onChangeText={setDraftLabel} placeholder="Color name" value={draftLabel} />
                  <PrimaryButton disabled={busy} icon="check" onPress={saveDraft}>
                    {busy ? "Saving..." : "Save color"}
                  </PrimaryButton>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {highlightColors.length === 0 ? (
                    <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 14 }}>
                      <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "700", lineHeight: 20 }}>No highlight colors yet.</Text>
                    </View>
                  ) : (
                    highlightColors.map((color) => (
                      <View
                        key={color.id}
                        style={{
                          alignItems: "center",
                          backgroundColor: palette.surface,
                          borderColor: palette.line,
                          borderRadius: radius.lg,
                          borderWidth: 1,
                          flexDirection: "row",
                          gap: 12,
                          minHeight: 62,
                          padding: 12,
                        }}
                      >
                        <View style={{ backgroundColor: color.hex, borderColor: palette.line, borderRadius: 999, borderWidth: 1, height: 38, width: 38 }} />
                        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>
                            {color.label}
                          </Text>
                          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{color.hex}</Text>
                        </View>
                        <Pressable accessibilityLabel={`Edit ${color.label}`} accessibilityRole="button" onPress={() => openEdit(color)} style={{ padding: 10 }}>
                          <Feather name="edit-3" size={17} color={palette.accent} />
                        </Pressable>
                        <Pressable accessibilityLabel={`Delete ${color.label}`} accessibilityRole="button" onPress={() => deleteColor(color)} style={{ padding: 10 }}>
                          <Feather name="trash-2" size={17} color={colors.danger} />
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              )}
            </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function HighlightColorWheel({
  color,
  onChange,
  palette,
}: {
  color: BibleHighlightColor;
  onChange: (color: BibleHighlightColor) => void;
  palette: ReaderPalette;
}) {
  const wheelSize = 252;
  const swatchSize = 42;
  const center = wheelSize / 2;
  const radiusDistance = 96;

  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View style={{ height: wheelSize, width: wheelSize }}>
        {colorWheelColors.map((wheelColor, index) => {
          const angle = (index / colorWheelColors.length) * Math.PI * 2 - Math.PI / 2;
          const selected = normalizeHexColor(color) === wheelColor;
          return (
            <Pressable
              accessibilityLabel={`Choose highlight color ${index + 1}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={wheelColor}
              onPress={() => onChange(wheelColor)}
              style={{
                alignItems: "center",
                backgroundColor: wheelColor,
                borderColor: selected ? palette.text : palette.line,
                borderRadius: 999,
                borderWidth: selected ? 3 : 1,
                height: swatchSize,
                justifyContent: "center",
                left: center + Math.cos(angle) * radiusDistance - swatchSize / 2,
                position: "absolute",
                top: center + Math.sin(angle) * radiusDistance - swatchSize / 2,
                width: swatchSize,
              }}
            >
              {selected ? <Feather name="check" size={16} color={palette.text} /> : null}
            </Pressable>
          );
        })}
        <View
          pointerEvents="none"
          style={{
            alignItems: "center",
            backgroundColor: color,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 86,
            justifyContent: "center",
            left: center - 43,
            position: "absolute",
            top: center - 43,
            width: 86,
          }}
        >
          <View style={{ backgroundColor: "rgba(255, 255, 255, 0.72)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: colors.ink, fontSize: 12, fontWeight: "900" }}>Selected</Text>
          </View>
        </View>
      </View>
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>Tap the wheel to choose a highlight color.</Text>
    </View>
  );
}

function ReaderToastMessage({ bottom, palette, toast }: { bottom: number; palette: ReaderPalette; toast?: ReaderToast }) {
  if (!toast) return null;

  const isError = toast.tone === "error";
  const icon = isError ? "alert-circle" : "check";
  const detail = toast.detail ?? (isError ? "Du hittar den redan under sparade verser." : "Du hittar den under sparade verser.");

  return (
    <View
      pointerEvents="none"
      style={{
        alignItems: "center",
        bottom,
        left: 18,
        position: "absolute",
        right: 18,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.sheet,
          borderColor: palette.line,
          borderRadius: radius.lg,
          borderWidth: 1,
          flexDirection: "row",
          gap: 12,
          maxWidth: 360,
          paddingHorizontal: 14,
          paddingVertical: 12,
          ...platformShadow({
            boxShadow: "0 12px 28px rgba(11, 18, 32, 0.18)",
            color: palette.shadow,
            offset: { width: 0, height: 10 },
            opacity: 0.16,
            radius: 22,
          }),
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette.peach,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Feather name={icon} size={18} color={isError ? colors.danger : palette.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>{toast.message}</Text>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{detail}</Text>
        </View>
      </View>
    </View>
  );
}

function VerseActionSheet({
  onAction,
  bibleVersionId,
  onClose,
  onClosed,
  onReadChapter,
  palette,
  position,
  readerTextStyle,
  visible,
}: {
  onAction: (action: VerseQuickAction) => void;
  bibleVersionId: BibleVersionId;
  onClose: () => void;
  onClosed: () => void;
  onReadChapter: (position: BiblePosition) => void;
  palette: ReaderPalette;
  position?: BiblePosition;
  readerTextStyle: TextStyle;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const slideProgress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [displayedPosition, setDisplayedPosition] = useState(position);
  const [view, setView] = useState<"actions" | "references">("actions");
  const references = useMemo(() => (displayedPosition ? bibleCrossReferences(displayedPosition, bibleVersionId) : []), [bibleVersionId, displayedPosition]);
  const sheetVerseFontSize = typeof readerTextStyle.fontSize === "number" ? Math.min(16, Math.max(14, readerTextStyle.fontSize - 2)) : 15;
  const sheetVerseLineHeight = Math.round(sheetVerseFontSize * 1.55);

  useEffect(() => {
    if (visible && position) {
      setDisplayedPosition(position);
      setView("actions");
      setMounted(true);
      slideProgress.stopAnimation();
      slideProgress.setValue(0);
      requestAnimationFrame(() => {
        Animated.timing(slideProgress, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });
      return;
    }

    if (!mounted) return;
    slideProgress.stopAnimation();
    Animated.timing(slideProgress, {
      duration: 190,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setMounted(false);
      setDisplayedPosition(undefined);
      onClosed();
    });
  }, [mounted, onClosed, position, slideProgress, visible]);

  if (!mounted || !displayedPosition) return null;

  const sheetTranslateY = slideProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  });

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          pointerEvents="none"
          style={{
            backgroundColor: palette.dim,
            bottom: 0,
            left: 0,
            opacity: slideProgress,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        />
        <Pressable accessibilityLabel="Close verse actions" accessibilityRole="button" onPress={onClose} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
        <Animated.View
          style={{
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            gap: 2,
            maxHeight: "78%",
            paddingBottom: Math.max(28, insets.bottom + 20),
            paddingHorizontal: 20,
            paddingTop: 16,
            elevation: 2,
            transform: [{ translateY: sheetTranslateY }],
            zIndex: 1,
            ...platformShadow({
              boxShadow: "0 -18px 44px rgba(11, 18, 32, 0.18)",
              color: palette.shadow,
              offset: { width: 0, height: -12 },
              opacity: 0.18,
              radius: 34,
            }),
          }}
        >
          <View style={{ alignItems: "center", paddingBottom: 20 }}>
            <View style={{ backgroundColor: palette.line, borderRadius: 999, height: 5, width: 52 }} />
          </View>
          {view === "actions" ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <VerseSheetAction icon="book-open" onPress={() => setView("references")} palette={palette} subtitle="See related verses" title="Cross references" />
              <VerseSheetAction icon="bookmark" onPress={() => onAction("save")} palette={palette} subtitle="Add it to saved verses" title="Save verse" />
              <VerseSheetAction icon="edit-3" onPress={() => onAction("journal")} palette={palette} subtitle="Write a reflection connected to this verse" title="Reflect" />
              <VerseSheetAction icon="heart" onPress={() => onAction("pray")} palette={palette} subtitle="Begin a prayer connected to this verse" title="Pray" />
              <VerseSheetAction icon="users" onPress={() => onAction("share")} palette={palette} subtitle="Share with your community room" title="Share verse" />
              <VerseSheetAction icon="copy" onPress={() => onAction("copy")} palette={palette} subtitle="Copy verse text and reference" title="Copy verse" />
              <VerseSheetAction icon="edit-2" onPress={() => onAction("highlight")} palette={palette} subtitle="Mark it with a warm highlight" title="Highlight / mark text" />
            </ScrollView>
          ) : (
            <View style={{ gap: 14 }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <ReaderCircleButton accessibilityLabel="Back to verse actions" icon="chevron-left" onPress={() => setView("actions")} palette={palette} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>Cross references</Text>
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{referenceLabel(displayedPosition)}</Text>
                </View>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
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
                        accessibilityLabel={`Read ${reference.startPosition.book} ${reference.startPosition.chapter}`}
                        accessibilityRole="button"
                        onPress={() => {
                          onClose();
                          onReadChapter(reference.startPosition);
                        }}
                        style={{ gap: 7, justifyContent: "center", minHeight: 54 }}
                      >
                        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                          <Text style={{ color: palette.text, flex: 1, fontSize: 17, fontWeight: "900" }}>{reference.reference}</Text>
                          <Text style={{ color: palette.muted, fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "800" }}>{reference.votes} votes</Text>
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
                    <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "700", lineHeight: 20 }}>No cross references for this verse yet.</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function VerseSheetAction({
  icon,
  onPress,
  palette,
  subtitle,
  title,
}: {
  icon: "book-open" | "bookmark" | "copy" | "edit-2" | "edit-3" | "heart" | "users";
  onPress: () => void;
  palette: ReaderPalette;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderBottomColor: palette.line,
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 14,
        minHeight: 72,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.peach,
          borderColor: palette.line,
          borderRadius: 999,
          borderWidth: 1,
          height: 46,
          justifyContent: "center",
          width: 46,
        }}
      >
        <Feather name={icon} size={21} color={palette.accent} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>{title}</Text>
        <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function ReadingSettingsSheet({
  compactMode,
  fontId,
  fontSize,
  onChangeFont,
  onChangeReaderTheme,
  onChangeShowCrossReferences,
  onChangeShowFootnotes,
  onChangeShowVerseNumbers,
  onClose,
  onCompactModeChange,
  onFontSizeChange,
  palette,
  readerTheme,
  showCrossReferences,
  showFootnotes,
  showVerseNumbers,
  visible,
}: {
  compactMode: boolean;
  fontId: BibleReaderFontId;
  fontSize: number;
  onChangeFont: (fontId: BibleReaderFontId) => void;
  onChangeReaderTheme: (theme: BibleReaderThemeId) => void;
  onChangeShowCrossReferences: (value: boolean) => void;
  onChangeShowFootnotes: (value: boolean) => void;
  onChangeShowVerseNumbers: (value: boolean) => void;
  onClose: () => void;
  onCompactModeChange: (value: boolean) => void;
  onFontSizeChange: (delta: number) => void;
  palette: ReaderPalette;
  readerTheme: BibleReaderThemeId;
  showCrossReferences: boolean;
  showFootnotes: boolean;
  showVerseNumbers: boolean;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: palette.dim, flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close reading settings" accessibilityRole="button" onPress={onClose} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
        <View
          style={{
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            maxHeight: "92%",
            paddingBottom: Math.max(26, insets.bottom + 18),
            paddingHorizontal: 20,
            paddingTop: 24,
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 24 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
              <Text style={{ color: palette.text, flex: 1, fontSize: 20, fontWeight: "900" }}>Reading settings</Text>
              <ReaderCircleButton accessibilityLabel="Close reading settings" icon="x" onPress={onClose} palette={palette} />
            </View>

            <SettingsGroup palette={palette} title="Font family">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {readerFonts.map((font) => (
                  <SettingChip
                    fontFamily={fontFamilyFor(font.id)}
                    key={font.id}
                    label={font.label}
                    onPress={() => onChangeFont(font.id)}
                    palette={palette}
                    selected={font.id === fontId}
                  />
                ))}
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title="Text size">
              <View
                style={{
                  alignItems: "center",
                  alignSelf: "flex-start",
                  backgroundColor: palette.input,
                  borderColor: palette.line,
                  borderRadius: 999,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: 12,
                  padding: 5,
                }}
              >
                <SettingsStepperButton disabled={fontSize <= minFontSize} icon="minus" label="Decrease text size" onPress={() => onFontSizeChange(-fontSizeStep)} palette={palette} />
                <Text style={{ color: palette.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900", minWidth: 30, textAlign: "center" }}>
                  {fontSize}
                </Text>
                <SettingsStepperButton disabled={fontSize >= maxFontSize} icon="plus" label="Increase text size" onPress={() => onFontSizeChange(fontSizeStep)} palette={palette} />
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title="Theme">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {readerThemes.map((theme) => (
                  <SettingChip
                    icon={theme.id === "dark" ? "moon" : theme.id === "sepia" ? "circle" : "sun"}
                    key={theme.id}
                    label={theme.label}
                    onPress={() => onChangeReaderTheme(theme.id)}
                    palette={palette}
                    selected={theme.id === readerTheme}
                  />
                ))}
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title="Reading settings">
              <View style={{ gap: 2 }}>
                <SettingsToggle label="Show verse numbers" onChange={onChangeShowVerseNumbers} palette={palette} value={showVerseNumbers} />
                <SettingsToggle label="Show cross references" onChange={onChangeShowCrossReferences} palette={palette} value={showCrossReferences} />
                <SettingsToggle label="Show footnotes" onChange={onChangeShowFootnotes} palette={palette} value={showFootnotes} />
                <SettingsToggle label="Compact mode" onChange={onCompactModeChange} palette={palette} value={compactMode} />
              </View>
            </SettingsGroup>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BibleVersionSheet({
  bibleVersionId,
  onChangeBibleVersion,
  onClose,
  palette,
  visible,
}: {
  bibleVersionId: BibleVersionId;
  onChangeBibleVersion: (versionId: BibleVersionId) => void;
  onClose: () => void;
  palette: ReaderPalette;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();

  function chooseVersion(versionId: BibleVersionId) {
    onChangeBibleVersion(versionId);
    onClose();
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: palette.dim, flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close Bible version selector" accessibilityRole="button" onPress={onClose} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
        <View
          style={{
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            gap: 18,
            paddingBottom: Math.max(26, insets.bottom + 18),
            paddingHorizontal: 20,
            paddingTop: 18,
            ...platformShadow({
              boxShadow: "0 -18px 44px rgba(11, 18, 32, 0.18)",
              color: palette.shadow,
              offset: { width: 0, height: -12 },
              opacity: 0.14,
              radius: 34,
            }),
          }}
        >
          <View style={{ alignItems: "center", paddingBottom: 2 }}>
            <View style={{ backgroundColor: palette.line, borderRadius: 999, height: 5, width: 52 }} />
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>Choose Bible version</Text>
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700" }}>Select the translation for the reader.</Text>
            </View>
            <ReaderCircleButton accessibilityLabel="Close Bible version selector" icon="x" onPress={onClose} palette={palette} />
          </View>

          <View style={{ gap: 10 }}>
            {bibleVersions.map((version) => (
              <BibleVersionRow
                description={bibleVersionDescription(version.id)}
                key={version.id}
                label={version.label}
                onPress={() => chooseVersion(version.id)}
                palette={palette}
                selected={version.id === bibleVersionId}
                shortLabel={bibleVersionShortLabel(version.id)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BibleVersionRow({
  description,
  label,
  onPress,
  palette,
  selected,
  shortLabel,
}: {
  description: string;
  label: string;
  onPress: () => void;
  palette: ReaderPalette;
  selected: boolean;
  shortLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? palette.peach : palette.surface,
        borderColor: selected ? palette.accent : palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 68,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: selected ? palette.accent : palette.input,
          borderColor: selected ? palette.accent : palette.line,
          borderRadius: 999,
          borderWidth: 1,
          height: 40,
          justifyContent: "center",
          minWidth: 56,
          paddingHorizontal: 10,
        }}
      >
        <Text style={{ color: selected ? palette.buttonText : palette.accent, fontSize: 12, fontWeight: "900" }}>{shortLabel}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>{label}</Text>
        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{description}</Text>
      </View>
      {selected ? <Feather name="check" size={18} color={palette.accent} /> : <Feather name="chevron-right" size={18} color={palette.muted} />}
    </Pressable>
  );
}

function SettingsGroup({ children, palette, title }: { children: ReactNode; palette: ReaderPalette; title: string }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>{title}</Text>
      {children}
    </View>
  );
}

function SettingChip({
  fontFamily,
  icon,
  label,
  onPress,
  palette,
  selected,
}: {
  fontFamily?: TextStyle["fontFamily"];
  icon?: "circle" | "moon" | "sun";
  label: string;
  onPress: () => void;
  palette: ReaderPalette;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? palette.peach : palette.sheet,
        borderColor: selected ? palette.accent : palette.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 8,
        minHeight: 44,
        paddingHorizontal: 18,
      }}
    >
      {icon ? <Feather name={icon} size={15} color={selected ? palette.accent : palette.muted} /> : null}
      <Text style={{ color: selected ? palette.accent : palette.muted, fontFamily, fontSize: 14, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function SettingsToggle({
  label,
  onChange,
  palette,
  value,
}: {
  label: string;
  onChange: (value: boolean) => void;
  palette: ReaderPalette;
  value: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ alignItems: "center", borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: "row", minHeight: 58 }}
    >
      <Text style={{ color: palette.text, flex: 1, fontSize: 15, fontWeight: "700" }}>{label}</Text>
      <View
        style={{
          alignItems: value ? "flex-end" : "flex-start",
          backgroundColor: value ? palette.accent : palette.line,
          borderRadius: 999,
          height: 30,
          justifyContent: "center",
          paddingHorizontal: 3,
          width: 52,
        }}
      >
        <View style={{ backgroundColor: palette.sheet, borderRadius: 999, height: 24, width: 24 }} />
      </View>
    </Pressable>
  );
}

function SettingsStepperButton({
  disabled,
  icon,
  label,
  onPress,
  palette,
}: {
  disabled?: boolean;
  icon: "minus" | "plus";
  label: string;
  onPress: () => void;
  palette: ReaderPalette;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? palette.line : palette.sheet,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 34,
        justifyContent: "center",
        opacity: disabled ? 0.62 : 1,
        width: 34,
      }}
    >
      <Feather name={icon} size={16} color={disabled ? palette.muted : palette.accent} />
    </Pressable>
  );
}

function CompactAudioPlayer({
  bottom,
  disabled,
  isActive,
  label,
  maxWidth,
  onToggle,
  onVoicePress,
  palette,
  statusLabel,
}: {
  bottom: number;
  disabled: boolean;
  isActive: boolean;
  label: string;
  maxWidth?: number;
  onToggle: () => void;
  onVoicePress: () => void;
  palette: ReaderPalette;
  statusLabel: string;
}) {
  return (
    <View pointerEvents="box-none" style={{ alignItems: "center", bottom, left: 0, paddingHorizontal: 18, position: "absolute", right: 0 }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.surface,
          borderColor: palette.line,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 12,
          minHeight: 58,
          maxWidth,
          paddingHorizontal: 8,
          paddingVertical: 6,
          width: "100%",
          ...platformShadow({
            boxShadow: "0 14px 32px rgba(11, 18, 32, 0.13)",
            color: palette.shadow,
            offset: { width: 0, height: 12 },
            opacity: 0.13,
            radius: 26,
          }),
        }}
      >
        <Pressable
          accessibilityLabel={isActive ? "Pause audio Bible" : "Play audio Bible"}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onToggle}
          style={{
            alignItems: "center",
            backgroundColor: disabled ? palette.line : palette.peach,
            borderRadius: 999,
            height: 44,
            justifyContent: "center",
            opacity: disabled ? 0.62 : 1,
            width: 44,
          }}
        >
          <Feather name={isActive ? "pause" : "play"} size={20} color={disabled ? palette.muted : palette.accent} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>
            {label}
          </Text>
          {statusLabel ? (
            <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: "600" }}>
              {statusLabel}
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityLabel="Choose audio voice" accessibilityRole="button" hitSlop={8} onPress={onVoicePress} style={{ padding: 12 }}>
          <Feather name="chevron-up" size={18} color={palette.accent} />
        </Pressable>
      </View>
    </View>
  );
}

function BibleBottomReadingControls({
  audioActive,
  audioPreparing,
  bottom,
  maxWidth,
  nextChapter,
  onListen,
  onNext,
  onPrevious,
  palette,
  previousChapter,
}: {
  audioActive: boolean;
  audioPreparing: boolean;
  bottom: number;
  maxWidth?: number;
  nextChapter?: BiblePosition;
  onListen: () => void;
  onNext: () => void;
  onPrevious: () => void;
  palette: ReaderPalette;
  previousChapter?: BiblePosition;
}) {
  const listenLabel = audioPreparing ? "Preparing" : audioActive ? "Pause" : "Listen";

  return (
    <View pointerEvents="box-none" style={{ alignItems: "center", bottom, left: 0, paddingHorizontal: 22, position: "absolute", right: 0, zIndex: 18 }}>
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 12,
          justifyContent: "center",
          maxWidth,
          width: "100%",
        }}
      >
        <ReaderControlButton
          accessibilityLabel="Previous chapter"
          disabled={!previousChapter}
          icon="chevron-left"
          onPress={onPrevious}
          palette={palette}
        />
        <Pressable
          accessibilityLabel={audioActive ? "Pause audio Bible" : "Listen to this chapter"}
          accessibilityRole="button"
          accessibilityState={{ busy: audioPreparing }}
          disabled={audioPreparing}
          onPress={onListen}
          style={{
            alignItems: "center",
            backgroundColor: palette.surface,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            flexDirection: "row",
            gap: 9,
            height: 46,
            justifyContent: "center",
            minWidth: 132,
            opacity: audioPreparing ? 0.72 : 1,
            paddingHorizontal: 18,
            ...platformShadow({
              boxShadow: "0 12px 28px rgba(11, 18, 32, 0.12)",
              color: palette.shadow,
              offset: { width: 0, height: 10 },
              opacity: 0.1,
              radius: 24,
            }),
          }}
        >
          {audioPreparing ? <ActivityIndicator color={palette.accent} size="small" /> : <Feather name={audioActive ? "pause" : "play"} size={17} color={palette.accent} />}
          <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{listenLabel}</Text>
        </Pressable>
        <ReaderControlButton
          accessibilityLabel="Next chapter"
          disabled={!nextChapter}
          icon="chevron-right"
          onPress={onNext}
          palette={palette}
        />
      </View>
    </View>
  );
}

function ReaderControlButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
  palette,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: "chevron-left" | "chevron-right";
  onPress: () => void;
  palette: ReaderPalette;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 46,
        justifyContent: "center",
        opacity: disabled ? 0.46 : 1,
        width: 46,
      }}
    >
      <Feather name={icon} size={20} color={disabled ? palette.muted : palette.accent} />
    </Pressable>
  );
}

function ChapterReflectionCard({
  onAction,
  onChangeText,
  palette,
  value,
}: {
  onAction: (action: "journal" | "pray" | "save") => void;
  onChangeText: (value: string) => void;
  palette: ReaderPalette;
  value: string;
}) {
  return (
    <View
      style={{
        backgroundColor: palette.peach,
        borderColor: palette.line,
        borderRadius: radius.xl,
        borderWidth: 1,
        gap: 14,
        padding: 16,
      }}
    >
      <Text style={{ color: palette.text, fontSize: 17, fontWeight: "900" }}>Vad stannade hos dig?</Text>
      <TextInput
        multiline
        onChangeText={onChangeText}
        onSubmitEditing={() => onAction("save")}
        placeholder="Skriv din reflektion..."
        placeholderTextColor={palette.muted}
        returnKeyType="done"
        submitBehavior="submit"
        value={value}
        style={{
          backgroundColor: palette.input,
          borderColor: palette.line,
          borderRadius: radius.lg,
          borderWidth: 1,
          color: palette.text,
          fontSize: 15,
          minHeight: 86,
          padding: 14,
          textAlignVertical: "top",
        }}
      />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SmallPillButton icon="edit-3" label="Skriv i journalen" onPress={() => onAction("journal")} palette={palette} />
        <SmallPillButton icon="heart" label="Be" onPress={() => onAction("pray")} palette={palette} />
        <Pressable
          accessibilityLabel="Spara reflektion"
          accessibilityRole="button"
          onPress={() => onAction("save")}
          style={{
            alignItems: "center",
            backgroundColor: palette.sheet,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 46,
            justifyContent: "center",
            width: 54,
          }}
        >
          <Feather name="bookmark" size={18} color={palette.accent} />
        </Pressable>
      </View>
    </View>
  );
}

function SmallPillButton({
  icon,
  label,
  onPress,
  palette,
}: {
  icon: "edit-3" | "heart";
  label: string;
  onPress: () => void;
  palette: ReaderPalette;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: palette.sheet,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: 8,
        justifyContent: "center",
        minHeight: 46,
        paddingHorizontal: 12,
      }}
    >
      <Feather name={icon} size={16} color={palette.accent} />
      <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SavedVersesSection({
  onAddToJournal,
  onOpenInBible,
  onRemove,
  onShareToRoom,
  palette,
  verses,
}: {
  onAddToJournal: (verse: BibleVerse) => void;
  onOpenInBible: (verse: BibleVerse) => void;
  onRemove: (id: string) => void;
  onShareToRoom: (verse: BibleVerse) => void;
  palette: ReaderPalette;
  verses: SavedVerse[];
}) {
  return (
    <View
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: radius.xl,
        borderWidth: 1,
        gap: 12,
        padding: 16,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ color: palette.text, fontSize: 17, fontWeight: "900" }}>Saved verses</Text>
        <Feather name="bookmark" size={18} color={palette.accent} />
      </View>
      {verses.length === 0 ? (
        <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "700", lineHeight: 20 }}>
          No saved verses yet. Save a verse to return to it later.
        </Text>
      ) : (
        verses.slice(0, 5).map((verse) => (
          <View key={verse.id} style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <VersePreviewCard
                compact
                onAddToJournal={onAddToJournal}
                onOpenInBible={onOpenInBible}
                onShareToRoom={onShareToRoom}
                showFullText
                verse={verse}
              />
            </View>
            <Pressable accessibilityLabel={`Remove ${verse.reference}`} accessibilityRole="button" onPress={() => onRemove(verse.id)} style={{ padding: 8 }}>
              <Feather name="trash-2" size={18} color={colors.danger} />
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function NextChapterCard({
  nextChapter,
  onPress,
  palette,
}: {
  nextChapter?: BiblePosition;
  onPress: () => void;
  palette: ReaderPalette;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !nextChapter }}
      disabled={!nextChapter}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: radius.xl,
        borderWidth: 1,
        flexDirection: "row",
        gap: 14,
        minHeight: 86,
        opacity: nextChapter ? 1 : 0.62,
        padding: 16,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>Nästa kapitel</Text>
        <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>{nextChapter ? chapterLabel(nextChapter) : "Slutet"}</Text>
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.sheet,
          borderColor: palette.line,
          borderRadius: 999,
          borderWidth: 1,
          height: 50,
          justifyContent: "center",
          width: 50,
        }}
      >
        <Feather name="arrow-right" size={22} color={palette.accent} />
      </View>
    </Pressable>
  );
}

function CrossReferenceSheet({
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
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(height * 0.78), 680);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const sheetVerseFontSize = typeof readerTextStyle.fontSize === "number" ? Math.min(16, Math.max(14, readerTextStyle.fontSize - 2)) : 15;
  const sheetVerseLineHeight = Math.round(sheetVerseFontSize * 1.55);

  const closeWithAnimation = useCallback(
    (afterClose?: () => void) => {
      Animated.timing(translateY, {
        duration: 190,
        easing: Easing.out(Easing.cubic),
        toValue: sheetHeight,
        useNativeDriver: true,
      }).start(() => {
        onClose();
        afterClose?.();
      });
    },
    [onClose, sheetHeight, translateY],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 5,
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 90 || gesture.vy > 0.7) {
            closeWithAnimation();
            return;
          }

          Animated.spring(translateY, {
            damping: 22,
            stiffness: 220,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onStartShouldSetPanResponder: () => true,
      }),
    [closeWithAnimation, translateY],
  );

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(sheetHeight);
    Animated.timing(translateY, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [sheetHeight, translateY, visible]);

  if (!visible || !position) return null;

  return (
    <Modal transparent visible={visible} onRequestClose={() => closeWithAnimation()}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close cross references" style={{ backgroundColor: palette.dim, flex: 1 }} onPress={() => closeWithAnimation()} />
        <Animated.View
          style={{
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            height: sheetHeight,
            overflow: "hidden",
            paddingBottom: insets.bottom,
            transform: [{ translateY }],
            ...platformShadow({
              boxShadow: "0 -16px 34px rgba(11, 18, 32, 0.18)",
              color: palette.shadow,
              offset: { width: 0, height: -10 },
              opacity: 0.14,
              radius: 26,
            }),
          }}
        >
          <View style={{ alignItems: "center", borderBottomColor: palette.line, borderBottomWidth: 1, gap: 10, paddingHorizontal: 18, paddingTop: 8 }}>
            <View {...panResponder.panHandlers} style={{ alignItems: "center", height: 22, justifyContent: "center", width: 120 }}>
              <View style={{ backgroundColor: palette.line, borderRadius: 999, height: 5, width: 56 }} />
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingBottom: 14, width: "100%" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>Korsreferenser</Text>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{referenceLabel(position)}</Text>
              </View>
              <ReaderCircleButton accessibilityLabel="Close cross references" icon="x" onPress={() => closeWithAnimation()} palette={palette} />
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 18 }}>
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
                    accessibilityLabel={`Read ${reference.startPosition.book} ${reference.startPosition.chapter}`}
                    accessibilityRole="button"
                    onPress={() => closeWithAnimation(() => onReadChapter(reference.startPosition))}
                    style={{ gap: 7, minHeight: 54, justifyContent: "center" }}
                  >
                    <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                      <Text selectable style={{ color: palette.text, flex: 1, fontSize: 17, fontWeight: "900" }}>
                        {reference.reference}
                      </Text>
                      <Text style={{ color: palette.muted, fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "800" }}>{reference.votes} votes</Text>
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
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ChapterButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: "chevron-left" | "chevron-right";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} chapter`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? colors.disabled : colors.paper,
        borderColor: disabled ? colors.disabled : colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 5,
        justifyContent: "center",
        minHeight: 46,
        opacity: disabled ? 0.7 : 1,
        paddingHorizontal: 11,
      }}
    >
      {icon === "chevron-left" ? <Feather name={icon} size={17} color={disabled ? colors.disabledText : colors.olive} /> : null}
      <Text style={{ color: disabled ? colors.disabledText : colors.olive, fontSize: 13, fontWeight: "900" }}>{label}</Text>
      {icon === "chevron-right" ? <Feather name={icon} size={17} color={disabled ? colors.disabledText : colors.olive} /> : null}
    </Pressable>
  );
}

function StepperButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: "minus" | "plus";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? colors.disabled : colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 34,
        justifyContent: "center",
        width: 34,
      }}
    >
      <Feather name={icon} size={16} color={disabled ? colors.disabledText : colors.olive} />
    </Pressable>
  );
}

function PuterTokenModal({
  authTokenInput,
  hasStoredToken,
  onChangeAuthToken,
  onClose,
  onForget,
  onOpenDashboard,
  onSave,
  visible,
}: {
  authTokenInput: string;
  hasStoredToken: boolean;
  onChangeAuthToken: (value: string) => void;
  onClose: () => void;
  onForget: () => void;
  onOpenDashboard: () => void;
  onSave: () => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: colors.cream, flex: 1 }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: Math.max(28, insets.bottom + 18), paddingTop: insets.top + 18 }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <IconButton accessibilityLabel="Close Puter connection" icon="x" onPress={onClose} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>Connect Puter</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Google sign-in opens in your browser</Text>
            </View>
          </View>

          <Card style={{ gap: 12, padding: 16 }}>
            <BodyText muted selectable>
              Google does not allow sign-in inside embedded app webviews. Open Puter in your browser, sign in with Google there, copy your Auth Token from Account, then paste it here.
            </BodyText>
            <SecondaryButton icon="external-link" onPress={onOpenDashboard} style={{ minHeight: 44, paddingHorizontal: 14 }}>
              Open Puter Account
            </SecondaryButton>
          </Card>

          <Card style={{ gap: 12, padding: 16 }}>
            <SectionHeading>{hasStoredToken ? "Saved token" : "Auth token"}</SectionHeading>
            <TextInputField
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={onChangeAuthToken}
              onSubmitEditing={onSave}
              placeholder="Paste Puter auth token"
              returnKeyType="done"
              secureTextEntry={false}
              submitBehavior="submit"
              value={authTokenInput}
            />
            <SecondaryButton icon="check" onPress={onSave} style={{ minHeight: 44, paddingHorizontal: 14 }}>
              Save and play
            </SecondaryButton>
            {hasStoredToken ? (
              <Pressable accessibilityRole="button" onPress={onForget} style={{ alignItems: "center", minHeight: 42, justifyContent: "center" }}>
                <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "900" }}>Forget saved token</Text>
              </Pressable>
            ) : null}
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

function AudioVoicePicker({
  onClose,
  onSelect,
  selectedVoiceId,
  visible,
  voices,
}: {
  onClose: () => void;
  onSelect: (voice: AudioVoice) => void;
  selectedVoiceId: string;
  visible: boolean;
  voices: AudioVoice[];
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: colors.cream, flex: 1 }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 14, padding: 18, paddingBottom: Math.max(28, insets.bottom + 18), paddingTop: insets.top + 18 }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <IconButton accessibilityLabel="Close voice picker" icon="x" onPress={onClose} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>Choose voice</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>ElevenLabs Turbo</Text>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            {voices.map((voice) => {
              const selected = voice.id === selectedVoiceId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={voice.id}
                  onPress={() => onSelect(voice)}
                  style={{
                    alignItems: "center",
                    backgroundColor: selected ? colors.accentSubtle : colors.paper,
                    borderColor: selected ? colors.gold : colors.line,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: 12,
                    minHeight: 58,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <View style={{ alignItems: "center", backgroundColor: selected ? colors.gold : colors.input, borderRadius: 999, height: 36, justifyContent: "center", width: 36 }}>
                    <Feather name="volume-2" size={16} color={selected ? colors.white : colors.olive} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>
                      {voice.name}
                    </Text>
                    <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 16 }}>
                      {voice.languageName ?? voice.description ?? "ElevenLabs voice"}
                    </Text>
                  </View>
                  {selected ? <Feather name="check" size={18} color={colors.olive} /> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const puterAudioBridgeHtml = `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://js.puter.com/v2/"></script>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { align-items: center; background: #fffdf9; color: #0b1220; display: flex; justify-content: center; margin: 0; min-height: 100vh; padding: 20px; }
      main { border: 1px solid #e9d9c8; border-radius: 14px; box-sizing: border-box; max-width: 420px; padding: 18px; width: 100%; }
      h1 { font-size: 20px; line-height: 25px; margin: 0 0 8px; }
      p { color: #6f7686; font-size: 14px; font-weight: 600; line-height: 20px; margin: 0 0 14px; }
      button { align-items: center; background: #a45118; border: 0; border-radius: 999px; color: white; display: flex; font-size: 15px; font-weight: 800; justify-content: center; min-height: 46px; padding: 0 18px; width: 100%; }
      button:disabled { background: #ede5da; color: #9a9085; }
      #status { color: #6f7686; font-size: 12px; font-weight: 700; line-height: 17px; margin-top: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Voice service</h1>
      <p>Tap continue if Puter asks you to sign in or approve the ElevenLabs voice request.</p>
      <button id="continue-button" type="button">Continue</button>
      <div id="status">Waiting for the audio request...</div>
    </main>
    <script>
      var turboModel = ${JSON.stringify(elevenLabsTurboModel)};
      var pendingSynthesisCommand = null;
      var continueButton = document.getElementById("continue-button");
      var statusElement = document.getElementById("status");

      function setStatus(message, busy) {
        statusElement.textContent = message;
        continueButton.disabled = Boolean(busy);
      }

      function postToNative(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      function postAudioToNative(requestId, base64, mimeType) {
        var chunkSize = 24000;
        var totalChunks = Math.ceil(base64.length / chunkSize);
        postToNative({ type: "audio-start", requestId: requestId, totalChunks: totalChunks, mimeType: mimeType || "audio/mpeg" });
        for (var index = 0; index < totalChunks; index += 1) {
          postToNative({
            type: "audio-chunk",
            requestId: requestId,
            index: index,
            chunk: base64.slice(index * chunkSize, (index + 1) * chunkSize)
          });
        }
        postToNative({ type: "audio-end", requestId: requestId });
      }

      function waitForPuter() {
        return new Promise(function(resolve, reject) {
          var attempts = 0;
          var interval = setInterval(function() {
            attempts += 1;
            if (window.puter && window.puter.ai && window.puter.ai.txt2speech) {
              clearInterval(interval);
              resolve(window.puter);
              return;
            }
            if (attempts > 120) {
              clearInterval(interval);
              reject(new Error("Puter.js did not finish loading."));
            }
          }, 250);
        });
      }

      function blobToBase64(blob) {
        return new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onerror = function() {
            reject(new Error("Could not read generated audio."));
          };
          reader.onloadend = function() {
            var result = String(reader.result || "");
            resolve(result.indexOf(",") >= 0 ? result.split(",")[1] : result);
          };
          reader.readAsDataURL(blob);
        });
      }

      async function listVoices(command) {
        try {
          var puter = await waitForPuter();
          var voices = await puter.ai.txt2speech.listVoices({ provider: "elevenlabs" });
          postToNative({ type: "voices", requestId: command.requestId, voices: voices });
        } catch (error) {
          postToNative({ type: "error", requestId: command.requestId, message: error && error.message ? error.message : "Could not load voices." });
        }
      }

      async function setAuthToken(command) {
        try {
          var puter = await waitForPuter();
          if (command.token) {
            puter.setAuthToken(command.token);
            localStorage.setItem("puter.auth.token", command.token);
            setStatus("Puter is connected.", true);
          } else {
            puter.resetAuthToken();
            localStorage.removeItem("puter.auth.token");
            setStatus("Waiting for the audio request...", false);
          }
        } catch (error) {
          postToNative({ type: "error", message: error && error.message ? error.message : "Could not apply Puter token." });
        }
      }

      async function synthesize(command) {
        var interactionTimer;
        try {
          pendingSynthesisCommand = command;
          var puter = window.puter && window.puter.ai && window.puter.ai.txt2speech ? window.puter : await waitForPuter();
          if (command.requiresGesture) {
            setStatus("Tap Continue to connect Puter and generate this verse.", false);
            postToNative({
              type: "interaction",
              requestId: command.requestId,
              message: "Tap Continue to connect Puter and generate this verse."
            });
            return;
          }
          setStatus("Generating verse audio...", true);
          var audio = await puter.ai.txt2speech(command.text, {
            provider: "elevenlabs",
            model: turboModel,
            voice: command.voiceId,
            output_format: "mp3_44100_128"
          });
          clearTimeout(interactionTimer);
          var src = audio && audio.src ? audio.src : String(audio);
          var response = await fetch(src);
          if (!response.ok) {
            throw new Error("Generated audio could not be downloaded.");
          }
          var blob = await response.blob();
          var base64 = await blobToBase64(blob);
          setStatus("Sending audio to Koino...", true);
          postAudioToNative(command.requestId, base64, blob.type || "audio/mpeg");
        } catch (error) {
          if (interactionTimer) {
            clearTimeout(interactionTimer);
          }
          setStatus(error && error.message ? error.message : "Audio could not be prepared.", false);
          postToNative({ type: "error", requestId: command.requestId, message: error && error.message ? error.message : "Audio could not be prepared." });
        }
      }

      continueButton.addEventListener("click", function() {
        if (!pendingSynthesisCommand) {
          setStatus("No verse is waiting yet. Press Play in Koino first.", false);
          return;
        }

        var command = Object.assign({}, pendingSynthesisCommand, { requiresGesture: false });
        pendingSynthesisCommand = command;
        synthesize(command);
      });

      function handleMessage(event) {
        var command;
        try {
          command = JSON.parse(event.data);
        } catch (error) {
          return;
        }

        if (!command || !command.type) return;
        if (command.type === "setAuthToken") {
          setAuthToken(command);
        }
        if (command.type === "listVoices") {
          listVoices(command);
        }
        if (command.type === "synthesize") {
          synthesize(command);
        }
      }

      window.addEventListener("message", handleMessage);
      document.addEventListener("message", handleMessage);
      waitForPuter()
        .then(function() {
          postToNative({ type: "ready" });
        })
        .catch(function(error) {
          postToNative({ type: "error", message: error && error.message ? error.message : "Puter.js did not finish loading." });
        });
    </script>
  </body>
</html>
`;

const PuterAudioBridge = forwardRef<WebView, { onClose: () => void; onMessage: (event: WebViewMessageEvent) => void; visible: boolean }>(function PuterAudioBridge(
  { onClose, onMessage, visible },
  ref,
) {
  const insets = useSafeAreaInsets();

  if (Platform.OS === "web") {
    return null;
  }

  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={
        visible
          ? {
              backgroundColor: colors.cream,
              bottom: 0,
              left: 0,
              paddingBottom: Math.max(16, insets.bottom + 12),
              paddingHorizontal: 16,
              paddingTop: insets.top + 12,
              position: "absolute",
              right: 0,
              top: 0,
              zIndex: 50,
            }
          : { height: 1, left: -20, opacity: 0, position: "absolute", top: -20, width: 1 }
      }
    >
      {visible ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingBottom: 12 }}>
          <IconButton accessibilityLabel="Hide voice service" icon="x" onPress={onClose} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>Voice service</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Puter handles ElevenLabs access</Text>
          </View>
        </View>
      ) : null}
      <View style={{ borderColor: visible ? colors.line : "transparent", borderRadius: visible ? radius.lg : 0, borderWidth: visible ? 1 : 0, flex: visible ? 1 : undefined, overflow: "hidden" }}>
        <WebView
          ref={ref}
          allowsInlineMediaPlayback
          domStorageEnabled
          javaScriptCanOpenWindowsAutomatically
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          onMessage={onMessage}
          originWhitelist={["*"]}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          source={{ html: puterAudioBridgeHtml, baseUrl: "https://developer.puter.com" }}
          thirdPartyCookiesEnabled
          style={visible ? { backgroundColor: colors.paper, flex: 1 } : { height: 1, width: 1 }}
        />
      </View>
    </View>
  );
});

function BibleDrawer({
  activePlanDetail,
  activePlanTitle,
  highlights,
  initialPosition,
  journalEntries,
  onClose,
  onOpenJournal,
  onOpenToday,
  onSelect,
  palette,
  savedVerses,
  versionLabel,
  visible,
}: {
  activePlanDetail?: string;
  activePlanTitle?: string;
  highlights: BibleHighlight[];
  initialPosition: BiblePosition;
  journalEntries: JournalEntry[];
  onClose: () => void;
  onOpenJournal: () => void;
  onOpenToday: () => void;
  onSelect: (position: BiblePosition) => void;
  palette: ReaderPalette;
  savedVerses: SavedVerse[];
  versionLabel: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(height * 0.84), 720);
  const [stage, setStage] = useState<PickerStage>("home");
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState(initialPosition.book);
  const [selectedChapter, setSelectedChapter] = useState(initialPosition.chapter);
  const [testament, setTestament] = useState<TestamentFilter>("all");

  useEffect(() => {
    if (!visible) return;
    const normalized = normalizeBiblePosition(initialPosition);
    setStage("home");
    setBookQuery("");
    setSelectedBook(normalized.book);
    setSelectedChapter(normalized.chapter);
    setTestament("all");
  }, [initialPosition, visible]);

  const book = kjvBooks.find((item) => item.name === selectedBook) ?? kjvBooks[0];
  const normalizedQuery = bookQuery.trim().toLowerCase();
  const searchPosition = biblePositionFromSearchQuery(bookQuery);
  const selectableBooks = kjvBooks.filter((item) => {
    const matchesQuery = !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery);
    const matchesTestament = testament === "all" || testamentForBook(item.name) === testament;
    return matchesQuery && matchesTestament;
  });
  const selectableVerses = versesForChapter(selectedBook, selectedChapter);
  const recentHighlights = useMemo(() => [...highlights].sort((a, b) => highlightTime(b) - highlightTime(a)).slice(0, 12), [highlights]);
  const bibleReflections = useMemo(
    () =>
      journalEntries
        .filter((entry) => entry.verse || entry.verses?.length || entry.passage)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 12),
    [journalEntries],
  );
  const title =
    stage === "home"
      ? "Bible"
      : stage === "book"
        ? testamentLabel(testament)
        : stage === "chapter"
          ? selectedBook
          : stage === "verse"
            ? `${selectedBook} ${selectedChapter}`
            : stage === "saved"
              ? "Saved verses"
              : stage === "highlights"
                ? "Recently highlighted"
                : "My Bible reflections";

  function goBack() {
    if (stage === "verse") {
      setStage("chapter");
      return;
    }
    if (stage === "chapter") {
      setStage("book");
      return;
    }
    if (stage !== "home") {
      setStage("home");
      setBookQuery("");
      return;
    }
    onClose();
  }

  function openBookList(nextTestament: TestamentFilter) {
    setTestament(nextTestament);
    setBookQuery("");
    setStage("book");
  }

  function chooseBook(bookName: string) {
    const nextBook = kjvBooks.find((item) => item.name === bookName);
    const nextChapter = nextBook?.chapters[0] ?? 1;
    setSelectedBook(bookName);
    setSelectedChapter(nextChapter);
    setStage("chapter");
  }

  function chooseChapter(chapter: number) {
    setSelectedChapter(chapter);
    setStage("verse");
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={goBack}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close Bible drawer" accessibilityRole="button" onPress={onClose} style={{ backgroundColor: palette.dim, flex: 1 }} />
        <View
          style={{
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            height: sheetHeight,
            overflow: "hidden",
            paddingBottom: insets.bottom,
            ...platformShadow({
              boxShadow: "0 -18px 44px rgba(11, 18, 32, 0.18)",
              color: palette.shadow,
              offset: { width: 0, height: -12 },
              opacity: 0.15,
              radius: 34,
            }),
          }}
        >
          <View style={{ alignItems: "center", borderBottomColor: palette.line, borderBottomWidth: 1, gap: 10, paddingHorizontal: 18, paddingTop: 10 }}>
            <View style={{ backgroundColor: palette.line, borderRadius: 999, height: 5, width: 52 }} />
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingBottom: 14, width: "100%" }}>
              <ReaderCircleButton accessibilityLabel={stage === "home" ? "Close Bible drawer" : "Back"} icon={stage === "home" ? "x" : "chevron-left"} onPress={goBack} palette={palette} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>{title}</Text>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{stage === "home" ? `${chapterLabel(initialPosition)} - ${versionLabel}` : versionLabel}</Text>
              </View>
            </View>
          </View>

          <ScrollView
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: Math.max(28, insets.bottom + 20) }}
          >
            {stage === "home" ? (
              <>
                <DrawerSearchBox onChangeText={setBookQuery} onSubmit={() => searchPosition && onSelect(searchPosition)} palette={palette} value={bookQuery} />
                {searchPosition ? (
                  <DrawerRow
                    icon="search"
                    onPress={() => onSelect(searchPosition)}
                    palette={palette}
                    subtitle="Open this passage in the reader"
                    title={`Open ${referenceLabel(searchPosition)}`}
                  />
                ) : null}
                {normalizedQuery && !searchPosition ? (
                  <View style={{ gap: 8 }}>
                    {selectableBooks.slice(0, 6).map((item) => (
                      <DrawerBookRow key={item.name} book={item} onPress={() => chooseBook(item.name)} palette={palette} selected={item.name === selectedBook} />
                    ))}
                    {selectableBooks.length === 0 ? <DrawerEmptyState palette={palette} text="No books match that search." /> : null}
                  </View>
                ) : null}

                <DrawerSection title="Go to book" palette={palette}>
                  <DrawerRow icon="book-open" onPress={() => openBookList("old")} palette={palette} subtitle="Genesis through Malachi" title="Old Testament" />
                  <DrawerRow icon="book" onPress={() => openBookList("new")} palette={palette} subtitle="Matthew through Revelation" title="New Testament" />
                  <DrawerRow icon="search" onPress={() => openBookList("all")} palette={palette} subtitle="Search book, chapter, or verse" title="Search book or verse" />
                </DrawerSection>

                <DrawerSection title="My places" palette={palette}>
                  <DrawerRow icon="play-circle" onPress={() => onSelect(initialPosition)} palette={palette} subtitle={referenceLabel(initialPosition)} title="Continue where you were" />
                  <DrawerRow
                    disabled={savedVerses.length === 0}
                    icon="bookmark"
                    onPress={() => setStage("saved")}
                    palette={palette}
                    subtitle={savedVerses.length ? `${savedVerses.length} saved` : "No saved verses yet"}
                    title="Saved verses"
                  />
                  <DrawerRow
                    disabled={recentHighlights.length === 0}
                    icon="edit-2"
                    onPress={() => setStage("highlights")}
                    palette={palette}
                    subtitle={recentHighlights.length ? `${recentHighlights.length} recent` : "No highlights yet"}
                    title="Recently highlighted"
                  />
                  <DrawerRow
                    disabled={bibleReflections.length === 0}
                    icon="edit-3"
                    onPress={() => setStage("reflections")}
                    palette={palette}
                    subtitle={bibleReflections.length ? `${bibleReflections.length} linked notes` : "Create one from a verse"}
                    title="My Bible reflections"
                  />
                </DrawerSection>

                <DrawerSection title="Reading plans" palette={palette}>
                  <DrawerRow icon="calendar" onPress={onOpenToday} palette={palette} subtitle={activePlanDetail ?? "Open Today's rhythm"} title={activePlanTitle ?? "Active plan"} />
                  <DrawerRow icon="compass" onPress={onOpenToday} palette={palette} subtitle="Find a rhythm from Today" title="Discover plans" />
                </DrawerSection>
              </>
            ) : null}

            {stage === "book" ? (
            <>
              <DrawerSearchBox onChangeText={setBookQuery} onSubmit={() => searchPosition && onSelect(searchPosition)} palette={palette} value={bookQuery} />
              {searchPosition ? (
                <DrawerRow
                  icon="search"
                  onPress={() => onSelect(searchPosition)}
                  palette={palette}
                  subtitle="Open this passage in the reader"
                  title={`Open ${referenceLabel(searchPosition)}`}
                />
              ) : null}
              <View style={{ gap: 8 }}>
                {selectableBooks.length > 0 ? (
                  selectableBooks.map((item) => (
                    <DrawerBookRow key={item.name} book={item} onPress={() => chooseBook(item.name)} palette={palette} selected={item.name === selectedBook} />
                  ))
                ) : (
                  <DrawerEmptyState palette={palette} text="No books match that search." />
                )}
              </View>
            </>
          ) : null}

          {stage === "chapter" ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" }}>Chapter</Text>
              <PickerGrid
                palette={palette}
                selected={selectedChapter}
                values={book?.chapters ?? []}
                onSelect={chooseChapter}
              />
            </View>
          ) : null}

          {stage === "verse" ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" }}>Verse</Text>
              <PickerGrid
                palette={palette}
                selected={initialPosition.book === selectedBook && initialPosition.chapter === selectedChapter ? initialPosition.verse : undefined}
                values={selectableVerses}
                onSelect={(verse) => onSelect(normalizeBiblePosition({ book: selectedBook, chapter: selectedChapter, verse }))}
              />
            </View>
          ) : null}

            {stage === "saved" ? (
              <View style={{ gap: 8 }}>
                {savedVerses.length ? (
                  savedVerses.map((verse) => (
                    <DrawerVerseRow
                      key={verse.id}
                      onPress={() => {
                        const nextPosition = biblePositionFromVerse(verse);
                        if (nextPosition) onSelect(nextPosition);
                      }}
                      palette={palette}
                      reference={verse.reference}
                      text={verse.text}
                    />
                  ))
                ) : (
                  <DrawerEmptyState palette={palette} text="Saved verses will appear here." />
                )}
              </View>
            ) : null}

            {stage === "highlights" ? (
              <View style={{ gap: 8 }}>
                {recentHighlights.length ? (
                  recentHighlights.map((highlight) => (
                    <DrawerVerseRow
                      key={highlight.id}
                      onPress={() => onSelect(normalizeBiblePosition({ book: highlight.book, chapter: highlight.chapter, verse: highlight.startVerse }))}
                      palette={palette}
                      reference={highlight.reference}
                      text={highlight.color}
                    />
                  ))
                ) : (
                  <DrawerEmptyState palette={palette} text="Highlighted verses will appear here." />
                )}
              </View>
            ) : null}

            {stage === "reflections" ? (
              <View style={{ gap: 8 }}>
                {bibleReflections.length ? (
                  bibleReflections.map((entry) => {
                    const verse = entry.verses?.[0] ?? entry.verse;
                    const nextPosition = biblePositionFromVerse(verse) ?? biblePositionFromReference(entry.passage?.reference);
                    return (
                      <DrawerVerseRow
                        key={entry.id}
                        onPress={() => {
                          if (nextPosition) {
                            onSelect(nextPosition);
                            return;
                          }
                          onOpenJournal();
                        }}
                        palette={palette}
                        reference={verse?.reference ?? entry.passage?.reference ?? entry.title ?? "Bible reflection"}
                        text={entry.body}
                      />
                    );
                  })
                ) : (
                  <DrawerEmptyState palette={palette} text="Reflections connected to Bible verses will appear here." />
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DrawerSearchBox({
  onChangeText,
  onSubmit,
  palette,
  value,
}: {
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  palette: ReaderPalette;
  value: string;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette.input,
        borderColor: palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 10,
        minHeight: 50,
        paddingHorizontal: 14,
      }}
    >
      <Feather name="search" size={18} color={palette.muted} />
      <TextInput
        autoCapitalize="words"
        autoCorrect={false}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Search book or verse"
        placeholderTextColor={palette.muted}
        returnKeyType="search"
        style={{ color: palette.text, flex: 1, fontSize: 15, fontWeight: "700", minHeight: 48 }}
        value={value}
      />
    </View>
  );
}

function DrawerSection({ children, palette, title }: { children: ReactNode; palette: ReaderPalette; title: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" }}>{title}</Text>
      <View
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.line,
          borderRadius: radius.lg,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function DrawerRow({
  disabled,
  icon,
  onPress,
  palette,
  subtitle,
  title,
}: {
  disabled?: boolean;
  icon: FeatherName;
  onPress: () => void;
  palette: ReaderPalette;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderBottomColor: palette.line,
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 64,
        opacity: disabled ? 0.5 : 1,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.peach,
          borderColor: palette.line,
          borderRadius: 999,
          borderWidth: 1,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Feather name={icon} size={17} color={palette.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
          {subtitle}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.muted} />
    </Pressable>
  );
}

function DrawerBookRow({
  book,
  onPress,
  palette,
  selected,
}: {
  book: (typeof kjvBooks)[number];
  onPress: () => void;
  palette: ReaderPalette;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? palette.peach : palette.surface,
        borderColor: selected ? palette.accent : palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 56,
        paddingHorizontal: 14,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>{book.name}</Text>
        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
          {book.chapters.length} {book.chapters.length === 1 ? "chapter" : "chapters"}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.muted} />
    </Pressable>
  );
}

function DrawerVerseRow({
  onPress,
  palette,
  reference,
  text,
}: {
  onPress: () => void;
  palette: ReaderPalette;
  reference: string;
  text: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        gap: 6,
        minHeight: 74,
        padding: 14,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Text numberOfLines={1} style={{ color: palette.text, flex: 1, fontSize: 15, fontWeight: "900" }}>
          {reference}
        </Text>
        <Feather name="arrow-right" size={16} color={palette.accent} />
      </View>
      <Text numberOfLines={2} style={{ color: palette.muted, fontSize: 13, fontWeight: "600", lineHeight: 18 }}>
        {text}
      </Text>
    </Pressable>
  );
}

function DrawerEmptyState({ palette, text }: { palette: ReaderPalette; text: string }) {
  return (
    <View style={{ backgroundColor: palette.input, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 14 }}>
      <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

function PickerGrid({
  palette,
  onSelect,
  selected,
  values,
}: {
  palette: ReaderPalette;
  onSelect: (value: number) => void;
  selected?: number;
  values: number[];
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {values.map((value) => {
        const isSelected = value === selected;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={value}
            onPress={() => onSelect(value)}
            style={{
              alignItems: "center",
              backgroundColor: isSelected ? palette.peach : palette.surface,
              borderColor: isSelected ? palette.accent : palette.line,
              borderRadius: radius.md,
              borderWidth: 1,
              height: 46,
              justifyContent: "center",
              width: 54,
            }}
          >
            <Text style={{ color: isSelected ? palette.accent : palette.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900" }}>{value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
