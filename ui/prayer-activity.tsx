import { Text, View } from "react-native";

import type { GroupImage, Id } from "@/state/types";
import { Avatar, BodyText, Card, SectionHeading } from "@/ui/app-components";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors } from "@/ui/theme";

export type PrayerActivityEntry = {
  id: Id;
  createdAt: string;
  durationSeconds?: number;
  name: string;
  image?: GroupImage;
};

export function formatPrayerDuration(seconds?: number) {
  if (seconds === undefined) return "Duration unavailable";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function PrayerActivity({
  activity,
  emptyText = "No prayer activity yet.",
  title = "Prayer activity",
}: {
  activity: PrayerActivityEntry[];
  emptyText?: string;
  title?: string;
}) {
  return (
    <View style={{ gap: 12 }}>
      <SectionHeading>{title}</SectionHeading>
      <Card style={{ gap: 0, padding: 0 }}>
        {activity.length === 0 ? (
          <BodyText muted style={{ padding: 14 }}>{emptyText}</BodyText>
        ) : (
          activity.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                alignItems: "center",
                borderBottomColor: colors.line,
                borderBottomWidth: index === activity.length - 1 ? 0 : 1,
                flexDirection: "row",
                gap: 10,
                padding: 14,
              }}
            >
              <Avatar image={entry.image} name={entry.name} size={34} tone="orange" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{entry.name} prayed</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {formatRelativeTime(entry.createdAt)} - {formatPrayerDuration(entry.durationSeconds)}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}
