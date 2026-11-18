import { View, type StyleProp, type ViewStyle } from "react-native";

import { shadcn } from "@/ui/theme";

export function Separator({
  orientation = "horizontal",
  style,
}: {
  orientation?: "horizontal" | "vertical";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: shadcn.border,
          height: orientation === "horizontal" ? 1 : "100%",
          width: orientation === "horizontal" ? "100%" : 1,
        },
        style,
      ]}
    />
  );
}
