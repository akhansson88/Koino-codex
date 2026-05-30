import { useRef, useState } from "react";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import {
  actionLabels,
  actionPastLabels,
  defaultFeedTitle as productDefaultFeedTitle,
  entryKindIcon,
  feedItemKind,
  feedItemLabel,
  moodOptionForValue,
} from "@/state/product";
import type { FeedItem, GroupImage } from "@/state/types";
import {
  Avatar,
  AvatarStack,
  Card,
  ExpandableBodyText,
} from "@/ui/app-components";
import { LinkPreview } from "@/ui/link-preview";
import { VerseList } from "@/ui/app-components";
import { colors, platformShadow } from "@/ui/theme";

const FEED_BODY_PREVIEW_LINES = 3;

function formatRelativeTime(value: string) {
  const created = Date.parse(value);
  if (Number.isNaN(created)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Today at ${new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function defaultTitle(item: FeedItem) {
  return productDefaultFeedTitle(item, (mood) => moodOptionForValue(mood).label);
}

function kindLabel(item: FeedItem) {
  return feedItemLabel(item);
}

function kindIcon(item: FeedItem) {
  if (item.type === "check_in") return "check-circle" as const;
  return entryKindIcon(item.kind);
}

export function PostCard({
  authorImage,
  authorName,
  item,
  onDelete,
  onEdit,
  onOpen,
  onPray,
  onReply,
  ownsItem,
  prayed,
  prayedBy,
  prayerCount,
  replyCount,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: FeedItem;
  onDelete?: () => void;
  onEdit?: () => void;
  onOpen: () => void;
  onPray: () => void;
  onReply?: () => void;
  ownsItem: boolean;
  prayed: boolean;
  prayedBy?: { name: string; image?: GroupImage }[];
  prayerCount: number;
  replyCount: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressOpenRef = useRef(false);

  function runMenuAction(action: () => void) {
    suppressOpenRef.current = true;
    setMenuOpen(false);
    action();
    setTimeout(() => {
      suppressOpenRef.current = false;
    }, 250);
  }

  const itemKind = feedItemKind(item);
  const prayerCopy = itemKind === "prayer_request" ? "prayed" : actionPastLabels[itemKind].toLowerCase();

  return (
    <Card style={{ overflow: "visible", padding: 16, position: "relative", zIndex: menuOpen ? 10 : 1 }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10, zIndex: menuOpen ? 30 : 1 }}>
        <Avatar image={authorImage} name={authorName} size={42} tone="green" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{authorName}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Feather name={kindIcon(item)} size={13} color={colors.gold} />
          <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "900" }}>{kindLabel(item)}</Text>
        </View>
      </View>

      {item.type === "check_in" ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.accentSubtle,
            borderRadius: 12,
            flexDirection: "row",
            gap: 12,
            marginTop: 10,
            padding: 12,
          }}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.paper,
              borderRadius: 999,
              height: 36,
              justifyContent: "center",
              width: 36,
            }}
          >
            <Ionicons name={moodOptionForValue(item.mood).icon} size={20} color={colors.olive} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "900" }}>{moodOptionForValue(item.mood).label}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>{moodOptionForValue(item.mood).description}</Text>
          </View>
        </View>
      ) : null}

      {ownsItem && menuOpen ? (
        <View
          style={{
            backgroundColor: colors.paper,
            borderColor: colors.line,
            borderRadius: 12,
            borderWidth: 1,
            minWidth: 118,
            paddingVertical: 4,
            position: "absolute",
            bottom: 50,
            right: 14,
            zIndex: 40,
            ...platformShadow({
              boxShadow: "0 10px 24px rgba(11, 18, 32, 0.14)",
              elevation: 12,
              offset: { width: 0, height: 10 },
              opacity: 0.14,
              radius: 24,
            }),
          }}
        >
          <Pressable
            onPressIn={(event) => event.stopPropagation()}
            onPress={(event) => {
              event.stopPropagation();
              runMenuAction(onEdit!);
            }}
            style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}
          >
            <Feather name="edit-2" size={14} color={colors.ink} />
            <Text style={{ color: colors.ink, fontWeight: "800" }}>Edit</Text>
          </Pressable>
          <Pressable
            onPressIn={(event) => event.stopPropagation()}
            onPress={(event) => {
              event.stopPropagation();
              runMenuAction(onDelete!);
            }}
            style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}
          >
            <Feather name="trash-2" size={14} color={colors.danger} />
            <Text style={{ color: colors.danger, fontWeight: "800" }}>Delete</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          if (menuOpen || suppressOpenRef.current) {
            setMenuOpen(false);
            return;
          }
          onOpen();
        }}
        style={{ gap: 8 }}
      >
        <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 18, fontWeight: "900", lineHeight: 24 }}>
          {item.type === "post" ? item.title || defaultTitle(item) : defaultTitle(item)}
        </Text>
        <ExpandableBodyText collapsedLines={FEED_BODY_PREVIEW_LINES}>
          {item.body || "No words today, just presence."}
        </ExpandableBodyText>
      </Pressable>
      <LinkPreview text={item.body} />

      <VerseList verse={item.verse} verses={item.verses} compact />

      <View style={{ alignItems: "center", flexDirection: "row", gap: 22 }}>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onPray();
          }}
          style={{ alignItems: "center", flexDirection: "row", gap: 7 }}
        >
          <Ionicons name={prayed ? "heart" : "heart-outline"} size={22} color={prayed ? colors.gold : colors.ink} />
          <Text style={{ color: colors.muted, fontWeight: "700" }}>
            {prayed ? actionPastLabels[itemKind] : actionLabels[itemKind]}
          </Text>
        </Pressable>
        {onReply ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onReply();
            }}
            style={{ alignItems: "center", flexDirection: "row", gap: 7 }}
          >
            <Feather name="message-circle" size={21} color={colors.ink} />
            <Text style={{ color: colors.muted, fontWeight: "700" }}>{replyCount}</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        {ownsItem && (onEdit || onDelete) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Post options"
            hitSlop={8}
            onPressIn={(event) => event.stopPropagation()}
            onPress={(event) => {
              event.stopPropagation();
              setMenuOpen((current) => !current);
            }}
            style={{ alignItems: "center", height: 28, justifyContent: "center", width: 28 }}
          >
            <Feather name="more-horizontal" size={19} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
      {prayedBy && prayedBy.length > 0 ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8, marginTop: 6 }}>
          <AvatarStack users={prayedBy} size={24} />
          <Text style={{ color: colors.muted, fontWeight: "700" }}>
            {prayerCount} {prayerCopy}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
