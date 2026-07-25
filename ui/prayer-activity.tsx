import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import type { GroupImage, Id } from "@/state/types";
import { Avatar, Card, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors } from "@/ui/theme";

export type PrayerActivityEntry = {
  id: Id;
  createdAt: string;
  durationSeconds?: number;
  name: string;
  image?: GroupImage;
};

type AppTranslationFunction = ReturnType<typeof useAppTranslation>["t"];

export function formatPrayerDuration(seconds: number | undefined, t: AppTranslationFunction) {
  if (seconds === undefined) return t("community.prayerActivity.durationUnavailable");
  if (seconds < 60) return t("community.prayerActivity.durationSeconds", { seconds });
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder
    ? t("community.prayerActivity.durationMinutesSeconds", { minutes, seconds: remainder })
    : t("community.prayerActivity.durationMinutes", { minutes });
}

export function PrayerActivity({
  activity,
  title,
}: {
  activity: PrayerActivityEntry[];
  title?: string;
}) {
  const { language, t } = useAppTranslation();
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(3);
  const activityKey = activity.map((entry) => entry.id).join("|");
  const visibleActivity = activity.slice(0, visibleCount);
  const remainingCount = Math.max(0, activity.length - visibleActivity.length);
  const resolvedTitle = title ?? t("community.prayerActivity.title");

  useEffect(() => {
    setExpanded(false);
    setVisibleCount(3);
  }, [activityKey]);

  if (activity.length === 0) return null;

  return (
    <Card style={{ gap: 0, padding: 0 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((current) => !current)}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12 }}>
          <Text style={{ color: colors.ink, flex: 1, fontSize: 15, fontWeight: "900" }}>
            {t("community.prayerActivity.heading", { count: activity.length, title: resolvedTitle })}
          </Text>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={{ borderTopColor: colors.line, borderTopWidth: 1 }}>
          {visibleActivity.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                alignItems: "center",
                borderBottomColor: colors.line,
                borderBottomWidth: index === visibleActivity.length - 1 && remainingCount === 0 ? 0 : 1,
                flexDirection: "row",
                gap: 10,
                padding: 14,
              }}
            >
              <Avatar image={entry.image} name={entry.name} size={34} tone="orange" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>
                  {t("community.prayerActivity.memberPrayed", { name: entry.name })}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {t("community.prayerActivity.meta", {
                    duration: formatPrayerDuration(entry.durationSeconds, t),
                    time: formatRelativeTime(entry.createdAt, language),
                  })}
                </Text>
              </View>
            </View>
          ))}
          {remainingCount > 0 ? (
            <View style={{ padding: 12 }}>
              <SecondaryButton icon="chevron-down" onPress={() => setVisibleCount((count) => Math.min(activity.length, count + 10))} style={{ minHeight: 42 }}>
                {t("community.prayerActivity.viewMore")}
              </SecondaryButton>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
