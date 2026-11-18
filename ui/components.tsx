import { Feather } from "@expo/vector-icons";
import { PropsWithChildren, useState } from "react";
import { Pressable, Text, TextInputProps, View, type StyleProp, type ViewStyle } from "react-native";

import { Button } from "@/ui/shadcn/button";
import { Card as ShadcnCard } from "@/ui/shadcn/card";
import { Input } from "@/ui/shadcn/input";
import { AmbientBackground } from "@/ui/ambient-background";
import { colors, radius, shadcn, typography } from "@/ui/theme";

export function Screen({ children }: PropsWithChildren) {
  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <AmbientBackground />
      {children}
    </View>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ tone?: "paper" | "moss" | "rose"; style?: StyleProp<ViewStyle> }>) {
  return <ShadcnCard style={style}>{children}</ShadcnCard>;
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
  return (
    <Button
      disabled={disabled}
      onPress={onPress}
      variant={variant === "primary" ? "default" : variant === "secondary" ? "outline" : "ghost"}
    >
      {children}
    </Button>
  );
}

export function Field(props: TextInputProps) {
  return <Input {...props} />;
}

export function PasswordField({ showPasswordLabel, hidePasswordLabel, ...props }: TextInputProps & {
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const fieldLabel = props.accessibilityLabel ?? props.placeholder ?? "password";

  return (
    <View style={{ position: "relative" }}>
      <Input
        {...props}
        secureTextEntry={!isVisible}
        style={[props.style, { paddingRight: 52 }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={(isVisible ? hidePasswordLabel : showPasswordLabel) ?? `${isVisible ? "Hide" : "Show"} ${fieldLabel.toLowerCase()}`}
        accessibilityState={{ disabled: props.editable === false }}
        disabled={props.editable === false}
        onPress={() => setIsVisible((visible) => !visible)}
        style={({ pressed }) => ({
          position: "absolute",
          right: 4,
          top: 4,
          bottom: 4,
          width: 44,
          minHeight: 40,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Feather name={isVisible ? "eye-off" : "eye"} size={18} color={colors.muted} />
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
      style={({ pressed }) => ({
        backgroundColor: selected ? shadcn.primary : pressed ? shadcn.secondary : shadcn.card,
        borderColor: selected ? shadcn.primary : shadcn.border,
        borderRadius: radius.md,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 9,
      })}
    >
      <Text style={[typography.button, { color: selected ? shadcn.primaryForeground : colors.ink, fontSize: 14 }]}>{label}</Text>
    </Pressable>
  );
}
