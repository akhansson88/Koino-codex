import { colors } from "@/ui/theme";
import { type ReaderPalette } from "@/features/bible-reader/types";

export function readerPaletteFor(): ReaderPalette {
  const lightColors = colors;

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
