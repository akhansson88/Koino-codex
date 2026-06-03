import { PropsWithChildren } from "react";
import { Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";

import { colors, platformShadow, radius } from "@/ui/theme";

export function Screen({ children }: PropsWithChildren) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background.app }}>
      {children}
    </View>
  );
}

export function Card({
  children,
  tone = "paper",
  style,
}: PropsWithChildren<{ tone?: "paper" | "moss" | "rose"; style?: StyleProp<ViewStyle> }>) {
  const accentColor = tone === "moss" ? colors.semantic.community : tone === "rose" ? colors.semantic.reflection : colors.border.subtle;
  return (
    <View
      style={[
        {
          backgroundColor: colors.background.surface,
          borderColor: colors.border.subtle,
          borderCurve: "continuous",
          borderRadius: radius.lg,
          borderWidth: 1,
          borderLeftColor: accentColor,
          borderLeftWidth: tone === "paper" ? 1 : 3,
          gap: 14,
          padding: 18,
          ...platformShadow({
            boxShadow: `0 4px 12px ${colors.shadow.soft}`,
            color: colors.text.primary,
            elevation: 1,
            offset: { width: 0, height: 4 },
            opacity: 0.06,
            radius: 12,
          }),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Title({ children }: PropsWithChildren) {
  return (
    <Text selectable style={{ color: colors.text.primary, fontSize: 32, fontWeight: "700", letterSpacing: 0, lineHeight: 39 }}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return (
    <Text selectable style={{ color: colors.text.primary, fontSize: 19, fontWeight: "700", lineHeight: 25 }}>
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return (
    <Text selectable style={{ color: muted ? colors.text.secondary : colors.text.primary, fontSize: 16, lineHeight: 23 }}>
      {children}
    </Text>
  );
}

export function PillButton({
  children,
  onPress,
  variant = "primary",
  disabled = false,
}: PropsWithChildren<{ onPress: () => void; variant?: "primary" | "secondary" | "ghost"; disabled?: boolean }>) {
  const backgroundColor = variant === "primary" ? colors.semantic.prayer : variant === "secondary" ? colors.semantic.warmthSoft : "transparent";
  const color = variant === "primary" ? colors.onAccent : colors.text.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? colors.disabled : backgroundColor,
        borderColor: variant === "primary" ? colors.semantic.prayer : colors.border.subtle,
        borderRadius: 999,
        borderWidth: 1,
        minHeight: 48,
        paddingHorizontal: 18,
        paddingVertical: 12,
        ...platformShadow({
          boxShadow: variant === "primary" && !disabled ? `0 3px 8px ${colors.shadow.soft}` : "none",
          color: colors.text.primary,
          elevation: variant === "primary" && !disabled ? 1 : 0,
          offset: { width: 0, height: 3 },
          opacity: variant === "primary" && !disabled ? 0.08 : 0,
          radius: 8,
        }),
      }}
    >
      <Text style={{ color: disabled ? colors.disabledText : color, fontSize: 15, fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.text.secondary}
      {...props}
      style={[
        {
          backgroundColor: colors.background.surface,
          borderColor: colors.border.subtle,
          borderCurve: "continuous",
          borderRadius: radius.md,
          borderWidth: 1,
          color: colors.text.primary,
          fontSize: 16,
          minHeight: props.multiline ? 112 : 52,
          padding: 14,
          textAlignVertical: props.multiline ? "top" : "center",
        },
        props.style,
      ]}
    />
  );
}

export function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? colors.semantic.warmthSoft : colors.background.surface,
        borderColor: selected ? colors.border.soft : colors.border.subtle,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: colors.text.primary, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
