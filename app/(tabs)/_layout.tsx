import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/ui/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.ink, fontWeight: "700" },
        tabBarActiveTintColor: colors.olive,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          height: 72,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} />
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
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
