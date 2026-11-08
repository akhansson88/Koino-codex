import { Feather } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { OnboardingPage } from "@/features/onboarding-screen";
import { CommunityJoinFingerprint } from "@/features/community/join-requests";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import type { OnboardingChoice } from "@/state/onboarding-progress";
import { Card, PrimaryButton, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import type { TranslationKey } from "@/ui/localization";
import { useOnboardingProgress } from "@/ui/onboarding-progress";
import { colors, typography } from "@/ui/theme";

const guideItems = [
  { title: "onboarding.guide.scripture", body: "onboarding.guide.scriptureBody", icon: "book-open", tint: "warmSoft" },
  { title: "onboarding.guide.prayer", body: "onboarding.guide.prayerBody", icon: "heart", tint: "prayerSoft" },
  { title: "tabs.me", body: "onboarding.guide.meBody", icon: "book", tint: "reflectionSoft" },
  { title: "tabs.community", body: "onboarding.guide.communityBody", icon: "users", tint: "rhythmSoft" },
] as const;

export function OnboardingGuide({ userId, journey }: { userId: string; journey: OnboardingChoice }) {
  const { t } = useAppTranslation();
  const { dispatch } = useKoinoActions();
  const { complete } = useOnboardingProgress();
  useKoinoFields(["theme"]);
  const [pending, setPending] = useState<"complete" | "signOut">();
  const [error, setError] = useState<TranslationKey>();
  const running = useRef(false);

  async function finish(action: "complete" | "signOut") {
    if (running.current) return;
    running.current = true;
    setPending(action);
    setError(undefined);
    try {
      if (action === "complete") await complete(userId);
      else await dispatch({ type: "signOut", expectedUserId: userId });
    } catch {
      setError(action === "complete" ? "onboarding.journey.continueFailed" : "identity.account.logoutError");
    } finally {
      running.current = false;
      setPending(undefined);
    }
  }

  const joining = journey === "join";
  const alreadyApproved = journey === "joinApproved";
  return (
    <OnboardingPage>
      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>{t("onboarding.guide.title")}</Text>
        <Text style={[typography.body, { color: colors.muted }]}>{t("onboarding.guide.description")}</Text>
      </View>
      {journey !== "private" ? (
        <Card style={{ gap: 5 }}>
          <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink }]}>
            {t(joining ? "community.encryption.requested" : alreadyApproved ? "community.rooms.requestApproved" : "community.rooms.created")}
          </Text>
          <Text style={[typography.body, { color: colors.muted }]}>
            {t(joining ? "onboarding.journey.requestedDescription" : alreadyApproved ? "community.rooms.requestApprovedBody" : "onboarding.journey.createdDescription")}
          </Text>
          {joining ? <CommunityJoinFingerprint userId={userId} /> : null}
        </Card>
      ) : null}
      <Card>
        <View role="list" style={{ gap: 16 }}>
          {guideItems.map(({ title, body, icon, tint }) => (
            <View key={title} role="listitem" style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
              <View
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ alignItems: "center", backgroundColor: colors[tint], borderRadius: 18, height: 36, justifyContent: "center", width: 36 }}
              >
                <Feather name={icon} size={18} color={colors.ink} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[typography.label, { color: colors.ink }]}>{t(title)}</Text>
                <Text style={[typography.body, { color: colors.muted }]}>{t(body)}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[typography.body, { color: colors.danger }]}>
          {t(error)}
        </Text>
      ) : null}
      <PrimaryButton disabled={Boolean(pending)} onPress={() => void finish("complete")}>
        {t(pending === "complete" ? "onboarding.journey.working" : "onboarding.guide.home")}
      </PrimaryButton>
      <SecondaryButton disabled={Boolean(pending)} icon="log-out" onPress={() => void finish("signOut")}>
        {t(pending === "signOut" ? "identity.account.loggingOut" : "onboarding.journey.signOut")}
      </SecondaryButton>
    </OnboardingPage>
  );
}
