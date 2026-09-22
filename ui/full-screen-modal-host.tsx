import { useReducedMotion } from "@/ui/use-reduced-motion";
import { OutsideSheet } from "@/ui/app-sheet";
import type { PropsWithChildren } from "react";
import { Modal, type ModalProps } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export type FullScreenModalHostProps = PropsWithChildren<
  Pick<ModalProps, "animationType" | "onRequestClose" | "presentationStyle" | "visible">
>;

export function FullScreenModalHost({
  animationType,
  children,
  onRequestClose,
  presentationStyle,
  visible,
}: FullScreenModalHostProps) {
  const reducedMotion = useReducedMotion();
  return (
    <Modal animationType={reducedMotion ? "none" : animationType} presentationStyle={presentationStyle} visible={visible} onRequestClose={onRequestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}><OutsideSheet>{children}</OutsideSheet></GestureHandlerRootView>
    </Modal>
  );
}
