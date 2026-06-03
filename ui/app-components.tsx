import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from "react";
import { Feather, Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle } from "react-native";
import type { ModalProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";

import { bibleVerseForVersion } from "@/features/bible-kjv";
import { usePreferredBibleVersion } from "@/features/bible-preferences";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, GroupImage } from "@/state/types";
import { splitLinkText } from "@/ui/link-utils";
import { openLinkInApp } from "@/ui/open-link";
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
    return <View style={{ backgroundColor: colors.background.app, flex: 1, paddingTop: topInset ? insets.top : 0 }}>{children}</View>;
  }

  return (
    <View style={{ backgroundColor: colors.background.app, flex: 1 }}>
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

const webFixedPosition = "fixed" as unknown as ViewStyle["position"];

export function FullScreenModal({
  animationType = "slide",
  children,
  onRequestClose,
  presentationStyle,
  visible,
}: PropsWithChildren<Pick<ModalProps, "animationType" | "onRequestClose" | "presentationStyle" | "visible">>) {
  if (Platform.OS === "web") {
    if (!visible) return null;

    return (
      <View
        style={{
          backgroundColor: colors.background.app,
          bottom: 0,
          left: 0,
          position: webFixedPosition,
          right: 0,
          top: 0,
          zIndex: 9999,
        }}
      >
        {children}
      </View>
    );
  }

  return (
    <Modal animationType={animationType} presentationStyle={presentationStyle} visible={visible} onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

export function AppHeader({
  currentRoomName,
  currentRoomImage,
  memberCount,
  onRoomPress,
  showBack = false,
  onBack,
}: {
  currentRoomName?: string;
  currentRoomImage?: GroupImage;
  memberCount?: number;
  onRoomPress?: () => void;
  showBack?: boolean;
  onBack?: () => void;
}) {
  return (
    <View style={{ gap: 18 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          {showBack ? (
            <IconButton accessibilityLabel="Go back" icon="arrow-left" onPress={onBack ?? (() => router.back())} />
          ) : null}
          <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: "900", letterSpacing: 3 }}>KOINO</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <ThemeDots />
          <AvatarButton />
        </View>
      </View>

      {currentRoomName ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRoomPress}
          style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 10 }}
        >
          <RoomImage image={currentRoomImage} name={currentRoomName} size={44} />
          <View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "900" }}>{currentRoomName}</Text>
              <Feather name="chevron-down" size={16} color={colors.text.primary} />
            </View>
            {typeof memberCount === "number" ? (
              <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: "600" }}>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AvatarButton({ size = 38 }: { size?: number }) {
  const { state } = useKoino();
  const pathname = usePathname();
  const user = state.users.find((item) => item.id === state.currentUserId);

  if (!state.currentUserId) return null;

  const openIdentitySupport = () => {
    if (pathname === "/identity") return;
    router.push("/identity" as never);
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open identity and support" hitSlop={8} onPress={openIdentitySupport}>
      <Avatar image={user?.image} name={user?.name ?? state.authEmail ?? "K"} size={size} tone="pink" />
    </Pressable>
  );
}

export function CurrentRoomHeader() {
  const { state } = useKoino();
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? state.groupMemberCounts[group.id] || state.memberships.length || 4 : 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/(tabs)/room" as never)}
      style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 10 }}
    >
      <RoomImage image={group?.image} name={group?.name} size={44} />
      <View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: 16, fontWeight: "900", maxWidth: 220 }}>
            {group?.name ?? "No community"}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.text.primary} />
        </View>
        {group ? (
          <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: "600" }}>
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
        backgroundColor: colors.background.surface,
        borderColor: colors.border.subtle,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        height: 34,
        paddingHorizontal: 8,
        ...platformShadow({
          boxShadow: `0 3px 8px ${colors.shadow.soft}`,
          color: colors.text.primary,
          offset: { width: 0, height: 3 },
          opacity: 0.08,
          radius: 8,
        }),
      }}
    >
      <Ionicons name="sunny" color={!isNight ? colors.text.primary : colors.text.muted} size={15} />
      <Ionicons name="moon" color={isNight ? colors.text.primary : colors.text.muted} size={14} />
    </Pressable>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.background.surface,
          borderColor: colors.border.subtle,
          borderCurve: "continuous",
          borderRadius: radius.xl,
          borderWidth: 1,
          gap: 14,
          padding: 16,
          ...platformShadow({
            boxShadow: `0 10px 24px ${colors.shadow.soft}`,
            color: colors.text.primary,
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
  subtitle = "Share, reflect or ask for prayer...",
}: {
  actionIcon?: FeatherName;
  actionLabel?: string;
  image?: GroupImage;
  name?: string;
  onPress: () => void;
  subtitle?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.background.surface,
        borderColor: colors.border.subtle,
        borderRadius: radius.xl,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        padding: 14,
        ...platformShadow({
          boxShadow: `0 10px 24px ${colors.shadow.soft}`,
          color: colors.text.primary,
          offset: { width: 0, height: 10 },
          opacity: 0.055,
          radius: 24,
        }),
      }}
    >
      <Avatar image={image} name={name ?? "K"} size={48} tone="orange" />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "700" }}>How is your heart today?</Text>
        <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: "600" }}>{subtitle}</Text>
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.semantic.warmthSoft,
          borderColor: colors.border.subtle,
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
        <Feather name={actionIcon} size={actionLabel ? 16 : 23} color={colors.text.primary} />
        {actionLabel ? <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: "900" }}>{actionLabel}</Text> : null}
      </View>
    </Pressable>
  );
}

