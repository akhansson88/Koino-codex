import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, shadcn, typography } from "@/ui/theme";

export type BadgeVariant = "default" | "secondary" | "outline" | "brand" | "success" | "warning" | "danger";

function toneFor(variant: BadgeVariant): { background: string; border: string; foreground: string } {
  switch (variant) {
    case "default":
      return { background: shadcn.primary, border: shadcn.primary, foreground: shadcn.primaryForeground };
    case "secondary":
      return { background: shadcn.secondary, border: shadcn.secondary, foreground: shadcn.secondaryForeground };
    case "outline":
      return { background: "transparent", border: shadcn.border, foreground: shadcn.foreground };
    case "brand":
      return { background: shadcn.brandSoft, border: "transparent", foreground: shadcn.brand };
    case "success":
      return { background: shadcn.successSoft, border: shadcn.success, foreground: shadcn.success };
    case "warning":
      return { background: shadcn.warningSoft, border: shadcn.warning, foreground: shadcn.warning };
    case "danger":
      return { background: shadcn.card, border: shadcn.destructive, foreground: shadcn.destructive };
  }
}

export function Badge({
  children,
  style,
  variant = "secondary",
}: {
  children: string;
  style?: StyleProp<ViewStyle>;
  variant?: BadgeVariant;
}) {
  const tone = toneFor(variant);
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
          minHeight: 26,
          paddingHorizontal: 9,
        },
        style,
      ]}
    >
      <Text style={[typography.navLabel, { color: tone.foreground, fontSize: 12, lineHeight: 16 }]}>{children}</Text>
    </View>
  );
}
