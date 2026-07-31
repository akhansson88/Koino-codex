import { ActivityIndicator, Text, View } from "react-native";

import type { GroupImage } from "@/state/types";
import { Avatar, BodyText, BottomSheet, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors } from "@/ui/theme";

export type DirectPrayerResult = {
  recipientImage?: GroupImage;
  recipientName: string;
  status: "saving" | "completed" | "failed";
};

export function DirectPrayerResultSheet({
  onDone,
  result,
}: {
  onDone: () => void;
  result?: DirectPrayerResult;
}) {
  const { t } = useAppTranslation();
  const saving = result?.status === "saving";

  return (
    <BottomSheet
      onClose={() => {
        if (!saving) onDone();
      }}
      title={t("community.prayer.resultTitle")}
      visible={Boolean(result)}
    >
      {saving ? (
        <View
          accessibilityLabel={t("community.prayer.directSaving")}
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
          style={{ alignItems: "center", gap: 12, paddingVertical: 18 }}
        >
          <ActivityIndicator color={colors.olive} />
          <BodyText muted>{t("community.prayer.directSaving")}</BodyText>
        </View>
      ) : result ? (
        <>
          <View style={{ alignItems: "center", gap: 14, paddingVertical: 12 }}>
            <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
              <Avatar image={result.recipientImage} name={result.recipientName} size={64} tone="green" />
            </View>
            {result.status === "completed" ? (
              <Text
                accessibilityLiveRegion="polite"
                accessibilityRole="header"
                style={{ color: colors.ink, fontSize: 24, fontWeight: "900", lineHeight: 32, textAlign: "center" }}
              >
                {t("community.prayer.directCompleted", { name: result.recipientName })}
              </Text>
            ) : (
              <BodyText accessibilityLiveRegion="assertive" accessibilityRole="alert" muted style={{ textAlign: "center" }}>
                {t("community.prayer.directSaveError")}
              </BodyText>
            )}
          </View>
          <PrimaryButton onPress={onDone}>{t("common.done")}</PrimaryButton>
        </>
      ) : null}
    </BottomSheet>
  );
}
