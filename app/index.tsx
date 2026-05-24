import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { OnboardingScreen } from "@/features/onboarding-screen";
import { useKoino } from "@/state/koino-store";
import { colors } from "@/ui/theme";

export default function Index() {
  const { state } = useKoino();

  if (!state.ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream }}>
        <ActivityIndicator color={colors.olive} />
      </View>
    );
  }

  if (state.currentUserId) {
    return <Redirect href={(state.currentGroupId ? "/(tabs)" : "/(tabs)/room") as never} />;
  }

  return <OnboardingScreen />;
}
