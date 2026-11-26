import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { JoinPolicyBadge, JoinQrCode } from "@/features/community/join-qr";
import { JoinPolicySheet } from "@/features/identity/join-policy-sheet";
import { roomMemberCount, shareRoomInvite } from "@/features/identity/room-helpers";
import { SettingsRow, SettingsSection } from "@/features/identity/settings-components";
import { useKoino } from "@/state/koino-store";
import type { GroupJoinPolicy } from "@/state/types";
import { Avatar, AppHeader, AppScreen, BodyText, Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount } from "@/ui/community-copy";
import { RoomCodeCopy } from "@/ui/room-code-copy";
import { colors, typography } from "@/ui/theme";

export default function GroupInviteRoute() {
  const { t } = useAppTranslation();
  const { state } = useKoino();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = params.groupId || state.currentGroupId;
  const group = state.groups.find((item) => item.id === groupId);
  const [policyVisible, setPolicyVisible] = useState(false);
  const [message, setMessage] = useState("");
  const memberCount = group ? roomMemberCount(state.groupMemberCounts, group.id, 1) : 0;
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const policy: GroupJoinPolicy = group?.joinPolicy === "open" ? "open" : "approval";

  async function share() {
    if (!group) return;
    setMessage("");
    try {
      setMessage(await shareRoomInvite(group, t));
    } catch {
      setMessage(t("community.rooms.inviteFallback"));
    }
  }

  return (
    <>
      <AppScreen>
        <AppHeader showBack onBack={() => router.back()} />
        <View style={{ gap: 7 }}>
          <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>
            {t("community.join.qrTitle")}
          </Text>
          <BodyText muted>{t("community.join.qrHint")}</BodyText>
        </View>

        {group ? (
          <>
            <Card style={{ alignItems: "center", gap: 16 }}>
              <View style={{ alignItems: "center", gap: 8 }}>
                <Avatar image={group.image} name={group.name} size={54} tone="orange" />
                <Text style={[typography.title, { color: colors.ink, textAlign: "center" }]}>{group.name}</Text>
                <Text style={[typography.caption, { color: colors.muted }]}>{communityMemberCount(memberCount, t)}</Text>
              </View>
              <JoinQrCode code={group.inviteCode} />
              <JoinPolicyBadge policy={policy} />
              <View style={{ alignItems: "center", gap: 4 }}>
                <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("community.rooms.code")}</Text>
                <RoomCodeCopy code={group.inviteCode} fontSize={26} iconSize={18} />
              </View>
            </Card>

            <PrimaryButton icon="share-2" onPress={() => void share()}>{t("community.join.share")}</PrimaryButton>
            <SecondaryButton icon="camera" onPress={() => router.push("/join-scan" as never)}>{t("community.join.scan")}</SecondaryButton>
            {message ? <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{message}</Text> : null}

            <SettingsSection label={t("community.join.policyTitle")}>
              <SettingsRow
                icon={policy === "open" ? "unlock" : "lock"}
                title={t(policy === "open" ? "community.join.policyOpen" : "community.join.policyApproval")}
                subtitle={t(policy === "open" ? "community.join.policyOpenHint" : "community.join.policyApprovalHint")}
                value={ownsGroup ? t("community.join.change") : undefined}
                onPress={ownsGroup ? () => setPolicyVisible(true) : undefined}
              />
            </SettingsSection>
            {!ownsGroup ? <BodyText muted>{t("community.join.memberHint")}</BodyText> : null}
          </>
        ) : (
          <Card style={{ gap: 12 }}>
            <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("community.rooms.noneSelected")}</Text>
            <BodyText muted>{t("community.rooms.noneSelectedBody")}</BodyText>
            <SecondaryButton onPress={() => router.back()}>{t("common.back")}</SecondaryButton>
          </Card>
        )}
      </AppScreen>

      {group ? (
        <JoinPolicySheet
          groupId={group.id}
          groupName={group.name}
          onClose={() => setPolicyVisible(false)}
          policy={policy}
          visible={policyVisible}
        />
      ) : null}
    </>
  );
}
