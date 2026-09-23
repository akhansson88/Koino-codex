import { Platform } from "react-native";
import { initialBibleHistory, readBibleHistory } from "@/features/bible-history";
import { isBibleVersionId, normalizeBiblePosition } from "@/features/bible-kjv";
import { defaultBibleVersionId } from "@/features/bible-preferences";
import type { TranslationFunction } from "@/ui/localization";
import { type ThemeName } from "@/ui/theme";
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

export const readerThemes = [
  { id: "light", label: "Ljus" },
  { id: "sepia", label: "Sepia" },
  { id: "dark", label: "Mörk" },
] as const;

export const defaultPosition = normalizeBiblePosition({ book: "Philippians", chapter: 4, verse: 4 });

export const defaultFontId: BibleReaderFontId = "serif";

export const defaultFontSize = 18;

const defaultReaderTheme: BibleReaderThemeId = "light";

export const defaultShowVerseNumbers = true;

export const defaultShowFootnotes = true;

export const defaultShowCrossReferences = true;

export const defaultCompactMode = false;

export const minFontSize = 16;

export const maxFontSize = 28;

export const fontSizeStep = 2;

function isReaderFontId(value: unknown): value is BibleReaderFontId {
  return typeof value === "string" && readerFonts.some((font) => font.id === value);
}

function isReaderThemeId(value: unknown): value is BibleReaderThemeId {
  return typeof value === "string" && readerThemes.some((theme) => theme.id === value);
}

function isAppTheme(value: unknown): value is ThemeName {
  return value === "light" || value === "dark";
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
      compactMode: defaultCompactMode,
      fontId: defaultFontId,
      fontSize: defaultFontSize,
      position: defaultPosition,
      history: initialBibleHistory(defaultPosition),
      readerTheme: defaultReaderTheme,
      showCrossReferences: defaultShowCrossReferences,
      showFootnotes: defaultShowFootnotes,
      showVerseNumbers: defaultShowVerseNumbers,
    };
  }

  try {
    const parsed = JSON.parse(value) as Partial<BibleReaderPreferences> | null;
    const position = normalizeBiblePosition(parsed?.position);
    const history = readBibleHistory(parsed?.history, position);
    return {
      appTheme: isAppTheme(parsed?.appTheme) ? parsed.appTheme : undefined,
      bibleVersionId: isBibleVersionId(parsed?.bibleVersionId) ? parsed.bibleVersionId : defaultBibleVersionId,
      compactMode: typeof parsed?.compactMode === "boolean" ? parsed.compactMode : defaultCompactMode,
      fontId: isReaderFontId(parsed?.fontId) ? parsed.fontId : defaultFontId,
      fontSize: normalizeFontSize(parsed?.fontSize),
      position: history.entries[history.index],
      history,
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
      history: initialBibleHistory(defaultPosition),
      readerTheme: defaultReaderTheme,
      showCrossReferences: defaultShowCrossReferences,
      showFootnotes: defaultShowFootnotes,
      showVerseNumbers: defaultShowVerseNumbers,
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

export function readerThemeLabel(themeId: BibleReaderThemeId, t: TranslationFunction) {
  if (themeId === "dark") return t("bible.settings.theme.dark");
  if (themeId === "sepia") return t("bible.settings.theme.sepia");
  return t("bible.settings.theme.light");
}
