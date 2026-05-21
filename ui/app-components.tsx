import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from "react";
import { Feather, Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleProp, Text, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useKoino } from "@/state/koino-store";
import type { BibleVerse } from "@/state/types";
import { colors, platformShadow, radius } from "@/ui/theme";

type FeatherName = ComponentProps<typeof Feather>["name"];

export function initials(name?: string) {
  return (name || "K")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AppScreen({
  children,
  scroll = true,
  topInset = true,
}: PropsWithChildren<{ scroll?: boolean; topInset?: boolean }>) {
  const insets = useSafeAreaInsets();
  if (!scroll) {
    return <View style={{ backgroundColor: colors.cream, flex: 1, paddingTop: topInset ? insets.top : 0 }}>{children}</View>;
  }

  return (
    <View style={{ backgroundColor: colors.cream, flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: Math.max(112, insets.bottom + 92), paddingTop: (topInset ? insets.top : 0) + 18 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function AppHeader({
  currentRoomName,
  memberCount,
  onRoomPress,
  showBack = false,
  onBack,
}: {
  currentRoomName?: string;
  memberCount?: number;
  onRoomPress?: () => void;
  showBack?: boolean;
  onBack?: () => void;
}) {
  const { state } = useKoino();
  const user = state.users.find((item) => item.id === state.currentUserId);
  return (
    <View style={{ gap: 18 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          {showBack ? (
            <IconButton accessibilityLabel="Go back" icon="arrow-left" onPress={onBack ?? (() => router.back())} />
          ) : null}
          <Text style={{ color: colors.olive, fontSize: 24, fontWeight: "900", letterSpacing: 3 }}>KOINO</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <ThemeDots />
          <Pressable accessibilityRole="button" accessibilityLabel="Open identity and support" onPress={() => router.push("/identity" as never)}>
            <Avatar name={user?.name ?? state.authEmail ?? "K"} size={38} tone="pink" />
          </Pressable>
        </View>
      </View>

      {currentRoomName ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRoomPress}
          style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 10 }}
        >
          <RoomImage name={currentRoomName} size={44} />
          <View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "900" }}>{currentRoomName}</Text>
              <Feather name="chevron-down" size={16} color={colors.ink} />
            </View>
            {typeof memberCount === "number" ? (
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

export function CurrentRoomHeader() {
  const { state } = useKoino();
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? state.groupMemberCounts[group.id] || state.memberships.length || 4 : 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/settings" as never)}
      style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 10 }}
    >
      <RoomImage name={group?.name} size={44} />
      <View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: "900", maxWidth: 220 }}>
            {group?.name ?? "No group"}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.ink} />
        </View>
        {group ? (
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ThemeDots() {
  const { state, dispatch } = useKoino();
  const isNight = state.theme === "dark";
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: isNight }}
      accessibilityLabel={`Switch to ${isNight ? "light" : "night"} mode`}
      onPress={() => dispatch({ type: "setTheme", theme: isNight ? "light" : "dark" })}
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        height: 34,
        paddingHorizontal: 8,
        ...platformShadow({
          boxShadow: "0 3px 8px rgba(11, 18, 32, 0.08)",
          offset: { width: 0, height: 3 },
          opacity: 0.08,
          radius: 8,
        }),
      }}
    >
      <Ionicons name="sunny" color={!isNight ? colors.olive : "#B8C0CE"} size={15} />
      <Ionicons name="moon" color={isNight ? colors.olive : "#B8C0CE"} size={14} />
    </Pressable>
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
  name,
  onCreate,
  onPress,
  subtitle = "Share, reflect or ask for prayer...",
}: {
  name?: string;
  onCreate: () => void;
  onPress: () => void;
  subtitle?: string;
}) {
  return (
    <View
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
      <Pressable accessibilityRole="button" onPress={onPress} style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: 12 }}>
        <Avatar name={name ?? "K"} size={48} tone="orange" />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>How is your heart today?</Text>
          <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "600" }}>{subtitle}</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create new entry"
        onPress={onCreate}
        style={{
          alignItems: "center",
          backgroundColor: colors.accentSubtle,
          borderColor: colors.line,
          borderRadius: radius.md,
          borderWidth: 1,
          height: 46,
          justifyContent: "center",
          width: 46,
        }}
      >
        <Feather name="plus" size={23} color={colors.olive} />
      </Pressable>
    </View>
  );
}

