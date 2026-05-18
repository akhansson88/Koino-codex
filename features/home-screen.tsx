import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ElementRef } from "react";
import { Feather } from "@expo/vector-icons";
import { Image, LayoutAnimation, Modal, Platform, Pressable, ScrollView, Text, UIManager, useWindowDimensions, View } from "react-native";
import type { ImageSourcePropType, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import { activePrivateCheckIns } from "@/state/check-ins";
import { useKoino } from "@/state/koino-store";
import { CommentReactionKind, FeedItem, Post } from "@/state/types";
import { Body, Card, Choice, Field, PillButton, Screen, SectionTitle } from "@/ui/components";
import { confirmAction } from "@/ui/confirm";
import { PrayerMoment, PrayerMomentTarget } from "@/ui/prayer-moment";
import { brandPalette, colors } from "@/ui/theme";

const moodOptions: { value: number; label: string; image: ImageSourcePropType }[] = [
  { value: 1, label: "Struggling", image: require("../emoji1-transparent.png") },
  { value: 2, label: "Okay", image: require("../emoji2-transparent.png") },
  { value: 3, label: "Good", image: require("../emoji3-transparent.png") },
  { value: 4, label: "Great", image: require("../emoji4-transparent.png") },
];
const MAX_POST_BODY_LENGTH = 500;
const DAILY_SHARED_POST_FRICTION_THRESHOLD = 3;
const INITIAL_SHARED_ITEMS = 4;
const INITIAL_VISIBLE_COMMENTS = 1;
const COLLAPSED_POST_LINES = 3;
const POST_TEXT_LINE_HEIGHT = 34;
const DAILY_SHARED_POST_FRICTION_MESSAGE =
  "KOINO is built for a calm rhythm and meaningful sharing. If this still feels important, share it. Otherwise, you can keep it private with God.";
type FeedFilter = "all" | "my_reflections" | "my_prayer_requests";
type ComposerKind = "reflection" | "prayer_request";
type ImageGalleryState = { images: string[]; index: number };
const commentReactionOptions: { kind: CommentReactionKind; label: string }[] = [
  { kind: "amen", label: "Amen" },
  { kind: "with_you", label: "With you" },
  { kind: "encouraged", label: "Encouraged" },
];

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatJoinedDay(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const created = Date.parse(value);
  if (Number.isNaN(created)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return formatJoinedDay(value);
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function moodLabel(mood: number) {
  return moodOptions.find((option) => option.value === mood)?.label ?? moodOptions[moodOptions.length - 1].label;
}

function normalizePostKind(kind: Post["kind"]): ComposerKind {
  return kind === "prayer_request" ? "prayer_request" : "reflection";
}

function showDailyPostFriction(onShareAnyway: () => void, onKeepPrivate?: () => void) {
  confirmAction({
    title: "A calm rhythm",
    message: DAILY_SHARED_POST_FRICTION_MESSAGE,
    cancelText: "Keep private",
    confirmText: "Share anyway",
    onCancel: onKeepPrivate,
    onConfirm: onShareAnyway,
  });
}

function FeedActionButton({
  label,
  iconName,
  emoji,
  selected = false,
  disabled = false,
  onPress,
}: {
  label: string;
  iconName?: ComponentProps<typeof Feather>["name"];
  emoji?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.gold : colors.paper,
        borderColor: selected ? colors.gold : colors.line,
        borderRadius: 8,
        borderWidth: 1,
        elevation: selected ? 2 : 0,
        flex: 1,
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        minHeight: 54,
        minWidth: 132,
        paddingHorizontal: 18,
        paddingVertical: 13,
      }}
    >
      {emoji ? (
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
      ) : iconName ? (
        <Feather name={iconName} size={20} color={selected ? brandPalette.deepNavy : colors.ink} />
      ) : null}
      <Text style={{ color: disabled ? colors.disabledText : selected ? brandPalette.deepNavy : colors.ink, fontSize: 15, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function FeedTypeBadge({
  iconName,
  label,
  tone,
}: {
  iconName: ComponentProps<typeof Feather>["name"];
  label: string;
  tone: "moss" | "rose" | "gold";
}) {
  const tint = tone === "moss" ? colors.moss : tone === "rose" ? colors.rose : colors.gold;
  const backgroundColor = tint;

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor,
        borderColor: tint,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Feather name={iconName} size={14} color={brandPalette.deepNavy} />
      <Text style={{ color: brandPalette.deepNavy, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function ExpandableFeedText({ children }: { children: string }) {
  const [expanded, setExpanded] = useState(false);
  const [measuredLineCount, setMeasuredLineCount] = useState(0);
  const hiddenTextRef = useRef<ElementRef<typeof Text> | null>(null);
  const { width } = useWindowDimensions();
  const canExpand = measuredLineCount > COLLAPSED_POST_LINES;
  const textStyle = { color: colors.ink, fontSize: 22, fontWeight: "500" as const, lineHeight: POST_TEXT_LINE_HEIGHT };

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  };

  useEffect(() => {
    setExpanded(false);
    setMeasuredLineCount(0);
  }, [children]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof requestAnimationFrame === "undefined") return;

    const frame = requestAnimationFrame(() => {
      const node = hiddenTextRef.current as unknown as {
        getBoundingClientRect?: () => { height: number };
        scrollHeight?: number;
      } | null;
      const height = Math.max(node?.scrollHeight ?? 0, node?.getBoundingClientRect?.().height ?? 0);
      if (height <= 0) return;

      const lineCount = Math.max(1, Math.round(height / POST_TEXT_LINE_HEIGHT));
      setMeasuredLineCount((current) => (current === lineCount ? current : lineCount));
    });

    return () => cancelAnimationFrame(frame);
  }, [children, width]);

  return (
    <View style={{ gap: 8 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ left: 0, opacity: 0, pointerEvents: "none", position: "absolute", right: 0, top: 0, zIndex: -1 }}
      >
        <Text
          ref={hiddenTextRef}
          onTextLayout={(event) => {
            const lineCount = event.nativeEvent.lines.length;
            setMeasuredLineCount((current) => (current === lineCount ? current : lineCount));
          }}
          style={textStyle}
        >
          {children}
        </Text>
      </View>
      <Text
        selectable
        numberOfLines={!expanded ? COLLAPSED_POST_LINES : undefined}
        style={textStyle}
      >
        {children}
      </Text>
      {canExpand ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={toggleExpanded}
          style={{ alignSelf: "flex-start", paddingVertical: 2 }}
        >
          <Text style={{ color: colors.olive, fontSize: 15, fontWeight: "800" }}>{expanded ? "See less" : "See more"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const composerPalette = {
  get panel() {
    return colors.paper;
  },
  get surface() {
    return colors.input;
  },
  get line() {
    return colors.line;
  },
  get text() {
    return colors.ink;
  },
  get muted() {
    return colors.muted;
  },
  get prayer() {
    return colors.gold;
  },
  get prayerSoft() {
    return colors.gold;
  },
  get reflection() {
    return colors.moss;
  },
  get reflectionSoft() {
    return colors.moss;
  },
  get submit() {
    return colors.gold;
  },
  get disabled() {
    return colors.disabled;
  },
  get onAccent() {
    return brandPalette.deepNavy;
  },
};

function ComposerKindButton({
  kind,
  selected,
  onPress,
}: {
  kind: ComposerKind;
  selected: boolean;
  onPress: () => void;
}) {
  const isPrayer = kind === "prayer_request";
  const accent = isPrayer ? composerPalette.prayer : composerPalette.reflection;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? (isPrayer ? composerPalette.prayerSoft : composerPalette.reflectionSoft) : composerPalette.surface,
        borderColor: selected ? accent : composerPalette.line,
        borderRadius: 8,
        borderWidth: 1,
        flex: 1,
        gap: 12,
        justifyContent: "center",
        minHeight: 112,
        minWidth: 136,
        padding: 14,
      }}
    >
      <Feather name={isPrayer ? "heart" : "edit-3"} size={30} color={selected ? brandPalette.deepNavy : colors.ink} />
      <Text style={{ color: selected ? brandPalette.deepNavy : colors.ink, fontSize: 18, fontWeight: "700", textAlign: "center" }}>
        {isPrayer ? "Ask for prayer" : "Share reflection"}
      </Text>
    </Pressable>
  );
}

function PostImages({ images, onOpen }: { images?: string[]; onOpen: (index: number) => void }) {
  if (!images?.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {images.map((image, index) => (
        <Pressable
          accessibilityLabel={`Open shared image ${index + 1}`}
          accessibilityRole="imagebutton"
          key={`${index}-${image.slice(0, 24)}`}
          onPress={() => onOpen(index)}
          style={{
            backgroundColor: colors.input,
            borderColor: colors.line,
            borderRadius: 8,
            borderWidth: 1,
            height: images.length === 1 ? 190 : 132,
            overflow: "hidden",
            width: images.length === 1 ? 260 : 132,
          }}
        >
          <Image source={{ uri: image }} style={{ height: "100%", width: "100%" }} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function CreatePostModal({
  visible,
  kind,
  body,
  onKindChange,
  onBodyChange,
  onClose,
  onSubmit,
  isEditing = false,
}: {
  visible: boolean;
  kind: ComposerKind;
  body: string;
  onKindChange: (kind: ComposerKind) => void;
  onBodyChange: (body: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  isEditing?: boolean;
}) {
  const canSubmit = body.trim().length > 0;
  const isPrayer = kind === "prayer_request";

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: colors.cream, flex: 1, justifyContent: "center", padding: 18 }}>
        <View
          style={{
            alignSelf: "center",
            backgroundColor: composerPalette.panel,
            borderColor: composerPalette.line,
            borderRadius: 8,
            borderWidth: 1,
            maxWidth: 540,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <View
            style={{
              alignItems: "center",
              borderBottomColor: composerPalette.line,
              borderBottomWidth: 1,
              flexDirection: "row",
              justifyContent: "center",
              minHeight: 70,
              paddingHorizontal: 18,
            }}
          >
            <Pressable
              accessibilityLabel="Close sharing form"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={{ alignItems: "center", height: 38, justifyContent: "center", left: 12, position: "absolute", width: 38 }}
            >
              <Feather name="x" size={26} color={composerPalette.text} />
            </Pressable>
            <Text style={{ color: composerPalette.text, fontSize: 20, fontWeight: "700" }}>
              {isPrayer ? (isEditing ? "Edit prayer request" : "Ask for prayer") : (isEditing ? "Edit reflection" : "Share reflection")}
            </Text>
          </View>

          <View style={{ gap: 20, padding: 22 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <ComposerKindButton kind="reflection" selected={kind === "reflection"} onPress={() => onKindChange("reflection")} />
              <ComposerKindButton kind="prayer_request" selected={kind === "prayer_request"} onPress={() => onKindChange("prayer_request")} />
            </View>

            <View style={{ position: "relative" }}>
              <Field
                multiline
                maxLength={MAX_POST_BODY_LENGTH}
                onChangeText={(value) => onBodyChange(value.slice(0, MAX_POST_BODY_LENGTH))}
                placeholder={isPrayer ? "What would you like your group to hold in prayer?" : "What are you noticing with God today?"}
                placeholderTextColor={composerPalette.muted}
                style={{
                  backgroundColor: composerPalette.surface,
                  borderColor: composerPalette.line,
                  color: composerPalette.text,
                  fontSize: 20,
                  lineHeight: 30,
                  minHeight: 220,
                  paddingBottom: 58,
                }}
                value={body}
              />
              <Text style={{ bottom: 22, color: composerPalette.text, fontSize: 16, fontWeight: "700", position: "absolute", right: 18 }}>
                {body.length}/{MAX_POST_BODY_LENGTH}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={onSubmit}
              style={{
                alignItems: "center",
                backgroundColor: canSubmit ? composerPalette.submit : composerPalette.disabled,
                borderRadius: 12,
                flexDirection: "row",
                gap: 10,
                justifyContent: "center",
                minHeight: 58,
                paddingHorizontal: 18,
              }}
            >
              <Feather name={isPrayer ? "heart" : "book-open"} size={21} color={canSubmit ? composerPalette.onAccent : colors.disabledText} />
              <Text style={{ color: canSubmit ? composerPalette.onAccent : colors.disabledText, fontSize: 18, fontWeight: "700" }}>
                {isPrayer ? (isEditing ? "Update prayer" : "Share for prayer") : (isEditing ? "Update reflection" : "Share gently")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ImageGalleryModal({ gallery, onClose }: { gallery?: ImageGalleryState; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(gallery?.index ?? 0);

  useEffect(() => {
    setPage(gallery?.index ?? 0);
  }, [gallery?.index, gallery?.images]);

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  return (
    <Modal animationType="fade" visible={Boolean(gallery)} onRequestClose={onClose}>
      <View style={{ backgroundColor: colors.cream, flex: 1 }}>
        {gallery ? (
          <>
            <ScrollView
              horizontal
              key={`${gallery.index}-${gallery.images.length}-${gallery.images[0]?.slice(0, 24)}`}
              onMomentumScrollEnd={handleScrollEnd}
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: width * gallery.index, y: 0 }}
            >
              {gallery.images.map((image, index) => (
                <View key={`${index}-${image.slice(0, 24)}`} style={{ alignItems: "center", height, justifyContent: "center", width }}>
                  <Image source={{ uri: image }} style={{ height: "100%", resizeMode: "contain", width: "100%" }} />
                </View>
              ))}
            </ScrollView>
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                left: 0,
                paddingHorizontal: 18,
                paddingTop: 18,
                position: "absolute",
                right: 0,
                top: 0,
              }}
            >
              <Pressable
                accessibilityLabel="Close image"
                accessibilityRole="button"
                hitSlop={10}
                onPress={onClose}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.gold,
                  borderRadius: 999,
                  height: 42,
                  justifyContent: "center",
                  width: 42,
                }}
              >
                <Feather name="x" size={24} color={brandPalette.deepNavy} />
              </Pressable>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>
                {page + 1}/{gallery.images.length}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

function DailyCheckInPrompt({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="Open daily check-in" accessibilityRole="button" onPress={onPress}>
      <Card tone="moss">
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 14 }}>
            <Text selectable style={{ color: colors.olive, fontSize: 12, fontWeight: "700", letterSpacing: 1 }}>
              DAILY CHECK-IN
            </Text>
            <SectionTitle>Open today's check-in</SectionTitle>
            <Body muted>A gentle entry point, not a score to keep.</Body>
          </View>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.gold,
              borderRadius: 999,
              height: 42,
              justifyContent: "center",
              width: 42,
            }}
          >
            <Feather name="chevron-right" size={24} color={brandPalette.deepNavy} />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function DailyCheckInModal({
  visible,
  mood,
  readToday,
  reflectionText,
  visibility,
  onMoodChange,
  onReadTodayChange,
  onReflectionChange,
  onVisibilityChange,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mood: number;
  readToday: boolean;
  reflectionText: string;
  visibility: "private" | "group";
  onMoodChange: (mood: number) => void;
  onReadTodayChange: (readToday: boolean) => void;
  onReflectionChange: (text: string) => void;
  onVisibilityChange: (visibility: "private" | "group") => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const submitLabel = visibility === "private" ? "Save today's check-in" : "Share today's check-in";
  const { height } = useWindowDimensions();
  const modalMaxHeight = Math.max(360, height - 36);
  const contentMaxHeight = Math.max(280, modalMaxHeight - 70);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: "rgba(23, 28, 22, 0.46)", flex: 1, justifyContent: "center", padding: 18 }}>
        <Pressable
          accessibilityLabel="Close daily check-in"
          accessibilityRole="button"
          onPress={onClose}
          style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
        />
        <View
          style={{
            alignSelf: "center",
            backgroundColor: colors.paper,
            borderColor: colors.line,
            borderRadius: 8,
            borderWidth: 1,
            elevation: 18,
            maxWidth: 540,
            overflow: "hidden",
            shadowColor: brandPalette.deepNavy,
            shadowOffset: { width: 0, height: 18 },
            shadowOpacity: 0.22,
            shadowRadius: 34,
            maxHeight: modalMaxHeight,
            width: "100%",
          }}
        >
          <View
            style={{
              alignItems: "center",
              borderBottomColor: colors.line,
              borderBottomWidth: 1,
              flexDirection: "row",
              justifyContent: "center",
              minHeight: 70,
              paddingHorizontal: 18,
            }}
          >
            <Pressable
              accessibilityLabel="Close daily check-in"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={{ alignItems: "center", height: 38, justifyContent: "center", left: 12, position: "absolute", width: 38 }}
            >
              <Feather name="x" size={26} color={colors.ink} />
            </Pressable>
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "700" }}>Daily check-in</Text>
          </View>

          <ScrollView contentContainerStyle={{ gap: 20, padding: 22 }} style={{ maxHeight: contentMaxHeight }}>
            <Body muted>A gentle entry point, not a score to keep.</Body>

            <View>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700", marginBottom: 10 }}>Have you read the Bible today?</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Choice label="Yes" selected={readToday} onPress={() => onReadTodayChange(true)} />
                <Choice label="Not yet" selected={!readToday} onPress={() => onReadTodayChange(false)} />
              </View>
            </View>

            <View style={{ gap: 18 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>How is your heart?</Text>
              <View style={{ flexDirection: "row", width: "100%" }}>
                {moodOptions.map((option) => {
                  const selected = mood === option.value;
                  return (
                    <Pressable
                      accessibilityLabel={`Mood ${option.value}: ${option.label}`}
                      accessibilityRole="button"
                      key={option.value}
                      onPress={() => onMoodChange(option.value)}
                      style={{
                        alignItems: "center",
                        borderColor: selected ? colors.olive : colors.line,
                        borderRadius: 8,
                        borderWidth: 1,
                        flex: 1,
                        gap: 8,
                        minWidth: 0,
                        paddingVertical: 6,
                      }}
                    >
                      <View style={{ alignSelf: "stretch", aspectRatio: 1, overflow: "hidden", paddingHorizontal: 3, width: "100%" }}>
                        <Image source={option.image} style={{ height: "100%", objectFit: "contain", width: "100%" }} />
                      </View>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={{ color: selected ? colors.ink : colors.muted, fontSize: 13, fontWeight: "800", textAlign: "center", width: "100%" }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Field
              multiline
              value={reflectionText}
              onChangeText={onReflectionChange}
              placeholder="Optional reflection. A sentence is enough."
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Choice label="Save privately" selected={visibility === "private"} onPress={() => onVisibilityChange("private")} />
              <Choice label="Share gently" selected={visibility === "group"} onPress={() => onVisibilityChange("group")} />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={onSubmit}
              style={{
                alignItems: "center",
                backgroundColor: colors.gold,
                borderRadius: 12,
                flexDirection: "row",
                gap: 10,
                justifyContent: "center",
                minHeight: 58,
                paddingHorizontal: 18,
              }}
            >
              <Feather name={visibility === "private" ? "lock" : "send"} size={21} color={brandPalette.deepNavy} />
              <Text style={{ color: brandPalette.deepNavy, fontSize: 18, fontWeight: "700" }}>{submitLabel}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EditCheckInModal({
  visible,
  mood,
  readToday,
  text,
  onMoodChange,
  onReadTodayChange,
  onTextChange,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mood: number;
  readToday: boolean;
  text: string;
  onMoodChange: (mood: number) => void;
  onReadTodayChange: (readToday: boolean) => void;
  onTextChange: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = text.trim().length > 0;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: colors.cream, flex: 1, justifyContent: "center", padding: 18 }}>
        <View
          style={{
            alignSelf: "center",
            backgroundColor: colors.paper,
            borderColor: colors.line,
            borderRadius: 8,
            borderWidth: 1,
            maxWidth: 540,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <View
            style={{
              alignItems: "center",
              borderBottomColor: colors.line,
              borderBottomWidth: 1,
              flexDirection: "row",
              justifyContent: "center",
              minHeight: 70,
              paddingHorizontal: 18,
            }}
          >
            <Pressable
              accessibilityLabel="Close edit check-in"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={{ alignItems: "center", height: 38, justifyContent: "center", left: 12, position: "absolute", width: 38 }}
            >
              <Feather name="x" size={26} color={colors.ink} />
            </Pressable>
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "700" }}>Edit check-in</Text>
          </View>

          <View style={{ gap: 20, padding: 22 }}>
            <View>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700", marginBottom: 10 }}>Have you read the Bible today?</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Choice label="Yes" selected={readToday} onPress={() => onReadTodayChange(true)} />
                <Choice label="Not yet" selected={!readToday} onPress={() => onReadTodayChange(false)} />
              </View>
            </View>

            <View style={{ gap: 18 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>How is your heart?</Text>
              <View style={{ flexDirection: "row", width: "100%" }}>
                {moodOptions.map((option) => {
                  const selected = mood === option.value;
                  return (
                    <Pressable
                      accessibilityLabel={`Mood ${option.value}: ${option.label}`}
                      accessibilityRole="button"
                      key={option.value}
                      onPress={() => onMoodChange(option.value)}
                      style={{
                        alignItems: "center",
                        borderColor: selected ? colors.olive : colors.line,
                        borderRadius: 8,
                        borderWidth: 1,
                        flex: 1,
                        gap: 8,
                        minWidth: 0,
                        paddingVertical: 6,
                      }}
                    >
                      <View style={{ alignSelf: "stretch", aspectRatio: 1, overflow: "hidden", paddingHorizontal: 3, width: "100%" }}>
                        <Image source={option.image} style={{ height: "100%", objectFit: "contain", width: "100%" }} />
                      </View>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={{ color: selected ? colors.ink : colors.muted, fontSize: 13, fontWeight: "800", textAlign: "center", width: "100%" }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Field
              multiline
              value={text}
              onChangeText={onTextChange}
              placeholder="Optional reflection. A sentence is enough."
            />

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={onSubmit}
              style={{
                alignItems: "center",
                backgroundColor: canSubmit ? colors.olive : colors.disabled,
                borderRadius: 12,
                flexDirection: "row",
                gap: 10,
                justifyContent: "center",
                minHeight: 58,
                paddingHorizontal: 18,
              }}
            >
              <Feather name="check" size={21} color={canSubmit ? colors.onAccent : colors.disabledText} />
              <Text style={{ color: canSubmit ? colors.onAccent : colors.disabledText, fontSize: 18, fontWeight: "700" }}>
                Update check-in
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function HomeScreen() {
  const { state, dispatch } = useKoino();
  const [mood, setMood] = useState(3);
  const [readToday, setReadToday] = useState(true);
  const [reflectionText, setReflectionText] = useState("");
  const [visibility, setVisibility] = useState<"private" | "group">("private");
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);
  const [postBody, setPostBody] = useState("");
  const [postKind, setPostKind] = useState<ComposerKind>("reflection");
  const [composerVisible, setComposerVisible] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [showOlderSharedItems, setShowOlderSharedItems] = useState(false);
  const [visibleCommentThreads, setVisibleCommentThreads] = useState<Record<string, boolean>>({});
  const [expandedCommentThreads, setExpandedCommentThreads] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyComposerKey, setReplyComposerKey] = useState<string>();
  const [openMenuKey, setOpenMenuKey] = useState<string>();
  const [openReplyMenuId, setOpenReplyMenuId] = useState<string>();
  const [openReplyMenuAnchor, setOpenReplyMenuAnchor] = useState<{ x: number; y: number }>();
  const [imageGallery, setImageGallery] = useState<ImageGalleryState>();
  const [prayerTarget, setPrayerTarget] = useState<PrayerMomentTarget>();
  const [pendingCommentReactions, setPendingCommentReactions] = useState<Record<string, boolean>>({});
  // Edit post state
  const [editPostId, setEditPostId] = useState<string | null>(null);
  const [editPostBody, setEditPostBody] = useState("");
  const [editPostKind, setEditPostKind] = useState<ComposerKind>("reflection");
  // Edit check-in state
  const [editCheckInId, setEditCheckInId] = useState<string | null>(null);
  const [editCheckInMood, setEditCheckInMood] = useState(3);
  const [editCheckInReadToday, setEditCheckInReadToday] = useState(true);
  const [editCheckInText, setEditCheckInText] = useState("");
  const [editCheckInVisible, setEditCheckInVisible] = useState(false);

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const userById = useMemo(() => new Map(state.users.map((user) => [user.id, user.name])), [state.users]);
  const feedItems = useMemo<FeedItem[]>(() => {
    const sharedCheckIns: FeedItem[] = state.checkIns
      .filter((item) => item.groupId === state.currentGroupId && item.visibility === "group")
      .map((item) => ({
        type: "check_in",
        id: item.id,
        userId: item.userId,
        groupId: item.groupId,
        body: item.reflectionText,
        mood: item.mood,
        readToday: item.readToday,
        createdAt: item.createdAt,
      }));
    const posts: FeedItem[] = state.posts
      .filter((item) => item.groupId === state.currentGroupId)
      .map((item) => ({
        type: "post",
        id: item.id,
        userId: item.userId,
        groupId: item.groupId,
        kind: normalizePostKind(item.kind ?? "reflection"),
        body: item.body,
        images: item.images,
        answeredAt: item.answeredAt,
        answeredMarkedAt: item.answeredMarkedAt,
        createdAt: item.createdAt,
      }));
    return [...sharedCheckIns, ...posts]
      .filter((item) => {
        if (feedFilter === "my_reflections") {
          return item.type === "post" && item.userId === state.currentUserId && normalizePostKind(item.kind) === "reflection";
        }
        if (feedFilter === "my_prayer_requests") {
          return item.type === "post" && item.userId === state.currentUserId && item.kind === "prayer_request";
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [feedFilter, state.checkIns, state.currentGroupId, state.currentUserId, state.posts]);
  const todaysCheckIn = useMemo(() => {
    const todayKey = localDayKey(new Date());
    return [...state.checkIns, ...activePrivateCheckIns(state.privateCheckIns, state.journalEntries)].find(
      (item) =>
        item.userId === state.currentUserId &&
        item.groupId === state.currentGroupId &&
        localDayKey(item.createdAt) === todayKey,
    );
  }, [state.checkIns, state.currentGroupId, state.currentUserId, state.journalEntries, state.privateCheckIns]);
  const sharedPostsToday = useMemo(() => {
    const todayKey = localDayKey(new Date());
    const sharedCheckIns = state.checkIns.filter(
      (item) =>
        item.userId === state.currentUserId &&
        item.groupId === state.currentGroupId &&
        item.visibility === "group" &&
        localDayKey(item.createdAt) === todayKey,
    );
    const posts = state.posts.filter(
      (item) =>
        item.userId === state.currentUserId &&
        item.groupId === state.currentGroupId &&
        localDayKey(item.createdAt) === todayKey,
    );
    return sharedCheckIns.length + posts.length;
  }, [state.checkIns, state.currentGroupId, state.currentUserId, state.posts]);
  const shouldShowDailyPostFriction = sharedPostsToday >= DAILY_SHARED_POST_FRICTION_THRESHOLD;
  const visibleFeedItems = showOlderSharedItems ? feedItems : feedItems.slice(0, INITIAL_SHARED_ITEMS);

  useEffect(() => {
    setShowOlderSharedItems(false);
    setVisibleCommentThreads({});
    setExpandedCommentThreads({});
  }, [feedFilter, state.currentGroupId]);

  useEffect(() => {
    if (todaysCheckIn) {
      setCheckInModalVisible(false);
    }
  }, [todaysCheckIn]);

  function submitCheckIn(nextVisibility = visibility) {
    dispatch({ type: "submitCheckIn", mood, readToday, reflectionText, visibility: nextVisibility });
    setCheckInModalVisible(false);
    setReflectionText("");
    setMood(3);
    setReadToday(true);
    setVisibility("private");
  }

  function handleSubmitCheckIn() {
    if (visibility === "group" && shouldShowDailyPostFriction) {
      showDailyPostFriction(() => submitCheckIn("group"), () => submitCheckIn("private"));
      return;
    }

    submitCheckIn();
  }

  function submitPost() {
    dispatch({ type: "createPost", body: postBody, kind: postKind });
    setPostBody("");
    setPostKind("reflection");
    setComposerVisible(false);
  }

   function handleSubmitPost() {
     if (shouldShowDailyPostFriction) {
       showDailyPostFriction(submitPost);
       return;
     }

     submitPost();
   }

   function handleSubmitEditPost() {
     if (shouldShowDailyPostFriction) {
       showDailyPostFriction(() => {
         dispatch({
           type: "editPost",
           id: editPostId!,
           body: editPostBody,
           kind: editPostKind,
         });
         // Clear edit state
         setEditPostId(null);
         setEditPostBody("");
         setEditPostKind("reflection");
         setComposerVisible(false);
       });
       return;
     }

     dispatch({
       type: "editPost",
       id: editPostId!,
       body: editPostBody,
       kind: editPostKind,
     });
     // Clear edit state
     setEditPostId(null);
     setEditPostBody("");
     setEditPostKind("reflection");
      setComposerVisible(false);
    }

   function handleSubmitEditCheckIn() {
     dispatch({
       type: "updateCheckIn",
       id: editCheckInId!,
       mood: editCheckInMood,
       readToday: editCheckInReadToday,
       reflectionText: editCheckInText,
       visibility: "group",
     });
     setEditCheckInId(null);
     setEditCheckInMood(3);
     setEditCheckInReadToday(true);
     setEditCheckInText("");
     setEditCheckInVisible(false);
   }

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 110 }}>
        <Card tone="moss">
          <Text selectable style={{ color: colors.olive, fontSize: 12, fontWeight: "700", letterSpacing: 1 }}>
            TODAY'S RHYTHM
          </Text>
          <SectionTitle>{group?.name ?? "Your group"}</SectionTitle>
          <Body muted>Check in, share honestly when you are ready, pray, and leave encouraged.</Body>
        </Card>

        {!todaysCheckIn ? <DailyCheckInPrompt onPress={() => setCheckInModalVisible(true)} /> : null}

        <Card>
          <SectionTitle>When you want to be known</SectionTitle>
          <Body muted>Offer a reflection or ask your people to pray. No pressure to make every thought shared.</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <FeedActionButton
              iconName="edit-3"
              label="Share reflection"
              onPress={() => {
                setPostBody("");
                setPostKind("reflection");
                setComposerVisible(true);
              }}
            />
            <FeedActionButton
              iconName="heart"
              label="Ask for prayer"
              onPress={() => {
                setPostBody("");
                setPostKind("prayer_request");
                setComposerVisible(true);
              }}
            />
          </View>
        </Card>

        <View style={{ gap: 12 }}>
          <SectionTitle>Shared prayer room</SectionTitle>
          <Body muted>Recent shares for prayer. Older ones can wait until you need them.</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Choice label="Everything" selected={feedFilter === "all"} onPress={() => setFeedFilter("all")} />
            <Choice label="My reflections" selected={feedFilter === "my_reflections"} onPress={() => setFeedFilter("my_reflections")} />
            <Choice
              label="My prayers"
              selected={feedFilter === "my_prayer_requests"}
              onPress={() => setFeedFilter("my_prayer_requests")}
            />
          </View>
          {state.authError ? (
            <Card>
              <Body muted>{state.authError}</Body>
            </Card>
          ) : null}
          {feedItems.length === 0 ? (
            <Card>
              <Body muted>Nothing is shared here yet. This room can stay quiet until someone is ready.</Body>
            </Card>
          ) : (
            visibleFeedItems.map((item) => {
              const targetType = item.type === "post" ? "post" : "check_in";
              const itemKey = `${targetType}:${item.id}`;
              const replies = state.replies
                .filter((reply) => reply.targetType === targetType && reply.targetId === item.id)
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
              const isPost = item.type === "post";
              const isPrayerRequest = item.type === "post" && item.kind === "prayer_request";
              const isReflection = item.type === "post" && item.kind === "reflection";
              const itemImages = item.type === "post" ? item.images ?? [] : [];
              const prayed = state.prayerReactions.some(
                (reaction) => reaction.userId === state.currentUserId && reaction.targetType === targetType && reaction.targetId === item.id,
              );
              const prayerCount = new Set(
                state.prayerReactions
                  .filter((reaction) => reaction.targetType === targetType && reaction.targetId === item.id)
                  .map((reaction) => reaction.userId),
              ).size;
              const prayerPresenceLabel = prayerCount === 1 ? "Someone has prayed here." : "Prayer has been offered here.";
              const ownsItem = item.userId === state.currentUserId;
              const authorName = userById.get(item.userId) ?? "Someone";
              const replyComposerOpen = replyComposerKey === itemKey;
              const itemLabel = item.type === "check_in" ? "check-in" : isPrayerRequest ? "prayer request" : "reflection";
              const menuOpen = openMenuKey === itemKey;
              const replyMenuOpenInItem = replies.some((reply) => reply.id === openReplyMenuId);
              const commentsVisible = visibleCommentThreads[itemKey] ?? false;
              const commentsExpanded = expandedCommentThreads[itemKey] ?? false;
              const visibleReplies = commentsVisible
                ? replies.slice(0, commentsExpanded ? replies.length : INITIAL_VISIBLE_COMMENTS)
                : [];
              const hiddenReplyCount = replies.length - visibleReplies.length;

              return (
                <Card
                  key={`${item.type}-${item.id}`}
                  style={{
                    elevation: menuOpen || replyMenuOpenInItem ? 24 : 0,
                    position: "relative",
                    zIndex: menuOpen || replyMenuOpenInItem ? 2000 : 0,
                  }}
                >
                  <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.accentSubtle,
                        borderColor: colors.line,
                        borderRadius: 999,
                        borderWidth: 1,
                        height: 52,
                        justifyContent: "center",
                        width: 52,
                      }}
                    >
                      <Text style={{ color: brandPalette.deepNavy, fontSize: 17, fontWeight: "700" }}>{initials(authorName) || "?"}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3, paddingRight: ownsItem ? 10 : 0 }}>
                      <Text selectable style={{ color: colors.ink, fontSize: 18, fontWeight: "700" }}>
                        {authorName}
                      </Text>
                      <Text selectable style={{ color: colors.muted, fontSize: 15, fontWeight: "600" }}>
                        {formatRelativeTime(item.createdAt)}
                        {item.type === "check_in" ? ` - ${moodLabel(item.mood)}` : ""}
                      </Text>
                    </View>
                    {ownsItem ? (
                      <View
                        style={{
                          elevation: menuOpen ? 25 : 0,
                          position: "relative",
                          zIndex: menuOpen ? 1001 : 1,
                        }}
                      >
                        <Pressable
                          accessibilityLabel="Sharing options"
                          accessibilityRole="button"
                          hitSlop={10}
                          onPress={() => setOpenMenuKey((current) => (current === itemKey ? undefined : itemKey))}
                          style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}
                        >
                          <Feather name="more-horizontal" size={24} color={colors.ink} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>

                   {menuOpen ? (
                     <View
                       style={{
                         backgroundColor: colors.elevated,
                         borderColor: colors.line,
                         borderRadius: 12,
                         borderWidth: 1,
                         elevation: 26,
                         minWidth: 132,
                         paddingVertical: 6,
                         position: "absolute",
                         right: 18,
                         top: 56,
                         zIndex: 1002,
                       }}
                     >
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setOpenMenuKey(undefined);
                            if (item.type === "check_in") {
                              const checkInToEdit = state.checkIns.find(ci => ci.id === item.id);
                              if (checkInToEdit) {
                                setEditCheckInId(checkInToEdit.id);
                                setEditCheckInMood(checkInToEdit.mood);
                                setEditCheckInReadToday(checkInToEdit.readToday);
                                setEditCheckInText(checkInToEdit.reflectionText);
                                setEditCheckInVisible(true);
                              }
                            } else {
                              const postToEdit = state.posts.find(post => post.id === item.id);
                              if (postToEdit) {
                                setEditPostId(postToEdit.id);
                                setEditPostBody(postToEdit.body);
                                setEditPostKind(normalizePostKind(postToEdit.kind ?? "reflection"));
                                setComposerVisible(true);
                              }
                            }
                          }}
                         style={{ alignItems: "center", flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}
                       >
                         <Feather name="edit-2" size={16} color={colors.ink} />
                         <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>Edit</Text>
                       </Pressable>
                       <Pressable
                         accessibilityRole="button"
                         onPress={() => {
                           setOpenMenuKey(undefined);
                           confirmAction({
                             title: `Delete ${itemLabel}?`,
                             message: "This will remove it from the shared room.",
                             confirmText: "Delete",
                             destructive: true,
                             onConfirm: () =>
                               dispatch({
                                 type: item.type === "check_in" ? "deleteCheckIn" : "deletePost",
                                 id: item.id,
                               }),
                           });
                         }}
                         style={{ alignItems: "center", flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}
                       >
                         <Feather name="trash-2" size={16} color={colors.danger} />
                         <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "700" }}>Delete</Text>
                       </Pressable>
                     </View>
                   ) : null}

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {item.type === "check_in" ? (
                      <>
                        <FeedTypeBadge iconName="check-circle" label="Check-in" tone="moss" />
                        <FeedTypeBadge
                          iconName={item.readToday ? "book-open" : "book"}
                          label={item.readToday ? "Bible read today" : "Bible not read yet"}
                          tone={item.readToday ? "moss" : "gold"}
                        />
                      </>
                    ) : isPrayerRequest ? (
                      <FeedTypeBadge iconName="heart" label="Prayer" tone="rose" />
                    ) : isReflection ? (
                      <FeedTypeBadge iconName="book-open" label="Reflection" tone="moss" />
                    ) : null}
                    {isPrayerRequest && item.answeredAt ? (
                      <FeedTypeBadge iconName="check-circle" label="Answered" tone="moss" />
                    ) : null}
                  </View>

                  {item.body || itemImages.length === 0 ? (
                    <ExpandableFeedText>{item.body || "No words today, just presence."}</ExpandableFeedText>
                  ) : null}

                  {isPost ? <PostImages images={itemImages} onOpen={(index) => setImageGallery({ images: itemImages, index })} /> : null}

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                    <FeedActionButton
                      iconName="heart"
                      label={prayed ? "Prayed" : "Pray with this"}
                      selected={prayed}
                      onPress={() => {
                        if (prayed) {
                          dispatch({ type: "unpray", targetType, targetId: item.id });
                          return;
                        }
                        setPrayerTarget({ targetType, targetId: item.id, body: item.body });
                      }}
                    />
                    <FeedActionButton
                      iconName="message-circle"
                      label="Leave a word"
                      selected={replyComposerOpen}
                      onPress={() => setReplyComposerKey((current) => (current === itemKey ? undefined : itemKey))}
                    />
                  </View>

                  {prayerCount > 0 ? (
                    <Text selectable style={{ color: colors.muted, fontSize: 14, fontWeight: "600" }}>
                      {prayerPresenceLabel}
                    </Text>
                  ) : null}

                  {isPrayerRequest && ownsItem ? (
                    <PillButton
                      variant="secondary"
                      onPress={() => {
                        dispatch(item.answeredAt ? { type: "unmarkPrayerAnswered", id: item.id } : { type: "markPrayerAnswered", id: item.id });
                      }}
                    >
                      {item.answeredAt ? "Unmark answered" : "Mark answered"}
                    </PillButton>
                  ) : null}

                  {replies.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: commentsVisible }}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        if (commentsVisible && replyMenuOpenInItem) {
                          setOpenReplyMenuId(undefined);
                          setOpenReplyMenuAnchor(undefined);
                        }
                        setVisibleCommentThreads((current) => ({ ...current, [itemKey]: !commentsVisible }));
                        setExpandedCommentThreads((current) => ({ ...current, [itemKey]: false }));
                      }}
                      style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 8, paddingVertical: 4 }}
                    >
                      <Feather name="message-circle" size={17} color={colors.olive} />
                      <Text style={{ color: colors.olive, fontSize: 15, fontWeight: "800" }}>
                        {commentsVisible ? "Hide comments" : `Show comments (${replies.length})`}
                      </Text>
                    </Pressable>
                  ) : null}

                  {commentsVisible && visibleReplies.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {visibleReplies.map((reply) => (
                        <View
                          key={reply.id}
                          style={{
                            borderLeftColor: colors.moss,
                            borderLeftWidth: 3,
                            elevation: openReplyMenuId === reply.id ? 30 : 0,
                            paddingLeft: 10,
                            position: "relative",
                            zIndex: openReplyMenuId === reply.id ? 3000 : 0,
                          }}
                        >
                          {(() => {
                            const replyPrayed = state.prayerReactions.some(
                              (reaction) =>
                                reaction.targetType === "reply" && reaction.targetId === reply.id && reaction.userId === state.currentUserId,
                            );
                            const replyPrayerCount = new Set(
                              state.prayerReactions
                                .filter((reaction) => reaction.targetType === "reply" && reaction.targetId === reply.id)
                                .map((reaction) => reaction.userId),
                            ).size;
                            const replyPrayerPresenceLabel =
                              replyPrayerCount === 1 ? "Someone has prayed here." : "Prayer has been offered here.";
                            const replyCommentReactions = state.commentReactions.filter((reaction) => reaction.replyId === reply.id);

                            return (
                              <>
                                <View style={{ flexDirection: "row", gap: 10 }}>
                                  <View style={{ flex: 1 }}>
                                    <Body>
                                      {userById.get(reply.userId) ?? "Someone"}: {reply.body}
                                    </Body>
                                  </View>
                                  {reply.userId === state.currentUserId ? (
                                    <View>
                                      <Pressable
                                        accessibilityLabel="Reply options"
                                        accessibilityRole="button"
                                        hitSlop={10}
                                        onPress={(event) => {
                                          if (openReplyMenuId === reply.id) {
                                            setOpenReplyMenuId(undefined);
                                            setOpenReplyMenuAnchor(undefined);
                                            return;
                                          }
                                          const { pageX, pageY } = event.nativeEvent;
                                          setOpenReplyMenuAnchor({ x: pageX, y: pageY });
                                          setOpenReplyMenuId(reply.id);
                                        }}
                                        style={{ alignItems: "center", height: 28, justifyContent: "center", width: 28 }}
                                      >
                                        <Feather name="more-horizontal" size={18} color={colors.ink} />
                                      </Pressable>
                                    </View>
                                  ) : null}
                                </View>
                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                                  <Pressable
                                    onPress={() => {
                                      if (replyPrayed) {
                                        dispatch({ type: "unpray", targetType: "reply", targetId: reply.id });
                                        return;
                                      }
                                      setPrayerTarget({ targetType: "reply", targetId: reply.id, body: reply.body });
                                    }}
                                    style={{ alignSelf: "flex-start", paddingVertical: 6 }}
                                  >
                                    <Text style={{ color: replyPrayed ? colors.olive : colors.clay, fontWeight: "700" }}>
                                      {replyPrayed ? `Prayed (${replyPrayerCount})` : `Pray (${replyPrayerCount})`}
                                    </Text>
                                  </Pressable>
                                  {commentReactionOptions.map((option) => {
                                    const reactionKey = `${reply.id}:${option.kind}`;
                                    const serverSelected = replyCommentReactions.some(
                                      (reaction) => reaction.kind === option.kind && reaction.userId === state.currentUserId,
                                    );
                                    const selected = pendingCommentReactions[reactionKey] ?? serverSelected;
                                    const reactionCount = replyCommentReactions.filter((reaction) => reaction.kind === option.kind).length;
                                    const projectedCount = selected === serverSelected ? reactionCount : reactionCount + (selected ? 1 : -1);
                                    const label = `${option.label} (${Math.max(projectedCount, 0)})`;

                                    return (
                                      <Pressable
                                        key={option.kind}
                                        onPress={() => {
                                          setPendingCommentReactions((pending) => {
                                            const next = { ...pending };
                                            commentReactionOptions.forEach((reactionOption) => {
                                              const key = `${reply.id}:${reactionOption.kind}`;
                                              const currentServerSelected = replyCommentReactions.some(
                                                (reaction) => reaction.kind === reactionOption.kind && reaction.userId === state.currentUserId,
                                              );
                                              const currentSelected = pending[key] ?? currentServerSelected;
                                              if (reactionOption.kind === option.kind) {
                                                next[key] = !currentSelected;
                                                return;
                                              }
                                              if (currentSelected) {
                                                next[key] = false;
                                                return;
                                              }
                                              delete next[key];
                                            });
                                            return next;
                                          });
                                          void dispatch({ type: "toggleCommentReaction", replyId: reply.id, kind: option.kind }).finally(() => {
                                            setPendingCommentReactions((pending) => {
                                              const next = { ...pending };
                                              commentReactionOptions.forEach((reactionOption) => {
                                                delete next[`${reply.id}:${reactionOption.kind}`];
                                              });
                                              return next;
                                            });
                                          });
                                        }}
                                        style={{ alignSelf: "flex-start", paddingVertical: 6 }}
                                      >
                                        <Text style={{ color: selected ? colors.olive : colors.clay, fontWeight: "700" }}>{label}</Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                                {replyPrayerCount > 0 ? (
                                  <Text selectable style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>
                                    {replyPrayerPresenceLabel}
                                  </Text>
                                ) : null}
                              </>
                            );
                          })()}
                        </View>
                      ))}
                      {hiddenReplyCount > 0 || (commentsExpanded && replies.length > INITIAL_VISIBLE_COMMENTS) ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: commentsExpanded }}
                          onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            if (commentsExpanded && replyMenuOpenInItem) {
                              setOpenReplyMenuId(undefined);
                              setOpenReplyMenuAnchor(undefined);
                            }
                            setExpandedCommentThreads((current) => ({ ...current, [itemKey]: !commentsExpanded }));
                          }}
                          style={{ alignSelf: "flex-start", paddingVertical: 4 }}
                        >
                          <Text style={{ color: colors.olive, fontSize: 15, fontWeight: "800" }}>
                            {commentsExpanded ? "Show fewer comments" : `Show more comments (${hiddenReplyCount})`}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  {replyComposerOpen ? (
                    <View style={{ gap: 10 }}>
                      <Field
                        value={replyDrafts[itemKey] ?? ""}
                        onChangeText={(value) => setReplyDrafts((drafts) => ({ ...drafts, [itemKey]: value.slice(0, 500) }))}
                        placeholder="A short word of care"
                      />
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                        <PillButton
                          disabled={!replyDrafts[itemKey]?.trim()}
                          onPress={() => {
                            dispatch({ type: "createReply", targetType, targetId: item.id, body: replyDrafts[itemKey] ?? "" });
                            setVisibleCommentThreads((current) => ({ ...current, [itemKey]: true }));
                            setExpandedCommentThreads((current) => ({ ...current, [itemKey]: false }));
                            setReplyDrafts((drafts) => ({ ...drafts, [itemKey]: "" }));
                            setReplyComposerKey(undefined);
                          }}
                        >
                          Send encouragement
                        </PillButton>
                        <PillButton variant="ghost" onPress={() => setReplyComposerKey(undefined)}>
                          Cancel
                        </PillButton>
                      </View>
                    </View>
                  ) : null}

                </Card>
              );
            })
          )}
          {!showOlderSharedItems && feedItems.length > visibleFeedItems.length ? (
            <PillButton variant="ghost" onPress={() => setShowOlderSharedItems(true)}>
              Show older shares
            </PillButton>
          ) : null}
        </View>
      </ScrollView>

       <CreatePostModal
         visible={composerVisible}
         kind={editPostId ? editPostKind : postKind}
         body={editPostId ? editPostBody : postBody}
         onKindChange={editPostId ? setEditPostKind : setPostKind}
         onBodyChange={editPostId ? setEditPostBody : setPostBody}
         onClose={() => {
           setComposerVisible(false);
           // Clear edit state when closing
           if (editPostId) {
             setEditPostId(null);
             setEditPostBody("");
             setEditPostKind("reflection");
           }
         }}
         onSubmit={editPostId ? handleSubmitEditPost : handleSubmitPost}
         isEditing={!!editPostId}
       />

       <Modal
         animationType="fade"
         transparent
         visible={Boolean(openReplyMenuId)}
         onRequestClose={() => {
           setOpenReplyMenuId(undefined);
           setOpenReplyMenuAnchor(undefined);
         }}
       >
         <Pressable
           onPress={() => {
             setOpenReplyMenuId(undefined);
             setOpenReplyMenuAnchor(undefined);
           }}
           style={{ backgroundColor: "transparent", flex: 1 }}
         >
           <View style={{ flex: 1 }}>
             <Pressable
               accessibilityRole="button"
               onPress={() => {
                 const replyId = openReplyMenuId;
                 setOpenReplyMenuId(undefined);
                 setOpenReplyMenuAnchor(undefined);
                 if (!replyId) return;
                 confirmAction({
                   title: "Delete reply?",
                   message: "This reply will be removed from the shared room.",
                   confirmText: "Delete",
                   destructive: true,
                   onConfirm: () => dispatch({ type: "deleteReply", id: replyId }),
                 });
               }}
               style={{
                 alignItems: "center",
                 backgroundColor: colors.elevated,
                 borderColor: colors.line,
                 borderRadius: 10,
                 borderWidth: 1,
                 elevation: 45,
                 flexDirection: "row",
                 gap: 8,
                 left: Math.max(12, (openReplyMenuAnchor?.x ?? 12) - 116),
                 minWidth: 140,
                 paddingHorizontal: 12,
                 paddingVertical: 10,
                 position: "absolute",
                 top: Math.max(12, (openReplyMenuAnchor?.y ?? 12) + 18),
               }}
             >
               <Feather name="trash-2" size={14} color={colors.danger} />
               <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "700" }}>Delete</Text>
             </Pressable>
           </View>
         </Pressable>
       </Modal>

       <ImageGalleryModal gallery={imageGallery} onClose={() => setImageGallery(undefined)} />

       <DailyCheckInModal
         visible={checkInModalVisible && !todaysCheckIn}
         mood={mood}
         readToday={readToday}
         reflectionText={reflectionText}
         visibility={visibility}
         onMoodChange={setMood}
         onReadTodayChange={setReadToday}
         onReflectionChange={setReflectionText}
         onVisibilityChange={setVisibility}
         onClose={() => setCheckInModalVisible(false)}
         onSubmit={handleSubmitCheckIn}
       />

       <EditCheckInModal
         visible={editCheckInVisible}
         mood={editCheckInMood}
         readToday={editCheckInReadToday}
         text={editCheckInText}
         onMoodChange={setEditCheckInMood}
         onReadTodayChange={setEditCheckInReadToday}
         onTextChange={setEditCheckInText}
         onClose={() => {
           setEditCheckInVisible(false);
           setEditCheckInId(null);
           setEditCheckInMood(3);
           setEditCheckInReadToday(true);
           setEditCheckInText("");
         }}
         onSubmit={handleSubmitEditCheckIn}
       />

       <PrayerMoment
        target={prayerTarget}
        onClose={() => setPrayerTarget(undefined)}
        onFinish={(status, startedAt) => {
          if (prayerTarget) {
            dispatch({ type: "finishPrayer", targetType: prayerTarget.targetType, targetId: prayerTarget.targetId, status, startedAt });
          }
          setPrayerTarget(undefined);
        }}
      />
    </Screen>
  );
}