export type SemanticTone = "reflection" | "scripture" | "prayer" | "community" | "checkin" | "warmth" | "neutral";

function semanticToneColors(tone?: SemanticTone) {
  if (tone === "reflection" || tone === "scripture") {
    return {
      accent: colors.semantic.reflection,
      background: colors.semantic.reflectionSoft,
      border: colors.border.soft,
      text: colors.text.primary,
    };
  }
  if (tone === "prayer") {
    return {
      accent: colors.semantic.prayer,
      background: colors.semantic.prayerSoft,
      border: colors.border.soft,
      text: colors.text.primary,
    };
  }
  if (tone === "community" || tone === "checkin") {
    return {
      accent: colors.semantic.community,
      background: colors.semantic.communitySoft,
      border: colors.border.soft,
      text: colors.text.primary,
    };
  }
  if (tone === "warmth") {
    return {
      accent: colors.semantic.warmth,
      background: colors.semantic.warmthSoft,
      border: colors.border.soft,
      text: colors.text.primary,
    };
  }
  if (tone === "neutral") {
    return {
      accent: colors.text.primary,
      background: colors.background.surface,
      border: colors.border.subtle,
      text: colors.text.primary,
    };
  }
  return {
    accent: colors.text.primary,
    background: colors.semantic.warmthSoft,
    border: colors.border.soft,
    text: colors.text.primary,
  };
}

function primaryButtonToneColors(tone: "prayer" | "community" | "warmth" | "neutral") {
  if (tone === "community") return { background: colors.semantic.community, border: colors.semantic.community, text: colors.text.primary };
  if (tone === "warmth") return { background: colors.semantic.warmth, border: colors.semantic.warmth, text: colors.text.primary };
  if (tone === "neutral") return { background: colors.background.surface, border: colors.border.subtle, text: colors.text.primary };
  return { background: colors.semantic.prayer, border: colors.semantic.prayer, text: colors.onAccent };
}

