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

const classicTheme: ThemeColors = {
  cream: brandPalette.offWhite,
  paper: brandPalette.offWhite,
  elevated: brandPalette.lavenderHaze,
  input: brandPalette.offWhite,
  ink: brandPalette.deepNavy,
  muted: brandPalette.deepNavy,
  olive: brandPalette.deepNavy,
  moss: brandPalette.softCyan,
  clay: brandPalette.deepNavy,
  gold: brandPalette.warmPeach,
  line: brandPalette.lavenderHaze,
  rose: brandPalette.blushRosa,
  roseSurface: brandPalette.blushRosa,
  mossSurface: brandPalette.softCyan,
  accentSubtle: brandPalette.warmPeach,
  danger: brandPalette.deepNavy,
  dangerBorder: brandPalette.blushRosa,
  dangerSurface: brandPalette.blushRosa,
  disabled: brandPalette.lavenderHaze,
  disabledText: brandPalette.deepNavy,
  onAccent: brandPalette.offWhite,
  white: brandPalette.offWhite,
};

export type ThemeName = "classic" | "brand";

const brandTheme: ThemeColors = {
  cream: brandPalette.deepNavy,
  paper: brandPalette.deepNavy,
  elevated: brandPalette.deepNavy,
  input: brandPalette.deepNavy,
  ink: brandPalette.offWhite,
  muted: brandPalette.offWhite,
  olive: brandPalette.warmPeach,
  moss: brandPalette.softCyan,
  clay: brandPalette.blushRosa,
  gold: brandPalette.warmPeach,
  line: brandPalette.lavenderHaze,
  rose: brandPalette.blushRosa,
  roseSurface: brandPalette.deepNavy,
  mossSurface: brandPalette.deepNavy,
  accentSubtle: brandPalette.warmPeach,
  danger: brandPalette.blushRosa,
  dangerBorder: brandPalette.blushRosa,
  dangerSurface: brandPalette.deepNavy,
  disabled: brandPalette.lavenderHaze,
  disabledText: brandPalette.deepNavy,
  onAccent: brandPalette.deepNavy,
  white: brandPalette.offWhite,
};

export const themes: Record<ThemeName, ThemeColors> = {
  classic: classicTheme,
  brand: brandTheme,
};

export const themeLabels: Record<ThemeName, string> = {
  classic: "Classic",
  brand: "Brand",
};

export const colors: ThemeColors = { ...themes.classic };

export function applyTheme(theme: ThemeName) {
  const next = themes[theme];
  for (const key of Object.keys(next) as Array<keyof ThemeColors>) {
    colors[key] = next[key];
  }
}

export function statusBarStyle(theme: ThemeName): "dark" | "light" {
  return theme === "brand" ? "light" : "dark";
}

export const radius = {
  sm: 8,
  md: 8,
  lg: 8,
};

export const copy = {
  checkInQuestion: "Have you read the Bible today?",
  prayerInvitation: "Take a quiet breath. Hold this person before God, without hurry.",
};
