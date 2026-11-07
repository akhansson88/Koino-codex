import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export function chapterSelectionHaptic() {
  const feedback = Platform.OS === "android"
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
    : Platform.OS === "ios" ? Haptics.selectionAsync() : undefined;
  void feedback?.catch(() => undefined);
}
