import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { Group } from "@/state/types";
import { BodyText, SecondaryButton } from "@/ui/app-components";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import { useAppTranslation } from "@/ui/app-language";
import { colors } from "@/ui/theme";
import type { JoinRequestReceipt } from "@/state/community-join-requests";
import type { TranslationKey } from "@/ui/localization";

const resultCopy: Record<JoinRequestReceipt["status"], TranslationKey> = {
  pending: "community.encryption.requested",
  approved: "community.rooms.requestApproved",
  rejected: "community.rooms.requestRejected",
};

export function CommunityEncryptionNotice({ group }: { group: Group }) {
  const { t } = useAppTranslation();
  const { dispatch } = useKoinoActions();
  const { currentUserId } = useKoinoFields(["currentUserId"]);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<JoinRequestReceipt["status"]>(), [error, setError] = useState("");
  useEffect(() => { setStatus(undefined); setError(""); }, [currentUserId, group.id]);
  const owner = group.migrationOwnerName || t("community.encryption.owner");
  return <View style={{ gap: 10 }}>
    <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
      <Feather name="lock" color={colors.gold} size={19} />
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "800", flex: 1 }}>
        {t(group.migrationAwaitingApproval ? "community.encryption.approvalTitle" : "community.encryption.setupTitle")}
      </Text>
    </View>
    <BodyText muted>{t(group.migrationAwaitingApproval ? "community.encryption.approvalBody" : "community.encryption.setupBody", { owner })}</BodyText>
    <BodyText>{t("community.encryption.membershipSaved")}</BodyText>
    {group.migrationAwaitingApproval && group.inviteCode ? <SecondaryButton disabled={busy || Boolean(status) || !currentUserId} onPress={() => {
      setBusy(true); setError("");
      void dispatch({
        type: "joinGroup", inviteCode: group.inviteCode, expectedUserId: currentUserId,
        report: ({ status: next }) => setStatus(next),
      }).catch(() => setError(t("onboarding.journey.joinFailed"))).finally(() => setBusy(false));
    }}>{t(status ? resultCopy[status] : "community.encryption.requestAccess")}</SecondaryButton> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
  </View>;
}
