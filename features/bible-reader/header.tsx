import { Feather } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useAppTranslation } from "@/ui/app-language";
import { type FeatherName, type ReaderPalette } from "@/features/bible-reader/types";

function ChapterTitle({ title, index, cursor, previous, next, color }: {
  title: string; index: number; cursor: SharedValue<number>; previous?: string; next?: string; color: string;
}) {
  // Fade through, so neighboring chapter numbers never combine into a false label.
  const currentStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(cursor.value - index) * 2) }), [index]);
  const previousStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (index - cursor.value) * 2 - 1)) }), [index]);
  const nextStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (cursor.value - index) * 2 - 1)) }), [index]);
  const textStyle = { color, fontSize: 18, fontWeight: "800" as const };
  return <View style={{ flex: 1, minWidth: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Animated.Text numberOfLines={1} ellipsizeMode="middle" style={[textStyle, currentStyle]}>{title}</Animated.Text>
    <Animated.Text numberOfLines={1} ellipsizeMode="middle" style={[textStyle, { position: "absolute", left: 0, right: 0, top: 0 }, previousStyle]}>{previous}</Animated.Text>
    <Animated.Text numberOfLines={1} ellipsizeMode="middle" style={[textStyle, { position: "absolute", left: 0, right: 0, top: 0 }, nextStyle]}>{next}</Animated.Text>
  </View>;
}

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

export const BibleReaderHeader = memo(function BibleReaderHeader({
  canGoBack,
  onBack,
  onOpenPicker,
  onOpenAudio,
  audioAvailable,
  onOpenMore,
  onOpenVersionPicker,
  palette,
  title,
  compactTitle,
  chapterIndex,
  chapterCursor,
  previousChapterTitle,
  nextChapterTitle,
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
  onOpenAudio: () => void;
  audioAvailable: boolean;
  onOpenMyPlaces: () => void;
  onOpenMore: () => void;
  onOpenVersionPicker: () => void;
  palette: ReaderPalette;
  title: string;
  compactTitle?: string;
  chapterIndex?: number;
  chapterCursor?: SharedValue<number>;
  previousChapterTitle?: string;
  nextChapterTitle?: string;
  translationLabel: string;
  topInset: number;
}) {
  const { t } = useAppTranslation();
  return (
    <View
      style={{
        backgroundColor: palette.background,
        borderBottomColor: palette.line,
        borderBottomWidth: 1,
        paddingBottom: 8,
        paddingHorizontal: 14,
        paddingTop: topInset + 2,
        position: "relative",
        zIndex: 20,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 6, minHeight: 52 }}>
        {canGoBack ? <ReaderCircleButton accessibilityLabel={t("bible.accessibility.back")} icon="arrow-left" onPress={onBack} palette={palette} /> : null}

        <Pressable
          accessibilityLabel={`${t("bible.accessibility.chooseChapter")}, ${title}`}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onOpenPicker}
          style={({ pressed }) => ({ alignItems: "center", flexDirection: "row", flex: 1, gap: 4, minWidth: 0, minHeight: 48, opacity: pressed ? 0.65 : 1 })}
        >
          {chapterCursor && chapterIndex !== undefined ? <ChapterTitle title={compactTitle ?? title} index={chapterIndex} cursor={chapterCursor}
            previous={previousChapterTitle} next={nextChapterTitle} color={palette.text} /> : <Text numberOfLines={1} ellipsizeMode="middle" style={{ color: palette.text, fontSize: 18, fontWeight: "800", flexShrink: 1 }}>
            {compactTitle ?? title}
          </Text>}
          <Feather name="chevron-down" size={17} color={palette.muted} />
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
            height: 42,
            maxWidth: 80,
            paddingHorizontal: 9,
          }}
        >
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "800" }}>
            {translationLabel}
          </Text>
          <Feather name="chevron-down" size={13} color={palette.muted} />
        </Pressable>

        {audioAvailable ? <ReaderCircleButton accessibilityLabel={t("audio.open")} icon="headphones" onPress={onOpenAudio} palette={palette} /> : null}
        <ReaderCircleButton accessibilityLabel={t("bible.accessibility.more")} icon="more-horizontal" onPress={onOpenMore} palette={palette} />
      </View>
    </View>
  );
});
