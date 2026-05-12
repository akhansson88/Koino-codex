import { Image } from "react-native";
import type { ImageStyle, StyleProp } from "react-native";

const koinoLogo = require("../koino-logo.png");

export function KoinoLogo({ size = 96, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      accessibilityLabel="KOINO logo"
      resizeMode="contain"
      source={koinoLogo}
      style={[{ height: size, width: size }, style]}
    />
  );
}
