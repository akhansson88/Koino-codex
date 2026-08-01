import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from "react";
import { Feather, Ionicons } from "@expo/vector-icons";
import type { ComponentProps, Ref } from "react";
import { Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle } from "react-native";
import type { ModalProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";

import { bibleVerseForVersion } from "@/features/bible-kjv";
import { usePreferredBibleVersion } from "@/features/bible-preferences";
import { useKoino } from "@/state/koino-store";
import type { BibleVerse, GroupImage } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { communityMemberCount } from "@/ui/community-copy";
import { FullScreenModalHost } from "@/ui/full-screen-modal-host";
import { useOpenExternalLink } from "@/ui/in-app-browser";
import { hasVisibleLinkText, visibleLinkParts } from "@/ui/link-utils";
import { colors, platformShadow, radius, typography } from "@/ui/theme";

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
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: Math.max(112, insets.bottom + 92), paddingTop: (topInset ? insets.top : 0) + 18 }}
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
  const { t } = useAppTranslation();
  return (
    <View style={{ gap: 18 }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          {showBack ? (
            <IconButton accessibilityLabel={t("shared.app.goBack")} icon="arrow-left" onPress={onBack ?? (() => router.back())} />
          ) : null}
          <Text style={[typography.title, { color: colors.textPrimary, fontSize: 24, lineHeight: 30 }]}>KOINO</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
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
              <Text style={[typography.cardTitle, { color: colors.ink }]}>{currentRoomName}</Text>
              <Feather name="chevron-down" size={16} color={colors.ink} />
            </View>
            {typeof memberCount === "number" ? (
              <Text style={[typography.label, { color: colors.muted }]}>
                {communityMemberCount(memberCount, t)}
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
  const { t } = useAppTranslation();
  const pathname = usePathname();
  const user = state.users.find((item) => item.id === state.currentUserId);

  if (!state.currentUserId) return null;

  const openIdentitySupport = () => {
    if (pathname === "/identity") return;
    router.push("/identity" as never);
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("shared.app.openIdentitySupport")} hitSlop={8} onPress={openIdentitySupport}>
      <Avatar image={user?.image} name={user?.name ?? state.authEmail ?? "K"} size={size} tone="pink" />
    </Pressable>
  );
}

export function CurrentRoomHeader() {
  const { state } = useKoino();
  const { t } = useAppTranslation();
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberCount = group ? state.groupMemberCounts[group.id] || state.memberships.length || 4 : 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/(tabs)/community" as never)}
      style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 10 }}
    >
      <RoomImage image={group?.image} name={group?.name} size={44} />
      <View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.ink, maxWidth: 220 }]}>
            {group?.name ?? t("community.management.noneShort")}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.ink} />
        </View>
        {group ? (
          <Text style={[typography.label, { color: colors.muted }]}>{communityMemberCount(memberCount, t)}</Text>
        ) : null}
      </View>
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

