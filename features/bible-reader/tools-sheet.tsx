import { Feather } from "@expo/vector-icons";
import { useCallback, useRef } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { AppSheet, SheetActionRow, type AppSheetHandle } from "@/ui/app-sheet";
import { useAppTranslation } from "@/ui/app-language";
import { type ReaderPalette } from "@/features/bible-reader/types";

export function BibleReaderToolsSheet({
  canGoHistoryBack,
  canGoHistoryForward,
  onClose,
  onHistoryBack,
  onHistoryForward,
  onOpenMyPlaces,
  onOpenSearch,
  onOpenSettings,
  palette,
  visible,
}: {
  canGoHistoryBack: boolean;
  canGoHistoryForward: boolean;
  onClose: () => void;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  onOpenMyPlaces: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  palette: ReaderPalette;
  visible: boolean;
}) {
  const sheetRef = useRef<AppSheetHandle>(null);
  const { height } = useWindowDimensions();
  const { t } = useAppTranslation();
  const openAfterDismiss = useCallback((action: () => void) => sheetRef.current?.dismiss(action), []);

  return <AppSheet
    ref={sheetRef}
    visible={visible}
    onClose={onClose}
    title={t("bible.reader.tools")}
    height={Math.min(390, Math.round(height * 0.72))}
    backgroundColor={palette.sheet}
    foregroundColor={palette.text}
    scroll
  >
    <View style={{ gap: 0 }}>
      <SheetActionRow icon="search" title={t("bible.accessibility.search")} color={palette.text} onPress={() => openAfterDismiss(onOpenSearch)} />
      <SheetActionRow icon="bookmark" title={t("bible.navigator.myPlaces")} color={palette.text} onPress={() => openAfterDismiss(onOpenMyPlaces)} />
      <SheetActionRow icon="sliders" title={t("bible.settings.title")} color={palette.text} onPress={() => openAfterDismiss(onOpenSettings)} />
      <View style={{ borderTopColor: palette.line, borderTopWidth: 1, marginTop: 6, paddingTop: 16 }}>
        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700", marginBottom: 8 }}>
          {t("bible.reader.history")}
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <HistoryButton
            disabled={!canGoHistoryBack}
            icon="chevron-left"
            accessibilityLabel={t("bible.accessibility.historyBack")}
            label={t("bible.reader.historyBack")}
            onPress={() => openAfterDismiss(onHistoryBack)}
            palette={palette}
          />
          <HistoryButton
            disabled={!canGoHistoryForward}
            icon="chevron-right"
            accessibilityLabel={t("bible.accessibility.historyForward")}
            label={t("bible.reader.historyForward")}
            onPress={() => openAfterDismiss(onHistoryForward)}
            palette={palette}
          />
        </View>
      </View>
    </View>
  </AppSheet>;
}

function HistoryButton({ accessibilityLabel, disabled, icon, label, onPress, palette }: {
  accessibilityLabel: string;
  disabled: boolean;
  icon: "chevron-left" | "chevron-right";
  label: string;
  onPress: () => void;
  palette: ReaderPalette;
}) {
  return <Pressable
    accessibilityLabel={accessibilityLabel}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => ({
      alignItems: "center", backgroundColor: palette.surface, borderColor: palette.line,
      borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6,
      minHeight: 46, opacity: disabled ? 0.45 : pressed ? 0.7 : 1, paddingHorizontal: 10,
    })}
  >
    <Feather name={icon} size={18} color={palette.accent} />
    <Text numberOfLines={1} style={{ color: palette.text, flex: 1, fontSize: 12, fontWeight: "700" }}>{label}</Text>
  </Pressable>;
}
