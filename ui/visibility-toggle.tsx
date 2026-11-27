import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from "react-native";

import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { useReducedMotion } from "@/ui/use-reduced-motion";

export type VisibilityValue = "private" | "group";

function Option({
  busy,
  disabled,
  icon,
  label,
  onPress,
  selected,
  width,
}: {
  busy?: boolean;
  disabled?: boolean;
  icon: "lock" | "globe";
  label: string;
  onPress: () => void;
  selected: boolean;
  width?: number;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ alignItems: "center", flex: width ? undefined : 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, opacity: disabled ? 0.5 : 1, width }}
    >
      {busy ? (
        <ActivityIndicator color={colors.ink} size="small" />
      ) : (
        <Feather name={icon} size={15} color={selected ? colors.ink : colors.muted} />
      )}
      <Text style={[typography.label, { color: selected ? colors.ink : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function VisibilityToggle({
  value,
  communityName,
  disabled = false,
  busy = false,
  onChange,
}: {
  value: VisibilityValue;
  communityName?: string;
  disabled?: boolean;
  busy?: boolean;
  onChange: (value: VisibilityValue) => void;
}) {
  const { t } = useAppTranslation();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(value === "group" ? 1 : 0)).current;
  const segmentWidth = Math.max(0, width / 2);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value === "group" ? 1 : 0,
      duration: reduceMotion ? 0 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion, value]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segmentWidth],
  });

  function change(next: VisibilityValue) {
    if (disabled || busy || next === value) return;
    void Haptics.selectionAsync();
    onChange(next);
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={[typography.label, { color: colors.ink }]}>{t("community.visibility.title")}</Text>
      <View
        accessibilityLabel={t("community.visibility.title")}
        accessibilityRole="radiogroup"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{
          backgroundColor: shadcn.secondary,
          borderColor: shadcn.border,
          borderCurve: "continuous",
          borderRadius: radius.md,
          borderWidth: 1,
          flexDirection: "row",
          overflow: "hidden",
          padding: 3,
          position: "relative",
        }}
      >
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              backgroundColor: shadcn.card,
              borderColor: shadcn.border,
              borderCurve: "continuous",
              borderRadius: radius.sm,
              borderWidth: 1,
              bottom: 3,
              left: 3,
              position: "absolute",
              top: 3,
              transform: [{ translateX }],
              width: segmentWidth,
            }}
          />
        ) : null}
        <Option
          disabled={disabled}
          icon="lock"
          label={t("community.visibility.private")}
          onPress={() => change("private")}
          selected={value === "private"}
          width={segmentWidth || undefined}
        />
        <Option
          busy={busy && value === "group"}
          disabled={disabled || !communityName}
          icon="globe"
          label={t("community.visibility.public")}
          onPress={() => change("group")}
          selected={value === "group"}
          width={segmentWidth || undefined}
        />
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 4 }}>
        <Feather name={value === "group" ? "users" : "lock"} size={14} color={colors.muted} />
        <Text style={[typography.caption, { color: colors.muted, flex: 1 }]}>
          {!communityName
            ? t("community.visibility.noCommunity")
            : value === "group"
              ? t("community.visibility.publicHint", { community: communityName })
              : t("community.visibility.privateHint")}
        </Text>
      </View>
    </View>
  );
}
