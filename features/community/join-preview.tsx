import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import type { JoinRequestReceipt } from "@/state/community-join-requests";
import { useKoino } from "@/state/koino-store";
import type { CommunityInvitePreview } from "@/state/types";
import { Avatar, BodyText, Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount } from "@/ui/community-copy";
import type { TranslationKey } from "@/ui/localization";
import { colors, shadcn, typography } from "@/ui/theme";
import { JoinPolicyBadge } from "@/features/community/join-qr";

export type JoinLookupPhase = "idle" | "loading" | "ready" | "error";

type JoinError = "not-found" | "failed";

/**
 * Resolve a scanned code into the small preview. The store caches a code for a
 * minute, so a camera that reads the same frame repeatedly stays cheap.
 */
export function useJoinLookup(code: string | undefined, active = true) {
  const { dispatch } = useKoino();
  const [invite, setInvite] = useState<CommunityInvitePreview>();
  const [phase, setPhase] = useState<JoinLookupPhase>("idle");
  const [lookupError, setLookupError] = useState<JoinError>();

  useEffect(() => {
    if (!active || !code) {
      setPhase("idle");
      return;
    }
    let mounted = true;
    setPhase("loading");
    setLookupError(undefined);
    setInvite(undefined);
    dispatch({
      type: "resolveInvite",
      code,
      report: (value) => {
        if (!mounted) return;
        setInvite(value);
        setPhase("ready");
      },
    }).catch((problem: unknown) => {
      if (!mounted) return;
      const problemCode = problem && typeof problem === "object" && "code" in problem ? String(problem.code) : "";
      setLookupError(problemCode === "functions/not-found" ? "not-found" : "failed");
      setPhase("error");
    });
    return () => { mounted = false; };
  }, [active, code, dispatch]);

  return { invite, lookupError, phase };
}

/** Join, then make the new community the active one once its membership lands. */
export function useJoinFlow(code: string | undefined) {
  const { dispatch, state } = useKoino();
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<TranslationKey>();
  const [receipt, setReceipt] = useState<JoinRequestReceipt>();
  const pendingGroupId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const groupId = pendingGroupId.current;
    if (!groupId || !state.groups.some((group) => group.id === groupId)) return;
    pendingGroupId.current = undefined;
    void dispatch({ type: "switchGroup", id: groupId });
  }, [dispatch, state.groups]);

  async function join() {
    if (!code || busy) return;
    setBusy(true);
    setJoinError(undefined);
    let outcome: JoinRequestReceipt | undefined;
    try {
      await dispatch({ type: "joinGroup", inviteCode: code, report: (value) => { outcome = value; } });
      if (!outcome) throw new Error("The join could not be confirmed.");
      setReceipt(outcome);
      if (outcome.joined) pendingGroupId.current = outcome.groupId;
    } catch (problem) {
      const value = problem && typeof problem === "object" ? problem as { code?: string; message?: string } : {};
      const problemCode = String(value.code ?? "");
      const message = String(value.message ?? "");
      if (message.includes("EMAIL_NOT_VERIFIED")) setJoinError("onboarding.account.emailNotVerified");
      else if (message.includes("ACTION_RATE_LIMITED")) setJoinError("onboarding.account.actionRateLimited");
      else if (problemCode === "functions/failed-precondition" && message.includes("GROUP_FULL")) setJoinError("community.join.full");
      else if (problemCode === "functions/not-found") setJoinError("community.join.unknownCode");
      else setJoinError("community.join.joinFailed");
    } finally {
      setBusy(false);
    }
  }

  return { busy, join, joinError, receipt };
}

export type JoinPreview = ReturnType<typeof useJoinFlow> & ReturnType<typeof useJoinLookup>;

export function useJoinPreview(code: string | undefined, active = true): JoinPreview {
  const lookup = useJoinLookup(code, active);
  const flow = useJoinFlow(code);
  return { ...lookup, ...flow };
}

