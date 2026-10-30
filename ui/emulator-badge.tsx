import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { emulatorMode } from "@/state/store/firebase";

// Always visible in the separate test binary, including account setup screens.
export function EmulatorBadge() {
  const insets = useSafeAreaInsets();
  if (!emulatorMode) return null;
  return <View pointerEvents="none" style={{ position: "absolute", top: insets.top + 2, alignSelf: "center", zIndex: 10000, backgroundColor: "#263528", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 }}>
    <Text accessibilityLabel="KOINO Emulator · demo-koino" style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}>KOINO Emulator · demo-koino</Text>
  </View>;
}
