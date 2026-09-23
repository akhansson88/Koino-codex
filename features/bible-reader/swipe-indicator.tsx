import { Animated, Text, View } from "react-native";
import { type BiblePosition } from "@/features/bible-kjv";
import { platformShadow, radius } from "@/ui/theme";
import { type ChapterSwipeDirection, type ReaderPalette } from "@/features/bible-reader/types";

function chapterSwipeBadgeLabel(position?: BiblePosition) {
  return position ? String(position.chapter) : "";
}

export function ChapterSwipeIndicator({
  direction,
  nextChapter,
  palette,
  previousChapter,
  progress,
}: {
  direction: ChapterSwipeDirection;
  nextChapter?: BiblePosition;
  palette: ReaderPalette;
  previousChapter?: BiblePosition;
  progress: Animated.Value;
}) {
  const target = direction === "next" ? nextChapter : direction === "previous" ? previousChapter : undefined;
  if (!target || direction === "idle") return null;

  const isNext = direction === "next";
  const opacity = progress.interpolate({
    inputRange: isNext ? [-84, -24, 0] : [0, 24, 84],
    outputRange: isNext ? [1, 0.72, 0] : [0, 0.72, 1],
    extrapolate: "clamp",
  });
  const nudge = progress.interpolate({
    inputRange: isNext ? [-120, 0] : [0, 120],
    outputRange: isNext ? [0, 12] : [-12, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        opacity,
        position: "absolute",
        top: "47%",
        transform: [{ translateX: nudge }],
        ...(isNext ? { right: 22 } : { left: 22 }),
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.sheet,
          borderColor: palette.line,
          borderRadius: radius.md,
          borderWidth: 1,
          height: 54,
          justifyContent: "center",
          width: 54,
          ...platformShadow({
            boxShadow: "0 10px 24px rgba(11, 18, 32, 0.14)",
            color: palette.shadow,
            offset: { width: 0, height: 8 },
            opacity: 0.13,
            radius: 18,
          }),
        }}
      >
        <Text style={{ color: palette.muted, fontSize: 20, fontVariant: ["tabular-nums"], fontWeight: "900" }}>{chapterSwipeBadgeLabel(target)}</Text>
      </View>
    </Animated.View>
  );
}
