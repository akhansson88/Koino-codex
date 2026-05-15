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

const classicTheme: ThemeColors = {
  cream: "#F5F7F3",
  paper: "#FFFFFF",
  elevated: "#EEF3ED",
  input: "#FAFCF8",
  ink: "#24302B",
  muted: "#68746E",
  olive: "#5F8268",
  moss: "#7BA39C",
  clay: "#B87962",
  gold: "#9B8248",
  line: "#DCE4DA",
  rose: "#B98395",
  roseSurface: "#F8EEF1",
  mossSurface: "#ECF5F1",
  accentSubtle: "#E4EEE5",
  danger: "#B85858",
  dangerBorder: "#D9A9A9",
  dangerSurface: "#F8EAEA",
  disabled: "#E6EBE4",
  disabledText: "#8B968F",
  onAccent: "#FFFFFF",
  white: "#FFFFFF",
};

export type ThemeName = "classic" | "brand";

const brandTheme: ThemeColors = {
  cream: "#17233D",
  paper: "#1E2D4D",
  elevated: "#26365A",
  input: "#223254",
  ink: "#F7F3EE",
  muted: "#C2C8D7",
  olive: "#E8A680",
  moss: "#8FD0D6",
  clay: "#D6A6B9",
  gold: "#B6A9D8",
  line: "#36466A",
  rose: "#D6A6B9",
  roseSurface: "#2B3A60",
  mossSurface: "#2A3E62",
  accentSubtle: "#34456B",
  danger: "#D98F93",
  dangerBorder: "#B46B73",
  dangerSurface: "#3A3344",
  disabled: "#2F3F63",
  disabledText: "#8D9ABA",
  onAccent: "#17233D",
  white: "#F7F3EE",
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