export function PrimaryButton({
  children,
  disabled = false,
  icon,
  onPress,
  style,
  tone = "prayer",
}: PropsWithChildren<{
  disabled?: boolean;
  icon?: FeatherName;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: "prayer" | "community" | "warmth" | "neutral";
}>) {
  const toneColors = primaryButtonToneColors(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          alignItems: "center",
          backgroundColor: disabled ? colors.disabled : toneColors.background,
          borderColor: disabled ? colors.disabled : toneColors.border,
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
      {icon ? <Feather name={icon} size={19} color={disabled ? colors.disabledText : toneColors.text} /> : null}
      <Text style={{ color: disabled ? colors.disabledText : toneColors.text, fontSize: 16, fontWeight: "900" }}>{children}</Text>
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
  const color = tone === "danger" ? colors.danger : colors.text.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          alignItems: "center",
          backgroundColor: colors.background.surface,
          borderColor: tone === "danger" ? colors.dangerBorder : colors.border.subtle,
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
      placeholderTextColor={colors.text.secondary}
      {...props}
      style={[
        {
          backgroundColor: colors.background.surface,
          borderColor: colors.border.subtle,
          borderCurve: "continuous",
          borderRadius: radius.lg,
          borderWidth: 1,
          color: colors.text.primary,
          fontSize: 16,
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
        backgroundColor: colors.background.surface,
        borderColor: colors.border.subtle,
        borderRadius: 999,
        borderWidth: 1,
        height: 38,
        justifyContent: "center",
        width: 38,
      }}
    >
      <Feather name={icon} size={18} color={tone === "danger" ? colors.danger : colors.text.primary} />
    </Pressable>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; tone?: SemanticTone; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((option) => {
        const selected = option.value === value;
        const toneColors = semanticToneColors(option.tone);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              backgroundColor: selected ? toneColors.background : colors.background.surface,
              borderColor: selected ? toneColors.border : colors.border.subtle,
              borderRadius: 999,
              borderWidth: 1,
              minHeight: 36,
              paddingHorizontal: 18,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: selected ? toneColors.text : colors.text.secondary, fontSize: 14, fontWeight: "800" }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Avatar({
  image,
  name,
  size = 42,
  tone = "orange",
}: {
  image?: GroupImage;
  name?: string;
  size?: number;
  tone?: "orange" | "green" | "pink" | "blue";
}) {
  const [failed, setFailed] = useState(false);
  const palette = {
    orange: ["#FFE1C9", "#A9561A"],
    green: ["#E7F1DD", "#58712D"],
    pink: ["#F8D3DD", "#8E3B54"],
    blue: ["#DDE8F3", "#365778"],
  }[tone];

  useEffect(() => {
    setFailed(false);
  }, [image?.url]);

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette[0],
        borderColor: colors.border.subtle,
        borderRadius: 999,
        borderWidth: 1,
        height: size,
        justifyContent: "center",
        overflow: "hidden",
        width: size,
      }}
    >
      {image?.url && !failed ? (
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setFailed(true)}
          resizeMode="cover"
          source={{ uri: image.url }}
          style={{ height: "100%", width: "100%" }}
        />
      ) : (
        <Text style={{ color: palette[1], fontSize: Math.max(12, size * 0.36), fontWeight: "900" }}>{initials(name)}</Text>
      )}
    </View>
  );
}

export function RoomImage({ image, name, size = 64 }: { image?: GroupImage; name?: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image?.url]);

  if (image?.url && !failed) {
    return (
      <View
        style={{
          backgroundColor: colors.background.surface,
          borderColor: colors.border.subtle,
          borderRadius: 999,
          borderWidth: 1,
          height: size,
          overflow: "hidden",
          width: size,
        }}
      >
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setFailed(true)}
          resizeMode="cover"
          source={{ uri: image.url }}
          style={{ height: "100%", width: "100%" }}
        />
      </View>
    );
  }

  return <Avatar name={name ?? "Community"} size={size} tone="blue" />;
}

export function AvatarStack({ users, size = 42 }: { users: { name: string; image?: GroupImage }[]; size?: number }) {
  return (
    <View style={{ flexDirection: "row", height: size }}>
      {users.slice(0, 4).map((user, index) => (
        <View key={`${user.name}-${index}`} style={{ marginLeft: index === 0 ? 0 : -(size * 0.4) }}>
          <Avatar image={user.image} name={user.name} size={size} tone={index % 2 ? "orange" : "pink"} />
        </View>
      ))}
    </View>
  );
}

type VerseActionHandlers = {
  onAddToJournal?: (verse: BibleVerse) => void;
  onOpenInBible?: (verse: BibleVerse) => void;
  onShareToRoom?: (verse: BibleVerse) => void;
};

function verseIdentity(verse: Pick<BibleVerse, "reference" | "translation">) {
  return `${verse.reference}|${verse.translation ?? ""}`;
}

