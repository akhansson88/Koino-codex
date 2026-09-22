import { useReducedMotion } from "@/ui/use-reduced-motion";
import { InAppBrowserProvider } from "@/ui/in-app-browser";
import { KoinoTabHeader } from "@/ui/tab-header";
import { colors } from "@/ui/theme";
import { Stack } from "expo-router";
import { Platform } from "react-native";

export const unstable_settings = { initialRouteName: "index" };
export default function CommunityLayout() {
  const reducedMotion = useReducedMotion();
  return (
    <InAppBrowserProvider>
      <Stack
        screenOptions={{
          animation: reducedMotion ? "none" : "default",
          header: () => <KoinoTabHeader />,
          contentStyle: { backgroundColor: colors.cream },
          gestureEnabled: Platform.OS === "ios",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="rooms" />
        <Stack.Screen name="members" />
        <Stack.Screen name="prayer" options={{ headerShown: false }} />
        <Stack.Screen name="checkins" options={{ headerShown: false }} />
        <Stack.Screen name="prayerMomentDetail" />
      </Stack>
    </InAppBrowserProvider>
  );
}
