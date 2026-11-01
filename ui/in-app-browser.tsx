import { emulatorMode } from "@/state/store/firebase";
import { AppSheet, type AppSheetHandle } from "@/ui/app-sheet";
import { Feather } from "@expo/vector-icons";
import {
createContext,
type PropsWithChildren,
useCallback,
useContext,
useEffect,
useRef,
useState
} from "react";
import {
Alert,
Linking,
Pressable,
Text,
useWindowDimensions,
View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { useAppTranslation } from "@/ui/app-language";
import { normalizeUrl } from "@/ui/link-utils";
import { openLinkInApp } from "@/ui/open-link";
import { colors, typography } from "@/ui/theme";

type OpenExternalLink = (url: string) => void;

type BrowserSession = {
  id: number;
  url: string;
};

const defaultOpenExternalLink: OpenExternalLink = (url) => {
  void openLinkInApp(url);
};

const InAppBrowserContext = createContext<OpenExternalLink>(defaultOpenExternalLink);

export function normalizeExternalHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!/^(https?:\/\/|www\.)/i.test(trimmed)) return "";
  return normalizeUrl(trimmed);
}

export function domainForExternalUrl(value: string, fallback = "Website") {
  try {
    return new URL(value).hostname.replace(/^www\./i, "") || fallback;
  } catch {
    return fallback;
  }
}

function isSameExternalDocument(left: string, right: string) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    leftUrl.hash = "";
    rightUrl.hash = "";
    return leftUrl.toString() === rightUrl.toString();
  } catch {
    return false;
  }
}

export function useOpenExternalLink() {
  return useContext(InAppBrowserContext);
}

export function InAppBrowserProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<BrowserSession>();
  const [currentUrl, setCurrentUrl] = useState("");
  const [loadUrl, setLoadUrl] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const openExternalLink = useCallback<OpenExternalLink>((value) => {
    if (emulatorMode) { void openLinkInApp(value); return; }
    const url = normalizeExternalHttpUrl(value);

    if (!url) {
      void openLinkInApp(value);
      return;
    }

    setSession({ id: Date.now(), url });
    setCurrentUrl(url);
    setLoadUrl(url);
    setAttempt(0);
    setLoading(true);
    setProgress(0);
    setLoadError(false);
  }, []);

  const close = useCallback(() => {
    setSession(undefined);
    setCurrentUrl("");
    setLoadUrl("");
    setAttempt(0);
    setLoading(false);
    setProgress(0);
    setLoadError(false);
  }, []);

  const retry = useCallback(() => {
    if (!session) return;
    setLoadUrl(currentUrl || session.url);
    setAttempt((value) => value + 1);
    setLoading(true);
    setProgress(0);
    setLoadError(false);
  }, [currentUrl, session]);

  return (
    <InAppBrowserContext.Provider value={openExternalLink}>
      {children}
      <InAppBrowserSheet
        attempt={attempt}
        currentUrl={currentUrl}
        loadError={loadError}
        loading={loading}
        loadUrl={loadUrl}
        onClose={close}
        onError={(url) => {
          if (normalizeExternalHttpUrl(url)) setCurrentUrl(url);
          setLoading(false);
          setLoadError(true);
        }}
        onLoadEnd={() => {
          setLoading(false);
          setProgress(1);
        }}
        onLoadProgress={setProgress}
        onLoadStart={() => {
          setLoading(true);
          setProgress(0.04);
          setLoadError(false);
        }}
        onNavigate={(url) => {
          if (normalizeExternalHttpUrl(url)) setCurrentUrl(url);
        }}
        onRetry={retry}
        progress={progress}
        session={session}
      />
    </InAppBrowserContext.Provider>
  );
}

