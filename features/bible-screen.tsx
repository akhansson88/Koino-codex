import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
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
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import bibleTopicIndexData from "@/assets/bible/topics-index.json";
import { nextUnreadPlanDay, todayPlanDay } from "@/state/bible-plan-schedule";
import {
  currentPlanDay,
  biblePlanDayRegionLabel,
  firstPositionForPlanDay,
  planMarkersForChapter,
  type BiblePlanMarker,
  type BiblePlanMarkerKind,
  type BiblePlanCurrentDay,
  completionPercent,
  dayKeyForPlanDay,
  todayDateKey,
} from "@/features/bible-plans";
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
  searchBibleText,
  type BibleTextSearchResult,
  versesForChapter,
} from "@/features/bible-kjv";
import { defaultBibleVersionId, notifyBibleVersionPreferenceChanged, readerStorageKey } from "@/features/bible-preferences";
import { biblePositionFromSearchQuery, displayBibleBookName, displayBibleReference } from "@/features/bible-search";
import { useKoino } from "@/state/koino-store";
import { visibility, type EntryVisibility } from "@/state/product";
import { savedVerseIdentity } from "@/state/saved-verses";
import { BodyText, Card, IconButton, PrimaryButton, SecondaryButton, SectionHeading, TextInputField } from "@/ui/app-components";
import { confirmAction } from "@/ui/confirm";
import { useAppTranslation } from "@/ui/app-language";
import type { AppLanguage, TranslationFunction, TranslationKey } from "@/ui/localization";
import { SharedComposer, type BibleComposerIntent } from "@/ui/shared-composer";
import { colors, platformShadow, radius, themes, type ThemeName } from "@/ui/theme";
import type { BibleHighlight, BibleHighlightColor, BibleHighlightPaletteColor, BiblePlan, BibleVerse, EntryKind, JournalEntry, SavedVerse } from "@/state/types";

type FeatherName = ComponentProps<typeof Feather>["name"];

const bibleVerseWebInteractionStyle =
  Platform.OS === "web"
    ? ({
        userSelect: "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
      } as TextStyle & ViewStyle)
    : undefined;

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
type PickerStage = "home" | "search" | "book" | "chapter" | "saved" | "highlights" | "reflections";
type TestamentFilter = "all" | "old" | "new";
type VerseQuickAction = "copy" | "highlight" | "journal" | "pray" | "save" | "share";

