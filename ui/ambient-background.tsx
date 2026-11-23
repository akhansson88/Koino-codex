import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { colors } from "@/ui/theme";

/**
 * 2.0 uses a flat paper canvas instead of moving gradient orbs. The component
 * stays as the single app-wide backdrop so future surface treatments (grain,
 * a faint top rule) have one place to live.
 */
export const AmbientBackground = memo(function AmbientBackground({ active = true }: { active?: boolean }) {
  void active;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />;
});
