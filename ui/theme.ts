import { Platform, type TextStyle, type ViewStyle } from "react-native";

/**
 * KOINO design tokens — brand 2.0.
 *
 * Light is "Daylight": warm off-white canvas, white cards, ink primary
 * actions and a single ember accent. Peach is illustration only.
 * Dark is "Vigil": near-black canvas, parchment text and amber actions.
 *
 * `colors` and `shadcn` are mutable on purpose: the theme provider applies a
 * scheme in place so the many inline style reads across the app update without
 * a context hook in every component. Call `applyColorScheme` only from
 * `ThemeProvider`.
 */
export type ColorScheme = "light" | "dark";

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

/** Raw brand swatches. Soft tones are decorative fills behind dark ink. */
export const brandPalette = {
  deepNavy: "#1D1611",
  warmPersika: "#F8D9BE",
  warmCanvas: "#FAF6F0",
  blushRosa: "#F3E3D5",
  lavenderHaze: "#EFE2D6",
  softCyan: "#F3E9DE",
  surfaceWhite: "#FFFFFF",
  softBorder: "#E7DCCE",
  stone: "#6A5A4C",
  mutedNavy: "#3A2E26",
  paperOffWhite: "#FBF7F1",
} as const;

/** Neutral paper used by the Bible reader in the light theme. */
export const readerSurface = "#FAF6F0";

/** The quiet wash behind app content (kept flat in 2.0). */
export const ambientTheme = {
  baseTop: "#FAF6F0",
  baseMiddle: "#FAF6F0",
  baseBottom: "#FAF6F0",
  peach: "#F8D9BE",
  apricot: "#F5E3D3",
  cream: "#F3E9DE",
} as const;

export type ShadcnPalette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  primaryPressed: string;
  secondaryPressed: string;
  outlinePressed: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  brand: string;
  brandForeground: string;
  brandSoft: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
};

const lightShadcn: ShadcnPalette = {
  background: "#FAF6F0",
  foreground: "#1D1611",
  card: "#FFFFFF",
  cardForeground: "#1D1611",
  popover: "#FFFFFF",
  popoverForeground: "#1D1611",
  primary: "#1D1611",
  primaryForeground: "#FFFDF9",
  primaryPressed: "#2E241D",
  secondaryPressed: "#EADCCB",
  outlinePressed: "#F3E9DE",
  secondary: "#F3E9DE",
  secondaryForeground: "#3A2E26",
  muted: "#F3E9DE",
  mutedForeground: "#6A5A4C",
  accent: "#F3E3D5",
  accentForeground: "#1D1611",
  brand: "#A64B21",
  brandForeground: "#FFFDF9",
  brandSoft: "#F7E7D8",
  destructive: "#B3261E",
  destructiveForeground: "#FFFFFF",
  border: "#E7DCCE",
  input: "#FFFFFF",
  ring: "#A64B21",
  success: "#15803D",
  successSoft: "#F0FDF4",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
};

const darkShadcn: ShadcnPalette = {
  background: "#14100D",
  foreground: "#F4EADF",
  card: "#1D1813",
  cardForeground: "#F4EADF",
  popover: "#231C16",
  popoverForeground: "#F4EADF",
  primary: "#E8A45C",
  primaryForeground: "#2A1B10",
  primaryPressed: "#F0B878",
  secondaryPressed: "#2E251D",
  outlinePressed: "#2A211A",
  secondary: "#231C16",
  secondaryForeground: "#DCCDBD",
  muted: "#231C16",
  mutedForeground: "#B9A997",
  accent: "#2A211A",
  accentForeground: "#F4EADF",
  brand: "#E8A45C",
  brandForeground: "#2A1B10",
  brandSoft: "#3A2C1F",
  destructive: "#F2B8B5",
  destructiveForeground: "#2A1010",
  border: "#332A22",
  input: "#1D1813",
  ring: "#E8A45C",
  success: "#A9C3A9",
  successSoft: "#1E2A20",
  warning: "#E8C07A",
  warningSoft: "#2C2418",
};

