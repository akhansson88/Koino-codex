import { Platform, type ViewStyle } from "react-native";

type BackgroundColors = {
  app: string;
  surface: string;
  elevated: string;
};

type TextColors = {
  primary: string;
  secondary: string;
  muted: string;
  inverse: string;
};

type BrandColors = {
  mistBlue: string;
  sage: string;
  peach: string;
  coral: string;
};

type SemanticColors = {
  prayer: string;
  prayerSoft: string;
  reflection: string;
  reflectionSoft: string;
  community: string;
  communitySoft: string;
  warmth: string;
  warmthSoft: string;
  success: string;
  scripture: string;
};

type BorderColors = {
  subtle: string;
  soft: string;
};

type ShadowColors = {
  soft: string;
};

type OverlayColors = {
  scrim: string;
};

type ThemeTokens = {
  background: BackgroundColors;
  text: TextColors;
  brand: BrandColors;
  semantic: SemanticColors;
  border: BorderColors;
  shadow: ShadowColors;
  overlay: OverlayColors;
};

type LegacyColorAliases = {
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

type ThemeColors = ThemeTokens & LegacyColorAliases;

const warmOffWhite = "#F8F6F2";
const warmWhite = "#FCFBF8";
const white = "#FFFFFF";
const charcoal = "#1C1C1C";
const stone = "#6B6B6B";
const mutedStone = "#8A8A8A";
const mistBlue = "#C9D8E6";
const sage = "#A6C7B1";
const peach = "#FFCCB5";
const coral = "#FF6B5C";

export const brandPalette = {
  warmOffWhite,
  warmWhite,
  charcoal,
  stone,
  mistBlue,
  sage,
  peach,
  coral,
  deepNavy: charcoal,
  warmPeach: peach,
  lavender: mistBlue,
  blushRosa: mistBlue,
  lavenderHaze: mistBlue,
  softCyan: sage,
  offWhite: warmOffWhite,
} as const;

const lightTokens: ThemeTokens = {
  background: {
    app: warmOffWhite,
    surface: warmWhite,
    elevated: white,
  },
  text: {
    primary: charcoal,
    secondary: stone,
    muted: mutedStone,
    inverse: warmWhite,
  },
  brand: {
    mistBlue,
    sage,
    peach,
    coral,
  },
  semantic: {
    prayer: coral,
    prayerSoft: "#FFE4DC",
    reflection: mistBlue,
    reflectionSoft: "#EEF4FA",
    community: sage,
    communitySoft: "#E6F0EA",
    warmth: peach,
    warmthSoft: "#FFF0E8",
    success: sage,
    scripture: mistBlue,
  },
  border: {
    subtle: "rgba(28, 28, 28, 0.08)",
    soft: "rgba(28, 28, 28, 0.12)",
  },
  shadow: {
    soft: "rgba(28, 28, 28, 0.06)",
  },
  overlay: {
    scrim: "rgba(28, 28, 28, 0.45)",
  },
};

const darkTokens: ThemeTokens = {
  background: {
    app: "#171615",
    surface: "#23211E",
    elevated: "#2D2A26",
  },
  text: {
    primary: warmWhite,
    secondary: "#C8C3BA",
    muted: "#9F9A91",
    inverse: charcoal,
  },
  brand: {
    mistBlue: "#B7C8D9",
    sage: "#9ABAA4",
    peach: "#F4BFA7",
    coral,
  },
  semantic: {
    prayer: coral,
    prayerSoft: "#3A211D",
    reflection: "#B7C8D9",
    reflectionSoft: "#1F2A34",
    community: "#9ABAA4",
    communitySoft: "#203126",
    warmth: "#F4BFA7",
    warmthSoft: "#35251F",
    success: "#9ABAA4",
    scripture: "#B7C8D9",
  },
  border: {
    subtle: "rgba(252, 251, 248, 0.12)",
    soft: "rgba(252, 251, 248, 0.18)",
  },
  shadow: {
    soft: "rgba(0, 0, 0, 0.28)",
  },
  overlay: {
    scrim: "rgba(0, 0, 0, 0.58)",
  },
};

function withLegacyAliases(tokens: ThemeTokens): ThemeColors {
  return {
    ...tokens,
    cream: tokens.background.app,
    paper: tokens.background.surface,
    elevated: tokens.background.elevated,
    input: tokens.background.surface,
    ink: tokens.text.primary,
    muted: tokens.text.secondary,
    olive: tokens.text.primary,
    moss: tokens.brand.sage,
    clay: tokens.text.secondary,
    gold: tokens.text.primary,
    line: tokens.border.subtle,
    rose: tokens.brand.mistBlue,
    roseSurface: tokens.semantic.reflectionSoft,
    mossSurface: tokens.semantic.communitySoft,
    accentSubtle: tokens.semantic.warmthSoft,
    danger: tokens.background.app === warmOffWhite ? "#B42318" : "#FDA29B",
    dangerBorder: tokens.background.app === warmOffWhite ? "#FDA29B" : "#7A271A",
    dangerSurface: tokens.background.app === warmOffWhite ? "#FEF3F2" : "#2A1716",
    disabled: tokens.background.app === warmOffWhite ? "#E2DED6" : "#393631",
    disabledText: tokens.text.muted,
    onAccent: charcoal,
    white,
  };
}

const lightTheme: ThemeColors = withLegacyAliases(lightTokens);
const darkTheme: ThemeColors = withLegacyAliases(darkTokens);

export type ThemeName = "light" | "dark";
export type LegacyThemeName = "classic" | "brand";
export type StoredThemeName = ThemeName | LegacyThemeName;

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
  Object.assign(colors, themes[theme]);
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
  color = brandPalette.charcoal,
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
