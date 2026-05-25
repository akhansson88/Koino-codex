import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";

export async function openLinkInApp(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (Platform.OS === "web") {
    await Linking.openURL(trimmed);
    return;
  }

  await WebBrowser.openBrowserAsync(trimmed, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
}
