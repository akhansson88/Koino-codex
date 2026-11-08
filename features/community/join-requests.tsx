import { useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import type { CommunityJoinRequest } from "@/state/community-join-requests";
import { subscribeJoinRequestChanges } from "@/state/community-join-requests";
import { communityJoinFingerprint, listCommunityJoinRequests } from "@/state/encryption/session";
import { BodyText, Card, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors, typography } from "@/ui/theme";

const statusCopy: Record<CommunityJoinRequest["status"], TranslationKey> = {
  pending: "community.rooms.requestPending",
  approved: "community.rooms.requestApproved",
  rejected: "community.rooms.requestRejected",
  closed: "community.rooms.requestClosed",
};

export function CommunityJoinFingerprint({ userId }: { userId: string }) {
  const { t } = useAppTranslation();
  const fingerprint = communityJoinFingerprint(userId);
  if (!fingerprint) return null;
  return (
    <View style={{ gap: 4 }}>
      <BodyText muted>{t("community.rooms.requestFingerprint")}</BodyText>
      <Text selectable style={[typography.bodyMedium, { color: colors.ink }]}>{fingerprint}</Text>
    </View>
  );
}

export function CommunityJoinRequests({ userId, active }: { userId?: string; active: boolean }) {
  const { language, t } = useAppTranslation();
  const [result, setResult] = useState<{ userId: string; requests?: CommunityJoinRequest[]; error?: boolean }>();
  const refresh = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!userId || !active) return;
    let current = true;
    let inFlight = false;
    let reload = false;
    let hasPending = false;
    async function load() {
      if (!current || !userId) return;
      if (inFlight) {
        reload = true;
        return;
      }
      inFlight = true;
      try {
        const requests = await listCommunityJoinRequests(userId);
        if (current) {
          hasPending = requests.some((request) => request.status === "pending");
          setResult({ userId, requests });
        }
      } catch {
        if (current) setResult((last) => ({ userId, requests: last?.userId === userId ? last.requests : undefined, error: true }));
      } finally {
        inFlight = false;
        if (current && reload) {
          reload = false;
          void load();
        }
      }
    }
    refresh.current = () => { void load(); };
    void load();
    const stopRequests = subscribeJoinRequestChanges((changedUserId) => {
      if (changedUserId === userId) void load();
    });
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && hasPending && !inFlight) void load();
    }, 15_000);
    return () => {
      current = false;
      refresh.current = () => undefined;
      stopRequests();
      foreground.remove();
      clearInterval(timer);
    };
  }, [active, userId]);

  if (!userId || !active) return null;
  const snapshot = result?.userId === userId ? result : undefined;
  const requests = snapshot?.requests ?? [];
  const pending = requests.some((request) => request.status === "pending");
  return (
    <Card>
      <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink }]}>
        {t("community.rooms.requestsTitle")}
      </Text>
      {!snapshot ? <BodyText muted>{t("community.rooms.requestsLoading")}</BodyText> : null}
      {snapshot?.error ? (
        <BodyText accessibilityRole="alert" accessibilityLiveRegion="polite">{t("community.rooms.requestsError")}</BodyText>
      ) : null}
      {snapshot && !snapshot.error && requests.length === 0 ? <BodyText muted>{t("community.rooms.requestsEmpty")}</BodyText> : null}
      {requests.map((request) => (
        <View key={request.groupId} style={{ gap: 4 }}>
          <Text style={[typography.bodyMedium, { color: colors.ink }]}>{t(statusCopy[request.status])}</Text>
          <BodyText muted>
            {request.inviteHint ? `${t("community.rooms.requestInviteHint", { hint: request.inviteHint })} · ` : ""}
            {new Date(request.updatedAt).toLocaleDateString(language === "sv" ? "sv-SE" : "en-US")}
          </BodyText>
        </View>
      ))}
      {pending ? (
        <>
          <BodyText muted>{t("community.rooms.requestPendingBody")}</BodyText>
          <CommunityJoinFingerprint userId={userId} />
        </>
      ) : null}
      {pending || snapshot?.error ? (
        <SecondaryButton onPress={() => refresh.current()}>{t("community.rooms.requestsRefresh")}</SecondaryButton>
      ) : null}
    </Card>
  );
}
