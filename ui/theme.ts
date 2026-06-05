import { Platform, type TextStyle, type ViewStyle } from "react-native";

type ThemeColors = {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  accentWarm: string;
  accentPrayer: string;
  accentReflection: string;
  accentRhythm: string;
  accentScripture: string;
  cardPaper: string;
  warmSoft: string;
  prayerSoft: string;
  blushSoft: string;
  reflectionSoft: string;
  lavenderSoft: string;
  rhythmSoft: string;
  cyanSoft: string;
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
  warmPersika: "#FFC79A",
  warmCanvas: "#FAF8F4",
  blushRosa: "#F3ACC8",
  lavenderHaze: "#C8BCE7",
  softCyan: "#8EDCDA",
  surfaceWhite: "#FFFFFC",
  softBorder: "#E9E4DC",
  stone: "#6F6B64",
  mutedNavy: "#273247",
  paperOffWhite: "#F3F2ED",
} as const;

export const softTints = {
  warmSoft: "rgba(255, 199, 154, 0.22)",
  prayerSoft: "rgba(243, 172, 200, 0.18)",
  blushSoft: "rgba(243, 172, 200, 0.22)",
  reflectionSoft: "rgba(200, 188, 231, 0.18)",
  lavenderSoft: "rgba(200, 188, 231, 0.22)",
  rhythmSoft: "rgba(142, 220, 218, 0.18)",
  cyanSoft: "rgba(142, 220, 218, 0.22)",
} as const;

const lightTheme: ThemeColors = {
  background: brandPalette.warmCanvas,
  surface: brandPalette.surfaceWhite,
  textPrimary: brandPalette.deepNavy,
  textSecondary: brandPalette.stone,
  textMuted: brandPalette.mutedNavy,
  border: brandPalette.softBorder,
  accentWarm: brandPalette.warmPersika,
  accentPrayer: brandPalette.blushRosa,
  accentReflection: brandPalette.lavenderHaze,
  accentRhythm: brandPalette.softCyan,
  accentScripture: brandPalette.warmPersika,
  cardPaper: brandPalette.paperOffWhite,
  warmSoft: softTints.warmSoft,
  prayerSoft: softTints.prayerSoft,
  blushSoft: softTints.blushSoft,
  reflectionSoft: softTints.reflectionSoft,
  lavenderSoft: softTints.lavenderSoft,
  rhythmSoft: softTints.rhythmSoft,
  cyanSoft: softTints.cyanSoft,
  cream: brandPalette.warmCanvas,
  paper: brandPalette.surfaceWhite,
  elevated: softTints.warmSoft,
  input: brandPalette.surfaceWhite,
  ink: brandPalette.deepNavy,
  muted: brandPalette.stone,
  olive: brandPalette.mutedNavy,
  moss: brandPalette.softCyan,
  clay: brandPalette.mutedNavy,
  gold: brandPalette.warmPersika,
  line: brandPalette.softBorder,
  rose: brandPalette.blushRosa,
  roseSurface: softTints.prayerSoft,
  mossSurface: softTints.rhythmSoft,
  accentSubtle: softTints.warmSoft,
  danger: "#B42318",
  dangerBorder: "#FDA29B",
  dangerSurface: "#FEF3F2",
  disabled: "#EDE5DA",
  disabledText: "#9A9085",
  onAccent: brandPalette.deepNavy,
  white: brandPalette.surfaceWhite,
};

export type ThemeName = "light" | "dark";
export type LegacyThemeName = "classic" | "brand";
export type StoredThemeName = ThemeName | LegacyThemeName;

const darkTheme: ThemeColors = {
  background: brandPalette.deepNavy,
  surface: "#111A2C",
  textPrimary: brandPalette.paperOffWhite,
  textSecondary: "#A7B0C0",
  textMuted: "#D1D5E0",
  border: "#2A3549",
  accentWarm: brandPalette.warmPersika,
  accentPrayer: brandPalette.blushRosa,
  accentReflection: brandPalette.lavenderHaze,
  accentRhythm: brandPalette.softCyan,
  accentScripture: brandPalette.warmPersika,
  cardPaper: "#1C2740",
  warmSoft: "rgba(255, 199, 154, 0.14)",
  prayerSoft: "rgba(243, 172, 200, 0.14)",
  blushSoft: "rgba(243, 172, 200, 0.18)",
  reflectionSoft: "rgba(200, 188, 231, 0.14)",
  lavenderSoft: "rgba(200, 188, 231, 0.18)",
  rhythmSoft: "rgba(142, 220, 218, 0.14)",
  cyanSoft: "rgba(142, 220, 218, 0.18)",
  cream: brandPalette.deepNavy,
  paper: "#111A2C",
  elevated: "#172237",
  input: "#0F192B",
  ink: brandPalette.paperOffWhite,
  muted: "#A7B0C0",
  olive: "#D1D5E0",
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
  white: brandPalette.paperOffWhite,
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

export const fontFamilies = {
  headingLight: "Montserrat_300Light",
  headingRegular: "Montserrat_400Regular",
  headingMedium: "Montserrat_500Medium",
  headingSemiBold: "Montserrat_600SemiBold",
  bodyRegular: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
} as const;

export const typography = {
  display: {
    fontFamily: fontFamilies.headingSemiBold,
    fontSize: 33,
    letterSpacing: 0,
    lineHeight: 40,
  },
  screenTitle: {
    fontFamily: fontFamilies.headingSemiBold,
    fontSize: 28,
    letterSpacing: 0,
    lineHeight: 34,
  },
  heading: {
    fontFamily: fontFamilies.headingSemiBold,
    fontSize: 22,
    letterSpacing: 0,
    lineHeight: 28,
  },
  title: {
    fontFamily: fontFamilies.headingSemiBold,
    fontSize: 18,
    letterSpacing: 0,
    lineHeight: 24,
  },
  cardTitle: {
    fontFamily: fontFamilies.headingMedium,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 22,
  },
  subtitle: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
    letterSpacing: 0,
    lineHeight: 20,
  },
  sectionLabel: {
    fontFamily: fontFamilies.headingMedium,
    fontSize: 12,
    letterSpacing: 0.5,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  body: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 22,
  },
  caption: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
  },
  label: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 18,
  },
  button: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 20,
  },
  navLabel: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 11,
    letterSpacing: 0,
    lineHeight: 14,
  },
} satisfies Record<string, TextStyle>;

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
