import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bibleBookLanguage, displayBibleBookName } from "@/features/bible-book-names";
import type { BiblePosition } from "@/features/bible-kjv";
import type { CommunityMember } from "@/features/community/types";
import AsyncStorage from "@/state/encryption/local-storage";
import type { ReadingEntry } from "@/state/reading-model";
import { compareReadingEntries } from "@/state/reading-model";
import { Avatar } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadows } from "@/ui/theme";

const bubbleSize = 52;
const edge = 10;
const topInsetOffset = 62;

type BubblePlacement = { side: "left" | "right"; y: number };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function placementKey(userId?: string, groupId?: string) {
  return userId && groupId ? `koino.readingBubble.${userId}.${groupId}` : undefined;
}

/**
 * A chat-head style bubble over the reader. It never takes space from the
 * text, can be dragged anywhere and snaps to the nearest edge, remembers where
 * it was left, collapses by itself, and can be dismissed to the reader menu.
 */
export function ReadingBubble({
  currentPosition,
  currentUserId,
  entries,
  groupId,
  members,
  onFollow,
  onHide,
  onOpenSheet,
  userId,
}: {
  currentPosition: BiblePosition;
  currentUserId?: string;
  entries: ReadingEntry[];
  groupId?: string;
  members: CommunityMember[];
  onFollow: (entry: ReadingEntry) => void;
  onHide: () => void;
  onOpenSheet: () => void;
  userId?: string;
}) {
  const { language, t } = useAppTranslation();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [drag, setDrag] = useState<{ left: number; top: number }>();
  const [placement, setPlacement] = useState<BubblePlacement>({ side: "right", y: 0.26 });
  const key = placementKey(userId, groupId);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const live = entries
    .filter((entry) => entry.status === "live" && entry.userId !== currentUserId)
    .sort((left, right) => compareReadingEntries(left, right, currentPosition));

  const minTop = insets.top + topInsetOffset;
  const maxTop = height - bubbleSize - 150;
  const geometry = useMemo(() => ({
    left: placement.side === "right" ? width - bubbleSize - edge : edge,
    top: minTop + clamp(placement.y, 0, 1) * Math.max(0, maxTop - minTop),
  }), [maxTop, minTop, placement, width]);

  const liveRef = useRef({ geometry, height, width, insets });
  liveRef.current = { geometry, height, width, insets };

  useEffect(() => {
    let active = true;
    if (!key) return () => { active = false; };
    void AsyncStorage.getItem(key).then((value) => {
      if (!active || !value) return;
      try {
        const parsed = JSON.parse(value) as Partial<BubblePlacement>;
        if (parsed.side === "left" || parsed.side === "right") {
          setPlacement({ side: parsed.side, y: typeof parsed.y === "number" ? clamp(parsed.y, 0, 1) : 0.26 });
        }
      } catch {
        // A corrupt preference simply falls back to the default corner.
      }
    });
    return () => { active = false; };
  }, [key]);

  // A bubble that follows the text is noise: put it away when the chapter
  // changes, and close an open panel after a quiet moment.
  useEffect(() => {
    setExpanded(false);
  }, [currentPosition.book, currentPosition.chapter]);
  useEffect(() => {
    if (!expanded) return undefined;
    const timer = setTimeout(() => setExpanded(false), 12000);
    return () => clearTimeout(timer);
  }, [expanded]);

  const persist = useCallback((next: BubblePlacement) => {
    if (!key) return;
    void AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => undefined);
  }, [key]);

  const gesture = useRef({ moved: false, startX: 0, startY: 0, x: 0, y: 0 });

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: (_event, state) => Math.abs(state.dx) > 6 || Math.abs(state.dy) > 6,
    onMoveShouldSetPanResponderCapture: (_event, state) => Math.abs(state.dx) > 6 || Math.abs(state.dy) > 6,
    onPanResponderGrant: () => {
      const current = liveRef.current.geometry;
      gesture.current = { moved: false, startX: current.left, startY: current.top, x: current.left, y: current.top };
    },
    onPanResponderMove: (_event, state) => {
      if (Math.abs(state.dx) > 6 || Math.abs(state.dy) > 6) gesture.current.moved = true;
      if (!gesture.current.moved) return;
      setDragging(true);
      const { height: windowHeight, insets: windowInsets, width: windowWidth } = liveRef.current;
      const x = clamp(gesture.current.startX + state.dx, edge, windowWidth - bubbleSize - edge);
      const y = clamp(gesture.current.startY + state.dy, windowInsets.top + topInsetOffset, windowHeight - bubbleSize - 150);
      gesture.current.x = x;
      gesture.current.y = y;
      setExpanded(false);
      setDrag({ left: x, top: y });
    },
    onPanResponderRelease: () => {
      setDragging(false);
      if (!gesture.current.moved) {
        setDrag(undefined);
        setExpanded((value) => !value);
        return;
      }
      const { height: windowHeight, insets: windowInsets, width: windowWidth } = liveRef.current;
      const side: BubblePlacement["side"] = gesture.current.x + bubbleSize / 2 < windowWidth / 2 ? "left" : "right";
      const min = windowInsets.top + topInsetOffset;
      const max = windowHeight - bubbleSize - 150;
      const y = max > min ? (gesture.current.y - min) / (max - min) : 0;
      const next: BubblePlacement = { side, y: clamp(y, 0, 1) };
      setDrag(undefined);
      setPlacement(next);
      persist(next);
    },
    onPanResponderTerminate: () => {
      setDragging(false);
      setDrag(undefined);
    },
    onPanResponderTerminationRequest: () => false,
  })).current;

  const position = drag ?? geometry;
  const visibleRows = live.slice(0, 4);
  const panelWidth = Math.min(302, width - 16 * 2);
  const panelHeight = Math.min(360, 66 + visibleRows.length * 46 + 46);
  const placeRight = position.left + bubbleSize + 8 + panelWidth <= width - 8;
  const panelLeft = clamp(placeRight ? position.left + bubbleSize + 8 : position.left - panelWidth - 8, 8, width - panelWidth - 8);
  const panelTop = clamp(position.top - 6, insets.top + 56, Math.max(insets.top + 56, height - panelHeight - insets.bottom - 76));

  if (live.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 26 }}>
      {expanded ? (
        <View
          style={[{
            backgroundColor: colors.paper,
            borderColor: colors.line,
            borderRadius: radius.lg,
            borderWidth: 1,
            left: panelLeft,
            padding: 12,
            position: "absolute",
            top: panelTop,
            width: panelWidth,
          }, shadows.raised]}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 6 }}>
            <View style={{ backgroundColor: colors.moss, borderRadius: 999, height: 7, width: 7 }} />
            <Text style={{ color: colors.ink, flex: 1, fontSize: 14, fontWeight: "700" }}>{t("reading.title")}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{live.length}</Text>
            <Pressable
              accessibilityLabel={t("reading.bubble.minimize")}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => setExpanded(false)}
              style={{ alignItems: "center", height: 28, justifyContent: "center", width: 28 }}
            >
              <Feather name="minus" size={16} color={colors.muted} />
            </Pressable>
            <Pressable
              accessibilityLabel={t("reading.bubble.hide")}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => { setExpanded(false); onHide(); }}
              style={{ alignItems: "center", height: 28, justifyContent: "center", width: 28 }}
            >
              <Feather name="x" size={16} color={colors.muted} />
            </Pressable>
          </View>

          {visibleRows.map((entry, index) => {
            const member = memberById.get(entry.userId);
            const name = member?.name ?? t("common.someone");
            const reference = `${displayBibleBookName(entry.book, bibleBookLanguage(language, entry.versionId))} ${entry.chapter}${entry.scope === "verse" && entry.verse ? `:${entry.verse}` : ""}`;
            return (
              <Pressable
                accessibilityLabel={`${name}, ${reference}. ${t("reading.follow")}`}
                accessibilityRole="button"
                key={entry.userId}
                onPress={() => { setExpanded(false); onFollow(entry); }}
                style={({ pressed }) => ({
                  alignItems: "center",
                  borderRadius: radius.md,
                  flexDirection: "row",
                  gap: 9,
                  minHeight: 44,
                  opacity: pressed ? 0.65 : 1,
                  paddingHorizontal: 2,
                })}
              >
                <Avatar image={member?.image} name={name} size={26} status="online" tone={index % 2 ? "green" : "orange"} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>{firstName(name)}</Text>
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>
                    {reference}{entry.scope === "chapter" ? ` · ${t("reading.sheet.chapterOnly")}` : ""}
                  </Text>
                </View>
                <Feather name="corner-down-right" size={13} color={colors.muted} />
              </Pressable>
            );
          })}

          {live.length > visibleRows.length ? (
            <Text style={{ color: colors.muted, fontSize: 11, paddingBottom: 4, paddingHorizontal: 2 }}>
              {t("reading.bubble.more", { count: live.length - visibleRows.length })}
            </Text>
          ) : null}

          <View style={{ borderTopColor: colors.line, borderTopWidth: 1, marginTop: 4 }}>
            <Pressable
              accessibilityLabel={t("reading.share.title")}
              accessibilityRole="button"
              onPress={() => { setExpanded(false); onOpenSheet(); }}
              style={({ pressed }) => ({ alignItems: "center", flexDirection: "row", gap: 6, minHeight: 40, opacity: pressed ? 0.65 : 1, paddingHorizontal: 2 })}
            >
              <Feather name="eye" size={13} color={colors.muted} />
              <Text numberOfLines={1} style={{ color: colors.muted, flex: 1, fontSize: 12 }}>{t("reading.share.title")}</Text>
              <Feather name="chevron-right" size={14} color={colors.muted} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View
        {...responder.panHandlers}
        accessibilityLabel={`${t("reading.title")}. ${t("reading.pill.count", { count: live.length })}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={{
          alignItems: "center",
          backgroundColor: colors.paper,
          borderColor: colors.line,
          borderRadius: bubbleSize / 2,
          borderWidth: 1,
          height: bubbleSize,
          justifyContent: "center",
          left: position.left,
          opacity: dragging ? 0.85 : 1,
          position: "absolute",
          top: position.top,
          width: bubbleSize,
          ...shadows.raised,
        }}
      >
        <View style={{ flexDirection: "row", height: 22 }}>
          {live.slice(0, 2).map((entry, index) => (
            <View key={entry.userId} style={{ marginLeft: index === 0 ? 0 : -8 }}>
              <Avatar
                image={memberById.get(entry.userId)?.image}
                name={memberById.get(entry.userId)?.name ?? "K"}
                size={22}
                status="online"
                tone={index % 2 ? "green" : "orange"}
              />
            </View>
          ))}
        </View>
        <View style={{
          alignItems: "center",
          backgroundColor: colors.ink,
          borderColor: colors.paper,
          borderRadius: 999,
          borderWidth: 1.5,
          justifyContent: "center",
          minWidth: 18,
          paddingHorizontal: 4,
          position: "absolute",
          right: -2,
          top: -2,
        }}>
          <Text style={{ color: colors.paper, fontSize: 10, fontWeight: "700" }}>{live.length}</Text>
        </View>
      </View>
    </View>
  );
}
