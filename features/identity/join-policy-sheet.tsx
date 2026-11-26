import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useKoino, useKoinoActions } from "@/state/koino-store";
import type { GroupJoinPolicy } from "@/state/types";
import { BodyText, BottomSheet, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors, radius, shadcn, typography } from "@/ui/theme";

const options: { policy: GroupJoinPolicy; label: TranslationKey; hint: TranslationKey }[] = [
  { policy: "approval", label: "community.join.policyApproval", hint: "community.join.policyApprovalHint" },
  { policy: "open", label: "community.join.policyOpen", hint: "community.join.policyOpenHint" },
];

export function JoinPolicySheet({
  groupId,
  groupName,
  onClose,
  policy,
  visible,
}: {
  groupId: string;
  groupName: string;
  onClose: () => void;
  policy: GroupJoinPolicy;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const { dispatch } = useKoinoActions();
  const { state } = useKoino();
  const [selected, setSelected] = useState<GroupJoinPolicy>(policy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey>();

  useEffect(() => {
    if (visible) {
      setSelected(policy);
      setError(undefined);
    }
  }, [policy, visible]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await dispatch({ type: "setJoinPolicy", id: groupId, joinPolicy: selected });
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
        {options.map((option) => {
          const active = selected === option.policy;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              disabled={busy}
              key={option.policy}
              onPress={() => setSelected(option.policy)}
              style={({ pressed }) => ({
                backgroundColor: active ? shadcn.accent : shadcn.card,
                borderColor: active ? colors.ink : shadcn.border,
                borderRadius: radius.lg,
                borderWidth: active ? 1.5 : 1,
                gap: 5,
                opacity: pressed ? 0.8 : 1,
                padding: 14,
              })}
            >
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
                <Feather
                  color={active ? colors.ink : colors.disabledText}
                  name={active ? "check-circle" : "circle"}
                  size={18}
                />
                <Text style={[typography.cardTitle, { color: colors.ink }]}>{t(option.label)}</Text>
              </View>
              <Text style={[typography.caption, { color: option.policy === "open" ? shadcn.warning : colors.muted, marginLeft: 26 }]}>
                {t(option.hint)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>{t(error)}</Text> : null}
      <PrimaryButton disabled={busy || selected === policy || !state.currentUserId} loading={busy} onPress={() => void save()}>
        {t("common.save")}
      </PrimaryButton>
      <SecondaryButton disabled={busy} onPress={onClose}>{t("common.cancel")}</SecondaryButton>
    </BottomSheet>
  );
}
