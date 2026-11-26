import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { JoinPreviewCard, useJoinPreview } from "@/features/community/join-preview";
import { ManualCodeEntry } from "@/features/community/join-manual-code";
import { parseJoinPayload } from "@/state/join-qr";
import { useKoinoFields } from "@/state/koino-store";
import { rememberPendingJoinCode } from "@/state/pending-join";
import { AppHeader, AppScreen, BodyText, Card, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { useOnboardingProgress } from "@/ui/onboarding-progress";
import { colors, typography } from "@/ui/theme";

export default function JoinRoute() {
  const { t } = useAppTranslation();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const raw = Array.isArray(params.code) ? params.code[0] : params.code;
  const deepLinked = useMemo(() => parseJoinPayload(raw), [raw]);
  const [code, setCode] = useState<string | undefined>(deepLinked);
  const { authReady, currentUserId } = useKoinoFields(["authReady", "currentUserId"]);
  const onboarding = useOnboardingProgress();
  const needsAccount = authReady && (!currentUserId || onboarding.pending);
  const preview = useJoinPreview(code, !needsAccount && Boolean(currentUserId));

  // A deep link can arrive before sign-in or during onboarding: keep the code
  // and come back here once the account is ready.
  useEffect(() => {
    if (!needsAccount) return;
    rememberPendingJoinCode(code ?? deepLinked);
    router.replace("/" as never);
  }, [code, deepLinked, needsAccount]);

  useEffect(() => {
    if (!preview.receipt?.joined) return;
    const timer = setTimeout(() => router.replace("/(tabs)" as never), 500);
    return () => clearTimeout(timer);
  }, [preview.receipt?.joined]);

  if (needsAccount || !authReady) {
    return (
      <View style={{ alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <AppScreen>
      <AppHeader showBack onBack={() => router.back()} />
      <View style={{ gap: 7 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>
          {t("community.join.title")}
        </Text>
        <BodyText muted>{t("community.join.subtitle")}</BodyText>
      </View>

      {code ? (
        <JoinPreviewCard preview={preview} onCancel={() => setCode(undefined)} onOpen={() => router.replace("/(tabs)" as never)} />
      ) : (
        <Card style={{ gap: 16 }}>
          <ManualCodeEntry onSubmit={setCode} />
          <SecondaryButton icon="camera" onPress={() => router.push("/join-scan" as never)}>
            {t("community.join.scan")}
          </SecondaryButton>
        </Card>
      )}
    </AppScreen>
  );
}
