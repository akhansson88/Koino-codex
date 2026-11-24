import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import type { Id, Membership } from "@/state/types";
import { Avatar, BodyText } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { groupRoleIcon, groupRoleLabelKey, groupRoleTone } from "@/features/community/roles";

export function MemberList({
  currentUserId,
  memberships,
  onAppointLeader,
  onRemove,
  onRemoveLeader,
  onTransfer,
}: {
  currentUserId?: Id;
  memberships: Membership[];
  onAppointLeader?: (membership: Membership) => void;
  onRemove?: (membership: Membership) => void;
  onRemoveLeader?: (membership: Membership) => void;
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
          <RoomMemberRow
            currentUserId={currentUserId}
            membership={membership}
            onAppointLeader={onAppointLeader}
            onRemove={onRemove}
            onRemoveLeader={onRemoveLeader}
            onTransfer={onTransfer}
          />
        </View>
      ))}
    </View>
  );
}

function MemberAction({
  accessibilityLabel,
  icon,
  onPress,
  tone = "default",
}: {
  accessibilityLabel: string;
  icon: "award" | "user-check" | "user-minus" | "user-x";
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: tone === "danger" ? colors.dangerSurface : shadcn.card,
        borderColor: tone === "danger" ? colors.dangerBorder : shadcn.border,
        borderRadius: radius.md,
        borderWidth: 1,
        height: 36,
        justifyContent: "center",
        opacity: pressed ? 0.75 : 1,
        width: 36,
      })}
    >
      <Feather name={icon} size={16} color={tone === "danger" ? colors.danger : colors.ink} />
    </Pressable>
  );
}

function RoomMemberRow({
  currentUserId,
  membership,
  onAppointLeader,
  onRemove,
  onRemoveLeader,
  onTransfer,
}: {
  currentUserId?: Id;
  membership: Membership;
  onAppointLeader?: (membership: Membership) => void;
  onRemove?: (membership: Membership) => void;
  onRemoveLeader?: (membership: Membership) => void;
  onTransfer?: (membership: Membership) => void;
}) {
  const { t } = useAppTranslation();
  const canAppointLeader = Boolean(
    onAppointLeader && membership.role === "member" && membership.userId !== currentUserId,
  );
  const canRemove = Boolean(onRemove && membership.role !== "owner" && membership.userId !== currentUserId);
  const canRemoveLeader = Boolean(onRemoveLeader && membership.role === "leader");
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
      <Avatar image={membership.image} name={membership.userName} size={38} tone={groupRoleTone(membership.role)} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, flexShrink: 1, fontSize: 14 }]}>
            {membership.userName}
          </Text>
          {groupRoleIcon(membership.role) ? (
            <Feather
              name={groupRoleIcon(membership.role)!}
              size={13}
              color={membership.role === "leader" ? colors.rose : colors.muted}
            />
          ) : null}
        </View>
        <Text style={[typography.caption, { color: membership.role === "leader" ? colors.ink : colors.muted }]}>
          {t(groupRoleLabelKey(membership.role))}
        </Text>
      </View>
      {canAppointLeader ? (
        <MemberAction
          accessibilityLabel={t("community.leaders.appointTo", { name: membership.userName })}
          icon="award"
          onPress={() => onAppointLeader?.(membership)}
        />
      ) : null}
      {canRemoveLeader ? (
        <MemberAction
          accessibilityLabel={t("community.leaders.removeFrom", { name: membership.userName })}
          icon="user-minus"
          onPress={() => onRemoveLeader?.(membership)}
        />
      ) : null}
      {canTransfer ? (
        <MemberAction
          accessibilityLabel={t("community.management.transferTo", { name: membership.userName })}
          icon="user-check"
          onPress={() => onTransfer?.(membership)}
        />
      ) : null}
      {canRemove ? (
        <MemberAction
          accessibilityLabel={t("community.management.removeMemberFrom", { name: membership.userName })}
          icon="user-x"
          onPress={() => onRemove?.(membership)}
          tone="danger"
        />
      ) : null}
    </View>
  );
}