export function PrimaryButton({
  accessibilityHint,
  accessibilityLabel,
  children,
  disabled = false,
  icon,
  onPress,
  style,
}: PropsWithChildren<{
  accessibilityHint?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: FeatherName;
  onPress: ComponentProps<typeof Pressable>["onPress"];
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? (typeof children === "string" ? children : undefined)}
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
      {icon ? (
        <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
          <Feather name={icon} size={19} color={disabled ? colors.disabledText : colors.onAccent} />
        </View>
      ) : null}
      <Text style={[typography.button, { color: disabled ? colors.disabledText : colors.onAccent, flexShrink: 1, textAlign: "center" }]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  accessibilityHint,
  accessibilityLabel,
  children,
  disabled = false,
  icon,
  onPress,
  style,
  tone = "default",
}: PropsWithChildren<{
  accessibilityHint?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: FeatherName;
  onPress: ComponentProps<typeof Pressable>["onPress"];
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "danger";
}>) {
  const color = tone === "danger" ? colors.danger : colors.olive;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? (typeof children === "string" ? children : undefined)}
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
      {icon ? (
        <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
          <Feather name={icon} size={18} color={disabled ? colors.disabledText : color} />
        </View>
      ) : null}
      <Text style={[typography.button, { color: disabled ? colors.disabledText : color, flexShrink: 1, textAlign: "center" }]}>
        {children}
      </Text>
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
          minHeight: props.multiline ? 116 : 50,
          paddingHorizontal: 14,
          paddingVertical: props.multiline ? 14 : 0,
          textAlignVertical: props.multiline ? "top" : "center",
        },
        typography.body,
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
  fit = false,
  minHeight = 36,
  options,
  showSelectionIndicator = false,
  value,
  onChange,
}: {
  fit?: boolean;
  minHeight?: number;
  options: { label: string; value: T }[];
  showSelectionIndicator?: boolean;
  value: T;
  onChange: (value: T) => void;
}) {
  const chips = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        accessibilityLabel={option.label}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        key={option.value}
        onPress={() => onChange(option.value)}
        style={{
          alignItems: "center",
          backgroundColor: selected ? colors.accentSubtle : colors.paper,
          borderColor: selected ? colors.gold : colors.line,
          borderRadius: 999,
          borderWidth: 1,
          flex: fit ? 1 : undefined,
          flexDirection: "row",
          gap: 6,
          justifyContent: "center",
          minHeight,
          minWidth: fit ? 0 : undefined,
          paddingHorizontal: fit ? 4 : 18,
        }}
      >
        {selected && showSelectionIndicator ? (
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Feather name="check" size={14} color={colors.olive} />
          </View>
        ) : null}
        <Text
          adjustsFontSizeToFit={fit}
          minimumFontScale={fit ? 0.78 : undefined}
          numberOfLines={1}
          style={[typography.label, { color: selected ? colors.olive : colors.muted, fontSize: fit ? 12 : typography.label.fontSize }]}
        >
          {option.label}
        </Text>
      </Pressable>
    );
  });

  if (fit) {
    return <View style={{ flexDirection: "row", gap: 6, width: "100%" }}>{chips}</View>;
  }

  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{chips}</ScrollView>;
}

