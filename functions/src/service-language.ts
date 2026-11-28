export const serviceLanguages = [
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

export type ServiceLanguage = (typeof serviceLanguages)[number];

export function isServiceLanguage(value: unknown): value is ServiceLanguage {
  return typeof value === "string" && (serviceLanguages as readonly string[]).includes(value);
}

/** Falls back to English for members who have not chosen a language yet. */
export function serviceLanguage(value: unknown): ServiceLanguage {
  return isServiceLanguage(value) ? value : "en";
}

export function serviceLocale(language: ServiceLanguage) {
  const locales: Record<ServiceLanguage, string> = {
    en: "en-GB",
    sv: "sv-SE",
    de: "de-DE",
    es: "es-ES",
    fr: "fr-FR",
    fi: "fi-FI",
    nb: "nb-NO",
    da: "da-DK",
    is: "is-IS",
    pt: "pt-PT",
    ms: "ms-MY",
    ar: "ar-SA",
    ja: "ja-JP",
    it: "it-IT",
    pl: "pl-PL",
  };
  return locales[language];
}
