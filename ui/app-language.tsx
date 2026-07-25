import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  translateMessage,
  type AppLanguage,
  type TranslationFunction,
} from "@/ui/localization";

const appLanguageStorageKey = "koino.language";

type AppLanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: TranslationFunction;
};

const AppLanguageContext = createContext<AppLanguageContextValue | undefined>(undefined);

function isAppLanguage(value: string | null): value is AppLanguage {
  return value === "en" || value === "sv";
}

export function AppLanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>("en");
  const [ready, setReady] = useState(false);

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
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const t = useCallback<TranslationFunction>(
    (key, values) => translateMessage(language, key, values),
    [language],
  );
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

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