export function VersePreviewCard({
  compact = false,
  onAddToJournal,
  onOpenInBible,
  onShareToRoom,
  showFullText = false,
  showOpenIndicator = true,
  verse,
}: VerseActionHandlers & {
  compact?: boolean;
  showFullText?: boolean;
  showOpenIndicator?: boolean;
  verse?: BibleVerse;
}) {
  const { state } = useKoino();
  const preferredBibleVersion = usePreferredBibleVersion(state.currentUserId);
  const [detailVisible, setDetailVisible] = useState(false);
  if (!verse) return null;
  const displayVerse = bibleVerseForVersion(verse, preferredBibleVersion);
  const saved = state.savedVerses.some((item) => verseIdentity(item) === verseIdentity(displayVerse));
  const verseTextStyle: TextStyle = { color: colors.text.primary, fontSize: compact ? 13 : 14, fontWeight: "700", lineHeight: compact ? 18 : 20 };
  return (
    <>
      <Pressable
        accessibilityLabel={`Open ${displayVerse.reference}`}
        accessibilityRole="button"
        onPress={(event) => {
          event.stopPropagation();
          setDetailVisible(true);
        }}
        style={{
          alignItems: compact ? "flex-start" : "center",
          backgroundColor: colors.background.surface,
          borderColor: colors.border.subtle,
          borderRadius: radius.lg,
          borderWidth: 1,
          flexDirection: "row",
          gap: 12,
          padding: compact ? 12 : 14,
        }}
      >
        <Ionicons name="sunny-outline" size={20} color={colors.text.primary} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
            <Text numberOfLines={1} style={{ color: colors.text.primary, flex: 1, fontSize: compact ? 12 : 13, fontWeight: "900" }}>
              {displayVerse.reference}
            </Text>
            {displayVerse.translation ? <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: "800" }}>{displayVerse.translation}</Text> : null}
          </View>
          {showFullText ? (
            <ExpandableBodyText collapsedLines={compact ? 3 : 5} style={verseTextStyle}>
              {displayVerse.text}
            </ExpandableBodyText>
          ) : (
            <Text numberOfLines={compact ? 3 : 5} style={verseTextStyle}>
              {displayVerse.text}
            </Text>
          )}
          {showOpenIndicator ? <Text style={{ color: colors.text.primary, fontSize: 11, fontWeight: "900" }}>Open</Text> : null}
        </View>
      </Pressable>
      <VerseDetailSheet
        onAddToJournal={onAddToJournal}
        onClose={() => setDetailVisible(false)}
        onOpenInBible={onOpenInBible}
        onShareToRoom={onShareToRoom}
        saved={saved}
        verse={displayVerse}
        visible={detailVisible}
      />
    </>
  );
}

export function VerseCard(props: Parameters<typeof VersePreviewCard>[0]) {
  return <VersePreviewCard {...props} />;
}

export function bibleVerses(verse?: BibleVerse, verses?: BibleVerse[]) {
  if (verses?.length) return verses.slice(0, 5);
  return verse ? [verse] : [];
}

export function VerseList({
  compact = false,
  onAddToJournal,
  onOpenInBible,
  onShareToRoom,
  verse,
  verses,
}: VerseActionHandlers & { verse?: BibleVerse; verses?: BibleVerse[]; compact?: boolean }) {
  const visibleVerses = bibleVerses(verse, verses);
  if (visibleVerses.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {visibleVerses.map((item) => (
        <VersePreviewCard
          key={`${item.reference}-${item.text}`}
          compact={compact}
          onAddToJournal={onAddToJournal}
          onOpenInBible={onOpenInBible}
          onShareToRoom={onShareToRoom}
          verse={item}
        />
      ))}
    </View>
  );
}

export function VerseDetailSheet({
  onAddToJournal,
  onClose,
  onOpenInBible,
  onShareToRoom,
  saved,
  verse,
  visible,
}: VerseActionHandlers & {
  onClose: () => void;
  saved?: boolean;
  verse?: BibleVerse;
  visible: boolean;
}) {
  const { dispatch } = useKoino();
  const [busy, setBusy] = useState(false);
  if (!verse) return null;
  const currentVerse = verse;

  async function saveVerse() {
    if (busy) return;
    setBusy(true);
    await dispatch({ type: "saveVerse", verse: currentVerse });
    setBusy(false);
  }

  async function addToJournal() {
    if (onAddToJournal) {
      onClose();
      onAddToJournal(currentVerse);
      return;
    }
    await dispatch({
      type: "createJournalEntry",
      body: `Scripture note for ${currentVerse.reference}.`,
      entryKind: "scripture",
      journalType: "scripture_note",
      title: currentVerse.reference,
      verse: currentVerse,
      verses: [currentVerse],
      shareWithGroup: false,
    });
    onClose();
  }

  async function shareToRoom() {
    if (onShareToRoom) {
      onClose();
      onShareToRoom(currentVerse);
      return;
    }
    await dispatch({
      type: "createPost",
      body: "A Scripture for today.",
      kind: "scripture",
      title: currentVerse.reference,
      verse: currentVerse,
      verses: [currentVerse],
    });
    onClose();
  }

  function openInBible() {
    onClose();
    if (onOpenInBible) {
      onOpenInBible(currentVerse);
      return;
    }
    router.push("/(tabs)/bible" as never);
  }

  return (
    <BottomSheet title={verse.reference} visible={visible} onClose={onClose}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "900" }}>{verse.translation ?? "Bible"}</Text>
        <Text selectable style={{ color: colors.text.primary, fontSize: 17, fontWeight: "800", lineHeight: 26 }}>
          {verse.text}
        </Text>
      </View>
      {verse.contextBefore || verse.contextAfter ? (
        <Card style={{ backgroundColor: colors.background.app }}>
          {verse.contextBefore ? <BodyText muted>{verse.contextBefore}</BodyText> : null}
          {verse.contextAfter ? <BodyText muted>{verse.contextAfter}</BodyText> : null}
        </Card>
      ) : null}
      <PrimaryButton disabled={busy || saved} icon="bookmark" onPress={saveVerse}>
        {saved ? "Saved verse" : "Save verse"}
      </PrimaryButton>
      <SecondaryButton icon="book-open" onPress={addToJournal}>
        Add to Journal
      </SecondaryButton>
      <SecondaryButton icon="users" onPress={shareToRoom}>
        Share to Community
      </SecondaryButton>
      <SecondaryButton icon="corner-up-right" onPress={openInBible}>
        Open in Bible
      </SecondaryButton>
    </BottomSheet>
  );
}

