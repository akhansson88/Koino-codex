import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";
import type { FeedItem, Group, GroupImage, GroupRole, Id } from "@/state/types";
import { Avatar, Card, PrimaryButton, RoomImage, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount, communityMoodScaleLabel } from "@/ui/community-copy";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { colors, typography } from "@/ui/theme";
import { groupRoleIcon, groupRoleLabelKey, groupRoleTone } from "@/features/community/roles";

export function MembersPanel({
  group,
  latestCheckInByUser,
  memberCount,
  members,
  onInvite,
  onManage,
  onSwitchRoom,
}: {
  group: Group;
  latestCheckInByUser: Map<Id, Extract<FeedItem, { type: "check_in" }>>;
  memberCount: number;
  members: { id: Id; image?: GroupImage; name: string; role: GroupRole }[];
  onInvite: () => void;
  onManage: () => void;
  onSwitchRoom: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
        <RoomImage image={group.image} name={group.name} size={58} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={[typography.title, { color: colors.ink }]}>{group.name}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{communityMemberCount(memberCount, t)}</Text>
        </View>
      </Card>
      <Card style={{ gap: 0, padding: 0 }}>
        {members.map((member, index) => {
          const checkIn = latestCheckInByUser.get(member.id);
          return (
            <View
              key={member.id}
              style={{
                alignItems: "center",
                borderBottomColor: colors.line,
                borderBottomWidth: index === members.length - 1 ? 0 : 1,
                flexDirection: "row",
                gap: 10,
                padding: 14,
              }}
            >
              <Avatar image={member.image} name={member.name} size={38} tone={groupRoleTone(member.role)} />
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
                  <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, flexShrink: 1, fontSize: 14 }]}>{member.name}</Text>
                  {groupRoleIcon(member.role) ? (
                    <Feather
                      name={groupRoleIcon(member.role)!}
                      size={13}
                      color={member.role === "leader" ? colors.rose : colors.muted}
                    />
                  ) : null}
                </View>
                <Text style={[typography.caption, { color: member.role === "leader" ? colors.ink : colors.muted }]}>
                  {t(groupRoleLabelKey(member.role))}
                </Text>
                {checkIn ? (
                  <Text style={[typography.caption, { color: colors.muted, flexShrink: 1 }]}>
                    {t("community.members.lastCheckIn", { mood: communityMoodScaleLabel(checkIn.mood, t) })}
                  </Text>
                ) : null}
              </View>
              <View
                style={{
                  backgroundColor: checkIn ? colors.mossSurface : colors.input,
                  borderRadius: 999,
                  height: 9,
                  width: 9,
                }}
              />
            </View>
          );
        })}
      </Card>
      <PrimaryButton icon="share-2" onPress={onInvite}>
        {t("community.members.invite")}
      </PrimaryButton>
      <Card>
        <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("community.rooms.code")}</Text>
        <RoomCodeCopy code={group.inviteCode} />
      </Card>
      <SecondaryButton icon="settings" onPress={onManage}>
        {t("community.management.title")}
      </SecondaryButton>
      <SecondaryButton icon="repeat" onPress={onSwitchRoom}>
        {t("community.rooms.joinOrCreate")}
      </SecondaryButton>
    </View>
  );
}
