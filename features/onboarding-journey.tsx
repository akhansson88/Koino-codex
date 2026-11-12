import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { OnboardingPage } from "@/features/onboarding-screen";
import type { JoinRequestReceipt } from "@/state/community-join-requests";
import { useKoinoActions } from "@/state/koino-store";
import type { OnboardingChoice } from "@/state/onboarding-progress";
import { Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { Field } from "@/ui/components";
import type { TranslationKey } from "@/ui/localization";
import { useOnboardingProgress } from "@/ui/onboarding-progress";
import { colors, typography } from "@/ui/theme";

const receiptChoices = { requested: "join", approved: "joinApproved", created: "create" } as const;
type JourneyStep = "choice" | "join" | "create" | keyof typeof receiptChoices;

const stepCopy = {
  choice: { title: "onboarding.journey.title", body: "onboarding.journey.description" },
  join: { title: "onboarding.journey.join", body: "onboarding.journey.joinDescription" },
  create: { title: "onboarding.journey.create", body: "onboarding.journey.createDescription" },
  requested: { title: "community.encryption.requested", body: "onboarding.journey.requestedDescription" },
  approved: { title: "community.rooms.requestApproved", body: "community.rooms.requestApprovedBody" },
  created: { title: "community.rooms.created", body: "onboarding.journey.createdDescription" },
} satisfies Record<JourneyStep, { title: TranslationKey; body: TranslationKey }>;

export function OnboardingJourney({ userId }: { userId: string }) {
  const { t } = useAppTranslation();
  const { dispatch } = useKoinoActions();
  const { chooseJourney } = useOnboardingProgress();
  const [step, setStep] = useState<JourneyStep>("choice");
  const [value, setValue] = useState("");
  const [error, setError] = useState<TranslationKey>();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const isJoin = step === "join";
  const canSubmit = value.trim().length >= (isJoin ? 3 : 1);
  const { title, body } = stepCopy[step];

  function changeStep(next: JourneyStep) {
    if (running.current) return;
    setError(undefined);
    setValue("");
    setStep(next);
  }

  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function continueOnboarding(choice: OnboardingChoice) {
    try {
      await chooseJourney(userId, choice);
    } catch {
      setError("onboarding.journey.continueFailed");
    }
  }

  function submitCommunity() {
    if ((step !== "join" && step !== "create") || !canSubmit) return;
    void run(async () => {
      let receipt: JoinRequestReceipt | undefined;
      try {
        await dispatch(isJoin
          ? { type: "joinGroup", inviteCode: value, expectedUserId: userId, report: (result) => { receipt = result; } }
          : { type: "createGroup", name: value, expectedUserId: userId });
        if (isJoin && !receipt) throw new Error("The community access request could not be confirmed.");
      } catch (problem) {
        const code = problem && typeof problem === "object" && "code" in problem ? problem.code : undefined;
        setError(isJoin
          ? (code === "functions/not-found" ? "community.error.inviteNotFound" : "onboarding.journey.joinFailed")
          : "onboarding.journey.createFailed");
        return;
      }
      if (receipt?.status === "rejected") {
        setError("community.rooms.requestRejected");
        return;
      }
      const nextStep = isJoin ? (receipt?.status === "approved" ? "approved" : "requested") : "created";
      setValue("");
      setStep(nextStep);
      await continueOnboarding(receiptChoices[nextStep]);
    });
  }

  function signOut() {
    void run(async () => {
      try {
        await dispatch({ type: "signOut", expectedUserId: userId });
      } catch {
        setError("identity.account.logoutError");
      }
    });
  }

  const fieldLabel = t(isJoin ? "community.rooms.code" : "onboarding.journey.name");
  const continueLabel = t(busy ? "onboarding.journey.working" : "onboarding.journey.continue");

  return (
    <OnboardingPage>
      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{t(title)}</Text>
        <Text style={[typography.body, { color: colors.muted }]}>{t(body)}</Text>
      </View>
      {step === "choice" ? (
        <>
          <PrimaryButton disabled={busy} icon="lock" onPress={() => void run(() => continueOnboarding("private"))}>
            {t("onboarding.journey.private")}
          </PrimaryButton>
          <SecondaryButton disabled={busy} icon="user-plus" onPress={() => changeStep("join")}>
            {t("onboarding.journey.join")}
          </SecondaryButton>
          <SecondaryButton disabled={busy} icon="plus" onPress={() => changeStep("create")}>
            {t("onboarding.journey.create")}
          </SecondaryButton>
        </>
      ) : step === "join" || step === "create" ? (
        <>
          <Card>
            <Text style={[typography.label, { color: colors.ink }]}>{fieldLabel}</Text>
            <Field
              accessibilityLabel={fieldLabel}
              autoCapitalize={isJoin ? "characters" : "sentences"}
              autoCorrect={!isJoin}
              editable={!busy}
              onChangeText={(next) => {
                setError(undefined);
                setValue(isJoin ? next.toUpperCase() : next);
              }}
              onSubmitEditing={submitCommunity}
              returnKeyType={isJoin ? "join" : "done"}
              value={value}
            />
          </Card>
          <PrimaryButton disabled={busy || !canSubmit} onPress={submitCommunity}>
            {t(busy ? "onboarding.journey.working" : isJoin ? "onboarding.journey.request" : "onboarding.journey.create")}
          </PrimaryButton>
          <SecondaryButton disabled={busy} onPress={() => changeStep("choice")}>{t("common.cancel")}</SecondaryButton>
        </>
      ) : (
        <PrimaryButton disabled={busy} onPress={() => void run(() => continueOnboarding(receiptChoices[step]))}>
          {continueLabel}
        </PrimaryButton>
      )}
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[typography.body, { color: colors.danger }]}>
          {t(error)}
        </Text>
      ) : null}
      <SecondaryButton disabled={busy} icon="log-out" onPress={signOut}>{t("onboarding.journey.signOut")}</SecondaryButton>
    </OnboardingPage>
  );
}
