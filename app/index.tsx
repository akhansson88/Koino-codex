import { Redirect } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { OnboardingScreen } from "@/features/onboarding-screen";
import { OnboardingJourney } from "@/features/onboarding-journey";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import { AppScreen, BodyText, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { useOnboardingProgress } from "@/ui/onboarding-progress";
import { colors } from "@/ui/theme";

export default function Index() {
  const state = useKoinoFields(["authReady", "currentUserId", "signOutIncomplete"]);
  const onboarding = useOnboardingProgress();
  const { t } = useAppTranslation();

  if (!state.authReady || (onboarding.pending && onboarding.userId !== state.currentUserId)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream }}>
        <ActivityIndicator accessibilityLabel={t("onboarding.loading")} color={colors.olive} />
      </View>
    );
  }

  if (state.currentUserId) {
    if (onboarding.pending) return <OnboardingJourney key={state.currentUserId} userId={state.currentUserId} />;
    return <Redirect href="/(tabs)" />;
  }

  return state.signOutIncomplete ? <SignOutRecovery /> : <OnboardingScreen />;
}

function SignOutRecovery() {
  const { dispatch } = useKoinoActions();
  const { t } = useAppTranslation();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await dispatch({ type: "signOut" });
    } catch {
      // Keep recovery available until Firebase confirms the session was removed.
    } finally {
      setRetrying(false);
    }
  }

  return (
    <AppScreen>
      <BodyText accessibilityRole="alert">{t("identity.account.logoutIncomplete")}</BodyText>
      <PrimaryButton disabled={retrying} onPress={retry}>
        {t(retrying ? "identity.account.loggingOut" : "identity.account.retryLogout")}
      </PrimaryButton>
    </AppScreen>
  );
}
