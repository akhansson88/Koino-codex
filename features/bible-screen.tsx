import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { useNavigation } from "expo-router";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { defaultBibleVersionId, notifyBibleVersionPreferenceChanged, readerStorageKey } from "@/features/bible-preferences";
import { useKoino } from "@/state/koino-store";
import { BodyText, Card, IconButton, SecondaryButton, SectionHeading, TextInputField } from "@/ui/app-components";
import { openLinkInApp } from "@/ui/open-link";
import { colors, platformShadow, radius } from "@/ui/theme";
import type { BibleVerse } from "@/state/types";

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
type PickerStage = "book" | "chapter" | "verse";

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
  references: string[];
  sourceUrl: string;
  topic: string;
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

const defaultPosition = normalizeBiblePosition({ book: "John", chapter: 3, verse: 1 });
const defaultFontId: BibleReaderFontId = "serif";
const defaultFontSize = 18;
const defaultReaderTheme: BibleReaderThemeId = "light";
const defaultShowVerseNumbers = true;
const defaultShowFootnotes = false;
const defaultShowCrossReferences = true;
const defaultCompactMode = false;
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

const productionBibleTopicApiOrigin = "https://spontaneous-jalebi-46756a.netlify.app";

function bibleTopicEndpoints(topic: string) {
  const path = `/api/bible-topic?topic=${encodeURIComponent(topic)}`;
  if (Platform.OS === "web") return [path];
  return [`${productionBibleTopicApiOrigin}${path}`];
}

