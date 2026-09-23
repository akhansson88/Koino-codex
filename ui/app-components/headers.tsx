import { Feather } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useKoinoFields } from "@/state/koino-store";
import type { GroupImage } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount } from "@/ui/community-copy";
import { colors, typography } from "@/ui/theme";
import { IconButton } from "@/ui/app-components/controls";
import { RoomImage, Avatar } from "@/ui/app-components/avatars";

export function AppHeader({
  currentRoomName,
  currentRoomImage,
  memberCount,
  onRoomPress,
  showBack = false,
  onBack,
}: {
  currentRoomName?: string;
  currentRoomImage?: GroupImage;
  memberCount?: number;
  onRoomPress?: () => void;
  showBack?: boolean;
  onBack?: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <View style={{ gap: 18 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          {showBack ? (
            <IconButton accessibilityLabel={t("shared.app.goBack")} icon="arrow-left" onPress={onBack ?? (() => router.back())} />
          ) : null}
          <Text style={[typography.title, { color: colors.textPrimary, fontSize: 24, lineHeight: 30 }]}>KOINO</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <NotificationBellButton />
          <AvatarButton />
        </View>
      </View>

      {currentRoomName ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRoomPress}
          style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 10 }}
        >
          <RoomImage image={currentRoomImage} name={currentRoomName} size={44} />
          <View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <Text style={[typography.cardTitle, { color: colors.ink }]}>{currentRoomName}</Text>
              <Feather name="chevron-down" size={16} color={colors.ink} />
            </View>
            {typeof memberCount === "number" ? (
              <Text style={[typography.label, { color: colors.muted }]}>
                {communityMemberCount(memberCount, t)}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AvatarButton({ size = 38 }: { size?: number }) {
  const state = useKoinoFields(["users", "currentUserId", "authEmail"]);
  const { t } = useAppTranslation();
  const pathname = usePathname();
  const user = state.users.find((item) => item.id === state.currentUserId);

  if (!state.currentUserId) return null;

  const openIdentitySupport = () => {
    if (pathname === "/identity") return;
    router.push("/identity" as never);
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("shared.app.openIdentitySupport")} hitSlop={8} onPress={openIdentitySupport}>
      <Avatar image={user?.image} name={user?.name ?? state.authEmail ?? "K"} size={size} tone="pink" />
    </Pressable>
  );
}

export function NotificationBellButton() {
  const state = useKoinoFields(["activityNotifications", "currentUserId"]);
  const { t } = useAppTranslation();
  const pathname = usePathname();
  const unreadCount = state.activityNotifications.filter((item) => !item.readAt).length;

  if (!state.currentUserId) return null;

  return (
    <Pressable
      accessibilityLabel={`${t("notifications.open")}${unreadCount ? ` (${unreadCount})` : ""}`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        if (pathname !== "/notifications") router.push("/notifications" as never);
      }}
      style={{ alignItems: "center", height: 38, justifyContent: "center", position: "relative", width: 38 }}
    >
      <Feather color={colors.ink} name="bell" size={21} />
      {unreadCount > 0 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.rose,
            borderColor: colors.cream,
            borderRadius: 9,
            borderWidth: 2,
            justifyContent: "center",
            minHeight: 18,
            minWidth: 18,
            paddingHorizontal: 3,
            position: "absolute",
            right: -1,
            top: 0,
          }}
        >
          <Text style={{ color: colors.ink, fontSize: 9, fontWeight: "700", lineHeight: 12 }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function CurrentRoomHeader() {
  const state = useKoinoFields(["currentGroupId", "groups", "groupMemberCounts", "memberships"]);
  const { t } = useAppTranslation();
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? state.groupMemberCounts[group.id] || state.memberships.length || 4 : 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/(tabs)/community" as never)}
      style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 10 }}
    >
      <RoomImage image={group?.image} name={group?.name} size={44} />
      <View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, maxWidth: 220 }]}>
            {group?.name ?? t("community.management.noneShort")}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.ink} />
        </View>
        {group ? (
          <Text style={[typography.label, { color: colors.muted }]}>{communityMemberCount(memberCount, t)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
