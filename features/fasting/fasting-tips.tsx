import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { BodyText, Card } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";

const tips = [
  { key: "start", icon: "trending-up", tint: colors.warmSoft, ink: colors.gold },
  { key: "prayer", icon: "book-open", tint: colors.reflectionSoft, ink: colors.accentReflection },
  { key: "medical", icon: "shield", tint: colors.mossSurface, ink: colors.accentRhythm },
  { key: "break", icon: "sunrise", tint: colors.warmSoft, ink: colors.gold },
  { key: "truth", icon: "info", tint: colors.prayerSoft, ink: colors.accentPrayer },
] as const;

const moreTips = [
  { key: "water", icon: "droplet" },
  { key: "stop", icon: "alert-circle" },
  { key: "secret", icon: "eye-off" },
  { key: "rest", icon: "moon" },
] as const;

export function FastingTips() {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState<string>();
  const [showMore, setShowMore] = useState(false);

  return (
    <View style={{ gap: 10 }}>
      <Text style={[typography.heading, { color: colors.ink }]}>{t("fasting.tips.title")}</Text>
      {tips.map((tip) => {
        const expanded = open === tip.key;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            key={tip.key}
            onPress={() => setOpen(expanded ? undefined : tip.key)}
          >
            <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12, padding: 14 }}>
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: tip.tint,
                    borderRadius: radius.md,
                    height: 38,
                    justifyContent: "center",
                    width: 38,
                  }}
                >
                  <Feather color={tip.ink} name={tip.icon} size={17} />
                </View>
                <Text style={[typography.bodyMedium, { color: colors.ink, flex: 1 }]}>
                  {t(`fasting.tips.${tip.key}.title` as never)}
                </Text>
                <Feather color={colors.muted} name={expanded ? "chevron-up" : "chevron-down"} size={17} />
              </View>
              {expanded ? (
                <View style={{ paddingBottom: 14, paddingHorizontal: 14 }}>
                  <BodyText muted>{t(`fasting.tips.${tip.key}.body` as never)}</BodyText>
                </View>
              ) : null}
            </Card>
          </Pressable>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showMore }}
        onPress={() => setShowMore((value) => !value)}
        style={({ pressed }) => ({
          alignItems: "center",
          flexDirection: "row",
          gap: 6,
          justifyContent: "center",
          opacity: pressed ? 0.65 : 1,
          paddingVertical: 4,
        })}
      >
        <Text style={[typography.label, { color: shadcn.brand }]}>{t("fasting.tips.more")}</Text>
        <Feather color={shadcn.brand} name={showMore ? "chevron-up" : "chevron-down"} size={14} />
      </Pressable>

      {showMore ? (
        <Card style={{ gap: 12 }}>
          {moreTips.map((tip, index) => (
            <View key={tip.key} style={{ gap: 12 }}>
              {index > 0 ? <View style={{ backgroundColor: colors.line, height: 1 }} /> : null}
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
                <Feather color={colors.muted} name={tip.icon} size={15} style={{ marginTop: 3 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.bodyMedium, { color: colors.ink }]}>
                    {t(`fasting.tips.${tip.key}.title` as never)}
                  </Text>
                  <BodyText muted>{t(`fasting.tips.${tip.key}.body` as never)}</BodyText>
                </View>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}
