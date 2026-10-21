import { AppSheet, SheetScrollView, type AppSheetHandle } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { useCallback, useRef, type ReactNode } from "react";
import { Pressable, Text, TextStyle, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTranslation } from "@/ui/app-language";
import { type BibleReaderFontId, type BibleReaderThemeId, type ReaderPalette } from "@/features/bible-reader/types";
import {
  BibleSheetTop,
  bibleSheetHeaderMinHeight,
  bibleSheetHorizontalPadding,
} from "@/features/bible-reader/sheet-primitives";
import { ReaderCircleButton } from "@/features/bible-reader/header";
import {
  readerFonts,
  fontFamilyFor,
  readerFontLabel,
  minFontSize,
  fontSizeStep,
  maxFontSize,
  readerThemes,
  readerThemeLabel,
} from "@/features/bible-reader/preferences";

export function ReadingSettingsSheet({
  fontId,
  fontSize,
  flowingParagraphText,
  onChangeFlowingParagraphText,
  onChangeFont,
  onChangeReaderTheme,
  onChangeShowVerseNumbers,
  onClose: notifyClose,
  onFontSizeChange,
  palette,
  readerTheme,
  showVerseNumbers,
  visible,
}: {
  fontId: BibleReaderFontId;
  fontSize: number;
  flowingParagraphText: boolean;
  onChangeFlowingParagraphText: (value: boolean) => void;
  onChangeFont: (fontId: BibleReaderFontId) => void;
  onChangeReaderTheme: (theme: BibleReaderThemeId) => void;
  onChangeShowVerseNumbers: (value: boolean) => void;
  onClose: () => void;
  onFontSizeChange: (delta: number) => void;
  palette: ReaderPalette;
  readerTheme: BibleReaderThemeId;
  showVerseNumbers: boolean;
  visible: boolean;
}) {
  const sheetRef = useRef<AppSheetHandle>(null);
  const onClose = useCallback(() => sheetRef.current?.dismiss(), []);
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();
  const sheetHeight = height * 0.92;

  return (
    <AppSheet ref={sheetRef} visible={visible} onClose={notifyClose} height={sheetHeight} backgroundColor={palette.sheet} foregroundColor={palette.text}>

          <View style={{ flex: 1, paddingBottom: insets.bottom }}>
            <BibleSheetTop palette={palette}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 14, minHeight: bibleSheetHeaderMinHeight }}>
                <Text style={{ color: palette.text, flex: 1, fontSize: 20, fontWeight: "900" }}>{t("bible.settings.title")}</Text>
                <ReaderCircleButton accessibilityLabel={t("bible.settings.close")} icon="x" onPress={onClose} palette={palette} />
              </View>
            </BibleSheetTop>

            <SheetScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 24, paddingHorizontal: bibleSheetHorizontalPadding, paddingTop: 24 }}
              style={{ flex: 1 }}
            >

            <SettingsGroup palette={palette} title={t("bible.settings.fontFamily")}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {readerFonts.map((font) => (
                  <SettingChip
                    fontFamily={fontFamilyFor(font.id)}
                    key={font.id}
                    label={readerFontLabel(font.id, t)}
                    onPress={() => onChangeFont(font.id)}
                    palette={palette}
                    selected={font.id === fontId}
                  />
                ))}
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title={t("bible.settings.textSize")}>
              <View
                style={{
                  alignItems: "center",
                  alignSelf: "flex-start",
                  backgroundColor: palette.input,
                  borderColor: palette.line,
                  borderRadius: 999,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: 12,
                  padding: 5,
                }}
              >
                <SettingsStepperButton disabled={fontSize <= minFontSize} icon="minus" label={t("bible.settings.decreaseTextSize")} onPress={() => onFontSizeChange(-fontSizeStep)} palette={palette} />
                <Text style={{ color: palette.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "900", minWidth: 30, textAlign: "center" }}>
                  {fontSize}
                </Text>
                <SettingsStepperButton disabled={fontSize >= maxFontSize} icon="plus" label={t("bible.settings.increaseTextSize")} onPress={() => onFontSizeChange(fontSizeStep)} palette={palette} />
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title={t("bible.settings.theme")}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {readerThemes.map((theme) => (
                  <SettingChip
                    icon={theme.id === "dark" ? "moon" : theme.id === "sepia" ? "circle" : "sun"}
                    key={theme.id}
                    label={readerThemeLabel(theme.id, t)}
                    onPress={() => onChangeReaderTheme(theme.id)}
                    palette={palette}
                    selected={theme.id === readerTheme}
                  />
                ))}
              </View>
            </SettingsGroup>

            <SettingsGroup palette={palette} title={t("bible.settings.options")}>
              <View style={{ gap: 2 }}>
                <SettingsToggle label={t("bible.settings.flowingParagraphText")} onChange={onChangeFlowingParagraphText} palette={palette} value={flowingParagraphText} />
                <SettingsToggle label={t("bible.settings.showVerseNumbers")} onChange={onChangeShowVerseNumbers} palette={palette} value={showVerseNumbers} />
              </View>
            </SettingsGroup>
            </SheetScrollView>
          </View>


    </AppSheet>
  );
}

function SettingsGroup({ children, palette, title }: { children: ReactNode; palette: ReaderPalette; title: string }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>{title}</Text>
      {children}
    </View>
  );
}

function SettingChip({
  fontFamily,
  icon,
  label,
  onPress,
  palette,
  selected,
}: {
  fontFamily?: TextStyle["fontFamily"];
  icon?: "circle" | "moon" | "sun";
  label: string;
  onPress: () => void;
  palette: ReaderPalette;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? palette.peach : palette.sheet,
        borderColor: selected ? palette.accent : palette.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 8,
        minHeight: 44,
        paddingHorizontal: 18,
      }}
    >
      {icon ? <Feather name={icon} size={15} color={selected ? palette.accent : palette.muted} /> : null}
      <Text style={{ color: selected ? palette.accent : palette.muted, fontFamily, fontSize: 14, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function SettingsToggle({
  label,
  onChange,
  palette,
  value,
}: {
  label: string;
  onChange: (value: boolean) => void;
  palette: ReaderPalette;
  value: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ alignItems: "center", borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: "row", minHeight: 58 }}
    >
      <Text style={{ color: palette.text, flex: 1, fontSize: 15, fontWeight: "700" }}>{label}</Text>
      <View
        style={{
          alignItems: value ? "flex-end" : "flex-start",
          backgroundColor: value ? palette.accent : palette.line,
          borderRadius: 999,
          height: 30,
          justifyContent: "center",
          paddingHorizontal: 3,
          width: 52,
        }}
      >
        <View style={{ backgroundColor: palette.sheet, borderRadius: 999, height: 24, width: 24 }} />
      </View>
    </Pressable>
  );
}

function SettingsStepperButton({
  disabled,
  icon,
  label,
  onPress,
  palette,
}: {
  disabled?: boolean;
  icon: "minus" | "plus";
  label: string;
  onPress: () => void;
  palette: ReaderPalette;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? palette.line : palette.sheet,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 34,
        justifyContent: "center",
        opacity: disabled ? 0.62 : 1,
        width: 34,
      }}
    >
      <Feather name={icon} size={16} color={disabled ? palette.muted : palette.accent} />
    </Pressable>
  );
}
