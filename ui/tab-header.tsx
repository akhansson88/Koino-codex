import { AvatarButton, NotificationBellButton } from "@/ui/app-components";
import { colors, shadows, shadcn, typography } from "@/ui/theme";
import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function KoinoTabHeader() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={["#FFFCF7", "#FFF2E4"]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={{
        borderBottomColor: shadcn.border,
        borderBottomWidth: 1,
        paddingBottom: 12,
        paddingHorizontal: 18,
        paddingTop: insets.top + 8,
        ...shadows.control,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[typography.title, { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 22, letterSpacing: 2.4, lineHeight: 28 }]}>
          KOINO
        </Text>
        <HeaderRightControls />
      </View>
    </LinearGradient>
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
