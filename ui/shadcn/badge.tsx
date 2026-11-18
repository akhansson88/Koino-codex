import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, shadcn, typography } from "@/ui/theme";

export type BadgeVariant = "default" | "secondary" | "outline" | "brand" | "success" | "warning" | "danger";

const variants: Record<BadgeVariant, { background: string; border: string; foreground: string }> = {
  default: { background: shadcn.primary, border: shadcn.primary, foreground: shadcn.primaryForeground },
  secondary: { background: shadcn.secondary, border: shadcn.secondary, foreground: shadcn.secondaryForeground },
  outline: { background: "transparent", border: shadcn.border, foreground: shadcn.foreground },
  brand: { background: shadcn.brandSoft, border: "transparent", foreground: shadcn.brand },
  success: { background: shadcn.successSoft, border: "#BBF7D0", foreground: shadcn.success },
  warning: { background: shadcn.warningSoft, border: "#FDE68A", foreground: shadcn.warning },
  danger: { background: "#FEF2F2", border: "#FECACA", foreground: shadcn.destructive },
};

export function Badge({
  children,
  style,
  variant = "secondary",
}: {
  children: string;
  style?: StyleProp<ViewStyle>;
  variant?: BadgeVariant;
}) {
  const tone = variants[variant];
  return (
    <View
      style={[
        {
          alignItems: "center",
          alignSelf: "flex-start",
          backgroundColor: tone.background,
          borderColor: tone.border,
          borderRadius: radius.sm,
          borderWidth: 1,
          justifyContent: "center",
          minHeight: 24,
          paddingHorizontal: 8,
        },
        style,
      ]}
    >
      <Text style={[typography.navLabel, { color: tone.foreground, fontSize: 11, lineHeight: 14 }]}>{children}</Text>
    </View>
  );
}