/** shadcn/ui semantic palette, tuned to the KOINO surface. Mutable. */
export const shadcn: ShadcnPalette = { ...lightShadcn };

export const softTints = {
  warmSoft: "rgba(166, 75, 33, 0.09)",
  prayerSoft: "rgba(140, 58, 86, 0.09)",
  blushSoft: "rgba(140, 58, 86, 0.12)",
  reflectionSoft: "rgba(75, 72, 121, 0.10)",
  lavenderSoft: "rgba(75, 72, 121, 0.13)",
  rhythmSoft: "rgba(71, 98, 74, 0.10)",
  cyanSoft: "rgba(71, 98, 74, 0.13)",
} as const;

const lightColors: ThemeColors = {
  background: lightShadcn.background,
  surface: lightShadcn.card,
  textPrimary: lightShadcn.foreground,
  textSecondary: "#3A2E26",
  textMuted: lightShadcn.mutedForeground,
  border: lightShadcn.border,
  accentWarm: lightShadcn.brand,
  accentPrayer: "#8C3A56",
  accentReflection: "#4B4879",
  accentRhythm: "#47624A",
  accentScripture: lightShadcn.brand,
  cardPaper: brandPalette.paperOffWhite,
  warmSoft: softTints.warmSoft,
  prayerSoft: softTints.prayerSoft,
  blushSoft: softTints.blushSoft,
  reflectionSoft: softTints.reflectionSoft,
  lavenderSoft: softTints.lavenderSoft,
  rhythmSoft: softTints.rhythmSoft,
  cyanSoft: softTints.cyanSoft,
  cream: lightShadcn.background,
  paper: lightShadcn.card,
  elevated: lightShadcn.secondary,
  input: lightShadcn.input,
  ink: lightShadcn.foreground,
  muted: lightShadcn.mutedForeground,
  olive: "#5A4A3E",
  moss: lightShadcn.success,
  clay: "#6A5A4C",
  gold: lightShadcn.brand,
  line: lightShadcn.border,
  rose: "#8C3A56",
  roseSurface: softTints.prayerSoft,
  mossSurface: softTints.rhythmSoft,
  accentSubtle: lightShadcn.brandSoft,
  danger: lightShadcn.destructive,
  dangerBorder: "#F0B4AE",
  dangerSurface: "#FEF2F2",
  disabled: "#EFE5D9",
  disabledText: "#8A7A6B",
  onAccent: "#FFFFFF",
  white: lightShadcn.card,
};

const darkColors: ThemeColors = {
  background: darkShadcn.background,
  surface: darkShadcn.card,
  textPrimary: darkShadcn.foreground,
  textSecondary: "#DCCDBD",
  textMuted: darkShadcn.mutedForeground,
  border: darkShadcn.border,
  accentWarm: darkShadcn.brand,
  accentPrayer: "#E7A8BD",
  accentReflection: "#B9B3E8",
  accentRhythm: "#A9C3A9",
  accentScripture: darkShadcn.brand,
  cardPaper: darkShadcn.card,
  warmSoft: "rgba(232, 164, 92, 0.12)",
  prayerSoft: "rgba(231, 168, 189, 0.12)",
  blushSoft: "rgba(231, 168, 189, 0.16)",
  reflectionSoft: "rgba(185, 179, 232, 0.13)",
  lavenderSoft: "rgba(185, 179, 232, 0.17)",
  rhythmSoft: "rgba(169, 195, 169, 0.13)",
  cyanSoft: "rgba(169, 195, 169, 0.17)",
  cream: darkShadcn.background,
  paper: darkShadcn.card,
  elevated: darkShadcn.secondary,
  input: darkShadcn.input,
  ink: darkShadcn.foreground,
  muted: darkShadcn.mutedForeground,
  olive: "#C8B49F",
  moss: "#A9C3A9",
  clay: "#B9A997",
  gold: darkShadcn.brand,
  line: darkShadcn.border,
  rose: "#E7A8BD",
  roseSurface: "rgba(231, 168, 189, 0.12)",
  mossSurface: "rgba(169, 195, 169, 0.13)",
  accentSubtle: darkShadcn.brandSoft,
  danger: darkShadcn.destructive,
  dangerBorder: "#6B3A36",
  dangerSurface: "#3A1D1B",
  disabled: "#2A211A",
  disabledText: "#8E7E6E",
  onAccent: "#2A1B10",
  white: darkShadcn.card,
};

