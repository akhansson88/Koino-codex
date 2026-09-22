import { AvatarButton, NotificationBellButton } from "@/ui/app-components";
import { colors, platformShadow, typography } from "@/ui/theme";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export function KoinoTabHeader() {
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
      <NotificationBellButton />
      <AvatarButton />
    </View>
  );
}
