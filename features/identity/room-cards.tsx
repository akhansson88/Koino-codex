import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import type { Group } from "@/state/types";
import { BodyText, Card, PrimaryButton, RoomImage, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount } from "@/ui/community-copy";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { Separator } from "@/ui/shadcn";
import { colors, typography } from "@/ui/theme";

export function RoomSummaryCard({ group, memberCount, onDetails }: { group?: Group; memberCount: number; onDetails: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Card style={{ gap: 14, padding: 16 }}>
      {group ? (
        <>
          <Pressable accessibilityRole="button" onPress={onDetails} style={{ alignItems: "center", flexDirection: "row", gap: 13 }}>
            <RoomImage image={group.image} name={group.name} size={58} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} style={[typography.title, { color: colors.ink }]}>
                {group.name}
              </Text>
              <Text style={[typography.caption, { color: colors.muted }]}>{communityMemberCount(memberCount, t)}</Text>
            </View>
            <Feather name="chevron-right" size={19} color={colors.muted} />
          </Pressable>
          <Separator />
          <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
            <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("community.rooms.code")}</Text>
            <RoomCodeCopy code={group.inviteCode} fontSize={14} iconSize={15} />
          </View>
          <SecondaryButton icon="info" onPress={onDetails}>
            {t("community.rooms.open")}
          </SecondaryButton>
        </>
      ) : (
        <>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("community.rooms.noneSelected")}</Text>
          <BodyText muted>{t("community.rooms.noneSelectedBody")}</BodyText>
        </>
      )}
    </Card>
  );
}

export function RoomHeaderCard({
  group,
  inviteMessage,
  memberCount,
  onInvite,
}: {
  group: Group;
  inviteMessage: string;
  memberCount: number;
  onInvite: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <Card style={{ gap: 16, padding: 18 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 14 }}>
        <RoomImage image={group.image} name={group.name} size={70} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={2} style={[typography.title, { color: colors.ink }]}>
            {group.name}
          </Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{communityMemberCount(memberCount, t)}</Text>
        </View>
      </View>
      <Separator />
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("community.rooms.code")}</Text>
        <RoomCodeCopy code={group.inviteCode} />
      </View>
      <PrimaryButton icon="share-2" onPress={onInvite}>
        {t("community.members.invite")}
      </PrimaryButton>
      {inviteMessage ? <Text style={[typography.caption, { color: colors.muted }]}>{inviteMessage}</Text> : null}
    </Card>
  );
}

export function JoinSwitchCard({ onBrowse }: { onBrowse: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("community.rooms.joinOrCreate")}</Text>
        <BodyText muted>{t("community.identity.joinOrCreateBody")}</BodyText>
      </View>
      <SecondaryButton icon="users" onPress={onBrowse}>
        {t("community.rooms.joinOrCreate")}
      </SecondaryButton>
    </Card>
  );
}
