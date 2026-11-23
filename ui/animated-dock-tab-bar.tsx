import { BottomTabBar, type BottomTabBarButtonProps, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import { usePathname } from "expo-router";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { I18nManager, Platform, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { colors, platformShadow, readerSurface } from "@/ui/theme";
import { useTheme } from "@/ui/theme-provider";

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
const spring = { damping: 17, stiffness: 300, mass: 0.72 } as const;

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
  const { scheme } = useTheme();
  const pathname = usePathname();
  const bibleSurface = pathname.startsWith("/bible");
  const dark = scheme === "dark";
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
      style={[StyleSheet.absoluteFill, styles.background, bibleSurface ? { backgroundColor: dark ? colors.background : readerSurface } : null]}
    >
      <View
        style={[
          styles.dock,
          {
            backgroundColor: dark ? colors.surface : "#FFFFFF",
            borderColor: colors.line,
            bottom: Math.max(insets.bottom, 8),
            ...(dark ? {} : platformShadow({
              boxShadow: "0 2px 4px rgba(29, 22, 17, 0.05), 0 14px 34px rgba(29, 22, 17, 0.10)",
              elevation: 4,
              offset: { width: 0, height: 8 },
              opacity: 0.1,
              radius: 20,
            })),
          },
        ]}
      />
      {markerWidth > 0 ? (
        <Animated.View
          style={[
            styles.marker,
            markerStyle,
            {
              backgroundColor: dark ? "rgba(232, 164, 92, 0.16)" : "#F3E3D5",
              borderColor: dark ? colors.line : "#E7DCCE",
              width: markerWidth,
            },
          ]}
        />
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
    if (selected && mounted.current && Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    selectedProgress.value = !mounted.current || reducedMotion
      ? destination
      : withSpring(destination, spring);
    mounted.current = true;
  }, [reducedMotion, selected, selectedProgress]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -3 * selectedProgress.value },
      { scale: 1 + 0.06 * selectedProgress.value },
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
    backgroundColor: "transparent",
  },
  dock: {
    ...StyleSheet.absoluteFillObject,
    left: 16,
    right: 16,
    borderCurve: "continuous",
    borderRadius: 26,
    borderWidth: 1,
  },
  marker: {
    position: "absolute",
    top: MARKER_TOP,
    left: 0,
    height: MARKER_HEIGHT,
    borderCurve: "continuous",
    borderRadius: 16,
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
