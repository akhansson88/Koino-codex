import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";

import { OnboardingScreen } from "@/features/onboarding-screen";
import { useKoino } from "@/state/koino-store";
import { brandPalette, colors } from "@/ui/theme";

export default function TabLayout() {
  const { state } = useKoino();

  if (state.ready && !state.currentUserId) {
    return <OnboardingScreen />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.olive,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700", marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 86 : 76,
          paddingBottom: Platform.OS === "ios" ? 24 : 12,
          paddingTop: 8,
          position: "absolute",
          shadowColor: brandPalette.deepNavy,
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.06,
          shadowRadius: 18,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? "leaf" : "leaf-outline"} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: "Journal",
          tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? "book" : "book-outline"} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Community",
          tabBarLabel: "Community",
          tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? "people" : "people-outline"} color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
