import { router } from "expo-router";
import { Switch, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import type { NotificationPreferences } from "@/state/types";
import { AppScreen, BodyText, Card, IconButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

type PreferenceKey = keyof NotificationPreferences;

function PreferenceRow({
  disabled,
  preferenceKey,
  subtitle,
  title,
}: {
  disabled?: boolean;
  preferenceKey: PreferenceKey;
  subtitle: string;
  title: string;
}) {
  const { state, dispatch } = useKoino();
  const value = state.notificationPreferences[preferenceKey];
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 16, minHeight: 66 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[typography.body, { color: disabled ? colors.disabledText : colors.textPrimary, fontWeight: "700" }]}>
          {title}
        </Text>
        <Text style={[typography.label, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        onValueChange={(nextValue) => void dispatch({ type: "setNotificationPreference", key: preferenceKey, value: nextValue })}
        thumbColor={value ? colors.paper : colors.disabledText}
        trackColor={{ false: colors.disabled, true: colors.rose }}
        value={value}
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const { state } = useKoino();
  const { t } = useAppTranslation();
  const pushDisabled = !state.notificationPreferences.pushEnabled;

  return (
    <AppScreen>
      <View style={{ gap: 22, paddingBottom: 40 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <IconButton accessibilityLabel={t("shared.app.goBack")} icon="arrow-left" onPress={() => router.back()} />
          <Text style={[typography.title, { color: colors.textPrimary, fontSize: 26 }]}>
            {t("notifications.preferences.title")}
          </Text>
        </View>
        <BodyText muted>{t("notifications.preferences.description")}</BodyText>
        <Card style={{ gap: 0 }}>
          <PreferenceRow
            preferenceKey="pushEnabled"
            title={t("notifications.preferences.push")}
            subtitle={t("notifications.preferences.pushBody")}
          />
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <PreferenceRow
            disabled={pushDisabled}
            preferenceKey="ownContent"
            title={t("notifications.preferences.ownContent")}
            subtitle={t("notifications.preferences.ownContentBody")}
          />
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <PreferenceRow
            disabled={pushDisabled}
            preferenceKey="mentions"
            title={t("notifications.preferences.mentions")}
            subtitle={t("notifications.preferences.mentionsBody")}
          />
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <PreferenceRow
            disabled={pushDisabled}
            preferenceKey="followedDiscussions"
            title={t("notifications.preferences.following")}
            subtitle={t("notifications.preferences.followingBody")}
          />
          <View style={{ backgroundColor: colors.line, height: 1 }} />
          <PreferenceRow
            disabled={pushDisabled}
            preferenceKey="prayerActivity"
            title={t("notifications.preferences.prayerActivity")}
            subtitle={t("notifications.preferences.prayerActivityBody")}
          />
        </Card>
        <BodyText muted>{t("notifications.preferences.inboxNote")}</BodyText>
      </View>
    </AppScreen>
  );
}
