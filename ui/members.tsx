import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useKoino } from "@/state/koino-store";
import { approveGroupMember, listGroupJoinRequests, rejectGroupJoinRequest } from "@/state/encryption/session";
import { useAppTranslation } from "@/ui/app-language";
import { BodyText, Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { colors, typography } from "@/ui/theme";

type PendingRequest = { userId: string; name: string; requestedAt: number };

// Community access is enforced by database rules. The host approves requests
// here; there are no device keys or recovery steps involved.
export default function MembersScreen() {
  const { t, language } = useAppTranslation();
  const { state } = useKoino();
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const owner = Boolean(group && state.currentUserId && group.ownerId === state.currentUserId);
  const [requests, setRequests] = useState<PendingRequest[]>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!group || !owner) { setRequests([]); return; }
    try {
      setRequests(await listGroupJoinRequests(group.id));
      setError("");
    } catch {
      setError(t("community.rooms.requestsError"));
      setRequests([]);
    }
  }, [group?.id, owner]);
  useEffect(() => { void load(); }, [load]);
  async function decide(userId: string, approve: boolean) {
    if (!group || busy) return;
    setBusy(userId);
    setError("");
    try {
      if (approve) await approveGroupMember(group.id, userId, requests?.find((item) => item.userId === userId)?.name ?? "KOINO member");
      else await rejectGroupJoinRequest(group.id, userId);
      await load();
    } catch {
      setError(t(approve ? "community.management.removeMemberError" : "community.rooms.requestsError"));
    } finally {
      setBusy(undefined);
    }
  }
  return <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ gap: 16, padding: 20, paddingTop: 56 }}>
    <SecondaryButton onPress={() => router.back()}>{t("common.back")}</SecondaryButton>
    <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{t("community.rooms.requestsTitle")}</Text>
    {!group ? <BodyText muted>{t("community.rooms.noneSelectedBody")}</BodyText> : null}
    {group && !owner ? <BodyText muted>{t("community.roomDetails.subtitle")}</BodyText> : null}
    {group && owner ? <Card style={{ gap: 12 }}>
      {!requests ? <ActivityIndicator color={colors.ink} /> : null}
      {requests && requests.length === 0 ? <BodyText muted>{t("community.rooms.requestsEmpty")}</BodyText> : null}
      {(requests ?? []).map((request) => <View key={request.userId} style={{ gap: 8 }}>
        <View style={{ gap: 2 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{request.name}</Text>
          <BodyText muted>{new Date(request.requestedAt).toLocaleDateString(language === "sv" ? "sv-SE" : "en-US")}</BodyText>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <PrimaryButton disabled={Boolean(busy)} onPress={() => void decide(request.userId, true)}>{t("community.rooms.requestApproved")}</PrimaryButton>
          <SecondaryButton disabled={Boolean(busy)} onPress={() => void decide(request.userId, false)}>{t("community.rooms.requestRejected")}</SecondaryButton>
        </View>
      </View>)}
    </Card> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
  </ScrollView>;
}
