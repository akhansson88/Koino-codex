import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Text, View } from "react-native";

import { CommunityJoinFingerprint } from "@/features/community/join-requests";
import type { JoinRequestReceipt } from "@/state/community-join-requests";
import { useKoinoActions } from "@/state/koino-store";
import { PrimaryButton, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { colors } from "@/ui/theme";

export function useCommunityJoinForm(userId: string | undefined, visible: boolean) {
  const { dispatch } = useKoinoActions();
  const scope = useMemo(() => ({ userId, visible }), [userId, visible]);
  const activeScope = useRef<typeof scope | undefined>(undefined);
  const pendingScope = useRef<typeof scope | undefined>(undefined);
  const [code, setCode] = useState("");
  const [error, setError] = useState<TranslationKey>();
  const [receipt, setReceipt] = useState<JoinRequestReceipt>();
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    activeScope.current = scope;
    setCode("");
    setError(undefined);
    setReceipt(undefined);
    setBusy(false);
    return () => {
      activeScope.current = undefined;
      if (pendingScope.current === scope) pendingScope.current = undefined;
    };
  }, [scope]);

  const canSubmit = Boolean(userId && code.trim().length >= 3);
  async function submit() {
    if (!userId || !visible || !canSubmit || activeScope.current !== scope || pendingScope.current === scope) return;
    pendingScope.current = scope;
    setBusy(true);
    setError(undefined);
    let outcome: JoinRequestReceipt | undefined;
    let settled = false;
    try {
      await dispatch({ type: "joinGroup", inviteCode: code, expectedUserId: userId, report: (value) => { outcome = value; } });
      if (activeScope.current !== scope) return;
      if (!outcome) throw new Error("The access request outcome is unavailable.");
      Keyboard.dismiss();
      setCode("");
      setReceipt(outcome);
      settled = true;
    } catch (problem) {
      if (activeScope.current !== scope) return;
      const code = problem && typeof problem === "object" && "code" in problem ? problem.code : undefined;
      setError(code === "functions/not-found" ? "community.error.inviteNotFound" : "onboarding.journey.joinFailed");
    } finally {
      if (!settled && pendingScope.current === scope) pendingScope.current = undefined;
      if (activeScope.current === scope) setBusy(false);
    }
  }

  function changeCode(value: string) {
    if (activeScope.current !== scope || pendingScope.current === scope) return;
    setCode(value.toUpperCase());
    setError(undefined);
  }

  return { busy, canSubmit, changeCode, code, error, receipt, submit, userId };
}

export function CommunityJoinForm({ form }: { form: ReturnType<typeof useCommunityJoinForm> }) {
  const { t } = useAppTranslation();
  if (form.receipt) {
    const { status } = form.receipt;
    return (
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.ink, fontWeight: "800" }}>
          {t(status === "approved" ? "community.rooms.requestApproved" : status === "rejected" ? "community.rooms.requestRejected" : "community.encryption.requested")}
        </Text>
        {status === "pending" ? <>
          <Text style={{ color: colors.muted }}>{t("onboarding.journey.requestedDescription")}</Text>
          {form.userId ? <CommunityJoinFingerprint userId={form.userId} /> : null}
        </> : null}
        {status === "approved" ? <Text style={{ color: colors.muted }}>{t("community.rooms.requestApprovedBody")}</Text> : null}
      </View>
    );
  }

  const label = t("community.rooms.code");
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{t("community.rooms.enterCode")}</Text>
      <TextInputField
        accessibilityLabel={label}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!form.busy}
        value={form.code}
        onChangeText={form.changeCode}
        onSubmitEditing={form.submit}
        placeholder={label}
        returnKeyType="join"
      />
      <PrimaryButton disabled={form.busy || !form.canSubmit} onPress={form.submit}>
        {t(form.busy ? "onboarding.journey.working" : "onboarding.journey.request")}
      </PrimaryButton>
      {form.error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger, fontWeight: "800" }}>{t(form.error)}</Text>
      ) : null}
    </View>
  );
}
