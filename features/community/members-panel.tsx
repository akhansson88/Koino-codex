import { Text, View } from "react-native";
import type { FeedItem, Group, GroupImage, Id } from "@/state/types";
import { Avatar, Card, PrimaryButton, RoomImage, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount, communityMoodScaleLabel } from "@/ui/community-copy";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { colors } from "@/ui/theme";

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
  members: { id: Id; image?: GroupImage; name: string; role: "owner" | "member" }[];
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
          <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{group.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{communityMemberCount(memberCount, t)}</Text>
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
              <Avatar image={member.image} name={member.name} size={38} tone={member.role === "owner" ? "orange" : "green"} />
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "900" }}>{member.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  {t(member.role === "owner" ? "community.members.role.host" : "community.members.role.member")}
                </Text>
                {checkIn ? (
                  <Text style={{ color: colors.muted, flexShrink: 1, fontSize: 12, fontWeight: "600" }}>
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
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{t("community.rooms.code")}</Text>
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
