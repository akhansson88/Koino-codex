import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { KoinoLogo } from "@/ui/koino-logo";
import { brandPalette, colors } from "@/ui/theme";

export default function TabLayout() {
  const { state } = useKoino();

  if (state.ready && !state.currentUserId) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.cream,
          elevation: 0,
          height: 110,
          shadowColor: brandPalette.deepNavy,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
        },
        headerLeft: () => <KoinoHeaderLogo />,
        headerRight: () => <HeaderRightControls />,
        headerTitle: "",
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.olive,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          elevation: 4,
          height: 70,
          paddingTop: 8,
          shadowColor: brandPalette.deepNavy,
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        tabBarLabelStyle: { fontWeight: "700" },
      }}
    >
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

function KoinoHeaderLogo() {
  return <KoinoLogo size={48} style={{ marginLeft: 16, marginVertical: 8 }} />;
}

function HeaderRightControls() {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 8, marginRight: 16 }}>
      <ThemeSelector />
      <CurrentGroupIndicator />
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
            shadowColor: brandPalette.deepNavy,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.16,
            shadowRadius: 5,
            transform: [{ translateX: thumbTranslate }],
            width: 32,
          }}
        >
          <Ionicons name={isNight ? "moon" : "sunny"} color={isNight ? brandPalette.warmPeach : "#B86B17"} size={16} />
        </Animated.View>
      </Animated.View>
      <Text selectable style={{ color: colors.ink, fontSize: 12, fontWeight: "700", minWidth: 36 }}>
        {isNight ? "Night" : "Light"}
      </Text>
    </Pressable>
  );
}

function CurrentGroupIndicator() {
  const { state } = useKoino();
  const group = state.groups.find((item) => item.id === state.currentGroupId);

  if (!state.currentUserId) return null;

  return (
    <View
      style={{
        backgroundColor: colors.elevated,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        maxWidth: 170,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text numberOfLines={1} selectable style={{ color: colors.olive, fontSize: 12, fontWeight: "700" }}>
        {group?.name ?? "No group"}
      </Text>
    </View>
  );
}
