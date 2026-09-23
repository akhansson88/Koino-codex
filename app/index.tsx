import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { OnboardingScreen } from "@/features/onboarding-screen";
import { useKoinoFields } from "@/state/koino-store";
import { colors } from "@/ui/theme";

export default function Index() {
  const state = useKoinoFields(["authReady", "currentUserId"]);

  if (!state.authReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream }}>
        <ActivityIndicator color={colors.olive} />
      </View>
    );
  }

  if (state.currentUserId) {
    return <Redirect href="/(tabs)" />;
  }

  return <OnboardingScreen />;
}
