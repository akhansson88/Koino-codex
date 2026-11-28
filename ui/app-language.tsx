import AsyncStorage from "@/state/encryption/local-storage";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { I18nManager, Platform } from "react-native";

import {
  translateMessage,
  type AppLanguage,
  type TranslationFunction,
} from "@/ui/localization";
import {
  appLanguageInfo,
  detectDeviceLanguage,
  isAppLanguage,
  isRtlLanguage,
  localeFor,
} from "@/ui/translations/languages";

const appLanguageStorageKey = "koino.language";

// Let the native layer lay out right-to-left scripts when the stored language
// asks for it. The flag is applied on the next app start.
I18nManager.allowRTL(true);

type AppLanguageContextValue = {
  language: AppLanguage;
  locale: string;
  rtl: boolean;
  rtlRestartRequired: boolean;
  setLanguage: (language: AppLanguage) => void;
  t: TranslationFunction;
};

const AppLanguageContext = createContext<AppLanguageContextValue | undefined>(undefined);

export function AppLanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>(() => detectDeviceLanguage());
  const [ready, setReady] = useState(false);
  const [rtlRestartRequired, setRtlRestartRequired] = useState(false);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(appLanguageStorageKey)
      .then((storedLanguage) => {
        if (active && isAppLanguage(storedLanguage)) {
          setLanguageState(storedLanguage);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    void AsyncStorage.setItem(appLanguageStorageKey, nextLanguage).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.lang = localeFor(language);
      document.documentElement.dir = isRtlLanguage(language) ? "rtl" : "ltr";
      setRtlRestartRequired(false);
      return;
    }

    const rtl = isRtlLanguage(language);
    const restartRequired = rtl !== I18nManager.isRTL;
    // Keep the persisted native flag in step even when the layout only changes
    // on the next start, so switching back to an LTR language also resets it.
    I18nManager.forceRTL(rtl);
    setRtlRestartRequired(restartRequired);
  }, [language]);

  const t = useCallback<TranslationFunction>(
    (key, values) => translateMessage(language, key, values),
    [language],
  );
  const value = useMemo(
    () => ({
      language,
      locale: appLanguageInfo[language].locale,
      rtl: isRtlLanguage(language),
      rtlRestartRequired,
      setLanguage,
      t,
    }),
    [language, rtlRestartRequired, setLanguage, t],
  );

  if (!ready) return null;

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}

export function useAppTranslation() {
  const context = useContext(AppLanguageContext);

  if (!context) {
    throw new Error("useAppTranslation must be used within an AppLanguageProvider.");
  }

  return context;
}