/** One preview for the scanner, the deep link and the manual code path. */
export function JoinPreviewCard({ preview, onCancel, onOpen }: {
  preview: JoinPreview;
  onCancel?: () => void;
  onOpen?: (groupId: string) => void;
}) {
  const { t } = useAppTranslation();
  const { invite, phase, lookupError, busy, receipt } = preview;

  if (receipt?.status === "rejected" || (!receipt && invite?.requestStatus === "rejected")) {
    return (
      <Card style={{ alignItems: "center", gap: 12 }}>
        <StatusIcon icon="x" tone="danger" />
        <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink, textAlign: "center" }]}>
          {t("community.join.rejectedTitle")}
        </Text>
        <BodyText muted>{t("community.join.rejectedBody")}</BodyText>
      </Card>
    );
  }

  if (receipt?.status === "pending" || (!receipt && invite?.requestStatus === "pending")) {
    return (
      <Card style={{ alignItems: "center", gap: 12 }}>
        <StatusIcon icon="clock" />
        <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink, textAlign: "center" }]}>
          {t("community.join.pendingTitle")}
        </Text>
        <BodyText muted>{t("community.join.pendingBody")}</BodyText>
      </Card>
    );
  }

  if (phase === "loading") {
    return (
      <Card style={{ alignItems: "center", gap: 10 }}>
        <StatusIcon icon="search" />
        <BodyText muted>{t("community.join.checking")}</BodyText>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <Card style={{ alignItems: "center", gap: 12 }}>
        <StatusIcon icon="alert-circle" tone="danger" />
        <Text accessibilityRole="alert" style={[typography.cardTitle, { color: colors.ink, textAlign: "center" }]}>
          {t(lookupError === "not-found" ? "community.join.invalidCode" : "community.join.lookupFailed")}
        </Text>
        {onCancel ? <SecondaryButton onPress={onCancel}>{t("common.close")}</SecondaryButton> : null}
      </Card>
    );
  }

  if (!invite) return null;

  const member = receipt?.status === "approved" || invite.alreadyMember;
  if (member) {
    return (
      <Card style={{ alignItems: "center", gap: 12 }}>
        <StatusIcon icon="check" tone="success" />
        <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink, textAlign: "center" }]}>
          {t("community.join.joined", { name: invite.name })}
        </Text>
        <BodyText muted>{t("community.rooms.requestApprovedBody")}</BodyText>
        {onOpen ? (
          <PrimaryButton icon="users" onPress={() => onOpen(invite.groupId)}>
            {t("community.join.openCommunity")}
          </PrimaryButton>
        ) : null}
      </Card>
    );
  }

  const open = invite.joinPolicy === "open";
  return (
    <Card style={{ gap: 16 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 13 }}>
        <Avatar name={invite.name || "K"} size={54} tone="orange" />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={2} style={[typography.title, { color: colors.ink }]}>{invite.name}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{communityMemberCount(invite.memberCount, t)}</Text>
        </View>
      </View>
      <JoinPolicyBadge approvers={invite.joinApprovers} policy={invite.joinPolicy} />
      <Text style={[typography.body, { color: colors.muted }]}>
        {t(open
          ? "community.join.previewOpen"
          : invite.joinApprovers === "owner_and_leaders"
            ? "community.join.previewApprovalLeaders"
            : "community.join.previewApproval")}
      </Text>
      <PrimaryButton disabled={busy} loading={busy} onPress={() => void preview.join()}>
        {t(open ? "community.join.openButton" : "community.join.approvalButton")}
      </PrimaryButton>
      {preview.joinError ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.danger }]}>
          {t(preview.joinError)}
        </Text>
      ) : null}
      {onCancel ? <SecondaryButton disabled={busy} onPress={onCancel}>{t("common.cancel")}</SecondaryButton> : null}
    </Card>
  );
}

function StatusIcon({ icon, tone = "neutral" }: { icon: "check" | "clock" | "search" | "x" | "alert-circle"; tone?: "neutral" | "danger" | "success" }) {
  const background = tone === "danger" ? colors.dangerSurface : tone === "success" ? shadcn.successSoft : shadcn.secondary;
  const foreground = tone === "danger" ? colors.danger : tone === "success" ? shadcn.success : colors.muted;
  return (
    <View style={{ alignItems: "center", backgroundColor: background, borderRadius: 999, height: 52, justifyContent: "center", width: 52 }}>
      <Feather name={icon} size={23} color={foreground} />
    </View>
  );
}
