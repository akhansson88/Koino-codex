import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Montserrat_300Light } from "@expo-google-fonts/montserrat/300Light";
import { Montserrat_400Regular } from "@expo-google-fonts/montserrat/400Regular";
import { Montserrat_500Medium } from "@expo-google-fonts/montserrat/500Medium";
import { Montserrat_600SemiBold } from "@expo-google-fonts/montserrat/600SemiBold";
import { ActivityIndicator, Platform, View } from "react-native";

import { KoinoProvider, useKoino } from "@/state/koino-store";
import { AppLanguageProvider } from "@/ui/app-language";
import { colors, statusBarStyle } from "@/ui/theme";

const enableNativeBackGesture = Platform.OS === "ios";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Montserrat_300Light,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return (
    <AppLanguageProvider>
      <KoinoProvider>
        <RootNavigator />
      </KoinoProvider>
    </AppLanguageProvider>
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
        <Stack.Screen
          name="identity"
          options={{
            animation: "none",
            contentStyle: { backgroundColor: "transparent" },
            gestureEnabled: false,
            headerShown: false,
            presentation: "transparentModal",
          }}
        />
        <Stack.Screen name="room-details" options={{ headerShown: false }} />
        <Stack.Screen name="bible-plans" options={{ headerShown: false }} />
        <Stack.Screen name="donation-amount" options={{ headerShown: false }} />
        <Stack.Screen name="donation-confirm" options={{ headerShown: false }} />
        <Stack.Screen name="donation-thank-you" options={{ headerShown: false }} />
        <Stack.Screen name="feed/[targetType]/[id]" options={{ headerBackButtonMenuEnabled: false, headerShown: false }} />
        <Stack.Screen name="me/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, headerShown: false }} />
      </Stack>
    </>
  );
}

 
