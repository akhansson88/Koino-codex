import { Feather } from "@expo/vector-icons";
import { PropsWithChildren, useState } from "react";
import { Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";

import { brandPalette, colors, platformShadow, radius, typography } from "@/ui/theme";

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
    <Text selectable style={[typography.screenTitle, { color: colors.ink }]}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return (
    <Text selectable style={[typography.title, { color: colors.ink }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return (
    <Text selectable style={[typography.body, { color: muted ? colors.muted : colors.ink }]}>
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
      <Text style={[typography.button, { color: disabled ? colors.disabledText : color }]}>{children}</Text>
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
          minHeight: props.multiline ? 112 : 52,
          padding: 14,
          textAlignVertical: props.multiline ? "top" : "center",
        },
        typography.body,
        props.style,
      ]}
    />
  );
}

export function PasswordField(props: TextInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const fieldLabel = props.accessibilityLabel ?? props.placeholder ?? "password";

  return (
    <View style={{ position: "relative" }}>
      <Field
        {...props}
        secureTextEntry={!isVisible}
        style={[props.style, { paddingRight: 58 }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${isVisible ? "Hide" : "Show"} ${fieldLabel.toLowerCase()}`}
        onPress={() => setIsVisible((visible) => !visible)}
        style={({ pressed }) => ({
          position: "absolute",
          right: 4,
          top: 4,
          bottom: 4,
          width: 44,
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Feather name={isVisible ? "eye-off" : "eye"} size={20} color={colors.olive} />
        </View>
      </Pressable>
    </View>
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
      <Text style={[typography.button, { color: selected ? colors.olive : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}