type BibleReaderPreferences = {
  appTheme?: ThemeName;
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

type BibleReaderThemePreference = Pick<BibleReaderPreferences, "appTheme" | "readerTheme">;

type BibleTopicResult = {
  count: number;
  references: BibleTopicReference[];
  source: "openbible" | "text-search";
  sourceUrl: string;
  topic: string;
};

type BibleTopicReference = {
  reference: string;
  votes: number;
  voteId?: string;
};

type BibleTopicIndexItem = {
  letter: string;
  name: string;
  passageCount: number;
  slug: string;
  verseCount: number;
};

type BibleTopicVoteValue = -1 | 1;

type SuggestedTopic = {
  apiTopic: string;
  icon: FeatherName;
  subtitleKey: TranslationKey;
  titleKey: TranslationKey;
  tone: "peach" | "green" | "rose" | "blue";
};

const suggestedTopics: SuggestedTopic[] = [
  { apiTopic: "Anxiety", icon: "cloud-rain", subtitleKey: "bible.topic.anxiety.subtitle", titleKey: "bible.topic.anxiety.title", tone: "peach" },
  { apiTopic: "Hope", icon: "sunrise", subtitleKey: "bible.topic.hope.subtitle", titleKey: "bible.topic.hope.title", tone: "green" },
  { apiTopic: "Forgiveness", icon: "heart", subtitleKey: "bible.topic.forgiveness.subtitle", titleKey: "bible.topic.forgiveness.title", tone: "rose" },
  { apiTopic: "Identity", icon: "user", subtitleKey: "bible.topic.identity.subtitle", titleKey: "bible.topic.identity.title", tone: "peach" },
  { apiTopic: "Loneliness", icon: "users", subtitleKey: "bible.topic.loneliness.subtitle", titleKey: "bible.topic.loneliness.title", tone: "green" },
  { apiTopic: "Purpose", icon: "compass", subtitleKey: "bible.topic.purpose.subtitle", titleKey: "bible.topic.purpose.title", tone: "rose" },
  { apiTopic: "Prayer", icon: "message-circle", subtitleKey: "bible.topic.prayer.subtitle", titleKey: "bible.topic.prayer.title", tone: "peach" },
];

const bibleTopicAlphabet = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

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

type MeasurableView = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
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

function highlightColorWithOpacity(value: BibleHighlightColor, opacity: number) {
  const normalized = normalizeHexColor(value);
  if (!isHexColor(normalized)) return value;

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function highlightTime(highlight: BibleHighlight) {
  const parsed = Date.parse(highlight.updatedAt || highlight.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isReaderFontId(value: unknown): value is BibleReaderFontId {
  return typeof value === "string" && readerFonts.some((font) => font.id === value);
}

function isReaderThemeId(value: unknown): value is BibleReaderThemeId {
  return typeof value === "string" && readerThemes.some((theme) => theme.id === value);
}

function isAppTheme(value: unknown): value is ThemeName {
  return value === "light" || value === "dark";
}

function normalizeFontSize(value: unknown) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : defaultFontSize;
  const clamped = Math.min(maxFontSize, Math.max(minFontSize, numericValue));
  return minFontSize + Math.round((clamped - minFontSize) / fontSizeStep) * fontSizeStep;
}

function parsePreferences(value: string | null): BibleReaderPreferences {
  if (!value) {
    return {
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
    const position = normalizeBiblePosition(parsed?.position);
    return {
      appTheme: isAppTheme(parsed?.appTheme) ? parsed.appTheme : undefined,
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

function referenceLabel(position: BiblePosition, language: AppLanguage = "en") {
  return `${displayBibleBookName(position.book, language)} ${position.chapter}:${position.verse}`;
}

function chapterLabel(position: BiblePosition, language: AppLanguage = "en") {
  return `${displayBibleBookName(position.book, language)} ${position.chapter}`;
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

function testamentForBook(bookName: string): TestamentFilter {
  const index = kjvBooks.findIndex((book) => book.name === bookName);
  if (index < 0) return "all";
  return index < oldTestamentBookCount ? "old" : "new";
}

function bibleVersionShortLabel(versionId: BibleVersionId) {
  if (versionId === "reformationsbibeln2026") return "RB26";
  return "KJV";
}

function bibleVersionDescription(versionId: BibleVersionId, t: TranslationFunction) {
  if (versionId === "reformationsbibeln2026") return t("bible.version.description.reformationsbibeln2026");
  return t("bible.version.description.kjv");
}

function readerFontLabel(fontId: BibleReaderFontId, t: TranslationFunction) {
  if (fontId === "classic") return t("bible.settings.font.classic");
  if (fontId === "humanist") return t("bible.settings.font.humanist");
  if (fontId === "system") return t("bible.settings.font.system");
  return t("bible.settings.font.serif");
}

function readerThemeLabel(themeId: BibleReaderThemeId, t: TranslationFunction) {
  if (themeId === "dark") return t("bible.settings.theme.dark");
  if (themeId === "sepia") return t("bible.settings.theme.sepia");
  return t("bible.settings.theme.light");
}

let bibleTopicIndexPromise: Promise<BibleTopicIndexItem[]> | undefined;

function bibleTopicKey(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function bibleTopicVoteKey(topic: string, voteId: string) {
  return `${bibleTopicKey(topic)}:${voteId}`;
}

function bibleTopicSourceUrl(topic: string) {
  return `https://www.openbible.info/topics/${encodeURIComponent(bibleTopicKey(topic))}`;
}

function decodeBibleTopicHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseBibleTopicReferences(html: string): BibleTopicReference[] {
  const references: BibleTopicReference[] = [];
  const seen = new Set<string>();
  const headingPattern = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const referencePattern = /<a\b[^>]*class="[^"]*\bbibleref\b[^"]*"[^>]*>([^<]+)<\/a>/i;

  for (const headingMatch of html.matchAll(headingPattern)) {
    const heading = headingMatch[1];
    const referenceMatch = heading.match(referencePattern);
    if (!referenceMatch) continue;

    const reference = decodeBibleTopicHtml(referenceMatch[1]);
    if (!reference || seen.has(reference)) continue;
    seen.add(reference);
    const voteId = heading.match(/\bid=["']vote_u_([0-9]+(?:-[0-9]+)?)["']/i)?.[1];
    const voteText = decodeBibleTopicHtml(heading.replace(/<[^>]+>/g, " "));
    const votes = Number(voteText.match(/([\d,]+)\s+helpful\s+votes?/i)?.[1].replace(/,/g, "")) || 0;
    references.push({ reference, votes, ...(voteId ? { voteId } : {}) });
  }

  return references.sort((left, right) => right.votes - left.votes || left.reference.localeCompare(right.reference));
}

async function fetchBibleTopicIndex() {
  if (!bibleTopicIndexPromise) {
    bibleTopicIndexPromise = Promise.resolve(bibleTopicIndexData.topics as BibleTopicIndexItem[]);
  }
  return bibleTopicIndexPromise;
}

async function fetchBibleTopic(topic: string) {
  const sourceUrl = bibleTopicSourceUrl(topic);
  const response = await fetch(sourceUrl, { headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!response.ok) throw new Error(`Topic request failed with ${response.status}`);
  const references = parseBibleTopicReferences((await response.text()).slice(0, 400_000));
  if (references.length === 0) throw new Error("The topic response did not include Bible references.");
  return {
    count: references.length,
    references,
    source: "openbible" as const,
    sourceUrl,
    topic,
  };
}

async function searchBibleTopicText(topic: string, bibleVersionId: BibleVersionId): Promise<BibleTopicReference[]> {
  const directResults = await searchBibleText(topic, bibleVersionId, 20);
  if (directResults.length > 0) return directResults.map((item) => ({ reference: item.reference, votes: 0 }));

  const stopWords = new Set(["about", "after", "also", "and", "are", "att", "den", "det", "for", "från", "för", "how", "hur", "med", "och", "som", "that", "the", "this", "till", "using", "vad", "what", "with"]);
  const tokens = topic
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .slice(0, 6);
  if (tokens.length === 0) return [];

  const tokenResults = await Promise.all(tokens.map((token) => searchBibleText(token, bibleVersionId, 6)));
  const seen = new Set<string>();
  return tokenResults
    .flat()
    .filter((item) => {
      if (seen.has(item.reference)) return false;
      seen.add(item.reference);
      return true;
    })
    .slice(0, 20)
    .map((item) => ({ reference: item.reference, votes: 0 }));
}

async function submitBibleTopicVote(topic: string, voteId: string, value: BibleTopicVoteValue) {
  const slug = bibleTopicKey(topic);
  const sourceUrl = bibleTopicSourceUrl(topic);
  const topicResponse = await fetch(sourceUrl, { headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!topicResponse.ok) throw new Error(`Topic validation failed with ${topicResponse.status}`);
  const topicHtml = (await topicResponse.text()).slice(0, 400_000);
  const databaseCode = topicHtml.match(/\bid=["']db["'][^>]*\bvalue=["']([^"']+)["']/i)?.[1] || "dy";
  const voteButtonId = `vote_${value === 1 ? "u" : "d"}_${voteId}`;
  const response = await fetch(`https://www.openbible.info/topics/tools/vote?w=${encodeURIComponent(slug)}`, {
    body: new URLSearchParams({ db: databaseCode, id: voteButtonId, word: slug }).toString(),
    headers: { Accept: "*/*", "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Vote request failed with ${response.status}`);
}

function topicTitle(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function localizedTopicTitle(value: string, t: TranslationFunction) {
  const suggestedTopic = suggestedTopics.find((topic) => topic.apiTopic.toLowerCase() === value.trim().toLowerCase());
  return suggestedTopic ? t(suggestedTopic.titleKey) : topicTitle(value);
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

  const lightColors = themes.light;

  if (theme === "sepia") {
    return {
      accent: lightColors.textMuted,
      background: lightColors.cardPaper,
      buttonText: lightColors.onAccent,
      danger: lightColors.danger,
      dim: "rgba(11, 18, 32, 0.28)",
      input: lightColors.surface,
      line: lightColors.border,
      muted: lightColors.textSecondary,
      peach: lightColors.warmSoft,
      shadow: lightColors.textPrimary,
      sheet: lightColors.surface,
      surface: lightColors.surface,
      text: lightColors.textPrimary,
    };
  }

  return {
    accent: lightColors.olive,
    background: lightColors.cream,
    buttonText: lightColors.onAccent,
    danger: lightColors.danger,
    dim: "rgba(11, 18, 32, 0.34)",
    input: lightColors.input,
    line: lightColors.line,
    muted: lightColors.muted,
    peach: lightColors.accentSubtle,
    shadow: lightColors.ink,
    sheet: lightColors.paper,
    surface: lightColors.paper,
    text: lightColors.ink,
  };
}

const bibleSheetHorizontalPadding = 20;
const bibleSheetTopPadding = 10;
const bibleSheetHandleHeight = 28;
const bibleSheetHeaderBottomPadding = 14;
const bibleSheetHeaderMinHeight = 42;
const bibleVersionListTopPadding = 18;
const bibleVersionRowGap = 10;
const bibleVersionRowMinHeight = 68;

function BibleSheetShell({
  animatedStyle,
  children,
  contentStyle,
  palette,
  style,
}: {
  animatedStyle?: ComponentProps<typeof Animated.View>["style"];
  children: ReactNode;
  contentStyle?: ComponentProps<typeof View>["style"];
  palette: ReaderPalette;
  style?: ComponentProps<typeof Animated.View>["style"];
}) {
  return (
    <Animated.View
      style={[
        {
          backgroundColor: "transparent",
          borderTopLeftRadius: radius.xxl,
          borderTopRightRadius: radius.xxl,
          flexShrink: 1,
          zIndex: 1,
          ...platformShadow({
            boxShadow: "0 -18px 44px rgba(11, 18, 32, 0.18)",
            color: palette.shadow,
            offset: { width: 0, height: -12 },
            opacity: 0.15,
            radius: 34,
          }),
        },
        style,
        animatedStyle,
      ]}
    >
      <View
        style={[
          {
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            flex: 1,
            overflow: "hidden",
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function BibleSheetModalFrame({
  accessibilityLabel,
  children,
  onBackdropPress,
}: {
  accessibilityLabel?: string;
  children: ReactNode;
  onBackdropPress: () => void;
}) {
  return (
    <View style={{ backgroundColor: "transparent", bottom: 0, justifyContent: "flex-end", left: 0, position: "absolute", right: 0, top: 0 }}>
      <Pressable
        accessible={Boolean(accessibilityLabel)}
        accessibilityElementsHidden={!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityLabel ? "button" : "none"}
        importantForAccessibility={accessibilityLabel ? "auto" : "no"}
        onPress={onBackdropPress}
        style={{ backgroundColor: "transparent", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
      />
      {children}
    </View>
  );
}

function BibleSheetBottomPositioner({ children }: { children: ReactNode }) {
  return (
    <View pointerEvents="box-none" style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}>
      <View pointerEvents="box-none" style={{ bottom: 0, left: 0, position: "absolute", right: 0 }}>
        {children}
      </View>
    </View>
  );
}

function BibleSheetTop({
  bordered = false,
  children,
  handleProps,
  palette,
  topProps,
}: {
  bordered?: boolean;
  children?: ReactNode;
  handleProps?: ComponentProps<typeof View>;
  palette: ReaderPalette;
  topProps?: ComponentProps<typeof View>;
}) {
  return (
    <View
      {...topProps}
      style={[
        {
          borderBottomColor: bordered ? palette.line : "transparent",
          borderBottomWidth: bordered ? 1 : 0,
          paddingHorizontal: bibleSheetHorizontalPadding,
          paddingTop: bibleSheetTopPadding,
        },
        topProps?.style,
      ]}
    >
      <View
        {...handleProps}
        style={[
          {
            alignItems: "center",
            alignSelf: "center",
            height: bibleSheetHandleHeight,
            justifyContent: "center",
            width: 150,
          },
          handleProps?.style,
        ]}
      >
        <View style={{ backgroundColor: palette.line, borderRadius: 999, height: 5, width: 52 }} />
      </View>
      {children ? <View style={{ paddingBottom: bibleSheetHeaderBottomPadding }}>{children}</View> : null}
    </View>
  );
}

export function BibleScreen() {
  const planParams = useLocalSearchParams<{ planId?: string; planDay?: string; planJump?: string }>();
  const handledPlanJump = useRef<string | undefined>(undefined);
  const [selectedPlanDayNumber, setSelectedPlanDayNumber] = useState<number | undefined>();
  const { state, dispatch } = useKoino();
  const { language, t } = useAppTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const verseRowsRef = useRef<Record<number, MeasurableView | null>>({});
  const readerScrollOffsetRef = useRef(0);
  const pendingScrollVerseRef = useRef<number | undefined>(undefined);
  const positionRef = useRef<BiblePosition>(defaultPosition);
  const lastScrollCommitRef = useRef(0);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const topicRequestRef = useRef(0);
  const chapterSwipeX = useRef(new Animated.Value(0)).current;
  const chapterSwipeAnimatingRef = useRef(false);
  const chapterSwipeBlockedByScrollRef = useRef(false);
  const verseLongPressActiveRef = useRef(false);

  const [position, setPosition] = useState<BiblePosition>(defaultPosition);
  const [highlightedPosition, setHighlightedPosition] = useState<BiblePosition | undefined>();
  const [bibleVersionId, setBibleVersionId] = useState<BibleVersionId>(defaultBibleVersionId);
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
  const chapterVerses = useMemo(() => bibleChapterVerses(position.book, position.chapter, bibleVersionId), [bibleVersionId, position.book, position.chapter]);
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
  const readerFontFamily = fontFamilyFor(fontId);
  const effectiveFontSize = compactMode ? Math.max(minFontSize, fontSize - 1) : fontSize;
  const readerLineHeight = Math.round(effectiveFontSize * (compactMode ? 1.48 : 1.62));
  const contentWidth = width >= 780 ? 720 : undefined;
  const selectedVerseBarVisible = selectedVerseRanges.length > 0;
  const chapterControlsVisible = !selectedVerseBarVisible;
  const floatingControlsBottom = Math.max(92, insets.bottom + 72);
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
  }, [bibleVersionId, compactMode, effectiveReaderTheme, fontId, fontSize, position, preferencesReady, showCrossReferences, showFootnotes, showVerseNumbers, state.theme, storageKey]);

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
    setScriptureComposerTitle(context === "room" ? "" : verse.reference);
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
    <View style={{ backgroundColor: readerPalette.background, flex: 1 }}>
      <BibleReaderHeader
        canGoBack={readerCanGoBack}
        onBack={handleReaderBack}
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
        title={chapterLabel(position, language)}
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
            <BibleText
              chapterHighlightByVerse={chapterHighlightByVerse}
              compactMode={compactMode}
              crossReferenceAvailability={chapterCrossReferenceAvailability}
              highlightedPosition={highlightedPosition}
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
          reference={displayBibleReference(selectedVerseReference, language)}
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
  canGoBack,
  onBack,
  onOpenPicker,
  onOpenSearch,
  onOpenSettings,
  onOpenVersionPicker,
  palette,
  title,
  translationLabel,
  topInset,
}: {
  canGoBack: boolean;
  onBack: () => void;
  onOpenPicker: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenVersionPicker: () => void;
  palette: ReaderPalette;
  title: string;
  translationLabel: string;
  topInset: number;
}) {
  const { t } = useAppTranslation();
  return (
    <View
      style={{
        backgroundColor: palette.background,
        paddingBottom: 10,
        paddingHorizontal: 12,
        paddingTop: topInset + 10,
        position: "relative",
        zIndex: 20,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 5, minHeight: 52 }}>
        {canGoBack ? <ReaderCircleButton accessibilityLabel={t("bible.accessibility.back")} icon="arrow-left" onPress={onBack} palette={palette} /> : null}

        <Pressable
          accessibilityLabel={t("bible.accessibility.chooseChapter")}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onOpenPicker}
          style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: 3, minWidth: 0 }}
        >
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>
            {title}
          </Text>
          <Feather name="chevron-down" size={14} color={palette.muted} />
        </Pressable>

        <Pressable
          accessibilityLabel={t("bible.accessibility.chooseTranslation")}
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
          <ReaderCircleButton accessibilityLabel={t("bible.accessibility.search")} icon="search" onPress={onOpenSearch} palette={palette} />
          <ReaderCircleButton accessibilityLabel={t("bible.accessibility.readingSettings")} onPress={onOpenSettings} palette={palette} text="Aa" />
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
  onSelectReference,
  onSelectTopic,
  onVote,
  palette,
  references,
  source,
  topic,
  userVotes,
  visible,
  voteError,
  votePending,
}: {
  bibleVersionId: BibleVersionId;
  bibleVersionLabel: string;
  detailVisible: boolean;
  error?: string;
  loading: boolean;
  onBack: () => void;
  onClose: () => void;
  onSelectReference: (reference: string) => void;
  onSelectTopic: (topic: string) => void;
  onVote: (reference: BibleTopicReference, value: BibleTopicVoteValue) => void;
  palette: ReaderPalette;
  references: BibleTopicReference[];
  source: BibleTopicResult["source"];
  topic: string;
  userVotes: Record<string, BibleTopicVoteValue>;
  visible: boolean;
  voteError?: string;
  votePending: string;
}) {
  const { language, t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const slideX = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState("");
  const [topicIndex, setTopicIndex] = useState<BibleTopicIndexItem[]>([]);
  const [topicIndexError, setTopicIndexError] = useState(false);
  const [topicIndexLoading, setTopicIndexLoading] = useState(false);
  const [activeLetter, setActiveLetter] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setActiveLetter("");
      slideX.setValue(0);
    }
  }, [slideX, visible]);

  useEffect(() => {
    if (!visible || topicIndex.length > 0) return;
    let active = true;
    setTopicIndexLoading(true);
    setTopicIndexError(false);
    void fetchBibleTopicIndex()
      .then((topics) => {
        if (active) setTopicIndex(topics);
      })
      .catch(() => {
        if (active) setTopicIndexError(true);
      })
      .finally(() => {
        if (active) setTopicIndexLoading(false);
      });
    return () => {
      active = false;
    };
  }, [topicIndex.length, visible]);

  useEffect(() => {
    if (!visible) return;
    Animated.timing(slideX, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: detailVisible ? -width : 0,
      useNativeDriver: true,
    }).start();
  }, [detailVisible, slideX, visible, width]);

  const normalizedQuery = query.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return topicIndex
      .filter((item) => item.name.toLowerCase().includes(normalizedQuery))
      .sort((first, second) => {
        const firstStarts = first.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        const secondStarts = second.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        return firstStarts - secondStarts || first.name.localeCompare(second.name, "en");
      })
      .slice(0, 8);
  }, [normalizedQuery, topicIndex]);
  const exactSearchMatch = topicIndex.find((item) => item.name.toLowerCase() === normalizedQuery);
  const activeLetterTopics = useMemo(
    () => (activeLetter ? topicIndex.filter((item) => item.letter === activeLetter) : []),
    [activeLetter, topicIndex],
  );

  function submitSearch() {
    const nextQuery = query.trim();
    if (nextQuery) {
      const curatedTopic = suggestedTopics.find((item) => {
        const normalizedQuery = nextQuery.toLocaleLowerCase();
        return item.apiTopic.toLocaleLowerCase() === normalizedQuery || t(item.titleKey).toLocaleLowerCase() === normalizedQuery;
      });
      onSelectTopic(exactSearchMatch?.name ?? curatedTopic?.apiTopic ?? nextQuery);
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
          <View
            accessibilityElementsHidden={detailVisible}
            aria-hidden={detailVisible}
            importantForAccessibility={detailVisible ? "no-hide-descendants" : "auto"}
            style={{ backgroundColor: palette.background, flex: 1, width }}
          >
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
              <ReaderCircleButton accessibilityLabel={t("bible.topics.close")} icon="x" onPress={onClose} palette={palette} />
            </View>
          </View>

          <View style={{ alignItems: "center", gap: 8, maxWidth: 430, width: "100%" }}>
            <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>{t("bible.topics.title")}</Text>
            <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19, maxWidth: 240, textAlign: "center" }}>
              {t("bible.topics.description")}
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
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => {
                setQuery(value);
                if (value.trim()) setActiveLetter("");
              }}
              maxLength={100}
              onSubmitEditing={submitSearch}
              placeholder={t("bible.topics.searchPlaceholder")}
              placeholderTextColor={palette.muted}
              returnKeyType="search"
              style={{ color: palette.text, flex: 1, fontSize: 14, fontWeight: "700", minHeight: 48, paddingVertical: 0 }}
              value={query}
            />
          </View>

          {normalizedQuery.length >= 2 ? (
            <View style={{ gap: 10, maxWidth: 430, width: "100%" }}>
              <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{t("bible.topics.searchSuggestions")}</Text>
              <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" }}>
                {searchMatches.map((item, index) => (
                  <TopicIndexRow
                    item={item}
                    key={item.slug}
                    onPress={() => onSelectTopic(item.name)}
                    palette={palette}
                    showDivider={index < searchMatches.length - 1 || !exactSearchMatch}
                  />
                ))}
                {!exactSearchMatch ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSelectTopic(query.trim())}
                    style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 9 }}
                  >
                    <View style={{ alignItems: "center", backgroundColor: palette.peach, borderRadius: 999, height: 34, justifyContent: "center", width: 34 }}>
                      <Feather name="search" size={15} color={palette.accent} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, fontWeight: "800", textTransform: "none" }}>
                        {t("bible.topics.searchOpenBible", { topic: query.trim().toLowerCase() })}
                      </Text>
                      <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>
                        {t("bible.topics.searchOpenBibleSubtitle")}
                      </Text>
                    </View>
                    <Feather name="arrow-right" size={16} color={palette.muted} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {!normalizedQuery ? (
            <View style={{ gap: 10, maxWidth: 430, width: "100%" }}>
              <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{t("bible.topics.browseAlphabet")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {bibleTopicAlphabet.map((letter) => {
                  const available = topicIndex.some((item) => item.letter === letter);
                  const selected = activeLetter === letter;
                  return (
                    <Pressable
                      accessibilityLabel={t("bible.topics.openLetter", { letter })}
                      accessibilityRole="button"
                      disabled={!available}
                      key={letter}
                      onPress={() => setActiveLetter((currentLetter) => (currentLetter === letter ? "" : letter))}
                      style={{
                        alignItems: "center",
                        backgroundColor: selected ? palette.peach : palette.surface,
                        borderColor: selected ? palette.accent : palette.line,
                        borderRadius: 10,
                        borderWidth: 1,
                        height: 34,
                        justifyContent: "center",
                        opacity: available ? 1 : 0.35,
                        width: 34,
                      }}
                    >
                      <Text style={{ color: selected ? palette.accent : palette.text, fontSize: 12, fontWeight: "900" }}>{letter}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {topicIndexLoading ? (
                <View style={{ alignItems: "center", flexDirection: "row", gap: 9, paddingVertical: 6 }}>
                  <ActivityIndicator color={palette.accent} size="small" />
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{t("bible.topics.directoryLoading")}</Text>
                </View>
              ) : topicIndexError ? (
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700", lineHeight: 18 }}>{t("bible.topics.directoryError")}</Text>
              ) : null}
            </View>
          ) : null}

          {!normalizedQuery && activeLetter ? (
            <View style={{ gap: 10, maxWidth: 430, width: "100%" }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
                <Text style={{ color: palette.text, flexShrink: 1, fontSize: 13, fontWeight: "900" }}>
                  {t("bible.topics.letterTitle", { letter: activeLetter })}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActiveLetter("")}
                  style={{ alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 96, paddingHorizontal: 4 }}
                >
                  <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "800" }}>{t("bible.topics.showSuggestions")}</Text>
                </Pressable>
              </View>
              <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" }}>
                {activeLetterTopics.map((item, index) => (
                  <TopicIndexRow
                    item={item}
                    key={item.slug}
                    onPress={() => onSelectTopic(item.name)}
                    palette={palette}
                    showDivider={index < activeLetterTopics.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {!normalizedQuery && !activeLetter ? (
          <View style={{ gap: 10, maxWidth: 430, width: "100%" }}>
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{t("bible.topics.suggested")}</Text>
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
                  key={topic.apiTopic}
                  onPress={() => onSelectTopic(topic.apiTopic)}
                  palette={palette}
                  showDivider={index < suggestedTopics.length - 1}
                  topic={topic}
                />
              ))}
            </View>
          </View>
          ) : null}
        </ScrollView>
          </View>
          <View
            accessibilityElementsHidden={!detailVisible}
            aria-hidden={!detailVisible}
            importantForAccessibility={!detailVisible ? "no-hide-descendants" : "auto"}
            style={{ backgroundColor: palette.background, flex: 1, width }}
          >
            <BibleTopicDetailPane
              bibleVersionId={bibleVersionId}
              bibleVersionLabel={bibleVersionLabel}
              error={error}
              loading={loading}
              onBack={onBack}
              onSelectReference={onSelectReference}
              onVote={onVote}
              palette={palette}
              references={references}
              source={source}
              topic={topic}
              userVotes={userVotes}
              voteError={voteError}
              votePending={votePending}
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
  const { t } = useAppTranslation();
  const tone = {
    blue: { background: colors.reflectionSoft, color: colors.textMuted },
    green: { background: colors.rhythmSoft, color: colors.textMuted },
    peach: { background: colors.warmSoft, color: colors.textMuted },
    rose: { background: colors.prayerSoft, color: colors.textMuted },
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
          {t(topic.titleKey)}
        </Text>
        <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>
          {t(topic.subtitleKey)}
        </Text>
      </View>
      <Feather name="chevron-right" size={17} color={palette.muted} />
    </Pressable>
  );
}

function TopicIndexRow({
  item,
  onPress,
  palette,
  showDivider,
}: {
  item: BibleTopicIndexItem;
  onPress: () => void;
  palette: ReaderPalette;
  showDivider: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderBottomColor: showDivider ? palette.line : "transparent",
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: 10,
        minHeight: 54,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <Text numberOfLines={2} style={{ color: palette.text, flex: 1, fontSize: 14, fontWeight: "800", lineHeight: 19, textTransform: "none" }}>
        {item.name}
      </Text>
      <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>
        {item.passageCount === 1
          ? t("bible.topics.passage.single")
          : t("bible.topics.passage.count", { count: item.passageCount })}
      </Text>
      <Feather name="chevron-right" size={16} color={palette.muted} />
    </Pressable>
  );
}

function BibleTopicDetailPane({
  bibleVersionId,
  bibleVersionLabel,
  error,
  loading,
  onBack,
  onSelectReference,
  onVote,
  palette,
  references,
  source,
  topic,
  userVotes,
  voteError,
  votePending,
}: {
  bibleVersionId: BibleVersionId;
  bibleVersionLabel: string;
  error?: string;
  loading: boolean;
  onBack: () => void;
  onSelectReference: (reference: string) => void;
  onVote: (reference: BibleTopicReference, value: BibleTopicVoteValue) => void;
  palette: ReaderPalette;
  references: BibleTopicReference[];
  source: BibleTopicResult["source"];
  topic: string;
  userVotes: Record<string, BibleTopicVoteValue>;
  voteError?: string;
  votePending: string;
}) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const resolvedVerses = useMemo(
    () =>
      references.map((item) => ({
        reference: item.reference,
        verse: bibleVerseFromReference(item.reference, bibleVersionId),
        votes: item.votes,
        voteId: item.voteId,
      })),
    [bibleVersionId, references],
  );
  const title = localizedTopicTitle(topic, t);

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
          <ReaderCircleButton accessibilityLabel={t("bible.topics.back")} icon="arrow-left" onPress={onBack} palette={palette} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>
              {title}
            </Text>
            <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>
              {loading
                ? t("bible.topics.searchingSource")
                : references.length === 1
                  ? t("bible.topics.reference.single", { translation: bibleVersionLabel })
                  : t("bible.topics.reference.count", { count: references.length, translation: bibleVersionLabel })}
            </Text>
          </View>
          <View style={{ height: 46, width: 46 }} />
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
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "800" }}>{t("bible.topics.searching", { topic: title.toLocaleLowerCase() })}</Text>
            </View>
          ) : error ? (
            <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, gap: 8, padding: 16 }}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>{t("bible.topics.errorTitle")}</Text>
              <Text selectable style={{ color: palette.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>
                {t("bible.topics.errorBody")}
              </Text>
            </View>
          ) : resolvedVerses.length > 0 ? (
            <>
              <View style={{ backgroundColor: palette.peach, borderRadius: radius.md, gap: 3, paddingHorizontal: 13, paddingVertical: 11 }}>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: "800", lineHeight: 18 }}>
                  {source === "openbible" ? t("bible.topics.voteSource") : t("bible.topics.textSearchSource", { translation: bibleVersionLabel })}
                </Text>
                {source === "openbible" && voteError ? <Text style={{ color: palette.danger, fontSize: 12, fontWeight: "800", lineHeight: 18 }}>{t("bible.topics.voteError")}</Text> : null}
              </View>
            {resolvedVerses.map((item, index) => (
              <TopicVerseCard
                key={`${item.reference}-${index}`}
                bibleVersionLabel={bibleVersionLabel}
                item={item}
                onPress={item.verse ? () => onSelectReference(item.reference) : undefined}
                onVote={(value) => onVote(item, value)}
                palette={palette}
                userVote={item.voteId ? userVotes[bibleTopicVoteKey(topic, item.voteId)] : undefined}
                voting={Boolean(item.voteId && votePending === bibleTopicVoteKey(topic, item.voteId))}
              />
            ))}
            </>
          ) : (
            <View style={{ backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radius.lg, borderWidth: 1, padding: 16 }}>
              <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "800", lineHeight: 20 }}>{t("bible.topics.empty")}</Text>
            </View>
          )}
        </ScrollView>
    </View>
  );
}

function TopicVerseCard({
  bibleVersionLabel,
  item,
  onPress,
  onVote,
  palette,
  userVote,
  voting,
}: {
  bibleVersionLabel: string;
  item: BibleTopicReference & { verse?: BibleVerse };
  onPress?: () => void;
  onVote: (value: BibleTopicVoteValue) => void;
  palette: ReaderPalette;
  userVote?: BibleTopicVoteValue;
  voting: boolean;
}) {
  const { language, t } = useAppTranslation();
  const displayedReference = displayBibleReference(item.reference, language);
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
      <Pressable
        accessibilityLabel={onPress ? t("bible.navigator.openPassage", { reference: displayedReference }) : undefined}
        accessibilityRole={onPress ? "button" : undefined}
        disabled={!onPress}
        onPress={onPress}
        style={{ gap: 9 }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <View style={{ alignItems: "center", backgroundColor: palette.peach, borderRadius: 999, height: 28, justifyContent: "center", width: 28 }}>
            <Feather name="book-open" size={14} color={palette.accent} />
          </View>
          <Text selectable style={{ color: palette.text, flex: 1, fontSize: 16, fontWeight: "900" }}>
            {displayedReference}
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
            {t("bible.topics.unavailable", { translation: bibleVersionLabel })}
          </Text>
        )}
      </Pressable>
      {item.voteId ? <View style={{ alignItems: "center", borderTopColor: palette.line, borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", paddingTop: 11 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          {voting ? <ActivityIndicator color={palette.muted} size="small" /> : <Feather name="thumbs-up" size={13} color={palette.muted} />}
          <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800" }}>
            {t("bible.topics.helpfulVotes", { count: item.votes.toLocaleString() })}
          </Text>
        </View>
        <View accessibilityLabel={t("bible.topics.ratePassage", { reference: item.reference })} style={{ flexDirection: "row", gap: 7 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !item.voteId || Boolean(userVote) || voting, selected: userVote === 1 }}
            disabled={!item.voteId || Boolean(userVote) || voting}
            onPress={() => onVote(1)}
            style={{
              alignItems: "center",
              backgroundColor: userVote === 1 ? palette.peach : palette.surface,
              borderColor: userVote === 1 ? palette.accent : palette.line,
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 5,
              minHeight: 32,
              opacity: !item.voteId || (Boolean(userVote) && userVote !== 1) ? 0.55 : 1,
              paddingHorizontal: 10,
            }}
          >
            <Feather name="thumbs-up" size={13} color={userVote === 1 ? palette.accent : palette.muted} />
            <Text style={{ color: userVote === 1 ? palette.accent : palette.text, fontSize: 11, fontWeight: "800" }}>{t("bible.topics.helpful")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !item.voteId || Boolean(userVote) || voting, selected: userVote === -1 }}
            disabled={!item.voteId || Boolean(userVote) || voting}
            onPress={() => onVote(-1)}
            style={{
              alignItems: "center",
              backgroundColor: userVote === -1 ? colors.prayerSoft : palette.surface,
              borderColor: userVote === -1 ? palette.danger : palette.line,
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 5,
              minHeight: 32,
              opacity: !item.voteId || (Boolean(userVote) && userVote !== -1) ? 0.55 : 1,
              paddingHorizontal: 10,
            }}
          >
            <Feather name="thumbs-down" size={13} color={userVote === -1 ? palette.danger : palette.muted} />
            <Text style={{ color: userVote === -1 ? palette.danger : palette.text, fontSize: 11, fontWeight: "800" }}>{t("bible.topics.notHelpful")}</Text>
          </Pressable>
        </View>
      </View> : null}
    </View>
  );
}

function BibleText({
  chapterHighlightByVerse,
  compactMode,
  highlightedPosition,
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
  verses,
}: {
  chapterHighlightByVerse: Record<number, BibleHighlightColor>;
  compactMode: boolean;
  crossReferenceAvailability: Record<number, boolean>;
  highlightedPosition?: BiblePosition;
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
  showCrossReferences: boolean;
  showVerseNumbers: boolean;
  verses: BibleChapterVerse[];
}) {
  const { language } = useAppTranslation();
  const textOffsetRef = useRef(0);
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
  return (
    <View
      onLayout={(event) => {
        textOffsetRef.current = event.nativeEvent.layout.y;
      }}
      style={{ gap: compactMode ? 4 : 7 }}
    >
      {verses.map((item, index) => {
        const markersBefore = planMarkers.filter((marker) => marker.verse === item.verse && marker.kind === "start");
        const markersAfter = planMarkers.filter((marker) => marker.verse === item.verse && marker.kind === "finish");
        const highlighted =
          highlightedPosition?.book === position.book &&
          highlightedPosition.chapter === position.chapter &&
          highlightedPosition.verse === item.verse;
        const actionSelected =
          selectedVersePosition?.book === position.book &&
          selectedVersePosition.chapter === position.chapter &&
          selectedVersePosition.verse === item.verse;
        const persistedHighlightColor = chapterHighlightByVerse[item.verse];
        const surfaceSelected = highlighted || actionSelected;
        const tapSelected = selectedVerseNumbers.includes(item.verse);
        const selected = surfaceSelected || tapSelected || Boolean(persistedHighlightColor);
        const persistedHighlightStyle = persistedHighlightColor
          ? { backgroundColor: highlightColorWithOpacity(persistedHighlightColor, 0.16) }
          : undefined;
        const temporarySelected = surfaceSelected || tapSelected;
        const isFirstVerse = index === 0;
        return (
          <View
            key={item.reference}
            onLayout={(event) => onVerseLayout(item.verse, textOffsetRef.current + event.nativeEvent.layout.y)}
            ref={(node) => onVerseRef(item.verse, node)}
            style={{ gap: 5 }}
          >
          {markersBefore.map((marker) => (
            <BiblePlanInlineMarker key={`${marker.planId}-${marker.kind}-${marker.verse}`} kind={marker.kind} label={marker.label} palette={palette} />
          ))}
          <Pressable
            accessibilityLabel={referenceLabel({ ...position, verse: item.verse }, language)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            delayLongPress={1000}
            {...(Platform.OS === "web"
              ? {
                  onContextMenu: (event: { preventDefault: () => void }) => {
                    event.preventDefault();
                    onVerseLongPress(item.verse);
                  },
                }
              : {})}
            onLongPress={() => onVerseLongPress(item.verse)}
            onPress={() => onVersePress(item.verse)}
            onPressIn={onVersePressIn}
            style={{
              ...bibleVerseWebInteractionStyle,
              backgroundColor: temporarySelected ? palette.peach : "transparent",
              borderColor: "transparent",
              borderRadius: radius.md,
              borderWidth: 1,
              paddingHorizontal: temporarySelected ? 10 : 0,
              paddingVertical: compactMode ? 5 : 8,
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
                  {position.chapter}
                </Text>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
                  {showVerseNumbers ? <Text style={[verseNumberStyle, bibleVerseWebInteractionStyle, persistedHighlightStyle]}>{item.verse} </Text> : null}
                  <Text style={[readerTextStyle, bibleVerseWebInteractionStyle, { flex: 1 }]}><Text style={[bibleVerseWebInteractionStyle, persistedHighlightStyle]}>{item.text}</Text></Text>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                {showVerseNumbers ? <Text style={[verseNumberStyle, bibleVerseWebInteractionStyle, persistedHighlightStyle]}>{item.verse} </Text> : null}
                <Text style={[readerTextStyle, bibleVerseWebInteractionStyle, { flex: 1 }]}><Text style={[bibleVerseWebInteractionStyle, persistedHighlightStyle]}>{item.text}</Text></Text>
              </View>
            )}
          </Pressable>
          {markersAfter.map((marker) => (
            <BiblePlanInlineMarker key={`${marker.planId}-${marker.kind}-${marker.verse}`} kind={marker.kind} label={marker.label} palette={palette} />
          ))}
          </View>
        );
      })}
    </View>
  );
}

function BiblePlanReaderPanel({
  currentDay,
  markers,
  onJump,
  onMarkRead,
  onSelectPlan,
  onSelectDay,
  palette,
  plan,
  plans,
}: {
  currentDay?: BiblePlanCurrentDay;
  markers: BiblePlanMarker[];
  onJump: () => void;
  onMarkRead: () => Promise<void>;
  onSelectPlan: (id: string) => void;
  onSelectDay: (dayNumber: number) => void;
  palette: ReaderPalette;
  plan?: BiblePlan;
  plans: BiblePlan[];
}) {
  const { t } = useAppTranslation();
  const { state } = useKoino();
  const [saving, setSaving] = useState(false);
  if (!plan || plans.length === 0) return null;

  const completed = plan.days.filter((day) => Boolean(day.completedAt)).length;
  const percent = completionPercent(completed, plan.days.length);
  const day = currentDay?.day;
  const dayCompleted = Boolean(day?.completedAt);
  const hasMarkersInChapter = markers.length > 0;
  const dateLabel = day ? dayKeyForPlanDay(plan, day.dayNumber) : todayDateKey();
  const regionLabel = biblePlanDayRegionLabel(day);
  const today = todayPlanDay(plan, todayDateKey());
  const next = nextUnreadPlanDay(plan);

  return (
    <View
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        gap: 10,
        padding: 12,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Feather name="calendar" size={17} color={palette.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>
            {plan.title}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
            {day ? `Day ${day.dayNumber} · ${dateLabel} · ${percent}% complete` : `${percent}% complete`}
          </Text>
          {regionLabel ? (
            <Text numberOfLines={2} style={{ color: palette.muted, fontSize: 12, fontWeight: "800", lineHeight: 17 }}>
              {regionLabel}
            </Text>
          ) : null}
        </View>
        {plans.length > 1 ? (
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900" }}>
            {plans.findIndex((item) => item.id === plan.id) + 1}/{plans.length}
          </Text>
        ) : null}
      </View>
      {plan.pausedAt ? <Text style={{ color: palette.muted }}>{t("bible.plans.paused")}</Text> : null}
      <Text style={{ color: palette.muted }}>{today ? t("bible.plans.plan.today", { day: today.dayNumber }) : t("bible.plans.noToday")}</Text>
      <Text style={{ color: palette.muted }}>{next ? t("bible.plans.nextDay", { day: next.dayNumber }) : t("bible.plans.noUnread")}</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[{ label: t("bible.plans.today"), target: today }, { label: t("bible.plans.nextUnread"), target: next }].map(({ label, target }) => (
          <Pressable key={label} accessibilityRole="button" disabled={!target?.ranges?.length} onPress={() => target && onSelectDay(target.dayNumber)} style={{ flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", opacity: target?.ranges?.length ? 1 : 0.5 }}>
            <Text style={{ color: palette.accent, fontWeight: "800" }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {plans.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {plans.map((item) => {
            const selected = item.id === plan.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={item.id}
                onPress={() => onSelectPlan(item.id)}
                style={{
                  backgroundColor: selected ? palette.peach : palette.input,
                  borderColor: selected ? palette.accent : palette.line,
                  borderRadius: 999,
                  borderWidth: 1,
                  minHeight: 34,
                  justifyContent: "center",
                  paddingHorizontal: 12,
                }}
              >
                <Text numberOfLines={1} style={{ color: selected ? palette.accent : palette.muted, fontSize: 12, fontWeight: "900", maxWidth: 160 }}>
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          disabled={!day}
          onPress={onJump}
          style={{
            alignItems: "center",
            backgroundColor: palette.input,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            flex: 1,
            flexDirection: "row",
            gap: 7,
            justifyContent: "center",
            minHeight: 40,
            opacity: day ? 1 : 0.5,
            paddingHorizontal: 10,
          }}
        >
          <Feather name={hasMarkersInChapter ? "map-pin" : "corner-up-right"} size={15} color={palette.accent} />
          <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "900" }}>{t("bible.plans.plan.read")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!day || saving}
          accessibilityState={{ disabled: !day || saving }}
          onPress={async () => {
            setSaving(true);
            try { await onMarkRead(); } finally { setSaving(false); }
          }}
          style={{
            alignItems: "center",
            backgroundColor: dayCompleted ? palette.peach : palette.accent,
            borderColor: dayCompleted ? palette.accent : palette.accent,
            borderRadius: 999,
            borderWidth: 1,
            flex: 1,
            flexDirection: "row",
            gap: 7,
            justifyContent: "center",
            minHeight: 40,
            opacity: !day || saving ? 0.5 : 1,
            paddingHorizontal: 10,
          }}
        >
          <Feather name={dayCompleted ? "check-circle" : "circle"} size={15} color={dayCompleted ? palette.accent : palette.surface} />
          <Text style={{ color: dayCompleted ? palette.accent : palette.surface, fontSize: 12, fontWeight: "900" }}>{t(dayCompleted ? "bible.plans.markUnread" : "bible.plans.markRead")}</Text>
        </Pressable>
      </View>
      {state.authError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{state.authError}</Text> : null}
    </View>
  );
}

function BiblePlanInlineMarker({ kind, label, palette }: { kind: BiblePlanMarkerKind; label: string; palette: ReaderPalette }) {
  const isStart = kind === "start";
  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: isStart ? palette.peach : palette.input,
        borderColor: isStart ? palette.accent : palette.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 7,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Feather name={isStart ? "play-circle" : "flag"} size={13} color={palette.accent} />
      <Text style={{ color: palette.accent, fontSize: 11, fontWeight: "900", textTransform: "uppercase" }}>{label}</Text>
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
  onHeightChange,
  onHighlight,
  onManageColors,
  onSave,
  palette,
  reference,
  saved,
  saving,
  verseCount,
}: {
  bottom: number;
  canDeleteHighlight: boolean;
  highlightColors: BibleHighlightPaletteColor[];
  maxWidth?: number;
  onClear: () => void;
  onDeleteHighlight: () => void;
  onHeightChange: (height: number) => void;
  onHighlight: (color: BibleHighlightPaletteColor) => void;
  onManageColors: () => void;
  onSave: () => void;
  palette: ReaderPalette;
  reference: string;
  saved: boolean;
  saving: boolean;
  verseCount: number;
}) {
  const { t } = useAppTranslation();

  return (
    <View pointerEvents="box-none" style={{ alignItems: "center", bottom, left: 0, paddingHorizontal: 18, position: "absolute", right: 0, zIndex: 30 }}>
      <View
        onLayout={(event) => onHeightChange(Math.ceil(event.nativeEvent.layout.height))}
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
              {t(verseCount === 1 ? "bible.selection.single" : "bible.selection.multiple", { count: verseCount })}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={t("bible.selection.clear")}
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
            accessibilityLabel={t(saved ? "bible.selection.removeAccessibility" : "bible.selection.saveAccessibility", { reference })}
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
              {t(saving
                ? saved ? "bible.selection.removing" : "bible.selection.saving"
                : saved
                  ? "bible.selection.remove"
                  : verseCount === 1 ? "bible.selection.saveVerse" : "bible.selection.savePassage")}
            </Text>
          </Pressable>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", minHeight: 38 }}>
          <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{t("bible.selection.highlight")}</Text>
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
            accessibilityLabel={t("bible.selection.manageColors")}
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
              accessibilityLabel={t("bible.selection.deleteHighlight", { reference })}
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
  saved,
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
  saved: boolean;
  visible: boolean;
}) {
  const { language, t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const slideProgress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [displayedPosition, setDisplayedPosition] = useState(position);
  const [view, setView] = useState<"actions" | "references">("actions");
  const references = useMemo(() => (displayedPosition ? bibleCrossReferences(displayedPosition, bibleVersionId) : []), [bibleVersionId, displayedPosition]);
  const sheetVerseFontSize = typeof readerTextStyle.fontSize === "number" ? Math.min(16, Math.max(14, readerTextStyle.fontSize - 2)) : 15;
  const sheetVerseLineHeight = Math.round(sheetVerseFontSize * 1.55);
  const bottomPadding = Math.max(28, insets.bottom + 20);
  const contentHeight = bibleSheetTopPadding + bibleSheetHandleHeight + 7 * 72 + bottomPadding;
  const sheetHeight = Math.min(height * 0.78, contentHeight);

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
      <BibleSheetModalFrame accessibilityLabel={t("bible.actions.close")} onBackdropPress={onClose}>
        <BibleSheetBottomPositioner>
          <BibleSheetShell
            animatedStyle={{
              elevation: 2,
              transform: [{ translateY: sheetTranslateY }],
            }}
            contentStyle={{
              gap: 2,
              paddingBottom: bottomPadding,
            }}
            palette={palette}
            style={{ height: sheetHeight }}
          >
            <BibleSheetTop palette={palette} />
            {view === "actions" ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: bibleSheetHorizontalPadding }}
                style={{ flex: 1, minHeight: 0 }}
              >
                <VerseSheetAction icon="book-open" onPress={() => setView("references")} palette={palette} subtitle={t("bible.actions.crossReferencesSubtitle")} title={t("bible.actions.crossReferences")} />
                <VerseSheetAction
                  icon="bookmark"
                  onPress={() => onAction("save")}
                  palette={palette}
                  subtitle={saved ? t("bible.actions.unsaveSubtitle") : t("bible.actions.saveSubtitle")}
                  title={saved ? t("bible.actions.unsave") : t("bible.actions.save")}
                />
                <VerseSheetAction icon="edit-3" onPress={() => onAction("journal")} palette={palette} subtitle={t("bible.actions.reflectSubtitle")} title={t("bible.actions.reflect")} />
                <VerseSheetAction icon="heart" onPress={() => onAction("pray")} palette={palette} subtitle={t("bible.actions.praySubtitle")} title={t("bible.actions.pray")} />
                <VerseSheetAction icon="users" onPress={() => onAction("share")} palette={palette} subtitle={t("bible.actions.shareSubtitle")} title={t("bible.actions.share")} />
                <VerseSheetAction icon="copy" onPress={() => onAction("copy")} palette={palette} subtitle={t("bible.actions.copySubtitle")} title={t("bible.actions.copy")} />
                <VerseSheetAction icon="edit-2" onPress={() => onAction("highlight")} palette={palette} subtitle={t("bible.actions.highlightSubtitle")} title={t("bible.actions.highlight")} />
              </ScrollView>
            ) : (
              <View style={{ flex: 1, gap: 14, minHeight: 0, paddingHorizontal: bibleSheetHorizontalPadding }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                  <ReaderCircleButton accessibilityLabel={t("bible.actions.back")} icon="chevron-left" onPress={() => setView("actions")} palette={palette} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>{t("bible.actions.crossReferences")}</Text>
                    <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{referenceLabel(displayedPosition, language)}</Text>
                  </View>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
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
                      <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "700", lineHeight: 20 }}>{t("bible.actions.crossReferencesEmpty")}</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}
          </BibleSheetShell>
        </BibleSheetBottomPositioner>
      </BibleSheetModalFrame>
    </Modal>
  );
}

function VerseSheetAction({
  icon,
  onPress,
  palette,
  subtitle,
  title,
  tone = "default",
}: {
  icon: "book-open" | "bookmark" | "copy" | "edit-2" | "edit-3" | "heart" | "trash-2" | "users";
  onPress: () => void;
  palette: ReaderPalette;
  subtitle: string;
  title: string;
  tone?: "danger" | "default";
}) {
  const destructive = tone === "danger";
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
        <Feather name={icon} size={21} color={destructive ? colors.danger : palette.accent} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: destructive ? colors.danger : palette.text, fontSize: 16, fontWeight: "900" }}>{title}</Text>
        <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function SavedVerseActionSheet({
  onClose,
  onOpen,
  onRemove,
  palette,
  verse,
}: {
  onClose: () => void;
  onOpen: (verse: SavedVerse) => void;
  onRemove: (verse: SavedVerse) => void;
  palette: ReaderPalette;
  verse?: SavedVerse;
}) {
  const { language, t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (!verse) return null;

  const bottomPadding = Math.max(28, insets.bottom + 20);
  const titleLineHeight = 24;
  const contentHeight =
    bibleSheetTopPadding +
    bibleSheetHandleHeight +
    2 +
    titleLineHeight +
    8 +
    2 * 72 +
    bottomPadding;
  const sheetHeight = Math.min(height * 0.92, contentHeight);

  return (
    <Modal transparent visible onRequestClose={onClose}>
      <BibleSheetModalFrame accessibilityLabel={t("bible.saved.actions.close")} onBackdropPress={onClose}>
        <BibleSheetBottomPositioner>
          <BibleSheetShell
            contentStyle={{ gap: 2, paddingBottom: bottomPadding }}
            palette={palette}
            style={{ height: sheetHeight }}
          >
            <BibleSheetTop palette={palette} />
            <View style={{ paddingHorizontal: bibleSheetHorizontalPadding }}>
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 18, fontWeight: "900", lineHeight: titleLineHeight, paddingBottom: 8 }}>
                {displayBibleReference(verse.reference, language)}
              </Text>
              <VerseSheetAction
                icon="book-open"
                onPress={() => onOpen(verse)}
                palette={palette}
                subtitle={t("bible.saved.actions.openSubtitle")}
                title={t("bible.saved.actions.open")}
              />
              <VerseSheetAction
                icon="trash-2"
                onPress={() => onRemove(verse)}
                palette={palette}
                subtitle={t("bible.saved.actions.removeSubtitle")}
                title={t("bible.saved.actions.remove")}
                tone="danger"
              />
            </View>
          </BibleSheetShell>
        </BibleSheetBottomPositioner>
      </BibleSheetModalFrame>
    </Modal>
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
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();
  const sheetHeight = height * 0.92;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <BibleSheetModalFrame accessibilityLabel={t("bible.settings.close")} onBackdropPress={onClose}>
        <BibleSheetBottomPositioner>
          <BibleSheetShell
            contentStyle={{ paddingBottom: Math.max(26, insets.bottom + 18) }}
            palette={palette}
            style={{ height: sheetHeight }}
          >
            <BibleSheetTop palette={palette}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 14, minHeight: bibleSheetHeaderMinHeight }}>
                <Text style={{ color: palette.text, flex: 1, fontSize: 20, fontWeight: "900" }}>{t("bible.settings.title")}</Text>
                <ReaderCircleButton accessibilityLabel={t("bible.settings.close")} icon="x" onPress={onClose} palette={palette} />
              </View>
            </BibleSheetTop>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 24, paddingHorizontal: bibleSheetHorizontalPadding, paddingTop: 24 }}
              style={{ flex: 1 }}
            >

            <SettingsGroup palette={palette} title={t("bible.settings.fontFamily")}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {readerFonts.map((font) => (
                  <SettingChip
                    fontFamily={fontFamilyFor(font.id)}
                    key={font.id}
                    label={readerFontLabel(font.id, t)}
                    onPress={() => onChangeFont(font.id)}
                    palette={palette}
                    selected={font.id === fontId}
                  />
                ))}
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title={t("bible.settings.textSize")}>
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
                <SettingsStepperButton disabled={fontSize <= minFontSize} icon="minus" label={t("bible.settings.decreaseTextSize")} onPress={() => onFontSizeChange(-fontSizeStep)} palette={palette} />
                <Text style={{ color: palette.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900", minWidth: 30, textAlign: "center" }}>
                  {fontSize}
                </Text>
                <SettingsStepperButton disabled={fontSize >= maxFontSize} icon="plus" label={t("bible.settings.increaseTextSize")} onPress={() => onFontSizeChange(fontSizeStep)} palette={palette} />
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title={t("bible.settings.theme")}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {readerThemes.map((theme) => (
                  <SettingChip
                    icon={theme.id === "dark" ? "moon" : theme.id === "sepia" ? "circle" : "sun"}
                    key={theme.id}
                    label={readerThemeLabel(theme.id, t)}
                    onPress={() => onChangeReaderTheme(theme.id)}
                    palette={palette}
                    selected={theme.id === readerTheme}
                  />
                ))}
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title={t("bible.settings.options")}>
              <View style={{ gap: 2 }}>
                <SettingsToggle label={t("bible.settings.showVerseNumbers")} onChange={onChangeShowVerseNumbers} palette={palette} value={showVerseNumbers} />
                <SettingsToggle label={t("bible.settings.showCrossReferences")} onChange={onChangeShowCrossReferences} palette={palette} value={showCrossReferences} />
                <SettingsToggle label={t("bible.settings.showFootnotes")} onChange={onChangeShowFootnotes} palette={palette} value={showFootnotes} />
                <SettingsToggle label={t("bible.settings.compactMode")} onChange={onCompactModeChange} palette={palette} value={compactMode} />
              </View>
            </SettingsGroup>
            </ScrollView>
          </BibleSheetShell>
        </BibleSheetBottomPositioner>
      </BibleSheetModalFrame>
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
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();
  const bottomPadding = Math.max(26, insets.bottom + 18);
  const contentHeight =
    bibleSheetTopPadding +
    bibleSheetHandleHeight +
    bibleSheetHeaderMinHeight +
    bibleSheetHeaderBottomPadding +
    bibleVersionListTopPadding +
    bibleVersions.length * bibleVersionRowMinHeight +
    Math.max(0, bibleVersions.length - 1) * bibleVersionRowGap +
    bottomPadding;
  const sheetHeight = Math.min(height * 0.92, contentHeight);

  function chooseVersion(versionId: BibleVersionId) {
    onChangeBibleVersion(versionId);
    onClose();
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <BibleSheetModalFrame accessibilityLabel={t("bible.version.close")} onBackdropPress={onClose}>
        <BibleSheetBottomPositioner>
          <BibleSheetShell contentStyle={{ paddingBottom: bottomPadding }} palette={palette} style={{ height: sheetHeight }}>
            <BibleSheetTop palette={palette}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 14, minHeight: bibleSheetHeaderMinHeight }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>{t("bible.version.title")}</Text>
                  <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700" }}>{t("bible.version.description")}</Text>
                </View>
                <ReaderCircleButton accessibilityLabel={t("bible.version.close")} icon="x" onPress={onClose} palette={palette} />
              </View>
            </BibleSheetTop>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: bibleVersionRowGap, paddingHorizontal: bibleSheetHorizontalPadding, paddingTop: bibleVersionListTopPadding }}
              style={{ flex: 1 }}
            >
              {bibleVersions.map((version) => (
                <BibleVersionRow
                  description={bibleVersionDescription(version.id, t)}
                  key={version.id}
                  label={version.label}
                  onPress={() => chooseVersion(version.id)}
                  palette={palette}
                  selected={version.id === bibleVersionId}
                  shortLabel={bibleVersionShortLabel(version.id)}
                />
              ))}
            </ScrollView>
          </BibleSheetShell>
        </BibleSheetBottomPositioner>
      </BibleSheetModalFrame>
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
        minHeight: bibleVersionRowMinHeight,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.input,
          borderColor: selected ? palette.accent : palette.line,
          borderRadius: 999,
          borderWidth: selected ? 1.5 : 1,
          height: 40,
          justifyContent: "center",
          minWidth: 56,
          paddingHorizontal: 10,
        }}
      >
        <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "900" }}>{shortLabel}</Text>
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

function BibleBottomReadingControls({
  bottom,
  maxWidth,
  nextChapter,
  onHeightChange,
  onNext,
  onPrevious,
  palette,
  previousChapter,
}: {
  bottom: number;
  maxWidth?: number;
  nextChapter?: BiblePosition;
  onHeightChange: (height: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  palette: ReaderPalette;
  previousChapter?: BiblePosition;
}) {
  const { t } = useAppTranslation();
  return (
    <View pointerEvents="box-none" style={{ alignItems: "center", bottom, left: 0, paddingHorizontal: 22, position: "absolute", right: 0, zIndex: 18 }}>
      <View
        onLayout={(event) => onHeightChange(Math.ceil(event.nativeEvent.layout.height))}
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          maxWidth,
          width: "100%",
        }}
      >
        <ReaderControlButton
          accessibilityLabel={t("bible.accessibility.previousChapter")}
          disabled={!previousChapter}
          icon="chevron-left"
          onPress={onPrevious}
          palette={palette}
        />
        <ReaderControlButton
          accessibilityLabel={t("bible.accessibility.nextChapter")}
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
      <BibleSheetModalFrame accessibilityLabel="Close cross references" onBackdropPress={() => closeWithAnimation()}>
        <BibleSheetShell
          animatedStyle={{ transform: [{ translateY }] }}
          contentStyle={{ paddingBottom: insets.bottom }}
          palette={palette}
          style={{ height: sheetHeight }}
        >
          <BibleSheetTop bordered handleProps={panResponder.panHandlers} palette={palette}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, width: "100%" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>Korsreferenser</Text>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{referenceLabel(position)}</Text>
              </View>
              <ReaderCircleButton accessibilityLabel="Close cross references" icon="x" onPress={() => closeWithAnimation()} palette={palette} />
            </View>
          </BibleSheetTop>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: bibleSheetHorizontalPadding, paddingVertical: 18 }}>
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
        </BibleSheetShell>
      </BibleSheetModalFrame>
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

function BibleDrawer({
  biblePlanCount,
  bibleVersionId,
  highlights,
  initialStage,
  initialPosition,
  journalEntries,
  onClose,
  onOpenPlans,
  onOpenReflection,
  onOpenTopic,
  onRemoveSavedVerse,
  onSelect,
  palette,
  savedVerses,
  versionLabel,
  visible,
}: {
  biblePlanCount: number;
  bibleVersionId: BibleVersionId;
  highlights: BibleHighlight[];
  initialStage: "home" | "search";
  initialPosition: BiblePosition;
  journalEntries: JournalEntry[];
  onClose: () => void;
  onOpenPlans: () => void;
  onOpenReflection: (entryId: string) => void;
  onOpenTopic: (topic?: string) => void;
  onRemoveSavedVerse: (id: string) => Promise<void>;
  onSelect: (position: BiblePosition) => void;
  palette: ReaderPalette;
  savedVerses: SavedVerse[];
  versionLabel: string;
  visible: boolean;
}) {
  const { language, t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(height * 0.84), 720);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const drawerScrollRef = useRef<ScrollView>(null);
  const phraseSearchRequestRef = useRef(0);
  const [stage, setStage] = useState<PickerStage>(initialStage);
  const [bookQuery, setBookQuery] = useState("");
  const [bookParentStage, setBookParentStage] = useState<"book" | "search">("book");
  const [selectedBook, setSelectedBook] = useState(initialPosition.book);
  const [testament, setTestament] = useState<TestamentFilter>("all");
  const [phraseSearchLoading, setPhraseSearchLoading] = useState(false);
  const [phraseSearchResults, setPhraseSearchResults] = useState<BibleTextSearchResult[]>([]);
  const [savedVerseMenu, setSavedVerseMenu] = useState<SavedVerse | undefined>();
  const [hiddenSavedVerseIds, setHiddenSavedVerseIds] = useState<string[]>([]);
  const visibleSavedVerses = useMemo(
    () => savedVerses.filter((verse) => !hiddenSavedVerseIds.includes(verse.id)),
    [hiddenSavedVerseIds, savedVerses],
  );
  const closeWithAnimation = useCallback(() => {
    Animated.timing(translateY, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
      toValue: sheetHeight,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [onClose, sheetHeight, translateY]);

  const settleOpen = useCallback(() => {
    Animated.spring(translateY, {
      damping: 24,
      stiffness: 240,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const topPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 70 || gesture.vy > 0.45) {
            closeWithAnimation();
            return;
          }
          settleOpen();
        },
        onPanResponderTerminate: settleOpen,
      }),
    [closeWithAnimation, settleOpen, translateY],
  );

  const handlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 50 || gesture.vy > 0.35) {
            closeWithAnimation();
            return;
          }
          settleOpen();
        },
        onPanResponderTerminate: settleOpen,
      }),
    [closeWithAnimation, settleOpen, translateY],
  );

  useEffect(() => {
    if (!visible) return;
    const normalized = normalizeBiblePosition(initialPosition);
    setStage(initialStage);
    setBookQuery("");
    setBookParentStage(initialStage === "search" ? "search" : "book");
    setSelectedBook(normalized.book);
    setTestament("all");
    setSavedVerseMenu(undefined);
  }, [initialPosition, initialStage, visible]);

  useEffect(() => {
    setHiddenSavedVerseIds((current) => current.filter((id) => savedVerses.some((verse) => verse.id === id)));
  }, [savedVerses]);

  const openSavedVerse = useCallback((verse: SavedVerse) => {
    const nextPosition = biblePositionFromVerse(verse);
    if (!nextPosition) return;
    setSavedVerseMenu(undefined);
    onSelect(nextPosition);
  }, [onSelect]);

  const removeSavedVerse = useCallback((verse: SavedVerse) => {
    setSavedVerseMenu(undefined);
    setHiddenSavedVerseIds((current) => current.includes(verse.id) ? current : [...current, verse.id]);
    void onRemoveSavedVerse(verse.id).catch(() => {
      setHiddenSavedVerseIds((current) => current.filter((id) => id !== verse.id));
    });
  }, [onRemoveSavedVerse]);

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

  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => drawerScrollRef.current?.scrollTo({ animated: false, y: 0 }));
  }, [stage, visible]);

  const book = kjvBooks.find((item) => item.name === selectedBook) ?? kjvBooks[0];
  const normalizedQuery = bookQuery.trim().toLocaleLowerCase(language);
  const searchPosition = biblePositionFromSearchQuery(bookQuery, language, bibleVersionId);
  const selectableBooks = kjvBooks.filter((item) => {
    const displayName = displayBibleBookName(item.name, language).toLocaleLowerCase(language);
    const matchesQuery = !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery) || displayName.includes(normalizedQuery);
    const matchesTestament = testament === "all" || testamentForBook(item.name) === testament;
    return matchesQuery && matchesTestament;
  });
  const matchingTopics = normalizedQuery
    ? suggestedTopics.filter((topic) => {
        const title = t(topic.titleKey).toLocaleLowerCase(language);
        const subtitle = t(topic.subtitleKey).toLocaleLowerCase(language);
        return title.includes(normalizedQuery) || subtitle.includes(normalizedQuery) || topic.apiTopic.toLowerCase().includes(normalizedQuery);
      })
    : [];
  const phraseSearchEligible = Boolean(
    stage === "search" &&
    normalizedQuery &&
    !searchPosition &&
    selectableBooks.length === 0 &&
    matchingTopics.length === 0,
  );

  useEffect(() => {
    const requestId = phraseSearchRequestRef.current + 1;
    phraseSearchRequestRef.current = requestId;
    if (!visible || !phraseSearchEligible) {
      setPhraseSearchLoading(false);
      setPhraseSearchResults([]);
      return;
    }

    setPhraseSearchLoading(true);
    setPhraseSearchResults([]);
    const timeout = setTimeout(() => {
      void searchBibleText(bookQuery, bibleVersionId)
        .then((results) => {
          if (phraseSearchRequestRef.current !== requestId) return;
          setPhraseSearchResults(results);
        })
        .catch(() => {
          if (phraseSearchRequestRef.current !== requestId) return;
          setPhraseSearchResults([]);
        })
        .finally(() => {
          if (phraseSearchRequestRef.current === requestId) {
            setPhraseSearchLoading(false);
          }
        });
    }, 180);

    return () => clearTimeout(timeout);
  }, [bibleVersionId, bookQuery, phraseSearchEligible, visible]);

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
      ? t("bible.navigator.title")
      : stage === "search"
        ? t("bible.navigator.search")
      : stage === "book"
        ? testament === "old"
          ? t("bible.navigator.oldTestament")
          : t("bible.navigator.newTestament")
        : stage === "chapter"
          ? displayBibleBookName(selectedBook, language)
            : stage === "saved"
              ? t("bible.navigator.saved")
              : stage === "highlights"
                ? t("bible.navigator.highlights")
                : t("bible.navigator.reflections");

  function goBack() {
    if (stage === "chapter") {
      setStage(bookParentStage);
      return;
    }
    if (stage !== "home") {
      setStage("home");
      setBookQuery("");
      return;
    }
    closeWithAnimation();
  }

  function openBookList(nextTestament: TestamentFilter) {
    setTestament(nextTestament);
    setBookQuery("");
    setStage("book");
  }

  function openSearch() {
    setTestament("all");
    setBookQuery("");
    setStage("search");
  }

  function chooseBook(bookName: string) {
    const nextBook = kjvBooks.find((item) => item.name === bookName);
    if (!nextBook) return;
    setBookParentStage(stage === "search" ? "search" : "book");
    setSelectedBook(bookName);
    setStage("chapter");
  }

  function chooseChapter(chapter: number) {
    onSelect(normalizeBiblePosition({ book: selectedBook, chapter, verse: 1 }));
  }

  return (
    <Modal transparent visible={visible} onRequestClose={goBack}>
      <BibleSheetModalFrame onBackdropPress={closeWithAnimation}>
        <BibleSheetShell
          animatedStyle={{ transform: [{ translateY }] }}
          contentStyle={{ paddingBottom: insets.bottom }}
          palette={palette}
          style={{ height: sheetHeight }}
        >
          <BibleSheetTop
            bordered
            handleProps={handlePanResponder.panHandlers}
            palette={palette}
            topProps={topPanResponder.panHandlers}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, width: "100%" }}>
              <ReaderCircleButton
                accessibilityLabel={stage === "home" ? t("bible.navigator.close") : t("bible.navigator.back")}
                icon={stage === "home" ? "x" : "chevron-left"}
                onPress={goBack}
                palette={palette}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={2} style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>{title}</Text>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>{stage === "home" ? `${chapterLabel(initialPosition, language)} - ${versionLabel}` : versionLabel}</Text>
              </View>
            </View>
          </BibleSheetTop>

          <ScrollView
            ref={drawerScrollRef}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 18, padding: bibleSheetHorizontalPadding, paddingBottom: Math.max(28, insets.bottom + 20) }}
          >
            {stage === "home" ? (
              <>
                <DrawerSection title={t("bible.navigator.goTo")} palette={palette}>
                  <DrawerRow
                    icon="book-open"
                    onPress={() => openBookList("old")}
                    palette={palette}
                    subtitle={t("bible.navigator.oldTestamentRange")}
                    title={t("bible.navigator.oldTestament")}
                  />
                  <DrawerRow
                    icon="book"
                    onPress={() => openBookList("new")}
                    palette={palette}
                    subtitle={t("bible.navigator.newTestamentRange")}
                    title={t("bible.navigator.newTestament")}
                  />
                  <DrawerRow
                    icon="search"
                    onPress={openSearch}
                    palette={palette}
                    subtitle={t("bible.navigator.searchSubtitle")}
                    title={t("bible.navigator.search")}
                  />
                </DrawerSection>

                <DrawerSection title={t("bible.navigator.myPlaces")} palette={palette}>
                  <DrawerRow
                    icon="play-circle"
                    onPress={() => onSelect(initialPosition)}
                    palette={palette}
                    subtitle={referenceLabel(initialPosition, language)}
                    title={t("bible.navigator.continue")}
                  />
                  <DrawerRow
                    icon="bookmark"
                    onPress={() => setStage("saved")}
                    palette={palette}
                    subtitle={savedVerses.length === 0
                      ? t("bible.navigator.saved.emptyCount")
                      : savedVerses.length === 1
                        ? t("bible.navigator.saved.single")
                        : t("bible.navigator.saved.count", { count: savedVerses.length })}
                    title={t("bible.navigator.saved")}
                  />
                  <DrawerRow
                    icon="edit-2"
                    onPress={() => setStage("highlights")}
                    palette={palette}
                    subtitle={recentHighlights.length === 0
                      ? t("bible.navigator.highlights.emptyCount")
                      : recentHighlights.length === 1
                        ? t("bible.navigator.highlights.single")
                        : t("bible.navigator.highlights.count", { count: recentHighlights.length })}
                    title={t("bible.navigator.highlights")}
                  />
                  <DrawerRow
                    icon="edit-3"
                    onPress={() => setStage("reflections")}
                    palette={palette}
                    subtitle={bibleReflections.length === 0
                      ? t("bible.navigator.reflections.emptyCount")
                      : bibleReflections.length === 1
                        ? t("bible.navigator.reflections.single")
                        : t("bible.navigator.reflections.count", { count: bibleReflections.length })}
                    title={t("bible.navigator.reflections")}
                  />
                  <DrawerRow
                    icon="calendar"
                    onPress={onOpenPlans}
                    palette={palette}
                    subtitle={biblePlanCount === 0
                      ? t("bible.navigator.plans.empty")
                      : biblePlanCount === 1
                        ? t("bible.navigator.plans.single")
                        : t("bible.navigator.plans.count", { count: biblePlanCount })}
                    title={t("bible.navigator.plans")}
                  />
                </DrawerSection>
              </>
            ) : null}

            {stage === "search" ? (
              <>
                <DrawerSearchBox
                  onChangeText={setBookQuery}
                  onSubmit={() => searchPosition && onSelect(searchPosition)}
                  palette={palette}
                  placeholder={t("bible.navigator.searchPlaceholder")}
                  value={bookQuery}
                />
                {!normalizedQuery ? (
                  <>
                    <DrawerRow
                      icon="compass"
                      onPress={() => onOpenTopic()}
                      palette={palette}
                      subtitle={t("bible.topics.exploreSubtitle")}
                      title={t("bible.topics.explore")}
                    />
                    <DrawerEmptyState palette={palette} text={t("bible.navigator.searchIntro")} />
                  </>
                ) : null}
                {searchPosition ? (
                  <DrawerRow
                    icon="search"
                    onPress={() => onSelect(searchPosition)}
                    palette={palette}
                    subtitle={t("bible.navigator.openPassageSubtitle")}
                    title={t("bible.navigator.openPassage", { reference: referenceLabel(searchPosition, language) })}
                  />
                ) : null}
                {normalizedQuery && !searchPosition && selectableBooks.length ? (
                  <View style={{ gap: 8 }}>
                    {selectableBooks.slice(0, 12).map((item) => (
                      <DrawerBookRow
                        key={item.name}
                        book={item}
                        language={language}
                        onPress={() => chooseBook(item.name)}
                        palette={palette}
                        selected={item.name === initialPosition.book}
                        t={t}
                      />
                    ))}
                  </View>
                ) : null}
                {matchingTopics.length ? (
                  <DrawerSection title={t("bible.topics.suggested")} palette={palette}>
                    {matchingTopics.map((topic) => (
                      <DrawerRow
                        icon="compass"
                        key={topic.apiTopic}
                        onPress={() => onOpenTopic(topic.apiTopic)}
                        palette={palette}
                        subtitle={t(topic.subtitleKey)}
                        title={t(topic.titleKey)}
                      />
                    ))}
                  </DrawerSection>
                ) : null}
                {phraseSearchEligible && phraseSearchLoading ? (
                  <View style={{ alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 8 }}>
                    <ActivityIndicator color={palette.accent} size="small" />
                    <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700" }}>
                      {t("bible.navigator.searchingText", { translation: versionLabel })}
                    </Text>
                  </View>
                ) : null}
                {phraseSearchEligible && !phraseSearchLoading && phraseSearchResults.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {phraseSearchResults.map((result) => (
                      <DrawerVerseRow
                        key={`${bibleVersionId}-${result.reference}`}
                        meta={versionLabel}
                        onPress={() => onSelect(result.position)}
                        palette={palette}
                        reference={displayBibleReference(result.reference, language)}
                        text={result.text}
                      />
                    ))}
                  </View>
                ) : null}
                {phraseSearchEligible && !phraseSearchLoading && phraseSearchResults.length === 0 ? (
                  <DrawerEmptyState palette={palette} text={t("bible.navigator.searchTextNoResults")} />
                ) : null}
              </>
            ) : null}

            {stage === "book" ? (
              <>
                <DrawerSearchBox
                  onChangeText={setBookQuery}
                  onSubmit={() => undefined}
                  palette={palette}
                  placeholder={t("bible.navigator.filterBooks")}
                  value={bookQuery}
                />
                <View style={{ gap: 8 }}>
                  {selectableBooks.length > 0 ? (
                    selectableBooks.map((item) => (
                      <DrawerBookRow
                        key={item.name}
                        book={item}
                        language={language}
                        onPress={() => chooseBook(item.name)}
                        palette={palette}
                        selected={item.name === initialPosition.book}
                        t={t}
                      />
                    ))
                  ) : (
                    <DrawerEmptyState palette={palette} text={t("bible.navigator.noBooks")} />
                  )}
                </View>
              </>
            ) : null}

            {stage === "chapter" ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" }}>{t("bible.navigator.chapter")}</Text>
                <PickerGrid
                  palette={palette}
                  selected={initialPosition.book === selectedBook ? initialPosition.chapter : undefined}
                  values={book?.chapters ?? []}
                  onSelect={chooseChapter}
                />
              </View>
            ) : null}

            {stage === "saved" ? (
              <View style={{ gap: 8 }}>
                {visibleSavedVerses.length ? (
                  visibleSavedVerses.map((verse) => (
                    <DrawerVerseRow
                      action={(
                        <Pressable
                          accessibilityLabel={t("bible.saved.actions.more", { reference: displayBibleReference(verse.reference, language) })}
                          accessibilityRole="button"
                          onPress={() => setSavedVerseMenu(verse)}
                          style={{
                            alignItems: "center",
                            backgroundColor: palette.input,
                            borderColor: palette.line,
                            borderRadius: 999,
                            borderWidth: 1,
                            height: 40,
                            justifyContent: "center",
                            width: 40,
                          }}
                        >
                          <Feather name="more-horizontal" size={18} color={palette.accent} />
                        </Pressable>
                      )}
                      key={verse.id}
                      onPress={() => openSavedVerse(verse)}
                      palette={palette}
                      reference={displayBibleReference(verse.reference, language)}
                      showArrow={false}
                      meta={verse.translation && verse.translation !== versionLabel ? verse.translation : undefined}
                      text={verse.text}
                    />
                  ))
                ) : (
                  <DrawerEmptyState palette={palette} text={t("bible.navigator.saved.empty")} />
                )}
              </View>
            ) : null}

            {stage === "highlights" ? (
              <View style={{ gap: 8 }}>
                {recentHighlights.length ? (
                  recentHighlights.map((highlight) => {
                    const preview = buildBibleVerse(highlight.book, highlight.chapter, highlight.startVerse, highlight.endVerse, bibleVersionId)?.text;
                    return (
                      <DrawerVerseRow
                        accentColor={highlight.color}
                        key={highlight.id}
                        onPress={() => onSelect(normalizeBiblePosition({ book: highlight.book, chapter: highlight.chapter, verse: highlight.startVerse }))}
                        palette={palette}
                        reference={displayBibleReference(highlight.reference, language)}
                        meta={highlight.translation && highlight.translation !== versionLabel ? highlight.translation : undefined}
                        text={preview}
                      />
                    );
                  })
                ) : (
                  <DrawerEmptyState palette={palette} text={t("bible.navigator.highlights.empty")} />
                )}
              </View>
            ) : null}

            {stage === "reflections" ? (
              <View style={{ gap: 8 }}>
                {bibleReflections.length ? (
                  bibleReflections.map((entry) => {
                    const verse = entry.verses?.[0] ?? entry.verse;
                    return (
                      <DrawerVerseRow
                        key={entry.id}
                        onPress={() => onOpenReflection(entry.id)}
                        palette={palette}
                        reference={displayBibleReference(verse?.reference ?? entry.passage?.reference ?? entry.title ?? t("bible.navigator.reflectionFallback"), language)}
                        text={entry.body}
                      />
                    );
                  })
                ) : (
                  <DrawerEmptyState palette={palette} text={t("bible.navigator.reflections.empty")} />
                )}
              </View>
            ) : null}
          </ScrollView>
        </BibleSheetShell>
      </BibleSheetModalFrame>
      <SavedVerseActionSheet
        onClose={() => setSavedVerseMenu(undefined)}
        onOpen={openSavedVerse}
        onRemove={removeSavedVerse}
        palette={palette}
        verse={savedVerseMenu}
      />
    </Modal>
  );
}

