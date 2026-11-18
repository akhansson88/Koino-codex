import { readerSurface } from "@/ui/theme";
import { type ReaderPalette } from "@/features/bible-reader/types";

export function readerPaletteFor(): ReaderPalette {
  return {
    accent: "#A9571F",
    background: readerSurface,
    buttonText: "#2A1B10",
    danger: "#DC2626",
    dim: "rgba(43, 29, 18, 0.34)",
    input: "#FFFFFF",
    line: "#EADCD0",
    muted: "#7A6758",
    peach: "#FFE2C7",
    shadow: "#3C2A1C",
    sheet: "#FFFDFA",
    surface: "#FFFFFF",
    text: "#231A13",
  };
}
