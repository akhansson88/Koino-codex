import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, typography } from "@/ui/theme";
import { Feather } from "@expo/vector-icons";
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetScrollView, BottomSheetTextInput, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { AccessibilityInfo, findNodeHandle, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ScrollViewProps, type TextInputProps } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SheetContext = createContext(false);
export function OutsideSheet({ children }: PropsWithChildren) {
  return <SheetContext.Provider value={false}>{children}</SheetContext.Provider>;
}
export const SheetFlatList = BottomSheetFlatList;
export const SheetScrollView = forwardRef<ScrollView, ScrollViewProps>(function SheetScrollView(props, ref) {
  const inside = useContext(SheetContext);
  const Component = inside ? BottomSheetScrollView : ScrollView;
  return <Component {...props} ref={ref as never} keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? "handled"}>{props.children}</Component>;
});
export const SheetTextInput = forwardRef<TextInput, TextInputProps>(function SheetTextInput(props, ref) {
  const inside = useContext(SheetContext);
  const Component = inside ? BottomSheetTextInput : TextInput;
  return <Component {...props} ref={ref as never} />;
});

export type AppSheetHandle = { dismiss: (afterDismiss?: () => void) => void };
export type AppSheetProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onBack?: () => void;
  title?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  height?: number;
  dismissible?: boolean;
  reducedMotion?: boolean;
  scroll?: boolean;
  contentPanning?: boolean;
  header?: ReactNode;
  returnFocusRef?: { current: View | null };
}>;

