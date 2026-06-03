import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";

import { KoinoProvider, useKoino } from "@/state/koino-store";
import { colors, statusBarStyle } from "@/ui/theme";

const enableNativeBackGesture = Platform.OS === "ios";

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
      <StatusBar style={statusBarStyle(state.theme)} backgroundColor={colors.background.app} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background.app },
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
          headerTitleStyle: { color: colors.text.primary, fontWeight: "700" },
          contentStyle: { backgroundColor: colors.background.app },
          gestureEnabled: enableNativeBackGesture,
        }}
      >
        <Stack.Screen name="index" options={{ gestureEnabled: false, headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ gestureEnabled: false, headerShown: false }} />
        <Stack.Screen name="identity" options={{ headerShown: false }} />
        <Stack.Screen name="room-details" options={{ headerShown: false }} />
        <Stack.Screen name="feed/[targetType]/[id]" options={{ headerBackButtonMenuEnabled: false, headerShown: false }} />
        <Stack.Screen name="me/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, headerShown: false }} />
      </Stack>
    </>
  );
}

