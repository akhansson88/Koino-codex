import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import type { ActivityNotification } from "@/state/types";
import { AppScreen, Avatar, IconButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors, radius, typography } from "@/ui/theme";

const swedishContentLabels: Record<ActivityNotification["contentLabel"], string> = {
  post: "inlägg",
  reflection: "reflektion",
  "prayer request": "böneämne",
  prayer: "bön",
  praise: "lovprisning",
  "check-in": "incheckning",
  update: "uppdatering",
  "scripture reflection": "bibelreflektion",
};

function ownerNotificationKey(content: ActivityNotification["contentLabel"]) {
  if (content === "reflection") return "notifications.owner.reflection" as const;
  if (content === "prayer request") return "notifications.owner.prayerRequest" as const;
  if (content === "prayer") return "notifications.owner.prayer" as const;
  if (content === "praise") return "notifications.owner.praise" as const;
  if (content === "check-in") return "notifications.owner.checkIn" as const;
  if (content === "update") return "notifications.owner.update" as const;
  if (content === "scripture reflection") return "notifications.owner.scripture" as const;
  return "notifications.owner.post" as const;
}

export default function NotificationsScreen() {
  const { state, dispatch } = useKoino();
  const { language, t } = useAppTranslation();
  const notifications = [...state.activityNotifications].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      Number(b.priority === "high") - Number(a.priority === "high"),
  );
  const hasUnread = notifications.some((item) => !item.readAt);

  const openNotification = async (notification: ActivityNotification) => {
    await dispatch({ type: "markActivityNotificationRead", id: notification.id });
    router.push({
      pathname: "/feed/[targetType]/[id]",
      params: {
        targetType: notification.targetType,
        id: notification.targetId,
        groupId: notification.groupId,
      },
    } as never);
  };

  return (
    <AppScreen>
      <View style={{ gap: 22, paddingBottom: 40 }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <IconButton accessibilityLabel={t("shared.app.goBack")} icon="arrow-left" onPress={() => router.back()} />
            <Text style={[typography.title, { color: colors.textPrimary, fontSize: 26 }]}>{t("notifications.title")}</Text>
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            {hasUnread ? (
              <Pressable hitSlop={8} onPress={() => void dispatch({ type: "markAllActivityNotificationsRead" })}>
                <Text style={[typography.label, { color: colors.olive }]}>{t("notifications.markAllRead")}</Text>
              </Pressable>
            ) : null}
            <IconButton
              accessibilityLabel={t("notifications.preferences.open")}
              icon="settings"
              onPress={() => router.push("/notification-settings" as never)}
            />
          </View>
        </View>

        {notifications.length === 0 ? (
          <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 28, paddingVertical: 72 }}>
            <View style={{ alignItems: "center", backgroundColor: colors.lavenderSoft, borderRadius: 28, height: 56, justifyContent: "center", width: 56 }}>
              <Feather color={colors.olive} name="bell" size={24} />
            </View>
            <Text style={[typography.cardTitle, { color: colors.textPrimary }]}>{t("notifications.emptyTitle")}</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center" }]}>{t("notifications.emptyBody")}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {notifications.map((notification) => {
              const actor = state.users.find((user) => user.id === notification.actorUserId);
              const name = actor?.name ?? notification.actorName ?? "Someone";
              const content = language === "sv" ? swedishContentLabels[notification.contentLabel] : notification.contentLabel;
              const isUnread = !notification.readAt;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={notification.id}
                  onPress={() => void openNotification(notification)}
                  style={{
                    alignItems: "flex-start",
                    backgroundColor: !isUnread
                      ? colors.paper
                      : notification.priority === "high"
                        ? colors.prayerSoft
                        : colors.lavenderSoft,
                    borderColor: colors.line,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: 12,
                    padding: 14,
                  }}
                >
                  <Avatar image={actor?.image ?? notification.actorImage} name={name} size={44} tone="pink" />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[typography.body, { color: colors.textPrimary }]}>
                      {t(notification.reason === "mention" ? "notifications.mentionedYou" : notification.reason === "participant" ? "notifications.discussionActivity" : ownerNotificationKey(notification.contentLabel), {
                        name,
                      })}
                    </Text>
                    {notification.reason === "participant" ? (
                      <Text style={[typography.label, { color: colors.textSecondary }]}>
                        {t("notifications.discussionContext", {
                          name,
                          owner: notification.targetOwnerName,
                          content,
                        })}
                      </Text>
                    ) : null}
                    <Text numberOfLines={2} style={[typography.body, { color: colors.textSecondary }]}>
                      “{notification.preview}”
                    </Text>
                    <Text style={[typography.label, { color: colors.muted }]}>
                      {formatRelativeTime(notification.createdAt, language)}
                    </Text>
                  </View>
                  {isUnread ? <View style={{ backgroundColor: colors.rose, borderRadius: 5, height: 10, marginTop: 5, width: 10 }} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </AppScreen>
  );
}