function InAppBrowserSheet({
  attempt,
  currentUrl,
  loadError,
  loading,
  loadUrl,
  onClose,
  onError,
  onLoadEnd,
  onLoadProgress,
  onLoadStart,
  onNavigate,
  onRetry,
  progress,
  session,
}: {
  attempt: number;
  currentUrl: string;
  loadError: boolean;
  loading: boolean;
  loadUrl: string;
  onClose: () => void;
  onError: (url: string) => void;
  onLoadEnd: () => void;
  onLoadProgress: (progress: number) => void;
  onLoadStart: () => void;
  onNavigate: (url: string) => void;
  onRetry: () => void;
  progress: number;
  session?: BrowserSession;
}) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const sheetRef = useRef<AppSheetHandle>(null);
  const activeDocumentUrlRef = useRef(currentUrl || session?.url || "");
  const sheetHeight = height - Math.max(insets.top + 26, 58);
  const visible = Boolean(session);
  const closeWithAnimation = useCallback(() => sheetRef.current?.dismiss(), []);

  useEffect(() => {
    activeDocumentUrlRef.current = currentUrl || session?.url || "";
  }, [currentUrl, session?.url]);

  const displayedUrl = currentUrl || session?.url || "";
  const domain = domainForExternalUrl(displayedUrl, t("shared.browser.website"));
  const progressWidth = `${Math.round(Math.max(0.04, Math.min(progress, 1)) * 100)}%` as `${number}%`;

  function openInExternalBrowser() {
    if (emulatorMode) { void openLinkInApp(displayedUrl); return; }
    const externalUrl = normalizeExternalHttpUrl(displayedUrl);
    if (!externalUrl) return;
    void Linking.openURL(externalUrl).catch(() => {
      Alert.alert(t("shared.browser.openErrorTitle"), t("shared.browser.openErrorBody"));
    });
  }

  function shouldStartRequest(url: string) {
    if (emulatorMode) return false;
    if (normalizeExternalHttpUrl(url) || url === "about:blank") return true;
    void Linking.openURL(url).catch(() => undefined);
    return false;
  }

  return (
    <AppSheet ref={sheetRef} visible={visible} onClose={onClose} height={sheetHeight} contentPanning={false}
      header={<View style={{ paddingHorizontal: 14, backgroundColor: colors.paper, borderBottomColor: colors.line, borderBottomWidth: 1 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 54, paddingBottom: 4 }}>
              <BrowserIconButton accessibilityLabel={t("shared.browser.close")} icon="x" onPress={closeWithAnimation} />
              <View style={{ alignItems: "center", flex: 1, justifyContent: "center", pointerEvents: "none" }}>
                <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, textAlign: "center" }]}>
                  {domain}
                </Text>
              </View>
              <BrowserIconButton accessibilityLabel={t("shared.browser.openExternal")} icon="external-link" onPress={openInExternalBrowser} />
            </View>
            <View style={{ height: 2 }}>
              {loading && !loadError ? (
                <View style={{ backgroundColor: colors.gold, borderRadius: 999, height: 2, width: progressWidth }} />
              ) : null}
            </View>
          </View>}
    >
          <View style={{ backgroundColor: colors.paper, flex: 1 }}>
            {!emulatorMode && session && loadUrl && !loadError ? (
              <WebView
                allowsBackForwardNavigationGestures
                allowsFullscreenVideo
                allowsInlineMediaPlayback
                key={`${session.id}-${attempt}`}
                onContentProcessDidTerminate={() => onError(displayedUrl)}
                onError={(event) => onError(event.nativeEvent.url)}
                onHttpError={(event) => {
                  if (isSameExternalDocument(event.nativeEvent.url, activeDocumentUrlRef.current)) {
                    onError(event.nativeEvent.url);
                  }
                }}
                onLoadEnd={onLoadEnd}
                onLoadProgress={(event) => onLoadProgress(event.nativeEvent.progress)}
                onLoadStart={(event) => {
                  activeDocumentUrlRef.current = event.nativeEvent.url;
                  onNavigate(event.nativeEvent.url);
                  onLoadStart();
                }}
                onNavigationStateChange={(navigationState) => {
                  activeDocumentUrlRef.current = navigationState.url;
                  onNavigate(navigationState.url);
                }}
                onRenderProcessGone={() => onError(displayedUrl)}
                onShouldStartLoadWithRequest={(request) => shouldStartRequest(request.url)}
                originWhitelist={["http://*", "https://*"]}
                setSupportMultipleWindows={false}
                source={{ uri: loadUrl }}
                style={{ backgroundColor: colors.paper, flex: 1 }}
              />
            ) : null}
            {loadError ? <BrowserErrorState domain={domain} onRetry={onRetry} /> : null}
          </View>
          <View style={{ backgroundColor: colors.paper, height: insets.bottom }} />
    </AppSheet>
  );
}

function BrowserIconButton({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: "external-link" | "x";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? colors.accentSubtle : colors.input,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 44,
        justifyContent: "center",
        width: 44,
      })}
    >
      <Feather name={icon} size={20} color={colors.ink} />
    </Pressable>
  );
}

function BrowserErrorState({ domain, onRetry }: { domain: string; onRetry: () => void }) {
  const { t } = useAppTranslation();
  return (
    <View style={{ alignItems: "center", flex: 1, justifyContent: "center", padding: 28 }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.accentSubtle,
          borderColor: colors.line,
          borderRadius: 999,
          borderWidth: 1,
          height: 58,
          justifyContent: "center",
          width: 58,
        }}
      >
        <Feather name="globe" size={24} color={colors.olive} />
      </View>
      <Text style={[typography.heading, { color: colors.ink, fontSize: 21, marginTop: 18, textAlign: "center" }]}>
        {t("shared.browser.pageUnavailable")}
      </Text>
      <Text style={[typography.body, { color: colors.muted, marginTop: 8, maxWidth: 310, textAlign: "center" }]}>
        {t("shared.browser.reachError", { domain })}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: pressed ? colors.accentSubtle : colors.paper,
          borderColor: colors.line,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 8,
          justifyContent: "center",
          marginTop: 20,
          minHeight: 44,
          paddingHorizontal: 18,
        })}
      >
        <Feather name="refresh-cw" size={17} color={colors.olive} />
        <Text style={[typography.button, { color: colors.olive }]}>{t("shared.browser.tryAgain")}</Text>
      </Pressable>
    </View>
  );
}
