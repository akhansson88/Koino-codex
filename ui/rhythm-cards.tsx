import type { ComponentProps, PropsWithChildren } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { BodyText, Card } from "@/ui/app-components";
import { colors, radius, typography } from "@/ui/theme";

type FeatherName = ComponentProps<typeof Feather>["name"];

export function ScriptureRhythmCard({
  completed,
  onRead,
  onReflect,
  passageReference,
  progressLabel,
  reflectLabel = "Reflect",
  rhythmLabel,
}: {
  completed?: boolean;
  onRead: () => void;
  onReflect?: () => void;
  passageReference: string;
  progressLabel: string;
  reflectLabel?: string;
  rhythmLabel: string;
}) {
  return (
    <Card style={{ gap: 10, padding: 14 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Text style={[typography.label, { color: colors.textMuted, flex: 1 }]}>{rhythmLabel}</Text>
        <Text style={[typography.caption, { color: colors.muted }]}>{progressLabel}</Text>
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.warmSoft,
          borderColor: colors.border,
          borderRadius: radius.sm,
          borderWidth: 1,
          flexDirection: "row",
          gap: 10,
          minHeight: 48,
          paddingHorizontal: 12,
        }}
      >
        <Feather name="bookmark" size={17} color={colors.textMuted} />
        <Text numberOfLines={1} style={[typography.bodyMedium, { color: colors.ink, flex: 1 }]}>
          {passageReference}
        </Text>
      </View>
      <RhythmRow icon={completed ? "check-circle" : "circle"} label="Read today" onPress={onRead} />
      <RhythmRow icon="edit-3" label={reflectLabel} onPress={onReflect} />
    </Card>
  );
}

function RhythmRow({
  icon,
  label,
  onPress,
}: {
  icon: FeatherName;
  label: string;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.input,
        borderRadius: radius.sm,
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        minHeight: 48,
        opacity: onPress ? 1 : 0.6,
        paddingHorizontal: 12,
      }}
    >
      <Feather name={icon} size={17} color={colors.olive} />
      <Text style={[typography.label, { color: colors.ink }]}>{label}</Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  );
}

export function QuietActionCard({
  children,
  icon,
  onPress,
  subtitle,
  title,
  tone = "default",
}: PropsWithChildren<{
  icon?: FeatherName;
  onPress?: () => void;
  subtitle: string;
  title: string;
  tone?: "default" | "accent";
}>) {
  const content = (
    <Card
      style={{
        backgroundColor: tone === "accent" ? colors.elevated : colors.paper,
        gap: 12,
        padding: 14,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        {icon ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.accentSubtle,
              borderRadius: 999,
              height: 38,
              justifyContent: "center",
              width: 38,
            }}
          >
            <Feather name={icon} size={18} color={colors.olive} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{title}</Text>
          <BodyText muted numberOfLines={2}>
            {subtitle}
          </BodyText>
        </View>
        {onPress ? <Feather name="chevron-right" size={19} color={colors.muted} /> : null}
      </View>
      {children}
    </Card>
  );

  if (!onPress) return content;

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  );
}
