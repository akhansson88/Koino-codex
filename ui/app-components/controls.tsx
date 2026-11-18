import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { PropsWithChildren } from "react";
import { Pressable, ScrollView, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { Button } from "@/ui/shadcn/button";
import { Input } from "@/ui/shadcn/input";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadows, shadcn, typography } from "@/ui/theme";
import { type FeatherName } from "@/ui/app-components/types";

export function PrimaryButton({
  accessibilityHint,
  accessibilityLabel,
  children,
  disabled = false,
  icon,
  loading = false,
  onPress,
  style,
}: PropsWithChildren<{
  accessibilityHint?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: FeatherName;
  loading?: boolean;
  onPress: ComponentProps<typeof Pressable>["onPress"];
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <Button
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      icon={icon}
      loading={loading}
      onPress={onPress}
      size="lg"
      style={style}
      variant="default"
    >
      {children}
    </Button>
  );
}

export function SecondaryButton({
  accessibilityHint,
  accessibilityLabel,
  children,
  disabled = false,
  icon,
  onPress,
  style,
  tone = "default",
}: PropsWithChildren<{
  accessibilityHint?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: FeatherName;
  onPress: ComponentProps<typeof Pressable>["onPress"];
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "danger";
}>) {
  return (
    <Button
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      icon={icon}
      onPress={onPress}
      size="lg"
      style={style}
      textStyle={tone === "danger" ? { color: colors.danger } : undefined}
      variant="outline"
    >
      {children}
    </Button>
  );
}

export function TextInputField(props: import("react-native").TextInputProps) {
  return <Input {...props} />;
}

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  tone = "default",
  variant = "outline",
}: {
  accessibilityLabel: string;
  icon: FeatherName;
  onPress: () => void;
  tone?: "default" | "danger";
  variant?: "outline" | "ghost";
}) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      icon={icon}
      onPress={onPress}
      size="icon-sm"
      variant={variant}
      style={tone === "danger" ? { borderColor: colors.dangerBorder } : undefined}
      iconColor={tone === "danger" ? colors.danger : undefined}
    />
  );
}

export function FilterChips<T extends string>({
  fit = false,
  minHeight = 36,
  options,
  showSelectionIndicator = false,
  value,
  onChange,
}: {
  fit?: boolean;
  minHeight?: number;
  options: { label: string; value: T }[];
  showSelectionIndicator?: boolean;
  value: T;
  onChange: (value: T) => void;
}) {
  const chips = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        accessibilityLabel={option.label}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        key={option.value}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: selected ? shadcn.primary : pressed ? "#FBE7D3" : shadcn.secondary,
          borderColor: selected ? shadcn.primary : shadcn.border,
          borderCurve: "continuous",
          borderRadius: radius.md,
          borderWidth: 1,
          flex: fit ? 1 : undefined,
          flexDirection: "row",
          gap: 6,
          justifyContent: "center",
          minHeight,
          minWidth: fit ? 0 : undefined,
          paddingHorizontal: fit ? 4 : 14,
          ...(selected ? {} : shadows.control),
        })}
      >
        {selected && showSelectionIndicator ? (
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Feather name="check" size={13} color={shadcn.primaryForeground} />
          </View>
        ) : null}
        <Text
          adjustsFontSizeToFit={fit}
          minimumFontScale={fit ? 0.78 : undefined}
          numberOfLines={1}
          style={[
            typography.label,
            {
              color: selected ? shadcn.primaryForeground : colors.muted,
              fontSize: fit ? 12 : typography.label.fontSize,
            },
          ]}
        >
          {option.label}
        </Text>
      </Pressable>
    );
  });

  if (fit) {
    return <View style={{ flexDirection: "row", gap: 6, width: "100%" }}>{chips}</View>;
  }

  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{chips}</ScrollView>;
}

export function StatusPill({ status }: { status: "answered" | "open" }) {
  const { t } = useAppTranslation();
  const answered = status === "answered";
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: answered ? shadcn.successSoft : shadcn.warningSoft,
        borderColor: answered ? "#BBF7D0" : "#FDE68A",
        borderRadius: radius.sm,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 24,
        paddingHorizontal: 8,
      }}
    >
      <Text style={[typography.navLabel, { color: answered ? shadcn.success : shadcn.warning, fontSize: 11 }]}>
        {t(answered ? "shared.status.answered" : "shared.status.open")}
      </Text>
    </View>
  );
}

export const controlTextStyle: TextStyle = { color: colors.ink };