function DrawerSearchBox({
  onChangeText,
  onSubmit,
  palette,
  placeholder,
  value,
}: {
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  palette: ReaderPalette;
  placeholder: string;
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
        placeholder={placeholder}
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
        <Text numberOfLines={2} style={{ color: palette.muted, fontSize: 12, fontWeight: "700", lineHeight: 16 }}>
          {subtitle}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.muted} />
    </Pressable>
  );
}

function DrawerBookRow({
  book,
  language,
  onPress,
  palette,
  selected,
  t,
}: {
  book: (typeof kjvBooks)[number];
  language: AppLanguage;
  onPress: () => void;
  palette: ReaderPalette;
  selected: boolean;
  t: TranslationFunction;
}) {
  const chapterCount = book.chapters.length;
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
        <Text numberOfLines={2} style={{ color: palette.text, fontSize: 16, fontWeight: "900", lineHeight: 21 }}>
          {displayBibleBookName(book.name, language)}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
          {chapterCount === 1
            ? t("bible.navigator.chapter.single")
            : t("bible.navigator.chapter.count", { count: chapterCount })}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.muted} />
    </Pressable>
  );
}

function DrawerVerseRow({
  action,
  accentColor,
  meta,
  onPress,
  palette,
  reference,
  showArrow = true,
  text,
}: {
  action?: ReactNode;
  accentColor?: BibleHighlightColor;
  meta?: string;
  onPress: () => void;
  palette: ReaderPalette;
  reference: string;
  showArrow?: boolean;
  text?: string;
}) {
  const { t } = useAppTranslation();
  const card = (
    <Pressable
      accessibilityLabel={t("bible.navigator.openPassage", { reference })}
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
        paddingRight: action ? 66 : 14,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Text numberOfLines={1} style={{ color: palette.text, flex: 1, fontSize: 15, fontWeight: "900" }}>
          {reference}
        </Text>
        {accentColor ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{
              backgroundColor: accentColor,
              borderColor: palette.line,
              borderRadius: 999,
              borderWidth: 1,
              height: 16,
              opacity: 0.72,
              width: 16,
            }}
          />
        ) : null}
        {showArrow ? <Feather name="arrow-right" size={16} color={palette.accent} /> : null}
      </View>
      {text ? (
        <Text numberOfLines={2} style={{ color: palette.muted, fontSize: 13, fontWeight: "600", lineHeight: 18 }}>
          {text}
        </Text>
      ) : null}
      {meta ? (
        <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: "800" }}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );

  if (!action) return card;

  return (
    <View style={{ position: "relative" }}>
      {card}
      <View style={{ position: "absolute", right: 10, top: 10, zIndex: 1 }}>{action}</View>
    </View>
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
