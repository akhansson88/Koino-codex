import type { ComponentProps, PropsWithChildren } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { BodyText, Card } from "@/ui/app-components";
import { colors, radius } from "@/ui/theme";

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
  const passageSurface = completed ? colors.semantic.communitySoft : colors.semantic.reflectionSoft;
  const passageAccent = completed ? colors.semantic.success : colors.semantic.scripture;

  return (
    <Card style={{ gap: 10, padding: 14 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Text style={{ color: colors.text.primary, flex: 1, fontSize: 13, fontWeight: "900" }}>{rhythmLabel}</Text>
        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "800" }}>{progressLabel}</Text>
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: passageSurface,
          borderRadius: radius.sm,
          flexDirection: "row",
          gap: 10,
          minHeight: 48,
          paddingHorizontal: 12,
        }}
      >
        <Feather name="bookmark" size={17} color={passageAccent} />
        <Text numberOfLines={1} style={{ color: colors.text.primary, flex: 1, fontSize: 15, fontWeight: "900" }}>
          {passageReference}
        </Text>
      </View>
      <RhythmRow accent={completed ? "community" : "neutral"} icon={completed ? "check-circle" : "circle"} label="Read today" onPress={onRead} />
      <RhythmRow accent="reflection" icon="edit-3" label={reflectLabel} onPress={onReflect} />
    </Card>
  );
}

function RhythmRow({
  accent = "neutral",
  icon,
  label,
  onPress,
}: {
  accent?: "community" | "neutral" | "reflection";
  icon: FeatherName;
  label: string;
  onPress?: () => void;
}) {
  const surface =
    accent === "community" ? colors.semantic.communitySoft : accent === "reflection" ? colors.semantic.reflectionSoft : colors.background.surface;
  const iconColor = accent === "community" ? colors.semantic.success : accent === "reflection" ? colors.semantic.scripture : colors.text.primary;
  const content = (
    <View
      style={{
        alignItems: "center",
        backgroundColor: surface,
        borderRadius: radius.sm,
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        minHeight: 48,
        opacity: onPress ? 1 : 0.6,
        paddingHorizontal: 12,
      }}
    >
      <Feather name={icon} size={17} color={iconColor} />
      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "900" }}>{label}</Text>
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
  const accent =
    icon === "heart"
      ? { color: colors.semantic.prayer, surface: colors.semantic.prayerSoft }
      : icon === "users"
        ? { color: colors.semantic.community, surface: colors.semantic.communitySoft }
        : icon === "book-open" || icon === "edit-3"
          ? { color: colors.semantic.reflection, surface: colors.semantic.reflectionSoft }
          : { color: colors.brand.peach, surface: colors.semantic.warmthSoft };
  const content = (
    <Card
      style={{
        backgroundColor: tone === "accent" ? colors.semantic.warmthSoft : colors.background.surface,
        gap: 12,
        padding: 14,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        {icon ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: accent.surface,
              borderRadius: 999,
              height: 38,
              justifyContent: "center",
              width: 38,
            }}
          >
            <Feather name={icon} size={18} color={accent.color} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "900" }}>{title}</Text>
          <BodyText muted numberOfLines={2}>
            {subtitle}
          </BodyText>
        </View>
        {onPress ? <Feather name="chevron-right" size={19} color={colors.text.secondary} /> : null}
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