export function PrimaryButton({
  children,
  disabled = false,
  icon,
  onPress,
  style,
}: PropsWithChildren<{ disabled?: boolean; icon?: FeatherName; onPress: () => void; style?: StyleProp<ViewStyle> }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          alignItems: "center",
          backgroundColor: disabled ? colors.disabled : colors.gold,
          borderColor: disabled ? colors.disabled : colors.gold,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 10,
          justifyContent: "center",
          minHeight: 54,
          paddingHorizontal: 18,
        },
        style,
      ]}
    >
      {icon ? <Feather name={icon} size={19} color={disabled ? colors.disabledText : colors.onAccent} /> : null}
      <Text style={{ color: disabled ? colors.disabledText : colors.onAccent, fontSize: 16, fontWeight: "900" }}>{children}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  children,
  disabled = false,
  icon,
  onPress,
  style,
  tone = "default",
}: PropsWithChildren<{
  disabled?: boolean;
  icon?: FeatherName;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "danger";
}>) {
  const color = tone === "danger" ? colors.danger : colors.olive;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          alignItems: "center",
          backgroundColor: colors.paper,
          borderColor: tone === "danger" ? colors.dangerBorder : colors.line,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 9,
          justifyContent: "center",
          minHeight: 52,
          paddingHorizontal: 18,
        },
        style,
      ]}
    >
      {icon ? <Feather name={icon} size={18} color={disabled ? colors.disabledText : color} /> : null}
      <Text style={{ color: disabled ? colors.disabledText : color, fontSize: 15, fontWeight: "900" }}>{children}</Text>
    </Pressable>
  );
}

export function TextInputField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[
        {
          backgroundColor: colors.input,
          borderColor: colors.line,
          borderCurve: "continuous",
          borderRadius: radius.lg,
          borderWidth: 1,
          color: colors.ink,
          fontSize: 15,
          minHeight: props.multiline ? 116 : 50,
          paddingHorizontal: 14,
          paddingVertical: props.multiline ? 14 : 0,
          textAlignVertical: props.multiline ? "top" : "center",
        },
        props.style,
      ]}
    />
  );
}

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  tone = "default",
}: {
  accessibilityLabel: string;
  icon: FeatherName;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 38,
        justifyContent: "center",
        width: 38,
      }}
    >
      <Feather name={icon} size={18} color={tone === "danger" ? colors.danger : colors.ink} />
    </Pressable>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              backgroundColor: selected ? colors.accentSubtle : colors.paper,
              borderColor: selected ? colors.gold : colors.line,
              borderRadius: 999,
              borderWidth: 1,
              minHeight: 36,
              paddingHorizontal: 18,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: selected ? colors.olive : colors.muted, fontSize: 14, fontWeight: "800" }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Avatar({ name, size = 42, tone = "orange" }: { name?: string; size?: number; tone?: "orange" | "green" | "pink" | "blue" }) {
  const palette = {
    orange: ["#FFE1C9", "#A9561A"],
    green: ["#E7F1DD", "#58712D"],
    pink: ["#F8D3DD", "#8E3B54"],
    blue: ["#DDE8F3", "#365778"],
  }[tone];
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette[0],
        borderColor: colors.line,
        borderRadius: 999,
        borderWidth: 1,
        height: size,
        justifyContent: "center",
        overflow: "hidden",
        width: size,
      }}
    >
      <Text style={{ color: palette[1], fontSize: Math.max(12, size * 0.36), fontWeight: "900" }}>{initials(name)}</Text>
    </View>
  );
}

export function RoomImage({ name, size = 64 }: { name?: string; size?: number }) {
  return <Avatar name={name ?? "Room"} size={size} tone="blue" />;
}

export function AvatarStack({ names }: { names: string[] }) {
  return (
    <View style={{ flexDirection: "row", height: 42 }}>
      {names.slice(0, 4).map((name, index) => (
        <View key={`${name}-${index}`} style={{ marginLeft: index === 0 ? 0 : -10 }}>
          <Avatar name={name} size={42} tone={index % 2 ? "orange" : "pink"} />
        </View>
      ))}
    </View>
  );
}

export function VerseCard({ verse, compact = false }: { verse?: BibleVerse; compact?: boolean }) {
  if (!verse) return null;
  return (
    <View
      style={{
        alignItems: compact ? "flex-start" : "center",
        backgroundColor: colors.input,
        borderColor: colors.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        padding: compact ? 12 : 14,
      }}
    >
      <Ionicons name="sunny-outline" size={20} color={colors.olive} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.ink, fontSize: compact ? 13 : 14, fontWeight: "700", lineHeight: compact ? 18 : 20 }}>{verse.text}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{verse.reference}</Text>
      </View>
    </View>
  );
}

