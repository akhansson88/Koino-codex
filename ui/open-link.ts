import { Alert } from "react-native";
import { developmentMode } from "@/state/store/firebase";
import * as WebBrowser from "expo-web-browser";

export async function openLinkInApp(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  if (developmentMode) {
    Alert.alert("KOINO Dev", "External links are disabled in KOINO Dev. / Externa länkar är avstängda i KOINO Dev.");
    return;
  }

  await WebBrowser.openBrowserAsync(trimmed, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
}
