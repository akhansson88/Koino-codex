import { Platform, type ViewStyle } from "react-native";

type ThemeColors = {
  cream: string;
  paper: string;
  elevated: string;
  input: string;
  ink: string;
  muted: string;
  olive: string;
  moss: string;
  clay: string;
  gold: string;
  line: string;
  rose: string;
  roseSurface: string;
  mossSurface: string;
  accentSubtle: string;
  danger: string;
  dangerBorder: string;
  dangerSurface: string;
  disabled: string;
  disabledText: string;
  onAccent: string;
  white: string;
};

export const brandPalette = {
  deepNavy: "#0B1220",
  warmPeach: "#FFC79A",
  blushRosa: "#F2A7C4",
  lavenderHaze: "#C5B4E6",
  softCyan: "#86D8DE",
  offWhite: "#F3F2EC",
} as const;

const lightTheme: ThemeColors = {
  cream: "#FAF5EE",
  paper: "#FFFFFF",
  elevated: "#FFF9F2",
  input: "#FFFDF9",
  ink: brandPalette.deepNavy,
  muted: "#6F7686",
  olive: "#A45118",
  moss: "#E9965F",
  clay: "#8B4A2F",
  gold: "#F59A63",
  line: "#E9D9C8",
  rose: "#D77C68",
  roseSurface: "#FCEDE8",
  mossSurface: "#FFF3EA",
  accentSubtle: "#FFF4EA",
  danger: "#B42318",
  dangerBorder: "#FDA29B",
  dangerSurface: "#FEF3F2",
  disabled: "#EDE5DA",
  disabledText: "#9A9085",
  onAccent: brandPalette.deepNavy,
  white: "#FFFFFF",
};

export type ThemeName = "light" | "dark";
export type LegacyThemeName = "classic" | "brand";
export type StoredThemeName = ThemeName | LegacyThemeName;

const darkTheme: ThemeColors = {
  cream: brandPalette.deepNavy,
  paper: "#111A2C",
  elevated: "#172237",
  input: "#0F192B",
  ink: brandPalette.offWhite,
  muted: "#A7B0C0",
  olive: brandPalette.warmPeach,
  moss: "#FFB985",
  clay: "#E99B89",
  gold: "#F8BE88",
  line: "#2A3549",
  rose: "#F0A090",
  roseSurface: "#33201E",
  mossSurface: "#342417",
  accentSubtle: "#3A281C",
  danger: "#FDA29B",
  dangerBorder: "#7A271A",
  dangerSurface: "#2A1716",
  disabled: "#263145",
  disabledText: "#7D8797",
  onAccent: brandPalette.deepNavy,
  white: brandPalette.offWhite,
};

export const themes: Record<ThemeName, ThemeColors> = {
  light: lightTheme,
  dark: darkTheme,
};

export const themeLabels: Record<ThemeName, string> = {
  light: "Light",
  dark: "Night",
};

export const colors: ThemeColors = { ...themes.light };

export function normalizeTheme(theme: string | null | undefined): ThemeName {
  if (theme === "dark" || theme === "brand") return "dark";
  return "light";
}

export function applyTheme(theme: ThemeName) {
  const next = themes[theme];
  for (const key of Object.keys(next) as Array<keyof ThemeColors>) {
    colors[key] = next[key];
  }
}

export function statusBarStyle(theme: ThemeName): "dark" | "light" {
  return theme === "dark" ? "light" : "dark";
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  xxl: 28,
};

export const copy = {
  checkInQuestion: "Have you read the Bible today?",
  prayerInvitation: "Take a quiet breath. Hold this person before God, without hurry.",
};

export function platformShadow({
  boxShadow,
  color = brandPalette.deepNavy,
  elevation,
  opacity,
  radius,
  offset,
}: {
  boxShadow: string;
  color?: string;
  elevation?: number;
  opacity: number;
  radius: number;
  offset: { width: number; height: number };
}): ViewStyle {
  if (Platform.OS === "web") {
    return { boxShadow } as ViewStyle;
  }

  return {
    elevation,
    shadowColor: color,
    shadowOffset: offset,
    shadowOpacity: opacity,
    shadowRadius: radius,
  };
}
