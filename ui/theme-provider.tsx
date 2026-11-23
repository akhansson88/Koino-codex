import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SystemUI from "expo-system-ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Platform, useColorScheme } from "react-native";

import { applyColorScheme, colors, type ColorScheme } from "@/ui/theme";

export type AppearancePreference = "system" | "light" | "dark";

type ThemeContextValue = {
  preference: AppearancePreference;
  scheme: ColorScheme;
  setPreference: (next: AppearancePreference) => void;
};

const STORAGE_KEY = "koino.appearance";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: unknown): value is AppearancePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>("system");
  const scheme: ColorScheme = preference === "system"
    ? systemScheme === "dark" ? "dark" : "light"
    : preference;

  // Apply before children render so the first paint already uses the palette.
  applyColorScheme(scheme);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled || !isPreference(stored)) return;
        setPreferenceState(stored);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    applyColorScheme(scheme);
    if (Platform.OS !== "web") {
      void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
    }
  }, [scheme]);

  const setPreference = useCallback((next: AppearancePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    return {
      preference: "system",
      scheme: "light",
      setPreference: () => undefined,
    };
  }
  return value;
}

export function useThemeScheme(): ColorScheme {
  return useTheme().scheme;
}
