import { Platform, type TextStyle, type ViewStyle } from "react-native";

/**
 * KOINO design tokens.
 *
 * The surface language follows shadcn/ui: near-white canvas, white cards,
 * hairline borders, ink primary actions, compact corner radii and dense,
 * calm typography. KOINO's warm brand accent is kept for highlights only.
 */
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

/**
 * Raw brand swatches. These are intentionally soft: they are used for
 * decorative fills that sit behind dark ink text.
 */
export const brandPalette = {
  deepNavy: "#231A13",
  warmPersika: "#FFC79A",
  warmCanvas: "#FFF9F2",
  blushRosa: "#F6BFA8",
  lavenderHaze: "#F7D3BC",
  softCyan: "#FBE6D5",
  surfaceWhite: "#FFFFFF",
  softBorder: "#EFDECE",
  stone: "#7A6758",
  mutedNavy: "#4A382C",
  paperOffWhite: "#FFF4E9",
} as const;

/** The Bible reader deliberately keeps a neutral paper surface. */
export const readerSurface = "#FAFAF9";

/** The warm peach wash that sits behind app content. */
export const ambientTheme = {
  baseTop: "#FFFCF7",
  baseMiddle: "#FFF5E9",
  baseBottom: "#FFEAD8",
  peach: "#FFC79A",
  apricot: "#FFD9BA",
  cream: "#FFF0E1",
} as const;

/** shadcn/ui semantic palette, tuned to KOINO's peach-light surface. */
export const shadcn = {
  background: "#FFF9F2",
  foreground: "#231A13",
  card: "#FFFFFF",
  cardForeground: "#231A13",
  popover: "#FFFFFF",
  popoverForeground: "#231A13",
  primary: "#FFC79A",
  primaryForeground: "#2A1B10",
  secondary: "#FFF4E9",
  secondaryForeground: "#3A2A1E",
  muted: "#FAEFE4",
  mutedForeground: "#6E5B4B",
  accent: "#FFF0E0",
  accentForeground: "#2A1D13",
  brand: "#A9571F",
  brandForeground: "#FFFBF7",
  brandSoft: "#FFEBD8",
  destructive: "#DC2626",
  destructiveForeground: "#FFFFFF",
  border: "#EFDECE",
  input: "#FFFFFF",
  ring: "#E9A56C",
  success: "#15803D",
  successSoft: "#F0FDF4",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
} as const;

export const softTints = {
  warmSoft: "rgba(180, 85, 45, 0.09)",
  prayerSoft: "rgba(178, 66, 112, 0.09)",
  blushSoft: "rgba(178, 66, 112, 0.12)",
  reflectionSoft: "rgba(109, 91, 168, 0.10)",
  lavenderSoft: "rgba(109, 91, 168, 0.13)",
  rhythmSoft: "rgba(35, 128, 122, 0.10)",
  cyanSoft: "rgba(35, 128, 122, 0.13)",
} as const;

export const colors: ThemeColors = {
  background: shadcn.background,
  surface: shadcn.card,
  textPrimary: shadcn.foreground,
  textSecondary: shadcn.mutedForeground,
  textMuted: shadcn.secondaryForeground,
  border: shadcn.border,
  accentWarm: shadcn.brand,
  accentPrayer: "#B24270",
  accentReflection: "#6D5BA8",
  accentRhythm: "#23807A",
  accentScripture: shadcn.brand,
  cardPaper: brandPalette.paperOffWhite,
  warmSoft: softTints.warmSoft,
  prayerSoft: softTints.prayerSoft,
  blushSoft: softTints.blushSoft,
  reflectionSoft: softTints.reflectionSoft,
  lavenderSoft: softTints.lavenderSoft,
  rhythmSoft: softTints.rhythmSoft,
  cyanSoft: softTints.cyanSoft,
  cream: shadcn.background,
  paper: shadcn.card,
  elevated: shadcn.secondary,
  input: shadcn.input,
  ink: shadcn.foreground,
  muted: shadcn.mutedForeground,
  olive: "#33241A",
  moss: shadcn.success,
  clay: "#5F5147",
  gold: shadcn.brand,
  line: shadcn.border,
  rose: "#B24270",
  roseSurface: softTints.prayerSoft,
  mossSurface: softTints.rhythmSoft,
  accentSubtle: shadcn.brandSoft,
  danger: shadcn.destructive,
  dangerBorder: "#FCA5A5",
  dangerSurface: "#FEF2F2",
  disabled: "#F7EDE3",
  disabledText: "#B4A496",
  onAccent: "#FFFFFF",
  white: shadcn.card,
};

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
    letterSpacing: -0.6,
    lineHeight: 39,
  },
  screenTitle: {
    fontFamily: fontFamilies.headingSemiBold,
    fontSize: 28,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  heading: {
    fontFamily: fontFamilies.headingSemiBold,
    fontSize: 22,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  title: {
    fontFamily: fontFamilies.headingMedium,
    fontSize: 18,
    letterSpacing: -0.15,
    lineHeight: 24,
  },
  cardTitle: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 16,
    letterSpacing: -0.1,
    lineHeight: 22,
  },
  subtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 14,
    letterSpacing: 0,
    lineHeight: 20,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 11,
    letterSpacing: 0.8,
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

/** shadcn's radius scale, expressed in density-independent pixels. */
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 20,
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

/**
 * Warm, shallow elevation. Cards sit just above the peach wash while floating
 * controls get a tighter shadow and primary actions a faint amber glow.
 */
export const shadows = {
  card: platformShadow({
    boxShadow: "0 1px 2px rgba(88, 52, 25, 0.04), 0 6px 18px rgba(88, 52, 25, 0.05)",
    color: "#583419",
    elevation: 1,
    offset: { width: 0, height: 4 },
    opacity: 0.06,
    radius: 12,
  }),
  control: platformShadow({
    boxShadow: "0 1px 2px rgba(88, 52, 25, 0.05)",
    color: "#583419",
    elevation: 1,
    offset: { width: 0, height: 1 },
    opacity: 0.05,
    radius: 4,
  }),
  primary: platformShadow({
    boxShadow: "0 4px 12px rgba(201, 106, 46, 0.18)",
    color: "#9A4F1F",
    elevation: 2,
    offset: { width: 0, height: 3 },
    opacity: 0.16,
    radius: 8,
  }),
  raised: platformShadow({
    boxShadow: "0 2px 4px rgba(88, 52, 25, 0.05), 0 14px 34px rgba(88, 52, 25, 0.08)",
    color: "#583419",
    elevation: 3,
    offset: { width: 0, height: 8 },
    opacity: 0.08,
    radius: 20,
  }),
} as const;
