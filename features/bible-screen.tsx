import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  TextStyle,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import {
  bibleChapterVerses,
  bibleCrossReferences,
  bibleVersionFor,
  bibleVersions,
  type BibleCrossReference,
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
import { useKoino } from "@/state/koino-store";
import { BodyText, Card, IconButton, SecondaryButton, SectionHeading, TextInputField } from "@/ui/app-components";
import { colors, platformShadow, radius } from "@/ui/theme";

const readerFonts = [
  { id: "serif", label: "Serif" },
  { id: "classic", label: "Classic" },
  { id: "humanist", label: "Humanist" },
  { id: "system", label: "System" },
  { id: "mono", label: "Mono" },
] as const;

type BibleReaderFontId = (typeof readerFonts)[number]["id"];
type PickerStage = "book" | "chapter" | "verse";

type BibleReaderPreferences = {
  audioPosition: BiblePosition;
  audioVoiceId: string;
  audioVoiceName?: string;
  bibleVersionId: BibleVersionId;
  fontId: BibleReaderFontId;
  fontSize: number;
  position: BiblePosition;
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

const defaultPosition = normalizeBiblePosition();
const defaultBibleVersionId: BibleVersionId = "kjv";
const defaultFontId: BibleReaderFontId = "serif";
const defaultFontSize = 18;
const minFontSize = 16;
const maxFontSize = 28;
const fontSizeStep = 2;
const elevenLabsTurboModel = "eleven_turbo_v2_5";
const puterDashboardUrl = "https://puter.com/dashboard#account";
const defaultAudioVoice: AudioVoice = { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Clear sample voice" };
const fallbackAudioVoices: AudioVoice[] = [
  defaultAudioVoice,
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", description: "Warm and steady" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft and bright" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Calm narration" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", description: "Gentle reading" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Grounded voice" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep narration" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", description: "Measured tone" },
];

function readerStorageKey(userId?: string) {
  return userId ? `koino.bibleReader.${userId}` : undefined;
}

function puterTokenStorageKey(userId?: string) {
  return userId ? `koino.puterAuthToken.${userId}` : "koino.puterAuthToken";
}

function isReaderFontId(value: unknown): value is BibleReaderFontId {
  return typeof value === "string" && readerFonts.some((font) => font.id === value);
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
      fontId: defaultFontId,
      fontSize: defaultFontSize,
      position: defaultPosition,
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
      fontId: isReaderFontId(parsed?.fontId) ? parsed.fontId : defaultFontId,
      fontSize: normalizeFontSize(parsed?.fontSize),
      position,
    };
  } catch {
    return {
      audioPosition: defaultPosition,
      audioVoiceId: defaultAudioVoice.id,
      audioVoiceName: defaultAudioVoice.name,
      bibleVersionId: defaultBibleVersionId,
      fontId: defaultFontId,
      fontSize: defaultFontSize,
      position: defaultPosition,
    };
  }
}

function fontFamilyFor(fontId: BibleReaderFontId) {
  if (fontId === "system") return undefined;
  if (fontId === "mono") {
    if (Platform.OS === "ios") return "Menlo";
    if (Platform.OS === "android") return "monospace";
    return "Menlo, Consolas, monospace";
  }
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

export function BibleScreen() {
  const { state } = useKoino();
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

  const [position, setPosition] = useState<BiblePosition>(defaultPosition);
  const [audioPosition, setAudioPosition] = useState<BiblePosition>(defaultPosition);
  const [highlightedPosition, setHighlightedPosition] = useState<BiblePosition | undefined>();
  const [bibleVersionId, setBibleVersionId] = useState<BibleVersionId>(defaultBibleVersionId);
  const [fontId, setFontId] = useState<BibleReaderFontId>(defaultFontId);
  const [fontSize, setFontSize] = useState(defaultFontSize);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
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

  const storageKey = useMemo(() => readerStorageKey(state.currentUserId), [state.currentUserId]);
  const puterTokenKey = useMemo(() => puterTokenStorageKey(state.currentUserId), [state.currentUserId]);
  const bibleVersion = bibleVersionFor(bibleVersionId);
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
  const readerLineHeight = Math.round(fontSize * 1.62);
  const contentWidth = width >= 780 ? 720 : undefined;
  const audioIsPreparing = audioPlaybackState === "preparing";
  const audioIsPlaying = audioPlaybackState === "playing";
  const audioHighlightActive = audioPlaybackState === "preparing" || audioPlaybackState === "playing" || audioPlaybackState === "paused";
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
        setFontId(nextPreferences.fontId);
        setFontSize(nextPreferences.fontSize);
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
      const payload: BibleReaderPreferences = { audioPosition, audioVoiceId: audioVoice.id, audioVoiceName: audioVoice.name, bibleVersionId, fontId, fontSize, position };
      void AsyncStorage.setItem(storageKey, JSON.stringify(payload));
    }, 250);

    return () => clearTimeout(timeout);
  }, [audioPosition, audioVoice.id, audioVoice.name, bibleVersionId, fontId, fontSize, position, preferencesReady, storageKey]);

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
      if (audioPlaybackState === "playing" || audioPlaybackState === "preparing") {
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

    startVerseAudio(audioPositionRef.current);
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
    await WebBrowser.openBrowserAsync(puterDashboardUrl);
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

  function changeFontSize(delta: number) {
    setFontSize((current) => normalizeFontSize(current + delta));
  }

  const readerTextStyle: TextStyle = {
    color: colors.ink,
    fontFamily: readerFontFamily,
    fontSize,
    fontWeight: "400",
    lineHeight: readerLineHeight,
  };

  return (
    <View style={{ backgroundColor: colors.cream, flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          alignSelf: "stretch",
          gap: 16,
          padding: 18,
          paddingBottom: Math.max(112, insets.bottom + 92),
        }}
      >
        <View style={{ alignSelf: "center", gap: 16, maxWidth: contentWidth, width: "100%" }}>
          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.ink, fontSize: 30, fontWeight: "900", lineHeight: 36 }}>Bible</Text>
            <BodyText muted selectable>
              {referenceLabel(position)} - {bibleVersion.label}
            </BodyText>
          </View>

          <Card style={{ gap: 16, padding: 16 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" }}>Current place</Text>
                <Text selectable style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>
                  {referenceLabel(position)}
                </Text>
              </View>
              <SecondaryButton icon="search" onPress={() => setPickerVisible(true)} style={{ minHeight: 44, paddingHorizontal: 14 }}>
                Choose
              </SecondaryButton>
            </View>

            <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
              <ChapterButton disabled={!previousChapter} icon="chevron-left" label="Previous" onPress={() => previousChapter && jumpToPosition(previousChapter)} />
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.input,
                  borderColor: colors.line,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  flex: 1,
                  minHeight: 46,
                  justifyContent: "center",
                  paddingHorizontal: 10,
                }}
              >
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                  {position.book} {position.chapter}
                </Text>
              </View>
              <ChapterButton disabled={!nextChapter} icon="chevron-right" label="Next" onPress={() => nextChapter && jumpToPosition(nextChapter)} />
            </View>
          </Card>

          <Card style={{ gap: 14, padding: 16 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 3 }}>
                <SectionHeading>Audio Bible</SectionHeading>
                <Text selectable style={{ color: audioPlaybackState === "error" ? colors.danger : colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 18 }}>
                  {audioStatusLabel}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={audioIsPlaying || audioIsPreparing ? "Pause audio Bible" : "Play audio Bible"}
                accessibilityRole="button"
                disabled={!bridgeReady && audioPlaybackState !== "paused"}
                onPress={handleAudioToggle}
                style={{
                  alignItems: "center",
                  backgroundColor: !bridgeReady && audioPlaybackState !== "paused" ? colors.disabled : colors.olive,
                  borderRadius: 999,
                  height: 50,
                  justifyContent: "center",
                  opacity: !bridgeReady && audioPlaybackState !== "paused" ? 0.72 : 1,
                  width: 50,
                }}
              >
                <Feather name={audioIsPlaying || audioIsPreparing ? "pause" : "play"} size={21} color={colors.paper} />
              </Pressable>
            </View>

            <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
              <ChapterButton disabled={!previousAudioChapter || audioIsPreparing} icon="chevron-left" label="Back" onPress={() => previousAudioChapter && handleAudioChapterJump(previousAudioChapter)} />
              <Pressable
                accessibilityLabel="Choose audio voice"
                accessibilityRole="button"
                onPress={() => setVoicePickerVisible(true)}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.input,
                  borderColor: colors.line,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  flex: 1,
                  flexDirection: "row",
                  gap: 8,
                  minHeight: 46,
                  justifyContent: "center",
                  paddingHorizontal: 10,
                }}
              >
                <Feather name="volume-2" size={16} color={colors.olive} />
                <Text numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontSize: 14, fontWeight: "900" }}>
                  {audioVoice.name}
                </Text>
                <Feather name="chevron-down" size={15} color={colors.muted} />
              </Pressable>
              <ChapterButton disabled={!nextAudioChapter || audioIsPreparing} icon="chevron-right" label="Forward" onPress={() => nextAudioChapter && handleAudioChapterJump(nextAudioChapter)} />
            </View>

            <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <SecondaryButton icon={puterAuthToken ? "check" : "external-link"} onPress={() => setPuterTokenModalVisible(true)} style={{ minHeight: 40, paddingHorizontal: 12 }}>
                {puterAuthToken ? "Puter connected" : "Connect Puter"}
              </SecondaryButton>
              {puterAuthToken ? (
                <Pressable accessibilityRole="button" onPress={forgetPuterAuthToken} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 8 }}>
                  <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>Forget token</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>

          <Card style={{ gap: 14, padding: 16 }}>
            <SectionHeading>Reading style</SectionHeading>
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>Bible version</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {bibleVersions.map((version) => {
                  const selected = version.id === bibleVersionId;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={version.id}
                      onPress={() => chooseBibleVersion(version.id)}
                      style={{
                        alignItems: "center",
                        backgroundColor: selected ? colors.accentSubtle : colors.paper,
                        borderColor: selected ? colors.gold : colors.line,
                        borderRadius: 999,
                        borderWidth: 1,
                        justifyContent: "center",
                        minHeight: 40,
                        paddingHorizontal: 14,
                      }}
                    >
                      <Text style={{ color: selected ? colors.olive : colors.muted, fontSize: 14, fontWeight: "900" }}>{version.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {readerFonts.map((font) => {
                const selected = font.id === fontId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={font.id}
                    onPress={() => setFontId(font.id)}
                    style={{
                      alignItems: "center",
                      backgroundColor: selected ? colors.accentSubtle : colors.paper,
                      borderColor: selected ? colors.gold : colors.line,
                      borderRadius: 999,
                      borderWidth: 1,
                      justifyContent: "center",
                      minHeight: 40,
                      paddingHorizontal: 14,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.olive : colors.muted,
                        fontFamily: fontFamilyFor(font.id),
                        fontSize: 14,
                        fontWeight: "900",
                      }}
                    >
                      {font.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
              <Text style={{ color: colors.ink, flex: 1, fontSize: 15, fontWeight: "900" }}>Font size</Text>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.input,
                  borderColor: colors.line,
                  borderRadius: 999,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: 10,
                  padding: 5,
                }}
              >
                <StepperButton disabled={fontSize <= minFontSize} icon="minus" label="Decrease font size" onPress={() => changeFontSize(-fontSizeStep)} />
                <Text style={{ color: colors.ink, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900", minWidth: 28, textAlign: "center" }}>
                  {fontSize}
                </Text>
                <StepperButton disabled={fontSize >= maxFontSize} icon="plus" label="Increase font size" onPress={() => changeFontSize(fontSizeStep)} />
              </View>
            </View>
          </Card>

          <View
            style={{
              backgroundColor: colors.paper,
              borderColor: colors.line,
              borderRadius: radius.xl,
              borderWidth: 1,
              gap: 14,
              padding: 18,
              ...platformShadow({
                boxShadow: "0 10px 24px rgba(11, 18, 32, 0.055)",
                offset: { width: 0, height: 10 },
                opacity: 0.055,
                radius: 24,
              }),
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>{position.book}</Text>
              <Text style={{ color: colors.gold, fontSize: 22, fontWeight: "900" }}>{position.chapter}</Text>
            </View>

            <View style={{ gap: 2 }}>
              {chapterVerses.map((item) => {
                const hasCrossReferences = chapterCrossReferenceAvailability[item.verse];
                const highlighted =
                  highlightedPosition?.book === position.book &&
                  highlightedPosition.chapter === position.chapter &&
                  highlightedPosition.verse === item.verse;
                const audioHighlighted =
                  audioHighlightActive &&
                  audioPosition.book === position.book &&
                  audioPosition.chapter === position.chapter &&
                  audioPosition.verse === item.verse;
                const selected = highlighted || audioHighlighted;
                return (
                  <Pressable
                    aria-selected={selected}
                    key={item.reference}
                    onLayout={(event) => handleVerseLayout(item.verse, event.nativeEvent.layout.y)}
                    onPress={() => jumpToPosition({ ...position, verse: item.verse }, false)}
                    role={hasCrossReferences ? "group" : "button"}
                    style={{
                      backgroundColor: selected ? colors.accentSubtle : "transparent",
                      borderColor: audioHighlighted ? colors.gold : "transparent",
                      borderRadius: radius.md,
                      borderWidth: 1,
                      flexDirection: "row",
                      gap: 8,
                      paddingHorizontal: 0,
                      paddingVertical: 7,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.olive : colors.muted,
                        fontSize: Math.max(12, fontSize - 5),
                        fontVariant: ["tabular-nums"],
                        fontWeight: "900",
                        lineHeight: readerLineHeight,
                        textAlign: "left",
                        width: 24,
                      }}
                    >
                      {item.verse}
                    </Text>
                    {hasCrossReferences ? (
                      <Pressable
                        aria-label={`Show cross references for ${position.book} ${position.chapter}:${item.verse}`}
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          openCrossReferences(item.verse);
                        }}
                        role="button"
                        style={{
                          alignItems: "center",
                          backgroundColor: colors.accentSubtle,
                          borderColor: colors.line,
                          borderRadius: 999,
                          borderWidth: 1,
                          height: 26,
                          justifyContent: "center",
                          marginTop: Math.max(0, Math.round((readerLineHeight - 26) / 2)),
                          width: 26,
                        }}
                      >
                        <Feather name="link-2" size={13} color={colors.olive} />
                      </Pressable>
                    ) : null}
                    <Text selectable style={[readerTextStyle, { flex: 1 }]}>
                      {item.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      <CrossReferenceSheet
        onClose={() => setCrossReferencePosition(undefined)}
        onReadChapter={readCrossReferenceChapter}
        position={crossReferencePosition}
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

function CrossReferenceSheet({
  onClose,
  onReadChapter,
  position,
  readerTextStyle,
  references,
  visible,
}: {
  onClose: () => void;
  onReadChapter: (position: BiblePosition) => void;
  position?: BiblePosition;
  readerTextStyle: TextStyle;
  references: BibleCrossReference[];
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(height * 0.78), 680);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const sheetVerseFontSize = typeof readerTextStyle.fontSize === "number" ? Math.max(18, readerTextStyle.fontSize) : 18;
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
        <Pressable accessibilityLabel="Close cross references" style={{ backgroundColor: "rgba(11, 18, 32, 0.28)", flex: 1 }} onPress={() => closeWithAnimation()} />
        <Animated.View
          style={{
            backgroundColor: colors.paper,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            height: sheetHeight,
            overflow: "hidden",
            paddingBottom: insets.bottom,
            transform: [{ translateY }],
            ...platformShadow({
              boxShadow: "0 -16px 34px rgba(11, 18, 32, 0.18)",
              offset: { width: 0, height: -10 },
              opacity: 0.14,
              radius: 26,
            }),
          }}
        >
          <View style={{ alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: 1, gap: 10, paddingHorizontal: 18, paddingTop: 8 }}>
            <View {...panResponder.panHandlers} style={{ alignItems: "center", height: 22, justifyContent: "center", width: 120 }}>
              <View style={{ backgroundColor: colors.disabled, borderRadius: 999, height: 5, width: 56 }} />
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingBottom: 14, width: "100%" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{referenceLabel(position)}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>
                  {references.length} {references.length === 1 ? "cross reference" : "cross references"}
                </Text>
              </View>
              <IconButton accessibilityLabel="Close cross references" icon="x" onPress={() => closeWithAnimation()} />
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 18 }}>
            {references.length > 0 ? (
              references.map((reference, index) => (
                <View
                  key={`${reference.source}-${index}`}
                  style={{
                    borderBottomColor: index === references.length - 1 ? "transparent" : colors.line,
                    borderBottomWidth: 1,
                    gap: 8,
                    paddingBottom: 18,
                    paddingTop: index === 0 ? 0 : 18,
                  }}
                >
                  <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                    <Text selectable style={{ color: colors.ink, flex: 1, fontSize: 18, fontWeight: "900" }}>
                      {reference.reference}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "800" }}>{reference.votes} votes</Text>
                  </View>
                  <Text selectable style={[readerTextStyle, { color: colors.muted, fontSize: sheetVerseFontSize, lineHeight: sheetVerseLineHeight }]}>
                    {reference.text}
                  </Text>
                  <Pressable
                    accessibilityLabel={`Read ${reference.startPosition.book} ${reference.startPosition.chapter}`}
                    accessibilityRole="button"
                    onPress={() => closeWithAnimation(() => onReadChapter(reference.startPosition))}
                    style={{ alignSelf: "flex-start", minHeight: 34, justifyContent: "center" }}
                  >
                    <Text style={{ color: colors.olive, fontSize: 15, fontWeight: "900" }}>Read this chapter</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Card>
                <BodyText muted>No readable cross references were found for this verse.</BodyText>
              </Card>
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
