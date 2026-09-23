import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { SheetTextInput } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { type BiblePosition } from "@/features/bible-kjv";
import { useAppTranslation } from "@/ui/app-language";
import { radius } from "@/ui/theme";
import { type ReaderPalette } from "@/features/bible-reader/types";
import { chapterLabel } from "@/features/bible-reader/verse-helpers";

export function BibleBottomReadingControls({
  bottom,
  maxWidth,
  nextChapter,
  onHeightChange,
  onNext,
  onPrevious,
  palette,
  previousChapter,
}: {
  bottom: number;
  maxWidth?: number;
  nextChapter?: BiblePosition;
  onHeightChange: (height: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  palette: ReaderPalette;
  previousChapter?: BiblePosition;
}) {
  const { t } = useAppTranslation();
  return (
    <View pointerEvents="box-none" style={{ alignItems: "center", bottom, left: 0, paddingHorizontal: 22, position: "absolute", right: 0, zIndex: 18 }}>
      <View
        onLayout={(event) => onHeightChange(Math.ceil(event.nativeEvent.layout.height))}
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          maxWidth,
          width: "100%",
        }}
      >
        <ReaderControlButton
          accessibilityLabel={t("bible.accessibility.previousChapter")}
          disabled={!previousChapter}
          icon="chevron-left"
          onPress={onPrevious}
          palette={palette}
        />
        <ReaderControlButton
          accessibilityLabel={t("bible.accessibility.nextChapter")}
          disabled={!nextChapter}
          icon="chevron-right"
          onPress={onNext}
          palette={palette}
        />
      </View>
    </View>
  );
}

function ReaderControlButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
  palette,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: "chevron-left" | "chevron-right";
  onPress: () => void;
  palette: ReaderPalette;
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
        height: 46,
        justifyContent: "center",
        opacity: disabled ? 0.46 : 1,
        width: 46,
      }}
    >
      <Feather name={icon} size={20} color={disabled ? palette.muted : palette.accent} />
    </Pressable>
  );
}

function ChapterReflectionCard({
  onAction,
  onChangeText,
  palette,
  value,
}: {
  onAction: (action: "journal" | "pray" | "save") => void;
  onChangeText: (value: string) => void;
  palette: ReaderPalette;
  value: string;
}) {
  return (
    <View
      style={{
        backgroundColor: palette.peach,
        borderColor: palette.line,
        borderRadius: radius.xl,
        borderWidth: 1,
        gap: 14,
        padding: 16,
      }}
    >
      <Text style={{ color: palette.text, fontSize: 17, fontWeight: "900" }}>Vad stannade hos dig?</Text>
      <SheetTextInput
        multiline
        onChangeText={onChangeText}
        onSubmitEditing={() => onAction("save")}
        placeholder="Skriv din reflektion..."
        placeholderTextColor={palette.muted}
        returnKeyType="done"
        submitBehavior="submit"
        value={value}
        style={{
          backgroundColor: palette.input,
          borderColor: palette.line,
          borderRadius: radius.lg,
          borderWidth: 1,
          color: palette.text,
          fontSize: 15,
          minHeight: 86,
          padding: 14,
          textAlignVertical: "top",
        }}
      />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SmallPillButton icon="edit-3" label="Skriv i journalen" onPress={() => onAction("journal")} palette={palette} />
        <SmallPillButton icon="heart" label="Be" onPress={() => onAction("pray")} palette={palette} />
        <Pressable
          accessibilityLabel="Spara reflektion"
          accessibilityRole="button"
          onPress={() => onAction("save")}
          style={{
            alignItems: "center",
            backgroundColor: palette.sheet,
            borderColor: palette.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 46,
            justifyContent: "center",
            width: 54,
          }}
        >
          <Feather name="bookmark" size={18} color={palette.accent} />
        </Pressable>
      </View>
    </View>
  );
}

function SmallPillButton({
  icon,
  label,
  onPress,
  palette,
}: {
  icon: "edit-3" | "heart";
  label: string;
  onPress: () => void;
  palette: ReaderPalette;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: palette.sheet,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: 8,
        justifyContent: "center",
        minHeight: 46,
        paddingHorizontal: 12,
      }}
    >
      <Feather name={icon} size={16} color={palette.accent} />
      <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function NextChapterCard({
  nextChapter,
  onPress,
  palette,
}: {
  nextChapter?: BiblePosition;
  onPress: () => void;
  palette: ReaderPalette;
}) {
  const bookLanguage = useBibleBookLanguage();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !nextChapter }}
      disabled={!nextChapter}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderRadius: radius.xl,
        borderWidth: 1,
        flexDirection: "row",
        gap: 14,
        minHeight: 86,
        opacity: nextChapter ? 1 : 0.62,
        padding: 16,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>Nästa kapitel</Text>
        <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>{nextChapter ? chapterLabel(nextChapter, bookLanguage) : "Slutet"}</Text>
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.sheet,
          borderColor: palette.line,
          borderRadius: 999,
          borderWidth: 1,
          height: 50,
          justifyContent: "center",
          width: 50,
        }}
      >
        <Feather name="arrow-right" size={22} color={palette.accent} />
      </View>
    </Pressable>
  );
}
