import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";

import { KoinoProvider, useKoino } from "@/state/koino-store";
import { colors, statusBarStyle } from "@/ui/theme";

const iosNativeBackGesture = Platform.OS === "ios";

export default function RootLayout() {
  return (
    <KoinoProvider>
      <RootNavigator />
    </KoinoProvider>
  );
}

function RootNavigator() {
  const { state } = useKoino();

  return (
    <>
      <StatusBar style={statusBarStyle(state.theme)} backgroundColor={colors.cream} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
          headerTitleStyle: { color: colors.ink, fontWeight: "700" },
          contentStyle: { backgroundColor: colors.cream },
          gestureEnabled: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="identity" options={{ gestureEnabled: iosNativeBackGesture, headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

