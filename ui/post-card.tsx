import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import {
  entryKindIcon,
  feedItemKind,
  moodOptionForValue,
} from "@/state/product";
import type { FeedItem, GroupImage } from "@/state/types";
import {
  Avatar,
  AvatarStack,
  Card,
  ExpandableBodyText,
  VerseList,
} from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import {
  communityActionLabel,
  communityDefaultFeedTitle,
  communityFeedItemLabel,
  communityMoodScaleDescription,
  communityMoodScaleLabel,
  communityPrayerMomentDisplayCopy,
  communityPrayerNoun,
  communityResponseNoun,
} from "@/ui/community-copy";
import { LinkPreviewContent } from "@/ui/link-preview";
import { formatRelativeTime } from "@/ui/relative-time";
import { colors, platformShadow, radius, typography } from "@/ui/theme";

const FEED_BODY_PREVIEW_LINES = 3;

export type CommunityCardTone = "check_in" | "praise" | "prayer" | "reflection" | "scripture" | "update";
type CommunityCardActionIcon = "book-open" | "heart" | "message-circle" | "pray" | "star";

type CommunityFeedCardProps = {
  actions?: ReactNode;
  attachment?: ReactNode;
  authorImage?: GroupImage;
  authorName: string;
  body?: string;
  bodyContent?: ReactNode;
  bodyFallback?: string;
  headerAccessory?: ReactNode;
  item: FeedItem;
  onOpen?: () => void;
  overlay?: ReactNode;
  responseSummary?: ReactNode;
  status?: ReactNode;
  style?: StyleProp<ViewStyle>;
  title?: string;
};

function toneForItem(item: FeedItem): CommunityCardTone {
  if (item.type === "check_in") return "check_in";
  const itemKind = feedItemKind(item);
  if (itemKind === "prayer_request" || itemKind === "prayer_moment") return "prayer";
  return itemKind;
}

function toneColors(tone: CommunityCardTone) {
  if (tone === "prayer") return { accent: colors.accentPrayer, soft: colors.prayerSoft };
  if (tone === "reflection") return { accent: colors.accentReflection, soft: colors.reflectionSoft };
  if (tone === "praise") return { accent: colors.accentWarm, soft: colors.warmSoft };
  if (tone === "check_in") return { accent: colors.accentRhythm, soft: colors.rhythmSoft };
  if (tone === "scripture") return { accent: colors.accentScripture, soft: colors.warmSoft };
  return { accent: colors.textMuted, soft: colors.accentSubtle };
}

function kindIcon(item: FeedItem) {
  if (item.type === "check_in") return "check-circle" as const;
  return entryKindIcon(item.kind);
}

