import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

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
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        },
        headerLeft: () => <KoinoHeaderLogo />,
        headerRight: () => <HeaderRightControls />,
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerTitleAlign: "center",
        headerTitleStyle: { color: colors.ink, fontWeight: "700" },
        tabBarActiveTintColor: colors.olive,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          elevation: 8,
          height: 70,
          paddingTop: 8,
          shadowColor: brandPalette.deepNavy,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.1,
          shadowRadius: 18,
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

  if (!state.currentUserId) return null;

  const nextTheme = state.theme === "classic" ? "brand" : "classic";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => dispatch({ type: "setTheme", theme: nextTheme })}
      style={{
        backgroundColor: colors.elevated,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text selectable style={{ color: state.theme === "brand" ? colors.white : colors.ink, fontSize: 12, fontWeight: "700" }}>
        Theme: {state.theme === "brand" ? "Brand" : "Classic"}
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
