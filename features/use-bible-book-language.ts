import { createContext, useContext } from "react";
import { bibleBookLanguage } from "@/features/bible-book-names";
import { usePreferredBibleVersion } from "@/features/bible-preferences";
import { useKoino } from "@/state/koino-store";
import { useAppTranslation } from "@/ui/app-language";

export const BibleBookVersionContext = createContext<string | undefined>(undefined);

export function useBibleBookLanguage(version?: string) {
  const contextVersion = useContext(BibleBookVersionContext);
  const { state } = useKoino();
  const { language } = useAppTranslation();
  const preferredVersion = usePreferredBibleVersion(version || contextVersion ? undefined : state.currentUserId);
  return bibleBookLanguage(language, version ?? contextVersion ?? preferredVersion);
}
