import {
  type AppLanguage,
  type TranslationDictionary,
  type TranslationKey,
  type TranslationValues,
} from "@/ui/translations/types";

import { englishTranslations } from "@/ui/translations/en";

import { swedishTranslations } from "@/ui/translations/sv";

export const translationDictionaries: Record<AppLanguage, TranslationDictionary> = {
  en: englishTranslations,
  sv: swedishTranslations,
};

export function translateMessage(language: AppLanguage, key: TranslationKey, values?: TranslationValues) {
  const message = translationDictionaries[language][key];
  if (!values) return message;

  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name: string) => {
    const replacement = values[name];
    return replacement === undefined ? placeholder : String(replacement);
  });
}

export {
  type AppLanguage,
  type TranslationKey,
  type TranslationValues,
  type TranslationFunction,
} from "@/ui/translations/types";
export { englishTranslations } from "@/ui/translations/en";
export { swedishTranslations } from "@/ui/translations/sv";
