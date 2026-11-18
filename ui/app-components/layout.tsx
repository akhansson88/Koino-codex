import { AppSheet } from "@/ui/app-sheet";
import { tabContentClearance } from "@/ui/navigation-layout";
import { AmbientBackground } from "@/ui/ambient-background";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import type { ComponentProps, Ref } from "react";
import { PropsWithChildren, ReactNode, useCallback, useState } from "react";
import type { ModalProps } from "react-native";
import { Pressable, ScrollView, StyleProp, Text, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GroupImage } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { FullScreenModalHost } from "@/ui/full-screen-modal-host";
import { colors, radius, shadows, shadcn, typography } from "@/ui/theme";
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
  const [ambientActive, setAmbientActive] = useState(true);
  useFocusEffect(useCallback(() => {
    setAmbientActive(true);
    return () => setAmbientActive(false);
  }, []));

  if (!scroll) {
    return (
      <View style={{ backgroundColor: colors.cream, flex: 1, paddingTop: topInset ? insets.top : 0 }}>
        <AmbientBackground active={ambientActive} />
        {children}
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: colors.cream, flex: 1 }}>
      <AmbientBackground active={ambientActive} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        ref={scrollRef}
        scrollEventThrottle={scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: "transparent" }}
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
  onDismiss,
  onRequestClose,
  presentationStyle,
  visible,
}: PropsWithChildren<Pick<ModalProps, "animationType" | "onDismiss" | "onRequestClose" | "presentationStyle" | "visible">>) {
  return (
    <FullScreenModalHost
      animationType={animationType}
      presentationStyle={presentationStyle}
      visible={visible}
      onDismiss={onDismiss}
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
          backgroundColor: shadcn.card,
          borderColor: shadcn.border,
          borderCurve: "continuous",
          borderRadius: radius.xl,
          borderWidth: 1,
          gap: 14,
          padding: 16,
          ...shadows.card,
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
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? "#FFF7ED" : shadcn.card,
        borderColor: shadcn.border,
        borderCurve: "continuous",
        borderRadius: radius.xl,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        padding: 14,
        ...shadows.card,
      })}
    >
      <Avatar image={image} name={name ?? "K"} size={44} tone="orange" />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("community.checkIn.promptTitle")}</Text>
        <Text style={[typography.subtitle, { color: colors.muted }]}>{resolvedSubtitle}</Text>
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: actionLabel ? shadcn.card : shadcn.primary,
          borderColor: actionLabel ? shadcn.border : shadcn.primary,
          borderRadius: radius.md,
          borderWidth: 1,
          flexDirection: "row",
          gap: 7,
          height: 42,
          justifyContent: "center",
          minWidth: actionLabel ? 92 : 42,
          paddingHorizontal: actionLabel ? 13 : 0,
        }}
      >
        <Feather name={actionIcon} size={actionLabel ? 16 : 21} color={actionLabel ? colors.ink : shadcn.primaryForeground} />
        {actionLabel ? <Text style={[typography.label, { color: colors.ink }]}>{actionLabel}</Text> : null}
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
      {icon ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: tone === "danger" ? colors.dangerSurface : shadcn.secondary,
            borderRadius: radius.md,
            height: 36,
            justifyContent: "center",
            width: 36,
          }}
        >
          <Feather name={icon} size={17} color={tone === "danger" ? colors.danger : colors.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>{children}</View>
      {onPress ? <Feather name="chevron-right" size={18} color={colors.disabledText} /> : null}
    </>
  );
  if (!onPress) {
    return <View style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 56 }}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        flexDirection: "row",
        gap: 12,
        minHeight: 56,
        opacity: pressed ? 0.62 : 1,
      })}
    >
      {content}
    </Pressable>
  );
}

export function BottomSheet(props: import("@/ui/app-sheet").AppSheetProps) {
  return <AppSheet {...props} scroll />;
}
