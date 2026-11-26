import { useMemo } from "react";
import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { formatRelativeTime } from "@/ui/relative-time";
import type { PrayerNotification, User } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { Avatar, Card } from "@/ui/app-components";
import { colors, radius, typography } from "@/ui/theme";

function prayerDuration(seconds: number, t: ReturnType<typeof useAppTranslation>["t"]) {
  if (seconds < 60) return t("me.prayers.durationSeconds", { seconds });
  return t("me.prayers.duration", { minutes: Math.max(1, Math.round(seconds / 60)) });
}

export function MePrayers({
  notifications,
  users,
}: {
  notifications: PrayerNotification[];
  users: User[];
}) {
  const { language, t } = useAppTranslation();
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const recent = notifications.slice(0, 3);
  const remaining = Math.max(0, notifications.length - recent.length);

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.prayerSoft,
            borderRadius: radius.lg,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <Feather color={colors.accentPrayer} name="heart" size={18} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink }]}>
            {t("me.prayers.title")}
          </Text>
          {recent.length === 0 ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t("me.prayers.empty")}</Text>
          ) : null}
        </View>
        {notifications.length > 0 ? (
          <Text style={[typography.caption, { color: colors.muted }]}>{notifications.length}</Text>
        ) : null}
      </View>

      {recent.length > 0 ? (
        <View style={{ gap: 10 }}>
          {recent.map((notification) => {
            const giver = userById.get(notification.userId);
            const name = giver?.name?.trim() || t("common.someone");
            const requestTitle = notification.targetType === "post" ? notification.requestTitle?.trim() : undefined;
            return (
              <View key={notification.id} style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                <Avatar image={giver?.image} name={name} size={34} tone="pink" />
                <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={[typography.body, { color: colors.ink }]}>
                    {t(notification.targetType === "post" ? "me.prayers.prayedForRequest" : "me.prayers.prayedForYou", { name })}
                  </Text>
                  <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
                    {[
                      requestTitle ? `“${requestTitle}”` : undefined,
                      formatRelativeTime(notification.completedAt, language),
                      prayerDuration(notification.durationSeconds, t),
                    ].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
            );
          })}
          {remaining > 0 ? (
            <Text style={[typography.caption, { color: colors.muted }]}>{t("me.prayers.more", { count: remaining })}</Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
