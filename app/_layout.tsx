import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { KoinoProvider, useKoino } from "@/state/koino-store";
import { colors, statusBarStyle } from "@/ui/theme";

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
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="identity" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

