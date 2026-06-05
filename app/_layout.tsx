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
      <StatusBar style={statusBarStyle(state.theme)} backgroundColor={colors.cream} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
          headerTitleStyle: { color: colors.ink, fontWeight: "700" },
          contentStyle: { backgroundColor: colors.cream },
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

