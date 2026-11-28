import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import type { ActivityNotification, PrayerNotification } from "@/state/types";
import { AppScreen, Avatar, IconButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { type TranslationKey } from "@/ui/localization";
import { formatRelativeTime } from "@/ui/relative-time";
import { navigateThenMarkRead } from "@/ui/notification-navigation";
import { colors, radius, typography } from "@/ui/theme";

const contentLabelKeys: Record<ActivityNotification["contentLabel"], TranslationKey> = {
  post: "notifications.content.post",
  "prayer request": "notifications.content.prayerRequest",
  "check-in": "notifications.content.checkIn",
};

type NotificationRow =
  | { kind: "activity"; createdAt: string; activity: ActivityNotification }
  | { kind: "prayer"; createdAt: string; prayer: PrayerNotification };

function ownerNotificationKey(content: ActivityNotification["contentLabel"]) {
  if (content === "prayer request") return "notifications.owner.prayerRequest" as const;
  if (content === "check-in") return "notifications.owner.checkIn" as const;
  return "notifications.owner.post" as const;
}

export default function NotificationsScreen() {
  const { state, dispatch } = useKoino();
  const { language, t } = useAppTranslation();
  const rows: NotificationRow[] = [
    ...state.activityNotifications.map((activity): NotificationRow => ({
      kind: "activity",
      createdAt: activity.createdAt,
      activity,
    })),
    ...state.prayerNotifications.map((prayer): NotificationRow => ({
      kind: "prayer",
      createdAt: prayer.completedAt,
      prayer,
    })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const hasUnread = state.activityNotifications.some((item) => !item.readAt)
    || state.prayerNotifications.some((item) => !item.readAt);
  const userById = new Map(state.users.map((user) => [user.id, user]));

  const openActivity = (notification: ActivityNotification) => {
    navigateThenMarkRead(() => router.push({
      pathname: "/feed/[targetType]/[id]",
      params: {
        targetType: notification.targetType,
        id: notification.targetId,
        groupId: notification.groupId,
      },
    } as never),
    () => dispatch({ type: "markActivityNotificationRead", id: notification.id }),
    (error) => console.error("[notifications] Could not mark notification read", error));
  };

  const openPrayer = (notification: PrayerNotification) => {
    const open = () => {
      if (notification.targetType === "post" && notification.targetId && notification.groupId) {
        router.push({
          pathname: "/feed/[targetType]/[id]",
          params: {
            targetType: "post",
            id: notification.targetId,
            groupId: notification.groupId,
          },
        } as never);
        return;
      }
      router.navigate("/(tabs)/me" as never);
    };
    navigateThenMarkRead(
      open,
      () => dispatch({ type: "markPrayerNotificationRead", id: notification.id }),
      (error) => console.error("[notifications] Could not mark prayer notification read", error),
    );
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
              <Pressable
                hitSlop={8}
                onPress={() => {
                  void dispatch({ type: "markAllActivityNotificationsRead" });
                  void dispatch({ type: "markAllPrayerNotificationsRead" });
                }}
              >
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

        {rows.length === 0 ? (
          <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 28, paddingVertical: 72 }}>
            <View style={{ alignItems: "center", backgroundColor: colors.lavenderSoft, borderRadius: 28, height: 56, justifyContent: "center", width: 56 }}>
              <Feather color={colors.olive} name="bell" size={24} />
            </View>
            <Text style={[typography.cardTitle, { color: colors.textPrimary }]}>{t("notifications.emptyTitle")}</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center" }]}>{t("notifications.emptyBody")}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {rows.map((row) => {
              if (row.kind === "prayer") {
                const giver = userById.get(row.prayer.userId);
                const name = giver?.name?.trim() || t("common.someone");
                const isUnread = !row.prayer.readAt;
                const requestTitle = row.prayer.targetType === "post" ? row.prayer.requestTitle?.trim() : undefined;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={`prayer-${row.prayer.id}`}
                    onPress={() => openPrayer(row.prayer)}
                    style={{
                      alignItems: "flex-start",
                      backgroundColor: isUnread ? colors.prayerSoft : colors.paper,
                      borderColor: colors.line,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      flexDirection: "row",
                      gap: 12,
                      padding: 14,
                    }}
                  >
                    <Avatar image={giver?.image} name={name} size={44} tone="pink" />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[typography.body, { color: colors.textPrimary }]}>
                        {t(row.prayer.targetType === "post" ? "notifications.prayerForRequest" : "notifications.prayerForYou", { name })}
                      </Text>
                      {requestTitle ? (
                        <Text numberOfLines={2} style={[typography.body, { color: colors.textSecondary }]}>
                          “{requestTitle}”
                        </Text>
                      ) : null}
                      <Text style={[typography.label, { color: colors.muted }]}>
                        {formatRelativeTime(row.prayer.completedAt, language)}
                      </Text>
                    </View>
                    {isUnread ? <View style={{ backgroundColor: colors.rose, borderRadius: 5, height: 10, marginTop: 5, width: 10 }} /> : null}
                  </Pressable>
                );
              }
              const notification = row.activity;
              const actor = state.users.find((user) => user.id === notification.actorUserId);
              const name = actor?.name ?? notification.actorName ?? t("common.someone");
              const content = t(contentLabelKeys[notification.contentLabel]);
              const isUnread = !notification.readAt;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={notification.id}
                  onPress={() => void openActivity(notification)}
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