/** Active semantic colours. Mutable; applied by the theme provider. */
export const colors: ThemeColors = { ...lightColors };

let activeScheme: ColorScheme = "light";

export function getColorScheme(): ColorScheme {
  return activeScheme;
}

export function applyColorScheme(scheme: ColorScheme) {
  const next = scheme === "dark" ? darkColors : lightColors;
  const nextShadcn = scheme === "dark" ? darkShadcn : lightShadcn;
  Object.assign(colors, next);
  Object.assign(shadcn, nextShadcn);
  activeScheme = scheme;
}

export const fontFamilies = {
  headingLight: "Montserrat_300Light",
  headingRegular: "Montserrat_400Regular",
  headingMedium: "Montserrat_500Medium",
  headingSemiBold: "Montserrat_600SemiBold",
  bodyRegular: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
} as const;

/**
 * Type scale 2.0. Body starts at 16, captions at 13, labels at 12.
 * Section labels are sentence case — no tracked uppercase under 10px.
 */
export const typography = {
  display: {
    fontFamily: fontFamilies.headingSemiBold,
    fontSize: 32,
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  screenTitle: {
    fontFamily: fontFamilies.headingSemiBold,
    fontSize: 30,
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  heading: {
    fontFamily: fontFamilies.headingSemiBold,
    fontSize: 24,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  title: {
    fontFamily: fontFamilies.headingMedium,
    fontSize: 19,
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  cardTitle: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 16,
    letterSpacing: -0.1,
    lineHeight: 22,
  },
  subtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 22,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 18,
    textTransform: "none",
  },
  body: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 24,
  },
  caption: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 20,
  },
  label: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 16,
  },
  button: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 20,
  },
  navLabel: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 16,
  },
} satisfies Record<string, TextStyle>;

/** 8pt spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
  gutter: 24,
  cardPadding: 20,
  sectionGap: 32,
} as const;

/** 8 control · 10 chip · 12 field/button · 20 card · 28 sheet. */
export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 20,
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
  radius: shadowRadius,
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
    shadowRadius: shadowRadius,
  };
}

/** Shallow paper elevation. Dark surfaces rely on hairlines instead. */
export const shadows = {
  card: platformShadow({
    boxShadow: "0 1px 2px rgba(29, 22, 17, 0.04), 0 8px 24px rgba(29, 22, 17, 0.05)",
    color: "#1D1611",
    elevation: 1,
    offset: { width: 0, height: 4 },
    opacity: 0.05,
    radius: 14,
  }),
  control: platformShadow({
    boxShadow: "0 1px 2px rgba(29, 22, 17, 0.05)",
    color: "#1D1611",
    elevation: 1,
    offset: { width: 0, height: 1 },
    opacity: 0.05,
    radius: 4,
  }),
  primary: platformShadow({
    boxShadow: "0 2px 8px rgba(29, 22, 17, 0.14)",
    color: "#1D1611",
    elevation: 2,
    offset: { width: 0, height: 2 },
    opacity: 0.12,
    radius: 8,
  }),
  raised: platformShadow({
    boxShadow: "0 2px 4px rgba(29, 22, 17, 0.05), 0 16px 40px rgba(29, 22, 17, 0.08)",
    color: "#1D1611",
    elevation: 3,
    offset: { width: 0, height: 10 },
    opacity: 0.08,
    radius: 22,
  }),
} as const;
