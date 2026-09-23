import { themes } from "@/ui/theme";
import { type BibleReaderThemeId, type ReaderPalette } from "@/features/bible-reader/types";

export function readerPaletteFor(theme: BibleReaderThemeId): ReaderPalette {
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
