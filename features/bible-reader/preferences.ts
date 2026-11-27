import { Platform } from "react-native";
import { initialBibleHistory, readBibleHistory } from "@/features/bible-history";
import { isBibleVersionId, normalizeBiblePosition } from "@/features/bible-kjv";
import { defaultBibleVersionId } from "@/features/bible-preferences";
import type { TranslationFunction } from "@/ui/localization";
import {
  type BibleReaderFontId,
  type BibleReaderThemeId,
  type BibleReaderPreferences,
} from "@/features/bible-reader/types";

export const readerFonts = [
  { id: "serif", label: "Serif" },
  { id: "classic", label: "Classic" },
  { id: "humanist", label: "Humanist" },
  { id: "system", label: "System" },
] as const;

export const defaultPosition = normalizeBiblePosition({ book: "Philippians", chapter: 4, verse: 4 });

export const defaultFontId: BibleReaderFontId = "serif";

export const defaultFontSize = 18;

const defaultReaderTheme: BibleReaderThemeId = "light";

export const defaultShowVerseNumbers = true;

export const defaultFlowingParagraphText = false;

export const minFontSize = 16;

export const maxFontSize = 28;

export const fontSizeStep = 2;

function isReaderFontId(value: unknown): value is BibleReaderFontId {
  return typeof value === "string" && readerFonts.some((font) => font.id === value);
}

export function normalizeFontSize(value: unknown) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : defaultFontSize;
  const clamped = Math.min(maxFontSize, Math.max(minFontSize, numericValue));
  return minFontSize + Math.round((clamped - minFontSize) / fontSizeStep) * fontSizeStep;
}

export function parsePreferences(value: string | null): BibleReaderPreferences {
  if (!value) {
    return {
      bibleVersionId: defaultBibleVersionId,
      compareEnabled: false,
      compareRatio: 0.5,
      compareSync: true,
      fontId: defaultFontId,
      fontSize: defaultFontSize,
      position: defaultPosition,
      history: initialBibleHistory(defaultPosition),
      readerTheme: defaultReaderTheme,
      showVerseNumbers: defaultShowVerseNumbers,
      flowingParagraphText: defaultFlowingParagraphText,
    };
  }

  try {
    const parsed = JSON.parse(value) as Partial<BibleReaderPreferences> | null;
    const bibleVersionId = isBibleVersionId(parsed?.bibleVersionId) ? parsed.bibleVersionId : defaultBibleVersionId;
    const position = normalizeBiblePosition(parsed?.position, bibleVersionId);
    const history = readBibleHistory(parsed?.history, position, bibleVersionId);
    const compareRatio = typeof parsed?.compareRatio === "number" && Number.isFinite(parsed.compareRatio)
      ? Math.min(0.65, Math.max(0.35, parsed.compareRatio))
      : 0.5;
    const compareSecondaryVersionId = isBibleVersionId(parsed?.compareSecondaryVersionId) && parsed.compareSecondaryVersionId !== bibleVersionId
      ? parsed.compareSecondaryVersionId
      : undefined;
    return {
      appTheme: "light",
      bibleVersionId,
      compareEnabled: parsed?.compareEnabled === true && Boolean(compareSecondaryVersionId),
      compareRatio,
      ...(compareSecondaryVersionId ? { compareSecondaryVersionId } : {}),
      compareSync: typeof parsed?.compareSync === "boolean" ? parsed.compareSync : true,
      fontId: isReaderFontId(parsed?.fontId) ? parsed.fontId : defaultFontId,
      fontSize: normalizeFontSize(parsed?.fontSize),
      position: history.entries[history.index],
      history,
      readerTheme: defaultReaderTheme,
      showVerseNumbers: typeof parsed?.showVerseNumbers === "boolean" ? parsed.showVerseNumbers : defaultShowVerseNumbers,
      flowingParagraphText: typeof parsed?.flowingParagraphText === "boolean" ? parsed.flowingParagraphText : defaultFlowingParagraphText,
    };
  } catch {
    return {
      bibleVersionId: defaultBibleVersionId,
      compareEnabled: false,
      compareRatio: 0.5,
      compareSync: true,
      fontId: defaultFontId,
      fontSize: defaultFontSize,
      position: defaultPosition,
      history: initialBibleHistory(defaultPosition),
      readerTheme: defaultReaderTheme,
      showVerseNumbers: defaultShowVerseNumbers,
      flowingParagraphText: defaultFlowingParagraphText,
    };
  }
}

export function fontFamilyFor(fontId: BibleReaderFontId) {
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

export function readerFontLabel(fontId: BibleReaderFontId, t: TranslationFunction) {
  if (fontId === "classic") return t("bible.settings.font.classic");
  if (fontId === "humanist") return t("bible.settings.font.humanist");
  if (fontId === "system") return t("bible.settings.font.system");
  return t("bible.settings.font.serif");
}
