import { useRef, useState } from "react";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
import { formatRelativeTime } from "@/ui/relative-time";
import { VerseList } from "@/ui/app-components";
import { colors, platformShadow, typography } from "@/ui/theme";

const FEED_BODY_PREVIEW_LINES = 3;

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
  onReact,
  onReply,
  ownsItem,
  prayed,
  prayedBy,
  prayerCount,
  reacted,
  reactedBy,
  reactionCount,
  replyCount,
}: {
  authorImage?: GroupImage;
  authorName: string;
  item: FeedItem;
  onDelete?: () => void;
  onEdit?: () => void;
  onOpen: () => void;
  onPray: () => void;
  onReact?: () => void;
  onReply?: () => void;
  ownsItem: boolean;
  prayed: boolean;
  prayedBy?: { name: string; image?: GroupImage }[];
  prayerCount: number;
  reacted?: boolean;
  reactedBy?: { name: string; image?: GroupImage }[];
  reactionCount?: number;
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
  const isPrayerRequest = itemKind === "prayer_request";
  const reactionCopy = actionPastLabels[itemKind].toLowerCase();
  const hasPrayerActivity = Boolean(prayedBy?.length);
  const hasReactionActivity = !isPrayerRequest && Boolean(reactedBy?.length);

  return (
    <Card style={{ overflow: "visible", padding: 16, position: "relative", zIndex: menuOpen ? 10 : 1 }}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10, zIndex: menuOpen ? 30 : 1 }}>
        <Avatar image={authorImage} name={authorName} size={42} tone="green" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.label, { color: colors.ink, fontSize: 15 }]}>{authorName}</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <Feather name={kindIcon(item)} size={13} color={colors.accentPrayer} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>{kindLabel(item)}</Text>
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
            <Text style={[typography.label, { color: colors.ink, fontSize: 15 }]}>{moodOptionForValue(item.mood).label}</Text>
            <Text style={[typography.caption, { color: colors.muted, fontSize: 13, lineHeight: 18 }]}>{moodOptionForValue(item.mood).description}</Text>
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
          {onEdit ? (
            <Pressable
              onPressIn={(event) => event.stopPropagation()}
              onPress={(event) => {
                event.stopPropagation();
                runMenuAction(onEdit);
              }}
              style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}
            >
              <Feather name="edit-2" size={14} color={colors.ink} />
              <Text style={{ color: colors.ink, fontWeight: "800" }}>Edit</Text>
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable
              onPressIn={(event) => event.stopPropagation()}
              onPress={(event) => {
                event.stopPropagation();
                runMenuAction(onDelete);
              }}
              style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}
            >
              <Feather name="trash-2" size={14} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: "800" }}>Delete</Text>
            </Pressable>
          ) : null}
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
        <Text numberOfLines={2} style={[typography.title, { color: colors.ink }]}>
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
          <MaterialCommunityIcons name="hands-pray" size={22} color={colors.ink} />
          <Text style={[typography.label, { color: colors.muted }]}>
            Pray
          </Text>
        </Pressable>
        {!isPrayerRequest && onReact ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onReact();
            }}
            style={{ alignItems: "center", flexDirection: "row", gap: 7 }}
          >
            <Ionicons name={reacted ? "heart" : "heart-outline"} size={21} color={reacted ? colors.accentPrayer : colors.ink} />
            <Text style={[typography.label, { color: colors.muted }]}>
              {reacted ? actionPastLabels[itemKind] : actionLabels[itemKind]}
            </Text>
          </Pressable>
        ) : null}
        {onReply ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onReply();
            }}
            style={{ alignItems: "center", flexDirection: "row", gap: 7 }}
          >
            <Feather name="message-circle" size={21} color={colors.ink} />
            <Text style={[typography.label, { color: colors.muted }]}>{replyCount}</Text>
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
      {hasPrayerActivity || hasReactionActivity ? (
        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 6 }}>
          {hasPrayerActivity ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <AvatarStack users={prayedBy!} size={24} />
              <Text style={[typography.label, { color: colors.muted }]}>
                {prayerCount} {prayerCount === 1 ? "prayer" : "prayers"}
              </Text>
            </View>
          ) : null}
          {hasReactionActivity ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <AvatarStack users={reactedBy!} size={24} />
              <Text style={[typography.label, { color: colors.muted }]}>
                {reactionCount ?? 0} {reactionCopy}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