function softSemanticLabelColor(accent: string) {
  const mutedMatch = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(colors.textMuted);
  const accentMatch = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(accent);
  if (!mutedMatch || !accentMatch) return colors.textMuted;

  const semanticAmount = 0.28;
  const channels = mutedMatch.slice(1).map((channel, index) => {
    const mutedValue = Number.parseInt(channel, 16);
    const accentValue = Number.parseInt(accentMatch[index + 1], 16);
    return Math.round(mutedValue + (accentValue - mutedValue) * semanticAmount)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function TypeLabel({ item }: { item: FeedItem }) {
  const { t } = useAppTranslation();
  const label = communityFeedItemLabel(item, t);
  const labelColor = softSemanticLabelColor(toneColors(toneForItem(item)).accent);
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="text"
      accessible
      style={{
        alignItems: "center",
        flexDirection: "row",
        flexShrink: 1,
        gap: 5,
        justifyContent: "flex-end",
        minWidth: 0,
      }}
    >
      <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
        <Feather name={kindIcon(item)} size={13} color={labelColor} />
      </View>
      <Text
        style={[
          typography.navLabel,
          {
            color: labelColor,
            flexShrink: 1,
            textAlign: "right",
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function HeaderMeta({
  accessory,
  item,
  status,
}: {
  accessory?: ReactNode;
  item: FeedItem;
  status?: ReactNode;
}) {
  return (
    <View
      style={{
        alignItems: "flex-end",
        flexShrink: 1,
        gap: 4,
        maxWidth: "52%",
        minWidth: 0,
      }}
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 4,
          justifyContent: "flex-end",
          minWidth: 0,
        }}
      >
        <TypeLabel item={item} />
        {accessory}
      </View>
      {status}
    </View>
  );
}

export function CommunityFeedCard({
  actions,
  attachment,
  authorImage,
  authorName,
  body,
  bodyContent,
  bodyFallback,
  headerAccessory,
  item,
  onOpen,
  overlay,
  responseSummary,
  status,
  style,
  title,
}: CommunityFeedCardProps) {
  const { language } = useAppTranslation();
  const visibleBody = body || bodyFallback;
  const mainContent = bodyContent ?? (visibleBody ? (
    <ExpandableBodyText actionMinHeight={44} collapsedLines={FEED_BODY_PREVIEW_LINES}>
      {visibleBody}
    </ExpandableBodyText>
  ) : null);
  return (
    <Card style={[{ overflow: "visible", padding: 16, position: "relative" }, style]}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10, minWidth: 0 }}>
        <Avatar image={authorImage} name={authorName} size={42} tone="green" />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={[typography.label, { color: colors.ink, fontSize: 15 }]}>
            {authorName}
          </Text>
          <Text style={[typography.caption, { color: colors.muted }]}>{formatRelativeTime(item.createdAt, language)}</Text>
        </View>
        <HeaderMeta accessory={headerAccessory} item={item} status={status} />
      </View>

      {overlay}

      {title || mainContent ? (
        <View style={{ gap: 8 }}>
          {title ? (
            onOpen ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={6}
                onPress={(event) => {
                  event.stopPropagation();
                  onOpen();
                }}
                style={{ justifyContent: "center", minHeight: 44 }}
              >
                <Text style={[typography.title, { color: colors.ink }]}>{title}</Text>
              </Pressable>
            ) : (
              <Text style={[typography.title, { color: colors.ink }]}>{title}</Text>
            )
          ) : null}
          {mainContent ? (!title && onOpen ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              style={{ gap: 8 }}
            >
              {mainContent}
            </Pressable>
          ) : (
            mainContent
          )) : null}
        </View>
      ) : null}

      {attachment ? (!title && !mainContent && onOpen ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={6}
          onPress={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          style={{ gap: 14 }}
        >
          {attachment}
        </Pressable>
      ) : (
        attachment
      )) : null}
      {actions ? <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{actions}</View> : null}
      {responseSummary}
    </Card>
  );
}

function ActionIcon({ active, icon }: { active: boolean; icon: CommunityCardActionIcon }) {
  const iconColor = active ? colors.textMuted : colors.ink;
  if (icon === "pray") return <MaterialCommunityIcons name="hands-pray" size={20} color={iconColor} />;
  if (icon === "heart") return <Ionicons name={active ? "heart" : "heart-outline"} size={20} color={iconColor} />;
  if (icon === "star") return <Ionicons name={active ? "star" : "star-outline"} size={19} color={iconColor} />;
  return <Feather name={icon} size={19} color={iconColor} />;
}

export function CommunityCardAction({
  accessibilityLabel,
  active = false,
  icon,
  label,
  onPress,
  tone,
  variant = "primary",
}: {
  accessibilityLabel?: string;
  active?: boolean;
  icon: CommunityCardActionIcon;
  label: string;
  onPress?: () => void;
  tone: CommunityCardTone;
  variant?: "primary" | "secondary";
}) {
  const palette = toneColors(tone);
  const actionStyle: ViewStyle = {
    alignItems: "center",
    backgroundColor: variant === "primary" && active ? palette.soft : colors.paper,
    borderColor: variant === "primary" ? (active ? palette.accent : colors.line) : colors.paper,
    borderRadius: 999,
    borderWidth: variant === "primary" ? 1 : 0,
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: variant === "primary" ? 13 : 8,
  };
  const content = (
    <>
      <ActionIcon active={active} icon={icon} />
      <Text style={[typography.label, { color: active ? colors.textMuted : colors.ink }]}>{label}</Text>
    </>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? label} style={actionStyle}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={actionStyle}
    >
      {content}
    </Pressable>
  );
}

export function CommunityCardResponseSummary({
  count,
  label,
  showWhenEmpty = false,
  users,
}: {
  count: number;
  label: string;
  showWhenEmpty?: boolean;
  users?: { name: string; image?: GroupImage }[];
}) {
  if (!showWhenEmpty && !users?.length) return null;
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
      {users?.length ? <AvatarStack users={users} size={24} /> : null}
      <Text style={[typography.caption, { color: colors.muted }]}>{count} {label}</Text>
    </View>
  );
}

