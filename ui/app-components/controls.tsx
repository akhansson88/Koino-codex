import { SheetTextInput } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { PropsWithChildren } from "react";
import { Pressable, ScrollView, StyleProp, Text, TextInputProps, View, ViewStyle } from "react-native";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, typography } from "@/ui/theme";
import { type FeatherName } from "@/ui/app-components/types";

export function PrimaryButton({
  accessibilityHint,
  accessibilityLabel,
  children,
  disabled = false,
  icon,
  onPress,
  style,
}: PropsWithChildren<{
  accessibilityHint?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: FeatherName;
  onPress: ComponentProps<typeof Pressable>["onPress"];
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? (typeof children === "string" ? children : undefined)}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          alignItems: "center",
          backgroundColor: disabled ? colors.disabled : colors.gold,
          borderColor: disabled ? colors.disabled : colors.gold,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 10,
          justifyContent: "center",
          minHeight: 54,
          paddingHorizontal: 18,
        },
        style,
      ]}
    >
      {icon ? (
        <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
          <Feather name={icon} size={19} color={disabled ? colors.disabledText : colors.onAccent} />
        </View>
      ) : null}
      <Text style={[typography.button, { color: disabled ? colors.disabledText : colors.onAccent, flexShrink: 1, textAlign: "center" }]}>
        {children}
      </Text>
    </Pressable>
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
  const color = tone === "danger" ? colors.danger : colors.olive;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? (typeof children === "string" ? children : undefined)}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          alignItems: "center",
          backgroundColor: colors.paper,
          borderColor: tone === "danger" ? colors.dangerBorder : colors.line,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 9,
          justifyContent: "center",
          minHeight: 52,
          paddingHorizontal: 18,
        },
        style,
      ]}
    >
      {icon ? (
        <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
          <Feather name={icon} size={18} color={disabled ? colors.disabledText : color} />
        </View>
      ) : null}
      <Text style={[typography.button, { color: disabled ? colors.disabledText : color, flexShrink: 1, textAlign: "center" }]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function TextInputField(props: TextInputProps) {
  return (
    <SheetTextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[
        {
          backgroundColor: colors.input,
          borderColor: colors.line,
          borderCurve: "continuous",
          borderRadius: radius.lg,
          borderWidth: 1,
          color: colors.ink,
          minHeight: props.multiline ? 116 : 50,
          paddingHorizontal: 14,
          paddingVertical: props.multiline ? 14 : 0,
          textAlignVertical: props.multiline ? "top" : "center",
        },
        typography.body,
        props.style,
      ]}
    />
  );
}

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  tone = "default",
}: {
  accessibilityLabel: string;
  icon: FeatherName;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 38,
        justifyContent: "center",
        width: 38,
      }}
    >
      <Feather name={icon} size={18} color={tone === "danger" ? colors.danger : colors.ink} />
    </Pressable>
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
        style={{
          alignItems: "center",
          backgroundColor: selected ? colors.accentSubtle : colors.paper,
          borderColor: selected ? colors.gold : colors.line,
          borderRadius: 999,
          borderWidth: 1,
          flex: fit ? 1 : undefined,
          flexDirection: "row",
          gap: 6,
          justifyContent: "center",
          minHeight,
          minWidth: fit ? 0 : undefined,
          paddingHorizontal: fit ? 4 : 18,
        }}
      >
        {selected && showSelectionIndicator ? (
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Feather name="check" size={14} color={colors.olive} />
          </View>
        ) : null}
        <Text
          adjustsFontSizeToFit={fit}
          minimumFontScale={fit ? 0.78 : undefined}
          numberOfLines={1}
          style={[typography.label, { color: selected ? colors.olive : colors.muted, fontSize: fit ? 12 : typography.label.fontSize }]}
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
        backgroundColor: answered ? colors.rhythmSoft : colors.warmSoft,
        borderColor: answered ? colors.accentRhythm : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>
        {t(answered ? "shared.status.answered" : "shared.status.open")}
      </Text>
    </View>
  );
}
