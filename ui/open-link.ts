import { Alert } from "react-native";
import { emulatorMode } from "@/state/store/firebase";
import { emulatorExternalNetworkMessage } from "@/state/store/emulator-client-network";
import * as WebBrowser from "expo-web-browser";

export async function openLinkInApp(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  if (emulatorMode) { Alert.alert("KOINO Emulator", emulatorExternalNetworkMessage); return; }

  await WebBrowser.openBrowserAsync(trimmed, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
}
