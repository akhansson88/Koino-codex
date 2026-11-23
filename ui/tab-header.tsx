import { AvatarButton, NotificationBellButton } from "@/ui/app-components";
import { colors, typography } from "@/ui/theme";
import { useTheme } from "@/ui/theme-provider";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function KoinoTabHeader() {
  const insets = useSafeAreaInsets();
  useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderBottomColor: colors.line,
        borderBottomWidth: 1,
        paddingBottom: 12,
        paddingHorizontal: 24,
        paddingTop: insets.top + 8,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[typography.title, { color: colors.textPrimary, fontFamily: "Montserrat_500Medium", fontSize: 16, letterSpacing: 4.2, lineHeight: 22 }]}>
          KOINO
        </Text>
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
