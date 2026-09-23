import { createContext, useContext } from "react";
import { bibleBookLanguage } from "@/features/bible-book-names";
import { usePreferredBibleVersion } from "@/features/bible-preferences";
import { useKoinoSelector } from "@/state/koino-store";
import { useAppTranslation } from "@/ui/app-language";

export const BibleBookVersionContext = createContext<string | undefined>(undefined);

export function useBibleBookLanguage(version?: string) {
  const contextVersion = useContext(BibleBookVersionContext);
  const currentUserId = useKoinoSelector((state) => state.currentUserId);
  const { language } = useAppTranslation();
  const preferredVersion = usePreferredBibleVersion(version || contextVersion ? undefined : currentUserId);
  return bibleBookLanguage(language, version ?? contextVersion ?? preferredVersion);
}
