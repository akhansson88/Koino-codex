import { Text, View } from "react-native";
import { BodyText, IconButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";

export function FocusedScreenHeader({ onBack, title }: { onBack: () => void; title: string }) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <IconButton accessibilityLabel={t("common.back")} icon="arrow-left" onPress={onBack} />
      <Text
        style={{ color: colors.ink, flex: 1, fontSize: 18, fontWeight: "900", marginHorizontal: 8, textAlign: "center" }}
      >
        {title}
      </Text>
      <View style={{ width: 38 }} />
    </View>
  );
}

export function FocusedCommunityScreenIntro({
  communityName,
  description,
  onBack,
  title,
}: {
  communityName: string;
  description: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <View style={{ gap: 10 }}>
      <FocusedScreenHeader onBack={onBack} title={communityName} />
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.ink }]}>
          {title}
        </Text>
        <BodyText muted>{description}</BodyText>
      </View>
    </View>
  );
}
