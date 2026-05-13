import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, Text, View } from "react-native";

import type { PrayerSessionTargetType } from "@/state/types";
import { colors } from "@/ui/theme";

const BREATH_PHASE_MS = 3800;
const PRAYER_COMPLETE_DELAY_MS = 15_000;

export type PrayerMomentTarget = { targetType: PrayerSessionTargetType; targetId: string; body: string };

export function PrayerMoment({
  target,
  onClose,
  onFinish,
}: {
  target?: PrayerMomentTarget;
  onClose: () => void;
  onFinish: (status: "completed" | "skipped", startedAt: string) => void;
}) {
  const breathAnimation = useRef(new Animated.Value(0)).current;
  const completeProgressAnimation = useRef(new Animated.Value(0)).current;
  const [startedAt, setStartedAt] = useState(new Date().toISOString());
  const [canCompletePrayer, setCanCompletePrayer] = useState(false);

  const breathScale = breathAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1.08],
  });
  const haloScale = breathAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.28],
  });
  const haloOpacity = breathAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.34, 0.16, 0.3],
  });
  const coreOpacity = breathAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.66, 0.95],
  });
  const completeProgressWidth = completeProgressAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  useEffect(() => {
    if (!target) {
      setCanCompletePrayer(false);
      completeProgressAnimation.setValue(0);
      return;
    }

    setStartedAt(new Date().toISOString());
    setCanCompletePrayer(false);
    breathAnimation.setValue(0);
    completeProgressAnimation.setValue(0);

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnimation, {
          toValue: 1,
          duration: BREATH_PHASE_MS,
          easing: Easing.bezier(0.37, 0, 0.63, 1),
          useNativeDriver: true,
        }),
        Animated.timing(breathAnimation, {
          toValue: 0,
          duration: BREATH_PHASE_MS,
          easing: Easing.bezier(0.37, 0, 0.63, 1),
          useNativeDriver: true,
        }),
      ]),
    );
    const completeProgress = Animated.timing(completeProgressAnimation, {
      toValue: 1,
      duration: PRAYER_COMPLETE_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    breathLoop.start();
    completeProgress.start(({ finished }) => {
      if (finished) {
        setCanCompletePrayer(true);
      }
    });

    return () => {
      breathLoop.stop();
      completeProgress.stop();
    };
  }, [breathAnimation, completeProgressAnimation, target]);

  return (
    <Modal visible={Boolean(target)} animationType="fade" presentationStyle="fullScreen">
      <View style={{ flex: 1, justifyContent: "center", gap: 26, backgroundColor: colors.cream, padding: 26 }}>
        <View style={{ alignItems: "center", gap: 16 }}>
          <View
            accessible
            accessibilityLabel="Prayer breathing guide. Pray now."
            accessibilityRole="image"
            style={{ alignItems: "center", height: 280, justifyContent: "center", width: "100%" }}
          >
            <Animated.View
              style={{
                backgroundColor: "rgba(168,216,216,0.16)",
                borderColor: "rgba(168,216,216,0.24)",
                borderRadius: 999,
                borderWidth: 1,
                height: 238,
                opacity: haloOpacity,
                position: "absolute",
                transform: [{ scale: haloScale }],
                width: 238,
              }}
            />
            <Animated.View
              style={{
                alignItems: "center",
                backgroundColor: "rgba(232,166,128,0.16)",
                borderColor: "rgba(245,243,240,0.2)",
                borderRadius: 999,
                borderWidth: 1,
                height: 210,
                justifyContent: "center",
                opacity: coreOpacity,
                transform: [{ scale: breathScale }],
                width: 210,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                alignItems: "center",
                gap: 8,
                justifyContent: "center",
                position: "absolute",
              }}
            >
              <Text
                selectable
                style={{
                  color: colors.gold,
                  fontSize: 28,
                  fontWeight: "900",
                  textAlign: "center",
                }}
              >
                Pray Now
              </Text>
            </View>
          </View>
        </View>
        <View
          style={{
            backgroundColor: "rgba(245,243,240,0.05)",
            borderColor: colors.line,
            borderCurve: "continuous",
            borderRadius: 24,
            borderWidth: 1,
            gap: 12,
            padding: 18,
          }}
        >
          <Text selectable style={{ color: colors.ink, fontSize: 34, fontWeight: "900", textAlign: "center" }}>
            Prayer moment
          </Text>
          <Text selectable style={{ color: colors.muted, fontSize: 18, lineHeight: 27, textAlign: "center" }}>
            Take a quiet breath. Hold this person before God, without hurry.
          </Text>
        </View>
        <View style={{ gap: 12 }}>
          <Pressable
            accessibilityState={{ disabled: !canCompletePrayer }}
            disabled={!canCompletePrayer}
            onPress={() => onFinish("completed", startedAt)}
            style={{
              alignItems: "center",
              backgroundColor: canCompletePrayer ? colors.olive : colors.disabled,
              borderRadius: 999,
              overflow: "hidden",
              padding: 16,
              position: "relative",
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={{
                backgroundColor: colors.olive,
                bottom: 0,
                left: 0,
                opacity: canCompletePrayer ? 1 : 0.72,
                position: "absolute",
                top: 0,
                width: completeProgressWidth,
              }}
            />
            <Text style={{ color: canCompletePrayer ? colors.onAccent : colors.ink, fontSize: 16, fontWeight: "900", zIndex: 1 }}>
              Complete prayer
            </Text>
          </Pressable>
          <Pressable onPress={() => onFinish("skipped", startedAt)} style={{ alignItems: "center", padding: 16 }}>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "800" }}>Skip for now</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: "center", padding: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
