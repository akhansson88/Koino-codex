import { Alert, Platform } from "react-native";

type ConfirmActionOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

export function confirmAction({
  title,
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmActionOptions) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    } else {
      onCancel?.();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: cancelText, style: "cancel", onPress: onCancel },
    {
      text: confirmText,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
}
