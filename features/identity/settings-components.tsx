import { Feather } from "@expo/vector-icons";
import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import { BodyText, BottomSheet, Card, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius } from "@/ui/theme";
import { type FeatherName } from "@/features/identity/types";

export function SettingsSection({ children, label }: PropsWithChildren<{ label: string }>) {
  return (
    <View style={{ gap: 10 }}>
      <SectionLabel>{label}</SectionLabel>
      <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>{children}</Card>
    </View>
  );
}

export function SectionLabel({ children }: PropsWithChildren) {
  return (
    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.4, textTransform: "uppercase" }}>
      {children}
    </Text>
  );
}

export function SettingsRow({
  icon,
  onPress,
  showDivider = false,
  subtitle,
  title,
  tone = "default",
  value,
}: {
  icon: FeatherName;
  onPress?: () => void;
  showDivider?: boolean;
  subtitle?: string;
  title: string;
  tone?: "default" | "danger";
  value?: string;
}) {
  const content = (
    <>
      {showDivider ? <View style={{ backgroundColor: colors.line, height: 1, marginLeft: 60 }} /> : null}
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 68, paddingHorizontal: 14, paddingVertical: 10 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: tone === "danger" ? colors.dangerSurface : colors.accentSubtle,
            borderColor: tone === "danger" ? colors.dangerBorder : colors.line,
            borderRadius: 999,
            borderWidth: 1,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Feather name={icon} size={17} color={tone === "danger" ? colors.danger : colors.olive} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: tone === "danger" ? colors.danger : colors.ink, fontSize: 15, fontWeight: "900" }}>{title}</Text>
          {subtitle ? <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 }}>{subtitle}</Text> : null}
        </View>
        {value ? (
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, fontWeight: "800", maxWidth: 112 }}>
            {value}
          </Text>
        ) : null}
        {onPress ? <Feather name="chevron-right" size={18} color={colors.muted} /> : null}
      </View>
    </>
  );

  if (!onPress) return <View>{content}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}>
      {content}
    </Pressable>
  );
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ backgroundColor: colors.input, borderColor: colors.line, borderRadius: radius.lg, borderWidth: 1, gap: 4, padding: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}

export function InfoSheet({
  body,
  doneLabel,
  onClose,
  title,
  visible,
}: {
  body: string;
  doneLabel?: string;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <BottomSheet title={title} visible={visible} onClose={onClose}>
      <BodyText muted>{body}</BodyText>
      <SecondaryButton onPress={onClose}>{doneLabel ?? t("common.done")}</SecondaryButton>
    </BottomSheet>
  );
}
