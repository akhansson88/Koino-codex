import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { usePreferredBibleVersion } from "@/features/bible-preferences";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse } from "@/state/types";
import { AppScreen, FullScreenModal, SectionHeading, SecondaryButton, VersePreviewCard } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors } from "@/ui/theme";

const LazyBibleVersePicker = lazy(() =>
  import("@/ui/bible-verse-picker").then((module) => ({ default: module.BibleVersePicker })),
);

export function BibleVerseField({
  attachedFromBible = false,
  label,
  onChange,
  onOpenInBible,
  verses,
}: {
  attachedFromBible?: boolean;
  label?: string;
  onChange: (verses: BibleVerse[]) => void;
  onOpenInBible?: (verse: BibleVerse) => void;
  verses: BibleVerse[];
}) {
  const { state } = useKoino();
  const { t } = useAppTranslation();
  const preferredBibleVersion = usePreferredBibleVersion(state.currentUserId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailOpenRef = useRef(false);
  const detailCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedVerses = verses.slice(0, 5);
  const canAddVerse = selectedVerses.length < 5;

  useEffect(() => () => {
    if (detailCloseTimerRef.current) clearTimeout(detailCloseTimerRef.current);
  }, []);

  function handleDetailVisibilityChange(visible: boolean) {
    if (detailCloseTimerRef.current) clearTimeout(detailCloseTimerRef.current);
    if (visible) {
      detailOpenRef.current = true;
      setDetailOpen(true);
      return;
    }
    detailCloseTimerRef.current = setTimeout(() => {
      detailOpenRef.current = false;
      setDetailOpen(false);
    }, 750);
  }

  function removeVerse(reference: string) {
    if (detailOpenRef.current) return;
    onChange(selectedVerses.filter((item) => item.reference !== reference));
  }

  function addVerse(nextVerse: BibleVerse) {
    const withoutDuplicate = selectedVerses.filter((item) => item.reference !== nextVerse.reference);
    onChange([...withoutDuplicate, nextVerse].slice(0, 5));
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <SectionHeading>{label || t("shared.scripturePicker.fieldLabel")}</SectionHeading>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{selectedVerses.length}/5</Text>
      </View>
      {selectedVerses.length > 0 ? (
        <View style={{ gap: 8 }}>
          {selectedVerses.map((verse) => (
            <View key={`${verse.reference}-${verse.text}`} style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <VersePreviewCard
                  compact
                  inlineDetail={attachedFromBible}
                  onDetailVisibilityChange={handleDetailVisibilityChange}
                  onOpenInBible={onOpenInBible}
                  openAccessibilityLabel={attachedFromBible ? t("shared.scripture.viewReference", { reference: verse.reference }) : undefined}
                  openLabel={attachedFromBible ? t("shared.scripture.openInBible") : undefined}
                  verse={verse}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("shared.scripturePicker.removeReference", { reference: verse.reference })}
                accessibilityState={{ disabled: detailOpen }}
                disabled={detailOpen}
                onPress={() => removeVerse(verse.reference)}
                style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
              >
                <Feather name="x" size={18} color={colors.olive} />
              </Pressable>
            </View>
          ))}
          {canAddVerse ? (
            <SecondaryButton icon="plus" onPress={() => setPickerVisible(true)}>
              {t("shared.scripturePicker.addAnother")}
            </SecondaryButton>
          ) : null}
        </View>
      ) : (
        <SecondaryButton icon="plus" onPress={() => setPickerVisible(true)}>
          {t("shared.scripturePicker.addBibleVerse")}
        </SecondaryButton>
      )}
      {!canAddVerse ? (
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{t("shared.scripturePicker.maxReferences")}</Text>
      ) : null}
      {canAddVerse && pickerVisible ? (
        <Suspense
          fallback={
            <FullScreenModal animationType="slide" visible onRequestClose={() => setPickerVisible(false)}>
              <AppScreen>
                <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
                  <ActivityIndicator color={colors.olive} />
                </View>
              </AppScreen>
            </FullScreenModal>
          }
        >
          <LazyBibleVersePicker
            bibleVersionId={preferredBibleVersion}
            visible={pickerVisible}
            onBack={() => setPickerVisible(false)}
            onSelect={(nextVerse) => {
              addVerse(nextVerse);
              setPickerVisible(false);
            }}
          />
        </Suspense>
      ) : null}
    </View>
  );
}
