import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useKoino, useKoinoActions } from "@/state/koino-store";
import type { GroupJoinApprovers, GroupJoinPolicy } from "@/state/types";
import { BodyText, BottomSheet, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";

const policyOptions: { policy: GroupJoinPolicy; label: TranslationKey; hint: TranslationKey }[] = [
  { policy: "approval", label: "community.join.policyApproval", hint: "community.join.policyApprovalHint" },
  { policy: "open", label: "community.join.policyOpen", hint: "community.join.policyOpenHint" },
];

const approverOptions: { approvers: GroupJoinApprovers; label: TranslationKey; hint: TranslationKey }[] = [
  { approvers: "owner", label: "community.join.approversOwner", hint: "community.join.approversOwnerHint" },
  { approvers: "owner_and_leaders", label: "community.join.approversLeaders", hint: "community.join.approversLeadersHint" },
];

function Choice({
  active,
  disabled,
  hint,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  hint: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: active ? shadcn.accent : shadcn.card,
        borderColor: active ? colors.ink : shadcn.border,
        borderRadius: radius.lg,
        borderWidth: active ? 1.5 : 1,
        gap: 5,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        padding: 14,
      })}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Feather color={active ? colors.ink : colors.disabledText} name={active ? "check-circle" : "circle"} size={18} />
        <Text style={[typography.cardTitle, { color: colors.ink, flex: 1 }]}>{label}</Text>
      </View>
      <Text style={[typography.caption, { color: colors.muted, marginLeft: 26 }]}>{hint}</Text>
    </Pressable>
  );
}

export function JoinPolicySheet({
  approvers,
  groupId,
  groupName,
  onClose,
  policy,
  visible,
}: {
  approvers: GroupJoinApprovers;
  groupId: string;
  groupName: string;
  onClose: () => void;
  policy: GroupJoinPolicy;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const { dispatch } = useKoinoActions();
  const { state } = useKoino();
  const [selectedPolicy, setSelectedPolicy] = useState<GroupJoinPolicy>(policy);
  const [selectedApprovers, setSelectedApprovers] = useState<GroupJoinApprovers>(approvers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey>();

  useEffect(() => {
    if (visible) {
      setSelectedPolicy(policy);
      setSelectedApprovers(approvers);
      setError(undefined);
    }
  }, [approvers, policy, visible]);

  const approval = selectedPolicy === "approval";
  const unchanged = selectedPolicy === policy && selectedApprovers === approvers;

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await dispatch({ type: "setJoinPolicy", id: groupId, joinPolicy: selectedPolicy, joinApprovers: selectedApprovers });
      onClose();
    } catch {
      setError("community.join.policyError");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet title={t("community.join.policyTitle")} visible={visible} onClose={onClose} dismissible={!busy}>
      <BodyText muted>{t("community.join.policyBody", { name: groupName })}</BodyText>

      <View style={{ gap: 10 }}>
        {policyOptions.map((option) => (
          <Choice
            active={selectedPolicy === option.policy}
            disabled={busy}
            hint={t(option.hint)}
            key={option.policy}
            label={t(option.label)}
            onPress={() => setSelectedPolicy(option.policy)}
          />
        ))}
      </View>

      <View style={{ gap: 3 }}>
        <Text style={[typography.sectionLabel, { color: colors.muted }]}>{t("community.join.approversTitle")}</Text>
        <Text style={[typography.caption, { color: colors.muted }]}>
          {t(approval ? "community.join.approversBody" : "community.join.approversStoredHint")}
        </Text>
      </View>
      <View style={{ gap: 10 }}>
        {approverOptions.map((option) => (
          <Choice
            active={approval && selectedApprovers === option.approvers}
            disabled={busy || !approval}
            hint={t(option.hint)}
            key={option.approvers}
            label={t(option.label)}
            onPress={() => setSelectedApprovers(option.approvers)}
          />
        ))}
      </View>

      {error ? <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>{t(error)}</Text> : null}
      <PrimaryButton disabled={busy || unchanged || !state.currentUserId} loading={busy} onPress={() => void save()}>
        {t("common.save")}
      </PrimaryButton>
      <SecondaryButton disabled={busy} onPress={onClose}>{t("common.cancel")}</SecondaryButton>
    </BottomSheet>
  );
}
