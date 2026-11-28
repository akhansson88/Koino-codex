import type { englishTranslations } from "@/ui/translations/en";

export type { AppLanguage, AppLanguageInfo } from "@/ui/translations/languages";
export { appLanguageInfo, appLanguages, detectDeviceLanguage, isAppLanguage, isRtlLanguage, localeFor } from "@/ui/translations/languages";

export type TranslationKey = keyof typeof englishTranslations;

export type TranslationValues = Readonly<Record<string, string | number>>;

export type TranslationFunction = (key: TranslationKey, values?: TranslationValues) => string;

export type TranslationDictionary = { [Key in TranslationKey]: string };
