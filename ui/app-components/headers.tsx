import { Feather } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useKoinoFields } from "@/state/koino-store";
import type { GroupImage } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount } from "@/ui/community-copy";
import { colors, radius, shadows, shadcn, typography } from "@/ui/theme";
import { IconButton } from "@/ui/app-components/controls";
import { RoomImage, Avatar } from "@/ui/app-components/avatars";

function Wordmark() {
  return (
    <Text style={[typography.title, { color: colors.ink, fontFamily: "Montserrat_600SemiBold", fontSize: 22, letterSpacing: 2.4, lineHeight: 28 }]}>
      KOINO
    </Text>
  );
}

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
    <View style={{ gap: 16 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          {showBack ? (
            <IconButton accessibilityLabel={t("shared.app.goBack")} icon="arrow-left" onPress={onBack ?? (() => router.back())} />
          ) : null}
          <Wordmark />
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <NotificationBellButton />
          <AvatarButton size={38} />
        </View>
      </View>

      {currentRoomName ? (
        <RoomSwitcher
          image={currentRoomImage}
          memberCount={memberCount}
          name={currentRoomName}
          onPress={onRoomPress}
        />
      ) : null}
    </View>
  );
}

function RoomSwitcher({
  image,
  memberCount,
  name,
  onPress,
}: {
  image?: GroupImage;
  memberCount?: number;
  name: string;
  onPress?: () => void;
}) {
  const { t } = useAppTranslation();
  const content = (
    <>
      <RoomImage image={image} name={name} size={32} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[typography.label, { color: colors.ink }]}>{name}</Text>
        {typeof memberCount === "number" ? (
          <Text numberOfLines={1} style={[typography.caption, { color: colors.muted }]}>
            {communityMemberCount(memberCount, t)}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-down" size={15} color={colors.muted} />
    </>
  );
  if (!onPress) {
    return (
      <View style={{ alignItems: "center", alignSelf: "flex-start", backgroundColor: shadcn.card, borderColor: shadcn.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: 9, maxWidth: "100%", minHeight: 48, paddingHorizontal: 8, ...shadows.control }}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: pressed ? shadcn.secondary : shadcn.card,
        borderColor: shadcn.border,
        borderRadius: radius.md,
        borderWidth: 1,
        flexDirection: "row",
        gap: 9,
        maxWidth: "100%",
        minHeight: 48,
        paddingHorizontal: 8,
        ...shadows.control,
      })}
    >
      {content}
    </Pressable>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("shared.app.openIdentitySupport")}
      hitSlop={8}
      onPress={openIdentitySupport}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Avatar image={user?.image} name={user?.name ?? state.authEmail ?? "K"} size={size} tone="orange" />
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
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? shadcn.secondary : shadcn.card,
        borderColor: shadcn.border,
        borderRadius: radius.md,
        borderWidth: 1,
        height: 38,
        justifyContent: "center",
        position: "relative",
        width: 38,
        ...shadows.control,
      })}
    >
      <Feather color={colors.ink} name="bell" size={18} />
      {unreadCount > 0 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: shadcn.brand,
            borderColor: shadcn.card,
            borderRadius: 8,
            borderWidth: 2,
            justifyContent: "center",
            minHeight: 17,
            minWidth: 17,
            paddingHorizontal: 3,
            position: "absolute",
            right: -4,
            top: -4,
          }}
        >
          <Text style={{ color: shadcn.brandForeground, fontSize: 9, fontFamily: "Inter_500Medium", lineHeight: 11 }}>
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
    <RoomSwitcher
      image={group?.image}
      memberCount={group ? memberCount : undefined}
      name={group?.name ?? t("community.management.noneShort")}
      onPress={() => router.push("/(tabs)/community" as never)}
    />
  );
}
