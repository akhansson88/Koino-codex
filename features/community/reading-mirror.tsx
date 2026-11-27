import { Feather } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import type { CommunityMember } from "@/features/community/types";
import type { MirrorStatus } from "@/state/reading-mirror";
import { Avatar } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadows } from "@/ui/theme";

const liveColor = "#2F6BFF";
const pausedColor = "#D8403A";

export type MirrorBarStatus = MirrorStatus | "paused";

function statusCopy(status: MirrorBarStatus) {
  if (status === "connecting") return "reading.mirror.connecting" as const;
  if (status === "paused") return "reading.mirror.paused" as const;
  if (status === "stale") return "reading.mirror.stale" as const;
  if (status === "ended") return "reading.mirror.ended" as const;
  return "reading.mirror.live" as const;
}

/**
 * A compact pill over the reader while another member's reading is mirrored.
 * It states what is being watched, lets the reader pause, follow again or stop,
 * and turns from blue to red the moment the mirror is no longer live.
 */
export function ReadingMirrorBar({
  bottom,
  chapterLabel,
  compareExpanded,
  compareLabel,
  image,
  name,
  onFollowAgain,
  onStop,
  onToggleCompareView,
  status,
}: {
  bottom: number;
  chapterLabel: string;
  compareExpanded?: boolean;
  compareLabel?: string;
  image?: CommunityMember["image"];
  name: string;
  onFollowAgain: () => void;
  onStop: () => void;
  onToggleCompareView?: () => void;
  status: MirrorBarStatus;
}) {
  const { t } = useAppTranslation();
  const live = status === "live" || status === "connecting";
  const tone = live ? liveColor : pausedColor;
  const canFollowAgain = status === "paused" || status === "stale";

  return <View pointerEvents="box-none" style={[styles.barWrap, { bottom }]}>
    <View style={[styles.bar, { borderColor: live ? "rgba(47,107,255,0.28)" : "rgba(216,64,58,0.32)" }]}>
      <Avatar image={image} name={name} size={30} status={live ? "online" : "inactive"} tone="blue" />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: tone, opacity: live ? 1 : 0.85 }]} />
          <Text numberOfLines={1} style={styles.title}>
            {t("reading.mirror.following", { name })}
          </Text>
          <View style={[styles.tag, { backgroundColor: live ? "rgba(47,107,255,0.10)" : "rgba(216,64,58,0.10)" }]}>
            <Text numberOfLines={1} style={[styles.tagText, { color: tone }]}>
              {t("reading.mirror.readOnly")}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={[styles.detail, { color: live ? colors.textSecondary : pausedColor }]}>
          {status === "live"
            ? [chapterLabel, compareLabel].filter(Boolean).join(" · ")
            : t(statusCopy(status), { name })}
        </Text>
      </View>
      {canFollowAgain ? (
        <Pressable
          accessibilityRole="button"
          onPress={onFollowAgain}
          style={({ pressed }) => [styles.followAgain, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="corner-down-right" size={13} color={colors.paper} />
          <Text style={styles.followAgainText}>{t("reading.mirror.followAgain")}</Text>
        </Pressable>
      ) : null}
      {onToggleCompareView && compareLabel ? (
        <Pressable
          accessibilityLabel={t(compareExpanded ? "reading.mirror.showOne" : "reading.mirror.showBoth")}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onToggleCompareView}
          style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name={compareExpanded ? "square" : "columns"} size={15} color={colors.muted} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel={t("reading.mirror.stop")}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onStop}
        style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Feather name="x" size={16} color={colors.muted} />
      </Pressable>
    </View>
  </View>;
}

/**
 * A soft blue halo around the reading area while mirrored, turning red when the
 * mirror pauses or the other member stops. Several translucent rounded borders
 * give a blurred edge without a heavy blur view, and the halo breathes slowly
 * so it reads as live; motion is dropped when the reader prefers reduced motion.
 */
export function ReadingMirrorOutline({
  reducedMotion,
  status,
}: {
  reducedMotion: boolean;
  status: MirrorBarStatus;
}) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  const live = status === "live" || status === "connecting";

  useEffect(() => {
    if (reducedMotion || !live) {
      pulse.stopAnimation();
      pulse.setValue(0.55);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { duration: 1800, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true }),
      Animated.timing(pulse, { duration: 1800, easing: Easing.inOut(Easing.quad), toValue: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [live, pulse, reducedMotion]);

  const color = live ? liveColor : pausedColor;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Animated.View
      style={[
        styles.haloHaze,
        {
          borderColor: color,
          opacity: live ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.10] }) : 0.08,
        },
      ]}
    />
    <Animated.View
      style={[
        styles.haloOuter,
        {
          borderColor: color,
          boxShadow: live ? "0 0 26px rgba(47,107,255,0.26)" : "0 0 22px rgba(216,64,58,0.22)",
          opacity: live ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.30] }) : 0.26,
          shadowColor: color,
        },
      ]}
    />
    <View style={[styles.haloMid, { borderColor: color }]} />
    <View style={[styles.haloInner, { borderColor: color }]} />
  </View>;
}

const styles = StyleSheet.create({
  barWrap: {
    alignItems: "center",
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 40,
  },
  bar: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    maxWidth: 560,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: "100%",
    ...shadows.card,
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minWidth: 0,
  },
  dot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  title: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  detail: {
    fontSize: 12,
    lineHeight: 16,
  },
  followAgain: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  followAgainText: {
    color: colors.paper,
    fontSize: 12,
    fontWeight: "700",
  },
  close: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 26,
  },
  haloHaze: {
    borderRadius: 36,
    borderWidth: 26,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  haloOuter: {
    borderRadius: 30,
    borderWidth: 14,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    shadowColor: liveColor,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    top: 0,
  },
  haloMid: {
    borderRadius: 24,
    borderWidth: 5,
    bottom: 8,
    left: 8,
    opacity: 0.32,
    position: "absolute",
    right: 8,
    top: 8,
  },
  haloInner: {
    borderRadius: 20,
    borderWidth: 1.5,
    bottom: 12,
    left: 12,
    opacity: 0.9,
    position: "absolute",
    right: 12,
    top: 12,
  },
});