async function fetchBibleTopic(topic: string) {
  let lastError: unknown;

  for (const endpoint of bibleTopicEndpoints(topic)) {
    try {
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as Partial<BibleTopicResult> & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Topic request failed with ${response.status}`);
      }
      if (!Array.isArray(data.references)) {
        throw new Error("The topic response did not include Bible references.");
      }
      return {
        count: typeof data.count === "number" ? data.count : data.references.length,
        references: data.references.filter((reference): reference is string => typeof reference === "string" && reference.trim().length > 0),
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
    return {
      accent: "#FFC79A",
      background: "#0B1220",
      buttonText: "#0B1220",
      danger: "#FDA29B",
      dim: "rgba(2, 6, 16, 0.58)",
      input: "#101A2C",
      line: "#2A3549",
      muted: "#A7B0C0",
      peach: "rgba(255, 199, 154, 0.14)",
      shadow: "#000000",
      sheet: "#111A2C",
      surface: "#172237",
      text: "#F3F2EC",
    };
  }

  if (theme === "sepia") {
    return {
      accent: "#A45118",
      background: "#F7EDE0",
      buttonText: "#0B1220",
      danger: colors.danger,
      dim: "rgba(63, 38, 21, 0.34)",
      input: "#FFF8EF",
      line: "#E7CFB9",
      muted: "#776A5E",
      peach: "#FFE8D8",
      shadow: "#3F2615",
      sheet: "#FFF6ED",
      surface: "#FFF9F2",
      text: "#1B2434",
    };
  }

  return {
    accent: colors.olive,
    background: colors.cream,
    buttonText: colors.onAccent,
    danger: colors.danger,
    dim: "rgba(11, 18, 32, 0.34)",
    input: colors.input,
    line: colors.line,
    muted: colors.muted,
    peach: colors.accentSubtle,
    shadow: colors.ink,
    sheet: colors.paper,
    surface: colors.paper,
    text: colors.ink,
  };
}

export function BibleScreen() {
  const { state } = useKoino();
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
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [selectedVersePosition, setSelectedVersePosition] = useState<BiblePosition | undefined>();
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

  const storageKey = useMemo(() => readerStorageKey(state.currentUserId), [state.currentUserId]);
  const puterTokenKey = useMemo(() => puterTokenStorageKey(state.currentUserId), [state.currentUserId]);
  const bibleVersion = bibleVersionFor(bibleVersionId);
  const readerPalette = useMemo(() => readerPaletteFor(readerTheme), [readerTheme]);
  const chapterVerses = useMemo(() => bibleChapterVerses(position.book, position.chapter, bibleVersionId), [bibleVersionId, position.book, position.chapter]);
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
  const readerFontFamily = fontFamilyFor(fontId);
  const effectiveFontSize = compactMode ? Math.max(minFontSize, fontSize - 1) : fontSize;
  const readerLineHeight = Math.round(effectiveFontSize * (compactMode ? 1.48 : 1.62));
  const contentWidth = width >= 780 ? 720 : undefined;
  const audioIsPreparing = audioPlaybackState === "preparing";
  const audioIsPlaying = audioPlaybackState === "playing";
  const audioMiniPlayerVisible = audioPlaybackState === "playing" || audioPlaybackState === "paused";
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
        showTemporaryHighlight(nextPreferences.position);
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

  const tryScrollToVerse = useCallback((verse: number, animated: boolean) => {
    const offset = verseOffsetsRef.current[verse];
    if (typeof offset !== "number") return false;
    pendingScrollVerseRef.current = undefined;
    scrollRef.current?.scrollTo({ animated, y: Math.max(0, offset - 18) });
    return true;
  }, []);

  const jumpToPosition = useCallback(
    (nextPosition: Partial<BiblePosition>, shouldScroll = true, shouldHighlight = true) => {
      const normalized = normalizeBiblePosition(nextPosition);
      const current = positionRef.current;
      const sameChapter = current.book === normalized.book && current.chapter === normalized.chapter;

      if (!sameChapter) {
        verseOffsetsRef.current = {};
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
      return;
    }
    setPickerVisible(true);
  }, [navigation]);

  const handleVersePress = useCallback((verse: number) => {
    const nextPosition = normalizeBiblePosition({ book: positionRef.current.book, chapter: positionRef.current.chapter, verse });
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = undefined;
    }
    setHighlightedPosition(undefined);
    setSelectedVersePosition(nextPosition);
  }, []);

  const handleVerseAction = useCallback((action: "pray" | "journal" | "save" | "share" | "references") => {
    if (action === "references") {
      if (selectedVersePosition) {
        setCrossReferencePosition(selectedVersePosition);
      }
      setSelectedVersePosition(undefined);
      return;
    }
    // TODO: Wire these calm response actions into prayer, journal, saved-verse, and room-sharing flows.
    setSelectedVersePosition(undefined);
  }, [selectedVersePosition]);

  const handleReflectionAction = useCallback((_action: "journal" | "pray" | "save") => {
    // TODO: Persist end-of-chapter reflection actions when the product flow is defined.
  }, []);

  const chapterSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => isChapterSwipeGesture(gesture.dx, gesture.dy),
        onMoveShouldSetPanResponderCapture: (_event, gesture) => isChapterSwipeGesture(gesture.dx, gesture.dy),
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) < 74 || Math.abs(gesture.dy) > 48) return;
          if (gesture.dx < 0 && nextChapter) {
            jumpToPosition(nextChapter);
            return;
          }
          if (gesture.dx > 0 && previousChapter) {
            jumpToPosition(previousChapter);
          }
        },
      }),
    [jumpToPosition, nextChapter, previousChapter],
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

  const openTopic = useCallback((topic: string) => {
    const nextTopic = topic.trim();
    if (!nextTopic) return;

    const requestId = topicRequestRef.current + 1;
    topicRequestRef.current = requestId;
    setSelectedTopic(nextTopic);
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
        leftIcon={readerCanGoBack ? "arrow-left" : "book-open"}
        leftLabel={readerCanGoBack ? "Go back" : "Choose Bible chapter"}
        onAudioPress={handleAudioToggle}
        onBack={handleReaderBack}
        onOpenPicker={() => setPickerVisible(true)}
        onOpenSettings={() => setSettingsVisible(true)}
        onOpenTopics={() => setTopicsVisible(true)}
        palette={readerPalette}
        subtitle={bibleVersion.label}
        title={chapterLabel(position)}
        topInset={insets.top}
      />

      <ScrollView
        ref={scrollRef}
        {...chapterSwipeResponder.panHandlers}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          alignSelf: "stretch",
          paddingBottom: audioMiniPlayerVisible ? Math.max(190, insets.bottom + 166) : Math.max(126, insets.bottom + 106),
          paddingHorizontal: 22,
          paddingTop: compactMode ? 12 : 18,
        }}
      >
        <View style={{ alignSelf: "center", gap: compactMode ? 20 : 28, maxWidth: contentWidth, width: "100%" }}>
          <BibleText
            audioHighlightActive={audioHighlightActive}
            audioPosition={audioPosition}
            compactMode={compactMode}
            crossReferenceAvailability={chapterCrossReferenceAvailability}
            highlightedPosition={highlightedPosition}
            onVerseLayout={handleVerseLayout}
            onVersePress={handleVersePress}
            palette={readerPalette}
            position={position}
            readerLineHeight={readerLineHeight}
            readerTextStyle={readerTextStyle}
            selectedVersePosition={selectedVersePosition}
            showCrossReferences={showCrossReferences}
            showVerseNumbers={showVerseNumbers}
            verses={chapterVerses}
          />

          <ChapterReflectionCard
            onAction={handleReflectionAction}
            onChangeText={setReflectionText}
            palette={readerPalette}
            value={reflectionText}
          />

          <NextChapterCard
            nextChapter={nextChapter}
            onPress={() => nextChapter && jumpToPosition(nextChapter)}
            palette={readerPalette}
          />
        </View>
      </ScrollView>

      {audioMiniPlayerVisible ? (
        <CompactAudioPlayer
          bottom={Math.max(92, insets.bottom + 78)}
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

      <VerseActionSheet
        onAction={handleVerseAction}
        onClose={() => setSelectedVersePosition(undefined)}
        palette={readerPalette}
        position={selectedVersePosition}
        visible={Boolean(selectedVersePosition)}
      />
      <ReadingSettingsSheet
        bibleVersionId={bibleVersionId}
        compactMode={compactMode}
        fontId={fontId}
        fontSize={fontSize}
        onChangeBibleVersion={chooseBibleVersion}
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
      <CrossReferenceSheet
        onClose={() => setCrossReferencePosition(undefined)}
        onReadChapter={readCrossReferenceChapter}
        position={crossReferencePosition}
        palette={readerPalette}
        readerTextStyle={readerTextStyle}
        references={selectedCrossReferences}
        visible={Boolean(crossReferencePosition)}
      />
      <BibleReferencePicker
        initialPosition={position}
        onClose={() => setPickerVisible(false)}
        onSelect={(nextPosition) => {
          setPickerVisible(false);
          jumpToPosition(nextPosition);
        }}
        versionLabel={bibleVersion.label}
        visible={pickerVisible}
      />
      <BibleTopicsModal onClose={closeTopics} onSelectTopic={openTopic} palette={readerPalette} visible={topicsVisible} />
      <BibleTopicDetailModal
        bibleVersionId={bibleVersionId}
        bibleVersionLabel={bibleVersion.label}
        error={topicError}
        loading={topicLoading}
        onBack={() => setTopicDetailVisible(false)}
        onClose={closeTopics}
        palette={readerPalette}
        references={topicResult?.references ?? []}
        topic={selectedTopic}
        visible={topicDetailVisible}
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
  leftIcon,
  leftLabel,
  onAudioPress,
  onBack,
  onOpenPicker,
  onOpenSettings,
  onOpenTopics,
  palette,
  subtitle,
  title,
  topInset,
}: {
  audioActive: boolean;
  audioDisabled: boolean;
  leftIcon: "arrow-left" | "book-open";
  leftLabel: string;
  onAudioPress: () => void;
  onBack: () => void;
  onOpenPicker: () => void;
  onOpenSettings: () => void;
  onOpenTopics: () => void;
  palette: ReaderPalette;
  subtitle: string;
  title: string;
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
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10, minHeight: 54 }}>
        <ReaderCircleButton accessibilityLabel={leftLabel} icon={leftIcon} onPress={onBack} palette={palette} />

        <Pressable
          accessibilityLabel="Choose Bible chapter"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onOpenPicker}
          style={{ alignItems: "center", flex: 1, minWidth: 0, paddingHorizontal: 4 }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 17, fontWeight: "900" }}>
              {title}
            </Text>
            <Feather name="chevron-down" size={14} color={palette.muted} />
          </View>
          <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 13, fontWeight: "700", marginTop: 3 }}>
            {subtitle}
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <ReaderCircleButton
            accessibilityLabel={audioActive ? "Pause audio Bible" : "Play audio Bible"}
            disabled={audioDisabled}
            icon="volume-2"
            onPress={onAudioPress}
            palette={palette}
          />
          <ReaderCircleButton accessibilityLabel="Open Bible topics" icon="hash" onPress={onOpenTopics} palette={palette} />
          <ReaderCircleButton accessibilityLabel="Open reading settings" onPress={onOpenSettings} palette={palette} text="Aa" />
        </View>
      </View>
    </View>
  );
}

function BibleTopicsModal({
  onClose,
  onSelectTopic,
  palette,
  visible,
}: {
  onClose: () => void;
  onSelectTopic: (topic: string) => void;
  palette: ReaderPalette;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
    }
  }, [visible]);

  function submitSearch() {
    const topic = query.trim();
    if (topic) {
      onSelectTopic(topic);
    }
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: palette.background, flex: 1 }}>
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

function BibleTopicDetailModal({
  bibleVersionId,
  bibleVersionLabel,
  error,
  loading,
  onBack,
  onClose,
  palette,
  references,
  topic,
  visible,
}: {
  bibleVersionId: BibleVersionId;
  bibleVersionLabel: string;
  error?: string;
  loading: boolean;
  onBack: () => void;
  onClose: () => void;
  palette: ReaderPalette;
  references: string[];
  topic: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const resolvedVerses = useMemo(
    () =>
      references.map((reference) => ({
        reference,
        verse: bibleVerseFromReference(reference, bibleVersionId),
      })),
    [bibleVersionId, references],
  );
  const title = topicTitle(topic || "Topic");

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onBack}>
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
    </Modal>
  );
}

function TopicVerseCard({
  bibleVersionLabel,
  item,
  palette,
}: {
  bibleVersionLabel: string;
  item: { reference: string; verse?: BibleVerse };
  palette: ReaderPalette;
}) {
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
  compactMode,
  crossReferenceAvailability,
  highlightedPosition,
  onVerseLayout,
  onVersePress,
  palette,
  position,
  readerLineHeight,
  readerTextStyle,
  selectedVersePosition,
  showCrossReferences,
  showVerseNumbers,
  verses,
}: {
  audioHighlightActive: boolean;
  audioPosition: BiblePosition;
  compactMode: boolean;
  crossReferenceAvailability: Record<number, boolean>;
  highlightedPosition?: BiblePosition;
  onVerseLayout: (verse: number, offset: number) => void;
  onVersePress: (verse: number) => void;
  palette: ReaderPalette;
  position: BiblePosition;
  readerLineHeight: number;
  readerTextStyle: TextStyle;
  selectedVersePosition?: BiblePosition;
  showCrossReferences: boolean;
  showVerseNumbers: boolean;
  verses: BibleChapterVerse[];
}) {
  const verseNumberStyle: TextStyle = {
    color: palette.muted,
    fontSize: Math.max(11, Number(readerTextStyle.fontSize ?? defaultFontSize) - 6),
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    lineHeight: readerLineHeight,
  };
  const markerStyle: TextStyle = {
    color: palette.accent,
    fontSize: Math.max(10, Number(readerTextStyle.fontSize ?? defaultFontSize) - 8),
    fontWeight: "800",
    lineHeight: readerLineHeight,
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
        const selected = highlighted || audioHighlighted || actionSelected;
        const isFirstVerse = index === 0;
        const showReferenceMarker = showCrossReferences && Boolean(crossReferenceAvailability[item.verse]);
        const marker = showReferenceMarker ? <Text style={markerStyle}> * </Text> : null;

        return (
          <Pressable
            accessibilityLabel={`${position.book} ${position.chapter}:${item.verse}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={item.reference}
            onLayout={(event) => onVerseLayout(item.verse, event.nativeEvent.layout.y)}
            onPress={() => onVersePress(item.verse)}
            style={{
              backgroundColor: selected ? palette.peach : "transparent",
              borderColor: selected ? palette.line : "transparent",
              borderRadius: radius.md,
              borderWidth: 1,
              paddingHorizontal: selected ? 10 : 0,
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
                <Text selectable style={[readerTextStyle, { flex: 1, paddingTop: 3 }]}>
                  {showVerseNumbers ? <Text style={verseNumberStyle}>{item.verse} </Text> : null}
                  {marker}
                  {item.text}
                </Text>
              </View>
            ) : (
              <Text selectable style={readerTextStyle}>
                {showVerseNumbers ? <Text style={verseNumberStyle}>{item.verse} </Text> : null}
                {marker}
                {item.text}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function VerseActionSheet({
  onAction,
  onClose,
  palette,
  position,
  visible,
}: {
  onAction: (action: "pray" | "journal" | "save" | "share" | "references") => void;
  onClose: () => void;
  palette: ReaderPalette;
  position?: BiblePosition;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  if (!visible || !position) return null;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: palette.dim, flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close verse actions" accessibilityRole="button" onPress={onClose} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
        <View
          style={{
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            gap: 2,
            maxHeight: "78%",
            paddingBottom: Math.max(28, insets.bottom + 20),
            paddingHorizontal: 20,
            paddingTop: 16,
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
          <ScrollView showsVerticalScrollIndicator={false}>
            <VerseSheetAction icon="heart" onPress={() => onAction("pray")} palette={palette} subtitle="Gör denna vers till ett böneämne" title="Be för detta" />
            <VerseSheetAction icon="book-open" onPress={() => onAction("journal")} palette={palette} subtitle="Reflektera över denna vers" title="Skriv i journalen" />
            <VerseSheetAction icon="bookmark" onPress={() => onAction("save")} palette={palette} subtitle="Spara till dina favoritverser" title="Spara vers" />
            <VerseSheetAction icon="users" onPress={() => onAction("share")} palette={palette} subtitle="Dela med ditt rum (valfritt)" title="Dela till rum" />
            <VerseSheetAction icon="link-2" onPress={() => onAction("references")} palette={palette} subtitle="Se relaterade bibelställen" title="Visa korsreferenser" />
          </ScrollView>
        </View>
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
  icon: "heart" | "book-open" | "bookmark" | "users" | "link-2";
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
  bibleVersionId,
  compactMode,
  fontId,
  fontSize,
  onChangeBibleVersion,
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
  bibleVersionId: BibleVersionId;
  compactMode: boolean;
  fontId: BibleReaderFontId;
  fontSize: number;
  onChangeBibleVersion: (versionId: BibleVersionId) => void;
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
              <Text style={{ color: palette.text, flex: 1, fontSize: 20, fontWeight: "900" }}>Läsinställningar</Text>
              <ReaderCircleButton accessibilityLabel="Close reading settings" icon="x" onPress={onClose} palette={palette} />
            </View>

            <SettingsGroup palette={palette} title="Bibelversion">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {bibleVersions.map((version) => (
                  <SettingChip
                    key={version.id}
                    label={version.label}
                    onPress={() => onChangeBibleVersion(version.id)}
                    palette={palette}
                    selected={version.id === bibleVersionId}
                  />
                ))}
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title="Typsnitt">
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

            <SettingsGroup palette={palette} title="Textstorlek">
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
                <SettingsStepperButton disabled={fontSize <= minFontSize} icon="minus" label="Minska textstorlek" onPress={() => onFontSizeChange(-fontSizeStep)} palette={palette} />
                <Text style={{ color: palette.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900", minWidth: 30, textAlign: "center" }}>
                  {fontSize}
                </Text>
                <SettingsStepperButton disabled={fontSize >= maxFontSize} icon="plus" label="Öka textstorlek" onPress={() => onFontSizeChange(fontSizeStep)} palette={palette} />
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title="Tema">
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

            <SettingsGroup palette={palette} title="Läsningsinställningar">
              <View style={{ gap: 2 }}>
                <SettingsToggle label="Visa versnummer" onChange={onChangeShowVerseNumbers} palette={palette} value={showVerseNumbers} />
                <SettingsToggle label="Visa korsreferenser" onChange={onChangeShowCrossReferences} palette={palette} value={showCrossReferences} />
                <SettingsToggle label="Visa fotnoter" onChange={onChangeShowFootnotes} palette={palette} value={showFootnotes} />
                <SettingsToggle label="Kompakt läge" onChange={onCompactModeChange} palette={palette} value={compactMode} />
              </View>
            </SettingsGroup>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
        placeholder="Skriv din reflektion..."
        placeholderTextColor={palette.muted}
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
              placeholder="Paste Puter auth token"
              secureTextEntry={false}
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

function BibleReferencePicker({
  initialPosition,
  onClose,
  onSelect,
  versionLabel,
  visible,
}: {
  initialPosition: BiblePosition;
  onClose: () => void;
  onSelect: (position: BiblePosition) => void;
  versionLabel: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<PickerStage>("book");
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState(initialPosition.book);
  const [selectedChapter, setSelectedChapter] = useState(initialPosition.chapter);

  useEffect(() => {
    if (!visible) return;
    const normalized = normalizeBiblePosition(initialPosition);
    setStage("book");
    setBookQuery("");
    setSelectedBook(normalized.book);
    setSelectedChapter(normalized.chapter);
  }, [initialPosition, visible]);

  const book = kjvBooks.find((item) => item.name === selectedBook) ?? kjvBooks[0];
  const selectableBooks = kjvBooks.filter((item) => item.name.toLowerCase().includes(bookQuery.trim().toLowerCase()));
  const selectableVerses = versesForChapter(selectedBook, selectedChapter);
  const title = stage === "book" ? "Choose book" : stage === "chapter" ? selectedBook : `${selectedBook} ${selectedChapter}`;

  function goBack() {
    if (stage === "verse") {
      setStage("chapter");
      return;
    }
    if (stage === "chapter") {
      setStage("book");
      return;
    }
    onClose();
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
    <Modal animationType="slide" visible={visible} onRequestClose={goBack}>
      <View style={{ backgroundColor: colors.cream, flex: 1 }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: Math.max(28, insets.bottom + 18), paddingTop: insets.top + 18 }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <IconButton accessibilityLabel={stage === "book" ? "Close reference picker" : "Back"} icon={stage === "book" ? "x" : "arrow-left"} onPress={goBack} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>{title}</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>{versionLabel}</Text>
            </View>
          </View>

          {stage === "book" ? (
            <>
              <TextInputField autoCapitalize="words" autoCorrect={false} onChangeText={setBookQuery} placeholder="Search books" value={bookQuery} />
              <View style={{ gap: 8 }}>
                {selectableBooks.length > 0 ? (
                  selectableBooks.map((item) => (
                    <Pressable
                      accessibilityRole="button"
                      key={item.name}
                      onPress={() => chooseBook(item.name)}
                      style={{
                        alignItems: "center",
                        backgroundColor: item.name === selectedBook ? colors.accentSubtle : colors.paper,
                        borderColor: item.name === selectedBook ? colors.gold : colors.line,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        flexDirection: "row",
                        gap: 12,
                        minHeight: 54,
                        paddingHorizontal: 14,
                      }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{item.name}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                          {item.chapters.length} {item.chapters.length === 1 ? "chapter" : "chapters"}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.muted} />
                    </Pressable>
                  ))
                ) : (
                  <Card>
                    <BodyText muted>No books match that search.</BodyText>
                  </Card>
                )}
              </View>
            </>
          ) : null}

          {stage === "chapter" ? (
            <View style={{ gap: 10 }}>
              <SectionHeading muted>Chapter</SectionHeading>
              <PickerGrid
                selected={selectedChapter}
                values={book?.chapters ?? []}
                onSelect={chooseChapter}
              />
            </View>
          ) : null}

          {stage === "verse" ? (
            <View style={{ gap: 10 }}>
              <SectionHeading muted>Verse</SectionHeading>
              <PickerGrid
                selected={initialPosition.book === selectedBook && initialPosition.chapter === selectedChapter ? initialPosition.verse : undefined}
                values={selectableVerses}
                onSelect={(verse) => onSelect(normalizeBiblePosition({ book: selectedBook, chapter: selectedChapter, verse }))}
              />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function PickerGrid({
  onSelect,
  selected,
  values,
}: {
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
              backgroundColor: isSelected ? colors.accentSubtle : colors.paper,
              borderColor: isSelected ? colors.gold : colors.line,
              borderRadius: radius.md,
              borderWidth: 1,
              height: 46,
              justifyContent: "center",
              width: 54,
            }}
          >
            <Text style={{ color: isSelected ? colors.olive : colors.ink, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900" }}>{value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
