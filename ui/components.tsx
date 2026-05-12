import { PropsWithChildren } from "react";
import { Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";

import { colors, radius } from "@/ui/theme";

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
  const backgroundColor = tone === "paper" ? colors.paper : tone === "moss" ? colors.mossSurface : colors.roseSurface;
  return (
    <View
      style={[
        {
          backgroundColor,
          borderColor: colors.line,
          borderCurve: "continuous",
          borderRadius: radius.lg,
          borderWidth: 1,
          gap: 12,
          padding: 18,
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
    <Text selectable style={{ color: colors.ink, fontSize: 34, fontWeight: "800", letterSpacing: 0 }}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return (
    <Text selectable style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
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
  const backgroundColor = variant === "primary" ? colors.olive : variant === "secondary" ? colors.elevated : "transparent";
  const color = variant === "primary" ? colors.onAccent : variant === "secondary" ? colors.ink : colors.olive;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: disabled ? colors.disabled : backgroundColor,
        borderColor: variant === "primary" ? "transparent" : colors.line,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 18,
        paddingVertical: 13,
      }}
    >
      <Text style={{ color: disabled ? colors.disabledText : color, fontSize: 15, fontWeight: "800" }}>{children}</Text>
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
      onPress={onPress}
      style={{
        backgroundColor: selected ? colors.olive : colors.paper,
        borderColor: selected ? colors.olive : colors.line,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: selected ? colors.onAccent : colors.ink, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
