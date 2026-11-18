import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { type BiblePosition } from "@/features/bible-kjv";
import { useAppTranslation } from "@/ui/app-language";
import { radius } from "@/ui/theme";
import { type ReaderPalette } from "@/features/bible-reader/types";

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
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? palette.peach : palette.surface,
        borderColor: palette.line,
        borderRadius: radius.md,
        borderWidth: 1,
        height: 44,
        justifyContent: "center",
        opacity: disabled ? 0.46 : pressed ? 0.8 : 1,
        width: 44,
      })}
    >
      <Feather name={icon} size={19} color={disabled ? palette.muted : palette.accent} />
    </Pressable>
  );
}
