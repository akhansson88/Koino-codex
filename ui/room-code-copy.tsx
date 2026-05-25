import { useEffect, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Animated, Pressable, TextStyle, ViewStyle } from "react-native";

import { colors, radius } from "@/ui/theme";

export function RoomCodeCopy({
  code,
  fontSize = 17,
  iconSize = 16,
  onCopied,
}: {
  code: string;
  fontSize?: number;
  iconSize?: number;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function handleCopy() {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    onCopied?.();
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, {
        duration: 140,
        toValue: 1,
        useNativeDriver: false,
      }),
      Animated.spring(pulse, {
        friction: 5,
        tension: 80,
        toValue: 0,
        useNativeDriver: false,
      }),
    ]).start();

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1300);
  }

  const textColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.ink, colors.olive],
  });
  const backgroundColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(0, 0, 0, 0)", colors.accentSubtle],
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <Pressable
      accessibilityLabel={`Copy room code ${code}`}
      accessibilityRole="button"
      onPress={handleCopy}
      style={({ pressed }) =>
        [
          {
            alignItems: "center",
            alignSelf: "flex-start",
            flexDirection: "row",
            gap: 7,
            opacity: pressed ? 0.72 : 1,
          },
        ] as ViewStyle[]
      }
    >
      <Animated.Text
        selectable
        style={
          [
            {
              borderRadius: radius.sm,
              color: textColor,
              fontSize,
              fontWeight: "900",
              paddingHorizontal: 3,
              paddingVertical: 1,
              transform: [{ scale }],
            },
            { backgroundColor },
          ] as unknown as TextStyle[]
        }
      >
        {code}
      </Animated.Text>
      <Feather name={copied ? "check" : "copy"} size={iconSize} color={copied ? colors.olive : colors.muted} />
    </Pressable>
  );
}