export function bibleVerses(verse?: BibleVerse, verses?: BibleVerse[]) {
  if (verses?.length) return verses.slice(0, 5);
  return verse ? [verse] : [];
}

export function VerseList({ verse, verses, compact = false }: { verse?: BibleVerse; verses?: BibleVerse[]; compact?: boolean }) {
  const visibleVerses = bibleVerses(verse, verses);
  if (visibleVerses.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {visibleVerses.map((item) => (
        <VerseCard key={`${item.reference}-${item.text}`} verse={item} compact={compact} />
      ))}
    </View>
  );
}

export function SectionHeading({ children, muted }: PropsWithChildren<{ muted?: boolean }>) {
  return (
    <Text style={{ color: muted ? colors.muted : colors.ink, fontSize: muted ? 12 : 18, fontWeight: "900", textTransform: muted ? "uppercase" : "none" }}>
      {children}
    </Text>
  );
}

export function BodyText({ children, muted = false, style, ...props }: PropsWithChildren<TextProps & { muted?: boolean; style?: StyleProp<TextStyle> }>) {
  return (
    <Text {...props} style={[{ color: muted ? colors.muted : colors.ink, fontSize: 15, fontWeight: "500", lineHeight: 22 }, style]}>
      {children}
    </Text>
  );
}

export function ExpandableBodyText({
  children,
  collapsedLines = 3,
  muted = false,
  style,
}: PropsWithChildren<{ collapsedLines?: number; muted?: boolean; style?: StyleProp<TextStyle> }>) {
  const collapsedHeight = collapsedLines * 22;
  const heightAnimation = useRef(new Animated.Value(collapsedHeight)).current;
  const hasMeasuredRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const hasMeasured = fullHeight > 0;
  const canExpand = fullHeight > collapsedHeight + 1;
  const visibleHeight = canExpand ? (expanded ? fullHeight : collapsedHeight) : fullHeight || collapsedHeight;

  useEffect(() => {
    hasMeasuredRef.current = false;
    setFullHeight(0);
    setExpanded(false);
    heightAnimation.setValue(collapsedHeight);
  }, [children, collapsedHeight, heightAnimation]);

  useEffect(() => {
    if (!fullHeight) return;
    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      heightAnimation.setValue(visibleHeight);
      return;
    }
    Animated.timing(heightAnimation, {
      duration: 220,
      toValue: visibleHeight,
      useNativeDriver: false,
    }).start();
  }, [fullHeight, heightAnimation, visibleHeight]);

  return (
    <View style={{ gap: 6 }}>
      <Animated.View style={[{ overflow: "hidden" }, hasMeasured ? { height: heightAnimation } : null]}>
        <BodyText muted={muted} numberOfLines={hasMeasured ? undefined : collapsedLines} style={style}>
          {children}
        </BodyText>
      </Animated.View>
      <BodyText
        muted={muted}
        onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}
        style={[style, { left: 0, opacity: 0, position: "absolute", right: 0, zIndex: -1 }]}
      >
        {children}
      </BodyText>
      {canExpand ? (
        <Pressable
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 5, minHeight: 28 }}
        >
          <Text style={{ color: muted ? colors.muted : colors.olive, fontSize: 13, fontWeight: "900" }}>{expanded ? "Show less" : "Show more"}</Text>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={muted ? colors.muted : colors.olive} />
        </Pressable>
      ) : null}
    </View>
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

export function BottomSheet({
  children,
  onClose,
  title,
  visible,
}: PropsWithChildren<{ onClose: () => void; title: string; visible: boolean }>) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: "rgba(11, 18, 32, 0.45)", flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityLabel="Close sheet" accessibilityRole="button" onPress={onClose} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
          <View
            style={{
              backgroundColor: colors.paper,
              borderTopLeftRadius: radius.xxl,
              borderTopRightRadius: radius.xxl,
              gap: 16,
              maxHeight: "88%",
              padding: 18,
              paddingBottom: Math.max(24, insets.bottom + 14),
              ...platformShadow({
                boxShadow: "0 -12px 30px rgba(11, 18, 32, 0.18)",
                offset: { width: 0, height: -12 },
                opacity: 0.18,
                radius: 30,
              }),
            }}
          >
            <View style={{ alignItems: "center" }}>
              <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 4, width: 44 }} />
            </View>
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>{title}</Text>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
