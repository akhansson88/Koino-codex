import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";

import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, typography } from "@/ui/theme";
import { useReducedMotion } from "@/ui/use-reduced-motion";

const PARTICLE_COUNT = 7;
const PARTICLE_ANGLES = Array.from({ length: PARTICLE_COUNT }, (_, index) => -90 + (index - (PARTICLE_COUNT - 1) / 2) * 24);
const PARTICLE_DISTANCES = [30, 40, 44, 38, 44, 40, 30];

function HeartBurst({ progress, size }: { progress: Animated.Value; size: number }) {
  return (
    <View pointerEvents="none" style={{ height: size, left: 0, overflow: "visible", position: "absolute", top: 0, width: size }}>
      {PARTICLE_ANGLES.map((angle, index) => {
        const radians = (angle * Math.PI) / 180;
        const distance = PARTICLE_DISTANCES[index];
        const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(radians) * distance] });
        const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(radians) * distance] });
        const opacity = progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 0.85, 0] });
        const scale = progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.6, 1.1, 0.8] });
        return (
          <Animated.View
            key={angle}
            style={{
              opacity,
              position: "absolute",
              transform: [{ translateX }, { translateY }, { scale }],
            }}
          >
            <Ionicons name="heart" size={index % 2 === 0 ? 9 : 7} color={colors.rose} />
          </Animated.View>
        );
      })}
    </View>
  );
}

export function LikeButton({
  count,
  liked,
  onPress,
  disabled = false,
  size = "default",
}: {
  count: number;
  liked: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: "default" | "large";
}) {
  const { t } = useAppTranslation();
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const background = useRef(new Animated.Value(liked ? 1 : 0)).current;
  const [burstVisible, setBurstVisible] = useState(false);
  const heartSize = size === "large" ? 22 : 19;
  const height = size === "large" ? 48 : 44;
  const padding = size === "large" ? 18 : 12;

  useEffect(() => {
    Animated.timing(background, {
      toValue: liked ? 1 : 0,
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [background, liked, reduceMotion]);

  function handlePress() {
    if (disabled) return;
    if (!liked) {
      if (!reduceMotion) {
        setBurstVisible(true);
        burst.setValue(0);
        Animated.timing(burst, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setBurstVisible(false);
        });
      }
      if (!reduceMotion) {
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.28, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, friction: 5, tension: 180, useNativeDriver: true }),
        ]).start();
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (!reduceMotion) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 200, useNativeDriver: true }),
      ]).start();
      void Haptics.selectionAsync();
    }
    onPress();
  }

  return (
    <Pressable
      accessibilityLabel={liked
        ? t(count === 1 ? "community.like.accessibilityLikedOne" : "community.like.accessibilityLiked", { count })
        : t(count === 1 ? "community.like.accessibilityOne" : "community.like.accessibility", { count })}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: liked }}
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        handlePress();
      }}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: liked ? colors.rose : colors.line,
        borderCurve: "continuous",
        borderRadius: radius.md,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        minHeight: height,
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: padding,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          backgroundColor: colors.roseSurface,
          borderRadius: radius.md,
          bottom: 0,
          left: 0,
          opacity: background,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={heartSize} color={liked ? colors.rose : colors.muted} />
        </Animated.View>
        {burstVisible ? <HeartBurst progress={burst} size={heartSize} /> : null}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[typography.label, { color: liked ? colors.rose : colors.ink, fontVariant: ["tabular-nums"] }]}
      >
        {count}
      </Text>
    </Pressable>
  );
}
