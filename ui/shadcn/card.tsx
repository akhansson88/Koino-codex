import type { PropsWithChildren } from "react";
import { Text, View, type StyleProp, type TextProps, type ViewStyle } from "react-native";

import { colors, radius, shadows, shadcn, typography } from "@/ui/theme";

type CardVariant = "default" | "flat" | "elevated";

export function Card({
  children,
  style,
  variant = "default",
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; variant?: CardVariant }>) {
  return (
    <View
      style={[
        {
          backgroundColor: shadcn.card,
          borderColor: variant === "flat" ? "transparent" : shadcn.border,
          borderCurve: "continuous",
          borderRadius: radius.xl,
          borderWidth: variant === "flat" ? 0 : 1,
          gap: 14,
          padding: 16,
          ...(variant === "flat" ? {} : variant === "elevated" ? shadows.raised : shadows.card),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[{ gap: 4 }, style]}>{children}</View>;
}

export function CardTitle({ children, style, ...props }: PropsWithChildren<TextProps & { style?: StyleProp<ViewStyle> }>) {
  return (
    <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink }, style]} {...props}>
      {children}
    </Text>
  );
}

export function CardDescription({ children, style, ...props }: PropsWithChildren<TextProps>) {
  return (
    <Text style={[typography.subtitle, { color: colors.muted }, style]} {...props}>
      {children}
    </Text>
  );
}

export function CardContent({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[{ gap: 12 }, style]}>{children}</View>;
}

export function CardFooter({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[{ flexDirection: "row", gap: 10 }, style]}>{children}</View>;
}
