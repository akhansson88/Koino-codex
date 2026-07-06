import type { ComponentProps, PropsWithChildren } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { BodyText, Card } from "@/ui/app-components";
import { colors, radius, typography } from "@/ui/theme";

type FeatherName = ComponentProps<typeof Feather>["name"];

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
