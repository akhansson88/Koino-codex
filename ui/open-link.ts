import * as WebBrowser from "expo-web-browser";

export async function openLinkInApp(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;

  await WebBrowser.openBrowserAsync(trimmed, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
}
