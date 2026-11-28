export const appLanguages = [
  "en",
  "sv",
  "de",
  "es",
  "fr",
  "fi",
  "nb",
  "da",
  "is",
  "pt",
  "ms",
  "ar",
  "ja",
  "it",
  "pl",
] as const;

export type AppLanguage = (typeof appLanguages)[number];

export type AppLanguageInfo = {
  /** Name of the language in that language. */
  label: string;
  /** Name of the language in English. */
  englishLabel: string;
  /** BCP-47 locale used for dates, times and numbers. */
  locale: string;
  /** Right-to-left script. */
  rtl: boolean;
};

export const appLanguageInfo: Record<AppLanguage, AppLanguageInfo> = {
  en: { label: "English", englishLabel: "English", locale: "en-GB", rtl: false },
  sv: { label: "Svenska", englishLabel: "Swedish", locale: "sv-SE", rtl: false },
  de: { label: "Deutsch", englishLabel: "German", locale: "de-DE", rtl: false },
  es: { label: "Español", englishLabel: "Spanish", locale: "es-ES", rtl: false },
  fr: { label: "Français", englishLabel: "French", locale: "fr-FR", rtl: false },
  fi: { label: "Suomi", englishLabel: "Finnish", locale: "fi-FI", rtl: false },
  nb: { label: "Norsk bokmål", englishLabel: "Norwegian", locale: "nb-NO", rtl: false },
  da: { label: "Dansk", englishLabel: "Danish", locale: "da-DK", rtl: false },
  is: { label: "Íslenska", englishLabel: "Icelandic", locale: "is-IS", rtl: false },
  pt: { label: "Português", englishLabel: "Portuguese", locale: "pt-PT", rtl: false },
  ms: { label: "Bahasa Melayu", englishLabel: "Malay", locale: "ms-MY", rtl: false },
  ar: { label: "العربية", englishLabel: "Arabic", locale: "ar-SA", rtl: true },
  ja: { label: "日本語", englishLabel: "Japanese", locale: "ja-JP", rtl: false },
  it: { label: "Italiano", englishLabel: "Italian", locale: "it-IT", rtl: false },
  pl: { label: "Polski", englishLabel: "Polish", locale: "pl-PL", rtl: false },
};

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return typeof value === "string" && (appLanguages as readonly string[]).includes(value);
}

export function localeFor(language: AppLanguage) {
  return appLanguageInfo[language].locale;
}

export function isRtlLanguage(language: AppLanguage) {
  return appLanguageInfo[language].rtl;
}

/**
 * Best-effort device language for the first launch. Hermes ships Intl, so this
 * needs no native module and survives app updates.
 */
export function detectDeviceLanguage(): AppLanguage {
  const candidates: string[] = [];
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().locale;
    if (resolved) candidates.push(resolved);
  } catch {
    // Intl is unavailable on a few old engines.
  }
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    candidates.push(navigator.language);
  }

  for (const candidate of candidates) {
    const tag = candidate.replace("_", "-").toLowerCase();
    const base = tag.split("-")[0];
    if (isAppLanguage(base)) return base;
    // Norwegian "no" and legacy tags map to Bokmål.
    if (base === "no" || base === "nn") return "nb";
  }
  return "en";
}
