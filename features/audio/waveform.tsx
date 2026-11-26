import { memo, useEffect, useRef } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";

import { AUDIO_PEAK_COUNT, heightsFromPeaks } from "@/state/audio";
import { colors } from "@/ui/theme";
import { useReducedMotion } from "@/ui/use-reduced-motion";

const LiveBar = memo(function LiveBar({
  bars,
  index,
  active,
}: {
  bars: SharedValue<number[]>;
  index: number;
  active: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const value = Math.max(0, Math.min(1, bars.value[index] ?? 0));
    // Keep this arithmetic inside the worklet: imported helpers are not
    // automatically workletized and crash the UI thread if called here.
    const taper = 0.55 + 0.45 * Math.sin((Math.PI * index) / (AUDIO_PEAK_COUNT - 1));
    return {
      height: active ? 4 + value * 52 * taper : 4,
      opacity: 0.45 + Math.min(1, value * 1.8) * 0.55,
    };
  });

  return <Animated.View style={[{ backgroundColor: colors.accentPrayer, borderRadius: 2, width: 3 }, style]} />;
});

/**
 * 48 mirrored bars driven by the recorder's real metering value. The rolling
 * history is exactly the level sequence, never a decorative animation.
 */
export function LiveWaveform({
  active,
  level,
  height = 64,
}: {
  active: boolean;
  level: number;
  height?: number;
}) {
  const reducedMotion = useReducedMotion();
  const history = useRef<number[]>(Array.from({ length: AUDIO_PEAK_COUNT }, () => 0));
  const bars = useSharedValue<number[]>(Array.from({ length: AUDIO_PEAK_COUNT }, () => 0));

  useEffect(() => {
    if (!active) return;
    history.current = [...history.current.slice(1), Math.max(0, Math.min(1, level))];
    bars.value = history.current;
  }, [active, level, bars]);

  useEffect(() => {
    if (active) return;
    history.current = Array.from({ length: AUDIO_PEAK_COUNT }, () => 0);
    bars.value = history.current;
  }, [active, bars]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ alignItems: "center", flexDirection: "row", gap: 2, height, justifyContent: "center" }}
    >
      {Array.from({ length: AUDIO_PEAK_COUNT }, (_, index) => (
        <LiveBar active={active && !reducedMotion} bars={bars} index={index} key={index} />
      ))}
    </View>
  );
}

function progressFromTouch(x: number, width: number) {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(1, x / width));
}

/**
 * Stored peak envelope with a played/unplayed fill. Tapping seeks; assistive
 * technologies get an adjustable control with ten-second steps.
 */
export function PlaybackWaveform({
  accessibilityLabel,
  color = colors.accentPrayer,
  height = 44,
  interactive = false,
  peaks,
  progress,
  onSeek,
  onSeekBy,
}: {
  accessibilityLabel: string;
  color?: string;
  height?: number;
  interactive?: boolean;
  peaks: string | undefined;
  progress: number;
  onSeek?: (fraction: number) => void;
  onSeekBy?: (seconds: number) => void;
}) {
  const widths = useRef(0);
  const values = heightsFromPeaks(peaks);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));

  function layout(event: LayoutChangeEvent) {
    widths.current = event.nativeEvent.layout.width;
  }

  function seek(event: { nativeEvent: { locationX: number } }) {
    if (!interactive || !onSeek) return;
    onSeek(progressFromTouch(event.nativeEvent.locationX, widths.current));
  }

  if (!values) {
    return (
      <View
        accessible={interactive}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={interactive ? "adjustable" : "progressbar"}
        accessibilityValue={interactive ? { min: 0, max: 100, now: Math.round(clamped * 100) } : undefined}
        onAccessibilityAction={interactive && onSeekBy ? (event) => {
          if (event.nativeEvent.actionName === "increment") onSeekBy(10);
          if (event.nativeEvent.actionName === "decrement") onSeekBy(-10);
        } : undefined}
        accessibilityActions={interactive && onSeekBy ? [{ name: "increment" }, { name: "decrement" }] : undefined}
        onLayout={layout}
        onTouchEnd={seek}
        style={{ backgroundColor: colors.line, borderRadius: 3, height: 4, justifyContent: "center", overflow: "hidden", width: "100%" }}
      >
        <View style={{ backgroundColor: color, height: 4, width: `${clamped * 100}%` }} />
      </View>
    );
  }

  return (
    <Pressable
      accessible={interactive}
      accessibilityActions={interactive && onSeekBy ? [{ name: "increment" }, { name: "decrement" }] : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={interactive ? "adjustable" : "progressbar"}
      accessibilityValue={interactive ? { min: 0, max: 100, now: Math.round(clamped * 100) } : undefined}
      disabled={!interactive}
      onAccessibilityAction={interactive && onSeekBy ? (event) => {
        if (event.nativeEvent.actionName === "increment") onSeekBy(10);
        if (event.nativeEvent.actionName === "decrement") onSeekBy(-10);
      } : undefined}
      onLayout={layout}
      onPress={seek}
      style={{ alignItems: "center", flexDirection: "row", gap: 2, height, justifyContent: "center", width: "100%" }}
    >
      {values.map((value, index) => {
        const played = (index + 0.5) / values.length <= clamped;
        return (
          <View
            key={index}
            style={{
              backgroundColor: played ? color : colors.line,
              borderRadius: 2,
              height: 4 + value * (height - 8),
              width: 3,
            }}
          />
        );
      })}
    </Pressable>
  );
}
