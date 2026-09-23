import { AppSheet, SheetScrollView, type AppSheetHandle } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { useCallback, useRef } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bibleVersions, type BibleVersionId } from "@/features/bible-kjv";
import { useAppTranslation } from "@/ui/app-language";
import { radius } from "@/ui/theme";
import { type ReaderPalette } from "@/features/bible-reader/types";
import {
  bibleSheetTopPadding,
  bibleSheetHandleHeight,
  bibleSheetHeaderMinHeight,
  bibleSheetHeaderBottomPadding,
  bibleVersionListTopPadding,
  bibleVersionRowMinHeight,
  bibleVersionRowGap,
  BibleSheetTop,
  bibleSheetHorizontalPadding,
} from "@/features/bible-reader/sheet-primitives";
import { ReaderCircleButton } from "@/features/bible-reader/header";
import { bibleVersionDescription, bibleVersionShortLabel } from "@/features/bible-reader/verse-helpers";

export function BibleVersionSheet({
  bibleVersionId,
  onChangeBibleVersion,
  onClose: notifyClose,
  palette,
  visible,
}: {
  bibleVersionId: BibleVersionId;
  onChangeBibleVersion: (versionId: BibleVersionId) => void;
  onClose: () => void;
  palette: ReaderPalette;
  visible: boolean;
}) {
  const sheetRef = useRef<AppSheetHandle>(null);
  const onClose = useCallback(() => sheetRef.current?.dismiss(), []);
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();
  const bottomPadding = Math.max(26, insets.bottom + 18);
  const contentHeight =
    bibleSheetTopPadding +
    bibleSheetHandleHeight +
    bibleSheetHeaderMinHeight +
    bibleSheetHeaderBottomPadding +
    bibleVersionListTopPadding +
    bibleVersions.length * bibleVersionRowMinHeight +
    Math.max(0, bibleVersions.length - 1) * bibleVersionRowGap +
    bottomPadding;
  const sheetHeight = Math.min(height * 0.92, contentHeight);

  function chooseVersion(versionId: BibleVersionId) {
    onChangeBibleVersion(versionId);
    onClose();
  }

  return (
    <AppSheet ref={sheetRef} visible={visible} onClose={notifyClose} height={sheetHeight} backgroundColor={palette.sheet} foregroundColor={palette.text}>

          <View style={{ flex: 1, paddingBottom: insets.bottom }}>
            <BibleSheetTop palette={palette}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 14, minHeight: bibleSheetHeaderMinHeight }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>{t("bible.version.title")}</Text>
                  <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700" }}>{t("bible.version.description")}</Text>
                </View>
                <ReaderCircleButton accessibilityLabel={t("bible.version.close")} icon="x" onPress={onClose} palette={palette} />
              </View>
            </BibleSheetTop>

            <SheetScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: bibleVersionRowGap, paddingHorizontal: bibleSheetHorizontalPadding, paddingTop: bibleVersionListTopPadding }}
              style={{ flex: 1 }}
            >
              {bibleVersions.map((version) => (
                <BibleVersionRow
                  description={bibleVersionDescription(version.id, t)}
                  key={version.id}
                  label={version.label}
                  onPress={() => chooseVersion(version.id)}
                  palette={palette}
                  selected={version.id === bibleVersionId}
                  shortLabel={bibleVersionShortLabel(version.id)}
                />
              ))}
            </SheetScrollView>
          </View>


    </AppSheet>
  );
}

function BibleVersionRow({
  description,
  label,
  onPress,
  palette,
  selected,
  shortLabel,
}: {
  description: string;
  label: string;
  onPress: () => void;
  palette: ReaderPalette;
  selected: boolean;
  shortLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? palette.peach : palette.surface,
        borderColor: selected ? palette.accent : palette.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: bibleVersionRowMinHeight,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.input,
          borderColor: selected ? palette.accent : palette.line,
          borderRadius: 999,
          borderWidth: selected ? 1.5 : 1,
          height: 40,
          justifyContent: "center",
          minWidth: 56,
          paddingHorizontal: 10,
        }}
      >
        <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "900" }}>{shortLabel}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>{label}</Text>
        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{description}</Text>
      </View>
      {selected ? <Feather name="check" size={18} color={palette.accent} /> : <Feather name="chevron-right" size={18} color={palette.muted} />}
    </Pressable>
  );
}
