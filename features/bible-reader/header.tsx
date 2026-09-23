import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useAppTranslation } from "@/ui/app-language";
import { type FeatherName, type ReaderPalette } from "@/features/bible-reader/types";

export function ReaderCircleButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
  palette,
  text,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon?: FeatherName;
  onPress: () => void;
  palette: ReaderPalette;
  text?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 42,
        justifyContent: "center",
        opacity: disabled ? 0.48 : 1,
        width: 42,
      }}
    >
      {icon ? <Feather name={icon} size={18} color={palette.accent} /> : null}
      {text ? <Text style={{ color: palette.accent, fontSize: 15, fontWeight: "800" }}>{text}</Text> : null}
    </Pressable>
  );
}

export function BibleReaderHeader({
  canGoBack,
  canGoHistoryBack,
  canGoHistoryForward,
  onBack,
  onHistoryBack,
  onHistoryForward,
  onOpenPicker,
  onOpenSearch,
  onOpenSettings,
  onOpenVersionPicker,
  palette,
  title,
  translationLabel,
  topInset,
}: {
  canGoBack: boolean;
  canGoHistoryBack: boolean;
  canGoHistoryForward: boolean;
  onBack: () => void;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  onOpenPicker: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenVersionPicker: () => void;
  palette: ReaderPalette;
  title: string;
  translationLabel: string;
  topInset: number;
}) {
  const { t } = useAppTranslation();
  return (
    <View
      style={{
        backgroundColor: palette.background,
        paddingBottom: 10,
        paddingHorizontal: 12,
        paddingTop: topInset + 2,
        position: "relative",
        zIndex: 20,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 5, minHeight: 52 }}>
        {canGoBack ? <ReaderCircleButton accessibilityLabel={t("bible.accessibility.back")} icon="arrow-left" onPress={onBack} palette={palette} /> : null}

        <Pressable
          accessibilityLabel={t("bible.accessibility.chooseChapter")}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onOpenPicker}
          style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: 3, minWidth: 0 }}
        >
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>
            {title}
          </Text>
          <Feather name="chevron-down" size={14} color={palette.muted} />
        </Pressable>

        <Pressable
          accessibilityLabel={t("bible.accessibility.chooseTranslation")}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenVersionPicker}
          style={{
            alignItems: "center",
            backgroundColor: palette.surface,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            flexDirection: "row",
            gap: 4,
            height: 38,
            maxWidth: 82,
            paddingHorizontal: 8,
          }}
        >
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 12, fontWeight: "900" }}>
            {translationLabel}
          </Text>
          <Feather name="chevron-down" size={13} color={palette.muted} />
        </Pressable>

        <View style={{ flexDirection: "row", gap: 6 }}>
          <ReaderCircleButton accessibilityLabel={t("bible.accessibility.search")} icon="search" onPress={onOpenSearch} palette={palette} />
          <ReaderCircleButton accessibilityLabel={t("bible.accessibility.readingSettings")} onPress={onOpenSettings} palette={palette} text="Aa" />
        </View>
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", marginTop: 2 }}>
        <Pressable accessibilityLabel={t("bible.accessibility.historyBack")} accessibilityRole="button" accessibilityState={{ disabled: !canGoHistoryBack }} disabled={!canGoHistoryBack} onPress={onHistoryBack} style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}>
          <Feather name="chevron-left" size={20} color={palette.muted} style={{ opacity: canGoHistoryBack ? 1 : 0.42 }} />
        </Pressable>
        <Pressable accessibilityLabel={t("bible.accessibility.historyForward")} accessibilityRole="button" accessibilityState={{ disabled: !canGoHistoryForward }} disabled={!canGoHistoryForward} onPress={onHistoryForward} style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}>
          <Feather name="chevron-right" size={20} color={palette.muted} style={{ opacity: canGoHistoryForward ? 1 : 0.42 }} />
        </Pressable>
      </View>
    </View>
  );
}
