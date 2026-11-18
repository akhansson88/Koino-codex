import { Feather } from "@expo/vector-icons";
import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import { BodyText, BottomSheet, Card, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { Separator } from "@/ui/shadcn";
import { colors, radius, shadcn, typography } from "@/ui/theme";
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
    <Text style={[typography.sectionLabel, { color: colors.muted }]}>
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
      {showDivider ? <Separator style={{ marginLeft: 60 }} /> : null}
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 68, paddingHorizontal: 14, paddingVertical: 10 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: tone === "danger" ? colors.dangerSurface : shadcn.secondary,
            borderColor: tone === "danger" ? colors.dangerBorder : "transparent",
            borderRadius: radius.md,
            borderWidth: 1,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Feather name={icon} size={17} color={tone === "danger" ? colors.danger : colors.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.cardTitle, { color: tone === "danger" ? colors.danger : colors.ink }]}>{title}</Text>
          {subtitle ? <Text style={[typography.caption, { color: colors.muted }]}>{subtitle}</Text> : null}
        </View>
        {value ? (
          <Text numberOfLines={1} style={[typography.caption, { color: colors.muted, maxWidth: 112 }]}>
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
    <View style={{ backgroundColor: shadcn.secondary, borderRadius: radius.md, gap: 3, padding: 14 }}>
      <Text style={[typography.caption, { color: colors.muted }]}>{label}</Text>
      <Text style={[typography.bodyMedium, { color: colors.ink }]}>{value}</Text>
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
