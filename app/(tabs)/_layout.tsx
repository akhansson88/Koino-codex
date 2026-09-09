import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingScreen } from "@/features/onboarding-screen";
import { useKoino } from "@/state/koino-store";
import { AvatarButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, platformShadow, typography, type ThemeName } from "@/ui/theme";

export default function TabLayout() {
  const { state } = useKoino();
  const { t } = useAppTranslation();

  if (state.authReady && !state.currentUserId) {
    return <OnboardingScreen />;
  }

  return (
    <Tabs
      screenOptions={{
        header: () => <KoinoTabHeader />,
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.olive,
        tabBarInactiveTintColor: colors.muted,
        tabBarBackground: () => <TabBarGlassBackground theme={state.theme} />,
        tabBarStyle: {
          backgroundColor:
            Platform.OS === "web"
              ? state.theme === "dark"
                ? "rgba(17, 26, 44, 0.28)"
                : "rgba(255, 255, 255, 0.22)"
              : "transparent",
          borderRadius: 0,
          borderTopColor: state.theme === "dark" ? "rgba(255, 255, 255, 0.36)" : "rgba(255, 255, 255, 0.95)",
          borderTopWidth: 1,
          bottom: -10,
          height: 86,
          left: 0,
          paddingBottom: 22,
          paddingTop: 8,
          position: "absolute",
          right: 0,
          ...platformShadow({
            boxShadow:
              state.theme === "dark"
                ? "0 18px 42px rgba(0, 0, 0, 0.36)"
                : "0 18px 42px rgba(11, 18, 32, 0.16)",
            elevation: 12,
            offset: { width: 0, height: 12 },
            opacity: state.theme === "dark" ? 0.34 : 0.16,
            radius: 26,
          }),
          ...(Platform.OS === "web"
            ? {
                WebkitBackdropFilter: "blur(34px) saturate(220%) contrast(115%)",
                backdropFilter: "blur(34px) saturate(220%) contrast(115%)",
                boxShadow:
                  state.theme === "dark"
                    ? "inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -1px 0 rgba(255,255,255,0.06), 0 18px 42px rgba(0,0,0,0.36)"
                    : "inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(255,255,255,0.34), 0 18px 42px rgba(11,18,32,0.16)",
              }
            : {}),
        },
        tabBarLabelStyle: typography.navLabel,
      }}
    >
      <Tabs.Screen
        name="bible"
        options={{
          headerShown: false,
          title: t("tabs.bible"),
          tabBarLabel: t("tabs.bible"),
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "library" : "library-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarLabel: t("tabs.home"),
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "sunny" : "sunny-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: t("tabs.me"),
          tabBarLabel: t("tabs.me"),
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "person" : "person-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t("tabs.community"),
          tabBarLabel: t("tabs.community"),
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "people" : "people-outline"} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
function TabBarGlassBackground({ theme }: { theme: ThemeName }) {
  if (Platform.OS === "web") return null;

  const isDark = theme === "dark";

  return (
    <BlurView
      blurReductionFactor={2}
      experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : "none"}
      intensity={90}
      tint={isDark ? "systemMaterialDark" : "systemMaterial"}
      style={{
        ...StyleSheet.absoluteFillObject,
        borderRadius: 0,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: isDark ? "rgba(17, 26, 44, 0.34)" : "rgba(255, 255, 255, 0.28)",
          borderTopColor: isDark ? "rgba(255, 255, 255, 0.28)" : "rgba(255, 255, 255, 0.88)",
          borderTopWidth: 1,
        }}
      />
    </BlurView>
  );
}
function KoinoTabHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: colors.cream,
        paddingBottom: 14,
        paddingHorizontal: 18,
        paddingTop: insets.top + 12,
        ...platformShadow({
          boxShadow: "0 4px 12px rgba(11, 18, 32, 0.04)",
          offset: { width: 0, height: 4 },
          opacity: 0.04,
          radius: 12,
        }),
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[typography.title, { color: colors.textPrimary, fontSize: 24, lineHeight: 30 }]}>KOINO</Text>
        <HeaderRightControls />
      </View>
    </View>
  );
}

function HeaderRightControls() {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
      <AvatarButton />
    </View>
  );
}
