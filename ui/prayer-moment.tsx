import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, Text, View } from "react-native";

import type { PrayerSessionTargetType } from "@/state/types";
import { brandPalette, colors } from "@/ui/theme";
import { VoicePrayerCircle } from "@/ui/voice-prayer-circle";

const PRAYER_COMPLETE_DELAY_MS = 15_000;

export type PrayerMomentTarget = { targetType: PrayerSessionTargetType; targetId: string; body: string; recipientUserId?: string };

export function PrayerMoment({
  target,
  onClose,
  onFinish,
}: {
  target?: PrayerMomentTarget;
  onClose: () => void;
  onFinish: (status: "completed" | "skipped", startedAt: string, completedAt: string) => void;
}) {
  const completeProgressAnimation = useRef(new Animated.Value(0)).current;
  const [startedAt, setStartedAt] = useState(new Date().toISOString());
  const [canCompletePrayer, setCanCompletePrayer] = useState(false);

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
    completeProgressAnimation.setValue(0);

    const completeProgress = Animated.timing(completeProgressAnimation, {
      toValue: 1,
      duration: PRAYER_COMPLETE_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    completeProgress.start(({ finished }) => {
      if (finished) {
        setCanCompletePrayer(true);
      }
    });

    return () => {
      completeProgress.stop();
    };
  }, [completeProgressAnimation, target]);

  return (
    <Modal visible={Boolean(target)} animationType="fade" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: colors.cream }}>
        <View style={{ flex: 1, justifyContent: "center", gap: 26, padding: 26 }}>
          <VoicePrayerCircle size={240} />
          <View
            style={{
              backgroundColor: colors.paper,
              borderColor: colors.line,
              borderCurve: "continuous",
              borderRadius: 8,
              borderWidth: 1,
              gap: 12,
              padding: 18,
            }}
          >
            <Text selectable style={{ color: colors.ink, fontSize: 32, fontWeight: "700", textAlign: "center" }}>
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
              onPress={() => onFinish("completed", startedAt, new Date().toISOString())}
              style={{
                alignItems: "center",
                backgroundColor: canCompletePrayer ? colors.gold : colors.disabled,
                borderRadius: 999,
                overflow: "hidden",
                padding: 16,
                position: "relative",
              }}
            >
              <Animated.View
                style={{
                  backgroundColor: colors.gold,
                  bottom: 0,
                  left: 0,
                  opacity: canCompletePrayer ? 1 : 0.72,
                  pointerEvents: "none",
                  position: "absolute",
                  top: 0,
                  width: completeProgressWidth,
                }}
              />
              <Text style={{ color: canCompletePrayer ? brandPalette.deepNavy : colors.ink, fontSize: 16, fontWeight: "700", zIndex: 1 }}>
                I have prayed
              </Text>
            </Pressable>
            <Pressable onPress={() => onFinish("skipped", startedAt, new Date().toISOString())} style={{ alignItems: "center", padding: 16 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>Skip for now</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ alignItems: "center", padding: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
