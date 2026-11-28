import {
  type AppLanguage,
  type TranslationDictionary,
  type TranslationKey,
  type TranslationValues,
} from "@/ui/translations/types";
import { englishTranslations } from "@/ui/translations/en";

const dictionaryCache = new Map<AppLanguage, TranslationDictionary>();

/**
 * Dictionaries are loaded on first use, so shipping fifteen languages does not
 * make every launch parse all of them. English is the source and the fallback.
 */
function dictionaryFor(language: AppLanguage): TranslationDictionary {
  const cached = dictionaryCache.get(language);
  if (cached) return cached;

  let dictionary: TranslationDictionary;
  switch (language) {
    case "sv": dictionary = require("@/ui/translations/sv").swedishTranslations; break;
    case "de": dictionary = require("@/ui/translations/de").germanTranslations; break;
    case "es": dictionary = require("@/ui/translations/es").spanishTranslations; break;
    case "fr": dictionary = require("@/ui/translations/fr").frenchTranslations; break;
    case "fi": dictionary = require("@/ui/translations/fi").finnishTranslations; break;
    case "nb": dictionary = require("@/ui/translations/nb").norwegianTranslations; break;
    case "da": dictionary = require("@/ui/translations/da").danishTranslations; break;
    case "is": dictionary = require("@/ui/translations/is").icelandicTranslations; break;
    case "pt": dictionary = require("@/ui/translations/pt").portugueseTranslations; break;
    case "ms": dictionary = require("@/ui/translations/ms").malayTranslations; break;
    case "ar": dictionary = require("@/ui/translations/ar").arabicTranslations; break;
    case "ja": dictionary = require("@/ui/translations/ja").japaneseTranslations; break;
    case "it": dictionary = require("@/ui/translations/it").italianTranslations; break;
    case "pl": dictionary = require("@/ui/translations/pl").polishTranslations; break;
    case "en":
    default:
      dictionary = englishTranslations;
      break;
  }
  dictionaryCache.set(language, dictionary);
  return dictionary;
}

export function translateMessage(language: AppLanguage, key: TranslationKey, values?: TranslationValues) {
  const dictionary = dictionaryFor(language);
  const message = dictionary[key] ?? englishTranslations[key];
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
export {
  appLanguageInfo,
  appLanguages,
  detectDeviceLanguage,
  isAppLanguage,
  isRtlLanguage,
  localeFor,
} from "@/ui/translations/languages";
