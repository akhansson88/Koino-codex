import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import type { Id, Membership } from "@/state/types";
import { Avatar, BodyText } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";

export function MemberList({
  currentUserId,
  memberships,
  onRemove,
  onTransfer,
}: {
  currentUserId?: Id;
  memberships: Membership[];
  onRemove?: (membership: Membership) => void;
  onTransfer?: (membership: Membership) => void;
}) {
  const { t } = useAppTranslation();
  if (memberships.length === 0) {
    return <BodyText muted>{t("community.members.empty")}</BodyText>;
  }

  return (
    <View style={{ gap: 8 }}>
      {memberships.map((membership) => (
        <View key={membership.id}>
          <RoomMemberRow currentUserId={currentUserId} membership={membership} onRemove={onRemove} onTransfer={onTransfer} />
        </View>
      ))}
    </View>
  );
}

function RoomMemberRow({
  currentUserId,
  membership,
  onRemove,
  onTransfer,
}: {
  currentUserId?: Id;
  membership: Membership;
  onRemove?: (membership: Membership) => void;
  onTransfer?: (membership: Membership) => void;
}) {
  const { t } = useAppTranslation();
  const canRemove = Boolean(onRemove && membership.role !== "owner" && membership.userId !== currentUserId);
  const canTransfer = Boolean(onTransfer && membership.role !== "owner" && membership.userId !== currentUserId);

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: shadcn.card,
        borderColor: shadcn.border,
        borderRadius: radius.md,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        padding: 10,
      }}
    >
      <Avatar image={membership.image} name={membership.userName} size={38} tone={membership.role === "owner" ? "orange" : "green"} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, fontSize: 14 }]}>{membership.userName}</Text>
        <Text style={[typography.caption, { color: colors.muted }]}>
          {t(membership.role === "owner" ? "community.members.role.host" : "community.members.role.member")}
        </Text>
      </View>
      {canTransfer ? (
        <Pressable
          accessibilityLabel={t("community.management.transferTo", { name: membership.userName })}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onTransfer?.(membership)}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: pressed ? shadcn.secondary : shadcn.card,
            borderColor: shadcn.border,
            borderRadius: radius.md,
            borderWidth: 1,
            height: 36,
            justifyContent: "center",
            opacity: pressed ? 0.75 : 1,
            width: 36,
          })}
        >
          <Feather name="user-check" size={16} color={colors.ink} />
        </Pressable>
      ) : null}
      {canRemove ? (
        <Pressable
          accessibilityLabel={t("community.management.removeMemberFrom", { name: membership.userName })}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onRemove?.(membership)}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: colors.dangerSurface,
            borderColor: colors.dangerBorder,
            borderRadius: radius.md,
            borderWidth: 1,
            height: 36,
            justifyContent: "center",
            opacity: pressed ? 0.75 : 1,
            width: 36,
          })}
        >
          <Feather name="user-x" size={16} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}
