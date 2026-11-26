import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ManualCodeEntry } from "@/features/community/join-manual-code";
import { JoinPreviewCard, useJoinPreview } from "@/features/community/join-preview";
import { JoinScanner } from "@/features/community/join-scanner";
import { AppHeader, AppScreen, BodyText, Card, SecondaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

export default function JoinScanRoute() {
  const { t } = useAppTranslation();
  const [code, setCode] = useState<string>();
  const preview = useJoinPreview(code);

  useEffect(() => {
    if (!preview.receipt?.joined) return;
    const timer = setTimeout(() => router.replace("/(tabs)" as never), 500);
    return () => clearTimeout(timer);
  }, [preview.receipt?.joined]);

  return (
    <AppScreen>
      <AppHeader showBack onBack={() => router.back()} />
      <View style={{ gap: 7 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>
          {t("community.join.scanTitle")}
        </Text>
        <BodyText muted>{t("community.join.scanSubtitle")}</BodyText>
      </View>

      {code ? (
        <>
          <JoinPreviewCard preview={preview} onCancel={() => setCode(undefined)} onOpen={() => router.replace("/(tabs)" as never)} />
          <SecondaryButton icon="camera" onPress={() => setCode(undefined)}>{t("community.join.scanAgain")}</SecondaryButton>
        </>
      ) : (
        <>
          <JoinScanner onCode={setCode} />
          <Card style={{ gap: 14 }}>
            <ManualCodeEntry onSubmit={setCode} />
          </Card>
        </>
      )}
    </AppScreen>
  );
}