export function CommunityCheckInMood({ mood }: { mood: number }) {
  const { t } = useAppTranslation();
  const option = moodOptionForValue(mood);
  const label = communityMoodScaleLabel(mood, t);
  const description = communityMoodScaleDescription(mood, t);
  return (
    <View
      accessibilityLabel={t("community.checkIn.stateAccessibility", { description, label })}
      accessibilityRole="text"
      accessible
      style={{
        alignItems: "center",
        backgroundColor: colors.rhythmSoft,
        borderRadius: radius.md,
        flexDirection: "row",
        gap: 10,
        padding: 12,
      }}
    >
      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          alignItems: "center",
          backgroundColor: colors.paper,
          borderRadius: 999,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Feather name={option.icon} size={19} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={[typography.label, { color: colors.ink, flexShrink: 1, fontSize: 13, lineHeight: 18 }]}>{label}</Text>
        <Text style={[typography.caption, { color: colors.muted, flexShrink: 1, fontSize: 12, lineHeight: 17 }]}>{description}</Text>
      </View>
    </View>
  );
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
  const { t } = useAppTranslation();
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
  const displayCopy = item.type === "post" ? communityPrayerMomentDisplayCopy(item, t) : { body: item.body, title: undefined };
  const isPrayerPost = itemKind === "prayer_request" || itemKind === "prayer_moment";
  const reactionTone = toneForItem(item);
  const reactionIcon: CommunityCardActionIcon =
    itemKind === "praise" ? "star" : itemKind === "scripture" ? "book-open" : itemKind === "update" ? "message-circle" : "heart";
  const hasPrayerActivity = Boolean(prayedBy?.length);
  const hasReactionActivity = !isPrayerPost && Boolean(reactedBy?.length);

  const menuButton = ownsItem && (onEdit || onDelete) ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("community.card.postOptions")}
      hitSlop={4}
      onPressIn={(event) => event.stopPropagation()}
      onPress={(event) => {
        event.stopPropagation();
        setMenuOpen((current) => !current);
      }}
      style={{ alignItems: "center", flexShrink: 0, height: 44, justifyContent: "center", width: 44 }}
    >
      <Feather name="more-horizontal" size={19} color={colors.ink} />
    </Pressable>
  ) : null;

  const menu = ownsItem && menuOpen ? (
    <View
      style={{
        backgroundColor: colors.paper,
        borderColor: colors.line,
        borderRadius: radius.md,
        borderWidth: 1,
        minWidth: 118,
        paddingVertical: 4,
        position: "absolute",
        right: 14,
        top: 54,
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
          accessibilityLabel={t("common.edit")}
          accessibilityRole="button"
          onPressIn={(event) => event.stopPropagation()}
          onPress={(event) => {
            event.stopPropagation();
            runMenuAction(onEdit);
          }}
          style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 }}
        >
          <Feather name="edit-2" size={14} color={colors.ink} />
          <Text style={[typography.label, { color: colors.ink }]}>{t("common.edit")}</Text>
        </Pressable>
      ) : null}
      {onDelete ? (
        <Pressable
          accessibilityLabel={t("common.delete")}
          accessibilityRole="button"
          onPressIn={(event) => event.stopPropagation()}
          onPress={(event) => {
            event.stopPropagation();
            runMenuAction(onDelete);
          }}
          style={{ alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 }}
        >
          <Feather name="trash-2" size={14} color={colors.danger} />
          <Text style={[typography.label, { color: colors.danger }]}>{t("common.delete")}</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  return (
    <CommunityFeedCard
      actions={
        <>
          {!isPrayerPost && onReact ? (
            <CommunityCardAction
              active={Boolean(reacted)}
              icon={reactionIcon}
              label={communityActionLabel(itemKind, Boolean(reacted), t)}
              onPress={onReact}
              tone={reactionTone}
            />
          ) : (
            <CommunityCardAction
              active={prayed}
              icon="pray"
              label={t(prayed ? "community.action.prayer.completed" : "community.action.prayer.default")}
              onPress={onPray}
              tone="prayer"
            />
          )}
          {!isPrayerPost && onReact ? (
            <CommunityCardAction
              active={prayed}
              icon="pray"
              label={t(prayed ? "community.action.prayer.completed" : "community.action.prayer.default")}
              onPress={onPray}
              tone="prayer"
              variant="secondary"
            />
          ) : null}
          {onReply ? (
            <CommunityCardAction
              accessibilityLabel={t(replyCount === 1 ? "community.reply.count.one" : "community.reply.count.other", { count: replyCount })}
              icon="message-circle"
              label={`${replyCount}`}
              onPress={onReply}
              tone="reflection"
              variant="secondary"
            />
          ) : null}
        </>
      }
      attachment={
        <>
          {item.type === "check_in" ? <CommunityCheckInMood mood={item.mood} /> : null}
          <VerseList verse={item.verse} verses={item.verses} compact />
        </>
      }
      authorImage={authorImage}
      authorName={authorName}
      bodyContent={
        <LinkPreviewContent text={displayCopy.body}>
          {({ hiddenUrl, preview }) => (
            <>
              <ExpandableBodyText actionMinHeight={44} collapsedLines={FEED_BODY_PREVIEW_LINES} hiddenUrl={hiddenUrl}>
                {displayCopy.body || t("community.card.noWords")}
              </ExpandableBodyText>
              {preview}
            </>
          )}
        </LinkPreviewContent>
      }
      headerAccessory={menuButton}
      item={item}
      onOpen={() => {
        if (menuOpen || suppressOpenRef.current) {
          setMenuOpen(false);
          return;
        }
        onOpen();
      }}
      overlay={menu}
      responseSummary={
        hasPrayerActivity || hasReactionActivity ? (
          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {hasReactionActivity ? (
              <CommunityCardResponseSummary
                count={reactionCount ?? 0}
                label={communityResponseNoun(item, reactionCount ?? 0, t)}
                users={reactedBy}
              />
            ) : null}
            {hasPrayerActivity ? (
              <CommunityCardResponseSummary count={prayerCount} label={communityPrayerNoun(prayerCount, t)} users={prayedBy} />
            ) : null}
          </View>
        ) : undefined
      }
      style={{ zIndex: menuOpen ? 10 : 1 }}
      title={itemKind === "scripture" || itemKind === "update" ? displayCopy.title || communityDefaultFeedTitle(item, t) : undefined}
    />
  );
}
