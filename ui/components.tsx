import { PropsWithChildren } from "react";
import { Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";

import { brandPalette, colors, platformShadow, radius } from "@/ui/theme";

export function Screen({ children }: PropsWithChildren) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      {children}
    </View>
  );
}

export function Card({
  children,
  tone = "paper",
  style,
}: PropsWithChildren<{ tone?: "paper" | "moss" | "rose"; style?: StyleProp<ViewStyle> }>) {
  const accentColor = tone === "moss" ? colors.moss : tone === "rose" ? colors.rose : colors.line;
  return (
    <View
      style={[
        {
          backgroundColor: colors.paper,
          borderColor: colors.line,
          borderCurve: "continuous",
          borderRadius: radius.lg,
          borderWidth: 1,
          borderLeftColor: accentColor,
          borderLeftWidth: tone === "paper" ? 1 : 3,
          gap: 14,
          padding: 18,
          ...platformShadow({
            boxShadow: "0 4px 12px rgba(11, 18, 32, 0.06)",
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
    <Text selectable style={{ color: colors.ink, fontSize: 32, fontWeight: "700", letterSpacing: 0, lineHeight: 39 }}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return (
    <Text selectable style={{ color: colors.ink, fontSize: 19, fontWeight: "700", lineHeight: 25 }}>
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return (
    <Text selectable style={{ color: muted ? colors.muted : colors.ink, fontSize: 16, lineHeight: 23 }}>
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
  const backgroundColor = variant === "primary" ? colors.gold : variant === "secondary" ? colors.elevated : colors.paper;
  const color = variant === "primary" ? brandPalette.deepNavy : variant === "secondary" ? colors.ink : colors.olive;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? colors.disabled : backgroundColor,
        borderColor: variant === "primary" ? colors.gold : colors.line,
        borderRadius: 999,
        borderWidth: 1,
        minHeight: 48,
        paddingHorizontal: 18,
        paddingVertical: 12,
        ...platformShadow({
          boxShadow: variant === "primary" && !disabled ? "0 3px 8px rgba(11, 18, 32, 0.08)" : "none",
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
      placeholderTextColor={colors.muted}
      {...props}
      style={[
        {
          backgroundColor: colors.input,
          borderColor: colors.line,
          borderCurve: "continuous",
          borderRadius: radius.md,
          borderWidth: 1,
          color: colors.ink,
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
        backgroundColor: selected ? colors.accentSubtle : colors.paper,
        borderColor: selected ? colors.gold : colors.line,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: selected ? colors.olive : colors.ink, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
