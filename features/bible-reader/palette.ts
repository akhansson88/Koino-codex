import { readerSurface } from "@/ui/theme";
import { type ColorScheme } from "@/ui/theme";
import { type ReaderPalette } from "@/features/bible-reader/types";

export function readerPaletteFor(scheme: ColorScheme = "light"): ReaderPalette {
  if (scheme === "dark") {
    return {
      accent: "#E8A45C",
      background: "#14100D",
      buttonText: "#2A1B10",
      danger: "#F2B8B5",
      dim: "rgba(244, 234, 223, 0.30)",
      input: "#1D1813",
      line: "#332A22",
      muted: "#B9A997",
      peach: "#2A211A",
      shadow: "#000000",
      sheet: "#1D1813",
      surface: "#1D1813",
      text: "#F4EADF",
    };
  }

  return {
    accent: "#A64B21",
    background: readerSurface,
    buttonText: "#FFFDF9",
    danger: "#B3261E",
    dim: "rgba(29, 22, 17, 0.34)",
    input: "#FFFFFF",
    line: "#E7DCCE",
    muted: "#6A5A4C",
    peach: "#F3E3D5",
    shadow: "#1D1611",
    sheet: "#FFFDF9",
    surface: "#FFFFFF",
    text: "#1D1611",
  };
}
