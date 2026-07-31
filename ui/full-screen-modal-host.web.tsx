import type { PropsWithChildren } from "react";
// @ts-expect-error React DOM's runtime is installed for Expo web, but this project does not include its optional type package.
import { createPortal } from "react-dom";
import { View, type ModalProps, type ViewStyle } from "react-native";

import { colors } from "@/ui/theme";

const webFixedPosition = "fixed" as ViewStyle["position"];
type FullScreenModalHostProps = PropsWithChildren<
  Pick<ModalProps, "animationType" | "onRequestClose" | "presentationStyle" | "visible">
>;

export function FullScreenModalHost({ children, visible }: FullScreenModalHostProps) {
  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <View
      accessibilityViewIsModal
      style={{
        backgroundColor: colors.cream,
        bottom: 0,
        left: 0,
        position: webFixedPosition,
        right: 0,
        top: 0,
        zIndex: 9999,
      }}
    >
      {children}
    </View>,
    document.body,
  );
}
