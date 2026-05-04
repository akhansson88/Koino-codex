import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { useKoino } from "@/state/koino-store";
import { colors } from "@/ui/theme";

export default function TabLayout() {
  const { state } = useKoino();

  if (state.ready && !state.currentUserId) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerRight: () => <CurrentGroupIndicator />,
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

function CurrentGroupIndicator() {
  const { state } = useKoino();
  const group = state.groups.find((item) => item.id === state.currentGroupId);

  if (!state.currentUserId) return null;

  return (
    <View
      style={{
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        maxWidth: 170,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text numberOfLines={1} selectable style={{ color: colors.olive, fontSize: 12, fontWeight: "900" }}>
        {group?.name ?? "No group"}
      </Text>
    </View>
  );
}