/** One native modal host per sheet keeps nested sheets above full-screen pickers on both platforms. */
export const AppSheet = forwardRef<AppSheetHandle, AppSheetProps>(function AppSheet({
  children, visible, onClose, onDismiss, onBack, title, height, dismissible = true,
  reducedMotion, backgroundColor = colors.paper, foregroundColor = colors.ink,
  scroll = false, contentPanning = true, header, returnFocusRef,
}, ref) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const sheet = useRef<BottomSheet>(null);
  const heading = useRef<Text>(null);
  const [mounted, setMounted] = useState(visible);
  const [headerHeight, setHeaderHeight] = useState(20);
  const completed = useRef<(() => void) | undefined>(undefined);
  const closing = useRef(false);
  const requested = useRef(false);
  const continuation = useRef<(() => void) | undefined>(undefined);
  const latest = useRef({ visible, onClose, onDismiss, returnFocusRef });
  latest.current = { visible, onClose, onDismiss, returnFocusRef };
  const maxHeight = Math.max(120, window.height - insets.top - 16);
  const fixedHeight = height ? Math.min(height, maxHeight) : undefined;

  const dismiss = useCallback((afterDismiss?: () => void) => {
    if (!dismissible || closing.current) return;
    continuation.current = afterDismiss;
    requested.current = true;
    closing.current = true;
    sheet.current?.close();
  }, [dismissible]);
  useImperativeHandle(ref, () => ({ dismiss }), [dismiss]);

  useEffect(() => {
    if (visible) {
      completed.current = undefined;
      closing.current = false;
      requested.current = false;
      continuation.current = undefined;
      setMounted(true);
      sheet.current?.snapToIndex(0);
    } else if (mounted) {
      closing.current = true;
      sheet.current?.close();
    }
  }, [visible]);

  const finish = useCallback(() => {
    if (!closing.current) return;
    // A pan-down close has no explicit request; a controlled close must not call onClose again.
    const notifyClose = requested.current || latest.current.visible;
    const after = continuation.current;
    continuation.current = undefined;
    completed.current = () => {
      closing.current = false;
      requested.current = false;
      if (notifyClose) latest.current.onClose();
      latest.current.onDismiss?.();
      const target = latest.current.returnFocusRef?.current;
      if (target && Platform.OS !== "web") {
        const handle = findNodeHandle(target);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      }
      after?.();
    };
    setMounted(false);
  }, []);
  const complete = useCallback(() => {
    const callback = completed.current;
    completed.current = undefined;
    callback?.();
  }, []);
  useEffect(() => {
    // iOS supplies a native dismissal completion. Android completes after the host commit.
    if (!mounted && Platform.OS !== "ios") {
      const frame = requestAnimationFrame(complete);
      return () => cancelAnimationFrame(frame);
    }
  }, [mounted, complete]);

  const backdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1}
      opacity={0.35} pressBehavior="none" onPress={() => dismiss()}
      accessible={dismissible} accessibilityLabel={t("shared.sheet.close")} accessibilityRole="button" />
  ), [dismiss, dismissible, t]);

  const renderHeader = useCallback(() => <View onLayout={({ nativeEvent }) => setHeaderHeight(nativeEvent.layout.height)}>
    <View style={{ alignItems: "center", paddingVertical: 10 }}><View style={{ height: 4, borderRadius: 2, width: 44, backgroundColor: foregroundColor, opacity: 0.25 }} /></View>
    {header}
    {title ? <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingBottom: 12, gap: 12 }}>
      <Text ref={heading} accessible accessibilityRole="header" style={[typography.heading, { color: foregroundColor, flex: 1 }]}>{title}</Text>
      <Pressable disabled={!dismissible} accessibilityRole="button" accessibilityLabel={t("shared.sheet.close")}
        onPress={() => dismiss()} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
        <Feather name="x" size={22} color={foregroundColor} />
      </Pressable>
    </View> : null}
  </View>, [dismiss, dismissible, foregroundColor, header, t, title]);

  const body = <SheetContext.Provider value>{children}</SheetContext.Provider>;
  return (
    <Modal transparent visible={mounted} onDismiss={complete} animationType="none" statusBarTranslucent navigationBarTranslucent
      onRequestClose={() => { if (dismissible) { if (onBack) onBack(); else dismiss(); } }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View accessibilityViewIsModal style={StyleSheet.absoluteFill}>
          {mounted ? <BottomSheet ref={sheet} index={0} animateOnMount enableDynamicSizing={!fixedHeight}
            snapPoints={fixedHeight ? [fixedHeight] : undefined} maxDynamicContentSize={maxHeight}
            topInset={insets.top + 16} enablePanDownToClose={dismissible}
            enableContentPanningGesture={contentPanning} enableHandlePanningGesture={dismissible}
            keyboardBehavior="interactive" keyboardBlurBehavior="restore" android_keyboardInputMode="adjustResize"
            enableBlurKeyboardOnGesture overrideReduceMotion={reducedMotion ? ReduceMotion.Always : ReduceMotion.System}
            backgroundStyle={{ backgroundColor, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl }}
            handleComponent={renderHeader}
            backdropComponent={backdrop} onClose={finish}
            onAnimate={(_from, to) => { if (to === -1) closing.current = true; }}
            onChange={(index) => {
              if (index >= 0 && heading.current && Platform.OS !== "web") {
                const handle = findNodeHandle(heading.current);
                if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
              }
            }}>
            {/* Bound fixed-height content so nested lists have overflow to scroll on Android. */}
            {scroll ? <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingHorizontal: 18, paddingBottom: Math.max(24, insets.bottom + 14) }}>{body}</BottomSheetScrollView>
              : fixedHeight ? <View style={{ height: Math.max(0, fixedHeight - headerHeight), maxHeight: "100%", minHeight: 0 }}>{body}</View> : <BottomSheetView>{body}</BottomSheetView>}
          </BottomSheet> : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
});

export function SheetActionRow({ title, subtitle, icon, onPress, destructive = false, color = colors.ink }: {
  title: string; subtitle?: string; icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void; destructive?: boolean; color?: string;
}) {
  const tint = destructive ? colors.danger : color;
  return <Pressable accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
    <Feather name={icon} size={21} color={tint} />
    <View style={{ flex: 1, gap: 4 }}><Text style={[typography.cardTitle, { color: tint }]}>{title}</Text>
      {subtitle ? <Text style={{ color, opacity: 0.65, fontSize: 13 }}>{subtitle}</Text> : null}</View>
  </Pressable>;
}
