import { AppSheet } from "@/ui/app-sheet";
import { tabContentClearance } from "@/ui/navigation-layout";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps, Ref } from "react";
import { PropsWithChildren, ReactNode } from "react";
import type { ModalProps } from "react-native";
import { Pressable, ScrollView, StyleProp, Text, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GroupImage } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { FullScreenModalHost } from "@/ui/full-screen-modal-host";
import { colors, platformShadow, radius, typography } from "@/ui/theme";
import { type FeatherName } from "@/ui/app-components/types";
import { Avatar } from "@/ui/app-components/avatars";

export function AppScreen({
  children,
  onContentSizeChange,
  onScroll,
  onScrollBeginDrag,
  scroll = true,
  scrollEventThrottle,
  scrollRef,
  topInset = true,
}: PropsWithChildren<{
  onContentSizeChange?: ComponentProps<typeof ScrollView>["onContentSizeChange"];
  onScroll?: ComponentProps<typeof ScrollView>["onScroll"];
  onScrollBeginDrag?: ComponentProps<typeof ScrollView>["onScrollBeginDrag"];
  scroll?: boolean;
  scrollEventThrottle?: number;
  scrollRef?: Ref<ScrollView>;
  topInset?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  if (!scroll) {
    return <View style={{ backgroundColor: colors.cream, flex: 1, paddingTop: topInset ? insets.top : 0 }}>{children}</View>;
  }

  return (
    <View style={{ backgroundColor: colors.cream, flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        ref={scrollRef}
        scrollEventThrottle={scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: tabContentClearance(insets.bottom), paddingTop: (topInset ? insets.top : 0) + 18 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function FullScreenModal({
  animationType = "slide",
  children,
  onRequestClose,
  presentationStyle,
  visible,
}: PropsWithChildren<Pick<ModalProps, "animationType" | "onRequestClose" | "presentationStyle" | "visible">>) {
  return (
    <FullScreenModalHost
      animationType={animationType}
      presentationStyle={presentationStyle}
      visible={visible}
      onRequestClose={onRequestClose}
    >
      {children}
    </FullScreenModalHost>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.paper,
          borderColor: colors.line,
          borderCurve: "continuous",
          borderRadius: radius.xl,
          borderWidth: 1,
          gap: 14,
          padding: 16,
          ...platformShadow({
            boxShadow: "0 10px 24px rgba(11, 18, 32, 0.055)",
            offset: { width: 0, height: 10 },
            opacity: 0.055,
            radius: 24,
          }),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function HeartPromptCard({
  actionIcon = "plus",
  actionLabel,
  image,
  name,
  onPress,
  subtitle,
}: {
  actionIcon?: FeatherName;
  actionLabel?: string;
  image?: GroupImage;
  name?: string;
  onPress: () => void;
  subtitle?: string;
}) {
  const { t } = useAppTranslation();
  const resolvedSubtitle = subtitle ?? t("community.checkIn.heartPromptSubtitle");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: radius.xl,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        padding: 14,
        ...platformShadow({
          boxShadow: "0 10px 24px rgba(11, 18, 32, 0.055)",
          offset: { width: 0, height: 10 },
          opacity: 0.055,
          radius: 24,
        }),
      }}
    >
      <Avatar image={image} name={name ?? "K"} size={48} tone="orange" />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("community.checkIn.promptTitle")}</Text>
        <Text style={[typography.subtitle, { color: colors.muted }]}>{resolvedSubtitle}</Text>
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.accentSubtle,
          borderColor: colors.line,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 7,
          height: 46,
          justifyContent: "center",
          minWidth: actionLabel ? 92 : 46,
          paddingHorizontal: actionLabel ? 13 : 0,
        }}
      >
        <Feather name={actionIcon} size={actionLabel ? 16 : 23} color={colors.olive} />
        {actionLabel ? <Text style={[typography.label, { color: colors.olive }]}>{actionLabel}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Row({
  children,
  icon,
  onPress,
  tone = "default",
}: PropsWithChildren<{ icon?: FeatherName; onPress?: () => void; tone?: "default" | "danger" }>) {
  const content: ReactNode = (
    <>
      {icon ? <Feather name={icon} size={19} color={tone === "danger" ? colors.danger : colors.ink} /> : null}
      <View style={{ flex: 1 }}>{children}</View>
      {onPress ? <Feather name="chevron-right" size={18} color={colors.muted} /> : null}
    </>
  );
  if (!onPress) {
    return <View style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 56 }}>{content}</View>;
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 56 }}>
      {content}
    </Pressable>
  );
}

export function BottomSheet(props: import("@/ui/app-sheet").AppSheetProps) {
  return <AppSheet {...props} scroll />;
}
