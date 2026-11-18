import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { ambientTheme } from "@/ui/theme";
import { useReducedMotion } from "@/ui/use-reduced-motion";

type OrbSpec = {
  color: string;
  duration: number;
  fromOpacity: number;
  midOpacity: number;
  size: number;
  toOpacity: number;
  x: [number, number];
  y: [number, number];
  scale: [number, number];
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

function Orb({ active, index, orb, reducedMotion }: { active: boolean; index: number; orb: OrbSpec; reducedMotion: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0.35;
      return;
    }
    if (!active) {
      cancelAnimation(progress);
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: orb.duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(progress);
  }, [active, orb.duration, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.55, 1], [orb.fromOpacity, orb.midOpacity, orb.toOpacity]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], orb.x) },
      { translateY: interpolate(progress.value, [0, 1], orb.y) },
      { scale: interpolate(progress.value, [0, 1], orb.scale) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          height: orb.size,
          left: orb.left,
          position: "absolute",
          right: orb.right,
          top: orb.top,
          bottom: orb.bottom,
          width: orb.size,
        },
        animatedStyle,
      ]}
    >
      <Svg height="100%" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="50%" id={`ambient-orb-${index}`} r="50%">
            <Stop offset="0" stopColor={orb.color} stopOpacity={0.95} />
            <Stop offset="0.46" stopColor={orb.color} stopOpacity={0.55} />
            <Stop offset="0.74" stopColor={orb.color} stopOpacity={0.18} />
            <Stop offset="1" stopColor={orb.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50%" cy="50%" fill={`url(#ambient-orb-${index})`} r="50%" />
      </Svg>
    </Animated.View>
  );
}

function Sheen({ active, height, reducedMotion, width }: { active: boolean; height: number; reducedMotion: boolean; width: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion || !active) {
      cancelAnimation(progress);
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 24000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [active, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-280, width + 280]) },
      { rotate: "18deg" },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          bottom: -height * 0.2,
          position: "absolute",
          top: -height * 0.2,
          width: 190,
        },
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.38)", "rgba(255, 255, 255, 0)"]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

/**
 * A slow, warm ambient wash shared by app surfaces. It stays behind content and
 * intentionally opts out of the Bible reader, which keeps a neutral paper page.
 */
export const AmbientBackground = memo(function AmbientBackground({ active = true }: { active?: boolean }) {
  const { height, width } = useWindowDimensions();
  const base = Math.max(width, 320);
  const reducedMotion = useReducedMotion();

  const orbs: OrbSpec[] = [
    {
      color: ambientTheme.peach,
      duration: 22000,
      fromOpacity: 0.42,
      left: -base * 0.36,
      midOpacity: 0.58,
      scale: [1, 1.14],
      size: Math.min(base * 1.18, 620),
      toOpacity: 0.48,
      top: -base * 0.22,
      x: [0, 34],
      y: [0, 26],
    },
    {
      color: ambientTheme.apricot,
      duration: 28000,
      fromOpacity: 0.32,
      midOpacity: 0.46,
      right: -base * 0.4,
      scale: [1.08, 0.98],
      size: Math.min(base * 1.08, 560),
      toOpacity: 0.38,
      top: height * 0.28,
      x: [0, -30],
      y: [0, 34],
    },
    {
      color: ambientTheme.cream,
      duration: 33000,
      bottom: -base * 0.16,
      fromOpacity: 0.34,
      left: -base * 0.1,
      midOpacity: 0.5,
      scale: [0.96, 1.1],
      size: Math.min(base * 0.92, 480),
      toOpacity: 0.4,
      x: [0, 24],
      y: [0, -22],
    },
  ];

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <LinearGradient
        colors={[ambientTheme.baseTop, ambientTheme.baseMiddle, ambientTheme.baseBottom]}
        end={{ x: 0.9, y: 1 }}
        locations={[0, 0.52, 1]}
        start={{ x: 0.1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {orbs.map((orb, index) => <Orb active={active} index={index} key={index} orb={orb} reducedMotion={reducedMotion} />)}
      {reducedMotion ? null : <Sheen active={active} height={height} reducedMotion={reducedMotion} width={width} />}
    </View>
  );
});