export function StatusPill({ status }: { status: "answered" | "open" }) {
  const { t } = useAppTranslation();
  const answered = status === "answered";
  return (
    <View
      style={{
        backgroundColor: answered ? colors.rhythmSoft : colors.warmSoft,
        borderColor: answered ? colors.accentRhythm : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>
        {t(answered ? "shared.status.answered" : "shared.status.open")}
      </Text>
    </View>
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
    orange: [colors.warmSoft, colors.textMuted],
    green: [colors.rhythmSoft, colors.textMuted],
    pink: [colors.prayerSoft, colors.textMuted],
    blue: [colors.reflectionSoft, colors.textMuted],
  }[tone];

  useEffect(() => {
    setFailed(false);
  }, [image?.url]);

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
      {image?.url && !failed ? (
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setFailed(true)}
          resizeMode="cover"
          source={{ uri: image.url }}
          style={{ height: "100%", width: "100%" }}
        />
      ) : (
        <Text style={[typography.label, { color: palette[1], fontSize: Math.max(12, size * 0.36), lineHeight: Math.max(14, size * 0.42) }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

export function RoomImage({ image, name, size = 64 }: { image?: GroupImage; name?: string; size?: number }) {
  const { t } = useAppTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image?.url]);

  if (image?.url && !failed) {
    return (
      <View
        style={{
          backgroundColor: colors.input,
          borderColor: colors.line,
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

  return <Avatar name={name ?? t("tabs.community")} size={size} tone="blue" />;
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
  inlineDetail = false,
  interactive = true,
  maxLines,
  onAddToJournal,
  onDetailVisibilityChange,
  onOpenInBible,
  onShareToRoom,
  openAccessibilityLabel,
  openLabel,
  showFullText = false,
  showOpenIndicator = true,
  verse,
}: VerseActionHandlers & {
  compact?: boolean;
  inlineDetail?: boolean;
  interactive?: boolean;
  maxLines?: number;
  onDetailVisibilityChange?: (visible: boolean) => void;
  openAccessibilityLabel?: string;
  openLabel?: string;
  showFullText?: boolean;
  showOpenIndicator?: boolean;
  verse?: BibleVerse;
}) {
  const { state } = useKoino();
  const { t } = useAppTranslation();
  const preferredBibleVersion = usePreferredBibleVersion(state.currentUserId);
  const [detailVisible, setDetailVisible] = useState(false);
  if (!verse) return null;
  const displayVerse = bibleVerseForVersion(verse, preferredBibleVersion);
  const previewLines = maxLines ?? (compact ? 3 : 5);
  const cardOpenLabel = openAccessibilityLabel ?? t("shared.scripture.openReference", { reference: displayVerse.reference });
  const cardOpenText = openLabel ?? t("shared.scripture.open");
  const openDetail = () => {
    setDetailVisible(true);
    onDetailVisibilityChange?.(true);
  };
  const closeDetail = () => {
    setDetailVisible(false);
    onDetailVisibilityChange?.(false);
  };
  const saved = state.savedVerses.some((item) => verseIdentity(item) === verseIdentity(displayVerse));
  const verseTextStyle: TextStyle = { ...typography.bodyMedium, color: colors.ink, fontSize: compact ? 13 : 14, lineHeight: compact ? 18 : 20 };
  const previewCardStyle: ViewStyle = {
    alignItems: compact ? "flex-start" : "center",
    backgroundColor: colors.input,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: compact ? 12 : 14,
  };
  const header = (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
      <Text numberOfLines={1} style={[typography.label, { color: colors.ink, flex: 1, fontSize: compact ? 12 : 13 }]}>
        {displayVerse.reference}
      </Text>
      {displayVerse.translation ? <Text style={[typography.caption, { color: colors.muted, fontSize: 11 }]}>{displayVerse.translation}</Text> : null}
    </View>
  );

  return (
    <>
      {showFullText ? (
        <View style={previewCardStyle}>
          <Ionicons name="sunny-outline" size={20} color={colors.olive} />
          <View style={{ flex: 1, gap: 4 }}>
            <Pressable
              accessibilityLabel={cardOpenLabel}
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                openDetail();
              }}
            >
              {header}
            </Pressable>
            <ExpandableBodyText collapsedLines={previewLines} style={verseTextStyle}>
              {displayVerse.text}
            </ExpandableBodyText>
            {showOpenIndicator ? (
              <Pressable
                accessibilityLabel={cardOpenLabel}
                accessibilityRole="button"
                onPress={(event) => {
                  event.stopPropagation();
                  openDetail();
                }}
                style={{ alignSelf: "flex-start" }}
              >
                <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>{cardOpenText}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : interactive ? (
        <Pressable
          accessibilityLabel={cardOpenLabel}
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            openDetail();
          }}
          style={previewCardStyle}
        >
          <Ionicons name="sunny-outline" size={20} color={colors.olive} />
          <View style={{ flex: 1, gap: 4 }}>
            {header}
            <Text numberOfLines={previewLines} style={verseTextStyle}>
              {displayVerse.text}
            </Text>
            {showOpenIndicator ? <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>{cardOpenText}</Text> : null}
          </View>
        </Pressable>
      ) : (
        <View style={previewCardStyle}>
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Ionicons name="sunny-outline" size={20} color={colors.olive} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {header}
            <Text numberOfLines={previewLines} style={verseTextStyle}>
              {displayVerse.text}
            </Text>
          </View>
        </View>
      )}
      {interactive && inlineDetail && detailVisible ? (
        <Card style={{ gap: 12, marginTop: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <IconButton accessibilityLabel={t("shared.scripture.closeDetail")} icon="arrow-left" onPress={closeDetail} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.label, { color: colors.ink }]}>{displayVerse.reference}</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>{displayVerse.translation ?? t("shared.scripture.bible")}</Text>
            </View>
          </View>
          <Text selectable style={[typography.bodyMedium, { color: colors.ink, fontSize: 15, lineHeight: 23 }]}>
            {displayVerse.text}
          </Text>
          {onOpenInBible ? (
            <SecondaryButton icon="corner-up-right" onPress={(event) => {
              event.stopPropagation();
              closeDetail();
              setTimeout(() => onOpenInBible(displayVerse), 0);
            }}>
              {t("shared.scripture.openInBible")}
            </SecondaryButton>
          ) : null}
        </Card>
      ) : null}
      {interactive && !inlineDetail ? (
        <VerseDetailSheet
          onAddToJournal={onAddToJournal}
          onClose={closeDetail}
          onOpenInBible={onOpenInBible}
          onShareToRoom={onShareToRoom}
          saved={saved}
          verse={displayVerse}
          visible={detailVisible}
        />
      ) : null}
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
  maxLines,
  onAddToJournal,
  onOpenInBible,
  onShareToRoom,
  showFullText = false,
  verse,
  verses,
}: VerseActionHandlers & {
  verse?: BibleVerse;
  verses?: BibleVerse[];
  compact?: boolean;
  maxLines?: number;
  showFullText?: boolean;
}) {
  const visibleVerses = bibleVerses(verse, verses);
  if (visibleVerses.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {visibleVerses.map((item) => (
        <VersePreviewCard
          key={`${item.reference}-${item.text}`}
          compact={compact}
          maxLines={maxLines}
          onAddToJournal={onAddToJournal}
          onOpenInBible={onOpenInBible}
          onShareToRoom={onShareToRoom}
          showFullText={showFullText}
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
  const { t } = useAppTranslation();
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
      body: t("community.scripture.shareBody"),
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
      setTimeout(() => onOpenInBible(currentVerse), 220);
      return;
    }
    router.push("/(tabs)/bible" as never);
  }

  return (
    <BottomSheet title={verse.reference} visible={visible} onClose={onClose}>
      <View style={{ gap: 6 }}>
        <Text style={[typography.sectionLabel, { color: colors.muted }]}>{verse.translation ?? t("shared.scripture.bible")}</Text>
        <Text selectable style={[typography.bodyMedium, { color: colors.ink, fontSize: 17, lineHeight: 26 }]}>
          {verse.text}
        </Text>
      </View>
      {verse.contextBefore || verse.contextAfter ? (
        <Card style={{ backgroundColor: colors.cream }}>
          {verse.contextBefore ? <BodyText muted>{verse.contextBefore}</BodyText> : null}
          {verse.contextAfter ? <BodyText muted>{verse.contextAfter}</BodyText> : null}
        </Card>
      ) : null}
      <PrimaryButton disabled={busy || saved} icon="bookmark" onPress={(event) => {
        event.stopPropagation();
        saveVerse();
      }}>
        {t(saved ? "shared.scripture.savedVerse" : "shared.scripture.saveVerse")}
      </PrimaryButton>
      <SecondaryButton icon="book-open" onPress={(event) => {
        event.stopPropagation();
        addToJournal();
      }}>
        {t("shared.scripture.addToJournal")}
      </SecondaryButton>
      <SecondaryButton icon="users" onPress={(event) => {
        event.stopPropagation();
        shareToRoom();
      }}>
        {t("shared.scripture.shareToCommunity")}
      </SecondaryButton>
      <SecondaryButton icon="corner-up-right" onPress={(event) => {
        event.stopPropagation();
        openInBible();
      }}>
        {t("shared.scripture.openInBible")}
      </SecondaryButton>
    </BottomSheet>
  );
}

export function SectionHeading({ children, muted }: PropsWithChildren<{ muted?: boolean }>) {
  return (
    <Text style={[muted ? typography.sectionLabel : typography.title, { color: muted ? colors.muted : colors.ink }]}>
      {children}
    </Text>
  );
}

export function BodyText({
  children,
  hiddenUrl,
  muted = false,
  style,
  ...props
}: PropsWithChildren<TextProps & { hiddenUrl?: string; muted?: boolean; style?: StyleProp<TextStyle> }>) {
  const openExternalLink = useOpenExternalLink();
  const visibleParts = typeof children === "string" ? visibleLinkParts(children, hiddenUrl) : undefined;
  if (typeof children === "string" && hiddenUrl && !visibleParts?.some((part) => /\S/.test(part.text))) return null;

  const content =
    visibleParts
      ? visibleParts.map((part, index) =>
          part.url ? (
            <Text
              accessibilityRole="link"
              key={`${part.url}-${index}`}
              onPress={(event) => {
                event.stopPropagation();
                openExternalLink(part.url ?? "");
              }}
              style={[typography.bodyMedium, { color: muted ? colors.olive : colors.textMuted, textDecorationLine: "underline" }]}
            >
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )
      : children;

  return (
    <Text {...props} style={[typography.body, { color: muted ? colors.muted : colors.ink }, style]}>
      {content}
    </Text>
  );
}

export function ExpandableBodyText({
  actionMinHeight = 28,
  children,
  collapsedLines = 3,
  hiddenUrl,
  muted = false,
  style,
}: PropsWithChildren<{ actionMinHeight?: number; collapsedLines?: number; hiddenUrl?: string; muted?: boolean; style?: StyleProp<TextStyle> }>) {
  const { t } = useAppTranslation();
  const flattenedStyle = StyleSheet.flatten(style);
  const collapsedLineHeight = typeof flattenedStyle?.lineHeight === "number" ? flattenedStyle.lineHeight : 22;
  const collapsedHeight = collapsedLines * collapsedLineHeight;
  const heightAnimation = useRef(new Animated.Value(collapsedHeight)).current;
  const hasMeasuredRef = useRef(false);
  const fullHeightRef = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const hasMeasured = fullHeight > 0;
  const canExpand = fullHeight > collapsedHeight + 1;
  const visibleHeight = canExpand ? (expanded ? fullHeight : collapsedHeight) : fullHeight || collapsedHeight;

  useEffect(() => {
    hasMeasuredRef.current = false;
    fullHeightRef.current = 0;
    setFullHeight(0);
    setExpanded(false);
    heightAnimation.setValue(collapsedHeight);
  }, [children, collapsedHeight, hiddenUrl, heightAnimation]);

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

  if (typeof children === "string" && hiddenUrl && !hasVisibleLinkText(children, hiddenUrl)) return null;

  return (
    <View style={{ gap: 6 }}>
      <Animated.View style={[{ overflow: "hidden" }, hasMeasured ? { height: heightAnimation } : null]}>
        <BodyText hiddenUrl={hiddenUrl} muted={muted} numberOfLines={hasMeasured ? undefined : collapsedLines} style={style}>
          {children}
        </BodyText>
      </Animated.View>
      <BodyText
        accessibilityElementsHidden
        hiddenUrl={hiddenUrl}
        importantForAccessibility="no-hide-descendants"
        muted={muted}
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          if (Math.abs(fullHeightRef.current - nextHeight) < 1) return;
          fullHeightRef.current = nextHeight;
          setFullHeight(nextHeight);
        }}
        style={[style, { left: 0, opacity: 0, pointerEvents: "none", position: "absolute", right: 0, zIndex: -1 }]}
      >
        {children}
      </BodyText>
      {canExpand ? (
        <Pressable
          accessibilityLabel={t(expanded ? "shared.expand.showLess" : "shared.expand.showMore")}
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 5, minHeight: actionMinHeight }}
        >
          <Text style={[typography.label, { color: muted ? colors.muted : colors.olive }]}>
            {t(expanded ? "shared.expand.showLess" : "shared.expand.showMore")}
          </Text>
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={muted ? colors.muted : colors.olive} />
          </View>
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
  reducedMotion = false,
  title,
  visible,
}: PropsWithChildren<{ onClose: () => void; reducedMotion?: boolean; title: string; visible: boolean }>) {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  return (
    <Modal animationType={reducedMotion ? "none" : "fade"} transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: "rgba(11, 18, 32, 0.45)", flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityLabel={t("shared.sheet.close")} accessibilityRole="button" onPress={onClose} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
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
            <Text style={[typography.heading, { color: colors.ink, fontSize: 20, lineHeight: 26 }]}>{title}</Text>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