export function SectionHeading({ children, muted }: PropsWithChildren<{ muted?: boolean }>) {
  return (
    <Text style={{ color: muted ? colors.text.secondary : colors.text.primary, fontSize: muted ? 12 : 18, fontWeight: "900", textTransform: muted ? "uppercase" : "none" }}>
      {children}
    </Text>
  );
}

export function BodyText({ children, muted = false, style, ...props }: PropsWithChildren<TextProps & { muted?: boolean; style?: StyleProp<TextStyle> }>) {
  const content =
    typeof children === "string"
      ? splitLinkText(children).map((part, index) =>
          part.url ? (
            <Text
              accessibilityRole="link"
              key={`${part.url}-${index}`}
              onPress={(event) => {
                event.stopPropagation();
                void openLinkInApp(part.url ?? "");
              }}
              style={{ color: colors.text.primary, fontWeight: "900", textDecorationLine: "underline" }}
            >
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )
      : children;

  return (
    <Text {...props} style={[{ color: muted ? colors.text.secondary : colors.text.primary, fontSize: 15, fontWeight: "500", lineHeight: 22 }, style]}>
      {content}
    </Text>
  );
}

export function ExpandableBodyText({
  children,
  collapsedLines = 3,
  muted = false,
  style,
}: PropsWithChildren<{ collapsedLines?: number; muted?: boolean; style?: StyleProp<TextStyle> }>) {
  const flattenedStyle = StyleSheet.flatten(style);
  const collapsedLineHeight = typeof flattenedStyle?.lineHeight === "number" ? flattenedStyle.lineHeight : 22;
  const collapsedHeight = collapsedLines * collapsedLineHeight;
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
          <Text style={{ color: muted ? colors.text.secondary : colors.text.primary, fontSize: 13, fontWeight: "900" }}>{expanded ? "Show less" : "Show more"}</Text>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={muted ? colors.text.secondary : colors.text.primary} />
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
      {icon ? <Feather name={icon} size={19} color={tone === "danger" ? colors.danger : colors.text.primary} /> : null}
      <View style={{ flex: 1 }}>{children}</View>
      {onPress ? <Feather name="chevron-right" size={18} color={colors.text.secondary} /> : null}
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
        <View style={{ backgroundColor: colors.overlay.scrim, flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityLabel="Close sheet" accessibilityRole="button" onPress={onClose} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
          <View
            style={{
              backgroundColor: colors.background.surface,
              borderTopLeftRadius: radius.xxl,
              borderTopRightRadius: radius.xxl,
              gap: 16,
              maxHeight: "88%",
              padding: 18,
              paddingBottom: Math.max(24, insets.bottom + 14),
              ...platformShadow({
                boxShadow: `0 -12px 30px ${colors.shadow.soft}`,
                color: colors.text.primary,
                offset: { width: 0, height: -12 },
                opacity: 0.18,
                radius: 30,
              }),
            }}
          >
            <View style={{ alignItems: "center" }}>
              <View style={{ backgroundColor: colors.border.subtle, borderRadius: 999, height: 4, width: 44 }} />
            </View>
            <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: "900" }}>{title}</Text>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
