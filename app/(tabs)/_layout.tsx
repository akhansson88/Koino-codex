import { tabBarHeight } from "@/ui/navigation-layout";
import { KoinoTabHeader } from "@/ui/tab-header";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTranslation } from "@/ui/app-language";
import { colors, platformShadow, typography } from "@/ui/theme";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();

  return (
    <Tabs
      // Android can detach the nested Community stack during a push and leave
      // its content blank until the tab is reselected. Keep the tab host attached.
      detachInactiveScreens={Platform.OS !== "android"}
      screenOptions={{
        header: () => <KoinoTabHeader />,
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: `${colors.accentWarm}80`,
        tabBarBackground: () => <TabBarDockBackground bottomInset={insets.bottom} />,
        tabBarButton: (props) => <DockTabButton {...props} />,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          bottom: 0,
          height: tabBarHeight(insets.bottom),
          left: 0,
          paddingBottom: Math.max(insets.bottom, 8) + 12,
          paddingTop: 12,
          paddingHorizontal: 24,
          position: "absolute",
          right: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: { marginHorizontal: 2, minWidth: 0 },
        tabBarLabel: ({ children, color }) => (
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.2}
            minimumFontScale={0.85}
            numberOfLines={1}
            style={[typography.navLabel, styles.label, { color }]}
          >
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen
        name="bible"
        options={{
          headerShown: false,
          title: t("tabs.bible"),
          tabBarButtonTestID: "navigation-bible",
          tabBarAccessibilityLabel: t("tabs.bible"),
          tabBarIcon: ({ color }) => (
            <Feather name="book-open" color={color} size={25} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarButtonTestID: "navigation-home",
          tabBarAccessibilityLabel: t("tabs.home"),
          tabBarIcon: ({ color }) => (
            <Feather name="sun" color={color} size={25} />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: t("tabs.me"),
          tabBarButtonTestID: "navigation-me",
          tabBarAccessibilityLabel: t("tabs.me"),
          tabBarIcon: ({ color }) => (
            <Feather name="user" color={color} size={25} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          headerShown: false,
          title: t("tabs.community"),
          tabBarButtonTestID: "navigation-community",
          tabBarAccessibilityLabel: t("tabs.community"),
          tabBarIcon: ({ color }) => (
            <Feather name="users" color={color} size={25} />
          ),
        }}
      />
    </Tabs>
  );
}
function DockTabButton({ style, ...props }: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      android_ripple={{ borderless: false, color: colors.line }}
      pressOpacity={0.72}
      style={[style, styles.button]}
    />
  );
}

function TabBarDockBackground({ bottomInset }: { bottomInset: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.cream }]}>
      <View
        style={[styles.dock, { bottom: Math.max(bottomInset, 8) }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    ...StyleSheet.absoluteFillObject,
    left: 12,
    right: 12,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    ...platformShadow({
      boxShadow: "0 4px 14px rgba(11, 18, 32, 0.06)",
      elevation: 2,
      offset: { width: 0, height: 4 },
      opacity: 0.06,
      radius: 14,
    }),
  },
  button: {
    borderCurve: "continuous",
    borderRadius: 18,
    gap: 4,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 0,
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  label: {
    fontSize: 11,
    lineHeight: 15,
    flexShrink: 1,
    textAlign: "center",
  },
});
