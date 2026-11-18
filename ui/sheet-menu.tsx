import { Feather } from "@expo/vector-icons";
import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";

import { Separator } from "@/ui/shadcn/separator";
import { colors, radius, shadows, shadcn, typography } from "@/ui/theme";
import { type FeatherName } from "@/ui/app-components/types";

export function SheetSectionLabel({ children }: PropsWithChildren) {
  return <Text style={[typography.sectionLabel, { color: colors.muted }]}>{children}</Text>;
}

export function SheetFormPanel({ children, label }: PropsWithChildren<{ label?: string }>) {
  return (
    <View style={{ gap: 8 }}>
      {label ? <SheetSectionLabel>{label}</SheetSectionLabel> : null}
      <View
        style={{
          backgroundColor: shadcn.secondary,
          borderColor: shadcn.border,
          borderCurve: "continuous",
          borderRadius: radius.xl,
          borderWidth: 1,
          gap: 12,
          padding: 14,
          ...shadows.control,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function SheetMenuGroup({
  children,
  label,
}: PropsWithChildren<{ label?: string }>) {
  return (
    <View style={{ gap: 8 }}>
      {label ? <SheetSectionLabel>{label}</SheetSectionLabel> : null}
      <View
        style={{
          backgroundColor: shadcn.secondary,
          borderColor: shadcn.border,
          borderCurve: "continuous",
          borderRadius: radius.xl,
          borderWidth: 1,
          overflow: "hidden",
          ...shadows.control,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function SheetMenuItem({
  disabled = false,
  icon,
  onPress,
  showDivider = false,
  subtitle,
  title,
  tone = "default",
}: {
  disabled?: boolean;
  icon: FeatherName;
  onPress: () => void;
  showDivider?: boolean;
  subtitle?: string;
  title: string;
  tone?: "default" | "danger";
}) {
  const destructive = tone === "danger";
  return (
    <>
      {showDivider ? <Separator style={{ marginLeft: 64 }} /> : null}
      <Pressable
        accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: pressed ? "rgba(255, 255, 255, 0.66)" : "transparent",
          flexDirection: "row",
          gap: 12,
          minHeight: 64,
          opacity: disabled ? 0.48 : 1,
          paddingHorizontal: 14,
          paddingVertical: 10,
        })}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: destructive ? colors.dangerSurface : shadcn.card,
            borderColor: destructive ? colors.dangerBorder : shadcn.border,
            borderCurve: "continuous",
            borderRadius: radius.md,
            borderWidth: 1,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <Feather name={icon} size={17} color={destructive ? colors.danger : colors.ink} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={[typography.cardTitle, { color: destructive ? colors.danger : colors.ink }]}>
            {title}
          </Text>
          {subtitle ? <Text style={[typography.caption, { color: colors.muted }]}>{subtitle}</Text> : null}
        </View>
        <Feather name="chevron-right" size={17} color={colors.disabledText} />
      </Pressable>
    </>
  );
}
