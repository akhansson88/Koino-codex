import { tabBarHeight } from "@/ui/navigation-layout";
import { KoinoTabHeader } from "@/ui/tab-header";
import { Feather } from "@expo/vector-icons";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedDockBackground, AnimatedDockTabBar, DockTabButton } from "@/ui/animated-dock-tab-bar";
import { useAppTranslation } from "@/ui/app-language";
import { colors, typography } from "@/ui/theme";
import { useReducedMotion } from "@/ui/use-reduced-motion";

const sceneStyleInterpolator: NonNullable<BottomTabNavigationOptions["sceneStyleInterpolator"]> = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
    transform: [{
      translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-12, 0, 12] }),
    }],
  },
});

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const reducedMotion = useReducedMotion();

  return (
    <Tabs
      // Android can detach the nested Community stack during a push and leave
      // its content blank until the tab is reselected. Keep the tab host attached.
      detachInactiveScreens={Platform.OS !== "android"}
      tabBar={(props) => <AnimatedDockTabBar {...props} reducedMotion={reducedMotion} />}
      screenOptions={{
        animation: reducedMotion ? "none" : "fade",
        sceneStyleInterpolator: reducedMotion ? undefined : sceneStyleInterpolator,
        transitionSpec: reducedMotion ? undefined : {
          animation: "timing",
          config: { duration: 220 },
        },
        header: () => <KoinoTabHeader />,
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: "transparent",
        tabBarBackground: () => <AnimatedDockBackground />,
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

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    lineHeight: 15,
    flexShrink: 1,
    textAlign: "center",
  },
});
