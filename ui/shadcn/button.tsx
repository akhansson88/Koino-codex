import { Feather } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { colors, getColorScheme, radius, shadows, shadcn, typography } from "@/ui/theme";

type FeatherName = ComponentProps<typeof Feather>["name"];

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  children?: ReactNode;
  icon?: FeatherName;
  iconColor?: string;
  iconRight?: FeatherName;
  loading?: boolean;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: ButtonVariant;
};

const sizes: Record<ButtonSize, { minHeight: number; paddingHorizontal: number; gap: number; icon: number; fontSize: number; lineHeight: number }> = {
  sm: { minHeight: 40, paddingHorizontal: 14, gap: 6, icon: 16, fontSize: 14, lineHeight: 18 },
  md: { minHeight: 48, paddingHorizontal: 18, gap: 8, icon: 18, fontSize: 15, lineHeight: 20 },
  lg: { minHeight: 52, paddingHorizontal: 22, gap: 9, icon: 20, fontSize: 16, lineHeight: 22 },
  icon: { minHeight: 44, paddingHorizontal: 0, gap: 0, icon: 19, fontSize: 15, lineHeight: 20 },
  "icon-sm": { minHeight: 40, paddingHorizontal: 0, gap: 0, icon: 17, fontSize: 14, lineHeight: 18 },
};

function toneFor(variant: ButtonVariant): { background: string; border: string; foreground: string; pressed: string } {
  switch (variant) {
    case "secondary":
      return { background: shadcn.secondary, border: shadcn.secondary, foreground: shadcn.secondaryForeground, pressed: shadcn.secondaryPressed };
    case "outline":
      return { background: shadcn.card, border: shadcn.border, foreground: shadcn.foreground, pressed: shadcn.outlinePressed };
    case "ghost":
      return { background: "transparent", border: "transparent", foreground: shadcn.foreground, pressed: shadcn.outlinePressed };
    case "destructive":
      return { background: shadcn.destructive, border: shadcn.destructive, foreground: shadcn.destructiveForeground, pressed: shadcn.destructiveForeground === "#FFFFFF" ? "#991B1B" : "#FFD1CF" };
    case "link":
      return { background: "transparent", border: "transparent", foreground: shadcn.brand, pressed: "transparent" };
    default:
      return { background: shadcn.primary, border: shadcn.primary, foreground: shadcn.primaryForeground, pressed: shadcn.primaryPressed };
  }
}

export function Button({
  accessibilityLabel,
  accessibilityRole = "button",
  children,
  disabled,
  icon,
  iconColor,
  iconRight,
  loading = false,
  size = "md",
  style,
  textStyle,
  variant = "default",
  ...props
}: ButtonProps) {
  const tone = toneFor(variant);
  const metrics = sizes[size];
  const iconOnly = size === "icon" || size === "icon-sm";
  const inactive = disabled || loading;
  const dark = getColorScheme() === "dark";

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? (typeof children === "string" ? children : undefined)}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: Boolean(inactive), busy: loading }}
      disabled={inactive}
      {...props}
      style={({ pressed }) => [
        {
          alignItems: "center",
          backgroundColor: pressed && !inactive ? tone.pressed : tone.background,
          borderColor: tone.border,
          borderCurve: "continuous",
          borderRadius: radius.lg,
          borderWidth: variant === "link" ? 0 : 1,
          flexDirection: "row",
          gap: metrics.gap,
          height: iconOnly ? metrics.minHeight : undefined,
          justifyContent: "center",
          minHeight: metrics.minHeight,
          minWidth: iconOnly ? metrics.minHeight : undefined,
          opacity: inactive ? 0.48 : 1,
          paddingHorizontal: metrics.paddingHorizontal,
          ...(inactive ? {} : variant === "default" && !dark ? shadows.primary : variant === "outline" ? shadows.control : {}),
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.foreground} size="small" />
      ) : icon ? (
        <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
          <Feather color={iconColor ?? tone.foreground} name={icon} size={metrics.icon} />
        </View>
      ) : null}
      {children ? (
        <Text
          numberOfLines={2}
          style={[
            typography.button,
            { color: tone.foreground, flexShrink: 1, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight, textAlign: "center" },
            variant === "link" ? { textDecorationLine: "underline" } : null,
            textStyle,
          ]}
        >
          {children}
        </Text>
      ) : null}
      {iconRight ? (
        <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
          <Feather color={tone.foreground} name={iconRight} size={metrics.icon} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function ButtonGroup({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 10 }}>{children}</View>;
}

/** @deprecated Prefer Button. Kept so existing imports keep rendering. */
export const PrimaryAction = Button;

export const buttonForeground = {
  brand: shadcn.primaryForeground,
} as const;
