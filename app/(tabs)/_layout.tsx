import { Tabs, router } from "expo-router";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingScreen } from "@/features/onboarding-screen";
import { useKoino } from "@/state/koino-store";
import { Avatar } from "@/ui/app-components";
import { brandPalette, colors, platformShadow, type ThemeName } from "@/ui/theme";

export default function TabLayout() {
  const { state } = useKoino();

  if (state.ready && !state.currentUserId) {
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
        tabBarLabelStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="bible"
        options={{
          title: "Bible",
          tabBarLabel: "Bible",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "library" : "library-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarLabel: "Today",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "leaf" : "leaf-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: "Journal",
          tabBarLabel: "Journal",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "book" : "book-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Room",
          tabBarLabel: "Room",
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
        <Text style={{ color: colors.olive, fontSize: 24, fontWeight: "900", letterSpacing: 3 }}>KOINO</Text>
        <HeaderRightControls />
      </View>
    </View>
  );
}

function HeaderRightControls() {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
      <ThemeSelector />
      <IdentityButton />
    </View>
  );
}

function ThemeSelector() {
  const { state, dispatch } = useKoino();
  const progress = useRef(new Animated.Value(state.theme === "dark" ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      toValue: state.theme === "dark" ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [progress, state.theme]);

  const isNight = state.theme === "dark";
  const nextTheme = state.theme === "light" ? "dark" : "light";
  const trackBackground = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["#FFF4D8", "#172237"],
  });
  const thumbTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 38],
  });

  if (!state.currentUserId) return null;

  return (
    <Pressable
      accessibilityLabel={`Switch to ${isNight ? "light" : "night"} mode`}
      accessibilityRole="button"
      accessibilityState={{ checked: isNight }}
      onPress={() => dispatch({ type: "setTheme", theme: nextTheme })}
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: 8,
      }}
    >
      <Animated.View
        style={{
          alignItems: "center",
          backgroundColor: trackBackground,
          borderColor: colors.line,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          height: 34,
          justifyContent: "space-between",
          paddingHorizontal: 8,
          width: 74,
        }}
      >
        <Ionicons name="sunny" color="#B86B17" size={15} />
        <Ionicons name="moon" color="#D6D9EA" size={14} />
        <Animated.View
          style={{
            alignItems: "center",
            backgroundColor: isNight ? colors.cream : colors.paper,
            borderRadius: 999,
            height: 28,
            justifyContent: "center",
            left: 2,
            position: "absolute",
            ...platformShadow({
              boxShadow: "0 2px 5px rgba(11, 18, 32, 0.16)",
              offset: { width: 0, height: 2 },
              opacity: 0.16,
              radius: 5,
            }),
            transform: [{ translateX: thumbTranslate }],
            width: 32,
          }}
        >
          <Ionicons name={isNight ? "moon" : "sunny"} color={isNight ? brandPalette.warmPeach : "#B86B17"} size={16} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function IdentityButton() {
  const { state } = useKoino();
  const user = state.users.find((item) => item.id === state.currentUserId);

  if (!state.currentUserId) return null;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open identity and support" onPress={() => router.push("/identity" as never)}>
      <Avatar name={user?.name ?? state.authEmail ?? "K"} size={38} tone="pink" />
    </Pressable>
  );
}
