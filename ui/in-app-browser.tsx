import { Feather } from "@expo/vector-icons";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { normalizeUrl } from "@/ui/link-utils";
import { openLinkInApp } from "@/ui/open-link";
import { colors, platformShadow, radius, typography } from "@/ui/theme";

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

export function domainForExternalUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "") || "Website";
  } catch {
    return "Website";
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
    const url = normalizeExternalHttpUrl(value);

    if (Platform.OS === "web" || !url) {
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
      {Platform.OS !== "web" ? (
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
      ) : null}
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
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const activeDocumentUrlRef = useRef(currentUrl || session?.url || "");
  const closingRef = useRef(false);
  const topGap = Math.max(insets.top + 26, 58);
  const sheetHeight = Math.max(320, height - topGap);
  const sheetWidth = width >= 760 ? Math.min(width - 48, 760) : width;
  const visible = Boolean(session);

  const closeWithAnimation = useCallback(() => {
    if (!visible || closingRef.current) return;
    closingRef.current = true;

    Animated.parallel([
      Animated.timing(translateY, {
        duration: 240,
        easing: Easing.in(Easing.cubic),
        toValue: sheetHeight,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        duration: 200,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      closingRef.current = false;
      onClose();
    });
  }, [backdropOpacity, onClose, sheetHeight, translateY, visible]);

  const settleOpen = useCallback(() => {
    Animated.spring(translateY, {
      damping: 24,
      mass: 0.8,
      stiffness: 220,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const headerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => translateY.stopAnimation(),
        onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 70 || gesture.vy > 0.45) {
            closeWithAnimation();
            return;
          }
          settleOpen();
        },
        onPanResponderTerminate: settleOpen,
      }),
    [closeWithAnimation, settleOpen, translateY],
  );

  const handlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => translateY.stopAnimation(),
        onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 50 || gesture.vy > 0.35) {
            closeWithAnimation();
            return;
          }
          settleOpen();
        },
        onPanResponderTerminate: settleOpen,
        onPanResponderTerminationRequest: () => false,
      }),
    [closeWithAnimation, settleOpen, translateY],
  );

  useEffect(() => {
    activeDocumentUrlRef.current = currentUrl || session?.url || "";
  }, [currentUrl, session?.url]);

  useEffect(() => {
    if (!session) return;
    closingRef.current = false;
    translateY.setValue(sheetHeight);
    backdropOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(translateY, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        duration: 220,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, session?.id, sheetHeight, translateY]);

  const displayedUrl = currentUrl || session?.url || "";
  const domain = domainForExternalUrl(displayedUrl);
  const progressWidth = `${Math.round(Math.max(0.04, Math.min(progress, 1)) * 100)}%` as `${number}%`;

  function openInExternalBrowser() {
    const externalUrl = normalizeExternalHttpUrl(displayedUrl);
    if (!externalUrl) return;
    void Linking.openURL(externalUrl).catch(() => {
      Alert.alert("Could not open browser", "This page is still open in KOINO. Please try again.");
    });
  }

  function shouldStartRequest(url: string) {
    if (normalizeExternalHttpUrl(url) || url === "about:blank") return true;
    void Linking.openURL(url).catch(() => undefined);
    return false;
  }

  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      navigationBarTranslucent
      onRequestClose={closeWithAnimation}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View accessibilityViewIsModal style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(11, 18, 32, 0.24)", opacity: backdropOpacity, pointerEvents: "none" }]}
        />
        <Pressable
          accessibilityLabel="Dismiss browser"
          accessibilityRole="button"
          onPress={closeWithAnimation}
          style={StyleSheet.absoluteFillObject}
        />
        <Animated.View
          style={{
            alignSelf: "center",
            backgroundColor: colors.paper,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            height: sheetHeight,
            overflow: "hidden",
            transform: [{ translateY }],
            width: sheetWidth,
            ...platformShadow({
              boxShadow: "0 -18px 44px rgba(11, 18, 32, 0.18)",
              elevation: 18,
              offset: { width: 0, height: -12 },
              opacity: 0.16,
              radius: 34,
            }),
          }}
        >
          <View
            {...headerPanResponder.panHandlers}
            style={{
              backgroundColor: colors.paper,
              borderBottomColor: colors.line,
              borderBottomWidth: 1,
              paddingHorizontal: 14,
              paddingTop: 6,
            }}
          >
            <View
              {...handlePanResponder.panHandlers}
              accessibilityLabel="Swipe down to close browser"
              style={{ alignItems: "center", alignSelf: "center", height: 22, justifyContent: "center", width: 150 }}
            >
              <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 4, width: 44 }} />
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 54, paddingBottom: 4 }}>
              <BrowserIconButton accessibilityLabel="Close browser" icon="x" onPress={closeWithAnimation} />
              <View style={{ alignItems: "center", flex: 1, justifyContent: "center", pointerEvents: "none" }}>
                <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, textAlign: "center" }]}>
                  {domain}
                </Text>
              </View>
              <BrowserIconButton accessibilityLabel="Open in external browser" icon="external-link" onPress={openInExternalBrowser} />
            </View>
            <View style={{ height: 2 }}>
              {loading && !loadError ? (
                <View style={{ backgroundColor: colors.gold, borderRadius: 999, height: 2, width: progressWidth }} />
              ) : null}
            </View>
          </View>

          <View style={{ backgroundColor: colors.paper, flex: 1 }}>
            {session && loadUrl && !loadError ? (
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
        </Animated.View>
      </View>
    </Modal>
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
      <Text style={[typography.heading, { color: colors.ink, fontSize: 21, marginTop: 18, textAlign: "center" }]}>Page unavailable</Text>
      <Text style={[typography.body, { color: colors.muted, marginTop: 8, maxWidth: 310, textAlign: "center" }]}>
        {domain} could not be reached right now. Check your connection and try again.
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
        <Text style={[typography.button, { color: colors.olive }]}>Try again</Text>
      </Pressable>
    </View>
  );
}
