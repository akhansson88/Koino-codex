import type { PropsWithChildren } from "react";
import { Modal, type ModalProps } from "react-native";

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
  return (
    <Modal animationType={animationType} presentationStyle={presentationStyle} visible={visible} onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
