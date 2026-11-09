import { BottomTabBar, type BottomTabBarButtonProps, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { I18nManager, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { colors, platformShadow } from "@/ui/theme";

type DockState = {
  activeIndex: number;
  count: number;
  insets: BottomTabBarProps["insets"];
  reducedMotion: boolean;
};

const DockContext = createContext<DockState | null>(null);
const BAR_HORIZONTAL_PADDING = 24;
const ITEM_MARGIN = 2;
const MARKER_TOP = 14;
const MARKER_HEIGHT = 62;
const spring = { damping: 22, stiffness: 260, mass: 0.8, overshootClamping: true } as const;

function useDockState() {
  const state = useContext(DockContext);
  if (!state) throw new Error("Dock components must be rendered inside AnimatedDockTabBar");
  return state;
}

export function AnimatedDockTabBar({ reducedMotion, ...props }: BottomTabBarProps & { reducedMotion: boolean }) {
  return (
    <DockContext.Provider value={{
      activeIndex: props.state.index,
      count: props.state.routes.length,
      insets: props.insets,
      reducedMotion,
    }}>
      <BottomTabBar {...props} />
    </DockContext.Provider>
  );
}

export function AnimatedDockBackground() {
  const { activeIndex, count, insets, reducedMotion } = useDockState();
  const [barWidth, setBarWidth] = useState(0);
  const markerX = useSharedValue(0);
  const previousGeometry = useRef<string | null>(null);
  const horizontalInset = Math.max(insets.left, insets.right) + BAR_HORIZONTAL_PADDING;
  const slotWidth = count > 0 ? Math.max(0, barWidth - horizontalInset * 2) / count : 0;
  const markerWidth = Math.max(0, slotWidth - ITEM_MARGIN * 2);
  const visualIndex = I18nManager.isRTL ? count - activeIndex - 1 : activeIndex;
  const targetX = horizontalInset + visualIndex * slotWidth + ITEM_MARGIN;
  const geometry = `${barWidth}:${horizontalInset}:${count}`;

  useLayoutEffect(() => {
    if (markerWidth <= 0) return;
    if (previousGeometry.current !== geometry || reducedMotion) {
      markerX.value = targetX;
    } else {
      markerX.value = withSpring(targetX, spring);
    }
    previousGeometry.current = geometry;
  }, [geometry, markerWidth, markerX, reducedMotion, targetX]);

  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: markerX.value }],
  }));

  return (
    <View
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setBarWidth((previous) => previous === width ? previous : width);
      }}
      style={[StyleSheet.absoluteFill, styles.background]}
    >
      <View style={[styles.dock, { bottom: Math.max(insets.bottom, 8) }]} />
      {markerWidth > 0 ? (
        <Animated.View style={[styles.marker, { width: markerWidth }, markerStyle]} />
      ) : null}
    </View>
  );
}

export function DockTabButton({ style, children, ...props }: BottomTabBarButtonProps) {
  const { reducedMotion } = useDockState();
  const selected = props["aria-selected"] === true;
  const selectedProgress = useSharedValue(selected ? 1 : 0);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const destination = selected ? 1 : 0;
    selectedProgress.value = !mounted.current || reducedMotion
      ? destination
      : withSpring(destination, spring);
    mounted.current = true;
  }, [reducedMotion, selected, selectedProgress]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -2 * selectedProgress.value },
      { scale: 1 + 0.04 * selectedProgress.value },
    ],
  }));

  return (
    <PlatformPressable
      {...props}
      android_ripple={{ borderless: false, color: colors.line }}
      pressOpacity={0.72}
      style={[style, styles.button]}
    >
      <Animated.View style={[styles.buttonContent, contentStyle]}>{children}</Animated.View>
    </PlatformPressable>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.cream,
  },
  dock: {
    ...StyleSheet.absoluteFillObject,
    left: 12,
    right: 12,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    ...platformShadow({
      boxShadow: "0 4px 14px rgba(11, 18, 32, 0.06)",
      elevation: 2,
      offset: { width: 0, height: 4 },
      opacity: 0.06,
      radius: 14,
    }),
  },
  marker: {
    position: "absolute",
    top: MARKER_TOP,
    left: 0,
    height: MARKER_HEIGHT,
    backgroundColor: `${colors.accentWarm}5C`,
    borderColor: `${colors.accentWarm}80`,
    borderCurve: "continuous",
    borderRadius: 18,
    borderWidth: 1,
  },
  button: {
    borderCurve: "continuous",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 0,
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  buttonContent: {
    alignItems: "center",
    gap: 4,
    justifyContent: "center",
  },
});
